/**
 * T-ASM-004 — Tests for selectTransport() 8-row truth table.
 *
 * Satisfies: REQ-ASM-002, REQ-ASM-003.
 * Maps to: TEST-ASM-001, TEST-ASM-002, TEST-ASM-003.
 *
 * SPEC-ASM-001 §3.1 defines the deterministic decision table (first match wins):
 *
 *   | Row | transportKind   | apiKey.trim() !== '' | cliResolved | Result                                             |
 *   |-----|-----------------|----------------------|-------------|----------------------------------------------------|
 *   | R1  | 'degraded'      | *                    | *           | { port: degradedPort,        kind: 'degraded'    } |
 *   | R2  | 'api-key'       | true                 | *           | { port: sdkAdapter,          kind: 'api-key'     } |
 *   | R3  | 'api-key'       | false                | *           | { port: degradedPort,        kind: 'degraded'    } |
 *   | R4  | 'subscription'  | *                    | true        | { port: subscriptionAdapter, kind: 'subscription'} |
 *   | R5  | 'subscription'  | *                    | false       | { port: degradedPort,        kind: 'degraded'    } |
 *   | R6  | 'auto'          | true                 | *           | { port: sdkAdapter,          kind: 'api-key'     } |
 *   | R7  | 'auto'          | false                | true        | { port: subscriptionAdapter, kind: 'subscription'} |
 *   | R8  | 'auto'          | false                | false       | { port: degradedPort,        kind: 'degraded'    } |
 *
 * Per spec §3.1, the selector is synchronous and performs no I/O — `cliResolved`
 * is consumed as a plain boolean (no method call on `deps.subscriptionAdapter`).
 *
 * These tests target the not-yet-implemented module
 * `src/plugin/transport/TransportSelector.ts` (T-ASM-005). They MUST fail until
 * that implementation lands.
 */
import { describe, it, expect } from 'vitest'

import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import type { ClaudeCliPort } from '@/domain/ports/ClaudeCliPort'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { TransportKind } from '@/domain/chat/TransportKind'

// Module-under-test (will be created in T-ASM-005). Tests fail with
// "Cannot find module '@/plugin/transport/TransportSelector'" until then.
import {
  selectTransport,
  type TransportSelection,
  type TransportSelectorDeps,
} from '@/plugin/transport/TransportSelector'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/**
 * The selector consumes `settings.transportKind` (SPEC-ASM-001 §3.1). The field
 * is being added to `PluginSettings` as part of the ASM work; until that lands
 * we cast through `Partial` here so the test file compiles ahead of T-ASM-005.
 */
type AsmPluginSettings = PluginSettings & { readonly transportKind: TransportKind }

function makeSettings(overrides: Partial<AsmPluginSettings>): AsmPluginSettings {
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
    query: () => {
      throw new Error(`mock port "${label}" .query() must not be called by selectTransport`)
    },
    isAvailable: () => {
      throw new Error(
        `mock port "${label}" .isAvailable() must not be called by selectTransport`,
      )
    },
    startup: () => {
      throw new Error(`mock port "${label}" .startup() must not be called by selectTransport`)
    },
    shutdown: () => {
      throw new Error(`mock port "${label}" .shutdown() must not be called by selectTransport`)
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
    ...overrides,
  }
}

// -----------------------------------------------------------------------------
// Truth-table rows R1–R8 (spec §3.1)
// -----------------------------------------------------------------------------

describe('REQ-ASM-002 / REQ-ASM-003: selectTransport() — SPEC-ASM-001 §3.1 truth table', () => {
  it("R1 — transportKind='degraded' (api-key empty, cli unresolved) → degraded", () => {
    const settings = makeSettings({ transportKind: 'degraded', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: false })

    const selection: TransportSelection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R1 — transportKind='degraded' wins regardless of api-key/cliResolved values", () => {
    const settings = makeSettings({ transportKind: 'degraded', anthropicApiKey: 'sk-live' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R2 — transportKind='api-key' + api-key present → api-key (sdkAdapter)", () => {
    const settings = makeSettings({ transportKind: 'api-key', anthropicApiKey: 'sk-abc123' })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'api-key', port: deps.sdkAdapter }),
    )
  })

  it("R2 — transportKind='api-key' + api-key present is independent of cliResolved", () => {
    const settings = makeSettings({ transportKind: 'api-key', anthropicApiKey: 'sk-abc123' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('api-key')
    expect(selection.port).toBe(deps.sdkAdapter)
  })

  it("R3 — transportKind='api-key' + empty api-key → degraded", () => {
    const settings = makeSettings({ transportKind: 'api-key', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R3 — transportKind='api-key' + whitespace-only api-key → degraded (trim semantics, spec §3.1 col 3)", () => {
    const settings = makeSettings({ transportKind: 'api-key', anthropicApiKey: '   \t\n  ' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R4 — transportKind='subscription' + cliResolved=true → subscription (subscriptionAdapter)", () => {
    const settings = makeSettings({ transportKind: 'subscription', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'subscription', port: deps.subscriptionAdapter }),
    )
  })

  it("R4 — transportKind='subscription' + cliResolved=true is independent of api-key presence", () => {
    const settings = makeSettings({
      transportKind: 'subscription',
      anthropicApiKey: 'sk-live-key',
    })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('subscription')
    expect(selection.port).toBe(deps.subscriptionAdapter)
  })

  it("R5 — transportKind='subscription' + cliResolved=false → degraded", () => {
    const settings = makeSettings({ transportKind: 'subscription', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R5 — transportKind='subscription' + cliResolved=false ignores a present api-key", () => {
    const settings = makeSettings({
      transportKind: 'subscription',
      anthropicApiKey: 'sk-live-key',
    })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it("R6 — transportKind='auto' + api-key present → api-key (sdkAdapter) — TEST-ASM-001", () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: 'sk-...' })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'api-key', port: deps.sdkAdapter }),
    )
  })

  it("R6 — transportKind='auto' + api-key present beats cliResolved=true (api-key precedes subscription in auto)", () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: 'sk-...' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('api-key')
    expect(selection.port).toBe(deps.sdkAdapter)
  })

  it("R7 — transportKind='auto' + empty api-key + cliResolved=true → subscription — TEST-ASM-002", () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection).toEqual(
      expect.objectContaining({ kind: 'subscription', port: deps.subscriptionAdapter }),
    )
  })

  it("R7 — transportKind='auto' + whitespace-only api-key + cliResolved=true → subscription (trim semantics)", () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: '  \n' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('subscription')
    expect(selection.port).toBe(deps.subscriptionAdapter)
  })

  it("R8 — transportKind='auto' + empty api-key + cliResolved=false → degraded — TEST-ASM-003", () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: false })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).toBe('degraded')
    expect(selection.port).toBe(deps.degradedPort)
  })

  it('R8 — auto + whitespace api-key + cliResolved=false → degraded (trim semantics)', () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: '\t\t ' })
    const deps = makeDeps({ cliResolved: false })

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
      anthropicApiKey: string
      cliResolved: boolean
    }> = [
      { transportKind: 'degraded', anthropicApiKey: 'sk', cliResolved: true },
      { transportKind: 'api-key', anthropicApiKey: 'sk', cliResolved: true },
      { transportKind: 'api-key', anthropicApiKey: '', cliResolved: false },
      { transportKind: 'subscription', anthropicApiKey: '', cliResolved: true },
      { transportKind: 'subscription', anthropicApiKey: '', cliResolved: false },
      { transportKind: 'auto', anthropicApiKey: 'sk', cliResolved: false },
      { transportKind: 'auto', anthropicApiKey: '', cliResolved: true },
      { transportKind: 'auto', anthropicApiKey: '', cliResolved: false },
    ]

    for (const c of cases) {
      const settings = makeSettings({
        transportKind: c.transportKind,
        anthropicApiKey: c.anthropicApiKey,
      })
      const deps = makeDeps({ cliResolved: c.cliResolved })

      // The mocks throw on any port-method call; reaching this point at all
      // means the selector consumed `cliResolved` as a plain boolean.
      expect(() => selectTransport(settings, deps)).not.toThrow()
    }
  })

  it('returns a kind that is never literally "auto" (TransportSelection.kind excludes "auto")', () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: '' })
    const deps = makeDeps({ cliResolved: true })

    const selection = selectTransport(settings, deps)

    expect(selection.kind).not.toBe('auto')
  })

  it('is referentially stable across repeated calls with identical inputs (deterministic)', () => {
    const settings = makeSettings({ transportKind: 'auto', anthropicApiKey: 'sk-foo' })
    const deps = makeDeps({ cliResolved: true })

    const first = selectTransport(settings, deps)
    const second = selectTransport(settings, deps)

    expect(first.kind).toBe(second.kind)
    expect(first.port).toBe(second.port)
  })
})
