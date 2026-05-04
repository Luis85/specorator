# Error Handling, Logging & Notification System — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `NotificationPort` to severity-typed methods, add `logLevel` filtering, introduce `FeedbackService`, add Vue `ErrorBoundary` + global hooks, and address Obsidian-specific pitfalls (Notice leak, `process.env.NODE_ENV`).

**Architecture:** Breaking `NotificationPort` change propagates atomically across all three bridges before call sites are migrated. `FeedbackService` is a plain class in `src/application/shared/` instantiated at the composable layer. `ErrorBoundary` wraps `<RouterView />` in `App.vue` and injects both ports directly.

**Tech Stack:** TypeScript, Vue 3 (`<script setup>`), Vitest, Obsidian plugin API, Vite

**Spec:** `docs/superpowers/specs/2026-05-04-error-logging-notification-design.md`

---

## Chunk 1: Foundation — PluginSettings, NotificationPort, all bridge implementations

This chunk performs the breaking `NotificationPort` interface change and updates all three implementations atomically. The codebase will not typecheck between tasks 2 and 7 — complete all tasks in this chunk before running `npm run verify`.

### Task 1: Add `logLevel` to `PluginSettings`

**Files:**
- Modify: `src/domain/settings/PluginSettings.ts`

- [ ] **Step 1.1: Add `logLevel` field to the interface and default**

```typescript
// src/domain/settings/PluginSettings.ts
export interface PluginSettings {
  readonly locale: string
  readonly specsFolder: string
  readonly archiveFolder: string
  readonly decisionsFolder: string
  readonly constitutionFile: string
  readonly gateStrictness: 'strict' | 'lenient'
  readonly teamMode: boolean
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error'   // ← new
}

export const DEFAULT_SETTINGS: PluginSettings = {
  locale: 'en',
  specsFolder: 'specs',
  archiveFolder: 'archive',
  decisionsFolder: 'decisions',
  constitutionFile: 'CONSTITUTION.md',
  gateStrictness: 'strict',
  teamMode: false,
  logLevel: 'warn',   // ← new
}
```

- [ ] **Step 1.2: Typecheck**

```sh
npm run typecheck
```

Expected: passes (additive change, all call sites spread `DEFAULT_SETTINGS` so no missing-field errors).

- [ ] **Step 1.3: Commit**

```sh
git add src/domain/settings/PluginSettings.ts
git commit -m "feat(settings): add logLevel field (default: warn)"
```

---

### Task 2: Update `NotificationPortContract` tests (write failing tests first)

**Files:**
- Modify: `tests/infrastructure/bridge/NotificationPortContract.test.ts`

The current contract tests `showNotice`. Rewrite to test the four severity methods. After this step the test file will fail to compile until the bridges are updated.

- [ ] **Step 2.1: Rewrite the contract test**

```typescript
// tests/infrastructure/bridge/NotificationPortContract.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { NotificationPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

type Severity = 'error' | 'warning' | 'success' | 'info'

interface NoticeEntry {
  severity: Severity
  message: string
  durationMs: number
}

interface Scenario {
  readonly port: NotificationPort
  readonly readNotices: () => NoticeEntry[]
}

interface Harness {
  readonly name: string
  readonly makeScenario: () => Scenario
}

function registerNotificationContract(harness: Harness): void {
  describe(`${harness.name} NotificationPort contract`, () => {
    let scenario: Scenario

    beforeEach(() => {
      scenario = harness.makeScenario()
    })

    it('showError records severity=error with timeout 0', () => {
      scenario.port.showError('oops')
      expect(scenario.readNotices()).toEqual([{ severity: 'error', message: 'oops', durationMs: 0 }])
    })

    it('showWarning records severity=warning with 8000ms', () => {
      scenario.port.showWarning('heads up')
      expect(scenario.readNotices()).toEqual([{ severity: 'warning', message: 'heads up', durationMs: 8000 }])
    })

    it('showSuccess records severity=success with 4000ms', () => {
      scenario.port.showSuccess('done')
      expect(scenario.readNotices()).toEqual([{ severity: 'success', message: 'done', durationMs: 4000 }])
    })

    it('showInfo records severity=info with 4000ms', () => {
      scenario.port.showInfo('fyi')
      expect(scenario.readNotices()).toEqual([{ severity: 'info', message: 'fyi', durationMs: 4000 }])
    })
  })
}

registerNotificationContract({
  name: 'MockBridge',
  makeScenario: () => {
    const bridge = new MockBridge()
    return { port: bridge, readNotices: () => bridge.getNotices() }
  },
})

registerNotificationContract({
  name: 'LocalStorageBridge',
  makeScenario: () => {
    localStorage.clear()
    const notices: NoticeEntry[] = []
    const abort = new AbortController()
    window.addEventListener(
      'sp:notice',
      (event) => {
        notices.push((event as CustomEvent<NoticeEntry>).detail)
      },
      { signal: abort.signal },
    )
    return {
      port: new LocalStorageBridge(),
      readNotices: () => {
        abort.abort()
        return notices
      },
    }
  },
})
```

- [ ] **Step 2.2: Commit the failing test (known-broken until bridges updated)**

```sh
git add tests/infrastructure/bridge/NotificationPortContract.test.ts
git commit -m "test(notification): rewrite contract for severity-typed API (failing — bridges not yet updated)"
```

---

### Task 3: Update `NotificationPort` interface

**Files:**
- Modify: `src/domain/ports/NotificationPort.ts`

- [ ] **Step 3.1: Replace `showNotice` with four severity methods**

```typescript
// src/domain/ports/NotificationPort.ts
export interface NotificationPort {
  showError(message: string, durationMs?: number): void
  showWarning(message: string, durationMs?: number): void
  showSuccess(message: string, durationMs?: number): void
  showInfo(message: string, durationMs?: number): void
}
```

Do not commit yet — typecheck will fail until all bridge implementations are updated.

---

### Task 4: Update `MockBridge`

**Files:**
- Modify: `src/infrastructure/mock/MockBridge.ts`

- [ ] **Step 4.1: Replace `showNotice`, update `noticeLog` shape, add public `logEntries`**

Replace the `NotificationPort` section and `noticeLog` field:

```typescript
// Replace in MockBridge.ts:

// (1) Change the noticeLog field type (line ~20):
private readonly noticeLog: { severity: 'error' | 'warning' | 'success' | 'info'; message: string; durationMs: number }[] = []

// (2) Add logEntries field (after noticeLog):
readonly logEntries: Array<{ level: 'debug' | 'info' | 'warn' | 'error'; message: string; error?: unknown; context?: Record<string, unknown> }> = []

// (3) Replace showNotice method with four methods:
showError(message: string, durationMs = 0): void {
  this.noticeLog.push({ severity: 'error', message, durationMs })
  console.error(`[MockBridge Notice:error] ${message}`)
}

showWarning(message: string, durationMs = 8000): void {
  this.noticeLog.push({ severity: 'warning', message, durationMs })
  console.warn(`[MockBridge Notice:warning] ${message}`)
}

showSuccess(message: string, durationMs = 4000): void {
  this.noticeLog.push({ severity: 'success', message, durationMs })
  console.info(`[MockBridge Notice:success] ${message}`)
}

showInfo(message: string, durationMs = 4000): void {
  this.noticeLog.push({ severity: 'info', message, durationMs })
  console.info(`[MockBridge Notice:info] ${message}`)
}
```

- [ ] **Step 4.2: Update `getNotices()` return type**

```typescript
getNotices(): { severity: 'error' | 'warning' | 'success' | 'info'; message: string; durationMs: number }[] {
  return [...this.noticeLog]
}
```

- [ ] **Step 4.3: Update `LoggerPort` methods to append to `logEntries`**

```typescript
debug(message: string, context?: Record<string, unknown>): void {
  this.logEntries.push({ level: 'debug', message, context })
  console.debug(`[MockBridge] ${message}`, context)
}

info(message: string, context?: Record<string, unknown>): void {
  this.logEntries.push({ level: 'info', message, context })
  console.info(`[MockBridge] ${message}`, context)
}

warn(message: string, context?: Record<string, unknown>): void {
  this.logEntries.push({ level: 'warn', message, context })
  console.warn(`[MockBridge] ${message}`, context)
}

error(message: string, error?: unknown, context?: Record<string, unknown>): void {
  this.logEntries.push({ level: 'error', message, error, context })
  console.error(`[MockBridge] ${message}`, error, context)
}
```

---

### Task 5: Update `LocalStorageBridge`

**Files:**
- Modify: `src/infrastructure/localstorage/LocalStorageBridge.ts`

- [ ] **Step 5.1: Replace `showNotice` with four severity methods + add `severity` to `sp:notice` event**

```typescript
// Replace showNotice with:
showError(message: string, durationMs = 0): void {
  window.dispatchEvent(new CustomEvent('sp:notice', { detail: { severity: 'error', message, durationMs } }))
}

showWarning(message: string, durationMs = 8000): void {
  window.dispatchEvent(new CustomEvent('sp:notice', { detail: { severity: 'warning', message, durationMs } }))
}

showSuccess(message: string, durationMs = 4000): void {
  window.dispatchEvent(new CustomEvent('sp:notice', { detail: { severity: 'success', message, durationMs } }))
}

showInfo(message: string, durationMs = 4000): void {
  window.dispatchEvent(new CustomEvent('sp:notice', { detail: { severity: 'info', message, durationMs } }))
}
```

---

### Task 6: Update `ObsidianBridge` — constructor, NotificationPort, LoggerPort filtering

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianBridge.ts`

This task makes the most changes to a single file. Work top-to-bottom through the class.

- [ ] **Step 6.1: Update constructor + `SettingsPort` methods (do both atomically — partial edits will not compile)**

Name the getter field `_getSettings` (underscore prefix) to avoid collision with the `getSettings()` port method:

```typescript
// Replace the constructor:
constructor(
  private readonly app: App,
  private readonly _getSettings: () => PluginSettings,
  private readonly onSaveSettings: (settings: PluginSettings) => Promise<void>,
) {}

// Replace getSettings() and saveSettings():
async getSettings(): Promise<PluginSettings> {
  return { ...this._getSettings() }
}

async saveSettings(settings: PluginSettings): Promise<void> {
  await this.onSaveSettings(settings)
}
```

After making these changes, search the file for any remaining `this.settings` reads and replace with `this._getSettings()`. The `saveSettings` method no longer needs to update a local field — the getter reads the live value from the caller.

- [ ] **Step 6.3: Add Notice tracking fields and methods**

```typescript
private readonly _activeNotices: Set<Notice> = new Set()

private _track(notice: Notice): void {
  this._activeNotices.add(notice)
  // Remove from tracking set when the notice auto-dismisses (animationend fires on timeout)
  notice.noticeEl.addEventListener('animationend', () => {
    this._activeNotices.delete(notice)
  }, { once: true })
}

hideAllNotices(): void {
  for (const n of this._activeNotices) n.hide()
  this._activeNotices.clear()
}
```

- [ ] **Step 6.4: Replace `showNotice` with four severity methods**

```typescript
showError(message: string, durationMs = 0): void {
  this._track(new Notice(`[Error] ${message}`, durationMs))
}

showWarning(message: string, durationMs = 8000): void {
  this._track(new Notice(`[Warning] ${message}`, durationMs))
}

showSuccess(message: string, durationMs = 4000): void {
  this._track(new Notice(`[✓] ${message}`, durationMs))
}

showInfo(message: string, durationMs = 4000): void {
  this._track(new Notice(`[Info] ${message}`, durationMs))
}
```

- [ ] **Step 6.5: Add level-filtering to `LoggerPort` methods + remove `new Notice` from `error()`**

The existing `error()` calls `new Notice(...)` — remove it. Add level filtering to all four methods:

```typescript
private static readonly _LEVEL_RANK: Record<string, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

private _shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
  const configured = this._getSettings().logLevel
  return (ObsidianBridge._LEVEL_RANK[level] ?? 0) >= (ObsidianBridge._LEVEL_RANK[configured] ?? 0)
}

// eslint-disable obsidianmd/rule-custom-message
debug(message: string, context?: Record<string, unknown>): void {
  if (!this._shouldLog('debug')) return
  console.debug(`[Specorator] ${message}`, context)
}

info(message: string, context?: Record<string, unknown>): void {
  if (!this._shouldLog('info')) return
  console.info(`[Specorator] ${message}`, context)
}

warn(message: string, context?: Record<string, unknown>): void {
  if (!this._shouldLog('warn')) return
  console.warn(`[Specorator] ${message}`, context)
}

error(message: string, error?: unknown, context?: Record<string, unknown>): void {
  if (!this._shouldLog('error')) return
  console.error(`[Specorator] ${message}`, error, context)
  // NOTE: Do NOT call new Notice here. LoggerPort is logging-only.
  // User-visible notification for errors goes through NotificationPort.showError().
}
// eslint-enable obsidianmd/rule-custom-message
```

---

### Task 7: Typecheck + run tests for Chunk 1

- [ ] **Step 7.1: Typecheck**

```sh
npm run typecheck
```

Expected: may still report errors in `FeatureRepository.ts`, `SpecoratorView.ts`, and `main.ts` (remaining `showNotice` call sites). Those are fixed in Chunk 2. If errors appear anywhere else, fix them before proceeding.

- [ ] **Step 7.2: Run the notification contract tests**

```sh
npx vitest run tests/infrastructure/bridge/NotificationPortContract.test.ts
```

Expected: 8 passing tests (4 per bridge).

- [ ] **Step 7.3: Commit Chunk 1**

```sh
git add \
  src/domain/ports/NotificationPort.ts \
  src/infrastructure/mock/MockBridge.ts \
  src/infrastructure/localstorage/LocalStorageBridge.ts \
  src/infrastructure/obsidian/ObsidianBridge.ts
git commit -m "feat(notification): severity-typed NotificationPort + ObsidianBridge logLevel filtering

Breaking change: replaces showNotice with showError/showWarning/showSuccess/showInfo.
ObsidianBridge constructor now takes getSettings getter for live logLevel reads.
LoggerPort.error() is console-only — no Notice side effect.
MockBridge.logEntries is public for test assertions."
```

---

## Chunk 2: Call site migrations + application layer

### Task 8: Migrate `FeatureRepository` `showNotice` call sites

**Files:**
- Modify: `src/infrastructure/bridge/FeatureRepository.ts:122,150`

- [ ] **Step 8.1: Update the two call sites**

Line ~122 (idea.md already exists): `this.notifications.showNotice(...)` → `this.notifications.showInfo(...)`
Line ~150 (stage file already exists): `this.notifications.showNotice(...)` → `this.notifications.showWarning(...)`

Full replacements:

```typescript
// Line ~122
this.notifications.showInfo(`Specorator: idea.md already exists — keeping your version.`)

// Line ~150
this.notifications.showInfo(
  `Specorator: ${meta.slug}.md already exists — keeping your version.`,
)
```

Both are informational guards — no action is required from the user, so `showInfo` is correct for both (matches spec §4.1).

- [ ] **Step 8.2: Update the FeatureRepository tests to assert severity**

In `tests/infrastructure/bridge/FeatureRepository.test.ts`, find any assertions on `bridge.getNotices()` and add `.severity` checks:

```typescript
// Both call sites now emit severity: 'info'
expect(bridge.getNotices()).toContainEqual(
  expect.objectContaining({ severity: 'info', message: expect.stringContaining('idea.md') })
)
expect(bridge.getNotices()).toContainEqual(
  expect.objectContaining({ severity: 'info', message: expect.stringContaining('already exists') })
)
```

- [ ] **Step 8.3: Run FeatureRepository tests**

```sh
npx vitest run tests/infrastructure/bridge/FeatureRepository.test.ts
```

Expected: all passing.

- [ ] **Step 8.4: Commit**

```sh
git add src/infrastructure/bridge/FeatureRepository.ts tests/infrastructure/bridge/FeatureRepository.test.ts
git commit -m "feat(repo): migrate showNotice call sites to showInfo/showWarning"
```

---

### Task 9: Update `main.ts` — bridge instance field + `detectLegacyVaultLayout` migration

**Files:**
- Modify: `src/plugin/main.ts`

Currently `bridge` is a local variable in `onload()`. `detectLegacyVaultLayout()` has no access to it. Promote `bridge` to an instance field.

- [ ] **Step 9.1: Declare `bridge` as an instance field**

Add to the class body (alongside `settings` and `core`):

```typescript
private bridge: ObsidianBridge | null = null
```

- [ ] **Step 9.2: Assign the instance field in `onload()` and change constructor call**

```typescript
async onload(): Promise<void> {
  await this.loadSettings()

  this.bridge = new ObsidianBridge(
    this.app,
    () => this.settings,                   // ← getter, not snapshot
    (s) => this.updateSettings(s),
  )

  this.core = new PluginCore(ALL_MODULES, {
    settings: this.bridge,
    vault: this.bridge,
    workspace: this.bridge,
    notifications: this.bridge,
    logger: this.bridge,
  })
  await this.core.init(this.settings as unknown as Record<string, unknown>)

  this.registerView(VIEW_TYPE, (leaf) => new SpecoratorView(leaf, this))
  this.addRibbonIcon('layout-dashboard', 'Open Specorator', () => { void this.activateView() })
  this.addCommand({
    // eslint-disable-next-line obsidianmd/commands/no-plugin-id-in-command-id
    id: 'open-specorator',
    name: 'Open panel',
    callback: () => void this.activateView(),
  })
  this.addSettingTab(new SpecoratorSettingTab(this.app, this))
  this.detectLegacyVaultLayout()
}
```

- [ ] **Step 9.3: Update `onunload()` to call `hideAllNotices()`**

```typescript
override onunload(): void {
  this.app.workspace.detachLeavesOfType(VIEW_TYPE)
  this.bridge?.hideAllNotices()
  void this.core?.destroy()
}
```

- [ ] **Step 9.4: Update `detectLegacyVaultLayout()` to use `this.bridge`**

```typescript
private detectLegacyVaultLayout(): void {
  if (!this.bridge) return
  const hasFeaturesFolder = this.app.vault.getAbstractFileByPath('features') instanceof TFolder
  const hasSpecsFolder = this.app.vault.getAbstractFileByPath(this.settings.specsFolder) instanceof TFolder
  if (hasFeaturesFolder && !hasSpecsFolder) {
    this.bridge.showWarning(
      `This vault uses the old \`features/\` folder. ` +
        `Please rename it to \`${this.settings.specsFolder}/\` or update the Specs folder setting.`,
      8000,
    )
  }
}
```

Remove the `Notice` import from the top of the file since it is no longer used.

- [ ] **Step 9.5: Typecheck**

```sh
npm run typecheck
```

Expected: `main.ts` clean. May still have errors in `SpecoratorView.ts` (showNotice usage removed in next task).

- [ ] **Step 9.6: Commit**

```sh
git add src/plugin/main.ts
git commit -m "feat(plugin): promote bridge to instance field; migrate detectLegacyVaultLayout to showWarning"
```

---

### Task 10: Update `SpecoratorView.ts` — getter, `onClose` cleanup, global hooks

**Files:**
- Modify: `src/plugin/SpecoratorView.ts`

- [ ] **Step 10.1: Change bridge construction to use getter**

```typescript
// In onOpen(), replace:
const bridge = new ObsidianBridge(
  this.app,
  this.plugin.settings,
  (s) => this.plugin.updateSettings(s),
)

// With:
const bridge = new ObsidianBridge(
  this.app,
  () => this.plugin.settings,
  (s) => this.plugin.updateSettings(s),
)
```

- [ ] **Step 10.2: Store bridge as instance field for access in `onClose`**

Add to the class body:

```typescript
private bridge: ObsidianBridge | null = null
```

In `onOpen()`, assign: `this.bridge = new ObsidianBridge(...)`

- [ ] **Step 10.3: Wire global error hooks in `onOpen()`**

Add after `this.vueApp.mount(mountPoint)`:

```typescript
// app.config.errorHandler — terminal Vue error handler
this.vueApp.config.errorHandler = (err, _instance, info) => {
  bridge.error(`[Vue] Unhandled error in ${info}`, err)
  bridge.showError('An unexpected error occurred. Check the console for details.')
}

// Unhandled Promise rejections — store ref for removal in onClose
this._onUnhandledRejection = (event: PromiseRejectionEvent) => {
  if (!this.bridge) return  // guard: view already closed, removeEventListener may not have fired yet
  this.bridge.error('[Unhandled rejection]', event.reason)
  this.bridge.showError('An unexpected error occurred. Check the console for details.')
}
window.addEventListener('unhandledrejection', this._onUnhandledRejection)

// router.onError — navigation failures may leave app on previous route
router.onError((err) => {
  bridge.error('[Router] Navigation error', err)
  bridge.showError('Navigation failed. Please try again.')
})
```

Add the instance field:

```typescript
private _onUnhandledRejection: ((e: PromiseRejectionEvent) => void) | null = null
```

- [ ] **Step 10.4: Update `onClose()` to clean up**

```typescript
onClose(): Promise<void> {
  if (this._onUnhandledRejection) {
    window.removeEventListener('unhandledrejection', this._onUnhandledRejection)
    this._onUnhandledRejection = null
  }
  this.bridge?.hideAllNotices()
  this.vueApp?.unmount()
  this.vueApp = null
  this.bridge = null
  return Promise.resolve()
}
```

- [ ] **Step 10.5: Typecheck**

```sh
npm run typecheck
```

Expected: passes (all showNotice call sites removed, all bridges updated).

- [ ] **Step 10.6: Run full test suite**

```sh
npm test
```

Expected: all tests pass. If any test asserts on `showNotice` or `getNotices()` shape, update the assertion to use the new `severity` field.

- [ ] **Step 10.7: Commit**

```sh
git add src/plugin/SpecoratorView.ts
git commit -m "feat(view): getter for bridge settings; global Vue/rejection/router error hooks; onClose cleanup"
```

---

### Task 11: `errorMessages.ts` (TDD)

**Files:**
- Create: `src/application/shared/errorMessages.ts`
- Create: `tests/application/shared/errorMessages.test.ts`

- [ ] **Step 11.1: Write the failing test**

```typescript
// tests/application/shared/errorMessages.test.ts
import { describe, expect, it } from 'vitest'
import { toUserMessage } from '@/application/shared/errorMessages'

describe('toUserMessage', () => {
  it('maps a known domain error to a friendly message', () => {
    expect(toUserMessage(new Error('Title cannot be empty'))).toBe('Please enter a feature title.')
  })

  it('returns the raw message for unknown errors', () => {
    expect(toUserMessage(new Error('Some unknown domain error'))).toBe('Some unknown domain error')
  })
})
```

- [ ] **Step 11.2: Run test to verify it fails**

```sh
npx vitest run tests/application/shared/errorMessages.test.ts
```

Expected: FAIL — `toUserMessage` not found.

- [ ] **Step 11.3: Implement**

```typescript
// src/application/shared/errorMessages.ts
const KNOWN_MESSAGES: Record<string, string> = {
  'Title cannot be empty': 'Please enter a feature title.',
}

export function toUserMessage(err: Error): string {
  return KNOWN_MESSAGES[err.message] ?? err.message
}
```

- [ ] **Step 11.4: Run test to verify it passes**

```sh
npx vitest run tests/application/shared/errorMessages.test.ts
```

Expected: 2 passing.

- [ ] **Step 11.5: Commit**

```sh
git add src/application/shared/errorMessages.ts tests/application/shared/errorMessages.test.ts
git commit -m "feat(application): add toUserMessage error mapping helper"
```

---

### Task 12: `FeedbackService` (TDD)

**Files:**
- Create: `src/application/shared/FeedbackService.ts`
- Create: `tests/application/shared/FeedbackService.test.ts`

- [ ] **Step 12.1: Write the failing tests**

```typescript
// tests/application/shared/FeedbackService.test.ts
import { describe, expect, it, vi } from 'vitest'
import { FeedbackService } from '@/application/shared/FeedbackService'
import type { LoggerPort } from '@/domain/ports'
import type { NotificationPort } from '@/domain/ports'
import type { Result } from '@/domain/shared/Result'

function makeFakeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function makeFakeNotify(): NotificationPort {
  return {
    showError: vi.fn(),
    showWarning: vi.fn(),
    showSuccess: vi.fn(),
    showInfo: vi.fn(),
  }
}

function ok<T>(value: T): Result<T> { return { ok: true, value } }
function err(message: string): Result<never> { return { ok: false, error: new Error(message) } }

describe('FeedbackService.reportResult', () => {
  it('on ok result with successMessage: calls log.info and notify.showSuccess', () => {
    const log = makeFakeLogger()
    const notify = makeFakeNotify()
    const svc = new FeedbackService(log, notify)

    svc.reportResult(ok('value'), { operation: 'create', errorLabel: 'Create failed', successMessage: 'Created!' })

    expect(log.info).toHaveBeenCalledWith('create', { success: true })
    expect(notify.showSuccess).toHaveBeenCalledWith('Created!')
    expect(notify.showError).not.toHaveBeenCalled()
  })

  it('on ok result without successMessage: calls log.info but no notification', () => {
    const log = makeFakeLogger()
    const notify = makeFakeNotify()
    const svc = new FeedbackService(log, notify)

    svc.reportResult(ok('value'), { operation: 'load', errorLabel: 'Load failed' })

    expect(log.info).toHaveBeenCalledWith('load', { success: true })
    expect(notify.showSuccess).not.toHaveBeenCalled()
    expect(notify.showError).not.toHaveBeenCalled()
  })

  it('on err result: calls log.error and notify.showError with errorLabel + message', () => {
    const log = makeFakeLogger()
    const notify = makeFakeNotify()
    const svc = new FeedbackService(log, notify)
    const result = err('Title cannot be empty')

    svc.reportResult(result, { operation: 'create', errorLabel: 'Create failed' })

    expect(log.error).toHaveBeenCalledWith('create', result.error, undefined)
    expect(notify.showError).toHaveBeenCalledWith('Create failed: Please enter a feature title.')
  })

  it('returns the original Result unchanged on ok', () => {
    const svc = new FeedbackService(makeFakeLogger(), makeFakeNotify())
    const result = ok(42)
    expect(svc.reportResult(result, { operation: 'x', errorLabel: 'y' })).toBe(result)
  })

  it('returns the original Result unchanged on err', () => {
    const svc = new FeedbackService(makeFakeLogger(), makeFakeNotify())
    const result = err('boom')
    expect(svc.reportResult(result, { operation: 'x', errorLabel: 'y' })).toBe(result)
  })
})

describe('FeedbackService.warn', () => {
  it('calls log.warn and notify.showWarning', () => {
    const log = makeFakeLogger()
    const notify = makeFakeNotify()
    new FeedbackService(log, notify).warn('heads up', { ctx: 1 })
    expect(log.warn).toHaveBeenCalledWith('heads up', { ctx: 1 })
    expect(notify.showWarning).toHaveBeenCalledWith('heads up')
  })
})

describe('FeedbackService.debug', () => {
  it('calls log.debug and NO notification', () => {
    const log = makeFakeLogger()
    const notify = makeFakeNotify()
    new FeedbackService(log, notify).debug('internal', { key: 'val' })
    expect(log.debug).toHaveBeenCalledWith('internal', { key: 'val' })
    expect(notify.showError).not.toHaveBeenCalled()
    expect(notify.showWarning).not.toHaveBeenCalled()
    expect(notify.showSuccess).not.toHaveBeenCalled()
    expect(notify.showInfo).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 12.2: Run tests to verify they fail**

```sh
npx vitest run tests/application/shared/FeedbackService.test.ts
```

Expected: FAIL — `FeedbackService` not found.

- [ ] **Step 12.3: Implement `FeedbackService`**

```typescript
// src/application/shared/FeedbackService.ts
import type { LoggerPort, NotificationPort } from '@/domain/ports'
import type { Result } from '@/domain/shared/Result'
import { toUserMessage } from './errorMessages'

export class FeedbackService {
  constructor(
    private readonly log: LoggerPort,
    private readonly notify: NotificationPort,
  ) {}

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

  warn(message: string, context?: Record<string, unknown>): void {
    this.log.warn(message, context)
    this.notify.showWarning(message)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log.debug(message, context)
  }
}
```

- [ ] **Step 12.4: Run tests to verify they pass**

```sh
npx vitest run tests/application/shared/FeedbackService.test.ts
```

Expected: all passing.

- [ ] **Step 12.5: Run full test suite to catch regressions**

```sh
npm test
```

- [ ] **Step 12.6: Commit**

```sh
git add src/application/shared/FeedbackService.ts tests/application/shared/FeedbackService.test.ts
git commit -m "feat(application): add FeedbackService — side-effect emitter wrapping LoggerPort + NotificationPort"
```

---

## Chunk 3: Vue error handling + entry point wiring + Vite config

### Task 13: `ErrorBoundary.vue` (TDD)

**Files:**
- Create: `src/ui/components/ErrorBoundary.vue`
- Create: `tests/ui/components/ErrorBoundary.test.ts`
- Create: `tests/ui/components/ErrorBoundary.po.ts`

- [ ] **Step 13.1: Create the page object**

```typescript
// tests/ui/components/ErrorBoundary.po.ts
import { DOMWrapper } from '@vue/test-utils'

export class ErrorBoundaryPO {
  constructor(private readonly wrapper: { find: (sel: string) => DOMWrapper<Element> }) {}

  fallback(): DOMWrapper<Element> {
    return this.wrapper.find('[data-testid="error-boundary-fallback"]')
  }

  hasFallback(): boolean {
    return this.fallback().exists()
  }
}
```

- [ ] **Step 13.2: Write the failing tests**

```typescript
// tests/ui/components/ErrorBoundary.test.ts
import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import type { LoggerPort, NotificationPort } from '@/domain/ports'
import { ErrorBoundaryPO } from './ErrorBoundary.po'

function makeFakeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
function makeFakeNotify(): NotificationPort {
  return { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }
}

const ThrowingChild = defineComponent({
  setup() {
    throw new Error('child exploded')
  },
  render() { return h('div') },
})

const HappyChild = defineComponent({
  template: '<span data-testid="happy-child">ok</span>',
})

async function mountBoundary(child: ReturnType<typeof defineComponent>, logger = makeFakeLogger(), notify = makeFakeNotify()) {
  const wrapper = mount(ErrorBoundary, {
    slots: { default: child },
    global: {
      provide: {
        [LOGGER_PORT as symbol]: logger,
        [NOTIFICATION_PORT as symbol]: notify,
      },
    },
  })
  await flushPromises()
  return { wrapper, po: new ErrorBoundaryPO(wrapper), logger, notify }
}

describe('ErrorBoundary', () => {
  it('renders slot content when no error', async () => {
    const { po, wrapper } = await mountBoundary(HappyChild)
    expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(true)
    expect(po.hasFallback()).toBe(false)
  })

  it('renders fallback when child throws', async () => {
    const { po } = await mountBoundary(ThrowingChild)
    expect(po.hasFallback()).toBe(true)
  })

  it('calls logger.error when child throws', async () => {
    const { logger } = await mountBoundary(ThrowingChild)
    expect(logger.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Unhandled component error',
      expect.any(Error),
    )
  })

  it('calls notify.showError when child throws', async () => {
    const { notify } = await mountBoundary(ThrowingChild)
    expect(notify.showError).toHaveBeenCalledWith('Something went wrong. Please reload the view.')
  })

  it('hides slot when fallback is shown', async () => {
    const { wrapper } = await mountBoundary(ThrowingChild)
    expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 13.3: Run tests to verify they fail**

```sh
npx vitest run tests/ui/components/ErrorBoundary.test.ts
```

Expected: FAIL — `ErrorBoundary.vue` not found.

- [ ] **Step 13.4: Implement `ErrorBoundary.vue`**

```vue
<!-- src/ui/components/ErrorBoundary.vue -->
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
  return false  // stop propagation — log + notify already emitted above
})
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="sp-error-boundary" data-testid="error-boundary-fallback">
    <p>Something went wrong. Please reload the view.</p>
    <pre v-if="isDev">{{ error.message }}</pre>
  </div>
</template>
```

- [ ] **Step 13.5: Run tests to verify they pass**

```sh
npx vitest run tests/ui/components/ErrorBoundary.test.ts
```

Expected: all passing.

- [ ] **Step 13.6: Commit**

```sh
git add src/ui/components/ErrorBoundary.vue tests/ui/components/ErrorBoundary.test.ts tests/ui/components/ErrorBoundary.po.ts
git commit -m "feat(ui): add ErrorBoundary component — logs + notifies before swallowing component errors"
```

---

### Task 14: Update `App.vue` — wrap `RouterView` + `sp:notice` severity

**Files:**
- Modify: `src/ui/App.vue`

- [ ] **Step 14.1: Wrap `<RouterView />` with `<ErrorBoundary>`**

In `App.vue`, add the import and wrap `<RouterView />`:

```vue
<script setup lang="ts">
// Add to existing imports:
import ErrorBoundary from './components/ErrorBoundary.vue'
// ... existing imports unchanged ...
</script>

<template>
  ...
  <main class="sp-main">
    <ErrorBoundary>
      <RouterView />
    </ErrorBoundary>
  </main>
  ...
</template>
```

- [ ] **Step 14.2: Update `onNotice` to destructure `severity`**

The `sp:notice` event detail now carries `severity`. Update the handler to accept it (store-level severity handling is deferred; just destructure without breaking the call):

```typescript
function onNotice(e: Event) {
  const { severity, message, durationMs } = (e as CustomEvent<{
    severity: 'error' | 'warning' | 'success' | 'info'
    message: string
    durationMs: number
  }>).detail
  // severity is available for future use; addNotice currently does not consume it
  notificationStore.addNotice(message, durationMs)
}
```

- [ ] **Step 14.3: Typecheck**

```sh
npm run typecheck
```

Expected: passes.

- [ ] **Step 14.4: Commit**

```sh
git add src/ui/App.vue
git commit -m "feat(ui): wrap RouterView in ErrorBoundary; destructure severity from sp:notice event"
```

---

### Task 15: Wire global hooks in `src/ui/main.ts`

**Files:**
- Modify: `src/ui/main.ts`

- [ ] **Step 15.1: Add error hooks inside the existing `.then()` block**

The file already has this chain (do NOT replace it — add inside it):

```typescript
void bridge.getSettings()
  .then((settings) => bootstrapModules(...))
  .then(() => {
    app.provide(SETTINGS_PORT, bridge)
    // ... other provides ...
    app.mount(mountPoint ?? '#app')   // ← existing last line
  })
  .catch(console.error)
```

Add the three handlers BEFORE the `app.mount(...)` line:

```typescript
    app.config.errorHandler = (err, _instance, info) => {
      bridge.error(`[Vue] Unhandled error in ${info}`, err)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    }

    // Standalone: page lifetime = app lifetime, no teardown needed
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      bridge.error('[Unhandled rejection]', event.reason)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    })

    router.onError((err) => {
      bridge.error('[Router] Navigation error', err)
      bridge.showError('Navigation failed. Please try again.')
    })

    app.mount(mountPoint ?? '#app')  // keep — just moved to after the new handlers
```

`router` is already imported in the file — no new import needed.

- [ ] **Step 15.2: Typecheck**

```sh
npm run typecheck
```

- [ ] **Step 15.3: Commit**

```sh
git add src/ui/main.ts
git commit -m "feat(standalone): wire app.config.errorHandler, router.onError, unhandledrejection"
```

---

### Task 16: Fix throw-site in `useSettings.ts` (TDD)

**Files:**
- Modify: `src/ui/composables/useSettings.ts`
- Modify: `tests/ui/composables/useSettings.test.ts` (add test)

Currently `loadSettings()` throws when `bridge.getSettings()` rejects. This is called from `onMounted` in `SettingsView`, where an async throw goes unhandled. Replace with explicit notification.

- [ ] **Step 16.1: Add a failing test for the error path**

In `tests/ui/composables/useSettings.test.ts`, add a test (alongside existing tests — do not remove them):

```typescript
it('loadSettings: calls notify.showError instead of throwing when bridge rejects', async () => {
  // Arrange — mount with a bridge that rejects getSettings
  const notify = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }
  let captured: (() => Promise<void>) | undefined
  const wrapper = mount(defineComponent({
    setup() {
      const result = useSettings()
      captured = result.loadSettings
      return {}
    },
    template: '<div />',
  }), {
    global: {
      provide: {
        [SETTINGS_PORT as symbol]: { getSettings: () => Promise.reject(new Error('vault unavailable')), saveSettings: vi.fn() },
        [NOTIFICATION_PORT as symbol]: notify,
      },
    },
  })
  // Act
  await captured?.()
  // Assert — no throw, notification shown
  expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('vault unavailable'))
  wrapper.unmount()
})
```

- [ ] **Step 16.2: Run test to verify it fails**

```sh
npx vitest run tests/ui/composables/useSettings.test.ts
```

Expected: FAIL — `loadSettings` still throws.

- [ ] **Step 16.3: Fix `useSettings.ts`**

Add `useNotificationPort` import and inject it; replace the throw:

```typescript
import { useNotificationPort } from './useNotificationPort'
import { toUserMessage } from '@/application/shared/errorMessages'

export function useSettings() {
  const bridge = useSettingsPort()
  const notify = useNotificationPort()
  // ... existing store setup ...

  async function loadSettings(): Promise<void> {
    store.setLoading(true)
    const result = await tryAsync(async () => {
      const s = await bridge.getSettings()
      store.setSettings(s)
      if (s.locale) setLocale(s.locale as SupportedLocale)
    })
    store.setLoading(false)
    if (!result.ok) {
      notify.showError(toUserMessage(result.error))
      return  // do not throw — caller (onMounted) does not await this
    }
  }

  // ... rest unchanged ...
}
```

- [ ] **Step 16.4: Run test to verify it passes**

```sh
npx vitest run tests/ui/composables/useSettings.test.ts
```

Expected: all passing.

- [ ] **Step 16.5: Commit**

```sh
git add src/ui/composables/useSettings.ts tests/ui/composables/useSettings.test.ts
git commit -m "fix(ui): replace loadSettings throw with notify.showError"
```

---

### Task 17: Fix throw-site in `SettingsView.vue` (TDD)

**Files:**
- Modify: `src/ui/views/SettingsView.vue`
- Modify: `tests/ui/views/SettingsView.test.ts` (add test)

`handleSave` throws on `saveSettings` failure. Replace with explicit notification.

- [ ] **Step 17.1: Add a failing test for the save error path**

In `tests/ui/views/SettingsView.test.ts`, add:

```typescript
it('handleSave: calls notify.showError instead of throwing when saveSettings rejects', async () => {
  const notify = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }
  // mount with a saveSettings that rejects
  const wrapper = mount(SettingsView, {
    global: {
      provide: {
        [SETTINGS_PORT as symbol]: {
          getSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS }),
          saveSettings: () => Promise.reject(new Error('write failed')),
        },
        [NOTIFICATION_PORT as symbol]: notify,
      },
      plugins: [createPinia(), i18n],
    },
  })
  const po = new SettingsViewPO(wrapper)
  await po.clickSave()
  expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('write failed'))
})
```

- [ ] **Step 17.2: Run test to verify it fails**

```sh
npx vitest run tests/ui/views/SettingsView.test.ts
```

Expected: FAIL.

- [ ] **Step 17.3: Fix `SettingsView.vue`**

Add `useNotificationPort` and `toUserMessage`; replace the throw:

```typescript
import { useNotificationPort } from '../composables/useNotificationPort'
import { toUserMessage } from '@/application/shared/errorMessages'

// inside <script setup>:
const notify = useNotificationPort()

async function handleSave() {
  saving.value = true
  const result = await tryAsync(() => saveSettings({ ...settings.value }))
  saving.value = false
  if (!result.ok) {
    notify.showError(toUserMessage(result.error))
    return
  }
  saved.value = true
  setTimeout(() => { saved.value = false }, 2500)
}
```

- [ ] **Step 17.4: Run test to verify it passes**

```sh
npx vitest run tests/ui/views/SettingsView.test.ts
```

- [ ] **Step 17.5: Commit**

```sh
git add src/ui/views/SettingsView.vue tests/ui/views/SettingsView.test.ts
git commit -m "fix(ui): replace handleSave throw with notify.showError"
```

---

### Task 18: Fix throw-site in `CreateFeatureForm.vue` (TDD)

**Files:**
- Modify: `src/ui/components/feature/CreateFeatureForm.vue`
- Modify: `tests/ui/components/feature/CreateFeatureForm.test.ts` (add test)

`handleSubmit` throws when `submitHandler` rejects. Replace with explicit notification.

- [ ] **Step 18.1: Add a failing test for the submit error path**

In `tests/ui/components/feature/CreateFeatureForm.test.ts`, add:

```typescript
it('handleSubmit: calls notify.showError instead of throwing when submitHandler rejects', async () => {
  const notify = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }
  const wrapper = mount(CreateFeatureForm, {
    props: {
      submitHandler: () => Promise.reject(new Error('slug conflict')),
    },
    global: {
      provide: {
        [NOTIFICATION_PORT as symbol]: notify,
      },
      plugins: [i18n],
    },
  })
  const po = new CreateFeatureFormPO(wrapper)
  await po.fillTitle('My Feature')
  await po.submit()
  expect(notify.showError).toHaveBeenCalledWith(expect.stringContaining('slug conflict'))
})
```

- [ ] **Step 18.2: Run test to verify it fails**

```sh
npx vitest run tests/ui/components/feature/CreateFeatureForm.test.ts
```

Expected: FAIL.

- [ ] **Step 18.3: Fix `CreateFeatureForm.vue`**

Add `useNotificationPort` and `toUserMessage`; replace the throw:

```typescript
import { useNotificationPort } from '@/ui/composables/useNotificationPort'
import { toUserMessage } from '@/application/shared/errorMessages'

// inside <script setup>:
const notify = useNotificationPort()

async function handleSubmit() {
  // ... existing guard checks unchanged ...
  const result = await tryAsync(() =>
    props.submitHandler({ title: trimmedTitle, area: trimmedArea || undefined }),
  )
  submitting.value = false
  if (result.ok && result.value) {
    title.value = ''
    area.value = ''
  } else if (!result.ok) {
    notify.showError(toUserMessage(result.error))
  }
}
```

- [ ] **Step 18.4: Run test to verify it passes**

```sh
npx vitest run tests/ui/components/feature/CreateFeatureForm.test.ts
```

- [ ] **Step 18.5: Run full test suite**

```sh
npm test
```

- [ ] **Step 18.6: Commit**

```sh
git add src/ui/components/feature/CreateFeatureForm.vue tests/ui/components/feature/CreateFeatureForm.test.ts
git commit -m "fix(ui): replace CreateFeatureForm throw with notify.showError"
```

---

### Task 19: Fix `process.env.NODE_ENV` in plugin Vite build

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 19.1: Add `define` block to the plugin build config**

In the `mode === 'plugin'` return block, add `define`:

```typescript
if (mode === 'plugin') {
  return {
    plugins: [vue(), scopeBuiltCss(), copyPluginArtifacts()],
    resolve: { alias },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    build: {
      // ... existing build config unchanged ...
    },
  }
}
```

- [ ] **Step 19.2: Build to confirm no regression**

```sh
npm run build
```

Expected: builds without error. `main.js` output in project root.

- [ ] **Step 19.3: Commit**

```sh
git add vite.config.ts
git commit -m "fix(build): inject process.env.NODE_ENV in plugin build target"
```

---

### Task 20: Run full verification gate

- [ ] **Step 20.1: Run the full verify gate**

```sh
npm run verify
```

Expected: typecheck + lint + format + test + coverage all pass. Coverage thresholds: 80/70/80/80.

If coverage fails: identify which new file is below threshold and add targeted tests for missed branches.

- [ ] **Step 20.2: Commit any coverage fixes, then final commit**

```sh
git add -p   # stage only coverage-fix changes
git commit -m "test: improve coverage for new application/ui files"
```

---

### Task 21: Update spec status

- [ ] **Step 21.1: Mark spec as Approved**

In `docs/superpowers/specs/2026-05-04-error-logging-notification-design.md`, change the frontmatter:

```yaml
status: approved
```

- [ ] **Step 21.2: Commit**

```sh
git add docs/superpowers/specs/2026-05-04-error-logging-notification-design.md
git commit -m "docs(spec): mark error-logging-notification design as approved"
```
