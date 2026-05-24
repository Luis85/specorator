---
id: SPEC-PSR-001
title: Plugin shell reboot (P0) — implementation-ready contracts
stage: spec
feature: plugin-shell-reboot
status: complete
owner: architect
inputs:
  - DESIGN-PSR-001
  - PRD-PSR-001
created: 2026-05-24
updated: 2026-05-24
epic: claudian-reboot
phase: P0
adrs:
  - ADR-PSR-001
  - ADR-PSR-002  # 2026-05-24 settings-storage delta: device-local backing store + migrate-and-clear (REQ-PSR-013)
---

# Specification — Plugin shell reboot (P0)

> Stage 5 of `plugin-shell-reboot`. This spec fixes the contracts that
> `DESIGN-PSR-001` (Part C) forwarded to specification: the slim `PluginSettings`
> + `coreSettingsModule` strip-on-read migration, the `AgentSidebarView` /
> `AgentPanelRoot.vue` / command / settings-tab signatures, the final
> `WorkspacePort` shape (OC-PSR-1), the i18n stub contract (CL-1), the
> deleted-symbol guard rule + test (CL-2), the `ci.yml` `next` edit, edge cases,
> and the `TEST-PSR` scenarios that QA automates. It does **not** re-open Q4 /
> CL-3 / CL-4 or the OC defaults — those are pinned by design + the
> clarify-after-design gate (see `workflow-state.md`).
>
> **Subtractive feature.** Most of the work is deletion. This spec constrains the
> *surviving* contracts only; the file-by-file delete inventory lives in design
> §C.14 and is not re-enumerated here (§9 restates the per-wave invariant).

---

## §0 Conventions and scope

- IDs: `SPEC-PSR-NNN` for spec items, `TEST-PSR-NNN` for test scenarios. Every
  spec item links to ≥ 1 `REQ-PSR` / `NFR-PSR`.
- "The plugin" = the Specorator Obsidian plugin built from the gutted P0 tree.
- "Six core ports" = `SettingsPort`, `VaultPort`, `WorkspacePort`,
  `NotificationPort`, `LoggerPort`, `CommunityPluginPort` (ADR-008).
- Paths are repo-relative to the worktree root unless stated absolute.
- This spec assumes the leaf-first delete order of design §C.14. Where a contract
  says "deleted", the symbol/file is removed in the wave design §C.14 assigns it.

---

## §1 Slim `PluginSettings` + `coreSettingsModule` migration (REQ-PSR-006/008, CL-1)

### SPEC-PSR-001 — `PluginSettings` / `DEFAULT_SETTINGS` target shape

`src/domain/settings/PluginSettings.ts` is rewritten to:

```ts
// No import from @/domain/chat or any deleted subsystem (REQ-PSR-005/006).
export interface PluginSettings {
  readonly locale: string
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'
}

export const DEFAULT_SETTINGS: PluginSettings = {
  locale: 'en',
  logLevel: 'warn',
}
```

**Validation rules (per field):**

| Field | Type | Rule | Default |
|---|---|---|---|
| `locale` | `string` | Coerced via `coerceString` (non-empty trimmed string, else fallback). Not constrained to `SupportedLocale` at the type level — see SPEC-PSR-009 for the runtime narrowing at the i18n boundary. | `'en'` |
| `logLevel` | `'debug'\|'info'\|'warn'\|'error'` | Coerced via `coerceEnum` over `VALID_LOG_LEVELS`. | `'warn'` |

**Dropped fields** (all lose their consumer with the deleted subsystems; absent
from both the type and `DEFAULT_SETTINGS`): `specsFolder`, `archiveFolder`,
`decisionsFolder`, `constitutionFile`, `gateStrictness`, `teamMode`,
`mcpServerEnabled`, `userPersona`, `onboardingComplete`, `claudeCliPath`,
`obsidianCliPath`, `transportKind`, `providerSelection`, `cursorCliPath`,
`cursorApiPreview`, `autoPreferProvider`, `providerModel`, `chatTabCap`. Both
`@/domain/chat` type imports (`TransportKind`, `ProviderId`/`ProviderSelection`)
are removed.

- **Pre-conditions:** none (pure type + constant).
- **Post-conditions:** the type exposes exactly two readonly keys; `Object.keys(DEFAULT_SETTINGS)` === `['locale','logLevel']`.
- **Side effects:** none.
- **Traces:** REQ-PSR-006.

### SPEC-PSR-002 — `coreSettingsModule.migrate(fromVersion, blob)` — strip-on-read

`src/core/core-settings.ts` rewrites the module to `settingsVersion: 4` with a
**strip-on-read, idempotent** migration. The migration is the durable contract
(pinned by the clarify-after-design gate):

```ts
const VALID_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const

function coerceString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}
function coerceEnum<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return (allowed as ReadonlyArray<string>).includes(value as string) ? (value as T) : fallback
}

export const coreSettingsModule = defineModule<PluginSettings>({
  id: 'specorator',
  settingsKey: 'specorator',
  settingsVersion: 4,
  settingsDefaults: { ...DEFAULT_SETTINGS },

  migrate(_fromVersion: number, blob: unknown): unknown {
    // Strip-on-read: project any stored blob (any prior version, pre-versioned
    // v0.x, or already-v4) down to exactly { locale, logLevel }. Idempotent —
    // re-running on the projection yields the same projection. Validation
    // (validateSettings) applies defaults/coercion afterwards, so missing keys
    // are safe to omit here.
    const src = (blob !== null && typeof blob === 'object' && !Array.isArray(blob))
      ? (blob as Record<string, unknown>)
      : {}
    const out: Record<string, unknown> = {}
    if ('locale' in src) out.locale = src.locale
    if ('logLevel' in src) out.logLevel = src.logLevel
    return out
  },

  validateSettings(raw: unknown): PluginSettings {
    const r = (raw ?? {}) as Partial<PluginSettings>
    return {
      locale: coerceString(r.locale, DEFAULT_SETTINGS.locale),
      logLevel: coerceEnum(r.logLevel, VALID_LOG_LEVELS, DEFAULT_SETTINGS.logLevel),
    }
  },

  settingsSchema: { fields: [ /* SPEC-PSR-004 */ ] },

  init() {
    // Lifecycle owned by main.ts; this module declares schema only.
  },
})
```

**Contract:**

- **Signature:** `migrate(fromVersion: number, blob: unknown): unknown`.
- **Behaviour:** returns a new plain object containing only the `locale` and
  `logLevel` keys that were present on `blob`. Every other key (the 16 dropped
  fields plus any unknown key from a future/foreign blob) is **omitted** from the
  output — the persisted blob therefore carries no orphaned key forward
  (REQ-PSR-005 holds for the persisted blob, not just the type).
- **`fromVersion` is intentionally ignored** (`_fromVersion`). Strip-on-read is
  version-agnostic: the same projection is correct from v0 (pre-versioned),
  v1/v2/v3 (feature-era), and v4 (already current). The parameter is kept to
  satisfy the `ModuleDescriptor.migrate` signature; prefix-underscore avoids the
  `no-unused-vars` error.
- **Pre-conditions:** `blob` is the stored slice for key `specorator` (may be
  `null`, a primitive, an array, or an object).
- **Post-conditions:** output is a plain object; `Object.keys(output)` ⊆
  `{'locale','logLevel'}`; `migrate(v, migrate(v, blob))` deep-equals
  `migrate(v, blob)` (idempotent).
- **Side effects:** none — pure function. Does not mutate `blob`.
- **Errors:** none thrown. Non-object `blob` → `{}` (validation then supplies
  defaults). The module's `settingsDefaults` is the fallback PluginCore returns
  if validation throws (it does not, here).

**Edge cases (enumerated, each a `TEST-PSR`):**

| Edge | Input `blob` | Output | Then `validateSettings` →  |
|---|---|---|---|
| Already at v4, slim | `{ locale: 'de', logLevel: 'info' }` | `{ locale: 'de', logLevel: 'info' }` | `{ locale: 'de', logLevel: 'info' }` |
| Pre-versioned v0.x fat install | `{ locale: 'de', specsFolder: 'x', providerSelection: {forced:'auto'}, claudeCliPath: '/c', logLevel: 'debug', chatTabCap: 10 }` | `{ locale: 'de', logLevel: 'debug' }` | `{ locale: 'de', logLevel: 'debug' }` |
| Fresh install (no blob) | `null` / `undefined` | `{}` | `{ locale: 'en', logLevel: 'warn' }` (defaults) |
| Corrupt non-object | `'garbage'` / `42` / `['a']` | `{}` | defaults |
| Partial (only logLevel) | `{ logLevel: 'error' }` | `{ logLevel: 'error' }` | `{ locale: 'en', logLevel: 'error' }` |
| Invalid logLevel value | `{ logLevel: 'verbose' }` | `{ logLevel: 'verbose' }` (migrate is verbatim) | `{ locale: 'en', logLevel: 'warn' }` (coerced) |
| Idempotency | `migrate(0, fatBlob)` re-fed to `migrate(4, …)` | unchanged projection | unchanged |

- **Traces:** REQ-PSR-006, REQ-PSR-008; CL-1 (migration contract); design §C.3.

#### SPEC-PSR-002a — Storage-location migrate-and-clear (REQ-PSR-013, CL-5/CL-6, ADR-PSR-002)

> 2026-05-24 settings-storage delta (CHARTER-REQ-SET). `migrate` (SPEC-PSR-002)
> handles the **field shape** (a pure projection). This item adds the one-time
> **storage-location** migrate-and-clear that runs in `main.ts loadSettings()` on
> first load and uses the re-pointed `ObsidianBridge` (SPEC-PSR-008). It is a
> stateful, side-effecting load-path step, not part of the pure `migrate` reducer.
> Decision recorded in ADR-PSR-002.

The `SettingsPort` **contract is unchanged** (`getSettings`/`saveSettings`). The
production `ObsidianBridge` backing store moves off `data.json`
(`Plugin.loadData`/`saveData`) onto Obsidian's device-local store
(`app.loadLocalStorage`/`saveLocalStorage`, device-scoped + not synced) under a
stable key `specorator:settings` (SPEC-PSR-008). `MockBridge` (in-memory) and
`LocalStorageBridge` (web `localStorage`) are unchanged.

**Migrate-and-clear contract (`main.ts loadSettings()`, one-time, idempotent):**

```ts
// pseudo-contract — composes the SPEC-PSR-002 strip with a relocate + clear.
// Reads the legacy data.json slice via plugin.loadData(); writes/reads the
// device-local store via the bridge; clears the legacy slice via plugin.saveData().
async loadSettings(): Promise<void> {
  // 1. PROJECT — read any legacy data.json slice and strip to { locale, logLevel }
  const stored = (await this.loadData()) as Record<string, unknown> | null
  const legacySlice = stored?.specorator                       // may be undefined
  const projected = coreSettingsModule.validateSettings(
    coreSettingsModule.migrate(0, legacySlice),                // SPEC-PSR-002 strip
  )

  // 2. RELOCATE — device-local wins if already populated; else seed from legacy
  const deviceLocal = await this.bridge.getSettings()          // device-local read
  const deviceLocalEmpty = /* bridge reports absent/unparsed slice */ false
  if (deviceLocalEmpty && legacySlice !== undefined) {
    await this.bridge.saveSettings(projected)                  // seed device-local
    this.settings = projected
  } else {
    this.settings = deviceLocal                                // device-local wins
  }

  // 3. CLEAR — drop the legacy slice from data.json so it stops being committed
  if (stored && 'specorator' in stored) {
    delete stored.specorator
    await this.saveData(stored)                                // data.json now has no settings slice
  }
}
```

- **Signature:** `loadSettings(): Promise<void>` — runs once per `onload`.
- **Behaviour:** project the legacy `data.json` settings slice down to
  `{ locale, logLevel }` (reusing SPEC-PSR-002's `migrate` + `validateSettings`),
  relocate it into the device-local store **only when the device-local store is
  empty/absent** (device-local wins otherwise), and clear the legacy slice from
  `data.json`. After it runs, `data.json` carries **no** `locale`/`logLevel`
  (NFR-PSR-010) and `this.settings` is read from the device-local store.
- **`saveSettings` thereafter (SPEC-PSR-008):** writes the **device-local store
  only**, never `data.json`.
- **Pre-conditions:** `this.bridge` constructed; the device-local API
  (`app.loadLocalStorage`/`saveLocalStorage`) available at `minAppVersion 1.12.7`
  (NFR-PSR-011 — verified at impl; escalate per NG6 if absent).
- **Post-conditions:** `data.json` has no `specorator.locale`/`specorator.logLevel`
  key; `getSettings()` round-trips through the device-local store; a second
  `loadSettings()` finds nothing to migrate (no-op — idempotent).
- **Side effects:** at most one device-local write (the seed) and at most one
  `data.json` write (the clear), both skipped when there is nothing to do.
- **Errors:** none thrown. Absent legacy slice → no relocate, no clear. Unparsed
  device-local → `getSettings` returns `DEFAULT_SETTINGS` (validation supplies
  defaults).

**Edge cases (enumerated, each a `TEST-PSR`):**

| Edge | data.json slice | device-local | After `loadSettings()` |
|---|---|---|---|
| Legacy present, device-local empty | `{ locale:'de', logLevel:'info', specsFolder:'x' }` | absent | device-local = `{ locale:'de', logLevel:'info' }`; `data.json` slice **deleted**; `this.settings = { locale:'de', logLevel:'info' }` |
| Already migrated | absent | `{ locale:'de', logLevel:'info' }` | no-op; device-local unchanged; `this.settings` = device-local |
| Both populated (device-local wins) | `{ locale:'en', logLevel:'warn' }` | `{ locale:'de', logLevel:'debug' }` | device-local **unchanged** (`de`/`debug` wins); `data.json` slice **cleared**; `this.settings = { locale:'de', logLevel:'debug' }` |
| Both empty (fresh install) | absent | absent | no-op; `this.settings = DEFAULT_SETTINGS`; nothing written |
| Idempotency (second run) | (cleared by first run) | populated | no-op; no write |
| Device-local API unavailable at runtime | (any) | n/a | escalate per NFR-PSR-011 / NG6 — fall back to a gitignored device-local file (ADR-PSR-002 Option C); do **not** silently keep settings in `data.json` |

- **Traces:** REQ-PSR-013, NFR-PSR-010, NFR-PSR-011; CL-5, CL-6; ADR-PSR-002;
  design §C.3a, §C.6, §C.16.

### SPEC-PSR-003 — `validateSettings` coercion

Per the snippet above: only two fields, `locale` via `coerceString`, `logLevel`
via `coerceEnum(VALID_LOG_LEVELS)`. **All other coercion helpers and `VALID_*`
constants are deleted**: `coerceBoolean`, `coerceNumber`,
`coercePassthroughString`, `coerceTrimmedString`, `validateProviderSelection`,
`validateProviderModel`, `toMutableBlob`, `VALID_GATE_STRICTNESS`,
`VALID_PROVIDER_IDS`, `VALID_PROVIDER_MODES`, `VALID_FORCED_SENTINELS`. The
`@/domain/chat` imports are removed.

- **Pre-conditions:** `raw` is the migrated blob (SPEC-PSR-002 output) or any
  unknown value.
- **Post-conditions:** returns a fully-populated `PluginSettings` with every
  field defined; never throws.
- **Traces:** REQ-PSR-008.

### SPEC-PSR-004 — `settingsSchema.fields` (two dropdowns)

`coreSettingsModule.settingsSchema.fields` keeps exactly two
`SettingsFieldDescriptor` entries (shape per `src/modules/module.ts`):

```ts
fields: [
  {
    type: 'dropdown',
    key: 'locale',
    label: 'Language',
    description: 'Display language for the Specorator panel.',
    options: [
      { value: 'en', label: 'English' },
      { value: 'de', label: 'Deutsch' },
    ],
    default: DEFAULT_SETTINGS.locale,
  },
  {
    type: 'dropdown',
    key: 'logLevel',
    label: 'Log level',
    description: 'Console log verbosity. Errors and warnings are always useful; lower levels are noisy.',
    options: [
      { value: 'debug', label: 'Debug' },
      { value: 'info', label: 'Info' },
      { value: 'warn', label: 'Warn (default)' },
      { value: 'error', label: 'Error' },
    ],
    default: DEFAULT_SETTINGS.logLevel,
  },
]
```

All other field descriptors (`specsFolder`, `archiveFolder`, `decisionsFolder`,
`constitutionFile`, `gateStrictness`, `teamMode`, `mcpServerEnabled`,
`userPersona`, `onboardingComplete`) are deleted.

- **Note:** option labels keep `obsidianmd/ui/sentence-case` discipline (the rule
  is active on `src/core/**`? — no, it scopes to `src/plugin/**` + `src/ui/**`;
  `core-settings.ts` is unaffected, but keep the existing copy verbatim to avoid
  churn).
- **Traces:** REQ-PSR-007, REQ-PSR-008.

---

## §2 `AgentSidebarView` + `AgentPanelRoot.vue` + command + settings tab (REQ-PSR-001/002/003/007, CL-3, CL-4)

### SPEC-PSR-005 — `VIEW_TYPE_AGENT` constant + `AgentSidebarView` (`ItemView`)

New file `src/plugin/AgentSidebarView.ts`. Replaces the deleted `SpecoratorView`
and `AgentSidepanelView`.

```ts
import { ItemView, type WorkspaceLeaf } from 'obsidian'
import { type App as VueApp, createApp } from 'vue'
import { createPinia } from 'pinia'
import AgentPanelRoot from '@/ui/agent/AgentPanelRoot.vue'
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue'
import { i18n, setLocale, type SupportedLocale, SUPPORTED_LOCALES } from '@/ui/i18n'
import {
  SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT,
  NOTIFICATION_PORT, LOGGER_PORT, COMMUNITY_PLUGIN_PORT,
} from '@/infrastructure/bridge/ports'
import type SpecoratorPlugin from './main'

export const VIEW_TYPE_AGENT = 'specorator-agent'

export class AgentSidebarView extends ItemView {
  private vueApp: VueApp | null = null

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf)
  }

  getViewType(): string { return VIEW_TYPE_AGENT }
  getDisplayText(): string { return 'Specorator agent' }
  getIcon(): string { return 'bot' } // native Lucide name — NOT via IconPort (Q4)

  override async onOpen(): Promise<void> {
    const bridge = this.plugin.bridge
    if (bridge === null) return
    const locale = this.plugin.settings.locale
    if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
      setLocale(locale as SupportedLocale)
    }
    const host = this.contentEl.createDiv({ cls: 'specorator-agent-root' })
    const app = createApp(ErrorBoundary, {}, () => h(AgentPanelRoot))
    // (Render AgentPanelRoot as ErrorBoundary's default slot — see note.)
    app.use(createPinia())
    app.use(i18n)
    app.provide(SETTINGS_PORT, bridge)
    app.provide(VAULT_PORT, bridge)
    app.provide(WORKSPACE_PORT, bridge)
    app.provide(NOTIFICATION_PORT, bridge)
    app.provide(LOGGER_PORT, bridge)
    app.provide(COMMUNITY_PLUGIN_PORT, bridge)
    app.mount(host)
    this.vueApp = app
  }

  override async onClose(): Promise<void> {
    this.vueApp?.unmount()
    this.vueApp = null
    this.contentEl.empty()
  }
}
```

**Implementation note (load-bearing):** `ErrorBoundary.vue` renders its content
via `<slot/>`. To mount `AgentPanelRoot` *inside* `ErrorBoundary` from
`createApp`, the dev uses a render-function root that returns
`h(ErrorBoundary, () => h(AgentPanelRoot))` (import `h` from `vue`), or a tiny
SFC wrapper. The exact mechanism is a dev choice; the **invariant** is:
`AgentPanelRoot` mounts as `ErrorBoundary`'s default slot so component errors are
caught and routed through `LoggerPort` + `NotificationPort` (NFR-PSR-002/003).

**Contract:**

- `getViewType()` returns the stable string `'specorator-agent'` (exported as
  `VIEW_TYPE_AGENT`). This is the *only* view type the plugin registers
  (REQ-PSR-001).
- `getIcon()` returns a native Lucide icon name (`'bot'`). It does **not** route
  through `IconPort` (pruned per Q4). The icon name is the tab icon only.
- `onOpen()`: creates a child element under `contentEl`, constructs a fresh Vue
  app mounting `AgentPanelRoot` inside `ErrorBoundary`, installs Pinia (install
  only — no feature stores) and i18n, provides the six core ports from
  `this.plugin.bridge`, calls `setLocale` with the current locale (narrowed —
  SPEC-PSR-009), and mounts. Idempotent per leaf: a second `onOpen` on the same
  view instance is not expected (Obsidian creates one view per leaf).
- `onClose()`: unmounts the Vue app, nulls the reference, empties `contentEl`.
  Must be safe to call when `vueApp` is `null` (never opened, or double-close).
- **Pre-conditions:** `this.plugin.bridge` is constructed (set in `onload`
  before `registerView`). If `bridge` is `null` the view renders nothing rather
  than throwing (defensive — NFR-PSR-003).
- **Post-conditions (onOpen):** `contentEl` contains the mounted root with a
  `data-testid="agent-panel-empty"` element; no console error.
- **Side effects:** mounts a Vue app; subscribes nothing to the event bus
  (empty view).
- **Errors:** component-render errors are caught by `ErrorBoundary` (logged +
  notified, swallowed). Port-injection failures cannot occur because all six
  provides precede `mount`.
- **Traces:** REQ-PSR-001, REQ-PSR-002, NFR-PSR-002, NFR-PSR-003; CL-4.

### SPEC-PSR-006 — `AgentPanelRoot.vue` placeholder

New file `src/ui/agent/AgentPanelRoot.vue`. The empty P0 surface.

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div class="specorator-agent-panel" data-testid="agent-panel-empty">
    <p>{{ t('agent.empty.placeholder') }}</p>
  </div>
</template>
```

**Contract:**

- Renders exactly one root element carrying `data-testid="agent-panel-empty"`.
- The placeholder text comes from the i18n key `agent.empty.placeholder`
  (SPEC-PSR-008). No hard-coded user-facing string.
- No chat, no Pinia store usage, no port injection, no router. `<script setup>`
  only (ADR-003).
- **Pre-conditions:** mounted under an app that installed `i18n`.
- **Post-conditions:** the element is queryable by `data-testid` in a Vue Test
  Utils mount with a PageObject (ADR-009).
- **Traces:** REQ-PSR-002; CL-4; CL-1.

### SPEC-PSR-007 — `open-agent-sidebar` command + `activateAgentSidebar()`

In `src/plugin/main.ts` (§ trimmed shape, design §C.6):

```ts
this.addCommand({
  id: 'open-agent-sidebar',
  name: 'Open agent sidebar',
  callback: () => { void this.activateAgentSidebar() },
})
```

```ts
async activateAgentSidebar(): Promise<void> {
  const { workspace } = this.app
  // reveal-or-create in the right sidebar
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_AGENT)[0] ?? null
  if (leaf === null) {
    leaf = workspace.getRightLeaf(false)
    if (leaf === null) return
    await leaf.setViewState({ type: VIEW_TYPE_AGENT, active: true })
  }
  // Deferred-leaf invariant (ADR-008): load a deferred leaf before reveal so
  // its view is instantiated and onOpen runs.
  if ('loadIfDeferred' in leaf && typeof leaf.loadIfDeferred === 'function') {
    await leaf.loadIfDeferred()
  }
  await workspace.revealLeaf(leaf)
}
```

**Contract:**

- **Command:** exactly one command, id `open-agent-sidebar`, name
  `'Open agent sidebar'`. **No ribbon icon** (CL-3). It is the only registered
  view-opening affordance (REQ-PSR-003).
- **`activateAgentSidebar()` behaviour:** reveal-or-create. If a leaf of
  `VIEW_TYPE_AGENT` exists, reveal it; else create one in the right sidebar via
  `getRightLeaf(false)` + `setViewState`. Always `loadIfDeferred` (deferred-leaf
  invariant) before `revealLeaf`.
- **Pre-conditions:** `registerView(VIEW_TYPE_AGENT, …)` ran in `onload`.
- **Post-conditions:** exactly one `VIEW_TYPE_AGENT` leaf exists and is revealed;
  running the command again with the view open re-reveals the same leaf (does not
  create a second — SPEC-PSR-014 edge case).
- **Side effects:** may create one workspace leaf; triggers `onOpen` (Vue mount).
- **Errors:** if `getRightLeaf(false)` returns `null` (no workspace), the method
  returns without throwing (NFR-PSR-003).
- **Traces:** REQ-PSR-002, REQ-PSR-003; CL-3.

### SPEC-PSR-008 — Slim `SpecoratorSettingTab`

`src/plugin/settings.ts` is rewritten. The slim tab keeps **only** the
module-schema-driven loop (which now renders the two `coreSettingsModule`
dropdowns) and `saveField`. Everything else in the current file is deleted:
`renderApprovalRulesSection`, `renderAboutYouSection`, `renderMcpServerStatus`,
`renderObsidianCliPathField`, `renderAnthropicKeyField`,
`renderClaudeCliPathField`, `renderCursorSettingsSection`, the
`handle*`/`_testBinaryVersion`/`_describeTestOutcome`/`_setStatus`/`_bumpAllViews`
helpers, and the `node:path`/`node:child_process`/binary-resolver/`SECRET_ID_*`/
deleted-view imports.

```ts
import { type App, PluginSettingTab, Setting } from 'obsidian'
import type { ModuleDescriptor, SettingsFieldDescriptor } from '@/modules/module'
import type SpecoratorPlugin from './main'

export class SpecoratorSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SpecoratorPlugin) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()
    for (const mod of this.plugin.core?.allModules ?? []) {
      const fields = mod.settingsSchema?.fields
      if (fields === undefined || fields.length === 0) continue
      new Setting(containerEl).setName(mod.id).setHeading()
      for (const field of fields) {
        const currentValue = this.currentValue(mod, field)
        const setting = new Setting(containerEl).setName(field.label)
        if (field.description !== undefined) setting.setDesc(field.description)
        this.addControl(setting, mod, field, currentValue)
      }
    }
  }

  private currentValue(mod: ModuleDescriptor, field: SettingsFieldDescriptor): unknown { /* as today, specorator slice */ }
  private addControl(/* … */): void { /* dropdown / text / number / toggle — as today */ }
  private async saveField(mod: ModuleDescriptor, key: string, value: unknown): Promise<void> {
    if (mod.settingsKey === 'specorator') {
      await this.plugin.updateSettings({ [key]: value })
    } else if (mod.settingsKey !== undefined) {
      await this.plugin.updateModuleSettings(mod.settingsKey, { [key]: value })
    }
  }
}
```

**Contract:**

- **Behaviour:** for each module with `settingsSchema.fields`, render a heading +
  one control per field. For P0 the only such module is `coreSettingsModule`
  (two dropdowns). Changing a control calls `saveField` →
  `plugin.updateSettings({ [key]: value })` → `SettingsPort.saveSettings`
  (REQ-PSR-007).
- **Backing store (REQ-PSR-013, ADR-PSR-002):** `SettingsPort.saveSettings`/
  `getSettings` route through the production `ObsidianBridge`, whose backing store
  is the **device-local store** (`app.loadLocalStorage`/`saveLocalStorage`, key
  `specorator:settings`), **not** `data.json`. The tab's persistence path is
  otherwise unchanged — it calls the same `SettingsPort` contract. After a tab
  change is saved, the persisted `data.json` settings slice carries **no**
  `locale`/`logLevel` (NFR-PSR-010) and `getSettings()` reads the value back from
  the device-local store. The bridge round-trip is: `saveSettings(s)` →
  `app.saveLocalStorage('specorator:settings', JSON.stringify(s))`; `getSettings()`
  → parse `app.loadLocalStorage('specorator:settings')` → `validateSettings`
  (defaults on absent/garbage). The exact (de)serialisation shape is verified at
  impl (NFR-PSR-011); the *contract* is: a saved value round-trips, and no
  `locale`/`logLevel` reaches `data.json`.
- `addControl` keeps the existing `toggle | text | number | dropdown` switch
  (generic over the schema) — even though P0 only exercises `dropdown`, the
  switch stays so future module fields render without edits (avoids dead
  re-implementation; it is reachable code via the schema contract).
- **Pre-conditions:** `plugin.core` initialised with `coreSettingsModule`.
- **Post-conditions:** a `getSettings()` after a change returns the changed value
  (REQ-PSR-007 acceptance).
- **Side effects:** writes through `SettingsPort.saveSettings` via
  `plugin.updateSettings`.
- **Errors:** none surfaced; `updateSettings` validates via the module.
- **Traces:** REQ-PSR-007, REQ-PSR-006, REQ-PSR-013, NFR-PSR-010; ADR-PSR-002.

---

## §3 `WorkspacePort` shape (OC-PSR-1, REQ-PSR-005)

### SPEC-PSR-009 — Revert `WorkspacePort` to ADR-008 `openFile`-only

**Verification performed (Stage 5):** the only *kept* consumer of `WorkspacePort`
is the composable `src/ui/composables/useWorkspacePort.ts`, which injects the port
and returns it untyped to callers. P0's `AgentPanelRoot.vue` does **not** call
any `WorkspacePort` method (it is empty). All callers of the chat-era extensions
(`getActiveFile`, `onActiveFileChanged`, `getActiveFilePath`,
`getActiveSelection`, `getVaultName`, `getMarkdownFileCount`, and
`ActiveFileSnapshot`) live in deleted chat/composer surfaces (Waves 0–2). **No
kept consumer references them.** Per OC-PSR-1's accepted default, they are
dropped.

Target `src/domain/ports/WorkspacePort.ts`:

```ts
export interface WorkspacePort {
  openFile(path: string): Promise<void>
}
```

**Dropped from the interface:** `getActiveFile`, `onActiveFileChanged`,
`getActiveFilePath`, `getActiveSelection`, `getVaultName`,
`getMarkdownFileCount`, and the `ActiveFileSnapshot` interface. The
`import type { Unsubscriber } from './shared'` is removed from this file (it was
used only by `onActiveFileChanged`).

**`ActiveFileSnapshot` / `Unsubscriber` survival:**

- `ActiveFileSnapshot` — **deleted** (no kept consumer; was exported only for the
  chat panel). Its re-export is removed from `src/domain/ports/index.ts`.
- `Unsubscriber` (`src/domain/ports/shared.ts`) — **kept** in the barrel
  re-export (design §C.5 keeps it). Verify during the leaf-first delete whether
  any kept code still imports it; if nothing kept uses it, the `index.ts`
  re-export glob would match a live file but export a dead symbol — that is
  acceptable (it is a kept domain primitive, not a deleted-subsystem name) and
  does **not** violate NFR-PSR-009. If the dev confirms zero kept importers, they
  MAY drop the re-export, but it is not required.

**Impact on the three bridges (Wave 3):** `ObsidianBridge`, `MockBridge`,
`LocalStorageBridge` each delete their `getActiveFile*`/`onActiveFileChanged`/
`getVaultName`/`getMarkdownFileCount` member implementations and the
`ActiveFileSnapshot`/`Unsubscriber` imports tied to them. They keep `openFile`.

> Confirmed against source: `ObsidianBridge` currently `implements … ChatTransportPort, IconPort` and imports `ChatTransportError`/`StreamDelta`/`IconPort`/`ActiveFileSnapshot`/`Unsubscriber` — design §C.5's "verified to implement exactly six ports" was optimistic. `ObsidianBridge` MUST also be de-coupled in Wave 3: drop `ChatTransportPort` + `IconPort` from `implements`, delete `queryStream`/`isAvailable`/`setIcon`/`markIconAsMissing`/`missingIcons` and their imports. This is the same de-coupling §C.5 specifies for `MockBridge`/`LocalStorageBridge`; the spec extends it to `ObsidianBridge` explicitly.

- **Traces:** REQ-PSR-005; OC-PSR-1.

---

## §4 i18n stub contract (CL-1, REQ-PSR-006, REQ-PSR-005)

### SPEC-PSR-010 — Trimmed catalogue + single placeholder key

`src/ui/i18n/index.ts` is **kept unchanged in shape** — `i18n` (the `createI18n`
instance), `setLocale`, `i18nTranslate`, `i18nMerge`, `SupportedLocale`,
`SUPPORTED_LOCALES`, `MessageSchema` all survive. Only the **message catalogues**
are trimmed.

`src/ui/i18n/locales/en.ts` is reduced to exactly the one namespace the empty
view renders:

```ts
export default {
  agent: {
    empty: {
      placeholder: 'The Specorator agent panel is empty. Chat lands in a later phase.',
    },
  },
} as const
```

`src/ui/i18n/locales/de.ts` mirrors it with the `de` translation
(`'Das Specorator-Agent-Panel ist leer. Der Chat folgt in einer späteren Phase.'`
or similar — the dev writes the exact German copy). Both files keep their
`export default { … } as const` shape so `MessageSchema = typeof en` stays valid.

**Every other key in both catalogues is deleted** (`nav`, `home`, `feature`,
`settings`, `common`, `file`, `chat`, the large `agent.*` chat/composer subtree,
`welcome`, `thread`, `message`, `status`, `mode`, `attachment`, `provider`) —
their consuming components are deleted in Waves 0–2.

- **`agent.empty.placeholder`** is the single P0 message key. `AgentPanelRoot.vue`
  reads it via `useI18n().t('agent.empty.placeholder')`.
- **Pre-conditions:** none.
- **Post-conditions:** `i18nTranslate('agent.empty.placeholder')` returns the EN
  string when locale is `en`, the DE string when locale is `de`.
- **Traces:** REQ-PSR-006, REQ-PSR-005; CL-1.

### SPEC-PSR-011 — `TranslationPort` surface + `setLocale` call sites

- **`TranslationPort` (`src/domain/ports/TranslationPort.ts`)** — unchanged:
  `t(key: string, params?: Record<string, unknown>): string`. Kept in the barrel
  re-export (it is the P7 seam).
- **`i18nTranslate`** is the `TranslationPort` implementation. `main.ts`
  constructs `const translationPort: TranslationPort = { t: i18nTranslate }` and
  passes it to `PluginCore` under `ModulePorts.t` (unchanged wiring), and passes
  `i18nMerge` as today.
- **`setLocale(locale)` call sites (the live consumers of `settings.locale`):**
  1. `main.ts onload()` — once, after settings load, narrowed (SPEC-PSR-012).
  2. `AgentSidebarView.onOpen()` — narrowed (SPEC-PSR-009 view snippet).
  3. `src/ui/main.ts` standalone entry — after `bridge.getSettings()` resolves
     (design §C.7).
- **Traces:** REQ-PSR-006 (locale has a live consumer → not orphaned, REQ-PSR-005).

### SPEC-PSR-012 — Locale narrowing at the i18n boundary (edge case)

`PluginSettings.locale` is typed `string` (SPEC-PSR-001), but `setLocale` accepts
`SupportedLocale = 'en' | 'de'`. Every call site MUST narrow before calling:

```ts
function toSupportedLocale(locale: string): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as SupportedLocale)
    : 'en'
}
```

- **Behaviour:** a `locale` not in `SUPPORTED_LOCALES` (e.g. a stale `'fr'` from a
  foreign blob) falls back to `'en'` rather than being cast unsafely. This keeps
  `vue-i18n` on its `fallbackLocale: 'en'` and avoids a type-unsafe `as` cast that
  `@typescript-eslint/no-unsafe-argument` would reject.
- The dev MAY centralise `toSupportedLocale` in `src/ui/i18n/index.ts` (exported)
  so all three call sites share it.
- **Traces:** REQ-PSR-006; NFR-PSR-003 (no runtime error on unknown locale).

---

## §5 Deleted-symbol guard — ESLint rule + test (CL-2, REQ-PSR-005, NFR-PSR-009)

### SPEC-PSR-013 — `DELETED_SUBSYSTEM_BAN` `no-restricted-imports` group

Extend the project-wide `no-restricted-imports` block in `eslint.config.js`
(the one at lines ~328–340, currently `paths: [obsidian], patterns: [PORTS_BAN_PATTERN]`)
by adding a shared constant `DELETED_SUBSYSTEM_BAN` to `patterns`, mirroring the
`PORTS_BAN_PATTERN` shape (a `{ group, message }` object). Final shape:

```js
const DELETED_SUBSYSTEM_BAN = {
  group: [
    // domain
    '@/domain/chat', '@/domain/chat/**',
    '@/domain/feature', '@/domain/feature/**',
    // application
    '@/application/chat/**', '@/application/feature/**', '@/application/migration/**',
    // infrastructure adapters + repos
    '@/infrastructure/bridge/FeatureRepository',
    '@/infrastructure/bridge/degradedClaudeCliPort',
    '@/infrastructure/obsidian/Claude*', '@/infrastructure/obsidian/Cursor*',
    '@/infrastructure/obsidian/ObsidianMcp*', '@/infrastructure/obsidian/ObsidianCli*',
    '@/infrastructure/obsidian/ObsidianMetadataCache*', '@/infrastructure/obsidian/ObsidianCanvas*',
    '@/infrastructure/obsidian/ObsidianSecretStore*', '@/infrastructure/obsidian/ObsidianConfirmModal*',
    '@/infrastructure/obsidian/ObsidianMarkdownRender*',
    '@/infrastructure/cursor/**', '@/infrastructure/mcp/**',
    // deleted plugin views
    '**/SpecoratorView', '**/AgentSidepanelView',
    // deleted ports
    '@/domain/ports/ChatTransportPort', '@/domain/ports/TransportLifecyclePort',
    '@/domain/ports/ConfirmModalPort', '@/domain/ports/SecretStorePort',
    '@/domain/ports/MarkdownRenderPort', '@/domain/ports/IconPort',
    '@/domain/ports/MetadataCachePort', '@/domain/ports/CanvasPort',
    '@/domain/ports/ObsidianMcpServerPort', '@/domain/ports/ObsidianCliPort',
  ],
  message:
    'This module names a subsystem deleted in the P0 reboot (ADR-PSR-001). The chat/feature/transport/MCP/onboarding surface regrows per phase — do not re-import the old path.',
}
```

> The design's brace-glob form
> `@/infrastructure/obsidian/Obsidian{Mcp,Cli,…}*` and the ports brace form are
> **expanded into one entry per prefix** above, because ESLint's
> `no-restricted-imports` `patterns` uses minimatch and `{a,b}` brace expansion is
> reliable, but expanding by hand keeps each glob independently auditable against
> NFR-PSR-009 (every glob must match a real deleted path). The dev MAY collapse
> back to brace form if a unit-check confirms it expands as expected; the
> one-per-prefix form is the safe default.

**`paths` entry — banned injection-key symbols.** Add a `paths` entry banning the
named deleted injection keys when imported from `@/infrastructure/bridge/ports`:

```js
{
  name: '@/infrastructure/bridge/ports',
  importNames: [
    'ICON_PORT', 'METADATA_CACHE_PORT', 'CANVAS_PORT', 'CHAT_TRANSPORT_PORT',
    'PROVIDER_REGISTRY_KEY', 'TRANSPORT_LIFECYCLE_PORT', 'CONFIRM_MODAL_PORT',
    'SECRET_STORE_PORT', 'MARKDOWN_RENDER_PORT', 'TRANSPORT_KIND_KEY',
    'IS_MOBILE_KEY', 'SETTINGS_VERSION_KEY', 'OPEN_PLUGIN_SETTINGS_KEY',
    'PLUGIN_MANIFEST_KEY',
  ],
  message:
    'This InjectionKey was deleted in the P0 reboot (ADR-PSR-001). Only the six core ports remain (SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT, NOTIFICATION_PORT, LOGGER_PORT, COMMUNITY_PLUGIN_PORT).',
}
```

**Glob-resolution obligation (NFR-PSR-009):** during the leaf-first delete, the
dev MUST confirm each `group` glob and each `importNames` symbol resolves to a
real path/symbol that was deleted. A glob that matches nothing is dead and itself
violates NFR-PSR-009 — remove it. (E.g. if `@/infrastructure/mcp/**` turns out not
to exist as a directory, drop that glob; the MCP registrars may live under
`@/infrastructure/obsidian/` instead — verify against the Wave 3 delete set.)

**Dead custom-rule removal (NFR-PSR-009):** delete the
`local/no-legacy-claude-cli-port-names` rule registration, the
`eslint-rules/no-legacy-claude-cli-port-names.cjs` file + its
`__tests__` suite, the `lint:rules` half that runs it, and the
`src/ui/composables/useClaudeCliPort.ts` carve-out override block — their target
files are deleted. **Keep** `local/no-claude-home-reads` (it guards a
cross-cutting security invariant, not a deleted subsystem) unless the dev confirms
zero `src/**` files remain that could read `~/.claude/` (recommendation: keep it —
cheap, regression-proof, not a dead-bypass artifact).

- **Traces:** REQ-PSR-005, NFR-PSR-009; design §C.8.

### SPEC-PSR-014 — Guard test contract (`tests/architecture/no-deleted-subsystem-refs.test.ts`)

A Vitest test that runs ESLint over `src/**` via the ESLint Node API and asserts
zero violations carrying the `DELETED_SUBSYSTEM_BAN` message (and zero carrying
the deleted-injection-key message).

**Repo check (Stage 5):** the flat config already ignores `**/__fixtures__/**`
(line ~192) — the design's note that "the repo already exercises ESLint
programmatically for the boundary-rule fixtures" refers to that fixtures carve-out.
The Stage 5 read could not confirm a *committed* programmatic-ESLint test file
exists (the `tests/lint/` directory exists but its contents were not enumerable
with the read tooling). **The QA agent must check** `tests/lint/**` and
`tests/architecture/**` for an existing `new ESLint(...).lintFiles(...)` harness
and **reuse it** if present; otherwise create the file below. Either way the
assertion contract is identical.

**Invocation contract:**

```ts
import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'

const DELETED_BAN_FRAGMENT = 'deleted in the P0 reboot'

describe('deleted-subsystem guard (REQ-PSR-005, NFR-PSR-009)', () => {
  it('no src/** module imports a deleted subsystem path or injection key', async () => {
    const eslint = new ESLint({
      // flat config is auto-discovered from eslint.config.js at the repo root;
      // cwd defaults to process.cwd() which is the worktree root under vitest.
      cwd: fileURLToPath(new URL('../..', import.meta.url)), // tests/architecture/ -> repo root
      errorOnUnmatchedPattern: true, // a glob that matches nothing FAILS (NFR-PSR-009)
    })
    const results = await eslint.lintFiles(['src/**/*.ts', 'src/**/*.vue'])
    const offending = results
      .flatMap((r) => r.messages.map((m) => ({ file: r.filePath, ...m })))
      .filter((m) => m.ruleId === 'no-restricted-imports' && (m.message.includes(DELETED_BAN_FRAGMENT) || m.message.includes('was deleted in the P0 reboot')))
    expect(offending, JSON.stringify(offending, null, 2)).toHaveLength(0)
  })
})
```

**Contract:**

- **Target glob:** `src/**/*.ts` + `src/**/*.vue`. Uses the project flat config
  (`eslint.config.js`) — no separate config.
- **Assertion:** zero `no-restricted-imports` messages whose text matches the
  `DELETED_SUBSYSTEM_BAN` message or the deleted-injection-key message. Other
  lint findings are out of scope for this test (the daily `npm run lint` covers
  them) — filter strictly by message fragment so the test fails only on a
  re-introduced deleted reference, making it regression-proof and stable.
- **`errorOnUnmatchedPattern: true`** so a future tree shape that breaks the
  `src/**` glob fails loudly rather than silently passing on zero files.
- **Runs inside the existing gate:** it is a normal Vitest unit test under the
  `unit` project, executed by `npm run test` / `test:coverage`. **No new gate
  step** (CL-2 mandate). Note for QA: ESLint over `src/**` is slower than a pure
  unit test (~seconds); keep it a single `it` to bound cost.
- **Pre-conditions:** `eslint` is a dev dependency (it is — `npm run lint` uses
  it); `eslint.config.js` defines `DELETED_SUBSYSTEM_BAN`.
- **Post-conditions:** green ⇔ no live deleted-subsystem reference in `src/**`.
- **Traces:** REQ-PSR-005, NFR-PSR-009; design §C.8(b).

---

## §6 `ci.yml` `next` trigger edit (REQ-PSR-012, NFR-PSR-008)

### SPEC-PSR-015 — Add `next` to push + pull_request branch lists

`.github/workflows/ci.yml` lines 4–7 currently read:

```yaml
on:
  push:
    branches: [develop, demo, main]
  pull_request:
    branches: [develop, demo, main]
```

Edit to:

```yaml
on:
  push:
    branches: [develop, demo, main, next]
  pull_request:
    branches: [develop, demo, main, next]
```

**Contract:**

- This is the **only** change to `ci.yml`. Do not touch `concurrency`,
  `permissions`, the `workflow-lint` job, or any other job.
- **SHA-pin/actionlint safety:** no `uses:` line is added or changed, so the
  40-char-SHA-pin gate (`scripts/verify-workflows.js`) and `actionlint` are
  unaffected. The edit is a pure branch-list extension that `actionlint` accepts.
  Run `actionlint` locally per AGENTS.md §3 because a workflow file changed.
- **Out of file scope (flagged to release/SRE, non-blocking):** branch protection
  on `next` must require the `verify` check before merge — a repo-settings action,
  not a file edit.
- **Traces:** REQ-PSR-012, NFR-PSR-008; design §C.9.

---

## §7 Trimmed `main.ts` + standalone entry (REQ-PSR-001, REQ-PSR-011)

### SPEC-PSR-016 — `main.ts` surviving surface

`src/plugin/main.ts` is rewritten to the design §C.6 shape. The **kept** public
surface (referenced by other kept files):

- `class SpecoratorPlugin extends Plugin` with public fields `settings: PluginSettings`,
  `core: PluginCore | null`, `bridge: ObsidianBridge | null`.
- `onload()`: load settings → construct `ObsidianBridge` → construct
  `PluginCore(ALL_MODULES, ports)` where `ALL_MODULES = [coreSettingsModule, helloModule]`
  → `setLocale(toSupportedLocale(settings.locale))` → `core.init(storedData)` →
  `registerView(VIEW_TYPE_AGENT, (leaf) => new AgentSidebarView(leaf, this))` →
  `addCommand({ id: 'open-agent-sidebar', … })` →
  `addSettingTab(new SpecoratorSettingTab(this.app, this))`.
- `onunload()`: `this.app.workspace.detachLeavesOfType(VIEW_TYPE_AGENT)`;
  `this.bridge?.hideAllNotices()`; `void this.core?.destroy()`.
- `loadSettings()` / `updateSettings(partial)` / `activateAgentSidebar()`
  (SPEC-PSR-007). **`loadSettings()` runs the one-time `data.json`→device-local
  migrate-and-clear (SPEC-PSR-002a)** and reads `this.settings` from the device-local
  store via the bridge; it does **not** persist settings to `data.json`.
  `updateSettings(partial)` validates via `coreSettingsModule` then calls
  `bridge.saveSettings` (device-local write, never `data.json`) — REQ-PSR-013,
  NFR-PSR-010, ADR-PSR-002.

**Deleted from `main.ts`** (design §C.6 list): `node:child_process`/`node:os`
imports; all transport/provider/secret-store/MCP/cursor adapter construction +
`register(shutdown)` hooks; both old view registrations; both ribbon icons; the
`start/stop-mcp-server`/`switch-provider`/`re-run-setup` commands; the
`file-menu` + `active-leaf-change` + `registerObsidianProtocolHandler` handlers;
chat-threads + approval-rules persistence; the provider-selection migration; the
`_routeTransport`/`_mapResolvedToTransportSelection`/`_cycleProviderSelection`/
`_applyProviderFromUri`/`getProviderRegistry`/`detectLegacyVaultLayout`/
`_dispatchNavigate` methods; `secretStore`, `getCursorKeyCache`,
`refreshCursorKeyCache`, `getApiKeyCache`, `refreshApiKeyCache`,
`getApprovalRules`, `removeApprovalRule`, `activateView`, `bumpAllViews`.

> Stage-5 note for the dev: the settings tab no longer calls
> `plugin.secretStore` / `plugin.updateModuleSettings` for non-core modules in
> P0, but `updateModuleSettings` MAY be kept if `helloModule` or a kept module
> declares settings; if no kept module besides `coreSettingsModule` has a
> `settingsKey`, the `saveField` non-core branch (SPEC-PSR-008) is unreachable but
> harmless — keep it (generic schema contract). Verify `helloModule`'s shape
> during implementation.
>
> **Settings-storage delta (2026-05-24, ADR-PSR-002):** the `saveData(this._storedData)`
> **settings** write in `onload` is **dropped** — settings now persist to the
> device-local store via `bridge.saveSettings` (SPEC-PSR-002a/008). The only
> remaining `data.json` settings I/O is the one-time migrate-and-clear's legacy
> read + clear (SPEC-PSR-002a). If `PluginCore.init(storedData)` still needs a
> stored-data round-trip for **non-settings** module bootstrap, keep the minimal
> `init(storedData)` call but not the settings `saveData`; if `helloModule`
> persists nothing to `data.json`, `_storedData`/`saveData` has **no remaining P0
> consumer** and the dev drops it entirely (design §C.16). Verify during
> implementation (OC-PSR-4 covers the module shape).

- **Traces:** REQ-PSR-001, REQ-PSR-003.

### SPEC-PSR-017 — Standalone `src/ui/main.ts` (always `MockBridge`, OC-PSR-2)

Rewritten to the design §C.7 minimal mount. **Per OC-PSR-2 (accepted default):**
P0 standalone **always** constructs `MockBridge` — the PROD/`LocalStorageBridge`
branch is dropped. `LocalStorageBridge` survives the de-coupling (Wave 3, kept as
a compiling six-port class) but is **not referenced** by `src/ui/main.ts` in P0.
The GitHub-Pages demo path is deferred (re-introduced when a phase ships a browser
demo).

```ts
import { createApp, h } from 'vue'
import { createPinia } from 'pinia'
import AgentPanelRoot from './agent/AgentPanelRoot.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import { i18n, setLocale, toSupportedLocale } from './i18n'
import {
  SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT,
  NOTIFICATION_PORT, LOGGER_PORT, COMMUNITY_PLUGIN_PORT,
} from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

const bridge = new MockBridge()
const app = createApp(ErrorBoundary, {}, () => h(AgentPanelRoot))
app.use(createPinia())
app.use(i18n)
void bridge.getSettings().then((s) => { setLocale(toSupportedLocale(s.locale)) })
app.provide(SETTINGS_PORT, bridge)
app.provide(VAULT_PORT, bridge)
app.provide(WORKSPACE_PORT, bridge)
app.provide(NOTIFICATION_PORT, bridge)
app.provide(LOGGER_PORT, bridge)
app.provide(COMMUNITY_PLUGIN_PORT, bridge)
app.mount('#app')
```

**Deleted from the standalone path:** `vue-router` + `./router`, all routed
views, `AppRoot.vue`, `FeatureService`/`FeatureRepository`/`FEATURE_SERVICE_KEY`,
`LocalStorageSecretStore`/`MockSecretStore`, `DEV_FIXTURES`,
`CHAT_TRANSPORT_PORT`/`SECRET_STORE_PORT`/`ICON_PORT`/`OPEN_PLUGIN_SETTINGS_KEY`
provides, and (default) `bootstrapModules`. `standalone.css` + token CSS imports
are kept (CSS only).

- **Note on the `no-restricted-imports: off` carve-out:** `src/ui/main.ts`
  already has an ESLint override turning off `no-restricted-imports` (it is the UI
  composition root that instantiates `MockBridge`). Keep that override — it lets
  the file import `@/infrastructure/mock/MockBridge` without tripping
  `UI_FORBIDDEN_PATTERNS`. The `DELETED_SUBSYSTEM_BAN` is in the project-wide
  block which this override replaces, so `src/ui/main.ts` is **not** guarded by
  SPEC-PSR-013 — acceptable because it is the composition root and is small enough
  to review by hand; it imports no deleted symbol by construction.
- **Traces:** REQ-PSR-011, NFR-PSR-005; OC-PSR-2; design §C.7.

---

## §8 Edge cases + error paths (NFR-PSR-003)

### SPEC-PSR-018 — Enumerated edge cases

| # | Scenario | Required behaviour |
|---|---|---|
| E1 | Command run twice (view already open) | `activateAgentSidebar` reveals the existing leaf; **no second leaf** created. `getLeavesOfType(VIEW_TYPE_AGENT).length === 1` after. (SPEC-PSR-007) |
| E2 | Command run with no right sidebar available | `getRightLeaf(false)` returns `null` → method returns without throwing; no console error. |
| E3 | Settings blob missing (fresh install) | `migrate(0, null)` → `{}`; `validateSettings({})` → `DEFAULT_SETTINGS`. No error. (SPEC-PSR-002) |
| E4 | Settings blob corrupt (`'garbage'` / array / number) | `migrate` → `{}`; defaults applied. No error. |
| E5 | Settings blob from pre-versioned v0.x fat install | All 16 dropped keys stripped; only `locale`/`logLevel` survive (coerced). (SPEC-PSR-002) |
| E6 | `locale` not in `SUPPORTED_LOCALES` | `toSupportedLocale` → `'en'`; `vue-i18n` stays on `fallbackLocale`. No error. (SPEC-PSR-012) |
| E7 | Invalid `logLevel` persisted | `coerceEnum` → `'warn'`. (SPEC-PSR-003) |
| E8 | `onunload` with the view open | `detachLeavesOfType(VIEW_TYPE_AGENT)` triggers `onClose` → Vue `unmount` → `contentEl.empty()`. No leaked Vue app, no dangling notice. |
| E9 | `onClose` called when `vueApp === null` (never opened / double close) | No-op; no throw (optional-chained `unmount`). |
| E10 | `AgentPanelRoot` render throws | `ErrorBoundary` catches → `LoggerPort.error` + `NotificationPort.showError`, renders fallback. No uncaught error. (NFR-PSR-002/003) |
| E11 | `bridge === null` at `onOpen` (defensive) | View renders nothing; no throw. |
| E12 | Settings change persists then re-reads | `updateSettings({ logLevel: 'debug' })` → `SettingsPort.saveSettings` → later `getSettings()` returns `logLevel: 'debug'`. (REQ-PSR-007) |
| E13 | Settings change → `data.json` stays clean | After E12's save (device-local backing store), the persisted `data.json` settings slice has **no** `locale`/`logLevel`; the value round-trips from the device-local store. (REQ-PSR-013, NFR-PSR-010; SPEC-PSR-002a/008) |
| E14 | One-time legacy `data.json`→device-local migrate-and-clear | On first `loadSettings()`, a legacy `data.json` slice is projected → seeded into the device-local store (if empty) → the legacy slice is cleared from `data.json`; device-local-wins when both populated; idempotent + both-empty no-op. (REQ-PSR-013; SPEC-PSR-002a) |

- **Traces:** NFR-PSR-003 (E1–E11), REQ-PSR-007 (E12), REQ-PSR-013 + NFR-PSR-010 (E13–E14).

---

## §9 Per-wave acceptance invariant (design §C.14)

This spec does **not** re-enumerate the delete inventory (design §C.14 owns it).
It restates the binding invariant for the implementer/QA:

- The delete proceeds leaf-first across the six waves (UI leaves → plugin views →
  application → infra adapters → domain root → config/docs/guards).
- **Each wave ends with `npm run typecheck` (and `npm run lint`)
  green-or-expected-broken** before the next wave starts; the `tsc` error list is
  the authoritative next-delete set (R-PSR-1 mitigation).
- **Final acceptance:** `npm run verify` green with zero bypasses
  (counter-metric = 0, PRD success metrics), the SPEC-PSR-014 guard test passing,
  and the plugin booting one empty agent sidebar view with no console errors
  (NFR-PSR-003).
- **OC-PSR-3 (mechanical, folded into a planner task note):** verify the
  `docs/adr/` index file name and add the `ADR-PSR-001` row; add `superseded-by`
  pointer fields to ADR-008's and the MPS/AUX agent-surface ADRs' frontmatter
  (bodies stay immutable — only pointer fields update). Not a code contract; do
  not block.

---

## §10 Observability requirements

P0 ships an empty view; observability is minimal and inherited:

- **`LoggerPort`** filtered by `PluginSettings.logLevel` (default `warn`) in
  `ObsidianBridge` (unchanged). `ErrorBoundary` logs caught component errors via
  `LoggerPort.error` (SPEC-PSR-005 E10).
- **`NotificationPort`** surfaces the `ErrorBoundary` fallback notice
  (`showError`, sticky by default).
- **No metrics/traces/alerts** are introduced — out of scope for an empty shell
  (no NFR requires them; NFR-PSR-003 is "zero console errors", verified manually +
  by the boot-flow test).
- **Boot log discipline:** `onload` MUST NOT emit `console.error`/unhandled
  rejection (NFR-PSR-003). Any informational boot log goes through `LoggerPort`
  (filtered to `warn` by default, so silent on a clean boot).

---

## §11 Performance budgets (inherited)

No tighter budget than the PRD NFRs. Inherited verbatim:

- **NFR-PSR-006** — bundle size within the existing `scripts/check-bundle-size.mjs`
  budget. The reboot *removes* code, so the bundle shrinks; the budget is a
  ceiling, trivially met. No new threshold.
- **NFR-PSR-002** — coverage 80/70/80/80 over the `vitest.config.ts` `include`
  set on the gutted tree. The SPEC-PSR-014 guard test, the migration tests
  (SPEC-PSR-002 edges), and the boot/view tests are the principal new coverage
  sources keeping the smaller tree above threshold.

---

## §12 Compatibility / migration plan

- **Settings (field shape):** backward-compatible read via strip-on-read
  (SPEC-PSR-002). A user upgrading from any prior install loses the dropped fields
  on first load+save (intended — their consumers are gone). `settingsVersion` 3 → 4
  is the marker; the migration is forward-only (no down-migration — P0 is a clean
  break, ADR-PSR-001).
- **Settings (storage location, 2026-05-24 delta, ADR-PSR-002):** the production
  `ObsidianBridge` backing store moves off `data.json` onto a device-local store
  (`app.loadLocalStorage`/`saveLocalStorage`, key `specorator:settings`,
  device-scoped + not synced). A one-time `loadSettings()` migrate-and-clear
  (SPEC-PSR-002a) projects any legacy `data.json` slice into the device-local store
  and clears it from `data.json`, so old shared blobs stop being committed
  (REQ-PSR-013, NFR-PSR-010). Idempotent; device-local wins when both are populated.
  The `SettingsPort` contract and `PluginSettings` shape are unchanged;
  `MockBridge`/`LocalStorageBridge` are unaffected. **API availability** at
  `minAppVersion 1.12.7` is verified at impl (NFR-PSR-011); escalate per NG6 if
  absent (ADR-PSR-002 Option C fallback). **Secrets** (REQ-PSR-014) are P0-vacuous
  and decided under a deferred P1 ADR — no P0 surface.
- **No `manifest.json` change** (NFR-PSR-007, NG6): `id`/`version`/`minAppVersion`
  untouched. No design or spec element edits the manifest.
- **`next` integration branch:** SPEC-PSR-015 makes `next` CI-covered; the P0 PR
  is the first to exercise it.
- **API surface:** P0 deletes public types/ports that later phases re-introduce
  per consumer (ADR-008 discipline). This is an intended breaking change on the
  `next` line only; `develop` history is untouched (NG5).

---

## §13 Test scenarios — `TEST-PSR-NNN` (traceability)

> 1:1 mapping to REQ-PSR / NFR-PSR. **U** = unit (Vitest + fake-ports / PageObject,
> no Obsidian runtime). **M** = manual Obsidian verification. **A** = automated
> architecture/guard test. QA turns these into automated tests; the **M** rows are
> the documented manual checks for NFR-PSR-003.

| TEST-PSR | Type | Scenario | Verifies | Spec item |
|---|---|---|---|---|
| TEST-PSR-001 | U | `migrate(4, {locale:'de',logLevel:'info'})` returns same projection (already-v4 edge) | REQ-PSR-008 | SPEC-PSR-002 |
| TEST-PSR-002 | U | `migrate(0, fatBlob)` strips all 16 dropped keys → `{locale,logLevel}` (pre-versioned v0.x) | REQ-PSR-006/008, REQ-PSR-005 | SPEC-PSR-002 |
| TEST-PSR-003 | U | `migrate(v, migrate(v, blob))` deep-equals `migrate(v, blob)` (idempotency) | REQ-PSR-008 | SPEC-PSR-002 |
| TEST-PSR-004 | U | `migrate` of `null`/`'garbage'`/`42`/`['a']` → `{}` | REQ-PSR-008, NFR-PSR-003 | SPEC-PSR-002 |
| TEST-PSR-005 | U | `validateSettings({})` → `DEFAULT_SETTINGS`; invalid `logLevel`→`'warn'`; invalid type for `locale`→`'en'` | REQ-PSR-008 | SPEC-PSR-003 |
| TEST-PSR-006 | U | `coreSettingsModule.settingsSchema.fields` has exactly `['locale','logLevel']`, both dropdowns | REQ-PSR-008 | SPEC-PSR-004 |
| TEST-PSR-007 | U | `PluginSettings` keys == `{locale,logLevel}`; no `@/domain/chat` import (asserted by guard, TEST-PSR-016) | REQ-PSR-006 | SPEC-PSR-001 |
| TEST-PSR-008 | U | `AgentPanelRoot` mount (PageObject) exposes `data-testid="agent-panel-empty"` rendering `agent.empty.placeholder` | REQ-PSR-002 | SPEC-PSR-006 |
| TEST-PSR-009 | U | `i18nTranslate('agent.empty.placeholder')` returns EN string at `en`, DE string after `setLocale('de')` | REQ-PSR-006, CL-1 | SPEC-PSR-010/011 |
| TEST-PSR-010 | U | `toSupportedLocale('fr')` → `'en'`; `toSupportedLocale('de')` → `'de'` | REQ-PSR-006, NFR-PSR-003 | SPEC-PSR-012 |
| TEST-PSR-011 | U | `WorkspacePort` type exposes only `openFile`; `MockBridge` satisfies it; chat-era members absent | REQ-PSR-005, OC-PSR-1 | SPEC-PSR-009 |
| TEST-PSR-012 | U | `activateAgentSidebar` twice (mock workspace) → one `VIEW_TYPE_AGENT` leaf; reveal called | REQ-PSR-002/003 | SPEC-PSR-007 (E1) |
| TEST-PSR-013 | U | `activateAgentSidebar` with `getRightLeaf`→null returns without throw | NFR-PSR-003 | SPEC-PSR-007 (E2) |
| TEST-PSR-014 | U | settings tab dropdown change → `SettingsPort.saveSettings` called; `getSettings` returns new value | REQ-PSR-007 | SPEC-PSR-008 (E12) |
| TEST-PSR-015 | U | `ErrorBoundary` catches a thrown child → `LoggerPort.error` + `NotificationPort.showError`; fallback testid present | NFR-PSR-002/003 | SPEC-PSR-005 (E10) |
| TEST-PSR-016 | A | ESLint Node API over `src/**` → zero `DELETED_SUBSYSTEM_BAN`/deleted-key violations; `errorOnUnmatchedPattern` true | REQ-PSR-005, NFR-PSR-009 | SPEC-PSR-013/014 |
| TEST-PSR-017 | U | Re-importing a deleted path in a fixture trips `no-restricted-imports` with the ban message (positive control for the guard) | REQ-PSR-005 | SPEC-PSR-013 |
| TEST-PSR-018 | M | Plugin loads in Obsidian: `onload` completes, zero console errors / unhandled rejections | NFR-PSR-003, REQ-PSR-001 | SPEC-PSR-016, §C.10 |
| TEST-PSR-019 | M | Run "Open agent sidebar" command → empty view opens in right sidebar, placeholder visible, no console error | REQ-PSR-002, NFR-PSR-003 | SPEC-PSR-007 |
| TEST-PSR-020 | M | Enumerate registered commands + ribbon: exactly one command (`open-agent-sidebar`), no ribbon, none names a deleted subsystem | REQ-PSR-003 | SPEC-PSR-007 |
| TEST-PSR-021 | M | `onunload` (disable plugin) detaches the leaf; re-enable boots clean | NFR-PSR-003 | SPEC-PSR-016 (E8) |
| TEST-PSR-022 | U | `npm run build:web` entry mounts `AgentPanelRoot` with `MockBridge` (smoke: app mounts, testid present in jsdom) | REQ-PSR-011, NFR-PSR-005 | SPEC-PSR-017 |
| TEST-PSR-023 | A | `ci.yml` `on.push.branches` and `on.pull_request.branches` both contain `next` (YAML parse assertion) | REQ-PSR-012, NFR-PSR-008 | SPEC-PSR-015 |
| TEST-PSR-024 | U | After `updateSettings({ logLevel:'debug' })` (device-local bridge), the `data.json` settings slice has **no** `locale` and **no** `logLevel`, and `getSettings()` round-trips `logLevel:'debug'` from the device-local store (data-hygiene guard) | REQ-PSR-013, NFR-PSR-010 | SPEC-PSR-002a, SPEC-PSR-008 |
| TEST-PSR-025 | U | One-time `loadSettings()` migrate-and-clear: legacy `data.json` slice `{locale:'de',logLevel:'info',specsFolder:'x'}` → device-local seeded `{locale:'de',logLevel:'info'}` + `data.json` slice cleared; device-local-wins when both populated; idempotent no-op on a second run; both-empty no-op | REQ-PSR-013, NFR-PSR-010 | SPEC-PSR-002a |

**Coverage of REQ/NFR by TEST-PSR:**

| REQ/NFR | TEST-PSR |
|---|---|
| REQ-PSR-001 | 012, 018 |
| REQ-PSR-002 | 008, 012, 013, 019 |
| REQ-PSR-003 | 012, 020 |
| REQ-PSR-004 | (whole gate — verified by `npm run verify`; §9 invariant) |
| REQ-PSR-005 | 002, 007, 011, 016, 017 |
| REQ-PSR-006 | 001–005, 007, 009, 010 |
| REQ-PSR-007 | 014, 024 |
| REQ-PSR-008 | 001–006 |
| REQ-PSR-009 | (ADR-PSR-001 already filed — doc check, OC-PSR-3) |
| REQ-PSR-010 | (docs review — reviewer, not an automated test) |
| REQ-PSR-011 | 022 |
| REQ-PSR-012 | 023 |
| REQ-PSR-013 | 024, 025 |
| REQ-PSR-014 | (P0-vacuous — no secret surface; traces to deferred P1 `SecretStorePort` ADR) |
| NFR-PSR-001 | (verify gate, §9) |
| NFR-PSR-002 | 008, 015, + migration/view unit tests above |
| NFR-PSR-003 | 004, 010, 013, 015, 018, 019, 021 |
| NFR-PSR-004 | (`npm run build`, §9) |
| NFR-PSR-005 | 022 |
| NFR-PSR-006 | (`verify:bundle-size`, §9) |
| NFR-PSR-007 | (`validate:manifest`, §9 / §12) |
| NFR-PSR-008 | 023 |
| NFR-PSR-009 | 016, 017 |
| NFR-PSR-010 | 024, 025 |
| NFR-PSR-011 | (impl-time API-availability verification at `minAppVersion 1.12.7`; manual/recon step — not a discrete automated test; ADR-PSR-002 Compliance) |

Total durable `TEST-PSR`: **25** (17 unit, 3 automated architecture/guard,
5 manual Obsidian). REQ-PSR-004/009/010/014 and the build/manifest/bundle NFRs +
NFR-PSR-011 (impl-time API check) are covered by the verify gate / doc review /
impl recon rather than a discrete `TEST-PSR`, per the §9 acceptance invariant.

---

## Open clarifications

> Residual under-specification surfaced this stage. None blocks tasks; each is a
> dev/QA verification step with a pinned default, not a user-intent fork.

- **OC-PSR-4 — `ALL_MODULES` / `helloModule` shape.** The trimmed `main.ts`
  constructs `PluginCore(ALL_MODULES, …)`. Stage 5 did not read
  `src/modules/index.ts` / `helloModule`. The dev must confirm `ALL_MODULES`
  exists and contains `[coreSettingsModule, helloModule]` (design §C.1/C.2), and
  that `helloModule` declares no settings that name a deleted subsystem. Default:
  keep `helloModule` as the smoke module; if `ALL_MODULES` currently includes
  deleted modules, trim it to the two. Non-blocking.
- **OC-PSR-5 — `@/infrastructure/mcp/**` and `@/application/migration/**` glob
  resolution.** SPEC-PSR-013 lists these in `DELETED_SUBSYSTEM_BAN`. Stage 5
  could not enumerate those directories. The dev MUST confirm each maps to a real
  deleted path during Wave 3/2; drop any glob that matches nothing (NFR-PSR-009).
  The MCP registrars may live under `@/infrastructure/obsidian/ObsidianMcp*`
  rather than a top-level `@/infrastructure/mcp/**` — verify and prune.
- **OC-PSR-6 — existing programmatic-ESLint harness.** SPEC-PSR-014 could not
  confirm whether `tests/lint/**` already contains a `new ESLint().lintFiles()`
  harness to reuse. QA checks first; reuses if present, else creates the new file.
  Either way the assertion contract (SPEC-PSR-014) is identical. Non-blocking.
- **OC-PSR-7 — `ErrorBoundary` import path under the de-coupled UI.** SPEC-PSR-005
  imports `ErrorBoundary` from `@/ui/components/ErrorBoundary.vue` (its current
  path). It currently uses `useLoggerPort` + `useNotificationPort` — both kept
  composables backed by kept ports. Confirm `ErrorBoundary.vue` survives Wave 0
  unedited (it must — the empty view mounts inside it). If the dev relocates it to
  `src/ui/agent/`, update both call sites (`AgentSidebarView`, `src/ui/main.ts`).
  Default: keep it in place. Non-blocking.

---

## Quality gate

- [x] Every public interface specified (signature, behaviour, pre/post, side
      effects, errors, REQ links): `PluginSettings`, `migrate`, `validateSettings`,
      `settingsSchema`, `AgentSidebarView`, `AgentPanelRoot.vue`, command +
      `activateAgentSidebar`, `SpecoratorSettingTab`, `WorkspacePort`, i18n stub,
      standalone entry, `main.ts` surface, `ci.yml` edit.
- [x] Data structures + per-field validation rules stated (SPEC-PSR-001/003).
- [x] State/edge cases enumerated, not "TBD" (§8 E1–E12; §1 migration edge table).
- [x] Test scenarios derived, 1:1 to REQ/NFR (§13, TEST-PSR-001..023).
- [x] Observability requirements per interface (§10).
- [x] Performance budgets inherited from PRD NFRs (§11).
- [x] Compatibility + migration plan (§12 — strip-on-read, no manifest change).
- [x] Deleted-symbol guard rule + test made implementation-ready (§5).
- [x] `WorkspacePort` OC-PSR-1 resolved against kept consumers (§3).
- [x] `ci.yml` edit SHA-pin/actionlint-safe (§6).
- [x] Per-wave acceptance invariant restated, not re-enumerated (§9).
- [x] Residual under-specification surfaced in Open clarifications, not guessed.
- [x] Settings-storage delta (2026-05-24, CHARTER-REQ-SET): SPEC-PSR-002a (device-local
      backing-store re-point + one-time migrate-and-clear contract + edge table, CL-5/CL-6)
      and SPEC-PSR-008 (tab persists via the re-pointed `SettingsPort`) amended;
      TEST-PSR-024 (NFR-PSR-010 data-hygiene) + TEST-PSR-025 (relocate-and-clear)
      added; edges E13/E14 enumerated; ADR-PSR-002 referenced. REQ-PSR-014 P0-vacuous
      (no secret surface; deferred P1 ADR).
