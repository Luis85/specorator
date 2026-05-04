# PluginCore Lifecycle + Listener-Leak Tripwire — Design Spec

**Date:** 2026-05-04
**Issue:** [W4] Epic #85 — PluginCore lifecycle + listener-leak tripwire (#102)
**Status:** Approved

## Overview

Introduce `PluginCore`, a pure-TypeScript class that owns the module lifecycle, the shared `EventBus`, and a new `LoggerPort` narrow port. `src/plugin/main.ts` becomes a thin Obsidian-side bootstrap that delegates all lifecycle work to `PluginCore`. `src/ui/main.ts` (standalone browser entry) stays on `bootstrapModules()` but gains `logger` in its inline ports object and provides `LOGGER_PORT`. Module validation, topo-sort, settings migration stub, listener-leak tripwire, and degraded-module reporting are all handled inside `PluginCore`.

## New Files

| File | Role |
|---|---|
| `src/domain/ports/LoggerPort.ts` | New ADR-008 narrow port interface |
| `src/core/core-events.ts` | `EventMap` declaration merge for `core:*` channels |
| `src/core/plugin-core.ts` | `PluginCore` class + `CorePorts` type |
| `src/ui/composables/useLoggerPort.ts` | Composable for UI consumers |
| `tests/core/plugin-core.test.ts` | Full unit test suite |

## Modified Files

| File | Change |
|---|---|
| `src/domain/ports/index.ts` | Re-export `LoggerPort` |
| `src/infrastructure/bridge/ports.ts` | Add `LOGGER_PORT` `InjectionKey` |
| `src/infrastructure/mock/MockBridge.ts` | Implement `LoggerPort` (console) |
| `src/infrastructure/obsidian/ObsidianBridge.ts` | Implement `LoggerPort` (console + `Notice` for errors); no new constructor params |
| `src/infrastructure/localstorage/LocalStorageBridge.ts` | Implement `LoggerPort` (console) |
| `src/modules/module.ts` | Add `logger: LoggerPort` to `ModulePorts` |
| `src/plugin/main.ts` | Thin to ~30 lines; delegate lifecycle to `PluginCore`; provide `LOGGER_PORT` |
| `src/ui/main.ts` | Add `logger: bridge` to inline `ModulePorts`; add `app.provide(LOGGER_PORT, bridge)` |
| `tests/__fakes__/fake-ports.ts` | Add `logger: LoggerPort` to **both** the `FakePorts` interface declaration and the `fakeModulePorts()` return object |

**Compilation sequencing note:** Follow this order to avoid intermediate typecheck failures:
1. Add `logger` implementation to `MockBridge`, `ObsidianBridge`, and `LocalStorageBridge` first — `src/ui/main.ts`'s `PROD` branch uses `LocalStorageBridge` as the `logger` value, so it must satisfy `LoggerPort` before `ui/main.ts` is touched.
2. Update `tests/__fakes__/fake-ports.ts` (`FakePorts` interface + return object) before modifying `src/modules/module.ts` — `tests/core/bootstrap.test.ts` calls `fakeModulePorts()` and will not compile against the widened `ModulePorts` until the fake is updated.
3. Update `src/modules/module.ts` to add `logger: LoggerPort` to `ModulePorts`.
4. Update `src/ui/main.ts` and `src/plugin/main.ts` last.

## `LoggerPort` Interface

```ts
// src/domain/ports/LoggerPort.ts
export interface LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: unknown, context?: Record<string, unknown>): void
}
```

All bridge implementations default to `console.*` only. `LoggerPort` is strictly logging — no `NotificationPort` calls, no Obsidian `Notice`. User-facing error notifications are the exclusive responsibility of `NotificationPort`/`FeedbackService` (see `2026-05-04-error-logging-notification-design.md`).

`MockBridge`'s `LoggerPort` implementation is a console delegate used in the standalone dev app. Unit tests in `plugin-core.test.ts` inject a separate `vi.fn()` spy object and do not exercise `MockBridge`'s logger methods — this is intentional; the bridge implementation is covered by the standalone dev app smoke path.

## `CorePorts` Type

Defined at the top of `src/core/plugin-core.ts`:

```ts
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort } from '@/domain/ports'

export interface CorePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
}
```

`CorePorts` does **not** include `bus` — `PluginCore` creates the `EventBus` internally and assembles the full `ModulePorts` (which includes `bus` and `logger`) before passing it to each module's `init()`.

## Core Events (`core-events.ts`)

```ts
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    // Error objects are acceptable here: these events are in-process diagnostic
    // signals, never serialised. Consumers: log error.message only, not the full
    // Error object, to avoid leaking stack traces.
    'core:module-degraded':  { moduleId: string; error: Error }
    'core:init-complete':    { degradedCount: number }
    'core:destroy-complete': { leakCount: number }
  }
}
```

## `PluginCore` Class

```ts
// src/core/plugin-core.ts
class PluginCore {
  constructor(
    modules: ReadonlyArray<ModuleDescriptor>,
    ports: CorePorts,         // 4 existing ports + LoggerPort; no bus
    busOptions?: EventBusOptions,
  )

  readonly bus: EventBus      // owned; passed to module ports
  get degradedModules(): ReadonlyArray<{ id: string; error: Error }>

  async init(rawSettings: Record<string, unknown>): Promise<void>
  async destroy(): Promise<void>
}
```

`PluginCore` must **not** register any `onAny` listeners on its own bus — doing so would inflate `listenerCount()` and corrupt the per-module delta math of the listener-leak tripwire.

## `init()` Sequence

1. **Validate** — in order:
   a. Reject duplicate IDs (throw before any module runs).
   b. Normalize each module's `dependsOn` as `mod.dependsOn ?? []`.
   c. Reject self-dependencies (`dependsOn` contains the module's own ID) as a named pre-pass error.
   d. Reject unknown `dependsOn` refs (ID not in module list).
   e. Detect cycles via Kahn's algorithm. Seed the zero-in-degree queue **in declaration order** to ensure stable topo-sort. Any node remaining after the sort = cycle; throw with message naming the remaining module IDs (e.g. `"cycle detected: A → B → A"`).

2. **Topo-sort** — result of Kahn's from step 1e (stable; declaration order preserved within same depth).

3. **Migrate settings** — call `migrateSettings(modules, rawSettings)` stub; returns settings unchanged (W7 fills this in).

4. **Assemble `ModulePorts`** — combine `CorePorts` with the internal `bus`: `const modulePorts: ModulePorts = { ...corePorts, bus }`. This single object is passed to every module's `init()`.

5. **Init each module** in topo order:
   - Snapshot `bus.listenerCount()` → store as `subscribedCount` in `leakMap[mod.id]`.
   - Call `mod.init(modulePorts, settings)`.
   - On failure: call `mod.destroy?.()`, push `{ id: mod.id, error }` to `_degradedModules` **before** emitting, then emit `core:module-degraded`, **continue** (no plugin abort). Push-before-emit ensures the `degradedModules` getter is consistent when any `core:module-degraded` listener fires.

6. After the loop: emit `core:init-complete` with `degradedCount`.

## `destroy()` Sequence

Runs in **reverse topo order** (modules at earlier topo positions are destroyed after their dependants). **Degraded modules are skipped** — they were already cleaned up at failure time during `init()`.

Per eligible module:

1. Snapshot `bus.listenerCount()` → `beforeCount`.
2. Call `mod.destroy?.()`.
3. On throw: `logger.error('module destroy failed', error, { moduleId })`, skip tripwire for this module, continue.
4. Snapshot `bus.listenerCount()` → `afterCount`. Compute `released = beforeCount - afterCount`.
   - If `released < leakMap[mod.id]`: call `logger.warn('listener leak detected', { moduleId, released, subscribed: leakMap[mod.id] })`. Increment `leakCount`.
   - If `released >= leakMap[mod.id]`: no action (includes the case where a module subscribed nothing and released nothing: `0 < 0` is false).

After the loop: emit `core:destroy-complete` with `leakCount`.

**Constraint:** Modules must not emit bus events from `destroy()`. Doing so can cause sibling-module listeners to fire and self-unsubscribe, corrupting the per-module delta measurement in the leak tripwire and producing false-positive warnings.

**`logger` validity:** `logger` must remain valid for the full duration of `destroy()` including the final `core:destroy-complete` emission. `main.ts` must not nullify bridge references until after `await core.destroy()` resolves.

## Error Handling Rules

| Scenario | Behaviour |
|---|---|
| Module `init()` throws | Push to `_degradedModules` first; emit `core:module-degraded`; other modules continue |
| Module `destroy()` throws | Logged via `logger.error`; tripwire skipped for that module; teardown continues |
| `onListenerError` fires | Destructure `{ channel, eventId, traceId }` from envelope only; call `logger.error`; `envelope.payload` is **never accessed** |
| `logger.error` throws | Wrapped in `try/catch`; exception discarded (defense-in-depth — the EventBus already wraps `onListenerError` in `trySync`, but the inner guard keeps the error path clean if the outer guard changes) |

## `onListenerError` Implementation

```ts
onListenerError: (error: unknown, envelope: EventEnvelope) => {
  const { channel, eventId, traceId } = envelope  // payload never accessed
  try {
    ports.logger.error('event listener error', error, { channel, eventId, traceId })
  } catch {
    // discard — cannot re-enter error reporting path
  }
}
```

## `emitAsync` Known Gap (separate issue)

`createEventBus().emitAsync()` does not isolate per-listener errors — if any listener throws, the rejection propagates through `runBounded` and rejects the caller. This diverges from `emit()`'s per-listener isolation via `trySync`. This is a pre-existing EventBus limitation and is **out of scope for W4**. File a separate bug against `src/domain/shared/event-bus.ts` to wrap each `emitAsync` listener in `try/catch` and route to `onListenerError`, consistent with `emit()`.

## Thin `main.ts` (Obsidian entry)

`main.ts` responsibilities after thinning:
- Create `ObsidianBridge` (implements all five ports including `LoggerPort`).
- Import `ALL_MODULES`.
- Instantiate `PluginCore(ALL_MODULES, bridge)`.
- `onload()`: register view, ribbon, command, settings tab; merge settings before handing to core:
  ```ts
  const raw = await this.loadData() ?? {}
  // Merge with DEFAULT_SETTINGS so migrateSettings stub always receives a complete object.
  // Also handles legacy key renames (e.g. featuresFolder → specsFolder) that the current
  // main.ts applies before runtime use. migrateSettings (W7) will replace this merge.
  const settings = { ...DEFAULT_SETTINGS, ...raw }
  await core.init(settings)
  ```
- `onunload()`: Obsidian's `onunload()` is synchronous (`void` return). Call `void core.destroy()` — fire-and-forget. Teardown runs async after unload returns. Listener-leak checks and destroy errors are still logged via `LoggerPort`, but the host does not wait for them. This is an accepted limitation of Obsidian's lifecycle; there is no awaitable unload hook available.
- Add `app.provide(LOGGER_PORT, bridge)` alongside the existing port provisions.

View, ribbon icon, and settings tab registration remain in `main.ts` — they are Obsidian-specific and `PluginCore` must stay pure TypeScript.

## Standalone entry (`src/ui/main.ts`)

`src/ui/main.ts` stays on `bootstrapModules()` (no `PluginCore` conversion — this is the dev browser app, not the Obsidian plugin). Required changes:
- Add `logger: bridge` to the inline `ModulePorts` object.
- Add `app.provide(LOGGER_PORT, bridge)` to the provide block.

## Testing

**`tests/__fakes__/fake-ports.ts` changes:**

Add `logger: LoggerPort` to **both** the `FakePorts` interface declaration **and** the `fakeModulePorts()` return object.

Updated `FakePorts` interface (add the `logger` line alongside the existing four ports):

```ts
export interface FakePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort   // ← new
  readonly bus: EventBus
  readonly bridge: MockBridge
}
```

Updated return object (inside `fakeModulePorts()`):

```ts
logger: {
  debug: vi.fn(),
  info:  vi.fn(),
  warn:  vi.fn(),
  error: vi.fn(),
}
```

Callers assert on `ports.logger.warn`, `ports.logger.error` etc. directly.

**`tests/core/plugin-core.test.ts`** covers:

- Duplicate module ID → `init()` rejects before any module runs
- Self-dependency → `init()` rejects with named error
- Unknown `dependsOn` ref → `init()` rejects
- Cycle (`A → B → A`) → `init()` rejects with message naming A and B
- Topo order: B depends on A → A inits first
- Stable order: two independent modules init in declaration order
- Degraded module does not abort other modules
- Degraded module is excluded from `destroy()` sweep
- `degradedModules` getter is consistent (populated) when `core:module-degraded` listener fires
- Listener-leak tripwire fires `logger.warn` with `{ moduleId, released, subscribed }` when a module leaks
- No spurious tripwire warn when module subscribed nothing and released nothing
- `core:module-degraded` emitted with correct `moduleId` and `error`
- `core:init-complete` emitted after loop with correct `degradedCount`
- `destroy()` runs in reverse topo order
- `core:destroy-complete` emitted after full destroy loop with correct `leakCount`
- `logger.error` called with `{ channel, eventId, traceId }` (not payload) when `onListenerError` fires
- `destroy()` error is logged and teardown continues

## Migration Stub

```ts
function migrateSettings(
  _modules: ReadonlyArray<ModuleDescriptor>,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return settings
}
```

W7 replaces this with the per-module migration pipeline.

## `module-authoring.md` Addendum

Add the following constraints to `docs/module-authoring.md`:

- All bus subscriptions acquired in `init()` must be stored in module-local scope and released in `destroy()`. Do **not** delegate unsubscription to Vue component lifecycle hooks (`onUnmounted`) — the module may outlive or be destroyed independently of any component, and leaked listeners will trigger the W4 tripwire.
- Modules must not hold references to sibling module instances. Inter-module communication must go through the shared `EventBus`.

## Acceptance Criteria Cross-Check

| AC | Covered by |
|---|---|
| `PluginCore` class in `src/core/plugin-core.ts` | `plugin-core.ts` |
| Module validation (dup IDs / self-dep / unknown deps / cycles) | `init()` step 1 |
| PluginCore owns/configures shared EventBus | Constructor; `bus` property |
| EventBus listener errors → LoggerPort with envelope IDs | `onListenerError` impl; payload never accessed |
| Listener-leak tripwire fires warn log | `destroy()` step 4 |
| Degraded-module getter + `core` event | `_degradedModules` array (push-before-emit) + `core:module-degraded` |
| `main.ts` becomes thin bootstrap | Thinned `main.ts` |
