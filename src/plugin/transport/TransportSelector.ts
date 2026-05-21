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
  const { providers, degradedPort, availability, autoPreferProvider } = deps
  const {
    claudeApiKeyPresent,
    claudeCliResolved,
    cursorApiKeyPresent,
    cursorCliResolved,
    cursorApiPreviewEnabled,
    secretStoreAvailable,
  } = availability

  // R1 — forced 'degraded' wins over every availability flag.
  if (!isExplicit(selection) && selection.forced === 'degraded') {
    return { resolved: 'degraded', port: degradedPort }
  }

  if (isExplicit(selection)) {
    // R2 / R3 — explicit claude/api.
    if (selection.provider === 'claude' && selection.mode === 'api') {
      return claudeApiKeyPresent
        ? { resolved: { provider: 'claude', mode: 'api' }, port: providers.claude.api }
        : { resolved: 'degraded', port: degradedPort }
    }
    // R4 / R5 — explicit claude/cli.
    if (selection.provider === 'claude' && selection.mode === 'cli') {
      return claudeCliResolved
        ? { resolved: { provider: 'claude', mode: 'cli' }, port: providers.claude.cli }
        : { resolved: 'degraded', port: degradedPort }
    }
    // R6 / R7 — explicit cursor/api gated by the preview flag + secret store.
    if (selection.provider === 'cursor' && selection.mode === 'api') {
      return secretStoreAvailable && cursorApiKeyPresent && cursorApiPreviewEnabled
        ? { resolved: { provider: 'cursor', mode: 'api' }, port: providers.cursor.api }
        : { resolved: 'degraded', port: degradedPort }
    }
    // R8 / R9 — explicit cursor/cli.
    if (selection.provider === 'cursor' && selection.mode === 'cli') {
      return cursorCliResolved
        ? { resolved: { provider: 'cursor', mode: 'cli' }, port: providers.cursor.cli }
        : { resolved: 'degraded', port: degradedPort }
    }
  }

  // R10..R15 — 'auto' resolution. Order matters: prefer-provider rows fire
  // first, then the api-beats-cli fallback chain. Cursor API rows respect the
  // preview flag (REQ-MPS-014).
  // R10 — prefer claude, claude API key present.
  if (claudeApiKeyPresent && autoPreferProvider === 'claude') {
    return { resolved: { provider: 'claude', mode: 'api' }, port: providers.claude.api }
  }
  // R11 — prefer cursor, cursor API key + preview enabled.
  if (cursorApiKeyPresent && cursorApiPreviewEnabled && autoPreferProvider === 'cursor') {
    return { resolved: { provider: 'cursor', mode: 'api' }, port: providers.cursor.api }
  }
  // R12 — claude API key present (any prefer).
  if (claudeApiKeyPresent) {
    return { resolved: { provider: 'claude', mode: 'api' }, port: providers.claude.api }
  }
  // R13 — claude CLI resolved.
  if (claudeCliResolved) {
    return { resolved: { provider: 'claude', mode: 'cli' }, port: providers.claude.cli }
  }
  // R14 — cursor CLI resolved.
  if (cursorCliResolved) {
    return { resolved: { provider: 'cursor', mode: 'cli' }, port: providers.cursor.cli }
  }
  // R15 — floor: nothing available.
  return { resolved: 'degraded', port: degradedPort }
}
