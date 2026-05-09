# Module Authoring Guide

This guide explains how to add a bounded-context module to the plugin. A module is a self-contained feature area that declares its commands, views, settings fields, and locale messages in one descriptor, and receives all dependencies through a `ModulePorts` object.

## Quick start — `npm run scaffold:module`

The fastest way to start a module is the W12 scaffold script:

```sh
npm run scaffold:module -- template-installer
```

It creates four files (skipping any that already exist, so it is safe to re-run):

```
src/modules/template-installer/template-installer-module.ts
src/modules/template-installer/template-installer-events.ts
src/modules/template-installer/TemplateInstallerView.vue
tests/modules/template-installer/template-installer-module.test.ts
```

Module names must be kebab-case ASCII (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`). The script then prints the registry edit needed in `src/modules/index.ts` and the command to run the generated test.

## Deploying to a local Obsidian test vault — `npm run build:deploy`

`build:deploy` runs `npm run build` and then copies `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/specorator/`. Set the vault path via the `SPECORATOR_TEST_VAULT` environment variable — there is no default.

```sh
# bash / zsh
SPECORATOR_TEST_VAULT="$HOME/Vaults/specorator-dev" npm run build:deploy

# PowerShell
$env:SPECORATOR_TEST_VAULT = "C:\Vaults\specorator-dev"
npm run build:deploy
```

The script fails fast if `SPECORATOR_TEST_VAULT` is unset, the path is missing, or the folder has no `.obsidian/` subdirectory. Subsequent runs overwrite previously deployed files (idempotent).

## File conventions

- Filenames are kebab-case (`template-installer-module.ts`, not `templateInstallerModule.ts`).
- `.js`-extension imports are not used in the plugin source — Vite + the `@/` alias handle resolution.
- `TODO` / `FIXME` / `XXX` comments are rejected by ESLint (`no-warning-comments`). Open an issue and reference it from the code instead.

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
      callback: () => undefined,
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
| `ports.notifications` | `NotificationPort` | `showError()` / `showWarning()` / `showSuccess()` / `showInfo()` |
| `ports.logger` | `LoggerPort` | Structured logging (debug/info/warn/error). |
| `ports.bus` | `EventBus` | cross-module events |

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
