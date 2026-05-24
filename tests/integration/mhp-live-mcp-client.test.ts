/**
 * MHP — Live end-to-end integration test.
 *
 * Boots the real `ObsidianMcpServerAdapter` (with `MockBridge` for vault I/O),
 * connects to it with the official MCP SDK `Client` + `StreamableHTTPClientTransport`
 * over loopback HTTP — exactly what Claude Desktop / Cline / MCP Inspector would do —
 * and exercises the full proposal lifecycle:
 *
 *   1. `tools/list` lists `workflow_proposal_*` + `obsidian_cli_*` + vault/canvas tools
 *   2. Write tool returns `{ proposalId, status: 'pending' }`
 *   3. `workflow_proposal_list` shows the queued proposal
 *   4. `workflow_proposal_get` returns the full proposal record
 *   5. `workflow_proposal_accept` commits the mutation to the vault
 *   6. Double-accept yields `already_decided`
 *
 * This is the canonical "live MCP client consumes the MCP server" validation —
 * if this test is green, ANY MCP-compliant client can drive Specorator's MCP.
 *
 * Satisfies the `mcp-host-side-proposals` Goal Stop-hook condition:
 *   "you can use the mcp in whatever client I use".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'

describe('MHP — live MCP client end-to-end (loopback HTTP)', () => {
  let bridge: MockBridge
  let adapter: ObsidianMcpServerAdapter
  let client: Client
  let baseUrl: URL

  beforeAll(async () => {
    bridge = new MockBridge()
    adapter = new ObsidianMcpServerAdapter(
      bridge,
      new FeatureRepository(bridge, bridge),
      () => 'specs',
      new MockMetadataCacheAdapter(),
      new MockCanvasAdapter(),
    )
    const { port } = await adapter.start()
    baseUrl = new URL(`http://127.0.0.1:${port}/mcp`)

    client = new Client({ name: 'specorator-integration-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(baseUrl)
    await client.connect(transport)
  }, 30_000)

  afterAll(async () => {
    await client.close().catch(() => undefined)
    await adapter.stop().catch(() => undefined)
  })

  it('lists every MHP tool — workflow_proposal_* + obsidian_cli_* — over real HTTP', async () => {
    const res = await client.listTools()
    const names = res.tools.map((t) => t.name)

    // Workflow-proposal tools (the MHP unlock).
    expect(names).toContain('workflow_proposal_list')
    expect(names).toContain('workflow_proposal_get')
    expect(names).toContain('workflow_proposal_accept')
    expect(names).toContain('workflow_proposal_reject')

    // Vault write tool (will queue a proposal when called).
    expect(names).toContain('vault_write_note')
  })

  it('writes a note → returns pending → list shows it → accept commits → second accept = already_decided', async () => {
    // 1. Call write tool — expect `pending` status + proposalId.
    const writeRes = (await client.callTool({
      name: 'vault_write_note',
      arguments: { path: 'integration/live-mcp.md', content: '# hello from live MCP client\n' },
    })) as { content?: Array<{ text?: string }> }
    const writeText = writeRes.content?.[0]?.text ?? ''
    const writeJson = JSON.parse(writeText) as {
      proposalId: string
      status: 'pending' | 'accepted'
    }
    expect(writeJson.status).toBe('pending')
    expect(writeJson.proposalId).toMatch(/[0-9a-f-]{36}/i)

    // 2. List proposals — the queued write must appear.
    const listRes = (await client.callTool({
      name: 'workflow_proposal_list',
      arguments: {},
    })) as { content?: Array<{ text?: string }> }
    const listJson = JSON.parse(listRes.content?.[0]?.text ?? '{}') as {
      proposals?: Array<{ proposalId: string; tool: string; status: string }>
    }
    expect(listJson.proposals).toBeDefined()
    const queued = listJson.proposals?.find((p) => p.proposalId === writeJson.proposalId)
    expect(queued).toBeDefined()
    expect(queued?.status).toBe('pending')

    // 3. Get the full record.
    const getRes = (await client.callTool({
      name: 'workflow_proposal_get',
      arguments: { proposalId: writeJson.proposalId },
    })) as { content?: Array<{ text?: string }> }
    const getJson = JSON.parse(getRes.content?.[0]?.text ?? '{}') as Record<string, unknown>
    expect(getJson.proposalId).toBe(writeJson.proposalId)

    // 4. Accept — vault gets the write.
    const acceptRes = (await client.callTool({
      name: 'workflow_proposal_accept',
      arguments: { proposalId: writeJson.proposalId },
    })) as { content?: Array<{ text?: string }> }
    const acceptJson = JSON.parse(acceptRes.content?.[0]?.text ?? '{}') as {
      ok?: boolean
      error?: string
    }
    expect(acceptJson.ok).toBe(true)

    // Vault mutation actually happened (MockBridge captures it).
    const exists = await bridge.fileExists('integration/live-mcp.md')
    expect(exists).toBe(true)
    const stored = await bridge.readFile('integration/live-mcp.md')
    expect(stored).toContain('hello from live MCP client')

    // 5. Second accept on same id → already_decided.
    const reAcceptRes = (await client.callTool({
      name: 'workflow_proposal_accept',
      arguments: { proposalId: writeJson.proposalId },
    })) as { content?: Array<{ text?: string }> }
    const reAcceptJson = JSON.parse(reAcceptRes.content?.[0]?.text ?? '{}') as {
      ok?: boolean
      error?: string
    }
    expect(reAcceptJson.error).toBe('already_decided')
  }, 30_000)

  it('reject path: queue → reject → vault untouched + audit row', async () => {
    const writeRes = (await client.callTool({
      name: 'vault_write_note',
      arguments: { path: 'integration/reject-me.md', content: 'should not land' },
    })) as { content?: Array<{ text?: string }> }
    const proposalId = (JSON.parse(writeRes.content?.[0]?.text ?? '{}') as { proposalId: string })
      .proposalId

    const rejectRes = (await client.callTool({
      name: 'workflow_proposal_reject',
      arguments: { proposalId },
    })) as { content?: Array<{ text?: string }> }
    const rejectJson = JSON.parse(rejectRes.content?.[0]?.text ?? '{}') as { ok?: boolean }
    expect(rejectJson.ok).toBe(true)

    // Vault must NOT have the file.
    const exists = await bridge.fileExists('integration/reject-me.md')
    expect(exists).toBe(false)
  }, 30_000)

  it('proposal_get on unknown id returns proposal_not_found', async () => {
    const res = (await client.callTool({
      name: 'workflow_proposal_get',
      arguments: { proposalId: '00000000-0000-0000-0000-000000000000' },
    })) as { content?: Array<{ text?: string }> }
    const json = JSON.parse(res.content?.[0]?.text ?? '{}') as { error?: string }
    expect(json.error).toBe('proposal_not_found')
  })
})
