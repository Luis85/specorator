---
title: Unified Error Handling, Logging & Notification System
date: 2026-05-04
status: approved
github_issue: https://github.com/Luis85/specorator/issues/155
---

# Unified Error Handling, Logging & Notification System

## 1. Problem Statement

The current codebase has a working `Result<T,E>` type and a `NotificationPort`, but several critical gaps make error handling fragile and the user experience poor:

- `NotificationPort.showNotice()` is called in only 2 places (file-conflict guards in `FeatureRepository`). All other errors are silently stored as plain strings in Pinia and shown as inline text — no contextual toasts.
- No structured logging. One `console.info` in `MockBridge`, one `.catch(console.error)` at bootstrap — nothing else.
- `CreateFeatureForm.vue`, `SettingsView.vue`, and `useSettings.ts` (`loadSettings`) `throw` on operation failure with no catch handler, producing unhandled rejections in production.
- No Vue error boundary component. No `app.config.errorHandler`. No `window.onunhandledrejection`. No `router.onError`.
- Error messages surfaced to the user are raw `.message` strings with no user-friendly mapping or contextual information.
- `ObsidianBridge` discards returned `Notice` instances — unloading the plugin leaves orphaned DOM elements.

## 2. Goals

1. Every operation that fails must produce a structured log entry AND a user-visible notification at the appropriate severity.
2. Developers must have debug/info/warn/error log levels that can be tuned per runtime.
3. Unhandled Vue errors must never produce a blank screen — they must show a graceful fallback.
4. Use cases remain pure — zero notification and logging dependencies. `FeedbackService` is composable-layer only.
5. Adoption must be incremental — composables can be migrated one at a time.

## 3. Non-Goals

- Log persistence to vault files (future concern — the port interface allows adding a file-based impl later).
- Correlation IDs / distributed tracing (out of scope for a single-user local plugin).
- User-facing log viewer UI (future Phase 4 spec).
- `tslog` or any third-party logging library — `LoggerPort` impls wrap `console.*` directly.

## 4. Design

### 4.1 `NotificationPort` — Breaking Change

Drop `showNotice`. Replace with severity-typed methods.

**Location:** `src/domain/ports/NotificationPort.ts`

```typescript
export interface NotificationPort {
  showError(message: string, durationMs?: number): void
  showWarning(message: string, durationMs?: number): void
  showSuccess(message: string, durationMs?: number): void
  showInfo(message: string, durationMs?: number): void
}
```

**Rationale:** A generic `showNotice` forces every call site to encode severity in the message string, which is untyped and invisible to implementations. Severity-typed methods let each runtime implementation style and time-out notifications appropriately.

**UX-driven duration defaults per severity:**

| Method | Obsidian timeout | Standalone browser |
|---|---|---|
| `showError` | **0 (persistent — never auto-dismisses)** | Persistent dismissible alert |
| `showWarning` | 8000ms | Dismissible banner |
| `showSuccess` | 4000ms | Auto-dismissing toast |
| `showInfo` | 4000ms | Auto-dismissing toast |

Auto-dismissing errors are a named UX anti-pattern (Nielsen Norman Group, Carbon Design System): the toast disappears before the user can act, and the visual distance from the error source breaks the feedback loop.

**Notice handle leak — `ObsidianBridge` must track instances:** Obsidian's `Notice` creates a DOM element that persists until its timeout. If the plugin is unloaded while a `Notice` is visible, the element becomes orphaned. Fix: `ObsidianBridge` stores every returned `Notice` in a `Set<Notice>`. On plugin `onunload`, iterate the set and call `.hide()` on each. This requires `SpecoratorView.ts` to call `bridge.hideAllNotices()` in its `onClose`.

**Implementation notes:**
- `ObsidianBridge`: Map all four methods to `new Notice(message, durationMs ?? defaultForSeverity)`, prefixing the message with `[Error] `, `[Warning] `, `[✓] `, or `[Info] ` respectively. Store instance in the tracking `Set`. Return value is `void` (port contract). Separately track and clear on unload.
- `MockBridge`: Change `noticeLog` entries from `{ message, durationMs }` tuples to `{ severity: 'error' | 'warning' | 'success' | 'info'; message: string; durationMs: number }` tuples. Add `console.error/warn/info/log` calls accordingly.
- `LocalStorageBridge`: Dispatch `sp:notice` custom event with an additional `severity` field on the event detail.

**Migration of existing `showNotice` call sites:**

- `FeatureRepository` has 2 call sites (file-already-exists guards) → migrate to `NotificationPort.showInfo()`. The repository is infrastructure and continues to depend on `NotificationPort` alone (not `FeedbackService`). See §4.3.
- `src/plugin/main.ts` `detectLegacyVaultLayout()` calls `new Notice(...)` directly, bypassing `NotificationPort` entirely. Migrate to `notificationPort.showWarning(...)`. Currently `bridge` is a local variable inside `onload()` and `detectLegacyVaultLayout()` has no access to it — promote `bridge` to an instance field (`private bridge!: ObsidianBridge`) set at the top of `onload()` before any use. This also ensures `bridge.hideAllNotices()` can be called from `onunload()`. This call site is also not tracked in the notice handle `Set` — it will orphan-leak on unload without this migration.

### 4.2 `LoggerPort` — New 5th Narrow Port

**Naming note:** This spec adopts `LoggerPort` / `LOGGER_PORT` / `useLoggerPort` — the same name defined in `2026-05-04-plugin-core-design.md`. The two specs describe the same port. Implementations must not create a separate `LoggingPort` — there is one logging port interface.

**Location:** `src/domain/ports/LoggerPort.ts`

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LoggerPort {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: unknown, context?: Record<string, unknown>): void
}
```

`error?: unknown` (not `Error`) — catches non-Error throws from promise rejections and Obsidian internals. The `context` bag carries structured key-value pairs (e.g., `{ featureSlug, stage }`) without polluting the message string.

**InjectionKey:** `LOGGER_PORT: InjectionKey<LoggerPort>` already exists in `src/infrastructure/bridge/ports.ts`. No change needed.

**Composable:** `src/ui/composables/useLoggerPort.ts` already exists. No change needed.

**`src/domain/ports/index.ts`:** Already exports `LoggerPort` (added in W4). No change needed.

**`PluginSettings` extension** — additive, all existing fields preserved:

```typescript
// src/domain/settings/PluginSettings.ts
export interface PluginSettings {
  // ... all existing fields unchanged ...
  logLevel: LogLevel  // new field
}

export const DEFAULT_SETTINGS: PluginSettings = {
  // ... all existing defaults unchanged ...
  logLevel: 'warn',  // production default
}
```

**`ObsidianBridge` construction — live settings access:** `ObsidianBridge` currently receives a settings snapshot (`private settings: PluginSettings`). To support hot-changes to `logLevel` without plugin restart, replace the snapshot with a `getSettings: () => PluginSettings` getter. The full new constructor signature:

```typescript
constructor(
  private readonly app: App,
  private readonly getSettings: () => PluginSettings,
  private readonly onSaveSettings: (s: PluginSettings) => Promise<void>,
)
```

`SpecoratorView.ts` currently passes `this.plugin.settings` (snapshot) — change to `() => this.plugin.settings`. `src/plugin/main.ts` currently passes `this.settings` (snapshot) — change to `() => this.settings`. All logging calls read `this.getSettings().logLevel` at invocation time. `getSettings` also replaces all reads of `this.settings` in `SettingsPort` methods.

**Console prefix:** Every log line from `ObsidianBridge` is prefixed with `[Specorator]`. Multiple plugins share the Obsidian DevTools console — without a prefix, log output is indistinguishable from other plugins.

**`process.env.NODE_ENV` in the plugin Vite build:** `vite.config.ts` (plugin build target) must inject `define: { 'process.env.NODE_ENV': JSON.stringify('production') }`. Without this, libraries and conditional code branching on `process.env.NODE_ENV` behave unpredictably in the Obsidian renderer process, which does not set this variable.

**Error serialization:** When `err` is provided to `error()`, log both `err.message` and `err.stack`. `JSON.stringify(new Error(...))` produces `{}` — implementations must never rely on JSON serialization of `Error` objects. Call `console.error(message, err)` to preserve the full stack trace in DevTools.

**`LoggerPort` is strictly logging-only — no notification side effects:** No `LoggerPort` implementation may call `NotificationPort` or show an Obsidian `Notice`. Notifications are exclusively the responsibility of `NotificationPort` and `FeedbackService`. `plugin-core-design.md` describes `ObsidianBridge` additionally firing an Obsidian `Notice` for error-level log messages — that behaviour is superseded by this spec. Implementing it would cause double notification whenever `FeedbackService.reportResult` (or any caller) calls both `log.error()` and `notify.showError()` for the same event, violating the "log + notify exactly once" invariant.

**⚠️ Existing code to remove:** The current `ObsidianBridge.error()` implementation fires `new Notice(\`Specorator error: ${message}\`, 6000)`. Remove that line. It is exactly the superseded behaviour described above.

**Implementation notes:**
- `ObsidianBridge`: Constructor signature changes from receiving a settings snapshot to `getSettings: () => PluginSettings`. `SpecoratorView.ts` passes `() => this.settings`. Wraps `console.*` only — no `Notice` calls. Calls `getSettings().logLevel` at each invocation. Suppresses calls below the configured level. Prefixes all output with `[Specorator]`.
- `MockBridge`: Hardcodes `logLevel = 'debug'`. Appends to a **public** `logEntries: Array<{ level: LogLevel; message: string; error?: unknown; context?: Record<string, unknown> }>` field (or exposed via a public `getLogEntries()` helper following the same pattern as `getNotices()`). No contract test file — assertions live inline in MockBridge-specific tests.
- `LocalStorageBridge`: Hardcodes `logLevel = 'debug'`. Wraps `console.*`. Prefixes with `[Specorator]`. Must also implement `LoggerPort` so it satisfies the bridge type (required for `src/ui/main.ts` to provide `LOGGER_PORT`).

### 4.3 `FeedbackService` — Application-Layer Façade

**Use cases stay pure.** `CreateFeatureUseCase`, `ActivateFeatureUseCase`, and all other use cases must never receive `FeedbackService`. They depend only on `IFeatureRepository` and return `Result<T>`. `FeedbackService` is used exclusively at the composable layer (`useFeatures.ts`, `useSettings.ts`) — the outermost application-layer code that owns the decision to log and notify.

This preserves the double-logging invariant: log and notify exactly once, at the outermost caller, not in every layer of the call chain.

**`FeedbackService` is a side-effect emitter, not a control-flow wrapper.** Its core method passes `Result<T>` through unchanged — the caller retains the result to inspect it after feedback is emitted.

**Location:** `src/application/shared/FeedbackService.ts` — the class is defined in the application layer, which `src/ui/` composables may import per the DDD import direction (`domain ← application ← infrastructure ← ui`). "Composable-layer only" means `FeedbackService` is never injected into use cases — not that it must physically live in `src/ui/`.

```typescript
export class FeedbackService {
  constructor(
    private readonly log: LoggerPort,
    private readonly notify: NotificationPort,
  ) {}

  /** Emit log + notification for a Result. Passes the Result through unchanged. */
  reportResult<T>(
    result: Result<T>,
    context: {
      operation: string
      successMessage?: string
      errorLabel: string
      logContext?: Record<string, unknown>
    },
  ): Result<T> {
    if (result.ok) {
      this.log.info(context.operation, { ...context.logContext, success: true })
      if (context.successMessage) this.notify.showSuccess(context.successMessage)
    } else {
      this.log.error(context.operation, result.error, context.logContext)
      this.notify.showError(`${context.errorLabel}: ${toUserMessage(result.error)}`)
    }
    return result
  }

  /** Emit a warn-level log AND a dismissible user-visible warning banner. */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log.warn(message, context)
    this.notify.showWarning(message)
  }

  /** Log-only. No notification. Use for non-noisy internal signals (degraded-but-recoverable states). */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log.debug(message, context)
  }
}
```

**Key invariants:**
- `reportResult` always returns the original `Result` — the caller decides what to do after notification.
- `debug()` never notifies — debug is a developer-only signal.
- `FeedbackService` never injects `SettingsPort` — level filtering is the `LoggerPort` implementation's responsibility.

**Wiring:** `useFeatures.ts` and `useSettings.ts` construct `FeedbackService` from the two injected ports:

```typescript
const log = useLoggerPort()
const notify = useNotificationPort()
const feedback = new FeedbackService(log, notify)
```

**Infrastructure note:** `FeatureRepository` (infrastructure) uses `NotificationPort` directly for its existing `showInfo` calls. It does not use `FeedbackService`.

### 4.4 User-Friendly Error Message Mapping

**Location:** `src/application/shared/errorMessages.ts`

```typescript
export function toUserMessage(err: Error): string {
  const known: Record<string, string> = {
    'Title cannot be empty': 'Please enter a feature title.',
  }
  return known[err.message] ?? err.message
}
```

`toUserMessage` is called inside `FeedbackService.reportResult` (see §4.3), so composable callers do not need to call it explicitly. The registry grows incrementally as more error paths are migrated. Domain logic remains free of presentation concerns.

### 4.5 Vue Error Boundary & Global Handlers

**Four error capture hooks — all four required:**

| Hook | Where | What it catches |
|---|---|---|
| `onErrorCaptured` (in `ErrorBoundary.vue`) | Root component | Sync/async errors in child `setup()`, lifecycle hooks, template handlers, watchers |
| `app.config.errorHandler` | Both entry points | Everything that bubbles past `onErrorCaptured`; terminal Vue error handler |
| `window.addEventListener('unhandledrejection')` | Both entry points | Unhandled Promise rejections outside Vue's lifecycle — **must log + notify** (bypasses all Vue error handlers) |
| `router.onError(handler)` | Both entry points (`src/ui/main.ts`, `src/plugin/SpecoratorView.ts`) | Navigation guard rejections — **must log + notify** (app may stay on previous route, ErrorBoundary never renders) |

**`onErrorCaptured` vs `app.config.errorHandler` ordering:** `onErrorCaptured` in child components fires first. If the handler explicitly returns `false`, the error stops propagating and `app.config.errorHandler` is NOT called. If it returns `undefined` (implicit — the most common accidental bug), the error continues bubbling to the global handler, causing duplicate log entries. Always return `false` explicitly when the boundary handles the error.

**`ErrorBoundary.vue` placement:** Wraps `<RouterView />` inside `App.vue`. Both runtimes (Obsidian plugin mounts `App.vue` via `SpecoratorView.ts`; standalone browser mounts it via `src/ui/main.ts`) share the same `App.vue`, so a single change covers both.

**Port provision prerequisite:** `ErrorBoundary.vue` calls `useLoggerPort()` and `useNotificationPort()` inside `<script setup>`. Both `LOGGER_PORT` and `NOTIFICATION_PORT` must be provided before `App.vue` mounts. `src/ui/main.ts` must call `app.provide(LOGGER_PORT, bridge)` and `app.provide(NOTIFICATION_PORT, bridge)` before `app.mount(...)`. Missing either provision causes `useLoggerPort()` to throw inside the very boundary meant to catch errors — an unrecoverable blank screen.

**`ErrorBoundary.vue`** — `src/ui/components/ErrorBoundary.vue`:

The boundary injects both ports and emits log + notification before returning `false` to stop propagation. Returning `false` prevents the error reaching `app.config.errorHandler` — so the boundary itself must fulfil the log-and-notify contract before swallowing.

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useNotificationPort } from '@/ui/composables/useNotificationPort'

const isDev = import.meta.env.DEV
const error = ref<Error | null>(null)
const log = useLoggerPort()
const notify = useNotificationPort()

onErrorCaptured((err) => {
  const asError = err instanceof Error ? err : new Error(String(err))
  error.value = asError
  log.error('[ErrorBoundary] Unhandled component error', err)
  notify.showError('Something went wrong. Please reload the view.')
  return false  // stops propagation — log + notify already emitted above
})
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary" data-testid="error-boundary-fallback">
    <p>Something went wrong. Please reload the view.</p>
    <!-- error.message shown only in dev builds — avoid leaking internals to end users -->
    <pre v-if="isDev">{{ error.message }}</pre>
  </div>
</template>
```

**Global handlers** — wired in both entry points (`src/ui/main.ts` and `src/plugin/SpecoratorView.ts`):

```typescript
// app.config.errorHandler — terminal Vue error handler (fires after onErrorCaptured chain)
app.config.errorHandler = (err, _instance, info) => {
  loggingPort.error(`[Vue] Unhandled error in ${info}`, err as Error)
  notificationPort.showError('An unexpected error occurred. Check the console for details.')
}

// Unhandled Promise rejections outside Vue lifecycle.
// Store reference so SpecoratorView can remove it on onClose (Obsidian view open/close
// cycles re-run this code; without removal, handlers accumulate and fire multiple times).
const onUnhandledRejection = (event: PromiseRejectionEvent) => {
  loggingPort.error('[Unhandled rejection]', event.reason)
  // Must notify — these rejections bypass Vue's error chain entirely (no onErrorCaptured,
  // no app.config.errorHandler), so the user would otherwise see nothing.
  notificationPort.showError('An unexpected error occurred. Check the console for details.')
}
window.addEventListener('unhandledrejection', onUnhandledRejection)
// In SpecoratorView.onClose: window.removeEventListener('unhandledrejection', onUnhandledRejection)
// In src/ui/main.ts (standalone browser): no teardown needed — page lifetime = app lifetime.
```

**`router.onError`** — wired in **both entry points** (`src/ui/main.ts` and `src/plugin/SpecoratorView.ts`), alongside `app.config.errorHandler`, where `loggingPort` and `notificationPort` are already in scope:

```typescript
router.onError((err) => {
  loggingPort.error('[Router] Navigation error', err)
  // Must notify — navigation failures can leave the app on the previous route
  // without rendering ErrorBoundary, so the user sees no visual feedback otherwise.
  notificationPort.showError('Navigation failed. Please try again.')
})
```

Do NOT wire `router.onError` in `src/ui/router/index.ts` — the router module is created at import time before any ports exist, and Vue's provide/inject is unavailable outside component context.

**Fix component-level throws (three sites):**
1. `CreateFeatureForm.vue` — `throw result.error` → replace with `feedback.reportResult(result, { ... })`; check `result.ok` to guard post-success logic
2. `SettingsView.vue` — same pattern
3. `useSettings.ts` `loadSettings()` — `throw result.error` → same pattern

## 5. Data Flow

```
Use case execute()
  → Result<T, E>           (pure — no logging, no notification)
    ↓
  UI composable
    → feedback.reportResult(result, { operation, errorLabel, successMessage })
        ok: true  → log.info(operation)  + notify.showSuccess(successMessage?)
        ok: false → log.error(operation, err)  + notify.showError(errorLabel + toUserMessage(err))
    → if (!result.ok) return   // composable handles control flow after feedback
    → store.upsert(dto)        // success path continues

Infrastructure (FeatureRepository) file-conflict guard:
  → notificationPort.showInfo(msg)    // direct port call — infrastructure does not use FeedbackService
```

## 6. File Map

| Action | File |
|---|---|
| **Already exists** — no change needed | `src/domain/ports/LoggerPort.ts` |
| Modified port interface — replace `showNotice` with severity methods | `src/domain/ports/NotificationPort.ts` |
| Modified — additive `logLevel` field | `src/domain/settings/PluginSettings.ts` |
| Modified — add `export type { LoggerPort }` if not already present | `src/domain/ports/index.ts` |
| **Already exists** — no change needed | `src/infrastructure/bridge/ports.ts` (LOGGER_PORT) |
| **Already exists** — no change needed | `src/domain/ports/index.ts` (LoggerPort re-export added in W4) |
| **Already exists** — no change needed | `src/ui/composables/useLoggerPort.ts` |
| Updated — new severity methods; Notice handle tracking (`Set<Notice>` + `hideAllNotices()`); constructor snapshot → getter; remove `new Notice(...)` from `error()` | `src/infrastructure/obsidian/ObsidianBridge.ts` |
| Updated — new severity methods + `severity` in `noticeLog`; add public `logEntries` field; implement `LoggerPort` | `src/infrastructure/mock/MockBridge.ts` |
| Updated — new severity methods + `severity` in `sp:notice` event detail; implement `LoggerPort` | `src/infrastructure/localstorage/LocalStorageBridge.ts` |
| New service | `src/application/shared/FeedbackService.ts` |
| New helper | `src/application/shared/errorMessages.ts` |
| New component | `src/ui/components/ErrorBoundary.vue` |
| Modified — wrap RouterView with ErrorBoundary; update `sp:notice` event consumer to destructure `severity` from event detail (note: severity-differentiated toast styling in `notificationStore`/`AppToast.vue` is **out of scope** — deferred to standalone UX spec) | `src/ui/App.vue` |
| Modified — add: `app.config.errorHandler`, `router.onError`, `unhandledrejection` handler (named ref, no teardown needed — page lifetime); `LOGGER_PORT` and `NOTIFICATION_PORT` already provided | `src/ui/main.ts` |
| Modified — app.config.errorHandler + router.onError + unhandledrejection (named ref, removed in onClose) + provide LOGGER_PORT + getSettings getter + hideAllNotices on close | `src/plugin/SpecoratorView.ts` |
| Modified — migrate `detectLegacyVaultLayout()` raw `new Notice(...)` to `notificationPort.showWarning()` | `src/plugin/main.ts` |
| Modified — fix throw site, migrate to feedback.reportResult | `src/ui/composables/useSettings.ts` |
| Modified — fix throw site, migrate to feedback.reportResult | `src/ui/components/feature/CreateFeatureForm.vue` |
| Modified — fix throw site, migrate to feedback.reportResult | `src/ui/views/SettingsView.vue` |
| Modified — add `define: { 'process.env.NODE_ENV': JSON.stringify('production') }` | `vite.config.ts` (plugin build target) |

## 7. Testing

**`FeedbackService` — `reportResult`:**
- When `result.ok = true` and `successMessage` provided: verify `log.info()` called, `notify.showSuccess()` called.
- When `result.ok = true` and no `successMessage`: verify no `notify.*` called.
- When `result.ok = false`: verify `log.error()` called with the original `Error`, `notify.showError()` called.
- Verify `reportResult` returns the original `Result` object unchanged (same reference).

**`FeedbackService` — `warn()`:**
- Verify `log.warn()` called.
- Verify `notify.showWarning()` called.

**`FeedbackService` — `debug()`:**
- Verify `log.debug()` called.
- Verify no `notify.*` method is called.

**`MockBridge` log assertions:**
```typescript
expect(bridge.logEntries).toContainEqual({ level: 'error', message: 'Feature not found' })
```

**`MockBridge` notice assertions:** `noticeLog` entries carry `{ severity, message, durationMs }`. Existing tests asserting on `.message` still pass. New tests assert `.severity`.

**`NotificationPortContract.test.ts` migration:** Update to test `showError/showWarning/showSuccess/showInfo` instead of `showNotice`. Each method is called; assertions:
- `MockBridge`: `noticeLog` entry has correct `severity`
- `LocalStorageBridge`: `sp:notice` event `detail.severity` matches

**`ErrorBoundary.vue`:**
- Mount with a child that throws in `onMounted` (provide fake `LoggerPort` and `NotificationPort`).
- Assert `data-testid="error-boundary-fallback"` present.
- Assert slot content not rendered.
- Assert fake `LoggerPort.error()` called with the thrown error.
- Assert fake `NotificationPort.showError()` called.

**`errorMessages.ts`:**
- Unit tests for all known mappings.
- Unit test: unmapped error returns `err.message` unchanged.
- Convention: every new domain `Error` message added to the codebase requires a paired `toUserMessage` entry (or an explicit decision that the raw message is acceptable). Tests for `errorMessages.ts` serve as the registry's completeness gate.

**Throw-site migration tests:** For each of the three throw sites, verify that when `execute()` returns `{ ok: false }`, no exception is thrown from the component/composable and `FeedbackService.reportResult` is called (via a fake `FeedbackService`).

**`ObsidianBridge` Notice handle tracking:** Integration-style unit test — call `showError`, verify instance tracked. Call `hideAllNotices()`, verify `.hide()` called on tracked instance(s).

## 8. Deferred Decisions

1. **Obsidian notice severity styling:** Obsidian's `Notice` class has limited styling API. Text-prefix approach (`[Error] ...`) is the initial implementation. CSS-based severity styling can be added if the plugin gains custom notice styles in a later phase.

2. **`logLevel` in settings UI:** Whether to expose `logLevel` in the plugin settings tab does not block any structural work. Default `'warn'` is appropriate for end users. Can be decided during or after implementation.

3. **Notification aggregation for `findAll` parse failures:** `FeatureRepository.findAll()` silently discards malformed feature files. With structured logging, each failure is logged at `warn` level, but `showWarning` should be called at most once per `findAll()` call with an aggregate count ("N features could not be loaded — check the console"). The aggregation strategy is deferred to the `findAll` migration step, not part of this spec's scope.
