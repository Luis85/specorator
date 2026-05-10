import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
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
  result: {
    content: Array<{ type: string; text: string }>
    isError?: boolean
  }
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

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!match) return {}
  try {
    const result = parseYaml(match[1]) as unknown
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

const VAULT_FILES = {
  'notes/hello.md': '# Hello\n\nWorld content here',
  'notes/another.md': '# Another\n\nSome other stuff',
  'notes/non-yaml-fence.md': '---\nnot: [valid: yaml\n---\nBody stays',
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
    const repo = new FeatureRepository(vault, vault, DEFAULT_SETTINGS)
    adapter = new ObsidianMcpServerAdapter(vault, repo, DEFAULT_SETTINGS.specsFolder)
    ;({ port } = await adapter.start())
    await initMcp(port)
  })

  afterEach(async () => {
    await adapter.stop()
  })

  describe('tools/list', () => {
    it('registers all 16 tools', async () => {
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
        'workflow_create_artifact',
        'workflow_get_quality_gates',
        'workflow_get_stage_artifacts',
        'workflow_get_state',
        'workflow_list_features',
        'workflow_propose_advance',
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
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(result.proposalId.length).toBeGreaterThan(0)
      expect(await vault.fileExists('notes/new.md')).toBe(false)
    })

    it('accept writes the note content to the vault', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/new.md')).toBe('# New note')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New note',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      expect(await vault.fileExists('notes/new.md')).toBe(false)
    })
  })

  describe('vault_append_to_note', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(await vault.readFile('notes/hello.md')).toBe('# Hello\n\nWorld content here')
    })

    it('accept appends the content to the existing file', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/hello.md')).toBe(
        '# Hello\n\nWorld content here\n\nAppended text',
      )
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'vault_append_to_note', {
        path: 'notes/hello.md',
        content: '\n\nAppended text',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      expect(await vault.readFile('notes/hello.md')).toBe('# Hello\n\nWorld content here')
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
      const resp = await callTool(port, 'vault_search', {
        query: 'zzz-no-match',
        folder: 'notes',
      })
      expect(parseToolResult(resp)).toEqual({ matches: [] })
    })

    it('searches recursively across subfolders', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'idea', folder: 'specs' })
      const result = parseToolResult(resp) as { matches: Array<{ path: string }> }
      expect(result.matches.map((m) => m.path)).toContain('specs/dark-mode/idea.md')
    })

    it('produces no double-slash paths when folder has trailing slash', async () => {
      const resp = await callTool(port, 'vault_search', { query: 'idea', folder: 'specs/' })
      const result = parseToolResult(resp) as { matches: Array<{ path: string }> }
      expect(result.matches.every((m) => !m.path.includes('//'))).toBe(true)
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

    it('produces no double-slash paths when folder has trailing slash', async () => {
      const resp = await callTool(port, 'vault_list_folder', { folder: 'specs/' })
      const result = parseToolResult(resp) as { files: string[]; folders: string[] }
      expect(result.folders.every((f) => !f.includes('//'))).toBe(true)
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
      expect(result.frontmatter).toMatchObject({
        id: 'abc123',
        slug: 'dark-mode',
        status: 'active',
      })
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
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })

    it('accept merges the field while preserving other frontmatter and body', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('specs/dark-mode/workflow-state.md')
      const fm = parseFrontmatter(updated)
      expect(fm.status).toBe('draft')
      expect(fm.id).toBe('abc123')
      expect(fm.slug).toBe('dark-mode')
      expect(updated).toContain('Body content')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'specs/dark-mode/workflow-state.md',
        field: 'status',
        value: 'draft',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })
  })

  describe('frontmatter_set_many', () => {
    it('returns a pending proposal receipt without mutating the vault', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })

    it('accept merges all fields while preserving other frontmatter and body', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('specs/dark-mode/workflow-state.md')
      const fm = parseFrontmatter(updated)
      expect(fm.status).toBe('done')
      expect(fm.newField).toBe(42)
      expect(fm.id).toBe('abc123')
      expect(updated).toContain('Body content')
    })

    it('reject leaves the vault unchanged', async () => {
      const resp = await callTool(port, 'frontmatter_set_many', {
        path: 'specs/dark-mode/workflow-state.md',
        fields: { status: 'done', newField: 42 },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      adapter.rejectProposal(proposalId)
      const unchanged = await vault.readFile('specs/dark-mode/workflow-state.md')
      expect(parseFrontmatter(unchanged).status).toBe('active')
    })

    it('accept does not strip content when note starts with non-YAML --- block', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'notes/non-yaml-fence.md',
        field: 'tag',
        value: 'test',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const result = await vault.readFile('notes/non-yaml-fence.md')
      expect(result).toContain('Body stays')
      expect(result).toContain('not: [valid: yaml')
    })

    it('accept creates frontmatter block on note with no existing frontmatter', async () => {
      const resp = await callTool(port, 'frontmatter_set_field', {
        path: 'notes/hello.md',
        field: 'tag',
        value: 'greeting',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const updated = await vault.readFile('notes/hello.md')
      expect(parseFrontmatter(updated).tag).toBe('greeting')
      expect(updated).toContain('# Hello')
    })
  })

  describe('getProposals()', () => {
    it('returns pending proposal with correct shape after write tool call', async () => {
      const resp = await callTool(port, 'vault_write_note', {
        path: 'notes/new.md',
        content: '# New',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      const proposals = adapter.getProposals()
      expect(proposals).toHaveLength(1)
      expect(proposals[0]).toEqual({
        proposalId,
        toolName: 'vault_write_note',
        params: { path: 'notes/new.md', content: '# New' },
        status: 'pending',
      })
    })
  })
})
