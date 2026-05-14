/**
 * T-ASM-021 — Wiring tests for `SpecoratorView`: assert that the view passes
 * the correct candidate ports to `selectTransport` and that the resolved port
 * exposed via `getActiveClaudeCliPort()` matches the selector's verdict.
 *
 * Covers TEST-ASM-001 .. TEST-ASM-004 (the four wiring scenarios) plus the
 * `bumpSettingsVersion()` re-run path and the REQ-ASM-003 mid-turn guard.
 *
 * Satisfies: REQ-ASM-001, REQ-ASM-002, REQ-ASM-003.
 *
 * Scope (intentionally narrow):
 *   - Only the public surface the view exposes for testing is exercised:
 *     constructor, `bumpSettingsVersion()`, and the `getActiveClaudeCliPort()`
 *     test seam (SpecoratorView.ts line 220).
 *   - We do NOT call `onOpen()` — that mounts a Vue app and would require an
 *     Obsidian runtime. Production code consumes the port via Vue's
 *     `inject(CLAUDE_CLI_PORT)`; the seam returns the same reactive value.
 *   - `selectTransport` is injected through the constructor's options bag
 *     (`SpecoratorViewOptions.selectTransport`) as a spy so we can assert the
 *     `deps` argument shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { toRaw } from 'vue'

// `SpecoratorView` extends `ItemView` from `obsidian`. The default
// vitest stub does not export `ItemView` / `Platform` / `WorkspaceLeaf`, so
// extend the stub for this file only.
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian')
  return {
    ...actual,
    Platform: { isMobile: false },
    // Minimal `ItemView` shim — `onOpen()` is never invoked by these tests so
    // we don't need a `containerEl` / DOM at all.
    ItemView: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(public leaf: any) {}
    },
  }
})

import { SpecoratorView, type SpecoratorViewOptions } from '@/plugin/SpecoratorView'
import { selectTransport } from '@/plugin/transport/TransportSelector'
import type {
  TransportSelection,
  TransportSelectorDeps,
} from '@/plugin/transport/TransportSelector'
import { degradedClaudeCliPort } from '@/infrastructure/bridge/degradedClaudeCliPort'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import type { ClaudeCliPort } from '@/domain/ports/ClaudeCliPort'
import { useChatStore } from '@/ui/stores/chatStore'
import type SpecoratorPlugin from '@/plugin/main'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

function makePort(label: string): ClaudeCliPort {
  return {
    query: vi.fn(async () => ({ ok: true as const, value: `from-${label}` })),
    isAvailable: vi.fn(async () => true),
    startup: vi.fn(async () => undefined),
    shutdown: vi.fn(() => undefined),
  }
}

interface Fixture {
  readonly sdkAdapter: ClaudeCliPort
  readonly subscriptionAdapter: ClaudeCliPort
  readonly degradedPort: ClaudeCliPort
  readonly selectTransportSpy: ReturnType<typeof vi.fn>
  readonly plugin: { settings: PluginSettings }
  readonly options: SpecoratorViewOptions
  readonly cliResolvedRef: { value: boolean }
}

function makeSettings(overrides: Partial<PluginSettings>): PluginSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

/**
 * Build a fixture that wires the real `selectTransport` behind a spy so we can
 * assert both the deps shape AND the resolved verdict against the 8-row table.
 *
 * `cliResolvedRef` lets a single fixture flip the `cliResolved` boolean on the
 * fly so the `bumpSettingsVersion` re-run test can change the world between
 * calls without rebuilding everything.
 */
function makeFixture(initialSettings: Partial<PluginSettings>, cliResolved = false): Fixture {
  const sdkAdapter = makePort('sdk')
  const subscriptionAdapter = makePort('subscription')
  const degradedPort = degradedClaudeCliPort
  const cliResolvedRef = { value: cliResolved }

  const selectTransportSpy = vi.fn(
    (settings: PluginSettings): TransportSelection => {
      const deps: TransportSelectorDeps = {
        sdkAdapter,
        subscriptionAdapter,
        degradedPort,
        cliResolved: cliResolvedRef.value,
      }
      return selectTransport(settings, deps)
    },
  )

  const plugin = { settings: makeSettings(initialSettings) }

  const options: SpecoratorViewOptions = {
    subscriptionAdapter,
    selectTransport: selectTransportSpy,
  }

  return {
    sdkAdapter,
    subscriptionAdapter,
    degradedPort,
    selectTransportSpy,
    plugin,
    options,
    cliResolvedRef,
  }
}

/**
 * Vue's `ref()` wraps object values via `reactive`, so reading `.value` returns
 * a Proxy. Identity (`Object.is`) against the raw port fails even though the
 * underlying target is the same. `toRaw` unwraps the Proxy so `toBe` succeeds.
 */
function activePort(view: SpecoratorView): ClaudeCliPort {
  return toRaw(view.getActiveClaudeCliPort())
}

/**
 * Construct a SpecoratorView without invoking `onOpen()`. The leaf argument is
 * irrelevant for the wiring tests — the stubbed `ItemView` accepts any value.
 */
function makeView(
  fixture: Fixture,
  // The view's constructor accepts a `ClaudeCliPort` as its third arg —
  // historically the direct SDK adapter, now still required for the legacy
  // back-compat path. Pass the sdk adapter so it matches production wiring.
  legacyPort?: ClaudeCliPort,
): SpecoratorView {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leaf = {} as any
  const port = legacyPort ?? fixture.sdkAdapter
  return new SpecoratorView(
    leaf,
    fixture.plugin as unknown as SpecoratorPlugin,
    port,
    fixture.options,
  )
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('SpecoratorView wiring — selectTransport receives the correct deps (T-ASM-021)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('passes the api-key + cliResolved snapshot to the selector at construction time', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: 'sk-live-abc' },
      /* cliResolved */ false,
    )

    makeView(fixture)

    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1)
    // The view passes `plugin.settings` directly; the selector closure injects
    // the four port deps. We assert via the verdict (covered below) plus the
    // settings argument shape here.
    const callArg = fixture.selectTransportSpy.mock.calls[0][0] as PluginSettings
    expect(callArg.anthropicApiKey).toBe('sk-live-abc')
    expect(callArg.transportKind).toBe('auto')
  })

  it('R2 wiring — transportKind="api-key" + key present → getActiveClaudeCliPort returns sdkAdapter', () => {
    const fixture = makeFixture(
      { transportKind: 'api-key', anthropicApiKey: 'sk-test-key' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('R4 wiring — transportKind="subscription" + cliResolved=true → returns subscriptionAdapter', () => {
    const fixture = makeFixture(
      { transportKind: 'subscription', anthropicApiKey: '' },
      /* cliResolved */ true,
    )

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })

  it('R7 wiring — transportKind="auto" + empty key + cliResolved=true → returns subscriptionAdapter', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: '' },
      /* cliResolved */ true,
    )

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })

  it('R8 wiring — fully degraded conditions (auto + empty key + cliResolved=false) → returns degradedPort', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: '' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.degradedPort)
  })

  it('R6 wiring — transportKind="auto" + key present + cliResolved=true → api-key beats subscription (sdkAdapter)', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: 'sk-prefers-api' },
      /* cliResolved */ true,
    )

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })
})

describe('SpecoratorView.bumpSettingsVersion() re-runs the selector (REQ-ASM-002)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('re-invokes selectTransport when settings change between bumps', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: '' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)
    // Initial: degraded (auto + no key + no cli).
    expect(activePort(view)).toBe(fixture.degradedPort)
    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1)

    // Mutate the underlying settings object (this is how main.ts persists —
    // see `updateSettings()` which assigns to `this.settings`).
    fixture.plugin.settings = makeSettings({
      transportKind: 'auto',
      anthropicApiKey: 'sk-just-saved',
    })
    view.bumpSettingsVersion()

    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(2)
    // New verdict reflects the updated settings.
    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('reflects an `isAvailableSync()` flip (cliResolved toggled true) on the next bump', () => {
    const fixture = makeFixture(
      { transportKind: 'subscription', anthropicApiKey: '' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)
    // Subscription forced but CLI not resolved → degraded (R5).
    expect(activePort(view)).toBe(fixture.degradedPort)

    // Adapter pre-warm completes → cliResolved flips. Bump triggers re-run.
    fixture.cliResolvedRef.value = true
    view.bumpSettingsVersion()

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })
})

describe('SpecoratorView.bumpSettingsVersion() mid-turn guard (REQ-ASM-003)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('does NOT swap the active port while chatStore.status === "loading"', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: '' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)
    // Inject the same pinia the test owns so `_isChatLoading()` reads our store.
    view.pinia = pinia
    const initialPort = activePort(view)
    expect(initialPort).toBe(fixture.degradedPort)

    // Mark an in-flight turn so `useChatStore(pinia).status === 'loading'`.
    const store = useChatStore(pinia)
    store.beginRequest()
    expect(store.status).toBe('loading')

    // Settings change that WOULD swap to sdkAdapter under normal conditions.
    fixture.plugin.settings = makeSettings({
      transportKind: 'auto',
      anthropicApiKey: 'sk-in-flight',
    })

    const callsBefore = fixture.selectTransportSpy.mock.calls.length
    view.bumpSettingsVersion()
    const callsAfter = fixture.selectTransportSpy.mock.calls.length

    // REQ-ASM-003: selector is NOT re-invoked, active port is unchanged.
    expect(callsAfter).toBe(callsBefore)
    expect(activePort(view)).toBe(initialPort)
    expect(activePort(view)).not.toBe(fixture.sdkAdapter)
  })

  it('picks up the deferred change on the NEXT bump after the turn settles', () => {
    const fixture = makeFixture(
      { transportKind: 'auto', anthropicApiKey: '' },
      /* cliResolved */ false,
    )

    const view = makeView(fixture)
    view.pinia = pinia
    const store = useChatStore(pinia)

    // Mid-turn: bump is a no-op for the selector.
    store.beginRequest()
    fixture.plugin.settings = makeSettings({
      transportKind: 'auto',
      anthropicApiKey: 'sk-queued',
    })
    view.bumpSettingsVersion()
    expect(activePort(view)).toBe(fixture.degradedPort)

    // Turn finishes → next bump picks up the queued settings.
    store.setResponse('hello', false)
    expect(store.status).toBe('idle')
    view.bumpSettingsVersion()

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })
})
