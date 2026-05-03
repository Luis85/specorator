# W2 — Module System Design

**Date:** 2026-05-04  
**Issue:** #100  
**Workstream:** W2 of Epic #85 (pre-feature infrastructure hardening)  
**Status:** Approved

---

## Context

The plugin currently has a flat bootstrap: `SpecoratorView.onOpen()` constructs `ObsidianBridge`, provides the four narrow ports, and mounts the Vue app. There is no concept of bounded-context modules — all feature logic would accumulate directly in `src/application/` and `src/ui/` with no enforced boundaries.

W1 delivered four narrow ports (`SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`). W3 delivered `createEventBus()` with typed `EventMap`, `EventEnvelope`, trace correlation, and bounded `emitAsync`. W2 builds the module contract on top of these two foundations.

---

## Goal

Introduce a `defineModule()` factory and `ModuleDescriptor` type that:

1. Gives each feature area a typed, bounded-context home under `src/modules/`.
2. Declares its commands, view intents, settings schema fields, locale messages, and lifecycle hooks in one place.
3. Receives only the narrow `ModulePorts` object (4 ports + EventBus) — no aggregate bridge, no direct sibling-module imports.
4. Proves the contract end-to-end with a `hello-module` demo wired into `SpecoratorView`.

W4 (`PluginCore`) will replace the provisional bootstrap with validation, topo-sort, and listener-leak detection. W7 (settings schema) will implement the declarative tab renderer and migration pipeline. W2 only defines the contract and proves it compiles and runs.

---

## File Structure

```
src/
  modules/
    module.ts          ← defineModule() factory + all module types
    index.ts           ← public re-exports
    hello/
      hello-events.ts  ← EventMap declaration merging for 'hello:*' channels
      hello-module.ts  ← demo module descriptor
      HelloView.vue    ← demo SFC proving Vue SFC isolation convention
  core/
    bootstrap.ts       ← bootstrapModules() provisional helper (replaced by PluginCore in W4)
tests/
  modules/
    hello/
      hello-module.test.ts   ← init emits event; destroy is a no-op
```

`src/modules/` sits at the **application/infrastructure boundary**: it may import from `src/domain/` (ports, Result, EventBus, settings types) but must not import from `src/plugin/` or `obsidian` directly. `src/core/` is created in W2 with only `bootstrap.ts`; W4 adds `plugin-core.ts`.

---

## Type Definitions (`src/modules/module.ts`)

### `SettingsFieldDescriptor`

```ts
export interface SettingsFieldDescriptor {
  readonly type: 'toggle' | 'text' | 'number' | 'dropdown'
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly default: unknown
}
```

### `ModuleSettingsSchema`

```ts
export interface ModuleSettingsSchema {
  readonly fields: ReadonlyArray<SettingsFieldDescriptor>
}
```

W7 will implement the settings tab renderer that reads this schema. W2 just defines the shape.

### `ModuleCommandDescriptor`

```ts
export interface ModuleCommandDescriptor {
  readonly id: string    // collision-resistant: 'module-id:action-name'
  readonly name: string
  readonly callback: () => void
}
```

### `ModuleViewIntent`

```ts
export interface ModuleViewIntent {
  readonly id: string
  readonly label: string
}
```

View intents are declarations only in W2. W4/W11 wire them to actual Vue routes and Obsidian views.

### `ModulePorts`

```ts
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort } from '@/domain/ports'
import type { EventBus } from '@/domain/shared/event-bus'

export interface ModulePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly bus: EventBus
}
```

`ModulePorts` is defined in `src/modules/` (not `src/domain/`) — it is a module-system concern, not a domain concern.

### `ModuleDescriptor<S>`

```ts
export interface ModuleDescriptor<S = Record<string, unknown>> {
  readonly id: string
  readonly dependsOn?: ReadonlyArray<string>
  readonly commands?: ReadonlyArray<ModuleCommandDescriptor>
  readonly views?: ReadonlyArray<ModuleViewIntent>
  readonly settingsSchema?: ModuleSettingsSchema
  /**
   * Flat locale message maps only. W8 may widen to nested objects if vue-i18n
   * nested key syntax is adopted; until then, keep keys dotted and flat.
   * Example: `{ en: { 'hello.title': 'Hello' } }`
   */
  readonly messages?: Partial<Record<string, Record<string, string>>>
  init(ports: ModulePorts, settings: S): void | Promise<void>
  /**
   * Called by W4 PluginCore when settings change. Not invoked by the W2
   * provisional bootstrapModules() — wiring is deferred to W4.
   */
  onSettingsChange?(next: S): void | Promise<void>
  destroy?(): void | Promise<void>
}
```

`dependsOn` is declared now so modules can express their dependency graph; topo-sort enforcement is deferred to W4. All fields except `id` and `init` are optional. `extensions` is omitted — no workstream in scope consumes it; it can be added when a concrete consumer is specified.

### `defineModule()`

```ts
export function defineModule<S = Record<string, unknown>>(
  descriptor: ModuleDescriptor<S>
): ModuleDescriptor<S> {
  return descriptor
}
```

Identity function — exists for type-narrowing and as a consistent authoring convention. No runtime logic in W2.

---

## Provisional Bootstrap (`src/core/bootstrap.ts`)

```ts
import type { ModuleDescriptor, ModulePorts } from '@/modules'

export interface BootstrappedModules {
  readonly teardown: () => Promise<void>
}

export async function bootstrapModules(
  modules: ReadonlyArray<ModuleDescriptor>,
  ports: ModulePorts,
  settings: Readonly<Record<string, unknown>>,
): Promise<BootstrappedModules> {
  for (const mod of modules) {
    await mod.init(ports, settings)
  }
  return {
    teardown: async () => {
      for (const mod of [...modules].reverse()) {
        await mod.destroy?.()
      }
    },
  }
}
```

Intentionally thin: sequential init in declaration order, reverse-order teardown. No validation, no topo-sort, no leak detection — all W4.

**Type-safety constraint:** `ReadonlyArray<ModuleDescriptor>` erases the generic `S` to `Record<string, unknown>`. This is intentional for W2 — `bootstrapModules()` only works with modules that use the default `S`. Any module that declares `defineModule<MySettings>({...})` cannot be passed to `bootstrapModules()` without a type error. W4's `PluginCore` will solve this with a discriminated union or covariant wrapper. For W2, all modules use `S = Record<string, unknown>`.

---

## `SpecoratorView` Integration

```ts
// Added fields
private appBus: EventBus = createEventBus()
private bootstrapped: BootstrappedModules | null = null

// onOpen — after bridge construction, before vueApp.mount()
const ports: ModulePorts = {
  settings: bridge, vault: bridge, workspace: bridge,
  notifications: bridge, bus: this.appBus,
}
this.bootstrapped = await bootstrapModules(ALL_MODULES, ports, this.plugin.settings)

// onClose — before vueApp.unmount()
await this.bootstrapped?.teardown()
this.bootstrapped = null
```

`ALL_MODULES` exported from `src/modules/index.ts`. W4 will move `appBus` ownership to `PluginCore`; `SpecoratorView` will receive it as a constructor argument.

The standalone `src/ui/main.ts` also gets `bootstrapModules()` wired (browser-mode modules should run the same init path).

---

## Demo Module (`src/modules/hello/`)

### `hello-events.ts`

```ts
import type {} from '@/domain/shared/event-bus'
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
```

### `hello-module.ts`

```ts
import './hello-events'
import { defineModule } from '@/modules'

export const helloModule = defineModule({
  id: 'hello',
  commands: [
    { id: 'hello:open-view', name: 'Hello: Open view', callback: () => {} },
  ],
  views: [{ id: 'hello-view', label: 'Hello' }],
  settingsSchema: {
    fields: [
      { type: 'toggle', key: 'showBadge', label: 'Show badge', default: true },
    ],
  },
  messages: {
    en: { 'hello.title': 'Hello from Specorator' },
    de: { 'hello.title': 'Hallo von Specorator' },
  },
  init(ports) {
    ports.bus.emit('hello:initialized', { moduleId: 'hello' })
  },
})
```

### `HelloView.vue`

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>
<template>
  <div data-testid="hello-view">{{ t('hello.title') }}</div>
</template>
```

---

## ESLint Cross-Module Import Ban

The existing `eslint.config.js` already has a `src/modules/**/*.ts` block (lines ~262–268) containing only a `max-lines` rule. Add a **second** `src/modules/**` block alongside it — do not collapse them, as that would lose the `max-lines` rule:

```js
// Second block — cross-module import ban (sibling module imports forbidden)
{
  files: ['src/modules/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          // Ban alias-path imports into sibling modules
          regex: String.raw`@/modules/(?!(index|module)$)[^/]+/`,
          message: 'Modules must not import sibling modules directly. Use the EventBus.',
        },
        {
          // Ban relative imports into sibling modules (e.g. ../other-module/foo)
          regex: String.raw`\.\./[^/]+/`,
          message: 'Modules must not import sibling modules directly. Use the EventBus.',
        },
      ],
    }],
  },
}
```

Allows: `@/modules/index`, `@/modules/module`, intra-module relative imports (`./hello-events`).  
Bans: `@/modules/hello/` from `@/modules/other/`, and `../hello/hello-module` from `../other/`.

## ESLint `src/core/**` Layer Guard

`src/core/` is a new layer with no existing ESLint block. Add one banning obsidian/plugin/ui/vue to keep it at the application/infrastructure boundary:

```js
{
  files: ['src/core/**'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: 'obsidian', message: 'src/core must not import obsidian directly.' },
        { name: 'vue', message: 'src/core must not import vue.' },
        { name: 'pinia', message: 'src/core must not import pinia.' },
      ],
      patterns: [
        { regex: String.raw`@/plugin/`, message: 'src/core must not import src/plugin.' },
        { regex: String.raw`@/ui/`, message: 'src/core must not import src/ui.' },
      ],
    }],
  },
}
```

---

## `docs/module-authoring.md`

Documents:
- What a module is and when to create one
- File layout convention (`module-name/module-name-module.ts`, `*-events.ts`, `*.vue`)
- `defineModule()` usage with annotated example
- `ModulePorts` — what each port does, when to use `bus` vs. Vue emits
- Vue SFC isolation rules (scoped styles, narrow props/emits, no sibling-module imports)
- Event channel naming convention (`module-id:event-name`)
- Where module settings fields go (W7 will render them)
- When to use Vue emits vs. EventBus (parent/child = emits; cross-module = bus)
- Import path convention: intra-module relative imports (`./hello-events`) are allowed; any reach beyond the module's own directory must use the `@/` alias (never `../../domain/...`)

---

## Tests

### `tests/__fakes__/fake-ports.ts` — update required

Add `bus` to `FakePorts` and `fakeModulePorts()` so the factory returns a complete `ModulePorts`-compatible object:

```ts
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

export interface FakePorts {
  readonly bridge: MockBridge
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly bus: EventBus  // ← added in W2
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    bridge,
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
    bus: createEventBus(),  // ← added in W2
  }
}
```

All existing tests that destructure `fakeModulePorts()` are unaffected — they don't reference `bus`.

### `tests/modules/hello/hello-module.test.ts`

- `init()` emits `hello:initialized` on the bus with correct `moduleId` payload
- `destroy` is undefined (no leak — bus listener was never subscribed)
- Constructs `ModulePorts` from `fakeModulePorts()` directly (the updated factory includes `bus`)

### Coverage include

Add `src/modules/**` and `src/core/**` to `vitest.config.ts` `coverage.include` so module and bootstrap code is tracked against thresholds:

```ts
coverage: {
  include: [
    'src/domain/**',
    'src/application/**',
    'src/infrastructure/**',
    'src/modules/**',   // ← added in W2
    'src/core/**',      // ← added in W2
  ],
}
```

---

## Acceptance Criteria (from issue #100)

- [x] `src/modules/` directory established
- [x] `defineModule()` factory typed end-to-end
- [x] Module contract receives narrow ports and EventBus without reintroducing an aggregate bridge
- [x] At least one demo module (`hello-module`) wired through the contract
- [x] Demo module includes at least one Vue SFC proving the UI encapsulation convention
- [x] Demo module includes a `*-events.ts` EventMap augmentation example
- [x] ESLint enforces cross-module import ban
- [x] `docs/module-authoring.md` walks contributor through adding a module

---

## What W2 Explicitly Defers

| Concern | Deferred to |
|---|---|
| Topo-sort of `dependsOn` | W4 PluginCore |
| Module validation (duplicate IDs, cycles) | W4 PluginCore |
| Listener-leak tripwire | W4 PluginCore |
| Degraded-module reporting | W4 PluginCore |
| Settings tab rendering from schema | W7 |
| Per-module settings migration pipeline | W7 |
| vue-i18n `messages` merge per module | W8 |
| Storybook stories for HelloView | W9 |
| `onSettingsChange` invocation (settings-change pipeline) | W4 PluginCore |
| View intent → router/Obsidian view wiring | W4 / W11 |
| Scaffold script for new modules | W12 |
