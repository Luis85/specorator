---
slug: w1-port-granularity
title: W1 — Replace IBridge with narrow ports
status: accepted
issue: 99
epic: 85
date: 2026-05-03
supersedes_adr: ADR-002
introduces_adr: ADR-008
---

# W1 — Replace `IBridge` with narrow ports

## Context

`IBridge` (ADR-002) groups every Obsidian capability the plugin needs into a single interface (10 methods today: file/folder ops, `openFile`, `showNotice`, `getSettings`/`saveSettings`). Every consumer depends on the union, even when it only needs one slice. Three runtime implementations (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) all carry the full surface, and 21 source files import the aggregate.

Epic #85 (pre-feature infrastructure hardening) requires interface segregation so that downstream work (W2 module system, W3 EventBus, W4 PluginCore lifecycle) can declare narrow capability dependencies without dragging the rest of the surface along.

Issue #99 asked for 13 ports. An audit of the current source shows only 4 capabilities have real consumers (settings, vault file/folder, workspace open, notification). The remaining 9 ports proposed in the issue (Logger, Command, ViewRegistry, Dialog, Platform, Storage, Scheduler, Translation, FileExtension) have **zero** consumers today. Adding empty ports would create unused interface surface, no test coverage, and no validation that the abstraction is correctly shaped. We defer them until a real consumer appears.

## Decision

Replace `IBridge` with **four narrow ports** living in the domain layer. Each runtime implementation declares all four ports on a single class (one class per runtime, not one file per port × runtime). Vue components inject one port per dependency via dedicated composables.

### Ports

| Port | Methods | Replaces |
|---|---|---|
| `SettingsPort` | `getSettings()`, `saveSettings(settings)` | `IBridge.getSettings`, `IBridge.saveSettings` |
| `VaultPort` | `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder` | `IBridge` file/folder methods |
| `WorkspacePort` | `openFile(path)` | `IBridge.openFile` |
| `NotificationPort` | `showNotice(message, durationMs?)` | `IBridge.showNotice` |

`PluginSettings` and `DEFAULT_SETTINGS` move from `src/infrastructure/bridge/IBridge.ts` to a new `src/domain/settings/PluginSettings.ts` (they describe domain configuration, not bridge mechanics).

### File layout

```
src/domain/ports/
  SettingsPort.ts
  VaultPort.ts
  WorkspacePort.ts
  NotificationPort.ts
  index.ts                    # re-exports the four ports

src/domain/settings/
  PluginSettings.ts           # PluginSettings + DEFAULT_SETTINGS

src/infrastructure/bridge/
  ports.ts                    # 4 InjectionKeys + symbol typing helpers

src/infrastructure/obsidian/ObsidianBridge.ts        # implements all four ports
src/infrastructure/mock/MockBridge.ts                # implements all four ports
src/infrastructure/localstorage/LocalStorageBridge.ts  # implements all four ports

src/ui/composables/
  useSettingsPort.ts
  useVaultPort.ts
  useWorkspacePort.ts
  useNotificationPort.ts
```

Deleted in the same PR:
- `src/infrastructure/bridge/IBridge.ts`
- `src/infrastructure/bridge/BridgeKey.ts`
- `src/ui/composables/useBridge.ts`

### DI mechanism

`src/plugin/main.ts` and `src/ui/main.ts` register all four ports against the same instance:

```ts
const bridge = new ObsidianBridge(...)  // or MockBridge / LocalStorageBridge
app.provide(SETTINGS_PORT, bridge)
app.provide(VAULT_PORT, bridge)
app.provide(WORKSPACE_PORT, bridge)
app.provide(NOTIFICATION_PORT, bridge)
```

Composables inject one port:

```ts
export function useVaultPort(): VaultPort {
  const port = inject(VAULT_PORT)
  if (!port) throw new Error('VaultPort not provided')
  return port
}
```

A consumer that needs two ports calls two composables. No aggregate `usePorts()`. This is enforceable via `no-restricted-imports` if it is ever introduced.

### Adapter implementation pattern

Each runtime keeps a single class implementing all four port interfaces:

```ts
export class ObsidianBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort
{
  // existing method bodies, unchanged
}
```

Rationale for one class instead of 12 adapter files:
- Current bridge surface is small enough that splitting into 12 files adds boilerplate without testing benefit.
- Each runtime class keeps its own internal state cohesive (e.g. `MockBridge`'s in-memory map, `LocalStorageBridge`'s localStorage namespace). Splitting that state across files would require a shared store anyway.
- The interface segregation benefit lives at the **consumer** boundary (composables, use cases), not the implementation. Consumers depend on `VaultPort`; the fact that the same object also implements `NotificationPort` is invisible to them.
- When a runtime grows enough to justify splitting (e.g., real file I/O moves to a worker), the change is local — extract the port methods into a delegate, the class still satisfies the interface.

### Test contracts

`src/infrastructure/bridge/__tests__/IBridgeContract.spec.ts` is split into four port-shaped contract specs under `src/infrastructure/bridge/__tests__/`:

- `SettingsPortContract.spec.ts`
- `VaultPortContract.spec.ts`
- `WorkspacePortContract.spec.ts`
- `NotificationPortContract.spec.ts`

Each spec parameterises over `MockBridge` and `LocalStorageBridge` (Obsidian adapter excluded per existing coverage config). Existing assertions migrate one-to-one — no new behavioural coverage in this PR. The describe-block label `IBridge contract` is renamed per port (`SettingsPort contract`, etc.).

### Caller migration

Files grouped by which port set each consumes. Driven by an audit of the 21 importers of `IBridge` / `BridgeKey` / `useBridge` plus the 11 importers of `PluginSettings` / `DEFAULT_SETTINGS`.

| Group | Files | Ports / types needed |
|---|---|---|
| **Pure SettingsPort** | `src/ui/composables/useSettings.ts`, `src/ui/stores/settingsStore.ts`, `src/ui/views/SettingsView.vue`, `src/plugin/settings.ts` | `SettingsPort` + `PluginSettings` type |
| **SettingsPort + WorkspacePort** | `src/ui/views/HomeView.vue`, `src/ui/views/FeaturesView.vue` | both |
| **VaultPort only** | `src/ui/views/FileView.vue` | `VaultPort` (file content read; `router.back()` is Vue Router, not the bridge) |
| **VaultPort + NotificationPort (full repo)** | `src/infrastructure/bridge/FeatureRepository.ts` | both (notification is the `idea.md` already-exists path and `createStageFile` overwrite-protection notice) |
| **`useFeatures` composable + tests** | `src/ui/composables/useFeatures.ts`, `src/ui/composables/__tests__/useFeatures.spec.ts` | `SettingsPort` + `VaultPort` + `NotificationPort` (constructs `FeatureRepository`) |
| **Plugin entry + view** | `src/plugin/main.ts`, `src/plugin/SpecoratorView.ts` | constructs `ObsidianBridge`, provides all four |
| **Standalone entry** | `src/ui/main.ts` | constructs `MockBridge`, provides all four |
| **Adapter classes** | `src/infrastructure/obsidian/ObsidianBridge.ts`, `src/infrastructure/mock/MockBridge.ts`, `src/infrastructure/localstorage/LocalStorageBridge.ts` | implement all four |
| **Adapter / contract tests** | `src/infrastructure/bridge/__tests__/IBridgeContract.spec.ts` (split), `src/infrastructure/localstorage/__tests__/LocalStorageBridge.spec.ts` | reference port interfaces |
| **Use-case tests** | `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts` | construct `MockBridge` (which still implements all four), pass narrow ports into `FeatureRepository` |

#### `PluginSettings` import path rewrites

11 surviving files import `PluginSettings` and/or `DEFAULT_SETTINGS` from `@/infrastructure/bridge/IBridge`. After the move, all 11 import from `@/domain/settings/PluginSettings` instead. Touched: `LocalStorageBridge.ts`, `MockBridge.ts`, `ObsidianBridge.ts`, `plugin/settings.ts`, `ui/composables/useSettings.ts`, `ui/stores/settingsStore.ts`, `ui/views/SettingsView.vue`, `ui/composables/__tests__/useFeatures.spec.ts`, `infrastructure/localstorage/__tests__/LocalStorageBridge.spec.ts`, `application/feature/__tests__/CreateFeatureUseCase.spec.ts`, plus `FeatureRepository.ts`. Mechanical sed-style replacement; no API change.

> Twelfth importer `IBridgeContract.spec.ts` also references `DEFAULT_SETTINGS` (lines 82, 84) but is deleted in step 9 and replaced by four port-shaped contract specs (step 9). Those new specs import `PluginSettings` from the new domain location for any settings-related assertions — do not re-import from the deleted IBridge path.

#### `FeatureRepository` constructor change

Today:
```ts
constructor(
  private readonly bridge: IBridge,
  private readonly settings: PluginSettings,
) {}
```

After (narrow ports — chosen over a small composite to keep with the spirit of segregation):
```ts
constructor(
  private readonly vault: VaultPort,
  private readonly notifications: NotificationPort,
  private readonly settings: PluginSettings,
) {}
```

`useFeatures.ts` constructs the repository with both ports:
```ts
const vault = useVaultPort()
const notifications = useNotificationPort()
const settingsPort = useSettingsPort()
// ... loads settings via settingsPort, then:
new FeatureRepository(vault, notifications, settings)
```

`useFeatures.spec.ts` and `CreateFeatureUseCase.spec.ts` continue to construct a `MockBridge` instance and pass it twice (once as `vault`, once as `notifications`). This keeps test setup terse; tests that want narrower fakes can pass per-port stubs instead.

### ESLint enforcement

One concrete change to `eslint.config.*`:

1. Add `IBridge`, `BridgeKey`, and `useBridge` to `no-restricted-imports` paths so any re-introduction by name is flagged.

A stricter rule that detects "any new interface composing two or more port types" is **not** part of this PR. Reason: AST-level shape detection requires a custom ESLint plugin and the cost is not justified before a violation is observed. The `index.ts` of `src/domain/ports/` carries an explanatory comment that any aggregate composition belongs in a single port instead.

### ADR

`docs/adr/ADR-008-narrow-ports-supersede-ibridge.md` (status: accepted, supersedes ADR-002). ADR-002 frontmatter updated to `status: superseded`, with a `superseded_by: ADR-008` field.

### CLAUDE.md

The "IBridge abstraction (ADR-002)" section is replaced with "Narrow ports (ADR-008)" describing the four ports, the per-port DI keys, the per-port composables, and the rule that consumers depend on one port at a time.

## Out of scope (deferred)

The following ports listed in issue #99 are intentionally not introduced in this PR:

- `LoggerPort` — only one `console.*` call exists in `src/` today: `MockBridge.showNotice` writes `console.info('[MockBridge Notice] …')` (line 77) as a debug fallback for the standalone harness. That is internal diagnostic plumbing, not a consumer that would benefit from a `LoggerPort` abstraction.
- `CommandPort`, `ViewRegistryPort`, `DialogPort` — Obsidian capabilities not currently used by domain or UI.
- `PlatformPort` — no `Platform.isMobile` or platform branching today.
- `StoragePort`, `SchedulerPort` — no consumer.
- `TranslationPort` — vue-i18n integration is W8 (#106); that work introduces the port if needed.
- `FileExtensionPort` — no consumer.

When a real consumer appears for any of these, a follow-up PR introduces the port with the consumer's call sites already exercising the interface. PR description for #99 will document this scope reduction and link to follow-up issues if the W2/W3/W4 work surfaces a need.

## Acceptance (issue #99, revised)

- [x] Each port lives in its own domain file with no Obsidian imports.
- [x] One adapter **class** per runtime implements all four ports (revised from "one adapter file per port × runtime" — see rationale above; documented in ADR-008).
- [x] `IBridge` deleted; ESLint forbids re-introducing the `IBridge`, `BridgeKey`, or `useBridge` symbols (name-ban via `no-restricted-imports`). AST-level "no aggregate interface" rule is explicitly out of scope and noted in `src/domain/ports/index.ts`.
- [x] All callers updated; pre-PR gate (`npm run verify`) green.
- [x] ADR-008 added (supersedes ADR-002).

## Migration plan

Single PR, atomic. Order of work inside the branch:

1. Add `src/domain/settings/PluginSettings.ts` (move `PluginSettings` + `DEFAULT_SETTINGS` out of `IBridge.ts`). Update the 11 importers listed in **Caller migration → `PluginSettings` import path rewrites** to point at the new location.
2. Add `src/domain/ports/SettingsPort.ts`, `VaultPort.ts`, `WorkspacePort.ts`, `NotificationPort.ts`, and `index.ts` (with the explanatory "no aggregate" comment).
3. Add `src/infrastructure/bridge/ports.ts` with the four `InjectionKey` symbols.
4. Update `ObsidianBridge`, `MockBridge`, `LocalStorageBridge` to declare `implements SettingsPort, VaultPort, WorkspacePort, NotificationPort` (no body changes — same methods already present).
5. Add `src/ui/composables/useSettingsPort.ts`, `useVaultPort.ts`, `useWorkspacePort.ts`, `useNotificationPort.ts`.
6. Update `src/plugin/main.ts`, `src/plugin/SpecoratorView.ts`, and `src/ui/main.ts` to provide all four ports against the same instance.
7. Migrate the 21 caller files (per the Caller migration table). Replace `useBridge()` / `inject(BRIDGE_KEY)` with the relevant port composables.
8. Update `FeatureRepository` constructor signature (`vault: VaultPort, notifications: NotificationPort, settings: PluginSettings`) and its single construction site in `useFeatures.ts`. Update `useFeatures.spec.ts` and `CreateFeatureUseCase.spec.ts` accordingly.
9. Split `IBridgeContract.spec.ts` into four port-shaped contract specs (Settings/Vault/Workspace/Notification). Delete the original.
10. Delete `src/infrastructure/bridge/IBridge.ts`, `src/infrastructure/bridge/BridgeKey.ts`, `src/ui/composables/useBridge.ts`.
11. Add the `no-restricted-imports` entries for `IBridge`, `BridgeKey`, `useBridge` to `eslint.config.*`.
12. Write `docs/adr/ADR-008-narrow-ports-supersede-ibridge.md` (status: accepted, supersedes ADR-002).
13. Update `docs/adr/ADR-002-ibridge-abstraction.md` frontmatter: `status: superseded`, add `superseded_by: ADR-008`, prepend a brief admonition pointing to ADR-008.
14. Update `CLAUDE.md`: replace the "IBridge abstraction (ADR-002)" section with "Narrow ports (ADR-008)".
15. Run `npm run verify`. Open PR against `develop`.

> Steps 12 and 13 (this PR's spec + ADR work) are already on the branch as a foundational commit. Steps 1–11 are the implementation. Steps 14–15 close out.

## Risks

- **Caller migration churn**: 21 files. Each change is mechanical (one import + one call site swap). Risk mitigated by per-port contract tests + existing test suite (116 tests).
- **Standalone bootstrap**: `src/ui/main.ts` runs in browser via `MockBridge`. Four `provide` calls instead of one — trivial change.
- **Plugin bootstrap**: `src/plugin/main.ts` constructs `ObsidianBridge` and provides it once per Vue app instance. Unchanged construction, four provides.
- **GitHub Pages demo**: `LocalStorageBridge` already implements every method on `IBridge`. Splitting into ports does not change behaviour — same instance satisfies four interfaces.
- **PR diff size**: ~30–40 files touched (4 new port files, 4 new composable files, 1 new ports.ts, 1 extracted PluginSettings file, 3 modified runtime classes, ~21 caller migrations, 4 new contract specs replacing 1, 2 ESLint entries, 1 new ADR + 1 superseded ADR + CLAUDE.md). Mechanical, but worth flagging in the PR description so reviewers can scan rather than line-read every change.
