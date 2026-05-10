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

describe('ObsidianMcpServerAdapter — metadata tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let metadataCache: MockMetadataCacheAdapter
  let port: number

  beforeEach(async () => {
    const vault = new MockBridge({})
    const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
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

  describe('metadata_get_file_cache', () => {
    it('returns the seeded file metadata snapshot', async () => {
      metadataCache.seedMetadata('notes/foo.md', {
        path: 'notes/foo.md',
        tags: ['#feature'],
        frontmatter: { stage: 'idea' },
        links: ['notes/bar.md'],
        embeds: [],
      })
      const resp = await callTool(port, 'metadata_get_file_cache', { path: 'notes/foo.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({
        snapshot: {
          path: 'notes/foo.md',
          tags: ['#feature'],
          frontmatter: { stage: 'idea' },
          links: ['notes/bar.md'],
          embeds: [],
        },
      })
    })

    it('returns snapshot: null when path is unknown', async () => {
      const resp = await callTool(port, 'metadata_get_file_cache', { path: 'missing.md' })
      expect(resp.result.isError).toBeFalsy()
      expect(parseToolResult(resp)).toEqual({ snapshot: null })
    })
  })

  describe('metadata_get_all_tags', () => {
    it('returns the tag count map', async () => {
      metadataCache.seedTags({ '#feature': 2, '#bug': 1 })
      const resp = await callTool(port, 'metadata_get_all_tags', {})
      expect(parseToolResult(resp)).toEqual({ tags: { '#feature': 2, '#bug': 1 } })
    })

    it('returns empty object when no tags seeded', async () => {
      const resp = await callTool(port, 'metadata_get_all_tags', {})
      expect(parseToolResult(resp)).toEqual({ tags: {} })
    })
  })

  describe('metadata_get_resolved_links', () => {
    it('returns the resolved link counts for the source', async () => {
      metadataCache.seedResolvedLinks('notes/foo.md', { 'notes/bar.md': 2, 'notes/baz.md': 1 })
      const resp = await callTool(port, 'metadata_get_resolved_links', {
        sourcePath: 'notes/foo.md',
      })
      expect(parseToolResult(resp)).toEqual({
        links: { 'notes/bar.md': 2, 'notes/baz.md': 1 },
      })
    })

    it('returns empty object for unknown source', async () => {
      const resp = await callTool(port, 'metadata_get_resolved_links', {
        sourcePath: 'unknown.md',
      })
      expect(parseToolResult(resp)).toEqual({ links: {} })
    })
  })
})
