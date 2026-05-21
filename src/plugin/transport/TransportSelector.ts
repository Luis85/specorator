/**
 * `selectTransport` — deterministic provider×mode router for the agent
 * sidepanel.
 *
 * Satisfies REQ-MPS-007, REQ-MPS-008, REQ-MPS-012, REQ-MPS-014.
 *
 * SPEC-MPS-001 §4 / design §C4 define the canonical 15-row truth table
 * (first match wins). This module is the single place in the codebase that
 * branches on (provider, mode); UI / plugin code consumes
 * `TransportResolution` only and does not re-derive the decision elsewhere.
 *
 * Purity invariants (SPEC-MPS-001 §4):
 *   - Synchronous (returns `TransportResolution`, never `Promise`).
 *   - No I/O. Every `availability.*` flag is a plain boolean projected by the
 *     plugin layer at wiring time / after `bumpSettingsVersion()`. The
 *     selector must NEVER call `.isAvailable()` on a candidate port and must
 *     NEVER reach into `SecretStorePort` (which is async).
 *
 * ADR-008: this file lives in the plugin layer but imports only domain types
 * (`ChatTransportPort`, `ProviderSelection`, `ProviderId`, `ProviderMode`).
 * It must not import from `obsidian`, `child_process`, or any infrastructure
 * adapter implementation.
 */
import type { ChatTransportPort } from '@/domain/ports/ChatTransportPort'
import type {
  ExplicitSelection,
  ProviderId,
  ProviderSelection,
} from '@/domain/chat/ProviderSelection'
import { isExplicit } from '@/domain/chat/ProviderSelection'

/**
 * Inputs the selector consumes at decision time.
 *
 * Every availability flag is a synchronous projection of an async source
 * (binary resolver, secret-store probe, settings toggle). Projecting them
 * once at the plugin layer keeps `selectTransport` synchronous and lets the
 * UI re-evaluate after `bumpSettingsVersion()` without ever touching the
 * keychain on the selector hot path.
 */
export interface ProviderRouterDeps {
  readonly providers: {
    readonly claude: { readonly api: ChatTransportPort; readonly cli: ChatTransportPort }
    readonly cursor: { readonly api: ChatTransportPort; readonly cli: ChatTransportPort }
  }
  readonly degradedPort: ChatTransportPort
  readonly availability: {
    readonly claudeApiKeyPresent: boolean
    readonly claudeCliResolved: boolean
    readonly cursorApiKeyPresent: boolean
    readonly cursorCliResolved: boolean
    /** REQ-MPS-014 — Cursor API path gated behind the preview flag. */
    readonly cursorApiPreviewEnabled: boolean
    /** Gates Cursor api on hosts lacking `App.secretStorage` (mobile / pre-1.11.4). */
    readonly secretStoreAvailable: boolean
  }
  /** REQ-MPS-008 — preferred provider when `forced: 'auto'` resolves a tie. */
  readonly autoPreferProvider: ProviderId
}

/**
 * Resolved transport choice returned by `selectTransport`. `resolved` is
 * either the concrete (provider, mode) cell or the literal `'degraded'`
 * sentinel — never `'auto'`, because `'auto'` is resolved by the selector
 * itself (rows R10–R15).
 */
export type TransportResolution =
  | { readonly resolved: ExplicitSelection; readonly port: ChatTransportPort }
  | { readonly resolved: 'degraded'; readonly port: ChatTransportPort }

/**
 * SPEC-MPS-001 §4 / design §C4 truth table (15 rows, first-match-wins).
 *
 *   | #   | selection                              | Conditions                                                                         | Resolution |
 *   |-----|----------------------------------------|------------------------------------------------------------------------------------|------------|
 *   | R1  | { forced: 'degraded' }                 | *                                                                                  | degraded   |
 *   | R2  | { provider: 'claude', mode: 'api' }    | claudeApiKeyPresent                                                                | claude/api |
 *   | R3  | { provider: 'claude', mode: 'api' }    | !claudeApiKeyPresent                                                               | degraded   |
 *   | R4  | { provider: 'claude', mode: 'cli' }    | claudeCliResolved                                                                  | claude/cli |
 *   | R5  | { provider: 'claude', mode: 'cli' }    | !claudeCliResolved                                                                 | degraded   |
 *   | R6  | { provider: 'cursor', mode: 'api' }    | secretStoreAvailable && cursorApiKeyPresent && cursorApiPreviewEnabled             | cursor/api |
 *   | R7  | { provider: 'cursor', mode: 'api' }    | otherwise                                                                          | degraded   |
 *   | R8  | { provider: 'cursor', mode: 'cli' }    | cursorCliResolved                                                                  | cursor/cli |
 *   | R9  | { provider: 'cursor', mode: 'cli' }    | !cursorCliResolved                                                                 | degraded   |
 *   | R10 | { forced: 'auto' }                     | claudeApiKeyPresent && autoPreferProvider === 'claude'                             | claude/api |
 *   | R11 | { forced: 'auto' }                     | cursorApiKeyPresent && cursorApiPreviewEnabled && autoPreferProvider === 'cursor'  | cursor/api |
 *   | R12 | { forced: 'auto' }                     | claudeApiKeyPresent                                                                | claude/api |
 *   | R13 | { forced: 'auto' }                     | claudeCliResolved                                                                  | claude/cli |
 *   | R14 | { forced: 'auto' }                     | cursorCliResolved                                                                  | cursor/cli |
 *   | R15 | { forced: 'auto' }                     | otherwise                                                                          | degraded   |
 */
export function selectTransport(
  selection: ProviderSelection,
  deps: ProviderRouterDeps,
): TransportResolution {
  if (isExplicit(selection)) {
    return resolveExplicit(selection, deps)
  }
  // Forced sentinel — 'degraded' short-circuits; 'auto' walks the precedence
  // chain.
  return selection.forced === 'degraded'
    ? { resolved: 'degraded', port: deps.degradedPort }
    : resolveAuto(deps)
}

/**
 * Per-cell availability predicate for the four explicit (provider, mode)
 * cells. Returns `true` when the cell's adapter should be selected, `false`
 * when the selection collapses to the degraded floor.
 */
function isCellAvailable(
  cellKey: string,
  availability: ProviderRouterDeps['availability'],
): boolean {
  if (cellKey === 'claude:api') return availability.claudeApiKeyPresent
  if (cellKey === 'claude:cli') return availability.claudeCliResolved
  if (cellKey === 'cursor:api') {
    return (
      availability.secretStoreAvailable
      && availability.cursorApiKeyPresent
      && availability.cursorApiPreviewEnabled
    )
  }
  return availability.cursorCliResolved
}

/**
 * R2..R9 — explicit (provider, mode) cell. Each cell has exactly one
 * availability predicate; falls through to `degraded` otherwise.
 */
function resolveExplicit(
  selection: { readonly provider: ProviderId; readonly mode: 'api' | 'cli' },
  deps: ProviderRouterDeps,
): TransportResolution {
  const cellKey = `${selection.provider}:${selection.mode}`
  if (!isCellAvailable(cellKey, deps.availability)) {
    return { resolved: 'degraded', port: deps.degradedPort }
  }
  const port = deps.providers[selection.provider][selection.mode]
  return { resolved: { provider: selection.provider, mode: selection.mode }, port }
}

/**
 * R10..R15 — `forced: 'auto'` precedence walk. Order matters and matches
 * the canonical table:
 *   1. prefer-claude w/ claude API key
 *   2. prefer-cursor w/ cursor API key + preview enabled
 *   3. claude API key (any prefer)
 *   4. claude CLI
 *   5. cursor CLI
 *   6. degraded floor
 */
function resolveAuto(deps: ProviderRouterDeps): TransportResolution {
  const { providers, degradedPort, availability, autoPreferProvider } = deps
  if (availability.claudeApiKeyPresent && autoPreferProvider === 'claude') {
    return { resolved: { provider: 'claude', mode: 'api' }, port: providers.claude.api }
  }
  if (
    availability.cursorApiKeyPresent
    && availability.cursorApiPreviewEnabled
    && autoPreferProvider === 'cursor'
  ) {
    return { resolved: { provider: 'cursor', mode: 'api' }, port: providers.cursor.api }
  }
  if (availability.claudeApiKeyPresent) {
    return { resolved: { provider: 'claude', mode: 'api' }, port: providers.claude.api }
  }
  if (availability.claudeCliResolved) {
    return { resolved: { provider: 'claude', mode: 'cli' }, port: providers.claude.cli }
  }
  if (availability.cursorCliResolved) {
    return { resolved: { provider: 'cursor', mode: 'cli' }, port: providers.cursor.cli }
  }
  return { resolved: 'degraded', port: degradedPort }
}
