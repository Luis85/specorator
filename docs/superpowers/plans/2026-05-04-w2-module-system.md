# W2 — Module System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce `defineModule()` factory, `ModuleDescriptor<S>` type contract, provisional `bootstrapModules()` helper, and `hello-module` demo wired end-to-end through `SpecoratorView` and the standalone browser UI.

**Architecture:** All types in `src/modules/module.ts`; `src/modules/index.ts` re-exports plus the `ALL_MODULES` registry; `src/core/bootstrap.ts` owns provisional lifecycle (sequential init, reverse teardown); `src/modules/hello/` is the demo proving all contract surfaces; `SpecoratorView` and `src/ui/main.ts` call `bootstrapModules()` on open/close.

**Tech Stack:** TypeScript 5, Vue 3 (`<script setup>`), Vitest, ESLint flat config

**Worktree:** `D:\Projects\specorator-plugin\.worktrees\w2-module-system-spec` on branch `feature/w2-module-system-spec`. All paths are relative to that root.

**Spec:** `docs/superpowers/specs/2026-05-04-w2-module-system-design.md`

---

## Chunk 1: Core types, fake-ports update, failing test

### Task 1: Create `src/modules/module.ts`

**Files:**
- Create: `src/modules/module.ts`

- [ ] **Step 1.1: Create the file with all types and the factory**

```typescript
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort } from '@/domain/ports'
import type { EventBus } from '@/domain/shared/event-bus'

export interface SettingsFieldDescriptor {
  readonly type: 'toggle' | 'text' | 'number' | 'dropdown'
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly default: unknown
}

export interface ModuleSettingsSchema {
  readonly fields: ReadonlyArray<SettingsFieldDescriptor>
}

export interface ModuleCommandDescriptor {
  readonly id: string
  readonly name: string
  readonly callback: () => void
}

export interface ModuleViewIntent {
  readonly id: string
  readonly label: string
}

export interface ModulePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly bus: EventBus
}

export interface ModuleDescriptor<S = Record<string, unknown>> {
  readonly id: string
  readonly dependsOn?: ReadonlyArray<string>
  readonly commands?: ReadonlyArray<ModuleCommandDescriptor>
  readonly views?: ReadonlyArray<ModuleViewIntent>
  readonly settingsSchema?: ModuleSettingsSchema
  /**
   * Flat locale message maps. Keys are dotted strings, e.g. `'hello.title'`.
   * W8 may widen this to support nested objects when vue-i18n message merging lands.
   */
  readonly messages?: Partial<Record<string, Record<string, string>>>
  init(ports: ModulePorts, settings: S): void | Promise<void>
  /**
   * Invoked by W4 PluginCore when settings change.
   * NOT called by the W2 provisional bootstrapModules().
   */
  onSettingsChange?(next: S): void | Promise<void>
  destroy?(): void | Promise<void>
}

export function defineModule<S = Record<string, unknown>>(
  descriptor: ModuleDescriptor<S>,
): ModuleDescriptor<S> {
  return descriptor
}
```

- [ ] **Step 1.2: Verify zero type errors**

Run: `npx tsc --noEmit -p tsconfig.lint.json 2>&1 | Select-String "modules/module"`

Expected: no output (no errors touching this file)

---

### Task 2: Create `src/modules/index.ts` (types only — `ALL_MODULES` added in Task 9)

**Files:**
- Create: `src/modules/index.ts`

- [ ] **Step 2.1: Create the re-export barrel**

```typescript
export { defineModule } from './module'
export type {
  ModuleDescriptor,
  ModulePorts,
  ModuleSettingsSchema,
  SettingsFieldDescriptor,
  ModuleCommandDescriptor,
  ModuleViewIntent,
} from './module'
```

`ALL_MODULES` is added in Task 9 once `hello-module` exists.

---

### Task 3: Update `tests/__fakes__/fake-ports.ts`

**Files:**
- Modify: `tests/__fakes__/fake-ports.ts`

`FakePorts` currently has 5 fields (bridge + 4 ports). Add `bus: EventBus` so `fakeModulePorts()` returns a `ModulePorts`-compatible object. Existing tests that destructure only the 4-port fields are unaffected.

- [ ] **Step 3.1: Replace the file content**

```typescript
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
} from '@/domain/ports'
import { createEventBus } from '@/domain/shared/event-bus'
import type { EventBus } from '@/domain/shared/event-bus'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance, plus a fresh EventBus.
 *
 * `bridge` is exposed so tests can inspect recorded notices and opened-file paths.
 * `bus` is exposed so tests can subscribe to events before calling module init.
 */
export interface FakePorts {
  readonly bridge: MockBridge
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly bus: EventBus
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    bridge,
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
    bus: createEventBus(),
  }
}
```

- [ ] **Step 3.2: Verify the existing fake-ports test still passes**

Run: `npx vitest run tests/__fakes__/fake-ports.test.ts`

Expected: PASS

- [ ] **Step 3.3: Run all 153 existing tests to confirm nothing regressed**

Run: `npx vitest run`

Expected: 153 passed, 0 failed

---

### Task 4: Write the failing `hello-module` test

**Files:**
- Create: `tests/modules/hello/hello-module.test.ts`

This test imports `helloModule` which does not exist yet — it will fail with an import error. That is the correct TDD starting point.

- [ ] **Step 4.1: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { helloModule } from '@/modules/hello/hello-module'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

describe('helloModule', () => {
  it('emits hello:initialized on init with the correct moduleId', () => {
    const ports = fakeModulePorts()
    const received: Array<{ moduleId: string }> = []
    ports.bus.on('hello:initialized', (envelope) => {
      received.push(envelope.payload)
    })

    helloModule.init(ports, {})

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ moduleId: 'hello' })
  })

  it('has no destroy method (no bus subscriptions to clean up)', () => {
    expect(helloModule.destroy).toBeUndefined()
  })
})
```

- [ ] **Step 4.2: Run the test and confirm it fails with a missing module error**

Run: `npx vitest run tests/modules/hello/hello-module.test.ts 2>&1 | Select-String -Pattern "(FAIL|Cannot find|Failed to resolve|ERR)" | Select-Object -First 5`

Expected: FAIL — error like `Cannot find module '@/modules/hello/hello-module'` or `Failed to resolve '@/modules/hello/hello-module'`

---

### Chunk 1 commit checkpoint

- [ ] **Step 4.3: Commit the chunk 1 foundation**

```bash
git add src/modules/module.ts src/modules/index.ts tests/__fakes__/fake-ports.ts tests/modules/hello/hello-module.test.ts
git commit -m "feat(w2): module types, index, fake-ports bus field, failing hello test"
```

---

## Chunk 2: Hello module + bootstrap + integrations

### Task 5: Create `src/modules/hello/hello-events.ts`

**Files:**
- Create: `src/modules/hello/hello-events.ts`

Declaration merging extends the global `EventMap` interface from `@/domain/shared/event-bus` with `hello:*` channels. The `import type {} from '...'` is required: it forces TypeScript to treat this as a module (not an ambient script), which is necessary for `declare module` augmentation to scope correctly.

- [ ] **Step 5.1: Create the file**

```typescript
import type {} from '@/domain/shared/event-bus'

declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
```

---

### Task 6: Create `src/modules/hello/hello-module.ts` and make tests pass

**Files:**
- Create: `src/modules/hello/hello-module.ts`

- [ ] **Step 6.1: Create the module**

```typescript
import './hello-events'
import { defineModule } from '@/modules'

export const helloModule = defineModule({
  id: 'hello',
  commands: [{ id: 'hello:open-view', name: 'Hello: Open view', callback: () => {} }],
  views: [{ id: 'hello-view', label: 'Hello' }],
  settingsSchema: {
    fields: [{ type: 'toggle', key: 'showBadge', label: 'Show badge', default: true }],
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

Note: `init` does not call `ports.bus.on()`, so no `destroy` method is needed — confirmed by the test expectation.

- [ ] **Step 6.2: Run the test and confirm it passes**

Run: `npx vitest run tests/modules/hello/hello-module.test.ts`

Expected: PASS — 2 tests

- [ ] **Step 6.3: Commit**

```bash
git add src/modules/hello/hello-events.ts src/modules/hello/hello-module.ts
git commit -m "feat(w2): add hello-module with EventMap augmentation (tests green)"
```

---

### Task 7: Create `src/core/bootstrap.ts`

**Files:**
- Create: `src/core/bootstrap.ts`

`init` and `destroy` both return `void | Promise<void>`. `Promise.resolve()` wrapping ensures we always await a settled Promise, satisfying `@typescript-eslint/await-thenable`. **Do NOT simplify to bare `await mod.init(...)` — the lint gate enforces `await-thenable: error` and bare await of `void` will fail.**

- [ ] **Step 7.1: Create the file**

```typescript
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
    await Promise.resolve(mod.init(ports, settings))
  }
  return {
    teardown: async () => {
      for (const mod of [...modules].reverse()) {
        if (mod.destroy !== undefined) {
          await Promise.resolve(mod.destroy())
        }
      }
    },
  }
}
```

`ReadonlyArray<ModuleDescriptor>` erases the generic `S` to `Record<string, unknown>`. This is intentional for W2 — W4 PluginCore will use a different calling convention for typed settings. All W2 modules use `S = Record<string, unknown>` (the default).

- [ ] **Step 7.2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.lint.json 2>&1 | Select-String "core/bootstrap"`

Expected: no output (no errors)

---

### Task 8: Create `src/modules/hello/HelloView.vue`

**Files:**
- Create: `src/modules/hello/HelloView.vue`

Proves the Vue SFC isolation convention: `<script setup>`, scoped styles, no direct sibling-module imports.

Note: `t('hello.title')` will render as the key string `'hello.title'` in standalone dev until W8 wires per-module message merging into vue-i18n. This is expected.

- [ ] **Step 8.1: Create the SFC**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div data-testid="hello-view">{{ t('hello.title') }}</div>
</template>

<style scoped>
/* Module-scoped styles only. Do not add global selectors here. */
</style>
```

---

### Task 9: Update `src/modules/index.ts` with `ALL_MODULES`

**Files:**
- Modify: `src/modules/index.ts`

- [ ] **Step 9.1: Replace the file content**

```typescript
import type { ModuleDescriptor } from './module'
import { helloModule } from './hello/hello-module'

export { defineModule } from './module'
export type {
  ModuleDescriptor,
  ModulePorts,
  ModuleSettingsSchema,
  SettingsFieldDescriptor,
  ModuleCommandDescriptor,
  ModuleViewIntent,
} from './module'
export { helloModule }

export const ALL_MODULES: ReadonlyArray<ModuleDescriptor> = [helloModule]
```

`ALL_MODULES` is the module registry consumed by `SpecoratorView` and `ui/main.ts`. Add new modules here in declaration order (they init in order, destroy in reverse).

---

### Task 10: Wire `src/plugin/SpecoratorView.ts`

**Files:**
- Modify: `src/plugin/SpecoratorView.ts`

`src/plugin/` has `no-restricted-imports: off` so it can import from `@/core/` and `@/domain/shared/`.

`onOpen` becomes `async` to `await bootstrapModules()`. `onClose` becomes `async` to `await bootstrapped.teardown()`.

- [ ] **Step 10.1: Replace the file content**

```typescript
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
} from '@/infrastructure/bridge/ports'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import { createEventBus } from '@/domain/shared/event-bus'
import { bootstrapModules, type BootstrappedModules } from '@/core/bootstrap'
import { ALL_MODULES, type ModulePorts } from '@/modules'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE = 'specorator'

export class SpecoratorView extends ItemView {
  private vueApp: VueApp | null = null
  private readonly appBus = createEventBus()
  private bootstrapped: BootstrappedModules | null = null

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: SpecoratorPlugin,
  ) {
    super(leaf)
  }

  getViewType(): string {
    return VIEW_TYPE
  }
  getDisplayText(): string {
    return 'Specorator'
  }
  getIcon(): string {
    return 'layout-dashboard'
  }

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

    const ports: ModulePorts = {
      settings: bridge,
      vault: bridge,
      workspace: bridge,
      notifications: bridge,
      bus: this.appBus,
    }
    this.bootstrapped = await bootstrapModules(
      ALL_MODULES,
      ports,
      this.plugin.settings as Readonly<Record<string, unknown>>,
    )

    this.vueApp = createApp(App)
    this.vueApp.use(createPinia())
    this.vueApp.use(router)
    this.vueApp.use(i18n)
    this.vueApp.provide(SETTINGS_PORT, bridge)
    this.vueApp.provide(VAULT_PORT, bridge)
    this.vueApp.provide(WORKSPACE_PORT, bridge)
    this.vueApp.provide(NOTIFICATION_PORT, bridge)
    this.vueApp.mount(mountPoint)
  }

  async onClose(): Promise<void> {
    if (this.bootstrapped !== null) {
      await this.bootstrapped.teardown()
      this.bootstrapped = null
    }
    this.vueApp?.unmount()
    this.vueApp = null
  }
}
```

`this.plugin.settings as Readonly<Record<string, unknown>>` — the cast is needed because `PluginSettings` has no index signature. The cast is safe: all `PluginSettings` property types are subtypes of `unknown`. Try without the cast first; add it if TypeScript reports an assignability error.

- [ ] **Step 10.2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.lint.json 2>&1 | Select-String "SpecoratorView"`

Expected: no output

---

### Task 11: Wire `src/ui/main.ts`

**Files:**
- Modify: `src/ui/main.ts`

`src/ui/main.ts` has `no-restricted-imports: off` (it's the standalone composition root). Bootstrap runs asynchronously before mounting so the hello module's `init()` fires before the Vue app attaches.

`void promise.then(...)` explicitly discards the outer Promise — this is the correct idiom for `@typescript-eslint/no-floating-promises` in a top-level fire-and-forget context.

- [ ] **Step 11.1: Replace the file content**

```typescript
/**
 * Standalone entry point — runs in a regular browser via `npm run dev`.
 * Uses LocalStorageBridge in production and MockBridge in development.
 *
 * CSS custom properties are injected here (not in App.vue) so they are
 * scoped to standalone mode only and never leak into Obsidian's theme.
 */
import './standalone.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
} from '@/infrastructure/bridge/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEV_FIXTURES } from '@/infrastructure/mock/fixtures'
import { createEventBus } from '@/domain/shared/event-bus'
import { bootstrapModules } from '@/core/bootstrap'
import { ALL_MODULES, type ModulePorts } from '@/modules'

const bridge = import.meta.env.PROD ? new LocalStorageBridge() : new MockBridge(DEV_FIXTURES)
const mountPoint = document.querySelector('#app')

mountPoint?.classList.add('specorator-root')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

const appBus = createEventBus()
const ports: ModulePorts = {
  settings: bridge,
  vault: bridge,
  workspace: bridge,
  notifications: bridge,
  bus: appBus,
}

void bootstrapModules(ALL_MODULES, ports, {}).then(() => {
  app.provide(SETTINGS_PORT, bridge)
  app.provide(VAULT_PORT, bridge)
  app.provide(WORKSPACE_PORT, bridge)
  app.provide(NOTIFICATION_PORT, bridge)
  app.mount(mountPoint ?? '#app')
})
```

`{}` satisfies `Readonly<Record<string, unknown>>` — standalone mode has no `PluginSettings` context.

- [ ] **Step 11.2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.lint.json 2>&1 | Select-String "ui/main"`

Expected: no output

- [ ] **Step 11.3: Run all tests**

Run: `npx vitest run`

Expected: 155 passed (153 existing + 2 new hello-module tests), 0 failed

- [ ] **Step 11.4: Commit chunk 2**

```bash
git add src/core/bootstrap.ts src/modules/hello/HelloView.vue src/modules/hello/hello-module.ts src/modules/hello/hello-events.ts src/modules/index.ts src/plugin/SpecoratorView.ts src/ui/main.ts
git commit -m "feat(w2): bootstrap, HelloView, ALL_MODULES, wire SpecoratorView and ui/main"
```

---

## Chunk 3: ESLint rules + vitest config + docs + verify

### Task 12: Add ESLint rules to `eslint.config.js`

**Files:**
- Modify: `eslint.config.js`

The existing file has a `src/modules/**/*.ts` block at line ~262 containing only `max-lines`. Add a **second** `src/modules/**` block for the cross-module import ban and a new `src/core/**` block. Do NOT edit the existing `src/modules/**` block.

Locate the existing block:
```js
// Modules layer (introduced in W2) — same hard line-limit posture
{
  files: ['src/modules/**/*.ts'],
  rules: {
    'max-lines': ['error', MAX_LINES_OPTIONS],
  },
},
```

Insert the following two blocks immediately after it (before the UI layer block):

- [ ] **Step 12.1: Add the cross-module import ban block**

```javascript
  // Cross-module import ban — modules communicate through the EventBus only.
  // Pattern 1: alias-path ban (@/modules/other-module/...)
  // Pattern 2: relative-path ban (../other-module/...)
  // Allows: @/modules/index, @/modules/module, ./intra-module-file
  {
    files: ['src/modules/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`@/modules/(?!(index|module)$)[^/]+/`,
              message: 'Modules must not import sibling modules directly. Use the EventBus.',
            },
            {
              regex: String.raw`\.\./[^/]+/`,
              message: 'Modules must not import sibling modules directly. Use the EventBus.',
            },
          ],
        },
      ],
    },
  },

  // Core layer — application/infrastructure boundary.
  // Must not import obsidian, vue, pinia, src/plugin, or src/ui.
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'obsidian', message: 'src/core must not import obsidian directly.' },
            { name: 'vue', message: 'src/core must not import vue.' },
            { name: 'pinia', message: 'src/core must not import pinia.' },
          ],
          patterns: [
            { regex: String.raw`@/plugin/`, message: 'src/core must not import src/plugin.' },
            { regex: String.raw`@/ui/`, message: 'src/core must not import src/ui.' },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 12.2: Lint the two new source files to confirm zero errors**

Run: `npx eslint src/modules/hello/hello-module.ts src/core/bootstrap.ts`

Expected: 0 errors, 0 warnings

- [ ] **Step 12.3: Run existing ESLint boundary test to confirm no regression**

Run: `npx vitest run tests/eslint-boundaries.test.ts`

Expected: PASS

- [ ] **Step 12.4: Commit**

```bash
git add eslint.config.js
git commit -m "chore(w2): add ESLint cross-module import ban and src/core layer guard"
```

---

### Task 13: Update `vitest.config.ts` coverage includes

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 13.1: Add `src/modules/**` and `src/core/**` to `coverage.include`**

Current `coverage.include` (line ~17):
```ts
include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
```

New:
```ts
include: [
  'src/domain/**',
  'src/application/**',
  'src/infrastructure/**',
  'src/modules/**',
  'src/core/**',
],
```

- [ ] **Step 13.2: Run coverage and confirm thresholds still pass**

Run: `npx vitest run --coverage 2>&1 | Select-String -Pattern "(All files|Statements|Branches|Functions|Lines|threshold)" | Select-Object -Last 20`

Expected: all four thresholds pass (statements ≥ 80, branches ≥ 70, functions ≥ 80, lines ≥ 80).

**If thresholds fail due to `HelloView.vue`:** The SFC has no test yet (W9 scope). Add it to `coverage.exclude`:
```ts
exclude: [
  'src/infrastructure/obsidian/**',
  '**/__fixtures__/**',
  'src/infrastructure/mock/fixtures.ts',
  'src/modules/**/*.vue',   // ← add this line if needed
],
```
Vue component tests for modules land in W9 (Storybook). Run coverage again to confirm.

- [ ] **Step 13.3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(w2): add src/modules and src/core to vitest coverage include"
```

---

### Task 14: Write `docs/module-authoring.md`

**Files:**
- Create: `docs/module-authoring.md`

- [ ] **Step 14.1: Create the document**

Write the following content to `docs/module-authoring.md`:

```markdown
# Module Authoring Guide

This guide explains how to add a bounded-context module to the plugin. A module is a self-contained feature area that declares its commands, views, settings fields, and locale messages in one descriptor, and receives all dependencies through a `ModulePorts` object.

## When to create a module

Create a module when you are adding a feature area that owns one or more of: Obsidian commands, a settings section, user-facing UI components, or cross-plugin lifecycle events.

Shared utilities, value objects, and repository logic belong in `src/domain/` and `src/application/`, not in modules.

## File layout

```
src/modules/
  <module-name>/
    <module-name>-events.ts    ← EventMap declaration merging
    <module-name>-module.ts    ← module descriptor (default export or named)
    SomeView.vue               ← Vue SFCs owned by this module
```

Conventions:
- Directory: kebab-case (`hello`, `template-installer`, `workflow-nav`)
- Module file: `<module-name>-module.ts`, exports a named const like `helloModule`
- Events file: `<module-name>-events.ts`
- SFCs: PascalCase (`HelloView.vue`, `TemplateForm.vue`)

## Defining a module

```typescript
import './hello-events'
import { defineModule } from '@/modules'

export const helloModule = defineModule({
  id: 'hello',                 // unique, kebab-case, used as command ID prefix

  commands: [
    {
      id: 'hello:open-view',   // MUST be prefixed 'module-id:action'
      name: 'Hello: Open view',
      callback: () => { /* ... */ },
    },
  ],

  views: [
    { id: 'hello-view', label: 'Hello' },  // intent only — W4/W11 wire to router/Obsidian
  ],

  settingsSchema: {
    fields: [
      {
        type: 'toggle',        // 'toggle' | 'text' | 'number' | 'dropdown'
        key: 'showBadge',
        label: 'Show badge',
        default: true,
      },
    ],
  },

  messages: {
    en: { 'hello.title': 'Hello from Specorator' },
    de: { 'hello.title': 'Hallo von Specorator' },
  },

  init(ports, settings) {
    // Called once on plugin load.
    ports.bus.emit('hello:initialized', { moduleId: 'hello' })
  },

  onSettingsChange(next) {
    // Called by PluginCore (W4) when settings change.
  },

  destroy() {
    // Unsubscribe all bus listeners registered in init().
  },
})
```

## `ModulePorts`

`init(ports, settings)` receives:

| Field | Type | Use |
|-------|------|-----|
| `ports.settings` | `SettingsPort` | `getSettings()` / `saveSettings()` |
| `ports.vault` | `VaultPort` | `readFile()`, `writeFile()`, etc. |
| `ports.workspace` | `WorkspacePort` | `openFile()` |
| `ports.notifications` | `NotificationPort` | `showNotice()` |
| `ports.bus` | `EventBus` | cross-module events |

## Vue SFC isolation

- Use `<style scoped>` — no global selectors
- Props and emits must be narrow and explicit
- No sibling-module imports in `<script>` blocks — use the bus for cross-module events
- All testable elements need `data-testid` attributes

## Event channels

Channels follow `<module-id>:<event-name>`:

```typescript
// hello-events.ts
import type {} from '@/domain/shared/event-bus'
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
```

Import this as a side-effect in your module file: `import './hello-events'`.

## When to use Vue emits vs. EventBus

| Situation | Use |
|-----------|-----|
| Parent → child data | Vue props |
| Child → parent notification | Vue `emit` |
| Module A → Module B at runtime | EventBus |
| Local UI state | `ref`/`reactive` or Pinia store |

## Import path rules

- **Within your module**: relative imports are fine (`./hello-events`, `./HelloView.vue`)
- **Outside your module**: use the `@/` alias (`@/domain/shared/Result`, `@/modules`)
- **Importing another module directly**: **forbidden** — ESLint will error. Use the EventBus.
- **Never** use `../../` or deeper relative paths from inside `src/modules/`; use `@/` instead.

## Registering a new module

Add your module to `src/modules/index.ts`. The full file after adding `myModule` looks like:

```typescript
import type { ModuleDescriptor } from './module'
import { helloModule } from './hello/hello-module'
import { myModule } from './my-module/my-module-module'

export { defineModule } from './module'
export type {
  ModuleDescriptor,
  ModulePorts,
  ModuleSettingsSchema,
  SettingsFieldDescriptor,
  ModuleCommandDescriptor,
  ModuleViewIntent,
} from './module'
export { helloModule, myModule }

export const ALL_MODULES: ReadonlyArray<ModuleDescriptor> = [helloModule, myModule]
```

Modules init in declaration order; teardown runs in reverse order.

## Testing

Follow ADR-009 conventions. Mirror path: `tests/modules/<module-name>/<module-name>-module.test.ts`.

Use `fakeModulePorts()` from `tests/__fakes__/fake-ports.ts`:

```typescript
import { helloModule } from '@/modules/hello/hello-module'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

it('emits hello:initialized on init', () => {
  const ports = fakeModulePorts()
  const received: Array<{ moduleId: string }> = []
  ports.bus.on('hello:initialized', (env) => received.push(env.payload))
  helloModule.init(ports, {})
  expect(received).toHaveLength(1)
})
```

For Vue component tests, co-locate a PageObject (e.g. `HelloView.po.ts`) and query exclusively by `data-testid`.
```

- [ ] **Step 14.2: Commit**

```bash
git add docs/module-authoring.md
git commit -m "docs(w2): add module-authoring.md contributor guide"
```

---

### Task 15: Run `npm run verify` and fix any issues

- [ ] **Step 15.1: Run the full verification gate**

Run: `npm run verify`

Expected: exit 0

**Common issues and fixes:**

| Symptom | Fix |
|---------|-----|
| `await-thenable` in `bootstrap.ts` | Already handled by `Promise.resolve()` wrapping — re-check the file |
| `PluginSettings` assignability error | Add `as Readonly<Record<string, unknown>>` cast in `SpecoratorView.ts` |
| Coverage threshold failure from `HelloView.vue` | Add `'src/modules/**/*.vue'` to `coverage.exclude` in `vitest.config.ts` |
| ESLint `regex` syntax error | `eslint.config.js` `patterns` entries must use `regex:` key (not `group:`) |
| `no-floating-promises` in `ui/main.ts` | Ensure `void bootstrapModules(...).then(...)` — `void` must precede the full chain |
| TypeDoc errors on new files | Add `@/core/**` and `@/modules/**` to `typedoc.json` `entryPoints` if the docs:api script fails |

- [ ] **Step 15.2: Fix any issues found, re-run**

Run: `npm run verify`

Expected: exit 0

- [ ] **Step 15.3: Commit any fixes**

If fixes were needed:
```bash
git add -A
git commit -m "fix(w2): address verify gate issues"
```

---

### Task 16: Push and open implementation PR

- [ ] **Step 16.1: Push**

```bash
git push origin feature/w2-module-system-spec
```

- [ ] **Step 16.2: Open PR targeting `develop`**

```bash
gh pr create \
  --title "feat(w2): module system — defineModule, bootstrapModules, hello-module demo" \
  --base develop \
  --body "..."
```

PR body checklist (all items from issue #100 AC):
- `src/modules/` directory established
- `defineModule()` factory typed end-to-end
- Module contract receives narrow ports + EventBus, no aggregate bridge
- `hello-module` wired end-to-end (SpecoratorView + ui/main)
- `HelloView.vue` proves Vue SFC isolation convention
- `hello-events.ts` proves EventMap augmentation pattern
- ESLint cross-module import ban enforced
- `docs/module-authoring.md` complete

- [ ] **Step 16.3: Comment on issue #100 linking the PR**

```bash
gh issue comment 100 --body "Implementation PR: #<pr-number> — all acceptance criteria met."
```
