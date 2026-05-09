import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

const STUB_PROPOSAL_ID = 'stub-00000000-0000-0000-0000-000000000000'

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
  // SSE format: each event is "event: message\ndata: {...}\n\n"
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
  result: {
    content: Array<{ type: string; text: string }>
    isError?: boolean
  }
}

async function callTool(port: number, name: string, args: Record<string, unknown>): Promise<ToolResponse> {
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

const VAULT_FILES = {
  'notes/hello.md': '# Hello\n\nWorld content here',
  'notes/another.md': '# Another\n\nSome other stuff',
  'specs/dark-mode/workflow-state.md':
    '---\nid: abc123\nslug: dark-mode\nstatus: active\ncurrentStep: 3\n---\nBody content',
  'specs/dark-mode/idea.md': '# Idea\n\nSome idea content',
}

describe('ObsidianMcpServerAdapter — vault + frontmatter tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let vault: MockBridge
  let port: number

  beforeEach(async () => {
    vault = new MockBridge(VAULT_FILES)
    adapter = new ObsidianMcpServerAdapter(vault)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('tools/list', () => {
    it('registers all 10 tools', async () => {
      const resp = (await mcpPost(port, {
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/list',
        params: {},
      })) as { result: { tools: Array<{ name: string }> } }
      const names = resp.result.tools.map((t) => t.name).sort()
      expect(names).toEqual([
        'frontmatter_get',
        'frontmatter_get_field',
        'frontmatter_set_field',
        'frontmatter_set_many',
        'vault_append_to_note',
        'vault_create_folder',
        'vault_list_folder',
        'vault_read_note',
        'vault_search',
        'vault_write_note',
      ])
    })
  })

  describe('vault_read_note', () => {
    it('returns file content for existing path', async () => {
      const resp = await callTool(port, 'vault_read_note', { path: 'notes/hello.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ content: '# Hello\n\nWorld content here' })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'vault_read_note', { path: 'missing.md' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('vault_write_note', () => {
    it('returns pending proposal stub without mutating vault', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ proposalId: STUB_PROPOSAL_ID, status: 'pending' })
    })
  })

  describe('vault_append_to_note', () => {
    it('returns pending proposal stub without mutating vault', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ proposalId: STUB_PROPOSAL_ID, status: 'pending' })
    })
  })

  describe('vault_search', () => {
    it('returns files containing the query string (case-insensitive)', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'world', folder: 'notes' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { matches: Array<{ path: string; excerpt: string }> }
      const paths = result.matches.map((m) => m.path)
      expect(paths).toContain('notes/hello.md')
      expect(paths).not.toContain('notes/another.md')
    })

    it('returns empty matches when nothing found', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'zzz-no-match', folder: 'notes' })
      expect(parseToolResult(resp)).toEqual({ matches: [] })
    })

    it('searches recursively across subfolders', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'idea', folder: 'specs' })
      const result = parseToolResult(resp) as { matches: Array<{ path: string }> }
      expect(result.matches.map((m) => m.path)).toContain('specs/dark-mode/idea.md')
    })
  })

  describe('vault_list_folder', () => {
    it('returns files in the given folder', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'notes' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.files).toContain('notes/hello.md')
      expect(result.files).toContain('notes/another.md')
    })

    it('returns subfolders as full paths', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'specs' })
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.folders).toContain('specs/dark-mode')
    })
  })

  describe('vault_create_folder', () => {
    it('returns created: true', async () => {
      const resp = await callTool(port, 'vault_create_folder', { path: 'new-folder' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ created: true })
    })
  })

  describe('frontmatter_get', () => {
    it('returns all frontmatter fields', async () => {
      const resp = await callTool(port, 'frontmatter_get', {
        path: 'specs/dark-mode/workflow-state.md',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { frontmatter: Record<string, unknown> }
      expect(result.frontmatter).toMatchObject({ id: 'abc123', slug: 'dark-mode', status: 'active' })
    })

    it('returns empty frontmatter for note without frontmatter', async () => {
      const resp = await callTool(port, 'frontmatter_get', { path: 'notes/hello.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ frontmatter: {} })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'frontmatter_get', { path: 'missing.md' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('frontmatter_get_field', () => {
    it('returns value for existing field', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'slug',
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ field: 'slug', value: 'dark-mode' })
    })

    it('returns null for field not present in frontmatter', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'nonexistent',
      })
      expect(parseToolResult(resp)).toEqual({ field: 'nonexistent', value: null })
    })

    it('returns isError when file not found', async () => {
      const resp = await callTool(port, 'frontmatter_get_field', {
        path: 'missing.md',
        field: 'slug',
      })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('frontmatter_set_field', () => {
    it('returns pending proposal stub without mutating vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ proposalId: STUB_PROPOSAL_ID, status: 'pending' })
    })
  })

  describe('frontmatter_set_many', () => {
    it('returns pending proposal stub without mutating vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'draft', slug: 'dm' },
      })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ proposalId: STUB_PROPOSAL_ID, status: 'pending' })
    })
  })
})
