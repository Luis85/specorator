---
id: ADR-008
title: Narrow ports replace the IBridge aggregate
status: accepted
date: 2026-05-03
supersedes: ADR-002
---

# ADR-008 — Narrow ports replace the `IBridge` aggregate

## Decision

The single `IBridge` interface introduced by ADR-002 is replaced by narrow ports declared in `src/domain/ports/`:

| Port | Surface |
|---|---|
| `SettingsPort` | `getSettings`, `saveSettings` |
| `VaultPort` | `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder` |
| `WorkspacePort` | `openFile` |
| `NotificationPort` | `showError`, `showWarning`, `showSuccess`, `showInfo` (severity-typed; `showError` defaults to a sticky notice — `durationMs = 0`). See `docs/superpowers/specs/2026-05-04-error-logging-notification-design.md`. |
| `LoggerPort` | `debug`, `info`, `warn`, `error` (added 2026-05-04). Console-only; never calls `NotificationPort`. |

Each runtime continues to be one class (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) that declares `implements` on every port interface. The class file lives in the same per-runtime directory as before. No state is duplicated across ports.

Dependency injection registers the same instance under distinct Vue `InjectionKey`s (`SETTINGS_PORT`, `VAULT_PORT`, `WORKSPACE_PORT`, `NOTIFICATION_PORT`, `LOGGER_PORT`) defined in `src/infrastructure/bridge/ports.ts`. Consumers inject one port at a time via dedicated composables (`useSettingsPort`, `useVaultPort`, `useWorkspacePort`, `useNotificationPort`, `useLoggerPort`). There is no aggregate `usePorts()` composable.

`PluginSettings` and `DEFAULT_SETTINGS` move to `src/domain/settings/PluginSettings.ts`.

## Rationale

- **Interface segregation at the consumer boundary.** A use case that needs to read a single file should not depend on a type that also exposes notifications and settings. Narrow ports make the dependency contract honest and trivially mockable.
- **Unblocks Epic #85.** W2 (module system), W3 (typed EventBus), W4 (PluginCore lifecycle) all assume a module declares its capability dependencies as a small set of port interfaces. A grouped `IBridge` makes that declaration meaningless.
- **Audit-driven scope.** Issue #99 listed 13 ports. A repository audit found only 4 capabilities with real consumers. Adding the other 9 now would create unused interface surface that cannot be validated by tests. Each remaining port will be added when the first consumer appears, with that consumer's call site exercising the new interface from the start.
- **One class per runtime, not one file per port × runtime.** Splitting three runtime classes into twelve adapter files (one per port × runtime) was considered and rejected: the runtime state (in-memory map for mock, localStorage namespace for the demo) is naturally cohesive per-runtime, and the segregation benefit lives at the consumer boundary, not the implementation. Splitting a runtime into per-port files would force a shared internal store and more boilerplate without testing benefit. When a runtime grows large enough to justify splitting (e.g., real I/O moves to a worker), the change is local and the class can delegate to per-port helpers without changing its public interface.

## Consequences

- `IBridge`, `BridgeKey`, and `useBridge` are deleted in the same PR that introduces the ports.
- ESLint forbids re-introducing the `IBridge`, `BridgeKey`, or `useBridge` symbols by name (`no-restricted-imports`). An AST-level rule that detects "any new interface composing two or more port types" is **not** part of this change — it requires a custom plugin and the cost is not justified before a violation is observed. The `index.ts` of `src/domain/ports/` carries an explanatory comment as the day-1 social-norm enforcement against aggregate composition.
- Vue components and use cases that previously depended on `IBridge` now declare narrow dependencies. Files using more than one capability call more than one composable.
- ADR-002 is superseded by this ADR. Its `status` is updated to `superseded` with a `superseded_by: ADR-008` field.
- Future ports (Logger, Command, ViewRegistry, Dialog, Platform, Storage, Scheduler, Translation, FileExtension) are introduced one at a time alongside their first consumer. They are not pre-declared.

## Notes for downstream work

- W2 (#100): module manifest declares port dependencies by symbol (`SETTINGS_PORT`, `VAULT_PORT`, ...). Module loader injects the requested ports into the module's bootstrap function.
- W3 (#101): EventBus is its own port (`EventBusPort`) introduced in W3, not here.
- W7 (#105): settings schema work touches `SettingsPort` shape; that PR may add migration methods to the port.
- W8 (#106): vue-i18n integration introduces `TranslationPort` if the module needs it.
