import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockMetadataCacheAdapter } from '@/infrastructure/mock/MockMetadataCacheAdapter'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
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

describe('ObsidianMcpServerAdapter — links tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let vault: MockBridge
  let metadataCache: MockMetadataCacheAdapter
  let port: number

  beforeEach(async () => {
    vault = new MockBridge({
      'notes/foo.md': '# Foo\n\nBody',
    })
    const repo = new FeatureRepository(vault, vault)
    metadataCache = new MockMetadataCacheAdapter()
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

  describe('links_get_outgoing', () => {
    it('returns links from the seeded metadata snapshot', async () => {
      metadataCache.seedMetadata('notes/foo.md', {
        path: 'notes/foo.md',
        tags: [],
        frontmatter: {},
        links: ['notes/bar.md', 'notes/baz.md'],
        embeds: [],
      })
      const resp = await callTool(port, 'links_get_outgoing', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ links: ['notes/bar.md', 'notes/baz.md'] })
    })

    it('returns empty array when no metadata is cached', async () => {
      const resp = await callTool(port, 'links_get_outgoing', { path: 'unknown.md' })
      expect(parseToolResult(resp)).toEqual({ links: [] })
    })
  })

  describe('links_get_backlinks', () => {
    it('returns the seeded backlinks', async () => {
      metadataCache.seedBacklinks('notes/foo.md', ['notes/a.md', 'notes/b.md'])
      const resp = await callTool(port, 'links_get_backlinks', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ backlinks: ['notes/a.md', 'notes/b.md'] })
    })

    it('returns empty array when no backlinks seeded', async () => {
      const resp = await callTool(port, 'links_get_backlinks', { path: 'notes/foo.md' })
      expect(parseToolResult(resp)).toEqual({ backlinks: [] })
    })
  })

  describe('links_resolve', () => {
    it('returns the resolved destination via getFirstLinkpathDest', async () => {
      metadataCache.seedLinkpathDest('Bar', 'notes/foo.md', 'notes/bar.md')
      const resp = await callTool(port, 'links_resolve', {
        linktext: 'Bar',
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({ resolved: 'notes/bar.md' })
    })

    it('returns resolved: null when unresolved', async () => {
      const resp = await callTool(port, 'links_resolve', {
        linktext: 'Missing',
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({ resolved: null })
    })
  })

  describe('graph_traverse', () => {
    beforeEach(() => {
      // Graph: a -> b -> c, b <- d
      // Outgoing expansion uses resolvedLinks (canonical paths), not raw linktexts.
      metadataCache.seedResolvedLinks('a.md', { 'b.md': 1 })
      metadataCache.seedResolvedLinks('b.md', { 'c.md': 1 })
      metadataCache.seedResolvedLinks('c.md', {})
      metadataCache.seedResolvedLinks('d.md', { 'b.md': 1 })
      metadataCache.seedBacklinks('b.md', ['a.md', 'd.md'])
      metadataCache.seedBacklinks('c.md', ['b.md'])
    })

    it('traverses outgoing links to depth 2', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'a.md',
        depth: 2,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'c.md'])
      expect(result.edges).toEqual(expect.arrayContaining([['a.md', 'b.md'], ['b.md', 'c.md']]))
    })

    it('traverses backlinks to depth 1', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'b.md',
        depth: 1,
        direction: 'backlinks',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'd.md'])
    })

    it('traverses both directions', async () => {
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'b.md',
        depth: 1,
        direction: 'both',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
    })

    it('caps depth at 5', async () => {
      // Build a chain of depth 10
      for (let i = 0; i < 10; i++) {
        metadataCache.seedResolvedLinks(
          `n${i}.md`,
          i < 9 ? { [`n${i + 1}.md`]: 1 } : {},
        )
      }
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'n0.md',
        depth: 100,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[] }
      // depth capped at 5 -> nodes 0..5 visited (6 nodes)
      expect(result.nodes).toHaveLength(6)
    })

    it('handles cycles without infinite loop', async () => {
      metadataCache.seedResolvedLinks('x.md', { 'y.md': 1 })
      metadataCache.seedResolvedLinks('y.md', { 'x.md': 1 })
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'x.md',
        depth: 5,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[] }
      expect(result.nodes.sort()).toEqual(['x.md', 'y.md'])
    })

    it('expands via resolvedLinks paths, not raw linktexts (multi-hop with linktext != path)', async () => {
      // Real Obsidian: getFileMetadata().links are linktexts ("Bar"), not paths.
      // BFS must expand via resolvedLinks so the next hop's lookup finds the canonical path.
      metadataCache.seedMetadata('p1.md', {
        path: 'p1.md', tags: [], frontmatter: {}, links: ['Bar'], embeds: [],
      })
      metadataCache.seedResolvedLinks('p1.md', { 'p2.md': 1 })
      metadataCache.seedResolvedLinks('p2.md', { 'p3.md': 1 })
      metadataCache.seedResolvedLinks('p3.md', {})
      const resp = await callTool(port, 'graph_traverse', {
        startPath: 'p1.md',
        depth: 5,
        direction: 'outgoing',
      })
      const result = parseToolResult(resp) as { nodes: string[]; edges: [string, string][] }
      expect(result.nodes.sort()).toEqual(['p1.md', 'p2.md', 'p3.md'])
      expect(result.edges).toEqual(
        expect.arrayContaining([['p1.md', 'p2.md'], ['p2.md', 'p3.md']]),
      )
    })
  })

  describe('links_add_to_note', () => {
    it('returns a pending proposal without mutating the file', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(typeof result.proposalId).toBe('string')
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody')
    })

    it('appends [[target]] when accepted', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody\n[[notes/bar.md]]')
    })

    it('appends [[target|display]] when displayText is given', async () => {
      const resp = await callTool(port, 'links_add_to_note', {
        path: 'notes/foo.md',
        target: 'notes/bar.md',
        displayText: 'see Bar',
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(await vault.readFile('notes/foo.md')).toBe('# Foo\n\nBody\n[[notes/bar.md|see Bar]]')
    })
  })
})
