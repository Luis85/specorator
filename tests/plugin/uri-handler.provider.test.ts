/**
 * T-MPS-146 — `obsidian://specorator?action=open-chat&provider=...` sets the
 * agent panel's active provider selection. Invalid values are ignored.
 *
 * Tests target the pure parser `parseProviderUriValue` (the URI handler
 * closure in main.ts thinly wraps it). Coverage:
 *   - explicit `provider:mode` pairs (4 cells)
 *   - bare provider id (`claude`, `cursor`)
 *   - forced sentinels (`auto`, `degraded`)
 *   - invalid value → `null`
 *   - empty / case-insensitive handling
 *
 * Satisfies spec §9 URI handler additions.
 */
import { describe, it, expect } from 'vitest'
import { parseProviderUriValue } from '@/plugin/uriProviderParam'

describe('parseProviderUriValue — REQ-MPS-007 URI handler', () => {
  it('parses every explicit (provider, mode) cell', () => {
    expect(parseProviderUriValue('claude:api')).toEqual({
      provider: 'claude',
      mode: 'api',
    })
    expect(parseProviderUriValue('claude:cli')).toEqual({
      provider: 'claude',
      mode: 'cli',
    })
    expect(parseProviderUriValue('cursor:api')).toEqual({
      provider: 'cursor',
      mode: 'api',
    })
    expect(parseProviderUriValue('cursor:cli')).toEqual({
      provider: 'cursor',
      mode: 'cli',
    })
  })

  it('bare provider id maps to (provider, api) for downstream auto-resolution', () => {
    // Spec §9: `?provider=cursor` selects the cursor provider; the selector
    // chooses api-vs-cli based on availability. Encoding as the api cell is
    // the conservative default — callers that need the CLI must request it
    // explicitly via `cursor:cli`.
    expect(parseProviderUriValue('cursor')).toEqual({
      provider: 'cursor',
      mode: 'api',
    })
    expect(parseProviderUriValue('claude')).toEqual({
      provider: 'claude',
      mode: 'api',
    })
  })

  it('parses the forced sentinels', () => {
    expect(parseProviderUriValue('auto')).toEqual({ forced: 'auto' })
    expect(parseProviderUriValue('degraded')).toEqual({ forced: 'degraded' })
  })

  it('is case-insensitive', () => {
    expect(parseProviderUriValue('CURSOR:CLI')).toEqual({
      provider: 'cursor',
      mode: 'cli',
    })
    expect(parseProviderUriValue('  Auto  ')).toEqual({ forced: 'auto' })
  })

  it('returns null for unknown / malformed values', () => {
    expect(parseProviderUriValue('')).toBeNull()
    expect(parseProviderUriValue('openai')).toBeNull()
    expect(parseProviderUriValue('claude:rest')).toBeNull()
    expect(parseProviderUriValue(':api')).toBeNull()
    expect(parseProviderUriValue('claude:')).toBeNull()
    expect(parseProviderUriValue('a:b:c')).toBeNull()
  })
})
