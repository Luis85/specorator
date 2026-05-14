---
id: SPEC-CCS-001
title: "Claude CLI chat sidebar — implementation specification"
feature: claude-cli-chat-sidebar
stage: spec
status: complete
owner: architect
inputs:
  - PRD-CCS-001
  - DES-CCS-001
  - ADR-0027
  - ADR-0028
created: 2026-05-14
updated: 2026-05-14
---

# Implementation Specification — Claude CLI chat sidebar

This document is the implementation-ready contract for the Claude CLI chat sidebar feature as built on the `develop` branch. It documents what was actually built; every section traces back to at least one requirement ID from `requirements.md`.

---

## 1. File structure

All paths are relative to `src/`. Every file listed was introduced or modified by this feature.

| File | Status | Purpose |
|---|---|---|
| `domain/ports/ClaudeCliPort.ts` | New | Domain-layer narrow port interface: `ClaudeCliPort`, `ClaudeCliError`, `ClaudeCliErrorCode`, `ClaudeCliQueryOptions` |
| `domain/settings/PluginSettings.ts` | Modified | Added `anthropicApiKey: string` field and corresponding `DEFAULT_SETTINGS` entry |
| `application/chat/buildPrompt.ts` | New | Pure function that assembles and budget-trims the prompt string; exports `ContextFile`, `BuildPromptResult`, `buildPrompt()` |
| `infrastructure/obsidian/ClaudeCliAdapter.ts` | New | Production `ClaudeCliPort` implementation using `@anthropic-ai/claude-agent-sdk` |
| `infrastructure/mock/MockClaudeCliPort.ts` | New | Configurable test/dev stub implementation of `ClaudeCliPort` |
| `infrastructure/bridge/ports.ts` | Modified | Added `CLAUDE_CLI_PORT`, `IS_MOBILE_KEY`, `SETTINGS_VERSION_KEY` injection keys |
| `ui/composables/useClaudeCliPort.ts` | New | Thin `inject(CLAUDE_CLI_PORT)` composable |
| `ui/composables/usePlatform.ts` | New | `inject(IS_MOBILE_KEY, false)` composable returning `{ isMobile: boolean }` |
| `ui/stores/chatStore.ts` | New | Pinia store holding all chat panel DTO state and actions |
| `ui/components/chat/ChatSidebar.vue` | New | Orchestrator component: availability check, send handler, state branching |
| `ui/components/chat/ChatInput.vue` | New | Textarea + send button; exposes `textareaEl` ref |
| `ui/components/chat/ChatResponse.vue` | New | Pure display component for six mutually exclusive response states |
| `ui/components/chat/ContextFileList.vue` | New | Context chip list section with empty-state hint |
| `ui/components/chat/ContextFileChip.vue` | New | Auto and manual chip variants |
| `ui/views/ChatSidebarView.vue` | New | Route component for `/chat`; thin shell that mounts `ChatSidebar` |
| `plugin/main.ts` | Modified | Wires `ClaudeCliAdapter`, file-menu handler, active-leaf-change handler, URI handler, `onLayoutReady` startup call |
| `plugin/SpecoratorView.ts` | Modified | Provides `CLAUDE_CLI_PORT`, `IS_MOBILE_KEY`, `SETTINGS_VERSION_KEY`; exposes `bumpSettingsVersion()` and `pinia` |
| `plugin/settings.ts` | Modified | Added `renderAnthropicKeyField()` with password input and `_bumpAllViews()` |

Test files (under `tests/`, mirroring `src/`):

| File | Coverage |
|---|---|
| `tests/application/chat/buildPrompt.test.ts` | `buildPrompt()` all algorithm steps |
| `tests/infrastructure/mock/MockClaudeCliPort.test.ts` | All `MockClaudeCliPort` branches |
| `tests/ui/stores/chatStore.test.ts` | All store actions and state transitions |
| `tests/ui/components/chat/ChatSidebar.test.ts` | Component variants, send flow, guards, error paths |
| `tests/ui/components/chat/ChatSidebar.po.ts` | PageObject for `ChatSidebar` |

---

## 2. Interfaces

### 2.1 `ClaudeCliErrorCode`

Satisfies REQ-CCS-021.

```typescript
// src/domain/ports/ClaudeCliPort.ts

export type ClaudeCliErrorCode =
  | 'NOT_INSTALLED'   // Binary could not be resolved or the SDK failed to start
  | 'API_KEY_MISSING' // ANTHROPIC_API_KEY was empty at query time
  | 'TIMEOUT'         // No response received within timeoutMs
  | 'QUERY_FAILED'    // SDK call returned an error or threw an unexpected exception
```

UI copy mapping (REQ-CCS-016, REQ-CCS-018, REQ-CCS-019):

| Code | Displayed as |
|---|---|
| `NOT_INSTALLED` | "AI assistant is not available right now." |
| `API_KEY_MISSING` | "Chat is not set up yet." |
| `TIMEOUT` | "That took too long. Please try again." |
| `QUERY_FAILED` | "Something went wrong. Please try again." |

### 2.2 `ClaudeCliError`

```typescript
export class ClaudeCliError extends Error {
  public readonly name = 'ClaudeCliError'

  constructor(
    public readonly errorCode: ClaudeCliErrorCode,
    message: string,
    /** Original SDK or system error. Used for logging only; never surfaced in UI. */
    public readonly cause?: unknown,
  ) {
    super(message)
    // Restore prototype chain (required for instanceof checks in transpiled code).
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
```

### 2.3 `ClaudeCliQueryOptions`

Satisfies REQ-CCS-021, NFR-CCS-003.

```typescript
export interface ClaudeCliQueryOptions {
  /**
   * Maximum wall-clock time in milliseconds before the adapter returns
   * ClaudeCliError{TIMEOUT}. Default: 30 000. Valid range: [1 000, 300 000].
   * Values outside the range are silently clamped by the adapter.
   */
  readonly timeoutMs?: number

  /**
   * Maximum number of agent turns. Fixed at 1 in v1.
   * Values > 1 are clamped to 1; the adapter logs a warn.
   */
  readonly maxTurns?: number
}
```

### 2.4 `ClaudeCliPort`

Satisfies REQ-CCS-021, NFR-CCS-011. The interface file must not import from `obsidian` or `@anthropic-ai/claude-agent-sdk`. It imports only `Result` from `@/domain/shared/Result`.

```typescript
export interface ClaudeCliPort {
  /**
   * Send a fully-assembled prompt string to Claude and return the full text response.
   * Never throws. Returns Result<string, ClaudeCliError>.
   * Satisfies REQ-CCS-013, REQ-CCS-016, NFR-CCS-003.
   */
  query(
    prompt: string,
    options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>>

  /**
   * Returns true if the adapter is ready to accept queries.
   * Returns false for all degraded conditions: missing API key, startup failure,
   * binary not found, browser/mobile stubs.
   * Must not throw. Implementors must catch all errors and return false.
   * Satisfies REQ-CCS-018, REQ-CCS-019, REQ-CCS-022.
   */
  isAvailable(): Promise<boolean>

  /**
   * Pre-warm the subprocess. Called from onLayoutReady() before first user interaction.
   * Must not throw; log errors internally and return.
   * Satisfies REQ-CCS-003, NFR-CCS-002.
   */
  startup(): Promise<void>

  /**
   * Terminate the subprocess. Called from onunload() which is synchronous.
   * Must be synchronous (fire-and-forget is acceptable).
   * Must not throw.
   * Satisfies REQ-CCS-004, NFR-CCS-007.
   */
  shutdown(): void
}
```

### 2.5 `ContextFileEntry`

Plain DTO stored in Pinia. File content is never stored here; it is loaded on demand from `VaultPort.readFile()` at send time.

```typescript
// src/ui/stores/chatStore.ts

export interface ContextFileEntry {
  /** Vault-relative path, e.g. "specs/my-feature/requirements.md". Used as unique key. */
  readonly path: string
  /** Display name shown in the chip, e.g. "requirements.md". */
  readonly label: string
  /**
   * True if this entry was added automatically from the active Obsidian editor file.
   * Auto entries: (1) have no remove control, (2) are always placed at index 0,
   * (3) are replaced as a unit when the active file changes.
   */
  readonly isAuto: boolean
}
```

### 2.6 `ChatStatus`

```typescript
// src/ui/stores/chatStore.ts

export type ChatStatus = 'idle' | 'loading' | 'error'
```

### 2.7 `ChatErrorType`

```typescript
// src/ui/stores/chatStore.ts

/**
 * Subset of ClaudeCliErrorCode values tracked by the store for UI rendering.
 * NOT_INSTALLED and API_KEY_MISSING are handled at the availability-check level,
 * not in the error state of the panel.
 */
export type ChatErrorType = 'timeout' | 'query_failed'
```

---

## 3. `buildPrompt()` specification

Satisfies REQ-CCS-025, REQ-CCS-026, REQ-CCS-027, NFR-CCS-001, NFR-CCS-008.

### 3.1 Exported types

```typescript
// src/application/chat/buildPrompt.ts

export interface ContextFile {
  readonly path: string     // vault-relative path
  readonly label: string    // display label (filename)
  readonly isAuto: boolean  // true = active editor file; floor enforced on trim
  readonly content: string  // raw file content from VaultPort.readFile(); may be ''
}

export interface BuildPromptResult {
  readonly prompt: string     // fully assembled prompt to pass to ClaudeCliPort.query()
  readonly truncated: boolean // true when any content was removed or shortened
}
```

### 3.2 Signature

```typescript
export function buildPrompt(
  userText: string,
  contextFiles: ReadonlyArray<ContextFile>,
  options?: { readonly tokenCap?: number },  // default 50 000
): BuildPromptResult
```

### 3.3 Constants

| Constant | Value | Meaning |
|---|---|---|
| `DEFAULT_TOKEN_CAP` | `50_000` | Default token ceiling |
| `CHARS_PER_TOKEN` | `4` | Characters-per-token approximation |
| `MIN_ACTIVE_FILE_CHARS` | `500` | Minimum characters preserved from the auto file |

`charBudget = tokenCap × 4` (default: `200 000` characters).

### 3.4 Prompt format

When `contextFiles.length > 0`:
```
The following files are provided for context:\n\n
---\nFile: <path>\n---\n<content>\n\n
[...repeated for each file]
---\n\n
<userText>
```

When `contextFiles.length === 0`: the prompt is `userText` verbatim.

Exact example (REQ-CCS-025):
```
buildPrompt("hello", [{ path: "a.md", content: "x", isAuto: true, label: "a.md" }])
→ "The following files are provided for context:\n\n---\nFile: a.md\n---\nx\n\n---\n\nhello"
```

### 3.5 Algorithm

Steps execute sequentially. The function returns as soon as a budget-satisfied condition is met.

1. Compute `charBudget = (options?.tokenCap ?? 50_000) × 4`.
2. Assemble `fullPrompt = assemblePrompt(userText, contextFiles)`.
3. If `fullPrompt.length <= charBudget` → return `{ prompt: fullPrompt, truncated: false }`.
4. Separate `autoFiles = contextFiles.filter(f => f.isAuto)` and `manualFiles = [...contextFiles.filter(f => !f.isAuto)]` (mutable copy).
5. LIFO manual removal: while `assembled.length > charBudget && manualFiles.length > 0`: pop the last element of `manualFiles`, reassemble.
6. If `assembled.length <= charBudget` → return `{ prompt: assembled, truncated: true }`.
7. Auto file trim (only if `autoFiles.length > 0`):
   - `surplus = assembled.length - charBudget`
   - `trimmedContent = autoFile.content.length - surplus >= MIN_ACTIVE_FILE_CHARS ? autoFile.content.slice(0, autoFile.content.length - surplus) : autoFile.content.slice(0, MIN_ACTIVE_FILE_CHARS)`
   - Reassemble with trimmed auto file and remaining `manualFiles`.
8. Hard-truncate: if `assembled.length > charBudget`, `assembled = assembled.slice(0, charBudget)`.
9. Return `{ prompt: assembled, truncated: true }`.

### 3.6 Pre/post-conditions

| Condition | Requirement |
|---|---|
| Pre: `userText` may be any string including empty or whitespace | Callers must guard for empty text (REQ-CCS-015); `buildPrompt` does not throw on empty input |
| Pre: `contextFiles[0].isAuto === true` if an auto file is present | Caller must enforce ordering; `buildPrompt` reads the first auto file for trimming |
| Post: `result.prompt.length <= charBudget` | Always satisfied |
| Post: no I/O, no state mutation | Pure function (NFR-CCS-001) |

### 3.7 Side effects

None. The function is a pure computation.

---

## 4. `useChatStore()` specification

Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010, REQ-CCS-011, REQ-CCS-013, REQ-CCS-014, REQ-CCS-016, REQ-CCS-017.

### 4.1 State shape

Store ID: `'chat'`. All fields are Vue `ref<T>`.

| Field | Type | Initial value | Semantics |
|---|---|---|---|
| `contextFiles` | `ContextFileEntry[]` | `[]` | Ordered list; auto entry at index 0 when present |
| `userText` | `string` | `''` | Bound to textarea; cleared on success, retained on error |
| `response` | `string \| null` | `null` | Last successful response text; null until first success |
| `status` | `ChatStatus` | `'idle'` | `'idle' \| 'loading' \| 'error'` |
| `errorType` | `ChatErrorType \| null` | `null` | `'timeout' \| 'query_failed' \| null`; null when not in error state |
| `truncated` | `boolean` | `false` | True when `buildPrompt()` removed content to stay within the cap |

### 4.2 Actions

#### `addContextFile(file: ContextFileEntry): void`

- Appends `file` to `contextFiles`.
- No-op if an entry with the same `path` already exists (REQ-CCS-010).
- Auto files should use `setActiveFile` instead; `addContextFile` does not enforce index-0 placement.

#### `removeContextFile(path: string): void`

- Removes the entry whose `path` matches. No-op if not found (REQ-CCS-011).

#### `setActiveFile(file: ContextFileEntry | null): void`

- Replaces the auto slot (REQ-CCS-005, REQ-CCS-006).
- Separates manual entries (`isAuto === false`) from the existing list.
- If `file` is non-null: forces `isAuto = true` on the entry and inserts it at index 0, followed by the manual entries.
- If `file` is null: sets `contextFiles` to the manual entries only (removes auto entry).
- Does not affect manual entries.

#### `setUserText(text: string): void`

- Sets `userText` to `text`.

#### `beginRequest(): void`

- Sets `status = 'loading'`. Satisfies REQ-CCS-014.
- Clears `response` to `null`.
- Clears `errorType` to `null`.
- Clears `truncated` to `false`.

#### `setResponse(text: string, wasTruncated: boolean): void`

- Sets `status = 'idle'`. Satisfies REQ-CCS-013 success path.
- Sets `response = text`.
- Sets `truncated = wasTruncated`.

#### `setError(type: ChatErrorType): void`

- Sets `status = 'error'`. Satisfies REQ-CCS-016.
- Sets `errorType = type`.
- Clears `response` to `null`.
- Does NOT clear `userText` (REQ-CCS-017).

#### `clearResponse(): void`

- Clears `response` to `null`.
- Sets `status = 'idle'`, `errorType = null`, `truncated = false`.

#### `reset(): void`

- Restores all fields to their initial values: `contextFiles = []`, `userText = ''`, `response = null`, `status = 'idle'`, `errorType = null`, `truncated = false`.

### 4.3 State transition diagram

```
┌────────────────────────────────────────────────────────────────────┐
│  ChatStatus state machine                                          │
│                                                                    │
│  ┌──────┐  beginRequest()  ┌─────────┐  setResponse()  ┌──────┐  │
│  │ idle │ ──────────────► │ loading │ ───────────────► │ idle │  │
│  └──────┘                 └─────────┘                  └──────┘  │
│     ▲                          │                                   │
│     │      clearResponse()     │ setError()                       │
│     │◄────────────────────────┐│                                   │
│     │                         ▼                                   │
│  ┌──────┐  clearResponse()  ┌───────┐                             │
│  │ idle │ ◄──────────────── │ error │                             │
│  └──────┘                   └───────┘                             │
└────────────────────────────────────────────────────────────────────┘
```

---

## 5. `ClaudeCliAdapter` specification

Satisfies REQ-CCS-002, REQ-CCS-003, REQ-CCS-004, REQ-CCS-013, REQ-CCS-016, REQ-CCS-022, NFR-CCS-003, NFR-CCS-005, NFR-CCS-007.

### 5.1 Fields

| Field | Type | Purpose |
|---|---|---|
| `_available` | `boolean` | True only after `startup()` succeeds. Initial: `false`. |
| `_sdkReady` | `boolean` | Idempotency guard. Initial: `false`. `shutdown()` resets it. |
| `_getSettings` | `() => PluginSettings` | Getter for current settings; never stored as a snapshot. |
| `_logger` | `LoggerPort` | Internal diagnostics; never logs the API key value. |
| `_resolveCliPath` | `() => string` | Binary path resolver; injectable for testability. Default: `require.resolve('@anthropic-ai/claude-agent-sdk/bin/claude')`. |

### 5.2 `startup(): Promise<void>`

Pre-conditions: none. Post-condition: `_available` and `_sdkReady` reflect the outcome.

Algorithm:
1. If `_sdkReady === true`, return immediately (idempotent).
2. Read `key = _getSettings().anthropicApiKey.trim()`.
3. If `key === ''`: log warn ("anthropicApiKey is empty"), set `_available = false`, return.
4. Write `process.env.ANTHROPIC_API_KEY = key` (key value never appears in logs).
5. Call `_resolveCliPath()`. If it throws: log warn ("binary not found"), set `_available = false`, return.
6. If the resolved path is not absolute (`!isAbsolute(binaryPath)`): log warn ("path not absolute"), set `_available = false`, return.
7. Set `_sdkReady = true`, `_available = true`. Log info ("adapter ready").

### 5.3 `query(prompt, options?): Promise<Result<string, ClaudeCliError>>`

Never throws. Returns `Result<string, ClaudeCliError>`.

Algorithm:
1. If `!_available`: return `err(ClaudeCliError(_unavailableCode(), ...))`.
2. Re-read `currentKey = _getSettings().anthropicApiKey.trim()`.
3. If `currentKey === ''`: return `err(ClaudeCliError('API_KEY_MISSING', ...))`.
4. Write `process.env.ANTHROPIC_API_KEY = currentKey`.
5. `timeoutMs = _clampTimeout(options?.timeoutMs)`.
6. If `options?.maxTurns > 1`: log warn ("maxTurns clamped to 1 in v1").
7. Create `AbortController controller`.
8. Race: `_runSdkQuery(prompt, controller)` vs. a timeout promise that aborts `controller` and rejects with `ClaudeCliError('TIMEOUT', ...)` after `timeoutMs` ms.
9. On success: return `ok(responseText)`.
10. On any catch: return `err(_mapError(e, timeoutMs))`.
11. Finally: `clearTimeout(timeoutId); controller.abort()`.

### 5.4 `isAvailable(): Promise<boolean>`

Returns `_available && _getSettings().anthropicApiKey.trim() !== ''`. Never throws. Satisfies REQ-CCS-022.

### 5.5 `shutdown(): void`

Synchronous. Satisfies NFR-CCS-007.
- If `_sdkReady === true`: log debug ("shutting down adapter").
- Set `_sdkReady = false`, `_available = false`.
- Never throws.

### 5.6 Private helpers

#### `_unavailableCode(): 'API_KEY_MISSING' | 'NOT_INSTALLED'`

Returns `'API_KEY_MISSING'` when `_getSettings().anthropicApiKey.trim() === ''`, otherwise `'NOT_INSTALLED'`.

#### `_clampTimeout(raw?: number): number`

Returns `Math.min(Math.max(raw ?? 30_000, 1_000), 300_000)`. Satisfies NFR-CCS-003.

#### `_runSdkQuery(prompt, controller): Promise<string>`

- Calls `sdkQuery({ prompt, options: { maxTurns: 1, abortController: controller } })`.
- Iterates the async generator; collects messages where `message.type === 'result' && 'result' in message`.
- Throws `Error('No result message received from SDK')` if no result message was emitted.

#### `_mapError(e, timeoutMs): ClaudeCliError`

Satisfies NFR-CCS-005 (key value never appears in error messages or logs).

| `e` value | Result |
|---|---|
| `ClaudeCliError` with `errorCode === 'TIMEOUT'` | Pass through. Logs warn `{ timeoutMs }` only. |
| `Error` with message matching `/api.key\|authentication\|401/i` | `ClaudeCliError('API_KEY_MISSING', 'Authentication failed', e)`. Logs warn "API key error" (no key value). |
| Any other `Error` | `ClaudeCliError('QUERY_FAILED', 'Query failed', e)`. Logs warn with `e.message`. |
| Unknown non-Error | `ClaudeCliError('QUERY_FAILED', 'Unknown error', e)`. Logs warn "unknown error". |

---

## 6. `MockClaudeCliPort` specification

Satisfies REQ-CCS-023, NFR-CCS-004.

### 6.1 Configuration fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `available` | `boolean` | `false` | Controls `isAvailable()` return value and the no-op branch of `query()` |
| `cannedResponse` | `string` | `'Mock response from MockClaudeCliPort.'` | Text returned on success |
| `queryError` | `ClaudeCliError \| null` | `null` | If non-null, `query()` returns this error instead of `cannedResponse` |
| `delayMs` | `number` | `0` | Artificial delay before `query()` resolves |
| `queryLog` | `readonly string[]` | `[]` | Append-only log of every prompt string passed to `query()` |

### 6.2 Method behaviour

#### `startup(): Promise<void>`

No-op. Returns `Promise.resolve()`. Never throws.

#### `shutdown(): void`

No-op. Never throws.

#### `isAvailable(): Promise<boolean>`

Returns `Promise.resolve(this.available)`. Never throws.

#### `query(prompt, _options?): Promise<Result<string, ClaudeCliError>>`

1. Appends `prompt` to `queryLog` (always, even when unavailable).
2. If `!this.available`: return `err(ClaudeCliError('NOT_INSTALLED', 'MockClaudeCliPort: not available'))`.
3. If `this.delayMs > 0`: `await sleep(this.delayMs)`.
4. If `this.queryError !== null`: return `err(this.queryError)`.
5. Return `ok(this.cannedResponse)`.

---

## 7. Component contracts

### 7.1 `ChatSidebarView.vue`

Route component for `/chat`. Thin shell with no props, no emits, no state. Renders `<ChatSidebar />` unconditionally. All logic lives in `ChatSidebar`.

### 7.2 `ChatSidebar.vue`

Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-013, REQ-CCS-014, REQ-CCS-015, REQ-CCS-016, REQ-CCS-017, REQ-CCS-018, REQ-CCS-019, REQ-CCS-020, REQ-CCS-024, NFR-CCS-009.

**Props:** none.

**Emits:** none.

**Injected dependencies:**
- `CLAUDE_CLI_PORT` → `ClaudeCliPort | undefined`
- `IS_MOBILE_KEY` → `boolean` (default `false`)
- `SETTINGS_VERSION_KEY` → `Ref<number>` (default `ref(0)`)
- `VAULT_PORT`, `WORKSPACE_PORT`, `SETTINGS_PORT`

**Local state:**
- `available: Ref<boolean>` — result of `claudeCliPort.isAvailable()`
- `availabilityChecked: Ref<boolean>` — `false` until the first `isAvailable()` call completes; prevents flash of wrong state
- `apiKeyMissing: Ref<boolean>` — set by reading `settingsPort.getSettings().anthropicApiKey`
- `containerEl: Ref<HTMLElement | null>` — root element ref for focus management
- `inputRef: Ref<ChatInput | null>` — ref to the `ChatInput` instance for `textareaEl` access

**Key behaviour:**

1. On `onMounted`:
   - Calls `claudeCliPort.isAvailable()` and sets `available`.
   - Sets `availabilityChecked = true`.
   - Reads the active file from `workspacePort.getActiveFile()` and calls `store.setActiveFile()`.
   - Subscribes to `workspacePort.onActiveFileChanged(updateActiveFile)`.
   - After `nextTick`: if `available && !isMobile`, focuses the textarea; otherwise focuses `[data-testid="chat-degraded-heading"]`.
   - Reads `settingsPort.getSettings().anthropicApiKey` and sets `apiKeyMissing`.

2. On `onUnmounted`: unsubscribes the active-file listener.

3. `watch(settingsVersion, ...)`: re-calls `claudeCliPort.isAvailable()` and updates `available`. Satisfies REQ-CCS-024.

4. `watch(available, ...)` and `watch(availabilityChecked, ...)`: re-reads `apiKeyMissing` when availability transitions to false.

5. Template branching (evaluated top-to-bottom; first match wins):
   - `v-if="isMobile"` → mobile degraded block (REQ-CCS-020)
   - `v-else-if="!availabilityChecked"` → empty (blank render; prevents state flash)
   - `v-else-if="!available && apiKeyMissing"` → no-key degraded block (REQ-CCS-018)
   - `v-else-if="!available && !apiKeyMissing"` → SDK-unavailable degraded block (REQ-CCS-019)
   - `v-else` → ready state: title, `ContextFileList`, divider, `ChatInput`, divider, `ChatResponse`

6. `handleSend()`:
   - Guard: `store.userText.trim()` empty → return (REQ-CCS-015).
   - Guard: `store.status === 'loading'` → return.
   - Guard: `!available` → return.
   - Calls `store.beginRequest()`.
   - Parallel `VaultPort.readFile()` for all context files; failed reads yield `content: ''`.
   - Calls `buildPrompt(store.userText, loadedFiles)`.
   - Calls `claudeCliPort.query(prompt, { timeoutMs: 30_000 })`.
   - On success: `store.setResponse(text, truncated)`, `store.setUserText('')`, focus textarea.
   - On `TIMEOUT`: `store.setError('timeout')`, focus textarea.
   - On other error codes: `store.setError('query_failed')`, focus textarea.

7. `responseState` computed: derives `'idle' | 'loading' | 'success' | 'trimmed-success' | 'timeout' | 'error'` from `store.status`, `store.errorType`, `store.response`, and `store.truncated`.

**data-testid attributes:**
- `data-testid="chat-sidebar"` on root `<div>`
- `data-testid="chat-degraded-heading"` on `<h3>` in all three degraded states
- `data-testid="chat-degraded-settings-link"` on the `RouterLink` in the no-key state

### 7.3 `ChatInput.vue`

Satisfies REQ-CCS-013, REQ-CCS-014, NFR-CCS-010.

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `modelValue` | `string` | yes | Bound to textarea `value`; the component is uncontrolled on input |
| `disabled` | `boolean` | yes | When `true`: textarea becomes `readonly`, send button is `disabled` |
| `loading` | `boolean` | yes | When `true`: send button shows spinner + "Asking…" label |

**Emits:**

| Event | Payload | When |
|---|---|---|
| `update:modelValue` | `string` | On every `input` event on the textarea |
| `send` | _(none)_ | On send button click or Ctrl+Enter / Cmd+Enter in textarea |

**Exposed ref:** `textareaEl: Ref<HTMLTextAreaElement | null>` — accessible from parent via template ref.

**Key behaviour:**
- `handleKeydown`: fires `emit('send')` when `event.key === 'Enter' && (event.ctrlKey || event.metaKey)` and `!disabled && !loading`.
- Send button click: fires `emit('send')` only when `!disabled && !loading`.
- Spinner span is `aria-hidden="true"`.

**data-testid attributes:**
- `data-testid="chat-input-textarea"` on `<textarea>`
- `data-testid="chat-send-button"` on `<button>`

**ARIA:**
- Textarea: `aria-label="Message"`, `aria-multiline="true"`, `placeholder="Ask anything about your work…"`.
- Send button: `aria-label="Send message"`. Uses native `disabled` attribute; not in tab order when disabled.

### 7.4 `ChatResponse.vue`

Satisfies REQ-CCS-012, REQ-CCS-013, REQ-CCS-014, REQ-CCS-016.

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `state` | `'idle' \| 'loading' \| 'success' \| 'trimmed-success' \| 'timeout' \| 'error'` | yes | Determines which branch renders |
| `text` | `string` (optional) | no | Response text; used in `success` and `trimmed-success` states |

**Emits:** none.

**State rendering:**

| `state` | Element | ARIA | Content |
|---|---|---|---|
| `idle` | `<p>` | none | "(Response will appear here.)" |
| `loading` | `<div>` | `role="status"` `aria-live="polite"` | "Thinking…" |
| `trimmed-success` | `<p>` + `<div>` | trim `<p>`: `role="status"` `aria-live="polite"` | Trim notice + `text` prop |
| `success` | `<div>` | none | `text` prop |
| `timeout` | `<p>` | `role="alert"` `aria-live="assertive"` | "That took too long. Please try again." |
| `error` | `<p>` | `role="alert"` `aria-live="assertive"` | "Something went wrong. Please try again." |

**data-testid attributes:**
- `data-testid="chat-response-idle"` — idle `<p>`
- `data-testid="chat-response-loading"` — loading `<div>`
- `data-testid="chat-response-trim-notice"` — trim notice `<p>`
- `data-testid="chat-response-text"` — success and trimmed-success response `<div>`
- `data-testid="chat-response-error"` — timeout and generic error `<p>`

### 7.5 `ContextFileList.vue`

Satisfies REQ-CCS-005, REQ-CCS-006, REQ-CCS-009, REQ-CCS-010, REQ-CCS-011, REQ-CCS-014.

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `files` | `ReadonlyArray<ContextFileEntry>` | yes | Ordered list of context entries |
| `disabled` | `boolean` | yes | When `true`, forwarded to `ContextFileChip`; hides remove buttons |

**Emits:**

| Event | Payload | When |
|---|---|---|
| `remove` | `{ path: string }` | When a `ContextFileChip` emits `remove` |

**Key behaviour:**
- Wraps a `<section aria-label="Context for this message.">`.
- Inner `<ul role="list" aria-label="Context files">` iterates `files` by `file.path` key.
- Shows empty-state hint when `files.length === 0`.

**data-testid attributes:**
- `data-testid="context-file-list"` on `<section>`
- `data-testid="context-file-empty"` on the empty-state `<p>`

### 7.6 `ContextFileChip.vue`

Satisfies REQ-CCS-005, REQ-CCS-009, REQ-CCS-011, REQ-CCS-014, NFR-CCS-010.

**Props:**

| Prop | Type | Required | Semantics |
|---|---|---|---|
| `file` | `ContextFileEntry` | yes | The entry to render |
| `disabled` | `boolean` | yes | When `true`, remove button is not rendered (loading state) |

**Emits:**

| Event | Payload | When |
|---|---|---|
| `remove` | _(none)_ | Click, Enter, or Space on the remove button |

**Auto variant** (`file.isAuto === true`):
- Renders `<span>` with indicator square (`aria-hidden="true"`), `file.label`, `(auto)` suffix (`aria-hidden="true"`), and a visually-hidden `<span class="sr-only">(included automatically)</span>`.
- No remove button.
- `data-testid="context-chip-auto"`

**Manual variant** (`file.isAuto === false`):
- Renders `<span>` with label text and — when `!disabled` — a remove `<button>`.
- Remove button: `aria-label="Remove ${file.label} from context"`, `data-testid="context-chip-remove"`.
- `×` glyph inside button is `aria-hidden="true"`.
- Button fires `emit('remove')` on `click`, `keydown.enter`, and `keydown.space`.
- `data-testid="context-chip-manual"`

---

## 8. Settings extension

Satisfies REQ-CCS-001, REQ-CCS-002, REQ-CCS-028, NFR-CCS-005, NFR-CCS-006.

### 8.1 `PluginSettings` delta

```typescript
// src/domain/settings/PluginSettings.ts

interface PluginSettings {
  // ... existing fields unchanged ...

  /**
   * Anthropic API key. Written to process.env.ANTHROPIC_API_KEY at adapter startup.
   * Used solely to initialise ClaudeCliAdapter. Never written to any vault file.
   * Never logged. Stored in the plugin data blob (Obsidian's this.saveData()).
   *
   * Security: Obsidian Sync will include this key if the user has Sync enabled.
   * A notice in the settings tab informs users (REQ-CCS-028).
   *
   * Satisfies REQ-CCS-001, REQ-CCS-002, NFR-CCS-005, NFR-CCS-006.
   */
  readonly anthropicApiKey: string
}
```

### 8.2 `DEFAULT_SETTINGS` delta

```typescript
export const DEFAULT_SETTINGS: PluginSettings = {
  // ... existing defaults unchanged ...
  anthropicApiKey: '',
}
```

The field is stored under the `specorator` sub-key of the plugin data blob via `this.saveData()`. It is not written to any vault file.

### 8.3 Settings UI — `renderAnthropicKeyField()`

Called from `SpecoratorSettingTab.display()` after all module-driven settings.

| Attribute | Value |
|---|---|
| Setting name | "Anthropic key" |
| Description | "Required to use the AI assistant. Stored in this device's plugin settings. If you use Obsidian Sync, your key will be included in the sync — use a key scoped to your personal devices." |
| Input type | `password` (NFR-CCS-006) |
| Autocomplete | `off` (NFR-CCS-006) |
| data-testid | `settings-anthropic-key` |
| Placeholder | `sk-ant-…` |
| `onChange` | Trims whitespace before calling `plugin.updateSettings({ anthropicApiKey: value.trim() })`; then calls `_bumpAllViews()` (REQ-CCS-002, REQ-CCS-024) |

`_bumpAllViews()` calls `bumpSettingsVersion()` on every open `SpecoratorView` leaf of type `VIEW_TYPE`.

---

## 9. Plugin wiring — `main.ts` hooks

Satisfies REQ-CCS-003, REQ-CCS-004, REQ-CCS-007, REQ-CCS-008, REQ-CCS-009, REQ-CCS-005, REQ-CCS-006.

### 9.1 `onload()` sequence (pseudocode)

```
await loadSettings()
new ObsidianBridge(...)
new PluginCore(...)
await core.init(_storedData)
re-sync settings from blob

// T-CCS-032: Adapter
_claudeCliAdapter = new ClaudeCliAdapter(() => this.settings, bridge)
this.register(() => { _claudeCliAdapter.shutdown() })   // REQ-CCS-004

registerView(VIEW_TYPE, leaf => {
  view = new SpecoratorView(leaf, this, _claudeCliAdapter)
  _specoratorView = view
  return view
})

addRibbonIcon('layout-dashboard', 'Open Specorator', () => activateView())   // REQ-CCS-007
addCommand({ id: 'open-specorator', name: 'Open panel', callback: activateView })  // REQ-CCS-007

// T-CCS-031: File-menu integration (REQ-CCS-009)
registerEvent(workspace.on('file-menu', (menu, file) => {
  menu.addItem(item => {
    item.setTitle('Add to chat context').setIcon('message-square-plus')
    item.onClick(() => {
      activateView().then(() => {
        if (_specoratorView?.pinia) {
          useChatStore(_specoratorView.pinia)
            .addContextFile({ path: file.path, label: file.name, isAuto: false })
        }
      })
    })
  })
}))

// T-CCS-034: Active-file tracking (REQ-CCS-005, REQ-CCS-006)
registerEvent(workspace.on('active-leaf-change', () => {
  const activeFile = app.workspace.getActiveFile()
  if (_specoratorView?.pinia) {
    const store = useChatStore(_specoratorView.pinia)
    activeFile
      ? store.setActiveFile({ path: activeFile.path, label: activeFile.name, isAuto: true })
      : store.setActiveFile(null)
  }
}))

// T-CCS-033: URI handler (REQ-CCS-008)
registerObsidianProtocolHandler('specorator', params => {
  const searchParams = new URLSearchParams(Object.entries(params))
  if (core.handleUri(searchParams)) return

  switch params.action:
    'open-chat' | 'focus-chat' → activateView().then(() => _specoratorView?.navigateTo('/chat'))
    'send-message' | 'open-workflow' → bridge.showInfo("URI action … is not yet implemented.")
    else → bridge.showWarning("Unknown Specorator URI action: …")
})

addSettingTab(new SpecoratorSettingTab(app, this))

// T-CCS-032: Deferred startup (REQ-CCS-003, NFR-CCS-002)
workspace.onLayoutReady(() => {
  void _claudeCliAdapter.startup()
  detectLegacyVaultLayout()
  if (!settings.onboardingComplete) activateView().then(() => navigateTo('/onboarding'))
})
```

### 9.2 `onunload()`

```
workspace.detachLeavesOfType(VIEW_TYPE)
bridge.hideAllNotices()
void core.destroy()
// adapter.shutdown() fires via registered cleanup from this.register() above
```

### 9.3 `SpecoratorView.onOpen()` provision

All injection keys provided to the Vue application:

| Key constant | Value provided |
|---|---|
| `SETTINGS_PORT` | `bridge` |
| `VAULT_PORT` | `bridge` |
| `WORKSPACE_PORT` | `bridge` |
| `NOTIFICATION_PORT` | `bridge` |
| `LOGGER_PORT` | `bridge` |
| `CLAUDE_CLI_PORT` | `this.claudeCliPort` |
| `COMMUNITY_PLUGIN_PORT` | `bridge` |
| `IS_MOBILE_KEY` | `Platform.isMobile` |
| `SETTINGS_VERSION_KEY` | `this._settingsVersion` (a `Ref<number>`) |

`bumpSettingsVersion()` increments `_settingsVersion.value`.

---

## 10. Injection keys

Satisfies REQ-CCS-021, REQ-CCS-024.

```typescript
// src/infrastructure/bridge/ports.ts

export const CLAUDE_CLI_PORT: InjectionKey<ClaudeCliPort> = Symbol('ClaudeCliPort')
export const IS_MOBILE_KEY: InjectionKey<boolean> = Symbol('IsMobile')
/**
 * Reactive counter provided by SpecoratorView. ChatSidebar watches this to
 * re-check adapter availability after the API key is saved in Settings.
 */
export const SETTINGS_VERSION_KEY: InjectionKey<Ref<number>> = Symbol('settingsVersion')
```

---

## 11. Observability requirements

Satisfies NFR-CCS-005.

| Event | Level | Details logged | Must NOT log |
|---|---|---|---|
| `startup()` — key empty | `warn` | "anthropicApiKey is empty" | Key value |
| `startup()` — binary not found | `warn` | "binary not found" | Key value |
| `startup()` — path not absolute | `warn` | "path not absolute" | Key value |
| `startup()` — success | `info` | "adapter ready" | Key value |
| `query()` — timeout | `warn` | `{ timeoutMs }` | Key value |
| `query()` — auth/401 error | `warn` | "API key error" | Key value, error message containing key |
| `query()` — SDK error | `warn` | `{ error: e.message }` | Key value |
| `query()` — unknown error | `warn` | "unknown error" | Key value |
| `shutdown()` — when ready | `debug` | "shutting down adapter" | Key value |

No metrics or distributed traces are emitted by this feature (beyond the LoggerPort calls above). No alerts are registered.

---

## 12. Performance budgets

Inherited from PRD NFRs unless noted.

| Requirement | Target | Source |
|---|---|---|
| `onload()` not delayed by adapter startup | `startup()` deferred to `onLayoutReady`; `onload()` completes before startup begins | NFR-CCS-002 |
| Query timeout | Default 30 000 ms; clamped to [1 000, 300 000] ms | NFR-CCS-003 |
| `buildPrompt()` prompt length | Never exceeds `tokenCap × 4` characters under any input | NFR-CCS-008 |
| `shutdown()` | Synchronous; returns immediately (fire-and-forget) | NFR-CCS-007 |

---

## 13. Compatibility

- Backward-compatible: `anthropicApiKey` is added to `PluginSettings` with `DEFAULT_SETTINGS` entry `''`. Existing stored settings without this key deserialise to `''` via the spread merge in `loadSettings()` — no migration needed.
- No vault schema changes. No new vault files created or read by this feature.
- `ClaudeCliPort` interface has no version field. Future breaking changes require a new ADR and interface version bump.

---

## 14. Edge cases

| Edge case | Handling |
|---|---|
| `userText` is empty or whitespace-only | `handleSend()` returns immediately; `query()` is never called (REQ-CCS-015) |
| `userText` alone exceeds `charBudget` | `buildPrompt()` hard-truncates to `charBudget`; `truncated = true` (NFR-CCS-008) |
| Context file read fails (`VaultPort.readFile()` throws) | `tryAsync` wraps the call; a failed read yields `content: ''`; no error surfaced to the user (flow continues) |
| Same file added twice via right-click | `addContextFile` duplicate guard makes the second call a no-op (REQ-CCS-010) |
| `setActiveFile` called with an entry where `isAuto: false` | `setActiveFile` forces `isAuto = true` on the stored entry |
| `startup()` called twice (idempotent) | Early return on `_sdkReady === true` |
| `startup()` called after `shutdown()` | `_sdkReady` was reset to `false` by `shutdown()`; `startup()` proceeds normally |
| `isAvailable()` called before `startup()` | Returns `false` (`_available` is `false` at initialisation) |
| `ClaudeCliPort` not provided (undefined from `inject`) | `handleSend()` calls `store.setError('query_failed')` when `claudeCliPort === undefined` |
| API key changed in settings while a query is in flight | `query()` re-reads the key at call time; in-flight query uses the key that was live at the moment `query()` was entered |
| Auto file disappears (file deleted while sidebar open) | `workspacePort.onActiveFileChanged` fires with `null`; `setActiveFile(null)` removes the auto entry |
| Manual context file deleted while sidebar open | Not detected; the path remains in the store. At send time, `VaultPort.readFile()` fails and yields `content: ''` |
| `_specoratorView` is null when file-menu item is clicked | Guard `if (_specoratorView?.pinia)` prevents the store call; `addContextFile` is silently skipped |
| `send` fired while `status === 'loading'` | Guard in `handleSend()` returns immediately; no second query started |
| `timeoutMs` outside [1 000, 300 000] | Silently clamped by `_clampTimeout()`; never exposed in error messages (NFR-CCS-003) |
| `maxTurns > 1` passed in options | Clamped to 1; adapter logs a warn; no user-visible effect (design §NG2) |
| Prompt assembled with zero files and empty `userText` | `buildPrompt()` returns `{ prompt: '', truncated: false }`; guard in `handleSend()` prevents empty text from reaching `buildPrompt()` |
| Mobile platform | Mobile check in `ChatSidebar` takes precedence over availability check; no input is rendered (REQ-CCS-020) |
| `availabilityChecked` is `false` | Template renders nothing (blank); prevents flashing wrong state during async `isAvailable()` call |
| `SETTINGS_VERSION_KEY` not provided | `inject(SETTINGS_VERSION_KEY, ref(0))` falls back to a local `ref(0)`; settings-version watching still works per-component |

---

## 15. Test scenarios

All scenarios are mapped to EARS-pattern requirements. Given/When/Then mirrors the structure used in `tests/`.

### 15.1 `buildPrompt()` — pure function

| ID | REQ | Scenario |
|---|---|---|
| TEST-CCS-BP-001 | REQ-CCS-025 | Given `contextFiles` is empty / When `buildPrompt('hello', [])` / Then `prompt === 'hello'` and `truncated === false` |
| TEST-CCS-BP-002 | REQ-CCS-025 | Given one context file with `path='a.md'`, `content='x'` / When `buildPrompt('hello', [file])` / Then `prompt` equals the exact preamble+section+separator+userText string |
| TEST-CCS-BP-003 | REQ-CCS-025 | Given multiple files / When assembled / Then files appear in input order, each wrapped in `---\nFile: <path>\n---\n<content>\n\n` |
| TEST-CCS-BP-004 | REQ-CCS-026 | Given auto + manualA + manualB where combined length exceeds `charBudget` / When `buildPrompt()` / Then manualB (last) is removed first; `truncated === true` |
| TEST-CCS-BP-005 | REQ-CCS-026 | Given auto + manualA + manualB where even `auto + manualA` exceeds budget / When `buildPrompt()` / Then both manual files are removed; auto file remains |
| TEST-CCS-BP-006 | REQ-CCS-027 | Given auto file with large content such that removing all manuals still leaves the prompt over budget / When `buildPrompt()` / Then auto file content is trimmed from the end; `truncated === true` |
| TEST-CCS-BP-007 | REQ-CCS-027 | Given auto file of 1 000 chars and budget pressure / When trimmed / Then auto file content in the prompt is at least `min(500, originalLength)` characters |
| TEST-CCS-BP-008 | NFR-CCS-008 | Given `userText.length > charBudget` with no context files / When `buildPrompt()` / Then `prompt.length <= charBudget` and `truncated === true` |
| TEST-CCS-BP-009 | NFR-CCS-001 | Given any inputs / When `buildPrompt()` is called / Then no I/O occurs and no external state is mutated |
| TEST-CCS-BP-010 | REQ-CCS-025 | Given `tokenCap: 100` / When `buildPrompt('hi', [file])` / Then `prompt.length <= 400` |

### 15.2 `MockClaudeCliPort`

| ID | REQ | Scenario |
|---|---|---|
| TEST-CCS-MOCK-001 | REQ-CCS-023 | Given default `MockClaudeCliPort` / When `isAvailable()` is awaited / Then it returns `false` |
| TEST-CCS-MOCK-002 | NFR-CCS-004 | Given `available = true` and `queryError = null` / When `query('p')` / Then returns `ok(cannedResponse)` and `queryLog` contains `'p'` |
| TEST-CCS-MOCK-003 | NFR-CCS-004 | Given `available = false` / When `query('p')` / Then returns `err` with `errorCode === 'NOT_INSTALLED'` and `queryLog` contains `'p'` |
| TEST-CCS-MOCK-004 | NFR-CCS-004 | Given `queryError = new ClaudeCliError('TIMEOUT', ...)` / When `query('p')` / Then returns that exact error |
| TEST-CCS-MOCK-005 | NFR-CCS-004 | Given `delayMs = 50` / When `query('p')` / Then elapsed time is at least 40 ms |
| TEST-CCS-MOCK-006 | REQ-CCS-022 | Given any configuration / When `startup()` / Then resolves without throwing |
| TEST-CCS-MOCK-007 | NFR-CCS-007 | Given any configuration / When `shutdown()` / Then does not throw |

### 15.3 `useChatStore()` — state and actions

| ID | REQ | Scenario |
|---|---|---|
| TEST-CCS-STORE-001 | REQ-CCS-005 | Given existing auto entry / When `setActiveFile(newFile)` / Then `contextFiles[0]` is replaced; `isAuto === true` forced |
| TEST-CCS-STORE-002 | REQ-CCS-006 | Given auto entry + manual entry / When `setActiveFile(null)` / Then auto entry removed; manual entry remains |
| TEST-CCS-STORE-003 | REQ-CCS-010 | Given `contextFiles` contains `path='notes.md'` / When `addContextFile({ path: 'notes.md', ... })` / Then `contextFiles.length` unchanged |
| TEST-CCS-STORE-004 | REQ-CCS-011 | Given manual chip exists / When `removeContextFile(path)` / Then entry removed |
| TEST-CCS-STORE-005 | REQ-CCS-014 | When `beginRequest()` / Then `status === 'loading'`, `response === null`, `errorType === null`, `truncated === false` |
| TEST-CCS-STORE-006 | REQ-CCS-013 | When `setResponse('text', true)` / Then `status === 'idle'`, `response === 'text'`, `truncated === true` |
| TEST-CCS-STORE-007 | REQ-CCS-016 | When `setError('timeout')` / Then `status === 'error'`, `errorType === 'timeout'`, `response === null` |
| TEST-CCS-STORE-008 | REQ-CCS-017 | Given `userText = 'q'` / When `setError('timeout')` / Then `userText` is still `'q'` |

### 15.4 `ChatSidebar` component

| ID | REQ | Scenario |
|---|---|---|
| TEST-CCS-004 | REQ-CCS-013 | Given `available = true` / When mounted / Then textarea and send button are rendered |
| TEST-CCS-012 | REQ-CCS-012 | Given a 210 000-character file as the auto context and `available = true` / When send clicked / Then trim notice `[data-testid="chat-response-trim-notice"]` is visible |
| TEST-CCS-013 | REQ-CCS-013 | Given `available = true`, `cannedResponse = 'Hello world'` / When send clicked with non-empty text / Then `queryLog.length === 1` and response text contains "Hello world" |
| TEST-CCS-014 | REQ-CCS-014 | Given `available = true`, `delayMs = 50` / When send clicked / Then before resolve: `[data-testid="chat-response-loading"]` exists and send button is disabled |
| TEST-CCS-015 | REQ-CCS-015 | Given `available = true` and `store.userText = ''` / When send clicked / Then `queryLog.length === 0` |
| TEST-CCS-016a | REQ-CCS-016 | Given `queryError = ClaudeCliError('TIMEOUT', ...)` / When send clicked / Then error element contains "That took too long" |
| TEST-CCS-016b | REQ-CCS-017 | Given `queryError = ClaudeCliError('TIMEOUT', ...)` and text = "my question" / When send clicked / Then `store.userText === 'my question'` |
| TEST-CCS-018 | REQ-CCS-018 | Given `available = false` and `apiKey = ''` / When mounted / Then degraded heading contains "Chat is not set up yet" and settings link is visible; textarea absent |
| TEST-CCS-019 | REQ-CCS-019 | Given `available = false` and `apiKey = 'sk-ant-not-empty'` / When mounted / Then degraded heading contains "AI assistant is not available right now" |
| TEST-CCS-020 | REQ-CCS-020 | Given `IS_MOBILE_KEY = true` / When mounted / Then degraded heading contains "Chat is available on desktop only" and textarea absent |

### 15.5 Additional integration scenarios (EARS-mapped)

| ID | REQ | EARS pattern | Scenario |
|---|---|---|---|
| TEST-CCS-INT-001 | REQ-CCS-003 | event-driven | WHEN `onLayoutReady` fires / THEN `ClaudeCliAdapter.startup()` is called; `onload()` has already completed |
| TEST-CCS-INT-002 | REQ-CCS-004 | event-driven | WHEN `onunload()` executes / THEN `shutdown()` is called; `_sdkReady` and `_available` are `false` |
| TEST-CCS-INT-003 | REQ-CCS-007 | event-driven | WHEN ribbon icon clicked / THEN `activateView()` opens the Specorator leaf |
| TEST-CCS-INT-004 | REQ-CCS-008 | event-driven | WHEN `obsidian://specorator?action=open-chat` received / THEN `activateView()` and `navigateTo('/chat')` are called |
| TEST-CCS-INT-005 | REQ-CCS-009 | event-driven | WHEN right-click "Add to chat context" clicked / THEN `addContextFile({ path, label, isAuto: false })` called; duplicate guard active |
| TEST-CCS-INT-006 | REQ-CCS-024 | event-driven | WHEN API key saved in settings / THEN `bumpSettingsVersion()` called on all open `SpecoratorView` leaves |
| TEST-CCS-INT-007 | REQ-CCS-001 | ubiquitous | GIVEN settings tab rendered / WHEN Anthropic key field inspected / THEN `inputEl.type === 'password'` and `autocomplete === 'off'` |
| TEST-CCS-INT-008 | REQ-CCS-002 | event-driven | WHEN user saves `'  sk-ant-abc  '` in the key field / THEN stored value is `'sk-ant-abc'` |

---

## 16. Requirements coverage

| REQ ID | Covered in spec |
|---|---|
| REQ-CCS-001 | §8.3 (settings field), §14 (edge cases), §15.5 TEST-CCS-INT-007 |
| REQ-CCS-002 | §8.3 `onChange` trim, §15.5 TEST-CCS-INT-008 |
| REQ-CCS-003 | §5.2 `startup()` deferred, §9.1 `onLayoutReady`, §15.5 TEST-CCS-INT-001 |
| REQ-CCS-004 | §5.5 `shutdown()`, §9.2, §15.5 TEST-CCS-INT-002 |
| REQ-CCS-005 | §4.2 `setActiveFile()`, §7.2 `ChatSidebar` mount, §15.3 TEST-CCS-STORE-001 |
| REQ-CCS-006 | §4.2 `setActiveFile(null)`, §14, §15.3 TEST-CCS-STORE-002 |
| REQ-CCS-007 | §9.1 ribbon + command, §15.5 TEST-CCS-INT-003 |
| REQ-CCS-008 | §9.1 URI handler, §15.5 TEST-CCS-INT-004 |
| REQ-CCS-009 | §4.2 `addContextFile()`, §9.1 file-menu, §15.5 TEST-CCS-INT-005 |
| REQ-CCS-010 | §4.2 `addContextFile()` duplicate guard, §15.3 TEST-CCS-STORE-003 |
| REQ-CCS-011 | §4.2 `removeContextFile()`, §15.3 TEST-CCS-STORE-004 |
| REQ-CCS-012 | §7.2 `responseState` computed, §7.4 `ChatResponse` trimmed-success, §15.4 TEST-CCS-012 |
| REQ-CCS-013 | §7.2 `handleSend()` success path, §15.4 TEST-CCS-013 |
| REQ-CCS-014 | §4.2 `beginRequest()`, §7.3 disabled props, §15.4 TEST-CCS-014 |
| REQ-CCS-015 | §7.2 `handleSend()` guard, §15.4 TEST-CCS-015 |
| REQ-CCS-016 | §7.2 `handleSend()` error path, §7.4 `ChatResponse` error states, §15.4 TEST-CCS-016a |
| REQ-CCS-017 | §4.2 `setError()` (no userText clear), §15.3 TEST-CCS-STORE-008, §15.4 TEST-CCS-016b |
| REQ-CCS-018 | §7.2 template branching no-key, §15.4 TEST-CCS-018 |
| REQ-CCS-019 | §7.2 template branching SDK-unavailable, §15.4 TEST-CCS-019 |
| REQ-CCS-020 | §7.2 template branching mobile, §15.4 TEST-CCS-020 |
| REQ-CCS-021 | §2.4 interface definition (no forbidden imports) |
| REQ-CCS-022 | §5.4 `isAvailable()` never throws, §15.2 TEST-CCS-MOCK-001 |
| REQ-CCS-023 | §6.2 `isAvailable()` default false, §15.2 TEST-CCS-MOCK-001 |
| REQ-CCS-024 | §8.3 `_bumpAllViews()`, §9.3 `bumpSettingsVersion()`, §15.5 TEST-CCS-INT-006 |
| REQ-CCS-025 | §3.4 prompt format, §15.1 TEST-CCS-BP-001, TEST-CCS-BP-002 |
| REQ-CCS-026 | §3.5 algorithm step 5, §15.1 TEST-CCS-BP-004, TEST-CCS-BP-005 |
| REQ-CCS-027 | §3.5 algorithm step 7, §15.1 TEST-CCS-BP-006, TEST-CCS-BP-007 |
| REQ-CCS-028 | §8.3 settings description text |
| NFR-CCS-001 | §3.7 no side effects, §15.1 TEST-CCS-BP-009 |
| NFR-CCS-002 | §9.1 `onLayoutReady` deferred startup, §15.5 TEST-CCS-INT-001 |
| NFR-CCS-003 | §5.6 `_clampTimeout()`, §2.3 `timeoutMs` range |
| NFR-CCS-004 | §6 `MockClaudeCliPort` configuration fields, §15.2 |
| NFR-CCS-005 | §11 observability table, §5.6 `_mapError()` |
| NFR-CCS-006 | §8.3 `type='password'`, `autocomplete='off'`, §15.5 TEST-CCS-INT-007 |
| NFR-CCS-007 | §5.5 `shutdown()` synchronous never-throws, §15.2 TEST-CCS-MOCK-007 |
| NFR-CCS-008 | §3.5 algorithm step 8 hard-truncate, §15.1 TEST-CCS-BP-008 |
| NFR-CCS-009 | §7.2 focus management on mount (degraded heading focus) |
| NFR-CCS-010 | §7.6 `ContextFileChip` remove button `aria-label` |
| NFR-CCS-011 | §2.4 interface file imports only `Result` from domain |
| NFR-CCS-012 | §7 component copy verified: no "token", "context window", "system prompt", "Claude CLI", "SDK", "subprocess" in any user-visible string |
