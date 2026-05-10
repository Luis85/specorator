import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type {
  ObsidianMcpServerPort,
  McpConnectionConfig,
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  JsonCanvasData,
} from '@/domain/ports'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { FEATURE_STEPS, getAllStepMeta, getStepMeta } from '@/domain/feature/FeatureStep'
import { Slug } from '@/domain/shared/Slug'
import { AdvanceFeatureStageUseCase } from '@/application/feature/AdvanceFeatureStageUseCase'
import { ProposalStore, type PendingProposal } from './ProposalStore'

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

async function applyFrontmatterUpdate(
  vault: VaultPort,
  path: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const content = await vault.readFile(path)
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  let existing: Record<string, unknown> = {}
  let bodyStart = 0
  if (fmMatch) {
    try {
      const parsed = parseYaml(fmMatch[1]) as unknown
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>
        bodyStart = fmMatch[0].length
      }
    } catch {
      // non-YAML block — leave bodyStart at 0 so content is preserved
    }
  }
  const merged = { ...existing, ...updates }
  await vault.writeFile(path, `---\n${stringifyYaml(merged)}---\n${content.slice(bodyStart)}`)
}

function joinVaultPath(parent: string, child: string): string {
  const p = parent.replace(/\/+$/, '')
  return p ? `${p}/${child}` : child
}

async function collectFiles(vault: VaultPort, folder: string): Promise<string[]> {
  const [files, subfolders] = await Promise.all([vault.listFiles(folder), vault.listFolders(folder)])
  const nested = await Promise.all(
    subfolders.map((sub) => collectFiles(vault, joinVaultPath(folder, sub))),
  )
  return [...files, ...nested.flat()]
}

function ok(data: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] }
}

function registerTools(mcp: McpServer, vault: VaultPort, store: ProposalStore): void {
  mcp.registerTool(
    'vault_read_note',
    {
      description: 'Read the full content of a vault note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ content: await vault.readFile(path) }),
  )

  mcp.registerTool(
    'vault_write_note',
    {
      description: 'Overwrite a vault note — queued for proposal review',
      inputSchema: { path: z.string(), content: z.string() },
    },
    async ({ path, content }) => {
      const proposalId = store.queue('vault_write_note', { path, content }, () =>
        vault.writeFile(path, content),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'vault_append_to_note',
    {
      description: 'Append text to a vault note — queued for proposal review',
      inputSchema: { path: z.string(), content: z.string().describe('Text to append') },
    },
    async ({ path, content }) => {
      const proposalId = store.queue('vault_append_to_note', { path, content }, async () => {
        const existing = await vault.readFile(path)
        await vault.writeFile(path, existing + content)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'vault_search',
    {
      description: 'Search vault notes for a query string (case-insensitive, recursive)',
      inputSchema: {
        query: z.string().describe('Substring to search for'),
        folder: z.string().describe('Vault-relative folder to search in'),
      },
    },
    async ({ query, folder }) => {
      const files = await collectFiles(vault, folder)
      const lower = query.toLowerCase()
      const matches: Array<{ path: string; excerpt: string }> = []
      for (const path of files) {
        try {
          const content = await vault.readFile(path)
          const idx = content.toLowerCase().indexOf(lower)
          if (idx !== -1) {
            const start = Math.max(0, idx - 60)
            const end = Math.min(content.length, idx + query.length + 60)
            matches.push({ path, excerpt: content.slice(start, end).trim() })
          }
        } catch {
          // skip unreadable files
        }
      }
      return ok({ matches })
    },
  )

  mcp.registerTool(
    'vault_list_folder',
    {
      description: 'List files and immediate subfolders in a vault folder',
      inputSchema: { folder: z.string().describe('Vault-relative folder path') },
    },
    async ({ folder }) => {
      const [files, subfolderNames] = await Promise.all([
        vault.listFiles(folder),
        vault.listFolders(folder),
      ])
      const folders = subfolderNames.map((sub) => joinVaultPath(folder, sub))
      return ok({ files, folders })
    },
  )

  mcp.registerTool(
    'vault_create_folder',
    {
      description: 'Create a folder in the vault',
      inputSchema: { path: z.string().describe('Vault-relative path to create') },
    },
    async ({ path }) => {
      await vault.createFolder(path)
      return ok({ created: true })
    },
  )

  mcp.registerTool(
    'frontmatter_get',
    {
      description: 'Get all YAML frontmatter fields from a vault note',
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const content = await vault.readFile(path)
      return ok({ frontmatter: parseFrontmatter(content) })
    },
  )

  mcp.registerTool(
    'frontmatter_get_field',
    {
      description: 'Get a single frontmatter field from a vault note',
      inputSchema: { path: z.string(), field: z.string().describe('Frontmatter key') },
    },
    async ({ path, field }) => {
      const content = await vault.readFile(path)
      const fm = parseFrontmatter(content)
      const value = Object.prototype.hasOwnProperty.call(fm, field) ? fm[field] : null
      return ok({ field, value })
    },
  )

  mcp.registerTool(
    'frontmatter_set_field',
    {
      description: 'Set a frontmatter field — queued for proposal review',
      inputSchema: { path: z.string(), field: z.string(), value: z.unknown() },
    },
    async ({ path, field, value }) => {
      const proposalId = store.queue('frontmatter_set_field', { path, field, value }, () =>
        applyFrontmatterUpdate(vault, path, { [field]: value }),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'frontmatter_set_many',
    {
      description: 'Set multiple frontmatter fields at once — queued for proposal review',
      inputSchema: {
        path: z.string(),
        fields: z.record(z.string(), z.any()).describe('Key-value pairs to set'),
      },
    },
    async ({ path, fields }) => {
      const proposalId = store.queue('frontmatter_set_many', { path, fields }, () =>
        applyFrontmatterUpdate(vault, path, fields),
      )
      return ok({ proposalId, status: 'pending' })
    },
  )
}

function registerWorkflowTools(
  mcp: McpServer,
  repo: IFeatureRepository,
  vault: VaultPort,
  store: ProposalStore,
  specsFolder: () => string,
  advanceUseCase: AdvanceFeatureStageUseCase,
): void {
  mcp.registerTool(
    'workflow_get_state',
    {
      description: 'Get the full workflow state for a feature by slug',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      return ok(feature.toPlainObject())
    },
  )

  mcp.registerTool(
    'workflow_list_features',
    {
      description: 'List all features with their current stage and title',
      inputSchema: {},
    },
    async () => {
      const features = await repo.findAll()
      return ok({
        features: features.map((f) => ({
          slug: f.slug.toString(),
          stage: f.isComplete ? 'retrospective' : (getStepMeta(f.currentStep)?.slug ?? 'unknown'),
          title: f.title,
        })),
      })
    },
  )

  mcp.registerTool(
    'workflow_get_stage_artifacts',
    {
      description: 'Get all stage artifact files for a feature and their vault existence status',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const stage = feature.isComplete ? 'retrospective' : (getStepMeta(feature.currentStep)?.slug ?? 'unknown')
      const artifacts = await Promise.all(
        getAllStepMeta().map(async (meta) => {
          const path = joinVaultPath(joinVaultPath(specsFolder(), feature.slug.toString()), meta.fileName)
          const exists = await vault.fileExists(path)
          return { slug: meta.slug, path, exists }
        }),
      )
      return ok({ stage, artifacts })
    },
  )

  mcp.registerTool(
    'workflow_get_quality_gates',
    {
      description: 'Get all 12 workflow stage definitions (quality gates) in order',
      inputSchema: {},
    },
    async () => ok({ gates: getAllStepMeta() }),
  )

  mcp.registerTool(
    'workflow_create_artifact',
    {
      description: 'Create a stage artifact file (idempotent, overwrite-safe). Queued for proposal review.',
      inputSchema: {
        slug: z.string().describe('Feature slug'),
        stage: z.string().describe('Stage slug (one of the 12 FEATURE_STEPS)'),
      },
    },
    async ({ slug, stage }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const stageIndex = (FEATURE_STEPS as readonly string[]).indexOf(stage)
      if (stageIndex === -1) throw new Error(`Invalid stage: ${stage}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      // Bind to feature.id (not slug) so a delayed accept cannot retarget a
      // replacement feature that happens to reuse the same slug after delete.
      const featureId = feature.id
      const proposalId = store.queue('workflow_create_artifact', { slug, stage }, async () => {
        const fresh = await repo.findById(featureId)
        if (!fresh) throw new Error(`Feature no longer exists: ${slug}`)
        const result = await repo.createStageFile(fresh, stageIndex + 1)
        if (!result.ok) throw result.error
      })
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'workflow_propose_advance',
    {
      description: 'Advance a feature to the next workflow stage. Queued for proposal review.',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const slugResult = Slug.create(slug)
      if (!slugResult.ok) throw new Error(`Invalid slug: ${slug}`)
      const feature = await repo.findBySlug(slugResult.value)
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const featureId = feature.id
      const proposalId = store.queue('workflow_propose_advance', { slug }, async () => {
        const result = await advanceUseCase.execute({ featureId })
        if (!result.ok) throw result.error
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}

function registerMetadataTools(mcp: McpServer, metadataCache: MetadataCachePort): void {
  mcp.registerTool(
    'metadata_get_file_cache',
    {
      description: 'Get the metadata cache snapshot (tags, frontmatter, links, embeds) for a vault note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ snapshot: metadataCache.getFileMetadata(path) }),
  )

  mcp.registerTool(
    'metadata_get_all_tags',
    {
      description: 'Get the tag → count map across the entire vault',
      inputSchema: {},
    },
    async () => ok({ tags: metadataCache.getAllTags() }),
  )

  mcp.registerTool(
    'metadata_get_resolved_links',
    {
      description: 'Get resolved outgoing links and their counts for a source note',
      inputSchema: { sourcePath: z.string().describe('Source vault path') },
    },
    async ({ sourcePath }) => ok({ links: metadataCache.getResolvedLinks(sourcePath) }),
  )
}

type TraverseDirection = 'outgoing' | 'backlinks' | 'both'

function neighborsOf(
  metadataCache: MetadataCachePort,
  node: string,
  direction: TraverseDirection,
): { outgoing: readonly string[]; incoming: readonly string[] } {
  // Outgoing expansion uses resolvedLinks keys — those are canonical vault paths.
  // getFileMetadata().links contains raw linktexts ("Page", "Page#Heading") that
  // cannot be reused as node keys for the next BFS hop.
  const outgoing =
    direction === 'outgoing' || direction === 'both'
      ? Object.keys(metadataCache.getResolvedLinks(node))
      : []
  const incoming =
    direction === 'backlinks' || direction === 'both' ? metadataCache.getBacklinks(node) : []
  return { outgoing, incoming }
}

function bfsTraverse(
  metadataCache: MetadataCachePort,
  startPath: string,
  cappedDepth: number,
  direction: TraverseDirection,
): { nodes: string[]; edges: Array<[string, string]> } {
  const visited = new Set<string>([startPath])
  const edges: Array<[string, string]> = []
  let frontier: string[] = [startPath]
  for (let hop = 0; hop < cappedDepth; hop++) {
    const next: string[] = []
    for (const node of frontier) {
      const { outgoing, incoming } = neighborsOf(metadataCache, node, direction)
      for (const target of outgoing) {
        edges.push([node, target])
        if (!visited.has(target)) {
          visited.add(target)
          next.push(target)
        }
      }
      for (const source of incoming) {
        edges.push([source, node])
        if (!visited.has(source)) {
          visited.add(source)
          next.push(source)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return { nodes: Array.from(visited), edges }
}

function registerLinksTools(
  mcp: McpServer,
  vault: VaultPort,
  metadataCache: MetadataCachePort,
  store: ProposalStore,
): void {
  mcp.registerTool(
    'links_get_outgoing',
    {
      description: 'Get outgoing wikilinks from a note (resolved + unresolved linktexts)',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      const snapshot = metadataCache.getFileMetadata(path)
      return ok({ links: snapshot?.links ?? [] })
    },
  )

  mcp.registerTool(
    'links_get_backlinks',
    {
      description: 'Get vault paths that link to the given note',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ backlinks: metadataCache.getBacklinks(path) }),
  )

  mcp.registerTool(
    'links_resolve',
    {
      description: 'Resolve a wikilink linktext to its absolute vault path. Uses Obsidian metadata cache in-process.',
      inputSchema: {
        linktext: z.string().describe('Wikilink linktext, e.g. "Page Name" or "folder/page"'),
        sourcePath: z.string().describe('Source note path the link is being resolved from'),
      },
    },
    async ({ linktext, sourcePath }) =>
      ok({ resolved: metadataCache.getFirstLinkpathDest(linktext, sourcePath) }),
  )

  mcp.registerTool(
    'graph_traverse',
    {
      description: 'BFS traverse the link graph from a start node. Direction = outgoing | backlinks | both. Depth capped at 5.',
      inputSchema: {
        startPath: z.string().describe('Starting vault path'),
        depth: z.number().int().min(1).describe('Hop limit (capped at 5)'),
        direction: z.enum(['outgoing', 'backlinks', 'both']),
      },
    },
    async ({ startPath, depth, direction }) => {
      const result = bfsTraverse(metadataCache, startPath, Math.min(depth, 5), direction)
      return ok(result)
    },
  )

  mcp.registerTool(
    'links_add_to_note',
    {
      description: 'Append a wikilink [[target]] (or [[target|display]]) to a note. Queued for proposal review.',
      inputSchema: {
        path: z.string().describe('Vault-relative note path'),
        target: z.string().describe('Link target (linktext or path)'),
        displayText: z.string().optional().describe('Optional display text after the pipe'),
      },
    },
    async ({ path, target, displayText }) => {
      const hasDisplay = displayText !== undefined && displayText !== ''
      const wikilink = hasDisplay ? `[[${target}|${displayText}]]` : `[[${target}]]`
      const proposalId = store.queue('links_add_to_note', { path, target, displayText }, async () => {
        const existing = await vault.readFile(path)
        await vault.writeFile(path, `${existing}\n${wikilink}`)
      })
      return ok({ proposalId, status: 'pending' })
    },
  )
}

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

function registerCanvasTools(
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

export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly proposalStore = new ProposalStore()
  private readonly advanceUseCase: AdvanceFeatureStageUseCase
  private httpServer: http.Server | null = null
  private assignedPort = 0

  constructor(
    private readonly vault: VaultPort,
    private readonly repo: IFeatureRepository,
    private readonly specsFolder: () => string,
    private readonly metadataCache: MetadataCachePort,
    private readonly canvas: CanvasPort,
  ) {
    this.advanceUseCase = new AdvanceFeatureStageUseCase(repo)
  }

  // Off-port by design: called directly by the sidebar module, not via MCP.
  async acceptProposal(proposalId: string): Promise<void> {
    await this.proposalStore.accept(proposalId)
  }

  rejectProposal(proposalId: string): void {
    this.proposalStore.reject(proposalId)
  }

  getProposals(): ReadonlyArray<PendingProposal> {
    return this.proposalStore.getAll()
  }

  async start(): Promise<{ port: number }> {
    const server = http.createServer((req, res) => {
      const host = req.headers.host?.split(':')[0] ?? ''
      if (host !== '127.0.0.1' && host !== 'localhost') {
        res.writeHead(421).end()
        return
      }
      if (req.url === '/mcp') {
        void this._handleMcpRequest(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500).end()
        })
      } else {
        res.writeHead(404).end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    const addr = server.address()
    const port = addr !== null && typeof addr === 'object' ? addr.port : 0

    this.httpServer = server
    this.assignedPort = port

    return { port }
  }

  private async _handleMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const mcp = new McpServer({ name: 'specorator', version: '1.0.0' })
    registerTools(mcp, this.vault, this.proposalStore)
    registerWorkflowTools(
      mcp,
      this.repo,
      this.vault,
      this.proposalStore,
      this.specsFolder,
      this.advanceUseCase,
    )
    registerMetadataTools(mcp, this.metadataCache)
    registerLinksTools(mcp, this.vault, this.metadataCache, this.proposalStore)
    registerCanvasTools(mcp, this.canvas, this.proposalStore)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await transport.close()
    }
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    if (server !== null) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err !== undefined) reject(err)
          else resolve()
        })
      })
    }
    this.httpServer = null
    this.assignedPort = 0
  }

  getConnectionConfig(): McpConnectionConfig {
    if (this.assignedPort === 0) {
      throw new Error('MCP server not started — call start() first')
    }
    return { transport: 'http', url: `http://127.0.0.1:${this.assignedPort}/mcp` }
  }
}
