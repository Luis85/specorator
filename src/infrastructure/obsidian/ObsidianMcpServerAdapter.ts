import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type {
  ObsidianMcpServerPort,
  McpConnectionConfig,
  VaultPort,
  MetadataCachePort,
  CanvasPort,
  ObsidianCliPort,
} from '@/domain/ports'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { AdvanceFeatureStageUseCase } from '@/application/feature/AdvanceFeatureStageUseCase'
import type { FeedbackService } from '@/application/shared/FeedbackService'
import { ProposalStore, type PendingProposal } from './ProposalStore'
import {
  registerVaultAndFeatureTools,
  registerWorkflowTools,
  registerMetadataTools,
  registerLinksTools,
  registerCanvasTools,
  registerBasesTools,
  registerObsidianCliTools,
} from './mcp'

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
    private readonly feedback?: FeedbackService,
    private readonly cli?: ObsidianCliPort,
  ) {
    // REQ-AVS-005: thread FeedbackService through to AdvanceFeatureStageUseCase
    // so overwrite-protection notices fire consistently on the MCP path (when
    // an existing stage file is preserved during accept).
    this.advanceUseCase = new AdvanceFeatureStageUseCase(repo, feedback)
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
    registerVaultAndFeatureTools(mcp, this.vault, this.proposalStore)
    registerWorkflowTools(
      mcp,
      this.repo,
      this.vault,
      this.proposalStore,
      this.specsFolder,
      this.advanceUseCase,
      this.feedback,
    )
    registerMetadataTools(mcp, this.metadataCache)
    registerLinksTools(mcp, this.vault, this.metadataCache, this.proposalStore)
    registerCanvasTools(mcp, this.canvas, this.proposalStore)
    registerBasesTools(mcp, this.vault, this.proposalStore)
    // ADR-018 — CLI-backed group, registered only when a CLI is configured.
    if (this.cli?.available === true) {
      registerObsidianCliTools(mcp, this.cli, this.proposalStore)
    }
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
