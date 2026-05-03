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
  readonly messages?: Partial<Record<string, Record<string, string>>>
  readonly extensions?: ReadonlyArray<unknown>
  init(ports: ModulePorts, settings: S): void | Promise<void>
  onSettingsChange?(next: S): void | Promise<void>
  destroy?(): void | Promise<void>
}
```

`dependsOn` is declared now so modules can express their dependency graph; topo-sort enforcement is deferred to W4. All fields except `id` and `init` are optional.

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
  settings: Record<string, unknown>,
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

Added to `eslint.config.js` as a new config block scoped to `src/modules/**`:

```js
{
  files: ['src/modules/**'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        regex: String.raw`@/modules/(?!(index|module)$)[^/]+/`,
        message: 'Modules must not import sibling modules directly. Use the EventBus.',
      }],
    }],
  },
}
```

Allows: `@/modules/index`, `@/modules/module`.  
Bans: `@/modules/hello/` from `@/modules/other/`, etc.

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

---

## Tests

`tests/modules/hello/hello-module.test.ts`:
- `init()` emits `hello:initialized` on the bus with correct payload
- `destroy()` is a no-op (no leak)
- Uses `fakeModulePorts()` from `tests/__fakes__/fake-ports.ts` plus a real `createEventBus()`

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
| View intent → router/Obsidian view wiring | W4 / W11 |
| Scaffold script for new modules | W12 |
