# W4 PluginCore Lifecycle + Listener-Leak Tripwire — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `PluginCore`, a pure-TypeScript class that owns the module lifecycle and shared EventBus, and add `LoggerPort` as a full ADR-008 narrow port.

**Architecture:** `PluginCore` sits between the Obsidian plugin entry point (`main.ts`) and the module system. It validates and topo-sorts modules, owns the `EventBus`, routes listener errors to `LoggerPort`, and implements a listener-leak tripwire. `main.ts` becomes a thin bootstrap; `SpecoratorView` stops managing its own `bootstrapModules()` call.

**Tech Stack:** TypeScript, Vitest, Vue 3 (inject/provide), Obsidian Plugin API, `createEventBus` from `src/domain/shared/event-bus.ts`, Kahn's algorithm for cycle detection.

---

## Chunk 1: LoggerPort Foundation

Establish the new narrow port before touching anything that depends on `ModulePorts`. This chunk must be complete before Chunk 2.

---

### Task 1: Create `LoggerPort` interface, InjectionKey, and composable

**Files:**
- Create: `src/domain/ports/LoggerPort.ts`
- Modify: `src/domain/ports/index.ts`
- Modify: `src/infrastructure/bridge/ports.ts` (add import + one symbol)
- Create: `src/ui/composables/useLoggerPort.ts`

- [ ] **Step 1: Create the `LoggerPort` interface**

```typescript
// src/domain/ports/LoggerPort.ts
export interface LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: unknown, context?: Record<string, unknown>): void
}
```

- [ ] **Step 2: Re-export from the ports barrel**

In `src/domain/ports/index.ts`, add one line at the end:

```typescript
export type { LoggerPort } from './LoggerPort'
```

- [ ] **Step 3: Add `LOGGER_PORT` InjectionKey**

In `src/infrastructure/bridge/ports.ts`, add the import and symbol. Final file:

```typescript
import type { InjectionKey } from 'vue'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
} from '@/domain/ports'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort')
```

- [ ] **Step 4: Create the `useLoggerPort` composable**

```typescript
// src/ui/composables/useLoggerPort.ts
import { inject } from 'vue'
import type { LoggerPort } from '@/domain/ports'
import { LOGGER_PORT } from '@/infrastructure/bridge/ports'

export function useLoggerPort(): LoggerPort {
  const port = inject(LOGGER_PORT)
  if (!port) {
    throw new Error(
      'LoggerPort was not provided. Call app.provide(LOGGER_PORT, port) before mounting the app.',
    )
  }
  return port
}
```

- [ ] **Step 5: Typecheck — verify no errors introduced**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/domain/ports/LoggerPort.ts src/domain/ports/index.ts src/infrastructure/bridge/ports.ts src/ui/composables/useLoggerPort.ts
git commit -m "feat(ports): add LoggerPort narrow port, InjectionKey, and composable"
```

---

### Task 2: Implement `LoggerPort` in all three bridges

**Sequencing rule:** All three bridges must implement `LoggerPort` before `ModulePorts` or `src/ui/main.ts` are touched. The `PROD` branch in `src/ui/main.ts` uses `LocalStorageBridge` as the logger, so it must type-check against `LoggerPort`.

**Files:**
- Modify: `src/infrastructure/mock/MockBridge.ts`
- Modify: `src/infrastructure/obsidian/ObsidianBridge.ts`
- Modify: `src/infrastructure/localstorage/LocalStorageBridge.ts`

- [ ] **Step 1: Update `MockBridge`**

Change the `implements` clause on the class declaration and update the import. The constructor and all existing methods are unchanged.

Update the import at the top of `src/infrastructure/mock/MockBridge.ts`:
```typescript
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
} from '@/domain/ports'
```

Change the `implements` clause (the line that reads `implements SettingsPort, VaultPort, WorkspacePort, NotificationPort`):
```typescript
export class MockBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
```

Add four methods after `seedSettings()` (end of file, before closing brace):

```typescript
// ── LoggerPort ────────────────────────────────────────────────────────────

debug(message: string, context?: Record<string, unknown>): void {
  console.debug(`[MockBridge] ${message}`, context)
}

info(message: string, context?: Record<string, unknown>): void {
  console.info(`[MockBridge] ${message}`, context)
}

warn(message: string, context?: Record<string, unknown>): void {
  console.warn(`[MockBridge] ${message}`, context)
}

error(message: string, error?: unknown, context?: Record<string, unknown>): void {
  console.error(`[MockBridge] ${message}`, error, context)
}
```

- [ ] **Step 2: Update `ObsidianBridge`**

`ObsidianBridge` fires a `Notice` for `error`-level only — no new constructor params needed.

Update the import at the top of `src/infrastructure/obsidian/ObsidianBridge.ts`:
```typescript
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
} from '@/domain/ports'
```

Change the `implements` clause (the line that reads `implements SettingsPort, VaultPort, WorkspacePort, NotificationPort`):
```typescript
export class ObsidianBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
```

Add four methods after `saveSettings()` (end of file, before closing brace):

```typescript
// ── LoggerPort ────────────────────────────────────────────────────────────

debug(message: string, context?: Record<string, unknown>): void {
  console.debug(`[Specorator] ${message}`, context)
}

info(message: string, context?: Record<string, unknown>): void {
  console.info(`[Specorator] ${message}`, context)
}

warn(message: string, context?: Record<string, unknown>): void {
  console.warn(`[Specorator] ${message}`, context)
}

error(message: string, error?: unknown, context?: Record<string, unknown>): void {
  console.error(`[Specorator] ${message}`, error, context)
  new Notice(`Specorator error: ${message}`, 6000)
}
```

- [ ] **Step 3: Update `LocalStorageBridge`**

Update the import at the top of `src/infrastructure/localstorage/LocalStorageBridge.ts`:
```typescript
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
} from '@/domain/ports'
```

Change the `implements` clause (the line that reads `implements SettingsPort, VaultPort, WorkspacePort, NotificationPort`):
```typescript
export class LocalStorageBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
```

Add after `saveSettings()` (end of file, before closing brace):

```typescript
// ── LoggerPort ────────────────────────────────────────────────────────────

debug(message: string, context?: Record<string, unknown>): void {
  console.debug(`[Specorator] ${message}`, context)
}

info(message: string, context?: Record<string, unknown>): void {
  console.info(`[Specorator] ${message}`, context)
}

warn(message: string, context?: Record<string, unknown>): void {
  console.warn(`[Specorator] ${message}`, context)
}

error(message: string, error?: unknown, context?: Record<string, unknown>): void {
  console.error(`[Specorator] ${message}`, error, context)
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/mock/MockBridge.ts src/infrastructure/obsidian/ObsidianBridge.ts src/infrastructure/localstorage/LocalStorageBridge.ts
git commit -m "feat(bridges): implement LoggerPort in all three bridges"
```

---

### Task 3: Update `fake-ports.ts`

**Sequencing rule:** This MUST happen before `src/modules/module.ts` is modified. `tests/core/bootstrap.test.ts` calls `fakeModulePorts()` and will fail to compile against the widened `ModulePorts` unless the fake is updated first.

**Files:**
- Modify: `tests/__fakes__/fake-ports.ts`

- [ ] **Step 1: Update the `FakePorts` interface and `fakeModulePorts()` return**

Replace the entire file with:

```typescript
import { vi } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
  LoggerPort,
} from '@/domain/ports'
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance, plus a fresh EventBus and a vi.fn() spy LoggerPort.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 * `logger` spies can be asserted on: `ports.logger.warn`, `ports.logger.error`, etc.
 */
export interface FakePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly bus: EventBus
  readonly bridge: MockBridge
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
    logger: {
      debug: vi.fn(),
      info:  vi.fn(),
      warn:  vi.fn(),
      error: vi.fn(),
    },
    bus: createEventBus(),
    bridge,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Run `bootstrap.test.ts` — verify no regression**

Run: `npx vitest run tests/core/bootstrap.test.ts`
Expected: all tests pass. (The file uses `fakeModulePorts()` — verify it compiles and passes with the updated return shape.)

- [ ] **Step 4: Commit**

```bash
git add tests/__fakes__/fake-ports.ts
git commit -m "test(fakes): add logger spy to FakePorts and fakeModulePorts()"
```

---

## Chunk 2: ModulePorts + Core Events

---

### Task 4: Add `logger` to `ModulePorts`

**Sequencing rule:** Task 3 (fake-ports) must be complete before this step. After this step, `src/ui/main.ts`, `src/plugin/SpecoratorView.ts`, and `src/plugin/main.ts` will have typecheck errors until Tasks 8-9 (Chunk 4) fix them. Don't run the full typecheck between Tasks 4 and 10 — run per-file checks or just the test suite.

**Files:**
- Modify: `src/modules/module.ts`

- [ ] **Step 1: Add `logger` to `ModulePorts`**

In `src/modules/module.ts`, update the `ModulePorts` interface. Add the import and the field:

```typescript
// Add to the existing imports at the top:
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort } from '@/domain/ports'

// Updated ModulePorts (line ~28):
export interface ModulePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly bus: EventBus
}
```

- [ ] **Step 2: Run tests that use `fakeModulePorts()` to verify they still compile and pass**

Run: `npx vitest run tests/core/bootstrap.test.ts`
Expected: all 6 tests pass. (`fakeModulePorts()` already returns `logger`, so the widened `ModulePorts` is satisfied.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/module.ts
git commit -m "feat(modules): add logger: LoggerPort to ModulePorts"
```

---

### Task 5: Create `core-events.ts`

**Files:**
- Create: `src/core/core-events.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/core/core-events.ts
// Declaration merge: adds core:* channels to the shared EventMap.
// Error objects are acceptable here — these events are in-process diagnostic
// signals, never serialised. Consumers: log error.message only, not the full
// Error object, to avoid leaking stack traces.
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'core:module-degraded':  { moduleId: string; error: Error }
    'core:init-complete':    { degradedCount: number }
    'core:destroy-complete': { leakCount: number }
  }
}

export {}
```

(`export {}` is required to make TypeScript treat this as a module so the `declare module` augmentation applies.)

- [ ] **Step 2: Commit**

```bash
git add src/core/core-events.ts
git commit -m "feat(core): add core:* event channels via EventMap declaration merge"
```

---

## Chunk 3: `PluginCore` Implementation (TDD)

---

### Task 6: Write the full `plugin-core.test.ts` (all tests failing)

Write every test case first. All will fail with "cannot find module" until Task 7 creates the implementation.

**Files:**
- Create: `tests/core/plugin-core.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// tests/core/plugin-core.test.ts
import '../../../src/core/core-events' // load EventMap augmentation
import { describe, it, expect, vi } from 'vitest'
import { PluginCore } from '@/core/plugin-core'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import type { ModuleDescriptor } from '@/modules'
import type { CorePorts } from '@/core/plugin-core'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePorts(): CorePorts {
  const { settings, vault, workspace, notifications, logger } = fakeModulePorts()
  return { settings, vault, workspace, notifications, logger }
}

function makeModule(
  id: string,
  overrides?: Partial<ModuleDescriptor>,
): ModuleDescriptor {
  return { id, init: vi.fn(), ...overrides }
}

// ── Validation ────────────────────────────────────────────────────────────────

describe('PluginCore validation', () => {
  it('rejects duplicate module IDs before any module runs', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn() })
    const b = makeModule('a', { init: vi.fn() }) // duplicate
    const core = new PluginCore([a, b], ports)

    await expect(core.init({})).rejects.toThrow(/duplicate.*a/i)
    expect(a.init).not.toHaveBeenCalled()
    expect(b.init).not.toHaveBeenCalled()
  })

  it('rejects self-dependency with a named error', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['a'] })
    const core = new PluginCore([a], ports)

    await expect(core.init({})).rejects.toThrow(/self.*a/i)
  })

  it('rejects unknown dependsOn ref', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['ghost'] })
    const core = new PluginCore([a], ports)

    await expect(core.init({})).rejects.toThrow(/unknown.*ghost/i)
  })

  it('rejects a cycle and names the involved modules', async () => {
    const ports = makePorts()
    const a = makeModule('a', { dependsOn: ['b'] })
    const b = makeModule('b', { dependsOn: ['a'] })
    const core = new PluginCore([a, b], ports)

    // Single assertion — regex must match both IDs in the same message.
    await expect(core.init({})).rejects.toThrow(/cycle/i)
    // Separate instances to avoid re-entrant state mutations on the same core.
    const core2 = new PluginCore([a, b], ports)
    await expect(core2.init({})).rejects.toThrow(/\ba\b/)
    const core3 = new PluginCore([a, b], ports)
    await expect(core3.init({})).rejects.toThrow(/\bb\b/)
  })
})

// ── Topo-sort & init order ────────────────────────────────────────────────────

describe('PluginCore init order', () => {
  it('initialises dependency before dependent', async () => {
    const order: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: () => { order.push('a') } })
    const b = makeModule('b', { dependsOn: ['a'], init: () => { order.push('b') } })
    const core = new PluginCore([b, a], ports) // b declared first — topo must reorder

    await core.init({})
    expect(order).toEqual(['a', 'b'])
  })

  it('preserves declaration order for independent modules at the same depth', async () => {
    const order: string[] = []
    const ports = makePorts()
    const x = makeModule('x', { init: () => { order.push('x') } })
    const y = makeModule('y', { init: () => { order.push('y') } })
    const core = new PluginCore([x, y], ports)

    await core.init({})
    expect(order).toEqual(['x', 'y'])
  })
})

// ── Degraded modules ──────────────────────────────────────────────────────────

describe('PluginCore degraded module handling', () => {
  it('does not abort other modules when one fails init', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('a boom') } })
    const b = makeModule('b', { init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    await core.init({})
    expect(b.init).toHaveBeenCalled()
  })

  it('exposes failed modules via degradedModules getter', async () => {
    const ports = makePorts()
    const err = new Error('a boom')
    const a = makeModule('a', { init: () => { throw err } })
    const core = new PluginCore([a], ports)

    await core.init({})
    expect(core.degradedModules).toEqual([{ id: 'a', error: err }])
  })

  it('degradedModules getter is populated before core:module-degraded fires', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') } })
    const core = new PluginCore([a], ports)

    let countWhenFired = -1
    core.bus.on('core:module-degraded', () => {
      countWhenFired = core.degradedModules.length
    })

    await core.init({})
    expect(countWhenFired).toBe(1) // populated before event fired
  })

  it('emits core:module-degraded with correct moduleId and error', async () => {
    const ports = makePorts()
    const err = new Error('oops')
    const a = makeModule('a', { init: () => { throw err } })
    const core = new PluginCore([a], ports)

    const received: Array<{ moduleId: string; error: Error }> = []
    core.bus.on('core:module-degraded', (env) => received.push(env.payload))

    await core.init({})
    expect(received).toEqual([{ moduleId: 'a', error: err }])
  })

  it('emits core:init-complete with the correct degradedCount', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') } })
    const b = makeModule('b', { init: vi.fn() })
    const core = new PluginCore([a, b], ports)

    let degradedCount = -1
    core.bus.on('core:init-complete', (env) => { degradedCount = env.payload.degradedCount })

    await core.init({})
    expect(degradedCount).toBe(1)
  })

  it('skips degraded modules during destroy', async () => {
    const destroySpy = vi.fn()
    const ports = makePorts()
    const a = makeModule('a', { init: () => { throw new Error('boom') }, destroy: destroySpy })
    const core = new PluginCore([a], ports)

    await core.init({})
    // destroy() is called once during init() rollback; reset the spy
    destroySpy.mockClear()
    await core.destroy()
    // Must NOT be called again in the main destroy sweep
    expect(destroySpy).not.toHaveBeenCalled()
  })
})

// ── destroy order ─────────────────────────────────────────────────────────────

describe('PluginCore destroy order', () => {
  it('destroys in reverse topo order', async () => {
    const order: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: () => { order.push('a') } })
    const b = makeModule('b', { dependsOn: ['a'], init: vi.fn(), destroy: () => { order.push('b') } })
    const core = new PluginCore([a, b], ports)

    await core.init({})
    await core.destroy()
    expect(order).toEqual(['b', 'a'])
  })

  it('emits core:destroy-complete after the full loop', async () => {
    const destroyOrder: string[] = []
    const eventOrder: string[] = []
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: () => { destroyOrder.push('a') } })
    const core = new PluginCore([a], ports)

    core.bus.on('core:destroy-complete', () => { eventOrder.push('event') })

    await core.init({})
    await core.destroy()
    // destroy ran before event
    expect(destroyOrder).toEqual(['a'])
    expect(eventOrder).toEqual(['event'])
  })

  it('continues teardown and logs when a module destroy throws', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: vi.fn() })
    const b = makeModule('b', { init: vi.fn(), destroy: () => { throw new Error('b destroy fail') } })
    // b depends on a → destroy order: b, a
    const bDep = { ...b, dependsOn: ['a'] }
    const core = new PluginCore([a, bDep], ports)

    await core.init({})
    await expect(core.destroy()).resolves.toBeUndefined()
    expect(a.destroy).toHaveBeenCalled()
    expect(ports.logger.error).toHaveBeenCalledWith(
      'module destroy failed',
      expect.any(Error),
      expect.objectContaining({ moduleId: 'b' }),
    )
  })
})

// ── Listener-leak tripwire ────────────────────────────────────────────────────

describe('PluginCore listener-leak tripwire', () => {
  it('fires logger.warn when a module leaks a listener', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) { p.bus.on('core:init-complete', () => {}) }, // subscribe but never unsubscribe
      destroy: vi.fn(), // destroy does nothing — leak!
    })
    const core = new PluginCore([a], ports)

    await core.init({})
    await core.destroy()
    expect(ports.logger.warn).toHaveBeenCalledWith(
      'listener leak detected',
      expect.objectContaining({
        moduleId: 'a',
        released: expect.any(Number),
        subscribed: expect.any(Number),
      }),
    )
  })

  it('does NOT fire a spurious warn when a module subscribes nothing', async () => {
    const ports = makePorts()
    const a = makeModule('a', { init: vi.fn(), destroy: vi.fn() })
    const core = new PluginCore([a], ports)

    await core.init({})
    await core.destroy()
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('emits core:destroy-complete with leakCount=1 when one module leaks', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) { p.bus.on('core:init-complete', () => {}) },
      destroy: vi.fn(),
    })
    const core = new PluginCore([a], ports)

    let leakCount = -1
    core.bus.on('core:destroy-complete', (env) => { leakCount = env.payload.leakCount })

    await core.init({})
    await core.destroy()
    expect(leakCount).toBe(1)
  })
})

// ── EventBus listener error routing ──────────────────────────────────────────

describe('PluginCore listener error routing', () => {
  it('routes listener errors to logger.error with envelope IDs but not payload', async () => {
    const ports = makePorts()
    const a = makeModule('a', {
      init(p) {
        p.bus.on('core:init-complete', () => { throw new Error('listener boom') })
      },
    })
    const core = new PluginCore([a], ports)
    await core.init({}) // this emits core:init-complete, triggering the bad listener

    expect(ports.logger.error).toHaveBeenCalledWith(
      'event listener error',
      expect.any(Error),
      expect.objectContaining({
        channel: 'core:init-complete',
        eventId: expect.any(String),
        traceId: expect.any(String),
      }),
    )

    // Payload must NOT appear in the logger.error call args
    const calls = (ports.logger.error as ReturnType<typeof vi.fn>).mock.calls
    const allArgs = JSON.stringify(calls)
    expect(allArgs).not.toContain('degradedCount')
  })
})
```

- [ ] **Step 2: Run tests — verify they all fail with the right error**

Run: `npx vitest run tests/core/plugin-core.test.ts`
Expected: FAIL with "Cannot find module '@/core/plugin-core'" or similar. All tests should be listed as failed, none skipped.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/core/plugin-core.test.ts
git commit -m "test(core): add plugin-core test suite (red)"
```

---

### Task 7: Implement `PluginCore`

**Files:**
- Create: `src/core/plugin-core.ts`

- [ ] **Step 1: Create `plugin-core.ts` with full implementation**

```typescript
// src/core/plugin-core.ts
import './core-events'
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort } from '@/domain/ports'
import { createEventBus, type EventBus, type EventBusOptions, type EventEnvelope } from '@/domain/shared/event-bus'
import type { ModuleDescriptor, ModulePorts } from '@/modules'

export interface CorePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateModules(modules: ReadonlyArray<ModuleDescriptor>): void {
  const ids = new Set<string>()

  // 1a. Duplicate IDs
  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`duplicate module id: "${mod.id}"`)
    }
    ids.add(mod.id)
  }

  for (const mod of modules) {
    const deps = mod.dependsOn ?? []

    // 1c. Self-dependency
    if (deps.includes(mod.id)) {
      throw new Error(`self-dependency detected for module "${mod.id}"`)
    }

    // 1d. Unknown deps
    for (const dep of deps) {
      if (!ids.has(dep)) {
        throw new Error(`unknown dependency "${dep}" in module "${mod.id}"`)
      }
    }
  }
}

function topoSort(modules: ReadonlyArray<ModuleDescriptor>): ModuleDescriptor[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>() // dep → dependants

  for (const mod of modules) {
    if (!inDegree.has(mod.id)) inDegree.set(mod.id, 0)
    if (!adj.has(mod.id)) adj.set(mod.id, [])
    for (const dep of mod.dependsOn ?? []) {
      inDegree.set(mod.id, (inDegree.get(mod.id) ?? 0) + 1)
      adj.get(dep)!.push(mod.id)
    }
  }

  // Seed queue in declaration order (stable sort)
  const queue: ModuleDescriptor[] = modules.filter((m) => inDegree.get(m.id) === 0)
  const sorted: ModuleDescriptor[] = []
  const byId = new Map(modules.map((m) => [m.id, m]))

  while (queue.length > 0) {
    const mod = queue.shift()!
    sorted.push(mod)
    for (const dependantId of adj.get(mod.id) ?? []) {
      const next = (inDegree.get(dependantId) ?? 1) - 1
      inDegree.set(dependantId, next)
      if (next === 0) queue.push(byId.get(dependantId)!)
    }
  }

  // 1e. Any remaining nodes = cycle
  if (sorted.length !== modules.length) {
    const remaining = modules
      .filter((m) => !sorted.includes(m))
      .map((m) => m.id)
      .join(', ')
    throw new Error(`cycle detected among modules: ${remaining}`)
  }

  return sorted
}

function migrateSettings(
  _modules: ReadonlyArray<ModuleDescriptor>,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return settings // W7 replaces this
}

// ── PluginCore ────────────────────────────────────────────────────────────────

export class PluginCore {
  readonly bus: EventBus
  private readonly _degradedModules: Array<{ id: string; error: Error }> = []
  private readonly ports: CorePorts
  private readonly modules: ReadonlyArray<ModuleDescriptor>
  private sorted: ModuleDescriptor[] = []
  private readonly leakMap = new Map<string, number>()

  constructor(
    modules: ReadonlyArray<ModuleDescriptor>,
    ports: CorePorts,
    busOptions?: EventBusOptions,
  ) {
    this.modules = modules
    this.ports = ports
    this.bus = createEventBus({
      ...busOptions,
      onListenerError: (error: unknown, envelope: EventEnvelope) => {
        const { channel, eventId, traceId } = envelope // payload never accessed
        try {
          ports.logger.error('event listener error', error, { channel, eventId, traceId })
        } catch {
          // discard — cannot re-enter error reporting path
        }
      },
    })
  }

  get degradedModules(): ReadonlyArray<{ id: string; error: Error }> {
    return [...this._degradedModules]
  }

  async init(rawSettings: Record<string, unknown>): Promise<void> {
    // Step 1: validate
    validateModules(this.modules)

    // Step 2: topo-sort
    this.sorted = topoSort(this.modules)

    // Step 3: migrate (stub)
    const settings = migrateSettings(this.modules, rawSettings)

    // Step 4: assemble ModulePorts
    const modulePorts: ModulePorts = { ...this.ports, bus: this.bus }

    // Step 5: init each module
    for (const mod of this.sorted) {
      const subscribedCount = this.bus.listenerCount()
      this.leakMap.set(mod.id, 0) // initialise before init so destroy skips it if init fails

      try {
        await Promise.resolve(mod.init(modulePorts, settings))
        this.leakMap.set(mod.id, this.bus.listenerCount() - subscribedCount)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        try { await Promise.resolve(mod.destroy?.()) } catch { /* ignore */ }
        // Push before emit so getter is consistent when event fires
        this._degradedModules.push({ id: mod.id, error })
        this.bus.emit('core:module-degraded', { moduleId: mod.id, error })
      }
    }

    // Step 6
    this.bus.emit('core:init-complete', { degradedCount: this._degradedModules.length })
  }

  async destroy(): Promise<void> {
    const degradedIds = new Set(this._degradedModules.map((d) => d.id))
    const toDestroy = [...this.sorted].reverse().filter((m) => !degradedIds.has(m.id))

    let leakCount = 0

    for (const mod of toDestroy) {
      const beforeCount = this.bus.listenerCount()

      try {
        await Promise.resolve(mod.destroy?.())
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.ports.logger.error('module destroy failed', error, { moduleId: mod.id })
        continue // skip tripwire for this module
      }

      const afterCount = this.bus.listenerCount()
      const released = beforeCount - afterCount
      const subscribed = this.leakMap.get(mod.id) ?? 0

      if (released < subscribed) {
        this.ports.logger.warn('listener leak detected', {
          moduleId: mod.id,
          released,
          subscribed,
        })
        leakCount++
      }
    }

    this.bus.emit('core:destroy-complete', { leakCount })
  }
}
```

- [ ] **Step 2: Run the test suite**

Run: `npx vitest run tests/core/plugin-core.test.ts`
Expected: all tests pass (or investigate and fix any failures before continuing).

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (Note: `src/ui/main.ts`, `src/plugin/SpecoratorView.ts`, and `src/plugin/main.ts` may have typecheck errors at this point because `ModulePorts` now requires `logger` — this is expected and will be fixed in Chunk 4.)

- [ ] **Step 5: Commit**

```bash
git add src/core/plugin-core.ts
git commit -m "feat(core): implement PluginCore lifecycle with Kahn's validation and listener-leak tripwire"
```

---

## Chunk 4: Wire Entry Points + Docs

Fix the remaining typecheck errors by updating both entry points and `SpecoratorView`, then add the documentation addendum.

---

### Task 8: Thin `main.ts` and update `SpecoratorView`

`SpecoratorView` currently owns its own `bootstrapModules()` call. With `PluginCore`, module initialization moves to `main.ts.onload()`. `SpecoratorView.onOpen()` still mounts the Vue app but no longer boots modules.

**Files:**
- Modify: `src/plugin/main.ts`
- Modify: `src/plugin/SpecoratorView.ts`

- [ ] **Step 1: Rewrite `src/plugin/main.ts`**

```typescript
// src/plugin/main.ts
import { Notice, Plugin, TFolder } from 'obsidian'
import { SpecoratorView, VIEW_TYPE } from './SpecoratorView'
import { SpecoratorSettingTab } from './settings'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { PluginCore } from '@/core/plugin-core'
import { ALL_MODULES } from '@/modules'

export default class SpecoratorPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS }
  core: PluginCore | null = null

  async onload(): Promise<void> {
    await this.loadSettings()

    const bridge = new ObsidianBridge(
      this.app,
      this.settings,
      (s) => this.updateSettings(s),
    )
    this.core = new PluginCore(ALL_MODULES, bridge)
    // Pass already-normalized settings (loadSettings() already called loadData() and merged).
    // Passing raw loadData() would bypass the featuresFolder→specsFolder migration in loadSettings().
    await this.core.init(this.settings as unknown as Record<string, unknown>)

    this.registerView(VIEW_TYPE, (leaf) => new SpecoratorView(leaf, this))

    this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => {
      void this.activateView()
    })

    this.addCommand({
      // Keep the original command id so existing hotkeys and automations survive upgrades.
      // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id
      id: 'open-specorator',
      name: 'Open panel',
      callback: () => void this.activateView(),
    })

    this.addSettingTab(new SpecoratorSettingTab(this.app, this))
    this.detectLegacyVaultLayout()
  }

  // eslint-disable-next-line obsidianmd/detach-leaves
  override onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
    void this.core?.destroy()
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Record<string, unknown> | null
    // NFR-AVS-004: treat legacy `featuresFolder` as `specsFolder` if present
    const raw: Record<string, unknown> = { ...(stored ?? {}) }
    if (typeof raw.featuresFolder === 'string' && typeof raw.specsFolder !== 'string') {
      raw.specsFolder = raw.featuresFolder
    }
    this.settings = { ...DEFAULT_SETTINGS, ...(raw as Partial<PluginSettings>) }
  }

  async updateSettings(partial: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    await this.saveData(this.settings)
  }

  /**
   * DESIGN-AVS-001: If the vault has a `features/` folder but not a `specs/`
   * folder, show a one-time notice informing the user to rename it.
   */
  private detectLegacyVaultLayout(): void {
    const hasFeaturesFolder = this.app.vault.getAbstractFileByPath('features') instanceof TFolder
    const hasSpecsFolder = this.app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder
    if (hasFeaturesFolder && !hasSpecsFolder) {
      new Notice(
        `Specorator: this vault uses the old \`features/\` folder. ` +
          `Please rename it to \`${this.settings.specsFolder}/\` or update the Specs folder setting.`,
        8000,
      )
    }
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app

    const existing = workspace.getLeavesOfType(VIEW_TYPE)
    if (existing.length > 0) {
      void workspace.revealLeaf(existing[0])
      return
    }

    const leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE, active: true })
    void workspace.revealLeaf(leaf)
  }
}
```

- [ ] **Step 2: Update `src/plugin/SpecoratorView.ts`**

`SpecoratorView` no longer boots modules (PluginCore does that in `main.ts.onload()`). It now only mounts the Vue app with port provisions. Remove: `bootstrapModules` call, the inline `ModulePorts` object, `private readonly appBus`, `private bootstrapped`, the `tryAsync` import, the `bootstrapModules` import, the `BootstrappedModules` type import, the `ALL_MODULES` import, and the teardown in `onClose`. Add: `LOGGER_PORT` import + `app.provide(LOGGER_PORT, bridge)`.

**Note on Vue port provisions:** `main.ts` has no Vue app — it's pure Obsidian Plugin class. All five port provisions (including `LOGGER_PORT`) are made in `SpecoratorView.onOpen()` when the Vue app is created. The spec's note about `main.ts` providing ports referred to this indirectly; the actual provision lives in `SpecoratorView`.

```typescript
// src/plugin/SpecoratorView.ts
import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from '@/ui/router'
import { i18n, setLocale, type SupportedLocale } from '@/ui/i18n'
import App from '@/ui/App.vue'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
  ) {
    super(leaf)
  }

  getViewType(): string { return VIEW_TYPE }
  getDisplayText(): string { return 'Specorator' }
  getIcon(): string { return 'layout-dashboard' }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement
    container.empty()

    const mountPoint = container.createDiv({
      cls: 'specorator-root',
      attr: { id: 'specorator-root', style: 'height:100%;overflow:auto;' },
    })

    const bridge = new ObsidianBridge(
      this.app,
      this.plugin.settings,
      (s) => this.plugin.updateSettings(s),
    )

    setLocale(this.plugin.settings.locale as SupportedLocale)

    this.vueApp = createApp(App)
    this.vueApp.use(createPinia())
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(SETTINGS_PORT, bridge)
    this.vueApp.provide(VAULT_PORT, bridge)
    this.vueApp.provide(WORKSPACE_PORT, bridge)
    this.vueApp.provide(NOTIFICATION_PORT, bridge)
    this.vueApp.provide(LOGGER_PORT, bridge)
    this.vueApp.mount(mountPoint)
  }

  async onClose(): Promise<void> {
    this.vueApp?.unmount()
    this.vueApp = null
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. If errors remain, fix them before continuing.

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/main.ts src/plugin/SpecoratorView.ts
git commit -m "feat(plugin): thin main.ts to PluginCore bootstrap; simplify SpecoratorView"
```

---

### Task 9: Update `src/ui/main.ts`

**Files:**
- Modify: `src/ui/main.ts`

- [ ] **Step 1: Add `logger` to the inline ports object and provide `LOGGER_PORT`**

In `src/ui/main.ts`:

1. Update the import block for ports:
```typescript
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'
```

2. Add `logger: bridge` to the `ports` object (the one passed to `bootstrapModules`):
```typescript
const ports: ModulePorts = {
  settings: bridge,
  vault: bridge,
  workspace: bridge,
  notifications: bridge,
  logger: bridge,   // ← add this
  bus: appBus,
}
```

3. The `app.provide(...)` calls are inside the `.then()` callback — add `LOGGER_PORT` there:
```typescript
void bridge.getSettings()
  .then((settings) => bootstrapModules(ALL_MODULES, ports, settings as unknown as Readonly<Record<string, unknown>>))
  .then(() => {
    app.provide(SETTINGS_PORT, bridge)
    app.provide(VAULT_PORT, bridge)
    app.provide(WORKSPACE_PORT, bridge)
    app.provide(NOTIFICATION_PORT, bridge)
    app.provide(LOGGER_PORT, bridge)   // ← add this inside the .then() callback
    app.mount(mountPoint ?? '#app')
  })
  .catch(console.error)
```

- [ ] **Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: exits 0 with no errors anywhere.

- [ ] **Step 3: Run full test suite + coverage**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 4: Run verify gate**

Run: `npm run verify`
Expected: exits 0 (typecheck + lint + tests + coverage thresholds all pass).

- [ ] **Step 5: Commit**

```bash
git add src/ui/main.ts
git commit -m "feat(standalone): add LoggerPort to ui/main.ts module ports and Vue provider"
```

---

### Task 10: `module-authoring.md` addendum + file `emitAsync` bug

**Files:**
- Modify: `docs/module-authoring.md`

- [ ] **Step 1: Update the `ModulePorts` reference table in `docs/module-authoring.md`**

Find the `ModulePorts` table and add the `logger` row:

```markdown
| `logger` | `LoggerPort` | Structured logging (debug/info/warn/error). |
```

- [ ] **Step 2: Add constraints section to `docs/module-authoring.md`**

Find the appropriate section (likely near the `init` / `destroy` lifecycle docs) and add:

```markdown
### Bus subscription ownership

All bus subscriptions acquired in `init()` must be stored in module-local scope and released in `destroy()`:

```ts
// ✅ correct
let unsub: (() => void) | null = null

const myModule = defineModule({
  id: 'my-module',
  init(ports) {
    unsub = ports.bus.on('some:event', handler)
  },
  destroy() {
    unsub?.()
    unsub = null
  },
})
```

Do **not** delegate unsubscription to Vue component lifecycle hooks (`onUnmounted`). A module may outlive or be destroyed independently of any component, and leaked listeners will trigger the W4 listener-leak tripwire.

Modules must not hold references to sibling module instances. All inter-module communication goes through the shared `EventBus`. Do not emit bus events from `destroy()` — this can corrupt the per-module listener delta measurement in the tripwire.
```

- [ ] **Step 3: File the `emitAsync` bug as a GitHub issue**

Run from Git Bash (or adjust syntax for PowerShell using `@'...'@` heredoc):

```bash
gh issue create \
  --title "bug(event-bus): emitAsync does not isolate per-listener errors" \
  --body "## Problem

createEventBus().emitAsync() does not isolate per-listener errors. If any listener throws, the rejection propagates through runBounded and rejects the emitAsync caller.

This diverges from emit()'s behaviour, where each listener is wrapped in trySync and errors are routed to onListenerError without aborting the dispatch.

## Expected behaviour

emitAsync should wrap each listener invocation in try/catch (or equivalent) and route errors to onListenerError, consistent with emit().

## File

src/domain/shared/event-bus.ts — runBounded / emitAsync

## Discovered in

W4 spec review (web research finding Q4.3)."
```

PowerShell alternative (copy the body text from the bash version above):
```powershell
gh issue create --title "bug(event-bus): emitAsync does not isolate per-listener errors" --body @'
## Problem
createEventBus().emitAsync() does not isolate per-listener errors. If any listener throws, the rejection propagates through runBounded and rejects the emitAsync caller.

This diverges from emit()'s behaviour, where each listener is wrapped in trySync and errors are routed to onListenerError without aborting the dispatch.

## Expected behaviour
emitAsync should wrap each listener invocation in try/catch (or equivalent) and route errors to onListenerError, consistent with emit().

## File
src/domain/shared/event-bus.ts - runBounded / emitAsync

## Discovered in
W4 spec review (web research finding Q4.3).
'@
```

- [ ] **Step 4: Commit docs**

```bash
git add docs/module-authoring.md
git commit -m "docs(modules): add logger to ModulePorts table and bus subscription constraints from W4"
```

---

## Final verification

- [ ] **Run the full verify gate**

Run: `npm run verify`
Expected: exits 0.

- [ ] **Run the plugin build**

Run: `npm run build`
Expected: exits 0, `main.js` written to project root.

- [ ] **Check all W4 acceptance criteria**

| AC | Where |
|---|---|
| `PluginCore` class in `src/core/plugin-core.ts` | Task 7 |
| Module validation rejects dup IDs / self-dep / unknown deps / cycles | `validateModules()` + `topoSort()` |
| PluginCore owns/configures shared EventBus | Constructor, `this.bus` |
| EventBus listener errors → LoggerPort with envelope IDs only | `onListenerError` in constructor |
| Listener-leak tripwire fires warn log | `destroy()` tripwire block |
| Degraded-module list via getter + `core:module-degraded` event | `_degradedModules` + push-before-emit |
| `main.ts` becomes thin bootstrap | Task 8 |
