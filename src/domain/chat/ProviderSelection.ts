/**
 * `ProviderSelection` — the user-facing transport-intent discriminator.
 *
 * Satisfies REQ-MPS-003. Per ADR-MPS-002 / SPEC-MPS-001 §2.2 the selection is
 * modelled as a discriminated union over two orthogonal axes
 * (`provider`, `mode`) plus a closed two-member "forced" sentinel
 * (`'auto'`, `'degraded'`). See `TransportSelector` (WS-3) for how the
 * selection is resolved to a concrete `ChatTransportPort` at runtime.
 *
 * Domain layer (ADR-008): no `obsidian` / `child_process` imports.
 */

/** Closed set of supported chat providers. */
export type ProviderId = 'claude' | 'cursor'

/** Closed set of execution surfaces per provider. */
export type ProviderMode = 'api' | 'cli'

/**
 * Explicit user choice: a specific (provider, mode) cell. There are four
 * such cells in v1: claude/api, claude/cli, cursor/api, cursor/cli.
 */
export interface ExplicitSelection {
  readonly provider: ProviderId
  readonly mode: ProviderMode
}

/**
 * Either an explicit (provider, mode) selection or a forced sentinel:
 *  - `'auto'` defers to the selector's precedence rules (spec §4 row group
 *    `auto`); resolved synchronously by `selectTransport` using the
 *    availability projection passed in `deps`.
 *  - `'degraded'` forces the no-op transport (REQ-MPS-007 row R15).
 */
export type ProviderSelection =
  | ExplicitSelection
  | { readonly forced: 'auto' | 'degraded' }

/**
 * Discriminator type-guard. Narrows `ProviderSelection` to `ExplicitSelection`
 * by probing the `provider` field's presence. Forced sentinels carry only a
 * `forced` field so this check is exhaustive and side-effect-free.
 */
export function isExplicit(s: ProviderSelection): s is ExplicitSelection {
  return 'provider' in s
}

/**
 * Stable string key for a selection. Used to address per-(provider, mode)
 * adapters in `ProviderRegistry` lookups and for telemetry tags. Explicit
 * selections serialise as `"<provider>:<mode>"`; forced sentinels serialise
 * to their `forced` value verbatim.
 */
export function selectionKey(s: ProviderSelection): string {
  return isExplicit(s) ? `${s.provider}:${s.mode}` : s.forced
}
