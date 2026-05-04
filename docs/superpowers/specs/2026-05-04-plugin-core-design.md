# PluginCore Lifecycle + Listener-Leak Tripwire — Design Spec

**Date:** 2026-05-04
**Issue:** [W4] Epic #85 — PluginCore lifecycle + listener-leak tripwire (#102)
**Status:** Approved

## Overview

Introduce `PluginCore`, a pure-TypeScript class that owns the module lifecycle, the shared `EventBus`, and a new `LoggerPort` narrow port. `src/plugin/main.ts` becomes a thin Obsidian-side bootstrap that delegates all lifecycle work to `PluginCore`. Module validation, topo-sort, settings migration stub, listener-leak tripwire, and degraded-module reporting are all handled inside `PluginCore`.

## New Files

| File | Role |
|---|---|
| `src/domain/ports/LoggerPort.ts` | New ADR-008 narrow port interface |
| `src/core/core-events.ts` | `EventMap` declaration merge for `core:*` channels |
| `src/core/plugin-core.ts` | `PluginCore` class |
| `src/ui/composables/useLoggerPort.ts` | Composable for UI consumers |
| `tests/core/plugin-core.test.ts` | Full unit test suite |

## Modified Files

| File | Change |
|---|---|
| `src/domain/ports/index.ts` | Re-export `LoggerPort` |
| `src/infrastructure/bridge/ports.ts` | Add `LOGGER_PORT` `InjectionKey` |
| `src/infrastructure/mock/MockBridge.ts` | Implement `LoggerPort` (console) |
| `src/infrastructure/obsidian/ObsidianBridge.ts` | Implement `LoggerPort` (console + `Notice` for errors) |
| `src/infrastructure/localstorage/LocalStorageBridge.ts` | Implement `LoggerPort` (console) |
| `src/modules/module.ts` | Add `logger: LoggerPort` to `ModulePorts` |
| `src/plugin/main.ts` | Thin to ~30 lines; delegate lifecycle to `PluginCore` |

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

## Core Events (`core-events.ts`)

Declaration merge on `EventMap`:

```ts
declare module '@/domain/shared/event-bus' {
  interface EventMap {
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
    ports: CorePorts,                // 4 existing ports + LoggerPort, no bus
    busOptions?: EventBusOptions,
  )

  readonly bus: EventBus             // owned; passed to module ports
  get degradedModules(): ReadonlyArray<{ id: string; error: Error }>

  async init(rawSettings: Record<string, unknown>): Promise<void>
  async destroy(): Promise<void>
}
```

`CorePorts` = all four existing narrow ports + `LoggerPort`. `EventBus` is created internally; `onListenerError` is wired to `logger.error` with `{ channel, eventId, traceId }` (no payload).

## `init()` Sequence

1. **Validate** — reject duplicate IDs; reject unknown `dependsOn` refs; detect cycles via Kahn's algorithm (any node remaining after sort = cycle).
2. **Topo-sort** — stable (preserves declaration order within same depth level).
3. **Migrate settings** — `migrateSettings(modules, rawSettings)` stub; returns settings unchanged (W7 fills this in).
4. **Init each module** in topo order:
   - Snapshot `bus.listenerCount()` → `baseline`
   - Call `mod.init(ports, settings)`
   - Store `delta = bus.listenerCount() - baseline` in `leakMap[mod.id]`
   - On failure: call `mod.destroy?.()`, mark degraded, emit `core:module-degraded`, **continue** (no plugin abort)
5. Emit `core:init-complete` with `degradedCount`.

## `destroy()` Sequence

Runs in **reverse topo order**:

1. Snapshot `bus.listenerCount()` before `mod.destroy?.()`.
2. Call `mod.destroy?.()`.
3. Snapshot after. If `(before - after) < leakMap[mod.id]`: `logger.warn('listener leak', { moduleId, delta, baseline })`. Increment `leakCount`.
4. If `destroy()` itself throws: `logger.error(...)`, skip tripwire for that module, continue.
5. Emit `core:destroy-complete` with `leakCount`.

## Error Handling Rules

| Scenario | Behaviour |
|---|---|
| Module `init()` throws | Degraded; `core:module-degraded` emitted; other modules continue |
| Module `destroy()` throws | Logged; tripwire skipped for that module; teardown continues |
| `onListenerError` fires | `logger.error` with envelope IDs (`channel`, `eventId`, `traceId`); no payload logged |
| `logger.error` throws | Swallowed silently (same guard as `trySync`) |

## Thin `main.ts`

`main.ts` responsibilities after thinning:
- Create `ObsidianBridge` (implements all five ports).
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

View, ribbon icon, and settings tab registration remain in `main.ts` — they are Obsidian-specific and `PluginCore` must stay pure TypeScript.

## Testing

**`tests/core/plugin-core.test.ts`** covers:

- Duplicate module ID → `init()` rejects before any module runs
- Unknown `dependsOn` ref → `init()` rejects
- Cycle (`A → B → A`) → `init()` rejects
- Topo order: B depends on A → A inits first
- Degraded module does not abort other modules
- Listener-leak tripwire fires `logger.warn` when a module leaks listeners
- `core:module-degraded` emitted with correct `moduleId` and `error`
- `core:init-complete` emitted with correct `degradedCount`
- `destroy()` runs in reverse topo order
- `logger.error` called with envelope IDs (not payload) when `onListenerError` fires
- `destroy()` error is logged and teardown continues

Tests use `fakeModulePorts()` extended with a vitest spy `LoggerPort`. No Obsidian imports.

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

## Acceptance Criteria Cross-Check

| AC | Covered by |
|---|---|
| `PluginCore` class in `src/core/plugin-core.ts` | `plugin-core.ts` |
| Module validation (dup IDs / unknown deps / cycles) | `init()` step 1 |
| PluginCore owns/configures shared EventBus | Constructor; `bus` property |
| EventBus listener errors → LoggerPort with envelope IDs | `onListenerError` hook |
| Listener-leak tripwire fires warn log | `destroy()` step 3 |
| Degraded-module getter + `core` event | `degradedModules` getter + `core:module-degraded` |
| `main.ts` becomes thin bootstrap | Thinned `main.ts` |
