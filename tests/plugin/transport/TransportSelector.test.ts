/**
 * T-ASM-004 — Tests for selectTransport() 8-row truth table.
 *
 * Satisfies: REQ-ASM-002, REQ-ASM-003.
 * Maps to: TEST-ASM-001, TEST-ASM-002, TEST-ASM-003.
 *
 * SPEC-ASM-001 §3.1 defines the deterministic decision table (first match wins):
 *
 *   | Row | transportKind   | apiKeyPresent | cliResolved | Result                                             |
 *   |-----|-----------------|---------------|-------------|----------------------------------------------------|
 *   | R1  | 'degraded'      | *             | *           | { port: degradedPort,        kind: 'degraded'    } |
 *   | R2  | 'api-key'       | true          | *           | { port: sdkAdapter,          kind: 'api-key'     } |
 *   | R3  | 'api-key'       | false         | *           | { port: degradedPort,        kind: 'degraded'    } |
 *   | R4  | 'subscription'  | *             | true        | { port: subscriptionAdapter, kind: 'subscription'} |
 *   | R5  | 'subscription'  | *             | false       | { port: degradedPort,        kind: 'degraded'    } |
 *   | R6  | 'auto'          | true          | *           | { port: sdkAdapter,          kind: 'api-key'     } |
 *   | R7  | 'auto'          | false         | true        | { port: subscriptionAdapter, kind: 'subscription'} |
 *   | R8  | 'auto'          | false         | false       | { port: degradedPort,        kind: 'degraded'    } |
 *
 * Per spec §3.1, the selector is synchronous and performs no I/O. Both
 * `cliResolved` AND `apiKeyPresent` are consumed as plain booleans — the
 * selector does not call `.isAvailable()` on `deps.subscriptionAdapter`,
 * and does not reach into `SecretStorePort` (which is async).
 */
import { describe, it, expect } from 'vitest'

import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import type { ClaudeCliPort } from '@/domain/ports/ClaudeCliPort'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { TransportKind } from '@/domain/chat/TransportKind'

import {
  selectTransport,
  type TransportSelection,
  type TransportSelectorDeps,
} from '@/plugin/transport/TransportSelector'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function makeSettings(overrides: Partial<PluginSettings>): PluginSettings {
  return {
    ...DEFAULT_SETTINGS,
    transportKind: 'auto',
    ...overrides,
  }
}

/**
 * Hand-rolled mock ClaudeCliPort. Calling any method during selection would
 * indicate the selector performed I/O (forbidden by spec §3.1).
 */
function makeMockPort(label: string): ClaudeCliPort {
  return {
    isAvailable: () => {
      throw new Error(
        `mock port "${label}" .isAvailable() must not be called by selectTransport`,
      )
    },
    queryStream: () => {
      throw new Error(
        `mock port "${label}" .queryStream() must not be called by selectTransport`,
      )
    },
  }
}

function makeDeps(overrides?: Partial<TransportSelectorDeps>): TransportSelectorDeps {
  const sdkAdapter = makeMockPort('sdkAdapter')
  const subscriptionAdapter = makeMockPort('subscriptionAdapter')
  return {
    sdkAdapter,
    subscriptionAdapter,
    degradedPort: degradedClaudeCliPort,
    cliResolved: false,
    apiKeyPresent: false,
    ...overrides,
  }
}

// -----------------------------------------------------------------------------
// Truth-table rows R1–R8 (spec §3.1)
// -----------------------------------------------------------------------------

describe('REQ-ASM-002 / REQ-ASM-003: selectTransport() — SPEC-ASM-001 §3.1 truth table', () => {
  it("R1 — transportKind='degraded' (api-key empty, cli unresolved) → degraded", () => {
    const settings = makeSettings({ transportKind: 'degraded' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: false })

    const selection: TransportSelection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R1 — transportKind='degraded' wins regardless of api-key/cliResolved values", () => {
    const settings = makeSettings({ transportKind: 'degraded' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R2 — transportKind='api-key' + api-key present → api-key (sdkAdapter)", () => {
    const settings = makeSettings({ transportKind: 'api-key' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'api-key', port: deps.sdkAdapter }),
    )
  })

  it("R2 — transportKind='api-key' + api-key present is independent of cliResolved", () => {
    const settings = makeSettings({ transportKind: 'api-key' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('api-key')
    expect(selection.port).toBe(deps.sdkAdapter)
  })

  it("R3 — transportKind='api-key' + empty api-key → degraded", () => {
    const settings = makeSettings({ transportKind: 'api-key' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R3 — transportKind='api-key' + apiKeyPresent=false → degraded even with cliResolved=true", () => {
    const settings = makeSettings({ transportKind: 'api-key' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R4 — transportKind='subscription' + cliResolved=true → subscription (subscriptionAdapter)", () => {
    const settings = makeSettings({ transportKind: 'subscription' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'subscription', port: deps.subscriptionAdapter }),
    )
  })

  it("R4 — transportKind='subscription' + cliResolved=true is independent of api-key presence", () => {
    const settings = makeSettings({ transportKind: 'subscription' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('subscription')
    expect(selection.port).toBe(deps.subscriptionAdapter)
  })

  it("R5 — transportKind='subscription' + cliResolved=false → degraded", () => {
    const settings = makeSettings({ transportKind: 'subscription' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R5 — transportKind='subscription' + cliResolved=false ignores a present api-key", () => {
    const settings = makeSettings({ transportKind: 'subscription' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R6 — transportKind='auto' + api-key present → api-key (sdkAdapter) — TEST-ASM-001", () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'api-key', port: deps.sdkAdapter }),
    )
  })

  it("R6 — transportKind='auto' + api-key present beats cliResolved=true (api-key precedes subscription in auto)", () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('api-key')
    expect(selection.port).toBe(deps.sdkAdapter)
  })

  it("R7 — transportKind='auto' + empty api-key + cliResolved=true → subscription — TEST-ASM-002", () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'subscription', port: deps.subscriptionAdapter }),
    )
  })

  it("R8 — transportKind='auto' + empty api-key + cliResolved=false → degraded — TEST-ASM-003", () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: false, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })
})

// -----------------------------------------------------------------------------
// Purity / no-I/O guards (T-ASM-004 DoD: "Selector test never spawns;
// deps.cliResolved is set explicitly per test")
// -----------------------------------------------------------------------------

describe('selectTransport() purity invariants (SPEC-ASM-001 §3.1)', () => {
  it('does not invoke any method on sdkAdapter or subscriptionAdapter during selection', () => {
    // Every path is exercised below; the mock ports throw on any method call,
    // so if the selector ever reaches for `.isAvailable()` / `.query()` /
    // `.startup()` / `.shutdown()` the assertion fails.
    const cases: ReadonlyArray<{
      transportKind: TransportKind
      apiKeyPresent: boolean
      cliResolved: boolean
    }> = [
      { transportKind: 'degraded', apiKeyPresent: true, cliResolved: true },
      { transportKind: 'api-key', apiKeyPresent: true, cliResolved: true },
      { transportKind: 'api-key', apiKeyPresent: false, cliResolved: false },
      { transportKind: 'subscription', apiKeyPresent: false, cliResolved: true },
      { transportKind: 'subscription', apiKeyPresent: false, cliResolved: false },
      { transportKind: 'auto', apiKeyPresent: true, cliResolved: false },
      { transportKind: 'auto', apiKeyPresent: false, cliResolved: true },
      { transportKind: 'auto', apiKeyPresent: false, cliResolved: false },
    ]

    for (const c of cases) {
      const settings = makeSettings({ transportKind: c.transportKind })
      const deps = makeDeps({ cliResolved: c.cliResolved, apiKeyPresent: c.apiKeyPresent })

      // The mocks throw on any port-method call; reaching this point at all
      // means the selector consumed `cliResolved` and `apiKeyPresent` as
      // plain booleans.
      expect(() => selectTransport(settings, deps)).not.toThrow()
    }
  })

  it('returns a kind that is never literally "auto" (TransportSelection.kind excludes "auto")', () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).not.toBe('auto')
  })

  it('is referentially stable across repeated calls with identical inputs (deterministic)', () => {
    const settings = makeSettings({ transportKind: 'auto' })
    const deps = makeDeps({ cliResolved: true, apiKeyPresent: true })

    const first = selectTransport(settings, deps)
    const second = selectTransport(settings, deps)

    expect(first.kind).toBe(second.kind)
    expect(first.port).toBe(second.port)
  })
})
