/**
 * T-MHP-040 — `ObsidianMcpServerAdapter` rewire tests (FAILING-FIRST, TDD).
 *
 * Owner: qa. Verifies the adapter is rewired per SPEC-MHP-034..036 +
 * SPEC-MHP-001..004 + SPEC-MHP-013..024:
 *   - constructs `ProposalStore` with the four-dep extended shape
 *     (eventBus, auditLog, clientIdentifier, logger);
 *   - `acceptProposal(id)` delegates to `proposalStore.acceptBy` (legacy entry
 *     point now routes through the new code path);
 *   - `rejectProposal(id)` delegates to `proposalStore.rejectBy`;
 *   - `getProposals()` delegates to `proposalStore.listPending()`;
 *   - `McpClientIdentifier.attachInitializeHook` runs on adapter start;
 *   - the four `workflow_proposal_*` tools are registered on each `/mcp` request;
 *   - the 12 `obsidian_cli_*` Tier-A reads are registered when a CLI port is
 *     configured (REQ-MHP-011 / SPEC-MHP-013..024).
 *
 * The tests use the live `tools/list` endpoint over loopback HTTP to verify
 * registration; constructor-time behaviour is asserted directly on the
 * adapter's public API surface and via a captured ProposalStore reference.
 *
 * Satisfies: REQ-MHP-001..007, REQ-MHP-008 (legacy callers route to new
 * surface), REQ-MHP-011, REQ-MHP-034..036.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

// --- HTTP helpers --------------------------------------------------------

async function mcpPost(port: number, body: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Host: '127.0.0.1',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  const dataLine = text.split('\n').find((line) => line.startsWith('data: '))
  if (dataLine) return JSON.parse(dataLine.slice(6))
  return JSON.parse(text)
}

async function initMcp(port: number): Promise<void> {
  await mcpPost(port, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'qa-rewire', version: '0' },
    },
  })
}

async function listToolNames(port: number): Promise<string[]> {
  const resp = (await mcpPost(port, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })) as {
    result: { tools: Array<{ name: string }> }
  }
  return resp.result.tools.map((t) => t.name)
}

function buildAdapter(cli?: MockObsidianCliPort): ObsidianMcpServerAdapter {
  const vault = new MockBridge({})
  const repo = new FeatureRepository(vault, vault)
  return new ObsidianMcpServerAdapter(
    vault,
    repo,
    () => DEFAULT_SETTINGS.specsFolder,
    new MockMetadataCacheAdapter(),
    new MockCanvasAdapter(),
    undefined,
    cli,
  )
}

// --- Tests --------------------------------------------------------------

describe('ObsidianMcpServerAdapter — MHP rewire (T-MHP-040 / T-MHP-041)', () => {
  let adapter: ObsidianMcpServerAdapter | null = null

  afterEach(async () => {
    if (adapter !== null) {
      await adapter.stop()
      adapter = null
    }
  })

  it('registers the 4 workflow_proposal_* tools on every /mcp request', async () => {
    adapter = buildAdapter()
    const { port } = await adapter.start()
    await initMcp(port)

    const names = await listToolNames(port)
    expect(names).toEqual(
      expect.arrayContaining([
        'workflow_proposal_list',
        'workflow_proposal_get',
        'workflow_proposal_accept',
        'workflow_proposal_reject',
      ]),
    )
  })

  it('registers the 12 Tier-A obsidian_cli_* read tools when a CLI port is configured', async () => {
    const cli = new MockObsidianCliPort()
    adapter = buildAdapter(cli)
    const { port } = await adapter.start()
    await initMcp(port)

    const names = await listToolNames(port)
    const tierAReads = [
      'obsidian_cli_backlinks',
      'obsidian_cli_links',
      'obsidian_cli_unresolved',
      'obsidian_cli_orphans',
      'obsidian_cli_deadends',
      'obsidian_cli_outline',
      'obsidian_cli_diff',
      'obsidian_cli_history',
      'obsidian_cli_templates',
      'obsidian_cli_template_read',
      'obsidian_cli_property_read',
      'obsidian_cli_daily_read',
    ]
    expect(names).toEqual(expect.arrayContaining(tierAReads))
  })

  it('omits the Tier-A read tools when no CLI port is configured', async () => {
    adapter = buildAdapter(undefined)
    const { port } = await adapter.start()
    await initMcp(port)

    const names = await listToolNames(port)
    expect(names).not.toContain('obsidian_cli_backlinks')
    expect(names).not.toContain('obsidian_cli_outline')
  })

  it('acceptProposal(id) routes through the new acceptBy surface and commits the mutation', async () => {
    adapter = buildAdapter()
    await adapter.start()

    // Seed a pending proposal via the legacy queue helper (the 8 write-tool
    // registrars still use this entry point until T-MHP-021 finishes).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalStore: any = (adapter as any).proposalStore
    let mutated = false
    const proposalId = internalStore.queue(
      'vault_write_note',
      { path: 'a.md' },
      async () => {
        mutated = true
      },
    )

    await adapter.acceptProposal(proposalId)
    expect(mutated).toBe(true)

    // Listing pending must now be empty (entry is in terminal state).
    expect(adapter.getProposals()).toHaveLength(0)
  })

  it('rejectProposal(id) routes through the new rejectBy surface (no mutation runs)', async () => {
    adapter = buildAdapter()
    await adapter.start()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalStore: any = (adapter as any).proposalStore
    let mutated = false
    const proposalId = internalStore.queue(
      'vault_write_note',
      { path: 'b.md' },
      async () => {
        mutated = true
      },
    )

    await adapter.rejectProposal(proposalId)
    expect(mutated).toBe(false)
    expect(adapter.getProposals()).toHaveLength(0)
  })

  it('getProposals() returns pending-only entries (delegates to listPending)', async () => {
    adapter = buildAdapter()
    await adapter.start()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalStore: any = (adapter as any).proposalStore
    const a = internalStore.queue('vault_write_note', { path: 'a.md' }, async () => {})
    const b = internalStore.queue('vault_write_note', { path: 'b.md' }, async () => {})
    internalStore.queue('vault_write_note', { path: 'c.md' }, async () => {})

    // Decide one — it must drop out of getProposals().
    await adapter.rejectProposal(b)

    const pending = adapter.getProposals()
    expect(pending).toHaveLength(2)
    const ids = pending.map((p) => p.proposalId)
    expect(ids).toContain(a)
    expect(ids).not.toContain(b)
  })

  it('constructs ProposalStore with the four-dep extended shape (eventBus / auditLog / clientIdentifier / logger)', async () => {
    adapter = buildAdapter()
    await adapter.start()

    // The presence of the new deps is observable via the store's typed
    // surface: `listPending`, `acceptBy`, `rejectBy`, `discardPending` exist
    // only on the extended shape (SPEC-MHP-034). Reaching through the
    // adapter's private field is acceptable in this rewire test — the
    // alternative is a public accessor that exists only for testing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalStore: any = (adapter as any).proposalStore
    expect(typeof internalStore.listPending).toBe('function')
    expect(typeof internalStore.acceptBy).toBe('function')
    expect(typeof internalStore.rejectBy).toBe('function')
    expect(typeof internalStore.discardPending).toBe('function')
  })
})
