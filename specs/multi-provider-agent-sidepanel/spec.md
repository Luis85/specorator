---
id: SPEC-MPS-001
title: "Multi-provider agent sidepanel — implementation specification"
feature: multi-provider-agent-sidepanel
stage: spec
status: complete
owner: architect
inputs:
  - PRD-MPS-001
  - DES-MPS-001
created: 2026-05-21
updated: 2026-05-21
---

# Implementation specification — Multi-provider agent sidepanel

This document is the implementation-ready contract for the multi-provider agent sidepanel. It defines exact interfaces, store shapes, persistence schemas, edge cases, and the nine workstreams the planner should decompose into RALPH-loop branches.

---

## 1. File structure

| File | Status | Purpose |
|---|---|---|
| `domain/ports/ChatTransportPort.ts` | Renamed from `ClaudeCliPort.ts` | Provider-agnostic chat transport port |
| `domain/ports/SecretStorePort.ts` | Modified | Add `SECRET_ID_CURSOR` |
| `domain/chat/ProviderSelection.ts` | New | `ProviderId`, `ProviderMode`, `ProviderSelection`, `isExplicit` |
| `domain/chat/ProviderRegistry.ts` | New | `ProviderRegistry`, `ProviderEntry` interfaces |
| `domain/chat/ProviderCapabilities.ts` | New | `ProviderCapabilities` shape |
| `domain/chat/ChatThreadRecord.ts` | Modified | `transport` becomes `{ provider, mode }`; adds `title`, `forkParent` |
| `domain/settings/PluginSettings.ts` | Modified | Remove `transportKind`; add `providerSelection`, `cursorCliPath`, `cursorApiPreview`, `autoPreferProvider`, `providerModel`, `chatTabCap` |
| `domain/chat/ApprovalRule.ts` | New | Persistent approval rule shape |
| `application/migration/migrateProviderSelection.ts` | New | Settings + threads one-shot migration |
| `application/chat/ChatTurnOrchestrator.ts` | Modified | Consume `(provider, mode)` from `chatProviderStore`; thread `planMode`, `instructionSuffix`, `attachments` into `ChatTransportStreamOptions` |
| `infrastructure/obsidian/ClaudeApiAdapter.ts` | Renamed from `ClaudeCliAdapter.ts` | No behavioural change |
| `infrastructure/obsidian/ClaudeSubprocessAdapter.ts` | Modified (rename usages only) | No behavioural change |
| `infrastructure/cursor/CursorApiAdapter.ts` | New | Cursor HTTP/SSE adapter |
| `infrastructure/obsidian/CursorCliAdapter.ts` | New | Cursor CLI subprocess adapter |
| `infrastructure/obsidian/CursorBinaryResolver.ts` | New | Sibling of `ClaudeBinaryResolver` |
| `infrastructure/obsidian/buildCursorSubprocessArgs.ts` | New | Pure arg-builder for `cursor-agent` |
| `infrastructure/mock/MockCursorApiAdapter.ts` | New | Test/dev stub |
| `infrastructure/mock/MockCursorCliAdapter.ts` | New | Test/dev stub |
| `infrastructure/mock/DegradedTransportPort.ts` | Renamed from existing degraded port | Same behaviour, renamed |
| `infrastructure/bridge/ports.ts` | Modified | `CHAT_TRANSPORT_PORT` injection key; new `PROVIDER_REGISTRY_KEY` |
| `infrastructure/obsidian/ObsidianSecretStoreAdapter.ts` | Modified | Reads/writes `SECRET_ID_CURSOR` (no code change beyond ID const usage) |
| `plugin/transport/TransportSelector.ts` | Modified | 15-row truth table per design §C4 |
| `plugin/transport/buildProviderRegistry.ts` | New | Wiring layer — turns adapters into `ProviderEntry` records |
| `plugin/main.ts` | Modified | Migration call; four adapters startup; `switch-provider` command |
| `plugin/settings/CursorSettingsSection.ts` | New | Cursor settings panel (delegates to `CursorKeyField.vue`) |
| `ui/composables/useChatTransportPort.ts` | Renamed from `useClaudeCliPort.ts` | Re-export shim kept for one release |
| `ui/composables/useProviderRegistry.ts` | New | `inject(PROVIDER_REGISTRY_KEY)` |
| `ui/stores/chatProviderStore.ts` | New | Active provider/mode + per-provider model |
| `ui/stores/chatInputModeStore.ts` | New | planMode / bangBashMode / instructionMode |
| `ui/stores/statusPanelStore.ts` | New | Todos + bash history + per-thread collapse |
| `ui/stores/attachmentsStore.ts` | New | Pending draft attachments |
| `ui/stores/approvalRulesStore.ts` | New | Persistent approval rules |
| `ui/components/agent/ThreadTabStrip.vue` | New | Multi-thread switcher |
| `ui/components/agent/ThreadTab.vue` | New | Single tab |
| `ui/components/agent/ProviderBadge.vue` | New | Active provider display + menu trigger |
| `ui/components/agent/ProviderMenu.vue` | New | Provider/mode dropdown |
| `ui/components/agent/ModelSelector.vue` | New | Per-provider model dropdown |
| `ui/components/agent/MessageActions.vue` | New | Per-message Copy / Edit / Regenerate row |
| `ui/components/agent/StatusPanel.vue` | New | Container for todos + bash |
| `ui/components/agent/TodoList.vue` | New | Todo rows |
| `ui/components/agent/BashHistoryList.vue` | New | Bash history rows |
| `ui/components/agent/AttachmentStrip.vue` | New | Attachment chips |
| `ui/components/agent/ModeIndicators.vue` | New | Mode indicator chips for ChatInput |
| `ui/components/agent/ApprovalCard.vue` | New | Inline approval card |
| `ui/components/settings/CursorKeyField.vue` | New | Cursor secret input with degraded-notice variant |
| `ui/i18n/locales/en.ts` | Modified | New `provider.*`, `thread.*`, `message.*`, `status.*`, `mode.*`, `attachment.*`, `approval.*` keys |
| `scripts/codemod/rename-claude-cli-port.mjs` | New | One-shot codemod for the rename |
| `eslint-rules/no-legacy-claude-cli-port-names.mjs` | New | Lint rule blocking re-introduction |

---

## 2. Domain types — exact signatures

### 2.1 `ChatTransportPort`

```typescript
// src/domain/ports/ChatTransportPort.ts

export type ChatTransportErrorCode =
  | 'NOT_INSTALLED'
  | 'API_KEY_MISSING'
  | 'TIMEOUT'
  | 'QUERY_FAILED'
  | 'CLI_LAUNCH_FAILED'
  | 'ATTACHMENT_TOO_LARGE'    // NEW (REQ-MPS-044)
  | 'PROVIDER_UNAVAILABLE'    // NEW — for cursor preview disabled

export class ChatTransportError extends Error {
  public readonly name = 'ChatTransportError'
  constructor(
    public readonly errorCode: ChatTransportErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export interface ChatTransportAttachment {
  readonly kind: 'image' | 'file' | 'vault'
  readonly mimeType: string
  readonly bytes: ArrayBuffer | null     // null for vault entries — resolved by adapter
  readonly path: string | null           // vault-relative when kind === 'vault'
  readonly label: string                 // filename
  readonly byteLength: number            // for size cap enforcement (REQ-MPS-044)
}

export interface ChatTransportQueryOptions {
  readonly timeoutMs?: number
  readonly maxTurns?: number
  readonly systemPromptSuffix?: string
  readonly resumeSessionId?: SessionId
  readonly onSessionId?: (sessionId: SessionId) => void

  /** NEW — REQ-MPS-036/037. Plan-mode hint. */
  readonly planMode?: boolean

  /** NEW — REQ-MPS-040. Selected model id. */
  readonly model?: string

  /** NEW — REQ-MPS-042/043. Attachments for this turn. */
  readonly attachments?: ReadonlyArray<ChatTransportAttachment>

  /**
   * NEW — REQ-MPS-045. Per-turn approval resolver. The adapter invokes this
   * when the underlying provider requests permission. The resolver returns
   * `true` to allow, `false` to deny. Decision rule (`'allow-once' | 'always'`)
   * is handled at the UI layer; the adapter only sees a boolean.
   */
  readonly approveTool?: (request: ChatTransportApprovalRequest) => Promise<boolean>
}

export interface ChatTransportApprovalRequest {
  readonly tool: 'Write' | 'Edit' | 'Bash' | string
  readonly scope: string             // path glob or command name
  readonly previewText: string | null
}

export interface ChatTransportStreamOptions extends ChatTransportQueryOptions {
  readonly signal?: AbortSignal
}

export type StreamDelta =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'thinking'; readonly text: string }
  | { readonly type: 'session-id'; readonly sessionId: SessionId }
  | { readonly type: 'tool-use-start'; readonly blockId: string; readonly toolName: string; readonly inputJson: string }
  | { readonly type: 'tool-use-input-delta'; readonly blockId: string; readonly inputJson: string }
  | { readonly type: 'tool-use-stop'; readonly blockId: string }
  | { readonly type: 'tool-result'; readonly blockId: string; readonly output: string; readonly exitCode: number | null }   // NEW — REQ-MPS-031 needs exit code
  | { readonly type: 'todo-update'; readonly todos: ReadonlyArray<TodoEntry> }                                              // NEW — REQ-MPS-030
  | { readonly type: 'citation'; readonly filePath: string; readonly lineStart: number; readonly lineEnd: number }          // NEW — REQ-MPS-017
  | { readonly type: 'compact-boundary'; readonly reason?: string }
  | { readonly type: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly error: ChatTransportError }

export interface TodoEntry {
  readonly id: string
  readonly title: string
  readonly status: 'pending' | 'in-progress' | 'done'
  readonly description: string | null
}

export interface ChatTransportPort {
  isAvailable(): Promise<boolean>
  queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta>
  runStructured?(prompt: string, options: StructuredCallOptions): Promise<Result<StructuredRawResult, ChatTransportError>>
}
```

**Before/after table for the rename:**

| Before | After |
|---|---|
| `ClaudeCliPort` | `ChatTransportPort` |
| `ClaudeCliError` | `ChatTransportError` |
| `ClaudeCliErrorCode` | `ChatTransportErrorCode` |
| `ClaudeCliQueryOptions` | `ChatTransportQueryOptions` |
| `ClaudeCliStreamOptions` | `ChatTransportStreamOptions` |

`StreamDelta` additions (purely additive — no existing variant changes shape): `tool-result`, `todo-update`, `citation`.

### 2.2 `ProviderSelection` & companions

```typescript
// src/domain/chat/ProviderSelection.ts

export type ProviderId = 'claude' | 'cursor'
export type ProviderMode = 'api' | 'cli'

export type ExplicitSelection = {
  readonly provider: ProviderId
  readonly mode: ProviderMode
}

export type ProviderSelection =
  | ExplicitSelection
  | { readonly forced: 'auto' | 'degraded' }

export function isExplicit(s: ProviderSelection): s is ExplicitSelection {
  return (s as ExplicitSelection).provider !== undefined
}

export function selectionKey(s: ProviderSelection): string {
  return isExplicit(s) ? `${s.provider}:${s.mode}` : s.forced
}
```

### 2.3 `ProviderRegistry`

```typescript
// src/domain/chat/ProviderRegistry.ts

import type { SlashCommand } from './SlashCommand'
import type { ProviderId, ProviderMode } from './ProviderSelection'
import type { ProviderCapabilities } from './ProviderCapabilities'

export interface ProviderEntry {
  readonly id: ProviderId
  readonly label: string
  readonly capabilities: ProviderCapabilities
  /** Empty when no provider-specific slash commands are exposed. */
  slashCommands(): ReadonlyArray<SlashCommand>
}

export interface ProviderRegistry {
  listProviders(): ReadonlyArray<ProviderEntry>
  getProvider(id: ProviderId): ProviderEntry | undefined
  getCapabilities(id: ProviderId): ProviderCapabilities | undefined
}
```

### 2.4 `ProviderCapabilities`

```typescript
// src/domain/chat/ProviderCapabilities.ts

import type { ProviderMode } from './ProviderSelection'

export interface ProviderCapabilities {
  readonly modes: ReadonlyArray<ProviderMode>
  readonly models: ReadonlyArray<{ readonly id: string; readonly label: string }>
  readonly supportsStreaming: boolean
  readonly supportsTools: boolean
  readonly supportsThinking: boolean
  readonly supportsPlanMode: boolean
  readonly supportsAttachments: ReadonlyArray<'image' | 'file'>
  readonly supportsSessionResume: boolean
  readonly modeDisabledReason: Readonly<Record<ProviderMode, string | null>>
}
```

### 2.5 `ApprovalRule`

```typescript
// src/domain/chat/ApprovalRule.ts

import type { ProviderId } from './ProviderSelection'

export interface ApprovalRule {
  readonly id: string                // uuid v4
  readonly providerId: ProviderId
  readonly tool: 'Write' | 'Edit' | 'Bash' | string
  readonly scope: string             // glob or command-name prefix
  readonly createdAt: string         // ISO 8601 UTC
}
```

### 2.6 `ChatThreadRecord` (extended)

```typescript
export interface ChatThreadRecord {
  readonly threadId: string
  readonly sessionId: SessionId | null
  readonly feature: string | null
  readonly logPath: string
  /** Replaces the legacy 'api-key' | 'subscription' union. */
  readonly transport: { readonly provider: ProviderId; readonly mode: ProviderMode }
  readonly title: string            // '' until first user message or rename
  readonly forkParent: string | null
  readonly createdAt: string
  readonly lastUsedAt: string
}
```

### 2.7 `PluginSettings` (delta)

Removed: `transportKind`.

Added:

```typescript
readonly providerSelection: ProviderSelection
readonly cursorCliPath: string
readonly cursorApiPreview: boolean
readonly autoPreferProvider: ProviderId
readonly providerModel: Readonly<Record<ProviderId, string>>
readonly chatTabCap: number
```

Defaults:

```typescript
providerSelection: { forced: 'auto' },
cursorCliPath: '',
cursorApiPreview: false,
autoPreferProvider: 'claude',
providerModel: { claude: 'claude-sonnet-4', cursor: 'cursor-default' },
chatTabCap: 10,
```

---

## 3. Migration — exact contract

```typescript
// src/application/migration/migrateProviderSelection.ts

export interface RawStoredData {
  // existing
  readonly settings?: Record<string, unknown>
  readonly chatThreads?: Record<string, Record<string, unknown>>
}

export interface MigrationResult {
  readonly data: RawStoredData
  readonly migrated: boolean
  readonly errors: ReadonlyArray<string>
}

export function migrateProviderSelection(input: RawStoredData): MigrationResult
```

Contract:

- **Pure.** No I/O.
- **Idempotent.** `migrate(migrate(x).data).migrated === false`.
- **Settings translate:** `settings.transportKind` per REQ-MPS-004 table, then **delete** the key.
- **Threads translate:** for every value in `chatThreads`:
  - if `transport === 'api-key'` → `transport = { provider: 'claude', mode: 'api' }`
  - if `transport === 'subscription'` → `transport = { provider: 'claude', mode: 'cli' }`
  - if `transport` is already an object → leave as-is
  - default missing `title` to `''`, missing `forkParent` to `null`
- **Errors:** never throw. Capture per-record validation issues in `errors`; the caller decides whether to discard malformed records.

---

## 4. `TransportSelector` reshape — exact signature

```typescript
// src/plugin/transport/TransportSelector.ts

export interface ProviderRouterDeps {
  readonly providers: {
    readonly claude: { readonly api: ChatTransportPort; readonly cli: ChatTransportPort }
    readonly cursor: { readonly api: ChatTransportPort; readonly cli: ChatTransportPort }
  }
  readonly degradedPort: ChatTransportPort
  readonly availability: {
    readonly claudeApiKeyPresent: boolean
    readonly claudeCliResolved: boolean
    readonly cursorApiKeyPresent: boolean
    readonly cursorCliResolved: boolean
    readonly cursorApiPreviewEnabled: boolean
    readonly secretStoreAvailable: boolean
  }
  readonly autoPreferProvider: ProviderId
}

export type TransportResolution =
  | { readonly resolved: ExplicitSelection; readonly port: ChatTransportPort }
  | { readonly resolved: 'degraded'; readonly port: ChatTransportPort }

export function selectTransport(
  selection: ProviderSelection,
  deps: ProviderRouterDeps,
): TransportResolution
```

Behaviour: 15-row truth table from design §C4. The function is **synchronous, side-effect-free**, and forbidden from calling `port.isAvailable()` or `secretStore.getSecret()` directly — all decision inputs are projected by the plugin layer ahead of time (mirrors the existing selector's purity invariant).

---

## 5. Cursor API adapter — exact contract

```typescript
// src/infrastructure/cursor/CursorApiAdapter.ts

export interface CursorApiAdapterDeps {
  readonly secretStore: SecretStorePort
  readonly logger: LoggerPort
  readonly fetch: typeof globalThis.fetch       // injectable for tests
  readonly baseUrl: string                      // injected by buildProviderRegistry
  readonly getSettings: () => PluginSettings
}

export class CursorApiAdapter implements ChatTransportPort {
  constructor(deps: CursorApiAdapterDeps)

  isAvailable(): Promise<boolean>
  queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta>
  // runStructured intentionally NOT implemented in v1.
}
```

`isAvailable()` returns:

- `false` if `!deps.secretStore.available` (REQ-MPS-012)
- `false` if `!getSettings().cursorApiPreview` (REQ-MPS-014)
- `false` if `await secretStore.getSecret(SECRET_ID_CURSOR)` is null/empty
- `true` otherwise

`queryStream()` lifecycle:

1. Re-read key via `secretStore.getSecret(SECRET_ID_CURSOR)`. If null/empty → yield `{ type: 'error', error: ChatTransportError{API_KEY_MISSING} }` then `{ type: 'done' }`. Done.
2. Construct request body: `{ prompt, model: options.model, system_suffix: options.systemPromptSuffix, resume: options.resumeSessionId, plan_mode: options.planMode, attachments: serialiseAttachments(options.attachments) }`.
3. `POST ${baseUrl}/chat/stream` with `Authorization: Bearer ${key}`, `Accept: text/event-stream`.
4. Read the SSE stream; map each event type to a `StreamDelta` per design §C8.
5. On `signal.aborted` → abort the fetch, yield `{ type: 'error', error: ChatTransportError{QUERY_FAILED, 'aborted'} }`, then `{ type: 'done' }`.
6. Never throw. Every terminal condition is a delta.

Logging discipline: log only request URL path and HTTP status; **never log headers, body, or the key** (NFR-MPS-002).

Attachment size enforcement: before issuing the request, sum `attachment.byteLength` for non-vault entries. If > 5 MB total OR any single attachment > 5 MB → yield `{ type: 'error', error: ChatTransportError{ATTACHMENT_TOO_LARGE} }` (REQ-MPS-044). Vault attachments are resolved at adapter level via `VaultPort.readFile` to honour the cap.

---

## 6. Cursor CLI adapter — exact contract

```typescript
// src/infrastructure/obsidian/CursorCliAdapter.ts

export interface CursorCliAdapterDeps {
  readonly resolver: CursorBinaryResolver
  readonly subprocessLifecycle: SubprocessLifecycle
  readonly ndjson: NdjsonChannelFactory
  readonly getSettings: () => PluginSettings
  readonly logger: LoggerPort
}

export class CursorCliAdapter implements ChatTransportPort {
  constructor(deps: CursorCliAdapterDeps)

  isAvailable(): Promise<boolean>
  queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta>
}
```

`isAvailable()` short-circuits on the cached `cliResolved` flag (same pattern as `ClaudeSubprocessAdapter`).

`queryStream()`:

1. Resolve binary via `getSettings().cursorCliPath || (await resolver.resolve())`. If null → `{ type: 'error', error: CLI_LAUNCH_FAILED }` + `done`.
2. Build args via `buildCursorSubprocessArgs(prompt, options)`.
3. Spawn through `subprocessLifecycle.spawn(binary, args, { env: redactedEnv })`.
4. Pipe stdout through `NdjsonChannel`; map each NDJSON event to a `StreamDelta`.
5. Honour `signal.aborted` → SIGTERM the process; on grace period expiry, SIGKILL.
6. Never throw.

`buildCursorSubprocessArgs(prompt, options): readonly string[]` — pure helper. Output (placeholder pending CQ-MPS-01):

```
['chat', '--stream-json', '--prompt', prompt,
 ...(options.model ? ['--model', options.model] : []),
 ...(options.planMode ? ['--mode', 'plan'] : []),
 ...(options.resumeSessionId ? ['--resume', options.resumeSessionId] : [])]
```

---

## 7. Store contracts

### 7.1 `chatProviderStore`

```typescript
export const useChatProviderStore = defineStore('chatProvider', () => {
  const activeSelection = ref<ProviderSelection>({ forced: 'auto' })
  const resolved = ref<TransportResolution['resolved']>('degraded')

  function setActiveSelection(s: ProviderSelection): void
  function setResolved(r: TransportResolution['resolved']): void

  return { activeSelection, resolved, setActiveSelection, setResolved }
})
```

`setActiveSelection` validates against `ProviderRegistry`: if `isExplicit(s)` and the provider/mode is unknown, the call throws synchronously (caught by callers as a programmer error — UI never permits invalid input).

### 7.2 `chatInputModeStore`

```typescript
export const useChatInputModeStore = defineStore('chatInputMode', () => {
  const planMode = ref<boolean>(false)
  const bangBashMode = ref<boolean>(false)
  const instructionMode = ref<boolean>(false)

  function togglePlanMode(): void
  function setFromDraft(text: string): void   // detects '!' / '#' prefixes
  function reset(): void

  return { planMode, bangBashMode, instructionMode, togglePlanMode, setFromDraft, reset }
})
```

Mode-prefix detection (`setFromDraft`):
- `text.startsWith('!')` → `bangBashMode = true, instructionMode = false`
- `text.startsWith('#')` → `instructionMode = true, bangBashMode = false`
- otherwise → both `false`

Plan mode is **independent** — toggled by `Shift+Tab`, not by prefix.

### 7.3 `statusPanelStore`

```typescript
export const useStatusPanelStore = defineStore('statusPanel', () => {
  const todos = ref<ReadonlyArray<TodoEntry>>([])
  const bashHistory = ref<ReadonlyArray<BashEntry>>([])
  const collapsedByThread = ref<Map<string, boolean>>(new Map())

  function setTodos(next: ReadonlyArray<TodoEntry>): void
  function appendBashEntry(entry: BashEntry): void   // enforces cap 50 FIFO
  function setCollapsed(threadId: string, value: boolean): void
  function resetForThread(threadId: string): void    // clears todos+bash on switch

  return { todos, bashHistory, collapsedByThread, ... }
})

interface BashEntry {
  readonly id: string
  readonly command: string
  readonly output: string
  readonly exitCode: number | null
  readonly timestamp: string    // ISO 8601 UTC
  readonly truncated: boolean   // true when output was > 200 lines
}
```

### 7.4 `attachmentsStore`

```typescript
export const useAttachmentsStore = defineStore('attachments', () => {
  const pending = ref<ReadonlyArray<ChatTransportAttachment>>([])

  function add(a: ChatTransportAttachment): Result<void, 'too-large'>
  function remove(label: string): void
  function clear(): void

  return { pending, add, remove, clear }
})
```

`add` rejects with `err('too-large')` when `a.byteLength > 5 * 1024 * 1024` (REQ-MPS-044). The UI maps this to a `NotificationPort.showWarning` with the i18n string `attachment.tooLarge`.

### 7.5 `approvalRulesStore`

```typescript
export const useApprovalRulesStore = defineStore('approvalRules', () => {
  const rules = ref<ReadonlyArray<ApprovalRule>>([])

  function addRule(rule: Omit<ApprovalRule, 'id' | 'createdAt'>): ApprovalRule
  function removeRule(id: string): void
  function findMatching(providerId: ProviderId, tool: string, scope: string): ApprovalRule | undefined

  return { rules, addRule, removeRule, findMatching }
})
```

`findMatching` semantics:
- Exact `(providerId, tool)` match.
- `scope` matches via glob (`*` and `**`). Bash tool: scope is interpreted as command-name prefix (e.g. `git` matches `git status`, `git push`).

---

## 8. UI component contracts

### 8.1 `ThreadTabStrip.vue`

| Prop | Type | Required | Notes |
|---|---|---|---|
| — | — | — | Reads `chatThreadsStore.chatThreads` + `activeThreadId` directly |

| Emit | Payload | Trigger |
|---|---|---|
| — | — | Mutations dispatched directly via store actions |

`data-testid`s:
- `thread-tab-strip` — container
- `thread-tab-{threadId}` — each tab
- `thread-tab-new` — new-thread button
- `thread-tab-active` — alias for the active tab

### 8.2 `ProviderBadge.vue` + `ProviderMenu.vue`

| Prop | Type | Default |
|---|---|---|
| `resolved` (Badge) | `TransportResolution['resolved']` | — |

Menu items dispatch `chatProviderStore.setActiveSelection`. Disabled rows carry `aria-disabled="true"` and `title` with the `modeDisabledReason` from `ProviderCapabilities`.

`data-testid`s:
- `provider-badge`
- `provider-menu`
- `provider-menu-item-{provider}-{mode}`

### 8.3 `MessageActions.vue`

| Prop | Type | Required |
|---|---|---|
| `messageId` | `string` | yes |
| `role` | `'user' \| 'assistant'` | yes |
| `isLatest` | `boolean` | yes |

| Emit | Payload | Trigger |
|---|---|---|
| `copy` | `{ messageId }` | Copy button |
| `regenerate` | `{ messageId }` | Regenerate (only when `role === 'assistant' && isLatest`) |
| `edit` | `{ messageId }` | Edit (only when `role === 'user'`) |

Disabled state: `streamingTurnStore.isStreaming === true` → Edit and Regenerate disabled; Copy stays enabled (REQ-MPS-029).

`data-testid`s: `message-action-copy`, `message-action-edit`, `message-action-regenerate`.

### 8.4 `ApprovalCard.vue`

| Prop | Type | Required |
|---|---|---|
| `request` | `ChatTransportApprovalRequest` | yes |
| `providerId` | `ProviderId` | yes |

| Emit | Payload |
|---|---|
| `decision` | `{ kind: 'deny' \| 'allow-once' \| 'always' }` |

Behaviour: on `always`, also dispatches `approvalRulesStore.addRule({ providerId, tool: request.tool, scope: request.scope })` before emitting.

`data-testid`s: `approval-card`, `approval-action-deny`, `approval-action-allow-once`, `approval-action-always-allow`.

### 8.5 `CursorKeyField.vue`

| Prop | Type | Required |
|---|---|---|
| — | — | reads `secretStore.available` and `settings.cursorApiPreview` directly |

Two variants:
- **Available:** password input with `autocomplete="off"`; saves via `secretStore.setSecret`; description includes `provider.cursor.keyDescription`.
- **Unavailable:** notice block with `provider.cursor.unavailable.heading` / `.body`; no input rendered.

`data-testid`s: `cursor-key-field`, `cursor-key-input`, `cursor-key-unavailable-notice`.

### 8.6 `StatusPanel.vue` & children

`StatusPanel.vue`:
- `data-testid="status-panel"`
- `aria-expanded` on the header chevron button
- collapse state read/written via `statusPanelStore.collapsedByThread` keyed on `chatThreadsStore.activeThreadId`

`TodoList.vue`:
- `data-testid="todo-list"`; each row `data-testid="todo-row-{id}"`

`BashHistoryList.vue`:
- `data-testid="bash-history"`; each row `data-testid="bash-row-{id}"`
- chevron `data-testid="bash-row-toggle-{id}"` with `aria-controls="bash-row-body-{id}"`

---

## 9. Plugin wiring (main.ts pseudocode)

```typescript
async onload() {
  await loadDataIntoCore()
  const stored = (await loadData()) ?? {}

  // REQ-MPS-004 / REQ-MPS-005 — migration
  const migration = migrateProviderSelection(stored as RawStoredData)
  if (migration.migrated) {
    await saveData(migration.data)
  }

  // Adapters
  const claudeApi = new ClaudeApiAdapter(claudeApiDeps)
  const claudeCli = new ClaudeSubprocessAdapter(claudeCliDeps)
  const cursorApi = new CursorApiAdapter(cursorApiDeps)
  const cursorCli = new CursorCliAdapter(cursorCliDeps)
  const degraded  = new DegradedTransportPort()

  // Registry
  const providerRegistry = buildProviderRegistry({ claudeApi, claudeCli, cursorApi, cursorCli, getSettings })

  // Wire the selector
  const routerDeps: ProviderRouterDeps = {
    providers: { claude: { api: claudeApi, cli: claudeCli }, cursor: { api: cursorApi, cli: cursorCli } },
    degradedPort: degraded,
    availability: projectAvailability(...),    // recomputed after bumpSettingsVersion()
    autoPreferProvider: settings.autoPreferProvider,
  }

  this.specoratorView.provide(CHAT_TRANSPORT_PORT, /* late-bound through TransportSelector */)
  this.specoratorView.provide(PROVIDER_REGISTRY_KEY, providerRegistry)

  this.app.workspace.onLayoutReady(() => {
    void claudeApi.startup()
    void claudeCli.startup()
    void cursorApi.startup()
    void cursorCli.startup()
  })

  // Commands
  this.addCommand({
    id: 'switch-provider',
    name: 'Switch chat provider',
    callback: () => this.specoratorView.openProviderMenu(),
  })

  // URI handler additions
  this.registerObsidianProtocolHandler('specorator', (params) => {
    if (params.action === 'open-chat' && params.provider) {
      const provider = parseProviderId(params.provider)   // validates 'claude' | 'cursor'
      if (provider) chatProviderStore.setActiveSelection({ provider, mode: 'api' })
    }
    // delegate to existing handler
  })
}
```

---

## 10. Edge cases & error paths

| Case | Behaviour |
|---|---|
| User switches to Cursor mid-stream | `chatProviderStore.setActiveSelection` does **not** abort the in-flight turn. The current turn finishes on the previous provider; the next turn dispatches on the new one. |
| Cursor API key deleted while a Cursor turn is active | Adapter completes the turn (key was already read); next turn sees `isAvailable() === false` and the UI routes to degraded. |
| `Shift+Tab` pressed while textarea is focused but draft starts with `!` | Plan mode toggles; bang-bash mode remains as detected from the prefix. Modes compose. |
| User pastes an image > 5 MB | `attachmentsStore.add` returns `err('too-large')`; toast appears; nothing is added. |
| Migration encounters a `ChatThreadRecord` with `transport: 'cursor:api'` (impossible legacy value) | Recorded in `MigrationResult.errors`; record dropped; migration continues. |
| `cursor-agent` resolves to a relative path | `CursorBinaryResolver` rejects (mirror of REQ-ASM-005); `cursorCliResolved === false`. |
| User attempts to fork from an assistant message that has no preceding user message (e.g. very first message) | Fork action is disabled in the UI. |
| User deletes the active thread | After delete, `setActiveThreadId(mostRecentRemaining ?? null)`; if no threads remain, a fresh thread is created automatically. |
| Approval rule matches both `Write` and `Edit` for the same path | Rules are tool-scoped; a Write rule does not auto-approve an Edit. The UI lists them separately. |
| Cursor SSE stream closes without `done` | Adapter synthesises `{ type: 'error', error: QUERY_FAILED, message: 'stream closed unexpectedly' }` then `{ type: 'done' }`. |
| Two simultaneous turns on different threads | Each thread runs its own `ChatTurnOrchestrator` instance; turns do not share state. |
| User exits Obsidian during streaming | `onunload` aborts all in-flight `AbortController`s; adapters' `shutdown()` is synchronous (NFR-CCS-007 / NFR-MPS-007). |

---

## 11. Test scenarios

The planner should derive at least one task per scenario.

| ID | Scenario | Verifies |
|---|---|---|
| TST-MPS-01 | Migration: legacy `'subscription'` → `{ provider: 'claude', mode: 'cli' }`; `transportKind` key absent after | REQ-MPS-004 |
| TST-MPS-02 | Migration: idempotency — second run returns `migrated: false` | NFR-MPS-006 |
| TST-MPS-03 | Migration: legacy `ChatThreadRecord.transport: 'api-key'` translated | REQ-MPS-005 |
| TST-MPS-04 | Selector R6: cursor/api with all flags green resolves to `cursor/api` | REQ-MPS-007 |
| TST-MPS-05 | Selector R7: cursor/api with `secretStoreAvailable === false` resolves to degraded | REQ-MPS-012 |
| TST-MPS-06 | Selector R11: auto + `autoPreferProvider === 'cursor'` + cursor key present + preview on | REQ-MPS-008 |
| TST-MPS-07 | `CursorApiAdapter.isAvailable()` false when preview flag off (even with key) | REQ-MPS-014 |
| TST-MPS-08 | `CursorApiAdapter` reads key at query time, not construction | REQ-MPS-013 |
| TST-MPS-09 | `data.json` snapshot after Cursor key save contains zero matches for the key value | NFR-MPS-001 |
| TST-MPS-10 | Tab strip renders 3 threads ordered by `lastUsedAt` desc | REQ-MPS-018 |
| TST-MPS-11 | Rename inline persists across reload | REQ-MPS-020 |
| TST-MPS-12 | Delete thread invokes Obsidian Modal; on confirm, log file removed via `VaultPort.deleteFile` | REQ-MPS-022 |
| TST-MPS-13 | Fork from message index 4 creates a new thread with messages 0..4 and `forkParent` set | REQ-MPS-023 |
| TST-MPS-14 | Tab cap: 11th create attempt triggers warning and is rejected | REQ-MPS-025 |
| TST-MPS-15 | Copy button writes message body to `navigator.clipboard` | REQ-MPS-026 |
| TST-MPS-16 | Regenerate latest assistant message — only the last message is removed and re-streamed | REQ-MPS-027 |
| TST-MPS-17 | Edit-and-resend truncates transcript correctly | REQ-MPS-028 |
| TST-MPS-18 | Action buttons disabled while streaming (Edit, Regenerate); Copy stays enabled | REQ-MPS-029 |
| TST-MPS-19 | TodoWrite delta updates `statusPanelStore.todos` | REQ-MPS-030 |
| TST-MPS-20 | 51st bash entry drops the first; `bashHistory.length === 50` | REQ-MPS-031 |
| TST-MPS-21 | Status panel collapse state persists per thread switch | REQ-MPS-033 |
| TST-MPS-22 | `Shift+Tab` toggles plan mode and announces via aria-live | REQ-MPS-036, NFR-MPS-010 |
| TST-MPS-23 | Plan mode forwards `--permission-mode plan` to Claude CLI args | REQ-MPS-037 |
| TST-MPS-24 | `!ls` draft sets `bangBashMode`; sent verbatim; no OS dispatch | REQ-MPS-038, NG7 |
| TST-MPS-25 | `#be concise` draft routes to `systemPromptSuffix` and is styled as a system note | REQ-MPS-039 |
| TST-MPS-26 | Model selector hidden for providers with empty model list | REQ-MPS-041 |
| TST-MPS-27 | Paste image creates attachment chip; on send adapter receives the attachment | REQ-MPS-042 |
| TST-MPS-28 | Drag-drop vault file → adapter receives `{ kind: 'vault', path }`; content resolved by adapter | REQ-MPS-043 |
| TST-MPS-29 | 6 MB paste rejected with notice | REQ-MPS-044 |
| TST-MPS-30 | Approval card "Always allow" persists rule; second matching request auto-resolves | REQ-MPS-046 |
| TST-MPS-31 | Approval rules listed and removable in Settings | REQ-MPS-047 |
| TST-MPS-32 | Provider switch mid-stream: in-flight turn finishes on previous provider | edge-case row 1 |
| TST-MPS-33 | All REQ-CCS-001..028 acceptance tests pass under `provider='claude'` (regression suite) | G7 |
| TST-MPS-34 | Lint: no production file imports `ClaudeCliPort` identifier | REQ-MPS-001 |
| TST-MPS-35 | Lint: `ChatTransportPort.ts` does not import `obsidian` / `@anthropic-ai/claude-agent-sdk` / `node:child_process` | NFR-MPS-012 |

---

## 12. Workstreams (planner decomposition)

The planner should produce nine parallelisable workstreams. Ordering and dependencies are captured below.

| # | Workstream | Depends on | Key REQ IDs |
|---|---|---|---|
| WS-1 | Rename `ClaudeCliPort` → `ChatTransportPort` + codemod + ESLint rule | — (lands first) | REQ-MPS-001, 002, 009; NFR-MPS-012 |
| WS-2 | `ProviderSelection` + `ProviderRegistry` + `ProviderCapabilities` + migration | WS-1 | REQ-MPS-003, 004, 005, 006; NFR-MPS-006 |
| WS-3 | `TransportSelector` reshape + `buildProviderRegistry` + plugin wiring updates | WS-2 | REQ-MPS-007, 008 |
| WS-4 | Cursor API adapter + `SECRET_ID_CURSOR` + `CursorKeyField.vue` + settings UX + degraded notice | WS-3 | REQ-MPS-010..014, 017; NFR-MPS-001..003, 013 |
| WS-5 | Cursor CLI adapter + `CursorBinaryResolver` + `buildCursorSubprocessArgs` | WS-3 | REQ-MPS-015, 016 |
| WS-6 | Multi-thread switcher UI + `ChatThreadRecord` extensions + active-thread persistence | WS-2 (for record shape) | REQ-MPS-018..025 |
| WS-7 | Per-message actions + transcript truncation + regenerate/edit flows | WS-6 | REQ-MPS-026..029 |
| WS-8 | Status panel + `statusPanelStore` + tool-result/todo-update delta wiring + modeline modes + model selector + attachments | WS-2 | REQ-MPS-030..044 |
| WS-9 | Inline approvals + `approvalRulesStore` + Settings list | WS-2 | REQ-MPS-045..047 |

WS-1 → WS-2 → WS-3 are sequential; WS-4..WS-9 fan out from WS-3 in parallel. The 9 workstreams map to nine draft PRs per the `/issue:breakdown` conductor.

---

## 13. Open items (parking lot)

Routed to `workflow-state.md` open clarifications. Restated here for the planner:

- **CQ-MPS-01** — Cursor public HTTP API shape. Until confirmed, treat `CursorApiAdapter` placeholder URL constants as injected via `buildProviderRegistry` and feature-flagged via `cursorApiPreview`. Open a research-spike task (T-MPS-RS-01) at the start of WS-4.
- **CQ-MPS-02** — Legacy `/chat` route in `SpecoratorView`. Not modified by this feature; tracked separately.
- **CQ-MPS-03** — Schema-version field on `_storedData`. Recommendation: defer; in-place migration is sufficient per §3.

---

## 14. Quality gate

- [x] Every REQ has a matching subsection or test scenario.
- [x] Every new interface has an exact TypeScript signature.
- [x] Persistence shapes are explicit (10.x — `ChatThreadRecord`, `ApprovalRule`, `PluginSettings` delta).
- [x] Migration is pure, idempotent, and exhaustively defined.
- [x] Test scenarios cover ≥ 1 case per REQ (TST-MPS-01..35).
- [x] Workstreams partition cleanly; dependencies stated.
- [x] Edge cases enumerated (§10).
- [x] No open clarifications block spec acceptance.
