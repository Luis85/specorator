/**
 * T-MHP-081 — `DevToolsToolRegistrar` (SPEC-MHP-026..033, SPEC-MHP-041).
 *
 * Owns conditional registration of the 8 DevTools MCP tools per the ADR-019
 * matrix:
 *
 *   - `devtools.masterEnabled = false` → no DevTools tool registers
 *     (REQ-MHP-016, REQ-MHP-018).
 *   - `devtools.masterEnabled = true` → the 3 low-risk tools register
 *     (`dev:screenshot`, `dev:errors`, `dev:console`).
 *   - `devtools.masterEnabled = true` AND `devtools.tools[id].enabled = true`
 *     → the named high-risk tool also registers (REQ-MHP-017).
 *   - `devtools.masterEnabled = true` AND `devtools.autoAcceptLowRisk = true`
 *     → low-risk invocations auto-accept (REQ-MHP-043); `dev:cdp` and the
 *     other high-risk four still queue `pending` (REQ-MHP-020).
 *
 * Result-delivery choice (T-MHP-082): **always-via-accept**. Every DevTools
 * invocation returns `{ proposalId, status, tool }`; clients call
 * `workflow_proposal_accept` to obtain the actual side-effect payload. This
 * is the architecturally simpler path that satisfies REQ-MHP-019 + REQ-MHP-046
 * — see implementation-log.md T-MHP-082.
 *
 * Result payloads are NEVER serialised into the audit row (REQ-MHP-021).
 * The mutate closure is built via the injected `mutateFor(toolId, input)`
 * factory; whatever it returns goes to the MCP response of the eventual
 * `workflow_proposal_accept`, not the audit row.
 *
 * Spec: SPEC-MHP-026..033, SPEC-MHP-041.
 * Satisfies: REQ-MHP-016, REQ-MHP-017, REQ-MHP-018, REQ-MHP-019, REQ-MHP-020,
 *            REQ-MHP-021, REQ-MHP-043.
 */
import { z } from 'zod'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { ProposalDecision } from '@/domain/mcp/Proposal'
import type { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'

/**
 * Narrow MCP-server surface this registrar needs. Production wiring passes
 * the existing `ObsidianMcpServerAdapter`'s `tool()` method, which already
 * returns an unregister handle. Tests pass a stub that captures the registration
 * and returns a matching unregister function.
 */
export interface DevToolsServer {
  tool(
    name: string,
    schema: unknown,
    handler: (input: Record<string, unknown>) => Promise<DevToolsToolResponse>,
  ): () => void
}

/** Wire-format response shape per SPEC-MHP-005..012 / SPEC-MHP-026..033. */
export interface DevToolsToolResponse {
  readonly proposalId: string
  readonly status: 'pending' | 'accepted'
  readonly tool: string
  readonly intent?: string
}

/** Mutate-closure factory injected by the production wire-up. */
export type DevToolsMutateFactory = (
  toolId: DevToolsToolId,
  input: Record<string, unknown>,
) => () => Promise<unknown>

export type DevToolsToolId =
  | 'dev:screenshot'
  | 'dev:errors'
  | 'dev:console'
  | 'dev:dom'
  | 'dev:cdp'
  | 'dev:debug'
  | 'dev:mobile'
  | 'devtools'

type HighRiskId = Extract<
  DevToolsToolId,
  'dev:dom' | 'dev:cdp' | 'dev:debug' | 'dev:mobile' | 'devtools'
>

const LOW_RISK_IDS: ReadonlyArray<DevToolsToolId> = [
  'dev:screenshot',
  'dev:errors',
  'dev:console',
]

const HIGH_RISK_IDS: ReadonlyArray<HighRiskId> = [
  'dev:dom',
  'dev:cdp',
  'dev:debug',
  'dev:mobile',
  'devtools',
]

/**
 * Per-tool Zod input schemas (SPEC-MHP-026..033 §"Per-tool input schemas").
 */
const SCHEMAS: Readonly<Record<DevToolsToolId, z.ZodType>> = {
  'dev:screenshot': z.object({ intent: z.string().optional() }).strict(),
  'dev:errors': z.object({ intent: z.string().optional() }).strict(),
  'dev:console': z.object({ intent: z.string().optional() }).strict(),
  'dev:dom': z
    .object({ selector: z.string().min(1), intent: z.string().optional() })
    .strict(),
  'dev:cdp': z
    .object({
      method: z.string().min(1),
      params: z.unknown().optional(),
      intent: z.string().optional(),
    })
    .strict(),
  'dev:debug': z
    .object({ enable: z.boolean(), intent: z.string().optional() })
    .strict(),
  'dev:mobile': z
    .object({ enable: z.boolean(), intent: z.string().optional() })
    .strict(),
  devtools: z
    .object({ docked: z.boolean().optional(), intent: z.string().optional() })
    .strict(),
}

export interface DevToolsToolRegistrarDeps {
  readonly server: DevToolsServer
  readonly store: ProposalStore
  readonly settings: () => PluginSettings
  readonly logger: LoggerPort
  readonly mutateFor: DevToolsMutateFactory
}

/**
 * Computes the active DevTools tool registration set from `PluginSettings` per
 * the ADR-019 matrix.
 */
function computeEnabledTools(
  settings: PluginSettings['devtools'],
): ReadonlyArray<DevToolsToolId> {
  if (!settings.masterEnabled) return []
  const enabled: DevToolsToolId[] = [...LOW_RISK_IDS]
  for (const id of HIGH_RISK_IDS) {
    if (settings.tools[id].enabled) enabled.push(id)
  }
  return enabled
}

/**
 * Whether the tool is eligible for the DevTools-low-risk auto-accept rule.
 * Per REQ-MHP-020, `dev:cdp` is excluded even though it is not low-risk —
 * called out explicitly to defend against the algorithm being expanded to
 * cover any high-risk tool by mistake.
 */
function autoAcceptEligible(
  toolId: DevToolsToolId,
  devtools: PluginSettings['devtools'],
  requireExplicitAccept: boolean,
): boolean {
  if (requireExplicitAccept) return false
  if (!devtools.masterEnabled) return false
  if (!devtools.autoAcceptLowRisk) return false
  return LOW_RISK_IDS.includes(toolId)
}

export class DevToolsToolRegistrar {
  readonly #deps: DevToolsToolRegistrarDeps
  /** Active unregister handles keyed by tool id. */
  readonly #handles = new Map<DevToolsToolId, () => void>()

  constructor(deps: DevToolsToolRegistrarDeps) {
    this.#deps = deps
  }

  /**
   * Re-evaluate the settings snapshot and reconcile the registered tool set:
   * register newly-enabled tools; unregister tools that fell off the matrix.
   * Safe to call repeatedly (idempotent for stable settings).
   */
  refresh(): void {
    const settings = this.#deps.settings()
    const enabled = new Set(computeEnabledTools(settings.devtools))

    // Drop tools no longer in the enabled set.
    for (const [id, dispose] of [...this.#handles]) {
      if (!enabled.has(id)) {
        dispose()
        this.#handles.delete(id)
      }
    }

    // Register newly-enabled tools.
    for (const id of enabled) {
      if (this.#handles.has(id)) continue
      const dispose = this.#deps.server.tool(
        id,
        SCHEMAS[id],
        (input) => this.#handle(id, input),
      )
      this.#handles.set(id, dispose)
    }

    this.#deps.logger.debug('mhp.devtools.registrar.refresh', {
      enabled: [...enabled],
      registered: [...this.#handles.keys()],
    })
  }

  /** Tear down every registered tool (called on plugin unload). */
  dispose(): void {
    for (const dispose of this.#handles.values()) dispose()
    this.#handles.clear()
  }

  async #handle(
    toolId: DevToolsToolId,
    input: Record<string, unknown>,
  ): Promise<DevToolsToolResponse> {
    const parsed = SCHEMAS[toolId].safeParse(input)
    const safeInput = parsed.success
      ? (parsed.data as Record<string, unknown>)
      : input
    const intent =
      typeof safeInput.intent === 'string' ? safeInput.intent : ''

    // Adapt the application-layer mutate (returns the side-effect payload
    // the eventual `workflow_proposal_accept` surfaces) to the store's
    // `() => Promise<void>` contract: the store does not consume the
    // returned value (REQ-MHP-021 — payloads never enter the audit row).
    const mutateRaw = this.#deps.mutateFor(toolId, safeInput)
    const mutate = async (): Promise<void> => {
      await mutateRaw()
    }
    const queued = this.#deps.store.tryQueue(toolId, safeInput, mutate)
    if (!queued.ok) {
      // `queue_full` is the only error tryQueue surfaces today; let the MCP
      // adapter map it. Re-throw as a typed error so the wire layer can
      // translate.
      throw queued.error
    }

    const { proposalId } = queued.value
    const settings = this.#deps.settings()
    const eligible = autoAcceptEligible(
      toolId,
      settings.devtools,
      settings.requireExplicitAcceptForAllWrites,
    )

    if (!eligible) {
      return { proposalId, status: 'pending', tool: toolId, intent }
    }

    const decision: ProposalDecision = {
      outcome: 'accepted',
      by: 'auto',
      rule: 'devtools-low-risk-auto-accept',
      at: new Date().toISOString(),
    }
    const accepted = await this.#deps.store.acceptBy(proposalId, decision)
    if (!accepted.ok) {
      // Auto-accept transitioned to error (e.g. mutate threw). The store has
      // already written the error audit row + emitted decided; surface as
      // pending so the client sees the proposal id and can introspect via
      // workflow_proposal_get. Logging is the store's responsibility.
      return { proposalId, status: 'pending', tool: toolId, intent }
    }
    return { proposalId, status: 'accepted', tool: toolId, intent }
  }
}
