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
  LoggerPort,
  NotificationPort,
} from '@/domain/ports'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { AdvanceFeatureStageUseCase } from '@/application/feature/AdvanceFeatureStageUseCase'
import type { FeedbackService } from '@/application/shared/FeedbackService'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import { AuditLogWriter } from '@/infrastructure/obsidian/audit/AuditLogWriter'
import { McpClientIdentifier } from '@/infrastructure/mcp/McpClientIdentifier'
import type { ProposalDecision } from '@/domain/mcp/Proposal'
import { ProposalStore, type PendingProposal } from './ProposalStore'
import {
  registerVaultAndFeatureTools,
  registerWorkflowTools,
  registerMetadataTools,
  registerLinksTools,
  registerCanvasTools,
  registerBasesTools,
  registerObsidianCliTools,
  registerObsidianCliReadTools,
  registerWorkflowProposalTools,
} from './mcp'

/* eslint-disable @typescript-eslint/no-empty-function */
/**
 * Silent fallback logger used when the plugin layer has not threaded a
 * `LoggerPort` through. The MHP rewire (T-MHP-041) needs a logger for
 * `ProposalEventBus`, `AuditLogWriter`, and `ProposalStore`; a real
 * `LoggerPort` is supplied at the plugin boundary in production.
 *
 * The fallback is deliberately silent (not console-backed) so the plugin's
 * "Avoid unnecessary logging to console" rule (Obsidian plugin guideline)
 * is not breached when this code path runs in unit-test / bench contexts.
 */
const FALLBACK_LOGGER: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/**
 * Quiet `NotificationPort` fallback used when the plugin layer has not
 * threaded one through. `AuditLogWriter` requires a notify port for sticky
 * error surfacing (REQ-MHP-025) — when absent, audit failures still log via
 * `LoggerPort` but the no-op notify keeps the adapter testable from CI.
 */
const FALLBACK_NOTIFY: NotificationPort = {
  showError: () => {},
  showWarning: () => {},
  showSuccess: () => {},
  showInfo: () => {},
}
/* eslint-enable @typescript-eslint/no-empty-function */

const SPECORATOR_FOLDER = '.specorator'
const AUDIT_MAX_BYTES = 2 * 1024 * 1024 // 2 MiB (REQ-MHP-024)
const AUDIT_MAX_ROTATIONS = 5 // NFR-MHP-008

export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private readonly logger: LoggerPort
  private readonly eventBus: ProposalEventBus
  private readonly auditLog: AuditLogWriter
  private readonly clientIdentifier: McpClientIdentifier
  private readonly proposalStore: ProposalStore
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
    deps?: {
      readonly logger?: LoggerPort
      readonly notify?: NotificationPort
    },
  ) {
    // REQ-AVS-005: thread FeedbackService through to AdvanceFeatureStageUseCase
    // so overwrite-protection notices fire consistently on the MCP path (when
    // an existing stage file is preserved during accept).
    this.advanceUseCase = new AdvanceFeatureStageUseCase(repo, feedback)

    // T-MHP-041 rewire: instantiate the MHP infrastructure (event bus, audit
    // writer, client identifier) and wire all four into the ProposalStore
    // (SPEC-MHP-034). Production code threads a real LoggerPort + NotifyPort
    // through `deps`; tests and bench harnesses fall back to silent ports.
    this.logger = deps?.logger ?? FALLBACK_LOGGER
    const notify = deps?.notify ?? FALLBACK_NOTIFY
    this.eventBus = new ProposalEventBus({ logger: this.logger })
    this.auditLog = new AuditLogWriter({
      vault,
      logger: this.logger,
      notify,
      specoratorFolder: SPECORATOR_FOLDER,
      maxSizeBytes: AUDIT_MAX_BYTES,
      maxRotations: AUDIT_MAX_ROTATIONS,
    })
    this.clientIdentifier = new McpClientIdentifier()
    this.proposalStore = new ProposalStore({
      eventBus: this.eventBus,
      auditLog: this.auditLog,
      clientIdentifier: this.clientIdentifier,
      logger: this.logger,
    })
  }

  // -----------------------------------------------------------------------
  // Off-port API (called by the sidebar / settings page directly, not MCP).
  // T-MHP-041 routes legacy `acceptProposal` / `rejectProposal` /
  // `getProposals` through the new extended surface so a single decision
  // path serves both in-process and MCP callers.
  // -----------------------------------------------------------------------

  async acceptProposal(proposalId: string): Promise<void> {
    const decision: ProposalDecision = {
      outcome: 'accepted',
      by: 'user',
      rule: '',
      at: new Date().toISOString(),
    }
    const result = await this.proposalStore.acceptBy(proposalId, decision)
    if (!result.ok) throw result.error
  }

  async rejectProposal(proposalId: string): Promise<void> {
    const decision: ProposalDecision = {
      outcome: 'rejected',
      by: 'user',
      rule: '',
      at: new Date().toISOString(),
    }
    const result = await this.proposalStore.rejectBy(proposalId, decision)
    if (!result.ok) throw result.error
  }

  getProposals(): ReadonlyArray<PendingProposal> {
    // T-MHP-040 wires the off-port read through `listPending` (extended
    // surface). The shape is the domain `PendingProposal`; legacy callers
    // need only `proposalId` + `status`, both present on the domain shape
    // (the legacy `toolName` field is mirrored via `tool`).
    return this.proposalStore.listPending().map((p) => ({
      proposalId: p.proposalId,
      toolName: p.tool,
      params: p.params,
      status: p.status,
    }))
  }

  // -----------------------------------------------------------------------
  // Shutdown discard hook (REQ-MHP-038). The plugin-boundary `Plugin.onunload`
  // calls this so any remaining pending proposals get one `discarded` audit
  // row before the queue is dropped (T-MHP-012 owns the plugin wiring; here
  // we expose the method).
  // -----------------------------------------------------------------------

  async discardPendingOnShutdown(): Promise<void> {
    await this.proposalStore.discardPending()
  }

  // -----------------------------------------------------------------------
  // Lifecycle.
  // -----------------------------------------------------------------------

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
    // T-MHP-041: attach the per-connection client-identifier hook before any
    // tool handlers run, so accept/reject paths see the correct identity.
    // The MCP SDK's `McpServer` does not currently expose a typed
    // `onInitialize`; the identifier's `InitializeHookHost` interface is
    // structurally typed against the eventual SDK surface. When the SDK gains
    // the hook, the cast disappears.
    const identifierHost = mcp as unknown as {
      onInitialize?: (handler: (params: Parameters<typeof noop>[0]) => void) => void
    }
    if (typeof identifierHost.onInitialize === 'function') {
      this.clientIdentifier.attachInitializeHook(identifierHost as unknown as {
        onInitialize(handler: (p: Parameters<typeof noop>[0]) => void): void
      })
    }
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
      // T-MHP-041: also register the 12 Tier-A read tools (SPEC-MHP-013..024).
      // The Tier-A registrar uses the lighter `.tool(name, schema, handler)`
      // shape; the live SDK `McpServer` exposes `.registerTool(name,
      // descriptor, handler)`. Bridge the shapes here so the registrar can
      // stay decoupled from the SDK signature.
      const readToolHost = {
        tool: (
          name: string,
          schema: unknown,
          handler: (input: Record<string, unknown>) => Promise<unknown>,
        ): void => {
          // The SDK `registerTool` expects `{description, inputSchema}` where
          // `inputSchema` is a zod-shape record. The shared `vaultPath`
          // schemas here are already zod objects exposing `.shape`; pass the
          // shape when available, otherwise an empty schema (zero-arg reads).
          // The cast widens the SDK's strict zod-shape constraint so the
          // wrapper can stay registrar-agnostic.
          const z = schema as { shape?: Record<string, unknown> }
          const register = mcp.registerTool.bind(mcp) as (
            n: string,
            d: { description: string; inputSchema: Record<string, unknown> },
            h: (args: unknown) => Promise<unknown>,
          ) => void
          register(
            name,
            {
              description: `Tier-A read tool: ${name}`,
              inputSchema: z.shape ?? {},
            },
            async (args: unknown) => {
              const result = await handler((args ?? {}) as Record<string, unknown>)
              return {
                content: [{ type: 'text' as const, text: JSON.stringify(result) }],
              }
            },
          )
        },
      }
      registerObsidianCliReadTools(readToolHost, {
        cli: { available: true, binaryPath: '' },
        logger: this.logger,
      })
    }
    // T-MHP-041: register the 4 host-side workflow_proposal_* tools
    // (SPEC-MHP-001..004). These are independent of the CLI port — they
    // expose the queue to ANY MCP client.
    registerWorkflowProposalTools(mcp, this.proposalStore, this.clientIdentifier)

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

// Helper alias used to type the (currently absent) SDK `onInitialize` hook
// parameter without leaking a wider `any`. The body is intentionally a no-op
// — only the parameter type is exported via `Parameters<typeof noop>`.
function noop(_params: {
  connectionId: string
  clientInfo?: unknown
  transport?: 'loopback' | 'in-process'
  address?: string
}): void {
  /* type-only helper */
}
