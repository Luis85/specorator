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
import type {
  ClaudeCliPort,
  ClaudeCliStreamOptions,
  ConfirmModalPort,
  StreamDelta,
} from '@/domain/ports'
import { getChatStoresFacade } from '../__fakes__/chatStoresFacade'
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
    queryStream: vi.fn(
      (_prompt: string, _options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta> => {
        return (async function* (): AsyncGenerator<StreamDelta> {})()
      },
    ),
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
  readonly apiKeyPresentRef: { value: boolean }
  readonly confirmModalAdapter: ConfirmModalPort
}

function makeConfirmModalAdapter(): ConfirmModalPort {
  return {
    show: vi.fn(async () => true),
  }
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
interface FixtureOptions {
  readonly transportKind?: PluginSettings['transportKind']
  readonly apiKeyPresent?: boolean
  readonly cliResolved?: boolean
}

function makeFixture(opts: FixtureOptions = {}): Fixture {
  const sdkAdapter = makePort('sdk')
  const subscriptionAdapter = makePort('subscription')
  const degradedPort = degradedClaudeCliPort
  const cliResolvedRef = { value: opts.cliResolved ?? false }
  const apiKeyPresentRef = { value: opts.apiKeyPresent ?? false }
  const confirmModalAdapter = makeConfirmModalAdapter()

  const selectTransportSpy = vi.fn(
    (settings: PluginSettings): TransportSelection => {
      const deps: TransportSelectorDeps = {
        sdkAdapter,
        subscriptionAdapter,
        degradedPort,
        cliResolved: cliResolvedRef.value,
        apiKeyPresent: apiKeyPresentRef.value,
      }
      return selectTransport(settings, deps)
    },
  )

  const plugin = {
    settings: makeSettings(opts.transportKind !== undefined ? { transportKind: opts.transportKind } : {}),
  }

  const options: SpecoratorViewOptions = {
    subscriptionAdapter,
    selectTransport: selectTransportSpy,
    confirmModalAdapter,
  }

  return {
    sdkAdapter,
    subscriptionAdapter,
    degradedPort,
    selectTransportSpy,
    plugin,
    options,
    cliResolvedRef,
    apiKeyPresentRef,
    confirmModalAdapter,
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

  it('passes the transport-kind setting + cliResolved + apiKeyPresent snapshot to the selector at construction time', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: true, cliResolved: false })

    makeView(fixture)

    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1)
    // The view passes `plugin.settings` directly (the API key now lives in
    // `SecretStorePort`, not on `PluginSettings`); the selector closure
    // injects the four port deps plus `apiKeyPresent` derived from the
    // plugin's `_apiKeyCache`. Verify the settings arg carries `transportKind`.
    const callArg = fixture.selectTransportSpy.mock.calls[0][0] as PluginSettings
    expect(callArg.transportKind).toBe('auto')
  })

  it('R2 wiring — transportKind="api-key" + key present → getActiveClaudeCliPort returns sdkAdapter', () => {
    const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: true, cliResolved: false })

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('R4 wiring — transportKind="subscription" + cliResolved=true → returns subscriptionAdapter', () => {
    const fixture = makeFixture({ transportKind: 'subscription', apiKeyPresent: false, cliResolved: true })

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })

  it('R7 wiring — transportKind="auto" + empty key + cliResolved=true → returns subscriptionAdapter', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: true })

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })

  it('R8 wiring — fully degraded conditions (auto + empty key + cliResolved=false) → returns degradedPort', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.degradedPort)
  })

  it('R6 wiring — transportKind="auto" + key present + cliResolved=true → api-key beats subscription (sdkAdapter)', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: true, cliResolved: true })

    const view = makeView(fixture)

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })
})

describe('SpecoratorView.bumpSettingsVersion() re-runs the selector (REQ-ASM-002)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('re-invokes selectTransport when settings change between bumps', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    // Initial: degraded (auto + no key + no cli).
    expect(activePort(view)).toBe(fixture.degradedPort)
    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(1)

    // Mutate the underlying settings object (this is how main.ts persists —
    // see `updateSettings()` which assigns to `this.settings`). The API key
    // now lives in `SecretStorePort`, so flip `apiKeyPresentRef` instead of
    // mutating `plugin.settings.anthropicApiKey`.
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()

    expect(fixture.selectTransportSpy).toHaveBeenCalledTimes(2)
    // New verdict reflects the updated key cache.
    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('reflects an `isAvailableSync()` flip (cliResolved toggled true) on the next bump', () => {
    const fixture = makeFixture({ transportKind: 'subscription', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    // Subscription forced but CLI not resolved → degraded (R5).
    expect(activePort(view)).toBe(fixture.degradedPort)

    // Adapter pre-warm completes → cliResolved flips. Bump triggers re-run.
    fixture.cliResolvedRef.value = true
    view.bumpSettingsVersion()

    expect(activePort(view)).toBe(fixture.subscriptionAdapter)
  })

  it('also re-runs startup() on the api-key (SDK) adapter so first-time key setup activates in-session (Codex P1, PR #350)', () => {
    const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: false, cliResolved: false })
    const view = makeView(fixture)

    // Save the API key in-session, then bump. Reflects `refreshApiKeyCache()`
    // having repopulated `_apiKeyCache` from the keychain.
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()

    // Before the fix, only the subscription adapter's startup() ran. Both
    // must now be invoked so the SDK adapter re-checks its availability
    // with the freshly-configured key.
    expect(fixture.sdkAdapter.startup).toHaveBeenCalled()
    expect(fixture.subscriptionAdapter.startup).toHaveBeenCalled()
  })
})

describe('SpecoratorView.bumpSettingsVersion() mid-turn guard (REQ-ASM-003)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  it('does NOT swap the active port while chatStore.status === "loading"', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    // Inject the same pinia the test owns so `_isChatLoading()` reads our store.
    view.pinia = pinia
    const initialPort = activePort(view)
    expect(initialPort).toBe(fixture.degradedPort)

    // Mark an in-flight turn so `getChatStoresFacade(pinia).status === 'loading'`.
    const store = getChatStoresFacade(pinia)
    store.beginRequest()
    expect(store.status).toBe('loading')

    // Settings change that WOULD swap to sdkAdapter under normal conditions.
    fixture.apiKeyPresentRef.value = true

    const callsBefore = fixture.selectTransportSpy.mock.calls.length
    view.bumpSettingsVersion()
    const callsAfter = fixture.selectTransportSpy.mock.calls.length

    // REQ-ASM-003: selector is NOT re-invoked, active port is unchanged.
    expect(callsAfter).toBe(callsBefore)
    expect(activePort(view)).toBe(initialPort)
    expect(activePort(view)).not.toBe(fixture.sdkAdapter)
  })

  it('auto-applies the deferred refresh when the turn ends (no manual second bump required) — Codex P1, PR #350', async () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    view.pinia = pinia
    // Install the deferred-refresh watcher the way `onOpen()` would.
    view._installPendingRefreshWatcher()

    const store = getChatStoresFacade(pinia)
    // Mid-turn settings change.
    store.beginRequest()
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()
    expect(activePort(view)).toBe(fixture.degradedPort)

    // Turn finishes — the watcher MUST automatically apply the deferred
    // refresh without a second `bumpSettingsVersion()` call.
    store.setResponse('hello', false)
    // Allow Vue's reactive scheduler to flush the watcher callback.
    const { nextTick } = await import('vue')
    await nextTick()

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('picks up the deferred change on the NEXT bump after the turn settles', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    view.pinia = pinia
    const store = getChatStoresFacade(pinia)

    // Mid-turn: bump is a no-op for the selector.
    store.beginRequest()
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()
    expect(activePort(view)).toBe(fixture.degradedPort)

    // Turn finishes → next bump picks up the queued settings.
    store.setResponse('hello', false)
    expect(store.status).toBe('idle')
    view.bumpSettingsVersion()

    expect(activePort(view)).toBe(fixture.sdkAdapter)
  })

  it('clears `pinia` on close so plugin workspace handlers stop mutating the unmounted store — Codex P2, PR #350', async () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    view.pinia = pinia
    expect(view.pinia).not.toBeNull()

    await view.onClose()

    // Plugin-level `active-leaf-change` / `file-menu` handlers gate on
    // `this._specoratorView?.pinia`. Nulling the field turns those gates
    // false so background workspace events do not mutate a store whose Vue
    // app has been unmounted.
    expect(view.pinia).toBeNull()
  })
})

// -----------------------------------------------------------------------------
// T-ASM-075 — CONFIRM_MODAL_PORT + TRANSPORT_KIND_KEY wiring (PR-ASM-4 batch 9).
//
// Asserts that the view accepts the modal-port adapter through its options bag
// and that `getActiveTransportKind()` mirrors `selectTransport(settings).kind`,
// including reactive updates via `bumpSettingsVersion()`. The matching Vue
// `provide()` calls live in `onOpen()` (SpecoratorView.ts lines 206 + 209); we
// don't mount the Vue app here for the same reason the existing wiring tests
// don't — instead we exercise the public test seams that back those provides.
// -----------------------------------------------------------------------------

describe('SpecoratorView accepts ConfirmModalPort via options bag (T-ASM-075, REQ-ASM-044)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores the confirmModalAdapter passed through SpecoratorViewOptions', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)

    // The adapter is held on the view's `_options` bag and provided under
    // CONFIRM_MODAL_PORT in onOpen(). We can't read `_options` directly
    // (private), but constructing the view without throwing exercises the
    // option-acceptance path. The provide itself is asserted by ChatSidebar's
    // consumer tests (PR-ASM-4 batch 7).
    expect(view).toBeInstanceOf(SpecoratorView)
    // Sanity: the adapter we built is a real ConfirmModalPort.
    expect(typeof fixture.confirmModalAdapter.show).toBe('function')
  })

  it('accepts construction without a confirmModalAdapter (optional field)', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })
    const sdkAdapter = fixture.sdkAdapter
    const subscriptionAdapter = fixture.subscriptionAdapter
    const degradedPort = fixture.degradedPort
    const cliResolvedRef = fixture.cliResolvedRef
    const apiKeyPresentRef = fixture.apiKeyPresentRef
    const optionsNoModal: SpecoratorViewOptions = {
      subscriptionAdapter,
      selectTransport: (settings: PluginSettings): TransportSelection =>
        selectTransport(settings, {
          sdkAdapter,
          subscriptionAdapter,
          degradedPort,
          cliResolved: cliResolvedRef.value,
          apiKeyPresent: apiKeyPresentRef.value,
        }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaf = {} as any
    expect(
      () =>
        new SpecoratorView(
          leaf,
          fixture.plugin as unknown as SpecoratorPlugin,
          fixture.sdkAdapter,
          optionsNoModal,
        ),
    ).not.toThrow()
  })
})

describe('SpecoratorView.getActiveTransportKind() mirrors selectTransport().kind (T-ASM-075, REQ-ASM-002)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reflects "api-key" when settings resolve to the SDK adapter', () => {
    const fixture = makeFixture({ transportKind: 'api-key', apiKeyPresent: true, cliResolved: false })

    const view = makeView(fixture)

    expect(view.getActiveTransportKind()).toBe('api-key')
  })

  it('reflects "subscription" when settings resolve to the subscription adapter', () => {
    const fixture = makeFixture({ transportKind: 'subscription', apiKeyPresent: false, cliResolved: true })

    const view = makeView(fixture)

    expect(view.getActiveTransportKind()).toBe('subscription')
  })

  it('reflects "degraded" when no transport is available', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)

    expect(view.getActiveTransportKind()).toBe('degraded')
  })

  it('updates reactively on bumpSettingsVersion() when settings change', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const view = makeView(fixture)
    expect(view.getActiveTransportKind()).toBe('degraded')

    // A new API key was persisted to the OS keychain; `_apiKeyCache` was
    // refreshed and `apiKeyPresent` now reads `true`.
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()

    expect(view.getActiveTransportKind()).toBe('api-key')
  })

  it('preserves the kind across bumps while a chat turn is in flight (REQ-ASM-003)', () => {
    const fixture = makeFixture({ transportKind: 'auto', apiKeyPresent: false, cliResolved: false })

    const pinia = createPinia()
    setActivePinia(pinia)
    const view = makeView(fixture)
    view.pinia = pinia
    expect(view.getActiveTransportKind()).toBe('degraded')

    // Begin an in-flight turn.
    const store = getChatStoresFacade(pinia)
    store.beginRequest()
    expect(store.status).toBe('loading')

    // Settings change that WOULD switch the kind under normal conditions.
    fixture.apiKeyPresentRef.value = true
    view.bumpSettingsVersion()

    // Kind unchanged — selector not re-run mid-turn (REQ-ASM-003).
    expect(view.getActiveTransportKind()).toBe('degraded')
  })
})
