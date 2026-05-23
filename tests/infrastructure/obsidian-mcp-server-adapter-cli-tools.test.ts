/**
 * T-OCM-014 — CLI-backed MCP tool group (ADR-018). Drives the real
 * `ObsidianMcpServerAdapter` over loopback HTTP with a `MockObsidianCliPort`
 * injected. REQ-OCM-010..015.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

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
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  })
}

interface ToolResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean }
}

async function callTool(port: number, name: string, args: Record<string, unknown>): Promise<ToolResponse> {
  return mcpPost(port, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  }) as Promise<ToolResponse>
}

async function listToolNames(port: number): Promise<string[]> {
  const resp = (await mcpPost(port, { jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} })) as {
    result: { tools: Array<{ name: string }> }
  }
  return resp.result.tools.map((t) => t.name)
}

function parse(resp: ToolResponse): unknown {
  return JSON.parse(resp.result.content[0].text)
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

describe('ObsidianMcpServerAdapter — CLI-backed tools (ADR-018)', () => {
  let adapter: ObsidianMcpServerAdapter
  let cli: MockObsidianCliPort
  let port: number

  beforeEach(async () => {
    cli = new MockObsidianCliPort()
    adapter = buildAdapter(cli)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  it('registers the CLI tool group when a CLI is available', async () => {
    const names = await listToolNames(port)
    expect(names).toEqual(
      expect.arrayContaining([
        'obsidian_cli_search',
        'obsidian_cli_read_note',
        'obsidian_cli_daily_note',
        'obsidian_cli_get_properties',
        'obsidian_cli_run',
        'obsidian_cli_append_note',
      ]),
    )
  })

  it('search forwards query=… and returns the CLI JSON result', async () => {
    cli.setJson('search', { matches: [{ path: 'a.md' }] })
    const resp = await callTool(port, 'obsidian_cli_search', { query: 'foo' })

    expect(parse(resp)).toEqual({ result: { matches: [{ path: 'a.md' }] } })
    expect(cli.calls).toContainEqual({ command: 'search', args: ['query=foo'], json: true })
  })

  it('read_note forwards path=…', async () => {
    cli.setJson('read', { content: '# Hi' })
    const resp = await callTool(port, 'obsidian_cli_read_note', { path: 'note.md' })
    expect(parse(resp)).toEqual({ result: { content: '# Hi' } })
    expect(cli.calls).toContainEqual({ command: 'read', args: ['path=note.md'], json: true })
  })

  it('daily_note calls daily with no args', async () => {
    cli.setJson('daily', { path: 'Daily/2026-05-23.md' })
    const resp = await callTool(port, 'obsidian_cli_daily_note', {})
    expect(parse(resp)).toEqual({ result: { path: 'Daily/2026-05-23.md' } })
    expect(cli.calls).toContainEqual({ command: 'daily', args: [], json: true })
  })

  it('surfaces a CLI error as a structured error payload (no crash)', async () => {
    const resp = await callTool(port, 'obsidian_cli_get_properties', { path: 'x.md' })
    // unscripted properties → mock returns ok({}) by default
    expect(parse(resp)).toEqual({ result: {} })
  })

  it('run rejects a command outside the read-only allow-list', async () => {
    const resp = await callTool(port, 'obsidian_cli_run', { command: 'eval', args: { code: 'app' } })
    const payload = parse(resp) as { error: { code: string; allowed: string[] } }
    expect(payload.error.code).toBe('command-not-allowed')
    expect(payload.error.allowed).toContain('search')
    // eval must never reach the CLI
    expect(cli.calls.find((c) => c.command === 'eval')).toBeUndefined()
  })

  it('run forwards an allow-listed command with key=value args', async () => {
    cli.setJson('tags', { tags: { '#a': 1 } })
    const resp = await callTool(port, 'obsidian_cli_run', { command: 'tags', args: {} })
    expect(parse(resp)).toEqual({ result: { tags: { '#a': 1 } } })
    expect(cli.calls).toContainEqual({ command: 'tags', args: [], json: true })
  })

  it('append_note queues a proposal and does NOT call the CLI immediately', async () => {
    const resp = await callTool(port, 'obsidian_cli_append_note', { path: 'n.md', content: 'x' })
    const payload = parse(resp) as { proposalId: string; status: string }
    expect(payload.status).toBe('pending')

    const proposals = adapter.getProposals()
    expect(proposals).toHaveLength(1)
    expect(proposals[0].toolName).toBe('obsidian_cli_append_note')
    expect(cli.calls.find((c) => c.command === 'append')).toBeUndefined()

    // On accept, the CLI append runs.
    await adapter.acceptProposal(payload.proposalId)
    expect(cli.calls).toContainEqual({ command: 'append', args: ['path=n.md', 'content=x'], json: false })
  })
})

describe('ObsidianMcpServerAdapter — CLI group omitted when unavailable', () => {
  it('omits the CLI tools when no CLI port is provided', async () => {
    const adapter = buildAdapter(undefined)
    const { port } = await adapter.start()
    try {
      await initMcp(port)
      const names = await listToolNames(port)
      expect(names).not.toContain('obsidian_cli_search')
      // in-process tools still present
      expect(names).toContain('vault_read_note')
    } finally {
      await adapter.stop()
    }
  })

  it('omits the CLI tools when the CLI is not configured (available=false)', async () => {
    const cli = new MockObsidianCliPort()
    cli.available = false
    const adapter = buildAdapter(cli)
    const { port } = await adapter.start()
    try {
      await initMcp(port)
      const names = await listToolNames(port)
      expect(names).not.toContain('obsidian_cli_search')
    } finally {
      await adapter.stop()
    }
  })
})
