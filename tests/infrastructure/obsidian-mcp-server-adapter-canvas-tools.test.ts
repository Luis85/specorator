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

describe('ObsidianMcpServerAdapter — canvas tools', () => {
  let adapter: ObsidianMcpServerAdapter
  let canvas: MockCanvasAdapter
  let port: number

  beforeEach(async () => {
    const vault = new MockBridge({})
    const repo = new FeatureRepository(vault, vault, () => DEFAULT_SETTINGS)
    const metadataCache = new MockMetadataCacheAdapter()
    canvas = new MockCanvasAdapter()
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

  describe('canvas_read', () => {
    it('returns the seeded canvas', async () => {
      canvas.seedCanvas('boards/a.canvas', {
        nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'hi' }],
        edges: [],
      })
      const resp = await callTool(port, 'canvas_read', { path: 'boards/a.canvas' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { canvas: { nodes: unknown[]; edges: unknown[] } }
      expect(result.canvas.nodes).toHaveLength(1)
    })

    it('returns isError when canvas is missing', async () => {
      const resp = await callTool(port, 'canvas_read', { path: 'missing.canvas' })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('canvas_create', () => {
    it('returns a pending proposal without writing the file', async () => {
      const resp = await callTool(port, 'canvas_create', { path: 'boards/new.canvas' })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(canvas.getWritten('boards/new.canvas')).toBeUndefined()
    })

    it('accept writes empty canvas by default', async () => {
      const resp = await callTool(port, 'canvas_create', { path: 'boards/new.canvas' })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(canvas.getWritten('boards/new.canvas')).toEqual({ nodes: [], edges: [] })
    })

    it('accept writes provided initial data', async () => {
      const seed = {
        nodes: [{ id: 'a', type: 'text', x: 0, y: 0, width: 1, height: 1, text: 't' }],
        edges: [],
      }
      const resp = await callTool(port, 'canvas_create', {
        path: 'boards/new.canvas',
        data: seed,
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      expect(canvas.getWritten('boards/new.canvas')).toEqual(seed)
    })
  })

  describe('canvas_add_text_node', () => {
    beforeEach(() => {
      canvas.seedCanvas('boards/a.canvas', { nodes: [], edges: [] })
    })

    it('returns a pending proposal without mutating the canvas', async () => {
      const resp = await callTool(port, 'canvas_add_text_node', {
        path: 'boards/a.canvas',
        node: { id: 'n1', x: 0, y: 0, width: 100, height: 50, text: 'hello' },
      })
      expect(resp.result.isError).toBeFalsy()
      const result = parseToolResult(resp) as { proposalId: string; status: string }
      expect(result.status).toBe('pending')
      expect(canvas.getWritten('boards/a.canvas')).toBeUndefined()
    })

    it('accept appends a typed text node', async () => {
      const resp = await callTool(port, 'canvas_add_text_node', {
        path: 'boards/a.canvas',
        node: { id: 'n1', x: 1, y: 2, width: 100, height: 50, text: 'hello' },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const written = canvas.getWritten('boards/a.canvas')
      expect(written?.nodes).toEqual([
        { type: 'text', id: 'n1', x: 1, y: 2, width: 100, height: 50, text: 'hello' },
      ])
    })

    it('rejects malformed node payload', async () => {
      const resp = await callTool(port, 'canvas_add_text_node', {
        path: 'boards/a.canvas',
        node: { id: 'n1', text: 'missing coords' },
      })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('canvas_add_file_node', () => {
    beforeEach(() => {
      canvas.seedCanvas('boards/a.canvas', { nodes: [], edges: [] })
    })

    it('accept appends a typed file node with optional subpath', async () => {
      const resp = await callTool(port, 'canvas_add_file_node', {
        path: 'boards/a.canvas',
        node: {
          id: 'f1',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          file: 'notes/foo.md',
          subpath: '#Section',
        },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const written = canvas.getWritten('boards/a.canvas')
      expect(written?.nodes).toEqual([
        {
          type: 'file',
          id: 'f1',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          file: 'notes/foo.md',
          subpath: '#Section',
        },
      ])
    })

    it('rejects payload missing required `file` field', async () => {
      const resp = await callTool(port, 'canvas_add_file_node', {
        path: 'boards/a.canvas',
        node: { id: 'f1', x: 0, y: 0, width: 1, height: 1 },
      })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('canvas_add_edge', () => {
    beforeEach(() => {
      canvas.seedCanvas('boards/a.canvas', { nodes: [], edges: [] })
    })

    it('accept appends the edge', async () => {
      const resp = await callTool(port, 'canvas_add_edge', {
        path: 'boards/a.canvas',
        edge: {
          id: 'e1',
          fromNode: 'n1',
          toNode: 'n2',
          fromSide: 'right',
          toSide: 'left',
          label: 'depends',
        },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const written = canvas.getWritten('boards/a.canvas')
      expect(written?.edges).toEqual([
        {
          id: 'e1',
          fromNode: 'n1',
          toNode: 'n2',
          fromSide: 'right',
          toSide: 'left',
          label: 'depends',
        },
      ])
    })

    it('rejects edge with invalid side value', async () => {
      const resp = await callTool(port, 'canvas_add_edge', {
        path: 'boards/a.canvas',
        edge: { id: 'e1', fromNode: 'a', toNode: 'b', fromSide: 'diagonal' },
      })
      expect(resp.result.isError).toBe(true)
    })
  })

  describe('canvas_update_node', () => {
    beforeEach(() => {
      canvas.seedCanvas('boards/a.canvas', {
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'old' },
        ],
        edges: [],
      })
    })

    it('accept shallow-merges the patch into the matching node', async () => {
      const resp = await callTool(port, 'canvas_update_node', {
        path: 'boards/a.canvas',
        id: 'n1',
        patch: { text: 'new', color: '4' },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await adapter.acceptProposal(proposalId)
      const written = canvas.getWritten('boards/a.canvas')
      expect(written?.nodes?.[0]).toEqual({
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'new',
        color: '4',
      })
    })

    it('accept rejects when target id is not present', async () => {
      const resp = await callTool(port, 'canvas_update_node', {
        path: 'boards/a.canvas',
        id: 'missing',
        patch: { text: 'x' },
      })
      const { proposalId } = parseToolResult(resp) as { proposalId: string }
      await expect(adapter.acceptProposal(proposalId)).rejects.toThrow(/not found/)
    })
  })
})
