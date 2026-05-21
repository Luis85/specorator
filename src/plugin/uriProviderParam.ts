/**
 * WS-10 (T-MPS-146) — pure parser for the `?provider=` query param of the
 * `obsidian://specorator` URI.
 *
 * Accepted values:
 *   - `"claude"` / `"cursor"` — collapse to the auto-mode for that provider
 *     (selector resolves api-vs-cli based on availability projection).
 *   - `"claude:api" | "claude:cli" | "cursor:api" | "cursor:cli"` — explicit
 *     (provider, mode) cell.
 *   - `"auto"` / `"degraded"` — forced sentinels (REQ-MPS-007 row R15 and
 *     the auto-precedence group).
 *
 * Invalid or unknown values resolve to `null` so the URI handler can fall
 * through silently per spec §9.
 *
 * Pure module: no Pinia / Vue / Obsidian imports. Mirrors the
 * `ProviderSelection` union from `@/domain/chat/ProviderSelection`.
 */
import type {
  ProviderId,
  ProviderMode,
  ProviderSelection,
} from '@/domain/chat/ProviderSelection'

const PROVIDERS: ReadonlySet<ProviderId> = new Set(['claude', 'cursor'])
const MODES: ReadonlySet<ProviderMode> = new Set(['api', 'cli'])

function isProvider(s: string): s is ProviderId {
  return PROVIDERS.has(s as ProviderId)
}

function isMode(s: string): s is ProviderMode {
  return MODES.has(s as ProviderMode)
}

/**
 * T-MPS-147 — closed-cycle iteration over the six possible selections.
 * Used by the `specorator:switch-provider` command palette entry. Pure.
 */
const CYCLE: ReadonlyArray<ProviderSelection> = [
  { forced: 'auto' },
  { provider: 'claude', mode: 'api' },
  { provider: 'claude', mode: 'cli' },
  { provider: 'cursor', mode: 'api' },
  { provider: 'cursor', mode: 'cli' },
  { forced: 'degraded' },
]

function keyOf(s: ProviderSelection): string {
  return 'forced' in s ? s.forced : `${s.provider}:${s.mode}`
}

export function nextProviderSelection(current: ProviderSelection): ProviderSelection {
  const key = keyOf(current)
  const i = CYCLE.findIndex((c) => keyOf(c) === key)
  // -1 (unknown) wraps to the first entry — defensive against a forced
  // value the cycle does not enumerate (none today; future-proof).
  const nextIdx = (i + 1) % CYCLE.length
  // `CYCLE` has 6 entries and `nextIdx` is always within bounds; the
  // index access is safe because the closed list is built above.
  return CYCLE[nextIdx]
}

function parseExplicitPair(lower: string): ProviderSelection | null {
  const parts = lower.split(':')
  if (parts.length !== 2) return null
  const [provider, mode] = parts as [string, string]
  if (provider === '' || mode === '') return null
  if (!isProvider(provider) || !isMode(mode)) return null
  return { provider, mode }
}

export function parseProviderUriValue(raw: string): ProviderSelection | null {
  const lower = raw.toLowerCase().trim()
  if (lower === '') return null
  if (lower === 'auto' || lower === 'degraded') return { forced: lower }
  if (lower.includes(':')) return parseExplicitPair(lower)
  // Bare provider — map to the api cell. Callers that want CLI must use
  // the `provider:mode` form.
  if (isProvider(lower)) return { provider: lower, mode: 'api' }
  return null
}
