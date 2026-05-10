import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ObsidianMcpServerPort, McpConnectionConfig, VaultPort } from '@/domain/ports'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { getAllStepMeta, getStepMeta } from '@/domain/feature/FeatureStep'
import { Slug } from '@/domain/shared/Slug'
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
  specsFolder: string,
): void {
  mcp.registerTool(
    'workflow_get_state',
    {
      description: 'Get the full workflow state for a feature by slug',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const feature = await repo.findBySlug(Slug.reconstitute(slug))
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
          stage: getStepMeta(f.currentStep)?.slug ?? 'unknown',
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
      const feature = await repo.findBySlug(Slug.reconstitute(slug))
      if (!feature) throw new Error(`Feature not found: ${slug}`)
      const stage = getStepMeta(feature.currentStep)?.slug ?? 'unknown'
      const artifacts = await Promise.all(
        getAllStepMeta().map(async (meta) => {
          const path = `${specsFolder}/${slug}/${meta.fileName}`
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
      description: 'Queue a request to create a stage artifact — stub pending #191',
      inputSchema: {
        slug: z.string().describe('Feature slug'),
        stage: z.string().describe('Stage slug (e.g. "design")'),
      },
    },
    async ({ slug, stage }) => {
      const proposalId = store.queue('workflow_create_artifact', { slug, stage }, () => Promise.resolve())
      return ok({ proposalId, status: 'pending' })
    },
  )

  mcp.registerTool(
    'workflow_propose_advance',
    {
      description: 'Queue a proposal to advance a feature to the next stage — stub pending #191',
      inputSchema: { slug: z.string().describe('Feature slug') },
    },
    async ({ slug }) => {
      const proposalId = store.queue('workflow_propose_advance', { slug }, () => Promise.resolve())
      return ok({ proposalId, status: 'pending' })
    },
  )
}

export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly proposalStore = new ProposalStore()
  private httpServer: http.Server | null = null
  private assignedPort = 0

  constructor(
    private readonly vault: VaultPort,
    private readonly repo: IFeatureRepository,
    private readonly specsFolder: string,
  ) {}

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
    registerWorkflowTools(mcp, this.repo, this.vault, this.proposalStore, this.specsFolder)
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
