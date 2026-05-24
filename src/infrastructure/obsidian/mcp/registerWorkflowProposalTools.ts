/**
 * T-MHP-016 — `workflow_proposal_*` MCP tool registrar.
 *
 * Spec: SPEC-MHP-001..004 (list / get / accept / reject).
 * Satisfies: REQ-MHP-001..007, REQ-MHP-034..036, REQ-MHP-045(d).
 *
 * Registers four MCP tools that drive the host-side proposal queue from any
 * MCP client. The list/get tools are pure reads (no audit row). Accept/reject
 * delegate to `ProposalStore.acceptBy` / `rejectBy` under the per-id mutex
 * (SPEC-MHP-034); the audit row is written by the store before the response
 * returns. Client identity (REQ-MHP-040 `decision.by` provenance) comes from
 * the injected `McpClientIdentifier`.
 */
import { z } from 'zod'
import type { ProposalStore } from '../ProposalStore'
import type { ClientIdentity, ProposalDecision } from '@/domain/mcp/Proposal'
import { ok } from './shared'

/**
 * Minimal MCP-server surface this registrar consumes. Typed permissively so
 * the live SDK `McpServer` (whose `registerTool` is heavily generic over
 * input/output schemas) and the lightweight test stubs both match. The
 * registrar itself only invokes `registerTool(name, descriptor, handler)`.
 */
export interface WorkflowProposalToolServer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool: (name: string, descriptor: any, handler: any) => unknown
}

/** Minimal client-identifier surface (SPEC-MHP-036). */
export interface ClientIdentitySource {
  identityFor(connectionId: string): ClientIdentity
}

/**
 * The handler does not have access to a per-request connection id at this
 * shim layer (the live transport wires it; in tests the registrar still works
 * because the identifier resolves any id to the same identity). Using the
 * literal `'mcp'` keeps the call site stable until SDK exposes per-call
 * connection metadata.
 */
const DEFAULT_CONNECTION_ID = 'mcp'

/**
 * Build the decision payload for accept/reject. `client` is captured by the
 * caller (so audit-row `decision.by` provenance is correct per REQ-MHP-040);
 * the value itself is not embedded in the decision today because the store
 * already attaches the identity at `entry.client` from `ClientIdentifierSink`.
 * The parameter is retained for symmetry with SPEC-MHP-034's `(by,
 * decidingClient)` signature so a future store rewire can lift it through.
 */
function buildDecision(
  client: ClientIdentity,
  outcome: 'accepted' | 'rejected',
): ProposalDecision {
  void client
  return {
    outcome,
    by: 'client',
    rule: '',
    at: new Date().toISOString(),
  }
}

export function registerWorkflowProposalTools(
  mcp: WorkflowProposalToolServer,
  store: ProposalStore,
  clientIdentifier: ClientIdentitySource,
): void {
  // -----------------------------------------------------------------------
  // workflow_proposal_list — SPEC-MHP-001.
  // -----------------------------------------------------------------------
  mcp.registerTool(
    'workflow_proposal_list',
    {
      description:
        'List pending MCP write proposals queued by Specorator. Use this to discover proposals awaiting the user\'s accept/reject decision. This tool is for the user to drive — do not invoke it as part of an autonomous turn unless the user has asked for the pending list.',
      inputSchema: {},
    },
    async () => {
      const proposals = store.listPending()
      return ok({ proposals })
    },
  )

  // -----------------------------------------------------------------------
  // workflow_proposal_get — SPEC-MHP-002.
  // -----------------------------------------------------------------------
  mcp.registerTool(
    'workflow_proposal_get',
    {
      description:
        'Fetch the full record of a single pending or recently-decided MCP proposal by id, including the rendered tool input payload, the path list, the submitting client identifier, and (if decided) the decision metadata.',
      inputSchema: {
        proposalId: z.string().describe('The proposalId returned by a write-tool call.'),
      },
    },
    async ({ proposalId }: { proposalId: string }) => {
      // SPEC-MHP-002: returns the full domain record regardless of status.
      const entry = store.getDomain(proposalId)
      if (!entry) return ok({ error: 'proposal_not_found' })
      return ok(entry)
    },
  )

  // -----------------------------------------------------------------------
  // workflow_proposal_accept — SPEC-MHP-003.
  // -----------------------------------------------------------------------
  mcp.registerTool(
    'workflow_proposal_accept',
    {
      description:
        'Accept a pending MCP proposal by id and commit the queued vault mutation. This tool is for the user — do not call it on the user\'s behalf; the user will explicitly direct accept/reject. Returns the decision metadata on success.',
      inputSchema: {
        proposalId: z.string(),
      },
    },
    async ({ proposalId }: { proposalId: string }) => {
      const client = clientIdentifier.identityFor(DEFAULT_CONNECTION_ID)
      const decision = buildDecision(client, 'accepted')
      const result = await store.acceptBy(proposalId, decision)
      if (result.ok) {
        return ok({ ok: true, decision: result.value.decision })
      }
      const err = result.error
      if (err.code === 'already_decided') {
        return ok({ error: 'already_decided', priorDecision: err.priorDecision })
      }
      if (err.code === 'write_failed') {
        return ok({ error: 'write_failed', proposalId: err.proposalId, message: err.message })
      }
      // not_found — the store already appended an error audit row.
      return ok({ error: 'not_found' })
    },
  )

  // -----------------------------------------------------------------------
  // workflow_proposal_reject — SPEC-MHP-004.
  // -----------------------------------------------------------------------
  mcp.registerTool(
    'workflow_proposal_reject',
    {
      description:
        'Reject a pending MCP proposal by id. Discards the queued mutation; no vault file is modified. This tool is for the user — do not call it on the user\'s behalf.',
      inputSchema: {
        proposalId: z.string(),
      },
    },
    async ({ proposalId }: { proposalId: string }) => {
      const client = clientIdentifier.identityFor(DEFAULT_CONNECTION_ID)
      const decision = buildDecision(client, 'rejected')
      const result = await store.rejectBy(proposalId, decision)
      if (result.ok) {
        return ok({ ok: true, decision: result.value.decision })
      }
      const err = result.error
      if (err.code === 'already_decided') {
        return ok({ error: 'already_decided', priorDecision: err.priorDecision })
      }
      // not_found — the store already appended an error audit row.
      return ok({ error: 'not_found' })
    },
  )
}
