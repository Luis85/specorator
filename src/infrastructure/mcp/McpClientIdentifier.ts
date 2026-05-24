/**
 * T-MHP-005 — `McpClientIdentifier` per-connection identity capture.
 *
 * Spec: SPEC-MHP-036.
 * Satisfies: REQ-MHP-034, REQ-MHP-035; covers EC-MHP-009/-010/-011.
 *
 * Stashes the per-connection identity using `clientInfo.name` from the MCP
 * `initialize` handshake. Captured exactly once per connection. Missing,
 * empty (after trim), or non-string names normalise to `'unknown'`. Names
 * are trimmed and truncated to 128 chars before storage.
 */
import type { ClientIdentity } from '@/domain/mcp/Proposal'

const MAX_ID_LENGTH = 128
const UNKNOWN_ID = 'unknown'

interface InitializeParams {
  readonly connectionId: string
  readonly clientInfo?: unknown
  readonly transport?: 'loopback' | 'in-process'
  readonly address?: string
}

type InitializeHandler = (params: InitializeParams) => void

/**
 * Minimal MCP server seam the identifier needs. The real
 * `ObsidianMcpServerAdapter` (and the in-process sidepanel) exposes
 * `onInitialize` to register a callback; the integration wiring lands in
 * a later task. Typed loosely here to keep the identifier framework-free.
 */
interface InitializeHookHost {
  onInitialize(handler: InitializeHandler): void
}

function normaliseClientName(raw: unknown): string {
  if (typeof raw !== 'string') return UNKNOWN_ID
  const trimmed = raw.trim()
  if (trimmed === '') return UNKNOWN_ID
  return trimmed.length > MAX_ID_LENGTH ? trimmed.slice(0, MAX_ID_LENGTH) : trimmed
}

function extractClientName(clientInfo: unknown): unknown {
  if (clientInfo === null || typeof clientInfo !== 'object') return undefined
  return (clientInfo as { name?: unknown }).name
}

export class McpClientIdentifier {
  readonly #identities = new Map<string, ClientIdentity>()

  attachInitializeHook(server: InitializeHookHost): void {
    server.onInitialize((params) => {
      const name = extractClientName(params.clientInfo)
      const id = normaliseClientName(name)
      const transport = params.transport ?? 'loopback'
      const address = params.address ?? ''
      this.#identities.set(params.connectionId, { id, transport, address })
    })
  }

  identityFor(connectionId: string): ClientIdentity {
    const known = this.#identities.get(connectionId)
    if (known) return known
    return { id: UNKNOWN_ID, transport: 'loopback', address: '' }
  }
}
