/**
 * Domain VO tests for {@link SessionId} (SPEC-ASM-001 §2.2).
 *
 * WP-14: this file lifts coverage on `src/domain/chat/SessionId.ts` (previously
 * 0% statement coverage as a standalone file — the brand was only exercised
 * transitively via `parseChatThreadRecord`).
 *
 * Asserts:
 *   - `asSessionId` is a zero-cost brand: the returned value is `===` to the
 *     raw string at runtime (no wrapping, no allocation).
 *   - Distinct brand identity: a `SessionId` value is still a string at
 *     runtime so JSON serialisation round-trips it without special handling.
 *   - The brand is opaque: arbitrary strings cannot be assigned to a
 *     `SessionId` slot at the type level (compile-time check via
 *     `expectTypeOf`).
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { asSessionId, type SessionId } from '@/domain/chat/SessionId'

describe('asSessionId — zero-cost brand', () => {
  it('returns the exact same string reference at runtime (no wrapping)', () => {
    const raw = 'sess-abc-123'
    const branded = asSessionId(raw)
    // `===` rather than `toBe` to make the intent explicit.
    expect(branded === raw).toBe(true)
  })

  it('preserves the underlying string contents (typeof string at runtime)', () => {
    const branded = asSessionId('abc')
    expect(typeof branded).toBe('string')
    expect(String(branded)).toBe('abc')
  })

  it('accepts the empty string (validation is the caller\'s responsibility — see SPEC §3.1)', () => {
    // The brand constructor does NOT validate; the subprocess adapter is the
    // single authority on what a valid session id looks like. The codec layer
    // (`parseChatThreadRecord`) covers shape validation separately.
    const branded = asSessionId('')
    expect(branded).toBe('')
  })

  it('round-trips through JSON.stringify / JSON.parse as a plain string', () => {
    const branded = asSessionId('sess-roundtrip')
    const json = JSON.stringify({ id: branded })
    const parsed = JSON.parse(json) as { id: string }
    expect(parsed.id).toBe('sess-roundtrip')
  })
})

describe('SessionId — type-level invariants (compile-time)', () => {
  it('is structurally a string (assignable to string)', () => {
    const branded = asSessionId('s1')
    expectTypeOf<SessionId>().toExtend<string>()
    // Assignable to string at the type level (no runtime check needed).
    const asString: string = branded
    expect(asString).toBe('s1')
  })

  it('is NOT a plain string (brand prevents accidental mixing)', () => {
    // A raw string literal must not be assignable to `SessionId` — the brand
    // is unforgeable except through `asSessionId`. We assert this at the type
    // level via `expectTypeOf`: `'plain'` does NOT extend `SessionId`.
    expectTypeOf<'plain'>().not.toExtend<SessionId>()
  })

  it('asSessionId returns a SessionId-typed value', () => {
    expectTypeOf(asSessionId).returns.toEqualTypeOf<SessionId>()
    expectTypeOf(asSessionId).parameter(0).toEqualTypeOf<string>()
  })
})
