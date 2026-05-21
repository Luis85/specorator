/**
 * `selectTransport` — deterministic transport selector for the agent sidepanel.
 *
 * Satisfies REQ-ASM-001, REQ-ASM-002, REQ-ASM-003.
 *
 * SPEC-ASM-001 §3.1 defines the canonical 8-row truth table (first match wins).
 * This module is the single place in the codebase that branches on transport;
 * UI/plugin code consumes `TransportSelection` only and does not re-derive the
 * decision elsewhere.
 *
 * Purity invariants (SPEC-ASM-001 §3.1):
 *   - Synchronous (returns `TransportSelection`, never `Promise`).
 *   - No I/O. `deps.cliResolved` and `deps.apiKeyPresent` are consumed as
 *     plain booleans — the selector must NOT call `.isAvailable()` (or any
 *     other method) on the candidate ports at selection time, and must NOT
 *     read the API key from `SecretStorePort` (which is async).
 *
 * ADR-008: this file lives in the plugin layer but imports only domain types.
 * It must not import from `obsidian`, `child_process`, or any infrastructure
 * adapter implementation.
 */
import type { ChatTransportPort } from '@/domain/ports/ChatTransportPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { TransportKind } from '@/domain/chat/TransportKind'

/**
 * Resolved transport choice returned by `selectTransport`. The `kind` is one of
 * the three concrete transports — never literally `'auto'`, because `'auto'`
 * is resolved by the selector itself (SPEC-ASM-001 §3.1, rows R6–R8).
 */
export interface TransportSelection {
  readonly port: ChatTransportPort
  readonly kind: Exclude<TransportKind, 'auto'>
}

/**
 * Inputs the selector depends on at decision time.
 *
 * `cliResolved` is a plain boolean — the synchronous projection of
 * `subscriptionAdapter.isAvailable()`, evaluated once at plugin-wiring time
 * (see SPEC-ASM-001 §3.1 closing note). The selector never calls
 * `.isAvailable()` itself.
 *
 * `apiKeyPresent` is the synchronous projection of the
 * `SecretStorePort.getSecret(SECRET_ID_ANTHROPIC)` value cached at
 * `loadSettings()` time. Evaluated by the plugin layer per call so a key
 * saved mid-session is honoured without re-reading the keychain on the
 * selector hot path.
 */
export interface TransportSelectorDeps {
  readonly sdkAdapter: ChatTransportPort
  readonly subscriptionAdapter: ChatTransportPort
  readonly degradedPort: ChatTransportPort
  readonly cliResolved: boolean
  readonly apiKeyPresent: boolean
}

export type TransportSelectorFn = (
  settings: PluginSettings,
  deps: TransportSelectorDeps,
) => TransportSelection

/**
 * SPEC-ASM-001 §3.1 truth table (8 rows, first-match-wins).
 *
 * | Row | transportKind   | apiKeyPresent | cliResolved | Result                              |
 * |-----|-----------------|---------------|-------------|-------------------------------------|
 * | R1  | 'degraded'      | *             | *           | { degradedPort,        'degraded'  }|
 * | R2  | 'api-key'       | true          | *           | { sdkAdapter,          'api-key'   }|
 * | R3  | 'api-key'       | false         | *           | { degradedPort,        'degraded'  }|
 * | R4  | 'subscription'  | *             | true        | { subscriptionAdapter, 'subscription'}|
 * | R5  | 'subscription'  | *             | false       | { degradedPort,        'degraded'  }|
 * | R6  | 'auto'          | true          | *           | { sdkAdapter,          'api-key'   }|
 * | R7  | 'auto'          | false         | true        | { subscriptionAdapter, 'subscription'}|
 * | R8  | 'auto'          | false         | false       | { degradedPort,        'degraded'  }|
 */
export const selectTransport: TransportSelectorFn = (settings, deps) => {
  const { transportKind } = settings
  const { sdkAdapter, subscriptionAdapter, degradedPort, cliResolved, apiKeyPresent } = deps

  // R1 — explicit 'degraded' overrides everything.
  if (transportKind === 'degraded') {
    return { port: degradedPort, kind: 'degraded' }
  }

  // R2 / R3 — explicit 'api-key'.
  if (transportKind === 'api-key') {
    return apiKeyPresent
      ? { port: sdkAdapter, kind: 'api-key' }
      : { port: degradedPort, kind: 'degraded' }
  }

  // R4 / R5 — explicit 'subscription'.
  if (transportKind === 'subscription') {
    return cliResolved
      ? { port: subscriptionAdapter, kind: 'subscription' }
      : { port: degradedPort, kind: 'degraded' }
  }

  // R6 / R7 / R8 — 'auto'. api-key beats subscription; degraded is the floor.
  if (apiKeyPresent) {
    return { port: sdkAdapter, kind: 'api-key' }
  }
  if (cliResolved) {
    return { port: subscriptionAdapter, kind: 'subscription' }
  }
  return { port: degradedPort, kind: 'degraded' }
}
