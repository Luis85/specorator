import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CanvasPort, JsonCanvasData } from '@/domain/ports'
import type { ProposalStore } from '../ProposalStore'
import { ok } from './shared'

const TextNodeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  text: z.string(),
  color: z.string().optional(),
})

const FileNodeSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  file: z.string(),
  subpath: z.string().optional(),
  color: z.string().optional(),
})

const EdgeSchema = z.object({
  id: z.string(),
  fromNode: z.string(),
  toNode: z.string(),
  fromSide: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  toSide: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
})

interface CanvasNode {
  id: string
  type: string
  [key: string]: unknown
}

function readCanvasOrEmpty(data: JsonCanvasData): { nodes: unknown[]; edges: unknown[] } {
  return {
    nodes: Array.isArray(data.nodes) ? [...data.nodes] : [],
    edges: Array.isArray(data.edges) ? [...data.edges] : [],
  }
}

export function registerCanvasTools(
  mcp: McpServer,
  canvas: CanvasPort,
  store: ProposalStore,
): void {
  mcp.registerTool(
    'canvas_read',
    {
      description: 'Read a JSON Canvas file (.canvas) — returns { nodes, edges }',
      inputSchema: { path: z.string().describe('Vault-relative .canvas path') },
    },
    async ({ path }) => ok({ canvas: await canvas.readCanvas(path) }),
  )

  mcp.registerTool(
    'canvas_create',
    {
      description: 'Create a new JSON Canvas file. Queued for proposal review.',
      inputSchema: {
        path: z.string().describe('Vault-relative .canvas path'),
        data: z
          .object({
            nodes: z.array(z.unknown()).optional(),
            edges: z.array(z.unknown()).optional(),
          })
          .optional(),
      },
    },
    async ({ path, data }) => {
      const initial: JsonCanvasData = data ?? { nodes: [], edges: [] }
      const proposalId = store.queue('canvas_create', { path, data: initial }, () =>
        canvas.writeCanvas(path, initial),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'canvas_add_text_node',
    {
      description: 'Add a text node to a JSON Canvas file. Queued for proposal review.',
      inputSchema: { path: z.string(), node: TextNodeSchema },
    },
    async ({ path, node }) => {
      const proposalId = store.queue('canvas_add_text_node', { path, node }, async () => {
        const current = readCanvasOrEmpty(await canvas.readCanvas(path))
        current.nodes.push({ type: 'text', ...node })
        await canvas.writeCanvas(path, current)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'canvas_add_file_node',
    {
      description: 'Add a file node to a JSON Canvas file. Queued for proposal review.',
      inputSchema: { path: z.string(), node: FileNodeSchema },
    },
    async ({ path, node }) => {
      const proposalId = store.queue('canvas_add_file_node', { path, node }, async () => {
        const current = readCanvasOrEmpty(await canvas.readCanvas(path))
        current.nodes.push({ type: 'file', ...node })
        await canvas.writeCanvas(path, current)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'canvas_add_edge',
    {
      description: 'Add an edge to a JSON Canvas file. Queued for proposal review.',
      inputSchema: { path: z.string(), edge: EdgeSchema },
    },
    async ({ path, edge }) => {
      const proposalId = store.queue('canvas_add_edge', { path, edge }, async () => {
        const current = readCanvasOrEmpty(await canvas.readCanvas(path))
        current.edges.push({ ...edge })
        await canvas.writeCanvas(path, current)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'canvas_update_node',
    {
      description: 'Shallow-merge a patch into an existing canvas node by id. Queued for proposal review.',
      inputSchema: {
        path: z.string(),
        id: z.string().describe('Node id to update'),
        patch: z.record(z.string(), z.unknown()).describe('Fields to merge into the node'),
      },
    },
    async ({ path, id, patch }) => {
      const proposalId = store.queue('canvas_update_node', { path, id, patch }, async () => {
        const current = readCanvasOrEmpty(await canvas.readCanvas(path))
        const idx = current.nodes.findIndex(
          (n): n is CanvasNode =>
            n !== null && typeof n === 'object' && (n as { id?: unknown }).id === id,
        )
        if (idx === -1) throw new Error(`Canvas node not found: ${id}`)
        current.nodes[idx] = { ...(current.nodes[idx] as CanvasNode), ...patch }
        await canvas.writeCanvas(path, current)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}
