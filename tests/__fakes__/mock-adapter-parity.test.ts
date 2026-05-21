/**
 * T-MPS-150 / NFR-MPS-014 — structural parity across all mock adapters.
 *
 * Mock adapters fan out per (provider, mode) cell but must share the same
 * configuration surface so a test that exercises one adapter can be ported
 * to another by swapping the constructor. Required surface:
 *   - `setAvailability(value: boolean): this`
 *   - `setError(error: ChatTransportError | null): this`
 *   - `setNextDelta(deltas: ReadonlyArray<StreamDelta>): this`
 *   - public field `cannedResponse: string`
 *   - public field `delayMs: number`
 *   - public field `queryLog: string[]`
 *   - implements `ChatTransportPort` (queryStream / isAvailable)
 */
import { describe, it, expect } from 'vitest'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { MockCursorApiAdapter } from '@/infrastructure/mock/MockCursorApiAdapter'
import { MockCursorCliAdapter } from '@/infrastructure/mock/MockCursorCliAdapter'

const REQUIRED_FIELDS = ['cannedResponse', 'delayMs', 'queryLog'] as const
const REQUIRED_METHODS = [
  'setAvailability',
  'setError',
  'setNextDelta',
  'queryStream',
  'isAvailable',
] as const

type Ctor<T> = new (...args: never[]) => T

function assertSurface(name: string, ctor: Ctor<unknown>): void {
  describe(`NFR-MPS-014 — ${name}`, () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new (ctor as any)()

    it.each(REQUIRED_FIELDS)(`exposes public field '%s'`, (field) => {
      expect(
        instance[field],
        `${name} missing required field '${String(field)}'`,
      ).not.toBeUndefined()
    })

    it.each(REQUIRED_METHODS)(`exposes method '%s'`, (method) => {
      expect(
        typeof instance[method],
        `${name} missing method '${String(method)}'`,
      ).toBe('function')
    })

    it(`setAvailability returns 'this' for fluent chaining`, () => {
      expect(instance.setAvailability(true)).toBe(instance)
    })

    it(`setError(null) clears the error and returns 'this'`, () => {
      expect(instance.setError(null)).toBe(instance)
    })
  })
}

assertSurface('MockClaudeCliPort', MockClaudeCliPort)
assertSurface('MockClaudeSubprocessAdapter', MockClaudeSubprocessAdapter)
assertSurface('MockCursorApiAdapter', MockCursorApiAdapter)
assertSurface('MockCursorCliAdapter', MockCursorCliAdapter)
