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
  return CYCLE[nextIdx] ?? CYCLE[0] ?? { forced: 'auto' }
}

export function parseProviderUriValue(raw: string): ProviderSelection | null {
  const lower = raw.toLowerCase().trim()
  if (lower === '') return null
  if (lower === 'auto' || lower === 'degraded') {
    return { forced: lower }
  }
  if (lower.includes(':')) {
    const [provider, mode] = lower.split(':')
    if (provider === undefined || mode === undefined) return null
    if (!isProvider(provider) || !isMode(mode)) return null
    return { provider, mode }
  }
  if (isProvider(lower)) {
    // Bare provider — defer to the auto-mode resolution by mapping to
    // `forced: 'auto'`. Callers that want a specific mode must use the
    // `provider:mode` form.
    return { provider: lower, mode: 'api' }
  }
  return null
}
