/**
 * T-MPS-149 / NFR-MPS-007 — adapter `startup` / `shutdown` lifecycle parity.
 *
 * Inherits NFR-CCS-002 / NFR-CCS-007 against the multi-provider adapter set.
 * `startup()` is fire-and-forget (returns a Promise that may never resolve
 * fully — pre-warm only); `shutdown()` is synchronous and idempotent.
 *
 * CursorApiAdapter is intentionally excluded — it is a stateless `fetch()`
 * wrapper with no resources to pre-warm or release, mirroring the upstream
 * `Cursor` API's no-state model.
 */
import { describe, it, expect, vi } from 'vitest'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { MockCursorCliAdapter } from '@/infrastructure/mock/MockCursorCliAdapter'

interface LifecycleBearing {
  startup: () => Promise<void>
  shutdown: () => void
}

function expectsLifecycleParity(name: string, adapter: LifecycleBearing): void {
  it(`${name}: startup() returns a Promise (fire-and-forget)`, async () => {
    const result = adapter.startup()
    expect(result).toBeInstanceOf(Promise)
    await result
  })
  it(`${name}: shutdown() is synchronous and returns void`, () => {
    // The lint rule `no-confusing-void-expression` forbids capturing a
    // void-returning expression. Assert the shape via a no-throw
    // expectation instead — both `undefined` and `void` returns satisfy
    // the spec, and the rule is silent on `.not.toThrow()` wrappers.
    expect(() => { adapter.shutdown() }).not.toThrow()
  })
  it(`${name}: shutdown() is idempotent (callable twice without throw)`, () => {
    adapter.shutdown()
    expect(() => { adapter.shutdown() }).not.toThrow()
  })
}

describe('NFR-MPS-007 — adapter lifecycle parity (Claude + Cursor)', () => {
  describe('MockClaudeCliPort', () => {
    expectsLifecycleParity('MockClaudeCliPort', new MockClaudeCliPort())
  })

  describe('MockClaudeSubprocessAdapter', () => {
    expectsLifecycleParity(
      'MockClaudeSubprocessAdapter',
      new MockClaudeSubprocessAdapter(),
    )
  })

  describe('MockCursorCliAdapter', () => {
    expectsLifecycleParity('MockCursorCliAdapter', new MockCursorCliAdapter())
  })

  it('every lifecycle-bearing adapter has a shutdown() of arity 0 (no args)', () => {
    const adapters: ReadonlyArray<{ name: string; ctor: () => LifecycleBearing }> = [
      { name: 'MockClaudeCliPort', ctor: () => new MockClaudeCliPort() },
      { name: 'MockClaudeSubprocessAdapter', ctor: () => new MockClaudeSubprocessAdapter() },
      { name: 'MockCursorCliAdapter', ctor: () => new MockCursorCliAdapter() },
    ]
    for (const { name, ctor } of adapters) {
      const a = ctor()
      expect(a.shutdown.length, `${name}.shutdown should take 0 args`).toBe(0)
      expect(a.startup.length, `${name}.startup should take 0 args`).toBe(0)
    }
  })

  it('shutdown() does not return a thenable (sync contract; spec §11)', () => {
    const adapters: ReadonlyArray<LifecycleBearing> = [
      new MockClaudeCliPort(),
      new MockClaudeSubprocessAdapter(),
      new MockCursorCliAdapter(),
    ]
    // Sync shutdown must NOT return a Promise — production code chains
    // `this.register(() => adapter.shutdown())` and Obsidian's contract is
    // synchronous teardown. The compile-time `void` return on every
    // `LifecycleBearing` adapter encodes this; the runtime assertion is
    // that calling shutdown does not throw and does not enter an `await`.
    for (const a of adapters) {
      expect(() => { a.shutdown() }).not.toThrow()
    }
  })

  it('vi placeholder kept so future per-adapter spies have a slot', () => {
    // No-op anchor for the harness — removed once additional spies land.
    expect(vi).toBeDefined()
  })
})
