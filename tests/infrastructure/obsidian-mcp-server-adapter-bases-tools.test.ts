import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import { parse as parseYaml } from 'yaml'
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
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0.0.0' },
    },
  })
}

interface ToolResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean }
}

async function callTool(
  port: number,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResponse> {
  return mcpPost(port, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name, arguments: args },
  }) as Promise<ToolResponse>
}

function parseToolResult(resp: ToolResponse): unknown {
  return JSON.parse(resp.result.content[0].text)
}

function fm(record: Record<string, unknown>): string {
  const lines = Object.entries(record)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n')
  return `---\n${lines}\n---\nbody\n`
}

const VAULT_FILES = {
  'projects/alpha.md': fm({ status: 'active', priority: 1, tags: ['a', 'b'] }),
  'projects/beta.md': fm({ status: 'done', priority: 2, tags: ['b', 'c'] }),
  'projects/nested/gamma.md': fm({ status: 'active', priority: 3, tags: ['c'] }),
  'projects/no-fm.md': '# Plain note\n\nno frontmatter here',
  'projects/board.canvas': '{}', // ignored — non-md
  'other/delta.md': fm({ status: 'active', priority: 9 }),
}

describe('ObsidianMcpServerAdapter — bases tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let vault: MockBridge
  let port: number

  beforeEach(async () => {
    vault = new MockBridge(VAULT_FILES)
    const repo = new FeatureRepository(vault, vault)
    const metadataCache = new MockMetadataCacheAdapter()
    const canvas = new MockCanvasAdapter()
    adapter = new ObsidianMcpServerAdapter(
      vault,
      repo,
      () => DEFAULT_SETTINGS.specsFolder,
      metadataCache,
      canvas,
    )
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('bases_query', () => {
    it('returns all .md records under folder (recursive), excluding non-md', async () => {
      const resp = await callTool(port, 'bases_query', { folder: 'projects' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      const paths = result.records.map((r) => r.path).sort()
      expect(paths).toEqual([
        'projects/alpha.md',
        'projects/beta.md',
        'projects/nested/gamma.md',
        'projects/no-fm.md',
      ])
    })

    it('filters by eq', async () => {
      const resp = await callTool(port, 'bases_query', {
        folder: 'projects',
        filter: { field: 'status', op: 'eq', value: 'active' },
      })
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      expect(result.records.map((r) => r.path).sort()).toEqual([
        'projects/alpha.md',
        'projects/nested/gamma.md',
      ])
    })

    it('filters by neq', async () => {
      const resp = await callTool(port, 'bases_query', {
        folder: 'projects',
        filter: { field: 'status', op: 'neq', value: 'active' },
      })
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      const paths = result.records.map((r) => r.path).sort()
      expect(paths).toContain('projects/beta.md')
      expect(paths).toContain('projects/no-fm.md')
      expect(paths).not.toContain('projects/alpha.md')
    })

    it('filters by contains on array field', async () => {
      const resp = await callTool(port, 'bases_query', {
        folder: 'projects',
        filter: { field: 'tags', op: 'contains', value: 'b' },
      })
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      expect(result.records.map((r) => r.path).sort()).toEqual([
        'projects/alpha.md',
        'projects/beta.md',
      ])
    })

    it('filters by in', async () => {
      const resp = await callTool(port, 'bases_query', {
        folder: 'projects',
        filter: { field: 'priority', op: 'in', value: [1, 3] },
      })
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      expect(result.records.map((r) => r.path).sort()).toEqual([
        'projects/alpha.md',
        'projects/nested/gamma.md',
      ])
    })
  })

  describe('bases_list_fields', () => {
    it('returns sorted union of frontmatter keys', async () => {
      const resp = await callTool(port, 'bases_list_fields', { folder: 'projects' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { fields: string[] }
      expect(result.fields).toEqual(['priority', 'status', 'tags'])
    })

    it('returns empty array for folder with no records', async () => {
      const resp = await callTool(port, 'bases_list_fields', { folder: 'empty' })
      expect(parseToolResult(resp)).toEqual({ fields: [] })
    })
  })

  describe('bases_get_record', () => {
    it('returns the frontmatter for a path', async () => {
      const resp = await callTool(port, 'bases_get_record', { path: 'projects/alpha.md' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { frontmatter: Record<string, unknown> }
      expect(result.frontmatter).toMatchObject({ status: 'active', priority: 1 })
    })

    it('returns empty frontmatter for note without frontmatter', async () => {
      const resp = await callTool(port, 'bases_get_record', { path: 'projects/no-fm.md' })
      expect(parseToolResult(resp)).toEqual({ frontmatter: {} })
    })

    it('returns isError when file is missing', async () => {
      const resp = await callTool(port, 'bases_get_record', { path: 'missing.md' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('bases_find_by_field', () => {
    it('shorthand for eq filter', async () => {
      const resp = await callTool(port, 'bases_find_by_field', {
        folder: 'projects',
        field: 'priority',
        value: 2,
      })
      const result = parseToolResult(resp) as { records: Array<{ path: string }> }
      expect(result.records.map((r) => r.path)).toEqual(['projects/beta.md'])
    })

    it('returns empty when nothing matches', async () => {
      const resp = await callTool(port, 'bases_find_by_field', {
        folder: 'projects',
        field: 'status',
        value: 'archived',
      })
      expect(parseToolResult(resp)).toEqual({ records: [] })
    })
  })

  describe('bases_update_record', () => {
    it('returns pending proposal without mutating the vault', async () => {
      const resp = await callTool(port, 'bases_update_record', {
        path: 'projects/alpha.md',
        fields: { status: 'archived' },
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      const unchanged = await vault.readFile('projects/alpha.md')
      expect(unchanged).toContain('status: active')
    })

    it('accept merges fields preserving body and other fm', async () => {
      const resp = await callTool(port, 'bases_update_record', {
        path: 'projects/alpha.md',
        fields: { status: 'archived', owner: 'lum' },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('projects/alpha.md')
      const fmMatch = /^---\n([\s\S]*?)\n---/.exec(updated)
      expect(fmMatch).not.toBeNull()
      const parsed = parseYaml(fmMatch![1]) as Record<string, unknown>
      expect(parsed.status).toBe('archived')
      expect(parsed.owner).toBe('lum')
      expect(parsed.priority).toBe(1)
      expect(updated).toContain('body')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'bases_update_record', {
        path: 'projects/alpha.md',
        fields: { status: 'archived' },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      const unchanged = await vault.readFile('projects/alpha.md')
      expect(unchanged).toContain('status: active')
    })
  })
})
