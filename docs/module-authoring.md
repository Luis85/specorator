# Module Authoring Guide

This guide explains how to add a bounded-context module to the plugin. A module is a self-contained feature area that declares its commands, views, settings fields, locale messages, URI actions, and event channels in one descriptor, and receives all dependencies through a `ModulePorts` object.

The system contracts are captured in:
- [ADR-010 — Module system with the `defineModule` contract](adr/ADR-010-module-system-and-defineModule.md)
- [ADR-011 — Typed `EventBus` with envelope and trace correlation](adr/ADR-011-typed-eventbus-envelope.md)
- [ADR-012 — `PluginCore` lifecycle, URI dispatch, and MCP server start/stop](adr/ADR-012-plugin-core-lifecycle.md)
- [ADR-013 — Native Obsidian MCP server with proposal-queued writes](adr/ADR-013-obsidian-mcp-server.md)

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

## Declaring URI actions

A module can register handlers for `obsidian://specorator?action=…` URLs by adding `uriActions` to its descriptor. `PluginCore` indexes every module's actions into a single dispatch map at init time and routes incoming URLs through `core.handleUri()` (registered once in `src/plugin/main.ts` via `registerObsidianProtocolHandler('specorator', …)`). Modules **never** register their own protocol handlers.

```typescript
export const featuresModule = defineModule({
  id: 'features',

  uriActions: [
    {
      action: 'open-feature',
      handler: (params: URLSearchParams) => {
        const slug = params.get('slug')
        if (slug === null) return
        // route, open file, emit a bus event — anything synchronous-ish
      },
    },
  ],
  // …
})
```

Handlers receive a `URLSearchParams` instance built from the raw URL. `PluginCore`:
- validates that no two modules declare the same `action` value (throws at init);
- catches handler errors and logs them via `LoggerPort.error` — a buggy URI handler does not crash the plugin;
- returns `false` to the protocol-handler callback when the action is unknown, letting `main.ts` show a fallback warning.

Test a URI handler with `https-style`-deep linking:

```
obsidian://specorator?action=open-feature&slug=auth-flow
```

Background and rationale: [ADR-012](adr/ADR-012-plugin-core-lifecycle.md).

## Extending the MCP tool surface

The plugin runs a native Obsidian MCP server (see [ADR-013](adr/ADR-013-obsidian-mcp-server.md)) that exposes the vault as a typed agent tool surface. The server lives in `src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts`; tools are registered in grouped functions (`registerTools` for vault, `registerWorkflowTools`, `registerMetadataTools`, `registerLinksTools`, `registerCanvasTools`, `registerBasesTools`).

**Modules cannot register MCP tools themselves.** The agent capability surface is a security-relevant contract (every write goes through the proposal queue — there is no trusted-tool bypass), so registration is centralised. To add a tool:

1. Open an issue against the adapter describing the tool, its inputs, and whether it reads or writes.
2. Add a `mcp.registerTool(name, { description, inputSchema }, handler)` call in the appropriate `register*Tools` group.
3. **Read tool:** call the relevant port (`vault`, `metadataCache`, `canvas`) and return `ok(data)`.
4. **Write tool:** never mutate directly. Capture the mutation in a closure and queue it through `ProposalStore`:

```typescript
mcp.registerTool(
  'template_install',
  {
    description: 'Install a feature scaffold from template — queued for proposal review',
    inputSchema: { templateId: z.string(), slug: z.string() },
  },
  async ({ templateId, slug }) => {
    const proposalId = store.queue(
      'template_install',
      { templateId, slug },
      () => installTemplate(templateId, slug),  // runs only on accept
    )
    return ok({ proposalId, status: 'pending' })
  },
)
```

The chat-sidebar module reads pending proposals from the adapter (off-port: `getProposals()`, `acceptProposal(id)`, `rejectProposal(id)`) and renders accept/reject UI.

Tool-naming convention: `<group>_<verb>[_<noun>]` (e.g., `vault_read_note`, `bases_update_record`). Inputs are `zod` schemas so the SDK auto-generates JSON-schema for the MCP introspection endpoint.

## Working with the `EventBus`

Modules talk to each other only through `ports.bus`. The bus is constructed once by `PluginCore` and exposes `on`/`onAny`/`emit`/`emitAsync`/`listenerCount`. Every listener receives an `EventEnvelope`:

```ts
{ channel, payload, eventId, traceId, parentId?, emittedAt }
```

### Subscribing

```typescript
let unsub: (() => void) | null = null

const featuresModule = defineModule({
  id: 'features',
  init(ports) {
    unsub = ports.bus.on('hello:initialized', (envelope) => {
      ports.logger.debug('features saw hello init', {
        moduleId: envelope.payload.moduleId,
        traceId: envelope.traceId,
      })
    })
  },
  destroy() {
    unsub?.()
    unsub = null
  },
})
```

Listeners run in descending `priority` order (default 0). The listener list is snapshotted at the start of each `emit`, so subscribing or unsubscribing during dispatch only affects the next emit. Per-listener errors are caught and logged via `LoggerPort.error` — a bad subscriber never blocks siblings.

### Publishing

Add the channel to `EventMap` via declaration merging in `<module-id>-events.ts` (see [Event channels](#event-channels)). Then:

```typescript
ports.bus.emit('features:opened', { slug: 'auth-flow' })
```

To correlate a downstream emit with the envelope you are reacting to, pass the parent's `eventId`:

```typescript
ports.bus.on('features:opened', (envelope) => {
  ports.bus.emit(
    'analytics:feature-viewed',
    { slug: envelope.payload.slug },
    { parentId: envelope.eventId },
  )
})
```

The downstream envelope inherits the parent's `traceId`, so a single trace stitches the chain together for diagnostics.

`emitAsync()` runs listeners with bounded concurrency (default 4) and resolves once they all settle — use it when listeners do real I/O. `emit()` is fire-and-forget; promise rejections from sync emits are routed through the same error hook.

### Hard rules

- Always store the unsubscribe handle from `bus.on()` and release it from `destroy()`. `PluginCore` measures listener delta per module and logs `listener leak detected` when fewer listeners are released than were registered.
- **Do not** delegate unsubscription to Vue component hooks (`onUnmounted`). Modules outlive components.
- **Do not** emit bus events from `destroy()`. The leak tripwire samples listener count before and after `destroy()`; emissions during teardown can corrupt the per-module delta.
- **Do not** import sibling modules. ESLint blocks `@/modules/<other>/…` imports inside `src/modules/<id>/`. Cross-module collaboration is bus-only.

Background and rationale: [ADR-011](adr/ADR-011-typed-eventbus-envelope.md).

## `ModulePorts`

`init(ports, settings)` receives:

| Field | Type | Use |
|-------|------|-----|
| `ports.settings` | `SettingsPort` | `getSettings()` / `saveSettings()` |
| `ports.vault` | `VaultPort` | `readFile()`, `writeFile()`, etc. |
| `ports.workspace` | `WorkspacePort` | `openFile()` |
| `ports.notifications` | `NotificationPort` | `showError()` / `showWarning()` / `showSuccess()` / `showInfo()` |
| `ports.logger` | `LoggerPort` | Structured logging (debug/info/warn/error). |
| `ports.bus` | `EventBus` | Cross-module events; see [Working with the `EventBus`](#working-with-the-eventbus). |
| `ports.t` | `TranslationPort` | i18n lookup (`t(key, params?)`). Messages from all modules are merged into vue-i18n at init. |

The bus, port surface, and lifecycle ownership rules are covered in their own sections — this table is the index, not the rulebook. Subscription ownership and the listener-leak tripwire live under [Working with the `EventBus` → Hard rules](#hard-rules).

## Vue SFC isolation

- Use `<style scoped>` — no global selectors
- Props and emits must be narrow and explicit
- No sibling-module imports in `<script>` blocks — use the bus for cross-module events
- All testable elements need `data-testid` attributes

## Event channels

Channels follow `<module-id>:<event-name>` and are added to the shared `EventMap` via TypeScript declaration merging in `<module-id>-events.ts`:

```typescript
// hello-events.ts
import type {} from '@/domain/shared/event-bus'
declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
```

Import this as a side-effect in your module file: `import './hello-events'`. The empty `import type {}` keeps TypeScript module-mode active so the `declare module` block applies.

For subscribe / publish patterns, listener priority, trace correlation, and the listener-leak rules, see [Working with the `EventBus`](#working-with-the-eventbus).

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

Add your module to `src/modules/index.ts`. After adding `myModule` the file looks like:

```typescript
import type { ModuleDescriptor } from './module'
import { coreSettingsModule } from '@/core/core-settings'
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module registry holds descriptors with heterogeneous settings types.
export const ALL_MODULES: ReadonlyArray<ModuleDescriptor<any>> = [coreSettingsModule, helloModule, myModule]
```

Modules init in **topological order** based on `dependsOn` edges (Kahn's BFS over the registry); modules without dependencies init in declaration order. Teardown runs in reverse topological order. Registry validation rejects duplicate IDs, duplicate `settingsKey` values, reserved `_`-prefixed keys, unknown / cyclic / self `dependsOn`, and duplicate `uriActions[].action` values — all at `PluginCore.init()`, before any module runs. See [ADR-012](adr/ADR-012-plugin-core-lifecycle.md).

## Worked example — `helloModule` end-to-end

`helloModule` (`src/modules/hello/hello-module.ts`) is the canonical demo wired through every contract surface. It is the smallest module that exercises the full descriptor.

### 1. Events file

```typescript
// src/modules/hello/hello-events.ts
import type {} from '@/domain/shared/event-bus'

declare module '@/domain/shared/event-bus' {
  interface EventMap {
    'hello:initialized': { moduleId: string }
  }
}
```

### 2. Module file

```typescript
// src/modules/hello/hello-module.ts
import './hello-events'
import { defineModule } from '@/modules/module'

interface HelloSettings {
  showBadge: boolean
}

export const helloModule = defineModule<HelloSettings>({
  id: 'hello',
  settingsKey: 'hello',
  settingsVersion: 1,
  settingsDefaults: { showBadge: true },

  validateSettings(raw: unknown): HelloSettings {
    const r = (raw ?? {}) as Record<string, unknown>
    return { showBadge: typeof r.showBadge === 'boolean' ? r.showBadge : true }
  },

  commands: [{ id: 'hello:open-view', name: 'Hello: Open view', callback: () => undefined }],
  views:    [{ id: 'hello-view', label: 'Hello' }],
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

### 3. Registry entry

`src/modules/index.ts`:

```typescript
import { helloModule } from './hello/hello-module'
// …
export const ALL_MODULES = [coreSettingsModule, helloModule, /* … */]
```

### 4. What every contract surface gives you

| Surface | Effect once `PluginCore.init()` runs |
|---|---|
| `id: 'hello'` | Reserves the `hello:*` channel and command-id namespace; registry validator rejects duplicates. |
| `settingsKey + settingsVersion + validateSettings + settingsDefaults` | The `hello` slice in stored data is migrated/validated on load; `_moduleVersions.hello` is stamped to `1`. Live edits in the settings tab call `notifySettingsChanged('hello', …)` which re-runs `validateSettings` before persisting. |
| `commands` | Obsidian command palette gets `Hello: Open view` (id `hello:open-view`). |
| `views` | View intent registered for the router. |
| `settingsSchema.fields` | The central settings tab renders a toggle bound to `showBadge`. |
| `messages.{en,de}` | `applyModuleMessages` merges them into vue-i18n; `ports.t('hello.title')` resolves per locale. |
| `init(ports)` | Runs in topological order; emits `hello:initialized`; listener-leak tripwire snapshots the bus listener count before/after. |

### 5. Worked example with the rest of the surfaces

A larger module that adds a URI action and reacts to `hello:initialized` over the bus:

```typescript
import './features-events'
import { defineModule } from '@/modules/module'

let unsub: (() => void) | null = null

export const featuresModule = defineModule({
  id: 'features',
  dependsOn: ['hello'],

  commands: [
    { id: 'features:open', name: 'Features: Open panel', callback: () => undefined },
  ],

  uriActions: [
    {
      action: 'open-feature',
      handler: (params) => {
        const slug = params.get('slug')
        if (slug !== null) {
          // route to the feature view
        }
      },
    },
  ],

  init(ports) {
    unsub = ports.bus.on('hello:initialized', (envelope) => {
      ports.logger.debug('features observed hello init', {
        traceId: envelope.traceId,
        moduleId: envelope.payload.moduleId,
      })
    })
  },

  destroy() {
    unsub?.()
    unsub = null
  },
})
```

`obsidian://specorator?action=open-feature&slug=auth-flow` is now routed through `core.handleUri()` to this handler. The module also subscribes to `hello:initialized` on init and releases the subscription on destroy — the listener-leak tripwire stays quiet.

(When the chat-sidebar module #197 lands, it will replace this composite example with the first production module that exercises every surface, including MCP off-port hooks for accept/reject of pending proposals.)

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
