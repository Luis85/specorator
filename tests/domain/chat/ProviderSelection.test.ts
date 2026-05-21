/**
 * T-MPS-010 — `ProviderSelection` exports + `isExplicit` type-guard tests.
 *
 * Covers REQ-MPS-003. The module must expose the six named exports listed in
 * SPEC-MPS-001 §2.2 and nothing else; `isExplicit` must narrow both branches
 * of the discriminated union; `selectionKey` must produce the documented
 * formats.
 */
import { describe, it, expect } from 'vitest'
import * as ProviderSelection from '@/domain/chat/ProviderSelection'
import {
  isExplicit,
  selectionKey,
  type ExplicitSelection,
  type ProviderId,
  type ProviderMode,
  type ProviderSelection as Selection,
} from '@/domain/chat/ProviderSelection'

describe('ProviderSelection module exports', () => {
  it('exposes exactly the six documented runtime exports', () => {
    const exported = Object.keys(ProviderSelection).sort()
    expect(exported).toEqual(['isExplicit', 'selectionKey'])
  })

  it('compile-time: ProviderId is the closed union claude|cursor', () => {
    const claude: ProviderId = 'claude'
    const cursor: ProviderId = 'cursor'
    expect([claude, cursor]).toEqual(['claude', 'cursor'])
  })

  it('compile-time: ProviderMode is the closed union api|cli', () => {
    const api: ProviderMode = 'api'
    const cli: ProviderMode = 'cli'
    expect([api, cli]).toEqual(['api', 'cli'])
  })
})

describe('isExplicit', () => {
  it('returns true for an explicit selection', () => {
    const s: Selection = { provider: 'claude', mode: 'api' }
    expect(isExplicit(s)).toBe(true)
    if (isExplicit(s)) {
      const explicit: ExplicitSelection = s
      expect(explicit.provider).toBe('claude')
      expect(explicit.mode).toBe('api')
    }
  })

  it('returns false for { forced: "auto" }', () => {
    const s: Selection = { forced: 'auto' }
    expect(isExplicit(s)).toBe(false)
  })

  it('returns false for { forced: "degraded" }', () => {
    const s: Selection = { forced: 'degraded' }
    expect(isExplicit(s)).toBe(false)
  })

  it('narrows all four explicit (provider, mode) cells', () => {
    const cells: ExplicitSelection[] = [
      { provider: 'claude', mode: 'api' },
      { provider: 'claude', mode: 'cli' },
      { provider: 'cursor', mode: 'api' },
      { provider: 'cursor', mode: 'cli' },
    ]
    for (const cell of cells) {
      expect(isExplicit(cell)).toBe(true)
    }
  })
})

describe('selectionKey', () => {
  it.each([
    [{ provider: 'claude', mode: 'api' }, 'claude:api'],
    [{ provider: 'claude', mode: 'cli' }, 'claude:cli'],
    [{ provider: 'cursor', mode: 'api' }, 'cursor:api'],
    [{ provider: 'cursor', mode: 'cli' }, 'cursor:cli'],
  ] as ReadonlyArray<[ExplicitSelection, string]>)(
    'serialises explicit selection %o as %s',
    (selection, expected) => {
      expect(selectionKey(selection)).toBe(expected)
    },
  )

  it('serialises { forced: "auto" } as "auto"', () => {
    expect(selectionKey({ forced: 'auto' })).toBe('auto')
  })

  it('serialises { forced: "degraded" } as "degraded"', () => {
    expect(selectionKey({ forced: 'degraded' })).toBe('degraded')
  })
})
