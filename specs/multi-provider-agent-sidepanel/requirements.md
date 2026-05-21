---
id: PRD-MPS-001
title: "Multi-provider agent sidepanel — Claudian parity + Cursor provider"
stage: requirements
feature: multi-provider-agent-sidepanel
status: accepted
owner: pm
inputs:
  - IDEA-MPS-001
  - PRD-CCS-001
created: 2026-05-21
updated: 2026-05-21
---

# PRD — Multi-provider agent sidepanel

## Summary

Specorator's chat sidepanel reaches feature parity with the Claudian Obsidian plugin and adds **Cursor** as a second provider alongside Claude. The provider boundary is formalised by renaming `ClaudeCliPort` → `ChatTransportPort`, replacing the flat `TransportKind` string with a `{ provider, mode }` discriminator, and introducing a `ProviderRegistry` that exposes runtime capabilities. Cursor's API key lives in Obsidian's first-party Secret Storage (`SecretStorePort`, `SECRET_ID_CURSOR`); no provider key is ever written to `data.json`. The chat sidepanel gains: multi-thread switcher with rename/delete/fork; per-message actions (copy, regenerate, edit-and-resend); a persistent status panel for todos and bash output; modeline modes (plan, bang-bash, instruction); a per-provider model selector; inline approval cards with persistent rules; and inline file/image attachments. The existing `claude-cli-chat-sidebar` feature is preserved end-to-end — every REQ-CCS-NNN behaviour continues to hold for `provider='claude'` after the migration.

## Goals

- G1 — Provide Cursor as a first-class provider equivalent to Claude in the sidepanel UI.
- G2 — Store the Cursor API key exclusively via `SecretStorePort`; never in `data.json`; never synced.
- G3 — Rename `ClaudeCliPort` → `ChatTransportPort` to reflect its provider-agnostic role.
- G4 — Replace flat `TransportKind` with a discriminated `ProviderSelection` shape.
- G5 — Reach behavioural parity with Claudian on: multi-thread switcher, per-message actions, status panel, modeline modes, model selector, attachments, inline approvals.
- G6 — Migrate persisted `ChatThreadRecord.transport` from the legacy `'api-key' | 'subscription'` string to `{ provider, mode }` with no user-visible action required.
- G7 — Preserve every REQ-CCS-001..028 behaviour on the Claude provider path post-migration.

## Non-goals

- NG1 — Codex, Opencode, and ACP providers (deferred; `ProviderRegistry` extensible).
- NG2 — Full Vim-key keyboard navigation.
- NG3 — Locales other than `en`.
- NG4 — Floating navigation sidebar (Claudian's section jumper).
- NG5 — Word-level diffs in `ToolCallBlock`.
- NG6 — Inline-edit modal (Claudian's selection-cursor editor).
- NG7 — Bang-bash actual shell execution. `!` prefix is a *mode hint*; v1 does not dispatch commands to the OS.
- NG8 — Removal of the legacy `SpecoratorView /chat` route (deferred to a follow-up; flagged in design.md).
- NG9 — Vault-side `.specorator/sessions/*.meta.json` sidecars.
- NG10 — Streaming math/LaTeX preview.
- NG11 — Multi-agent orchestration (carries forward NG7 from PRD-CCS-001).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Daily user (split between Cursor and Claude) | Switch provider without leaving Obsidian | Removes context-switch cost; vault stays the single workspace |
| Evaluator comparing Cursor vs Claude | Side-by-side threads on the same vault | Direct comparison without per-test reconfiguration |
| Privacy-conscious user | Confidence that Cursor keys do not leak via Obsidian Sync | `SecretStorePort` is the established mitigation; reuse without new attack surface |
| Operator | Visible todo list + recent bash output | Reduces "what is the agent doing?" anxiety |
| Power user (Claudian convert) | Mode toggles, per-message actions, approval cards | Parity with the established UX they already know |

## Jobs to be done

- When I want to compare Claude and Cursor on the same task, I want to switch providers in one click, so I can A/B-test without leaving Obsidian.
- When I add my Cursor API key, I want to know that it is stored as securely as my Anthropic key, so I can use both without expanding my exposure.
- When I have multiple ongoing threads, I want to switch between them like browser tabs, so I do not lose context.
- When an agent proposes a write, I want to approve or deny inline without a modal, so the flow does not break.
- When I want to retry the last response with a different prompt, I want to edit and resend without retyping everything.
- When the agent is using tools, I want to see what it has done so far, so I can intervene if it goes off course.

---

## Functional requirements (EARS)

### Provider abstraction & migration

#### REQ-MPS-001 — Rename `ClaudeCliPort` to `ChatTransportPort`
- **Pattern:** ubiquitous
- **Statement:** The system shall expose the transport seam as `ChatTransportPort` in `src/domain/ports/ChatTransportPort.ts`, and shall not retain `ClaudeCliPort` as a public type export from the domain layer.
- **Acceptance:** Given an import audit of `src/`; when grep searches for `ClaudeCliPort` (excluding `tests/__legacy__`); then no production source file references the legacy name.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (constraints — port naming)

#### REQ-MPS-002 — Rename associated error types
- **Pattern:** ubiquitous
- **Statement:** The system shall rename `ClaudeCliError` → `ChatTransportError`, `ClaudeCliErrorCode` → `ChatTransportErrorCode`, `ClaudeCliQueryOptions` → `ChatTransportQueryOptions`, `ClaudeCliStreamOptions` → `ChatTransportStreamOptions`.
- **Acceptance:** Given a grep of the renamed identifiers in `src/`; then the legacy names exist in zero production files. Tests in `tests/__legacy__/` keep the old name as alias imports for backward-compat assertion only.
- **Priority:** must
- **Satisfies:** REQ-MPS-001

#### REQ-MPS-003 — `ProviderSelection` discriminator replaces flat `TransportKind`
- **Pattern:** ubiquitous
- **Statement:** The system shall represent the chat transport selection as a discriminated union `ProviderSelection = { provider: ProviderId, mode: ProviderMode } | { forced: 'auto' | 'degraded' }`, where `ProviderId = 'claude' | 'cursor'` and `ProviderMode = 'api' | 'cli'`.
- **Acceptance:** Given `src/domain/chat/ProviderSelection.ts`; when its exports are inspected; then exactly the three types `ProviderId`, `ProviderMode`, `ProviderSelection` are exported, plus an `isProviderSelection()` type guard.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (constraints)

#### REQ-MPS-004 — Migration of persisted `transportKind` setting
- **Pattern:** event-driven
- **Statement:** WHEN the plugin loads `_storedData` and finds the legacy `transportKind: 'auto' | 'api-key' | 'subscription' | 'degraded'`, the system shall translate it to a `ProviderSelection` per the table below, persist the result under `settings.providerSelection`, and remove the legacy `transportKind` key.
- **Translation table:** `'auto' → { forced: 'auto' }`, `'api-key' → { provider: 'claude', mode: 'api' }`, `'subscription' → { provider: 'claude', mode: 'cli' }`, `'degraded' → { forced: 'degraded' }`.
- **Acceptance:** Given a `data.json` containing `"transportKind": "subscription"`; when the plugin loads; then `settings.providerSelection === { provider: 'claude', mode: 'cli' }` and `data.json` no longer contains `transportKind`.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (success criteria — no user-visible action)

#### REQ-MPS-005 — Migration of persisted `ChatThreadRecord.transport`
- **Pattern:** event-driven
- **Statement:** WHEN the plugin hydrates `_storedData.specorator.chatThreads`, the system shall translate every record's `transport: 'api-key' | 'subscription'` into `{ provider: 'claude', mode: 'api' | 'cli' }` and persist the new shape.
- **Acceptance:** Given a stored `ChatThreadRecord` with `transport: 'api-key'`; when hydration completes; then the record's `transport` field is `{ provider: 'claude', mode: 'api' }`.
- **Priority:** must
- **Satisfies:** G6

#### REQ-MPS-006 — `ProviderRegistry` domain module
- **Pattern:** ubiquitous
- **Statement:** The system shall define `ProviderRegistry` as a domain-layer module exposing `listProviders()`, `getProvider(id)`, and `getCapabilities(id)` returning `ProviderCapabilities` (see spec §C.1).
- **Acceptance:** Given a fresh plugin load; when `ProviderRegistry.listProviders()` is called; then it returns at least the two entries `'claude'` and `'cursor'` with their capability metadata.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (preliminary scope — `ProviderRegistry`)

#### REQ-MPS-007 — `TransportSelector` honours `ProviderSelection`
- **Pattern:** ubiquitous
- **Statement:** The system shall reshape `selectTransport(settings, deps)` to consume `settings.providerSelection` and a `deps` record that contains one `ChatTransportPort` per `(provider, mode)` pair plus the degraded port; the truth table shall preserve "first-match-wins" semantics for the explicit / forced rows.
- **Acceptance:** Given `settings.providerSelection = { provider: 'cursor', mode: 'api' }` and `deps.cursor.api.available === true`; when `selectTransport(...)` is called; then the returned selection's `port === deps.cursor.api` and the resolved kind is `{ provider: 'cursor', mode: 'api' }`.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (constraints — selector is the single decision site)

#### REQ-MPS-008 — Resolution of `{ forced: 'auto' }`
- **Pattern:** event-driven
- **Statement:** WHEN `ProviderSelection.forced === 'auto'`, the system shall resolve the active provider in the precedence: (1) Claude API key present → claude/api; (2) Cursor API key present AND `cursor` provider explicitly preferred via secondary setting `settings.autoPreferProvider` → cursor/api; (3) Claude CLI resolved → claude/cli; (4) Cursor CLI resolved → cursor/cli; (5) degraded.
- **Acceptance:** Given Claude API key present, Cursor API key present, `autoPreferProvider === 'cursor'`; when the selector runs in auto mode; then the resolved selection is `{ provider: 'cursor', mode: 'api' }`.
- **Priority:** must
- **Satisfies:** REQ-MPS-007

#### REQ-MPS-009 — No re-introduction of legacy aggregate symbols
- **Pattern:** ubiquitous
- **Statement:** The system shall continue to forbid `IBridge` / `BridgeKey` / `useBridge` (carried forward from ADR-008); the new `ChatTransportPort` shall also not be aggregated into a multi-port composable.
- **Acceptance:** Given the ESLint config in `eslint.config.mjs`; when `no-restricted-imports` is inspected; then the deny-list includes the legacy aggregate symbols and a new entry forbidding `useChatTransports` (plural).
- **Priority:** must
- **Satisfies:** ADR-008

---

### Cursor provider — API & CLI

#### REQ-MPS-010 — `SECRET_ID_CURSOR` constant
- **Pattern:** ubiquitous
- **Statement:** The system shall expose `SECRET_ID_CURSOR = 'specorator-cursor-apikey'` from `src/domain/ports/SecretStorePort.ts`, following the lowercase-alphanumeric-with-dashes rule that `SECRET_ID_ANTHROPIC` already conforms to.
- **Acceptance:** Given the exported constant; when `app.secretStorage.setSecret(SECRET_ID_CURSOR, 'x')` is called on a 1.11.4+ desktop build; then the call succeeds (no ID-validation error).
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (constraints — Secret Storage)

#### REQ-MPS-011 — Cursor API key written exclusively to Secret Storage
- **Pattern:** unwanted behaviour
- **Statement:** IF the user enters a Cursor API key in Settings, THEN the system shall persist the key only via `SecretStorePort.setSecret(SECRET_ID_CURSOR, value)` and shall not write the key to `PluginSettings`, `data.json`, any vault file, or any log line.
- **Acceptance:** Given the user saves a Cursor key; when `data.json` is inspected; then no field contains the key value. Given `LoggerPort` calls during save; then no log entry contains the key value.
- **Priority:** must
- **Satisfies:** G2

#### REQ-MPS-012 — Degraded state when `SecretStorePort.available === false`
- **Pattern:** state-driven
- **Statement:** WHILE `SecretStorePort.available === false`, the system shall render the Cursor key field as a read-only notice "Secret storage isn't available on this device. Cursor needs Obsidian 1.11.4 or newer on desktop." and shall not write any Cursor key.
- **Acceptance:** Given mobile platform OR pre-1.11.4 desktop; when the Settings tab renders; then the Cursor key input is replaced by the notice block; no `password` input is rendered.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (constraints — no keytar fallback)

#### REQ-MPS-013 — `CursorApiAdapter` implements `ChatTransportPort`
- **Pattern:** ubiquitous
- **Statement:** The system shall provide `CursorApiAdapter` implementing `ChatTransportPort` and reading the Cursor key from `SecretStorePort.getSecret(SECRET_ID_CURSOR)` at query time (not at construction time).
- **Acceptance:** Given the adapter is instantiated and the user later saves a Cursor key; when `queryStream()` is next called; then the adapter reads the freshly-saved value without restart.
- **Priority:** must
- **Satisfies:** REQ-MPS-011

#### REQ-MPS-014 — `CursorApiAdapter` feature flag gating
- **Pattern:** state-driven
- **Statement:** WHILE `settings.cursorApiPreview === false`, the system shall expose `CursorApiAdapter.isAvailable()` returning `false` even if a Cursor key is stored.
- **Acceptance:** Given `cursorApiPreview === false` and a stored Cursor key; when `isAvailable()` is awaited; then the result is `false`. Given `cursorApiPreview === true`; then `isAvailable()` returns the actual availability.
- **Priority:** must
- **Satisfies:** CQ-MPS-01 (API surface stability gate)

#### REQ-MPS-015 — `CursorCliAdapter` implements `ChatTransportPort`
- **Pattern:** ubiquitous
- **Statement:** The system shall provide `CursorCliAdapter` implementing `ChatTransportPort`, using a `CursorBinaryResolver` sibling of `ClaudeBinaryResolver` to locate the `cursor-agent` binary on `$PATH` (or via `settings.cursorCliPath` when non-empty).
- **Acceptance:** Given `cursor-agent` is on `$PATH`; when `CursorBinaryResolver.resolve()` is called; then it returns the absolute path within 5 seconds. Given `settings.cursorCliPath` is set; then that path takes precedence.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (preliminary scope — Cursor CLI)

#### REQ-MPS-016 — `CursorBinaryResolver` ToS-respecting
- **Pattern:** ubiquitous
- **Statement:** The system shall ensure `CursorBinaryResolver` does not read any Cursor home-directory credentials file (mirrors REQ-ASM-007 / ADR-0031 for Claude).
- **Acceptance:** Given a static lint check of `src/infrastructure/obsidian/CursorBinaryResolver.ts`; then the file does not reference `~/.cursor/` credential file paths.
- **Priority:** must
- **Satisfies:** ADR-0031 pattern extended to Cursor

#### REQ-MPS-017 — `StreamDelta` extension for Cursor citations (optional variant)
- **Pattern:** event-driven
- **Statement:** WHEN a Cursor turn emits a citation (file + line span), the system shall surface it as a `{ type: 'citation', filePath, lineStart, lineEnd }` `StreamDelta` variant; the variant is additive — existing consumers ignore it without error.
- **Acceptance:** Given a citation arrives mid-stream; when `MessageList` receives the delta; then the delta is dispatched to `streamingTurnStore.appendCitation()` and other consumers are unchanged.
- **Priority:** should
- **Satisfies:** Q2 (Cursor delta-shape research)

---

### Multi-thread switcher

#### REQ-MPS-018 — Tab strip with all open threads
- **Pattern:** ubiquitous
- **Statement:** The system shall render a horizontal tab strip in `AgentSidepanelHeader` that lists every `ChatThreadRecord` in `chatThreadsStore.chatThreads` ordered by `lastUsedAt` descending; the currently-active thread is visually highlighted.
- **Acceptance:** Given three threads; when the sidepanel renders; then three tabs are visible; clicking a non-active tab dispatches `setActiveThreadId(id)` and the highlight moves.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (success criteria — multi-thread switcher)

#### REQ-MPS-019 — New thread action
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks the "New thread" control in the tab strip, the system shall create a new `ChatThreadRecord` with a fresh UUID, the current `feature` slug, and the resolved `(provider, mode)` selection, and shall set it active.
- **Acceptance:** Given the user clicks "New thread"; when the action resolves; then `chatThreadsStore.chatThreads.size` increases by 1, the new id is `activeThreadId`, and a new session-log path is allocated.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-020 — Rename thread
- **Pattern:** event-driven
- **Statement:** WHEN the user double-clicks (or right-clicks → Rename) a thread tab and submits a new title, the system shall persist `ChatThreadRecord.title` via `chatThreadsStore.renameThread(threadId, title)`.
- **Acceptance:** Given a thread renamed to "Pricing notes"; when the sidepanel reloads; then the tab still displays "Pricing notes".
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (preliminary scope — rename)

#### REQ-MPS-021 — Default title derivation
- **Pattern:** event-driven
- **Statement:** WHEN a thread is created and the user has not set a title, the system shall derive the default title from the first user message's first 40 characters; until the first message arrives the title is "New thread".
- **Acceptance:** Given the first user message is "Help me draft a pricing memo for the Q3 plan"; then the default title is "Help me draft a pricing memo for the Q3".
- **Priority:** should
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-022 — Delete thread with confirmation
- **Pattern:** event-driven
- **Statement:** WHEN the user invokes the "Delete thread" action, the system shall display an Obsidian `Modal` confirmation; on confirm, the record is removed from `chatThreadsStore` and the session-log file is deleted via `VaultPort.deleteFile`.
- **Acceptance:** Given a thread with id `T1`; when the user confirms delete; then `chatThreadsStore.chatThreads.has('T1') === false` and the corresponding `logPath` no longer exists.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (preliminary scope — delete)

#### REQ-MPS-023 — Fork thread
- **Pattern:** event-driven
- **Statement:** WHEN the user invokes "Fork from here" on a message, the system shall create a new `ChatThreadRecord` whose initial message log copies the source thread up to and including the chosen message; the source `sessionId` is recorded as `forkParent` on the new record.
- **Acceptance:** Given a fork from message index 4 in thread `T1`; when the new thread loads; then the first 5 messages are present and `forkParent === T1`.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (preliminary scope — fork)

#### REQ-MPS-024 — Active thread persisted across reloads
- **Pattern:** event-driven
- **Statement:** WHEN the plugin reloads, the system shall restore the previously-active thread id from `_storedData.specorator.activeThreadId` if it still exists; otherwise the most recently used thread becomes active.
- **Acceptance:** Given thread `T2` was active and the user restarts Obsidian; when the sidepanel mounts; then `activeThreadId === 'T2'`.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-025 — Tab count cap
- **Pattern:** unwanted behaviour
- **Statement:** IF the user attempts to create a new thread when the open-tab count is at the configured cap (`settings.chatTabCap`, default 10), THEN the system shall show a `NotificationPort.showWarning("Close a thread before opening a new one.")` and shall not create the thread.
- **Acceptance:** Given 10 open threads and `chatTabCap === 10`; when "New thread" is clicked; then no new record is created and the warning fires.
- **Priority:** should
- **Satisfies:** Q4

---

### Per-message actions

#### REQ-MPS-026 — Copy message text
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks the "Copy" control on any rendered message, the system shall write the message's plain-text content (markdown source) to the OS clipboard via `navigator.clipboard.writeText` and show a transient success notice.
- **Acceptance:** Given a message body "Hello"; when the user clicks Copy; then `navigator.clipboard` contains "Hello" and a success toast appears for ≤ 2 s.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (preliminary scope — per-message actions)

#### REQ-MPS-027 — Regenerate last response
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks "Regenerate" on the latest assistant message, the system shall (1) remove that assistant message from `messagesStore`, (2) re-dispatch the preceding user turn through `ChatTurnOrchestrator` with the same `(provider, mode)` selection and `resumeSessionId`.
- **Acceptance:** Given the latest assistant message id `M-9` preceded by user message `M-8`; when Regenerate fires; then `M-9` is removed and a new assistant turn streams in its place.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-028 — Edit-and-resend
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks "Edit" on one of their own messages, the system shall replace that message in the transcript with the `ChatInput` populated with its text; on submit, the system shall truncate the transcript to messages preceding the edited message and re-dispatch a turn with the new text.
- **Acceptance:** Given user message at index 3 in a transcript of 7; when the user edits and resubmits; then the transcript contains exactly the first 3 messages plus the new user turn and any new assistant response.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-029 — Per-message action disabled while turn streaming
- **Pattern:** state-driven
- **Statement:** WHILE `streamingTurnStore.isStreaming === true`, the system shall disable the Regenerate and Edit controls; Copy remains enabled.
- **Acceptance:** Given a turn in flight; when the user hovers Regenerate; then the control has `aria-disabled="true"` and click does nothing.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

---

### Status panel

#### REQ-MPS-030 — Todo list view
- **Pattern:** event-driven
- **Statement:** WHEN a tool-use delta with name `'TodoWrite'` (Claude) or `'todo-update'` (Cursor) arrives, the system shall update `statusPanelStore.todos` to reflect the new list.
- **Acceptance:** Given a TodoWrite delta with three items; when the status panel renders; then three rows are visible, each with a status icon (pending/in-progress/done).
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-031 — Recent bash output history
- **Pattern:** event-driven
- **Statement:** WHEN a tool-result delta corresponding to a Bash tool-use arrives, the system shall append a `BashEntry { id, command, output, exitCode, timestamp }` to `statusPanelStore.bashHistory`, capping the list at 50 entries (oldest dropped FIFO).
- **Acceptance:** Given 51 bash invocations across a session; when the 51st result arrives; then `bashHistory.length === 50` and the first entry's `id` is the second invocation's id.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (preliminary scope — status panel cap 50)

#### REQ-MPS-032 — Bash entry collapsible
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks a bash entry header in the status panel, the system shall toggle the visibility of that entry's `output` body without affecting other entries.
- **Acceptance:** Given three entries; when the user expands the second; then only the second's body is visible.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-033 — Status panel collapse persists per thread
- **Pattern:** state-driven
- **Statement:** WHILE the user has collapsed the entire status panel, the system shall persist the collapsed state per `threadId` so that switching threads restores the previous panel state.
- **Acceptance:** Given thread `T1` panel is collapsed and `T2` is expanded; when the user switches between them; then the panel reflects each thread's last state.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001

---

### Modeline modes (slash, mention, plan, bang-bash, instruction)

#### REQ-MPS-034 — Slash-command dropdown enriched per provider
- **Pattern:** event-driven
- **Statement:** WHEN the user types `/` at the start of the input, the system shall display a dropdown sourced from `(1)` built-in commands in `builtInSlashCommands.ts`, `(2)` vault commands discovered by `slashCommandLoader`, and `(3)` provider-supplied runtime commands from `ProviderRegistry.getProvider(activeProvider).slashCommands()`.
- **Acceptance:** Given the active provider is `cursor` exposing `/cursor:reindex`; when the user types `/`; then the dropdown contains the built-ins, the vault commands, and `/cursor:reindex`.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (slash-command dropdown enrichment)

#### REQ-MPS-035 — Mention dropdown unchanged behaviour
- **Pattern:** ubiquitous
- **Statement:** The system shall continue to display the file-mention dropdown when the user types `@`; this requirement carries forward the existing behaviour and is included so regression tests cover it under the new provider routing.
- **Acceptance:** Given `@spec` typed; then the dropdown shows vault files matching `spec*`.
- **Priority:** must
- **Satisfies:** REQ-ASM-existing (carry-forward)

#### REQ-MPS-036 — Plan-mode toggle (Shift+Tab)
- **Pattern:** event-driven
- **Statement:** WHEN the user presses `Shift+Tab` with focus inside `ChatInput`, the system shall toggle `chatInputModeStore.planMode` between `true` and `false`; while `planMode === true` the input border changes to the accent colour and the send button label reads "Plan".
- **Acceptance:** Given plan mode off; when the user hits Shift+Tab; then `planMode === true` and the label reads "Plan"; hitting Shift+Tab again returns to "Ask".
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (plan-mode toggle)

#### REQ-MPS-037 — Plan-mode prompt prefix
- **Pattern:** event-driven
- **Statement:** WHEN the user sends a message with `planMode === true`, the system shall include `'planMode: true'` in the turn's options forwarded to `ChatTransportPort.queryStream()` so the underlying adapter can pass the relevant `--permission-mode plan` (Claude CLI) or equivalent (Cursor) flag.
- **Acceptance:** Given plan mode is on; when the user sends a turn; then `ClaudeSubprocessAdapter._buildArgs` (or its Cursor equivalent) includes `--permission-mode plan`.
- **Priority:** must
- **Satisfies:** REQ-MPS-036

#### REQ-MPS-038 — Bang-bash mode hint
- **Pattern:** event-driven
- **Statement:** WHEN the user types `!` at the start of the input, the system shall set `chatInputModeStore.bangBashMode = true` for the current draft; the input shows a leading shell-prompt indicator. On submit, the message is sent verbatim as a normal user turn (NG7 — no OS dispatch).
- **Acceptance:** Given a draft starting with `!ls -la`; then the input shows a shell indicator; on send the message body in `messagesStore` is `'!ls -la'` (raw).
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (preliminary scope — bang-bash mode)

#### REQ-MPS-039 — Instruction mode (`#` prefix)
- **Pattern:** event-driven
- **Statement:** WHEN the user types `#` at the start of the input, the system shall set `chatInputModeStore.instructionMode = true`; on submit, the message is forwarded to the adapter with `options.systemPromptSuffix` extended by the user text (instead of as a user-role message).
- **Acceptance:** Given a draft `#prefer concise answers`; when the user submits; then the next streamed turn's `systemPromptSuffix` ends with `prefer concise answers` and `messagesStore` records the directive separately from regular user turns (visually styled as a system note).
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (preliminary scope — instruction mode)

---

### Model selector

#### REQ-MPS-040 — Per-provider model selector in header
- **Pattern:** event-driven
- **Statement:** WHEN the active provider exposes a non-empty model list via `ProviderRegistry.getCapabilities(providerId).models`, the system shall render a dropdown in `AgentSidepanelHeader` listing those models; selecting a model updates `settings.providerModel[providerId]`.
- **Acceptance:** Given Claude provider with models `['claude-sonnet-4', 'claude-haiku-4']`; when the user selects `claude-haiku-4`; then `settings.providerModel.claude === 'claude-haiku-4'` and the next turn's options include `model: 'claude-haiku-4'`.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001 (model selector)

#### REQ-MPS-041 — Model selector hidden when provider has no model list
- **Pattern:** state-driven
- **Statement:** WHILE the active provider's `capabilities.models` is empty, the system shall not render the model selector control.
- **Acceptance:** Given a future provider with no `models`; when the header renders; then no `[data-testid="model-selector"]` element exists.
- **Priority:** must
- **Satisfies:** REQ-MPS-040

---

### Attachments

#### REQ-MPS-042 — Paste image attachment
- **Pattern:** event-driven
- **Statement:** WHEN the user pastes image data into the `ChatInput`, the system shall capture the blob, store it transiently in `attachmentsStore`, and display a chip beneath the input. On send, the image is forwarded to the provider via `ChatTransportQueryOptions.attachments` (new field).
- **Acceptance:** Given a 200×200 PNG pasted; then a chip with the thumbnail and filename `image-1.png` appears; on send, the adapter receives the attachment list.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (preliminary scope — attachments)

#### REQ-MPS-043 — Drag-and-drop vault file attachment
- **Pattern:** event-driven
- **Statement:** WHEN the user drags a vault file onto the `ChatInput`, the system shall add a `{ kind: 'vault', path }` entry to `attachmentsStore`; the file is resolved to content at send time via `VaultPort.readFile`.
- **Acceptance:** Given a drag-drop of `notes/idea.md`; then an attachment chip with the filename appears; on send, the provider receives the file content as a context block.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-044 — Attachment size cap
- **Pattern:** unwanted behaviour
- **Statement:** IF the user attempts to attach a file or pasted blob larger than 5 MB, THEN the system shall reject the attachment with a plain-language notice "Attachments must be 5 MB or smaller."
- **Acceptance:** Given a 6 MB image paste; then no attachment is added and the notice is shown.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

---

### Inline approvals

#### REQ-MPS-045 — Approval card replaces blocking modal
- **Pattern:** event-driven
- **Statement:** WHEN a provider emits a tool-use that requires approval (Write / Edit / Bash), the system shall render an inline approval card in the message stream with three buttons: "Deny", "Allow once", "Always allow". Choosing one resolves the provider's approval callback.
- **Acceptance:** Given a Write tool-use to `notes/x.md`; then a card appears with the path, content preview, and the three buttons; clicking "Allow once" resolves the callback with approve=true and persists no rule.
- **Priority:** must
- **Satisfies:** IDEA-MPS-001

#### REQ-MPS-046 — "Always allow" persists per-rule
- **Pattern:** event-driven
- **Statement:** WHEN the user clicks "Always allow" on an approval card, the system shall persist a rule `{ tool, scope, providerId }` under `_storedData.specorator.approvalRules`; future matching tool-uses are auto-approved.
- **Acceptance:** Given the user clicked "Always allow" on a Write to `notes/x.md`; when a second Write to `notes/x.md` arrives in the same or a later session; then the approval callback resolves immediately without UI.
- **Priority:** should
- **Satisfies:** IDEA-MPS-001 (inline approvals with rule persistence)

#### REQ-MPS-047 — Approval rules manageable in Settings
- **Pattern:** ubiquitous
- **Statement:** The system shall expose the persisted approval rules list in the Settings tab with a "Remove" action per rule.
- **Acceptance:** Given two persisted rules; when the user opens Settings → Specorator → Approvals; then both rows are listed; clicking "Remove" deletes the rule.
- **Priority:** should
- **Satisfies:** REQ-MPS-046

---

## Non-functional requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-MPS-001 | security | Cursor API key never written to `data.json`, vault, or log lines | Enforced by ESLint custom rule `no-cursor-key-in-settings` and runtime assertion in `_mapError` |
| NFR-MPS-002 | security | All API keys redacted in `_mapError` output for both providers | Carry-forward of NFR-CCS-005; extended to Cursor |
| NFR-MPS-003 | security | `ProviderRegistry` exposes no secret values — only ids and capabilities | Inspectable in unit tests; no `.key` field on the metadata shape |
| NFR-MPS-004 | performance | Provider switch via the header dropdown completes in ≤ 200 ms on a 100-message thread | Measured via Storybook + Playwright; no full transcript re-render |
| NFR-MPS-005 | performance | Multi-thread switcher renders within 100 ms with up to 10 open threads | Component test budget |
| NFR-MPS-006 | reliability | Migration of legacy `transportKind` and `ChatThreadRecord.transport` is idempotent | Running the migration twice yields identical output |
| NFR-MPS-007 | reliability | `ChatTransportPort` lifecycle (`startup` / `shutdown`) on the sibling `TransportLifecyclePort` continues to satisfy NFR-CCS-002 and NFR-CCS-007 for the new adapters | Adapter unit tests assert |
| NFR-MPS-008 | accessibility | Per-message action buttons carry `aria-label="<Action> message"` and `tabindex="0"` | Component tests via PageObject |
| NFR-MPS-009 | accessibility | Tab strip is keyboard-navigable (Arrow keys + Enter); Delete tab via Backspace with confirmation | Component tests |
| NFR-MPS-010 | accessibility | Plan-mode toggle announces state change via `aria-live="polite"` region | Component test asserts announcement |
| NFR-MPS-011 | plain language | No "API key", "subscription", "subprocess", "SDK" in user-visible strings outside Settings tab field labels | Lint rule on `src/ui/i18n/locales/en.ts` |
| NFR-MPS-012 | portability | `ChatTransportPort` interface file forbids imports from `obsidian`, `@anthropic-ai/claude-agent-sdk`, and `node:child_process` | Domain-layer `no-restricted-imports` |
| NFR-MPS-013 | portability | `CursorApiAdapter` uses only `globalThis.fetch` — no new `HttpPort`, no `node:https` | Code review check |
| NFR-MPS-014 | testability | Each new adapter ships a `Mock<Provider>Adapter` with the same configuration knobs as `MockClaudeCliPort` (NFR-CCS-004) | Test fakes co-located in `tests/__fakes__/` |

---

## Success metrics

- **North star:** Percentage of monthly active Specorator users who have sent at least one message via the Cursor provider within 60 days of release.
- **Provider-switch usage:** Number of `setActiveProvider` events per user per week; expected baseline ≥ 1 for users with both keys configured.
- **Multi-thread depth:** Median number of simultaneously open threads per user across a session.
- **Approval-rule adoption:** Percentage of users who have at least one persisted approval rule after 30 days.
- **Counter-metric — secret-storage leakage:** Number of `data.json` files in support tickets that contain any string matching the Cursor key regex (`cur_[A-Za-z0-9]{32,}` or vendor's published pattern). Target: 0.
- **Counter-metric — migration breakage:** Crash reports referencing `transportKind` after release. Target: 0 within 7 days.

---

## Release criteria

- [ ] All `must`-priority REQ-MPS-NNN requirements have passing acceptance tests.
- [ ] All NFR-MPS-NNN met; particularly NFR-MPS-001 (no Cursor key in `data.json` — regex grep at CI level), NFR-MPS-012 (port-file import audit).
- [ ] `npm run verify` green on `develop`.
- [ ] All REQ-CCS-001..028 acceptance tests still pass under `provider='claude'` (Claude-provider regression suite tagged `@ccs-parity`).
- [ ] Migration tested on three sample `data.json` fixtures (one each for legacy `'auto'`, `'api-key'`, `'subscription'`).
- [ ] Three ADRs filed: rename, provider×mode discriminator, Cursor + Secret Storage (see design.md §C.ADR).
- [ ] Settings tab smoke-tested on Obsidian 1.11.4 (Secret Storage available) and Obsidian 1.11.3 (degraded notice).

---

## Open questions / clarifications

These are tracked in `workflow-state.md` Open clarifications. They do not block spec acceptance.

- CQ-MPS-01 — Cursor public HTTP API shape.
- CQ-MPS-02 — Legacy `/chat` route removal timing.
- CQ-MPS-03 — `ChatThreadRecord` migration vs schema-version bump.

---

## Out of scope

See `idea.md` § Out of scope (deferred) — verbatim list reproduced for traceability.

- Codex / Opencode / ACP providers (NG1).
- Full Vim-key keyboard navigation (NG2).
- Locales other than `en` (NG3).
- Floating navigation sidebar (NG4).
- Word-level diffs in `ToolCallBlock` (NG5).
- Inline-edit modal (NG6).
- Bang-bash OS dispatch (NG7).
- Legacy `/chat` route removal (NG8).
- Vault sidecars under `.specorator/sessions/` (NG9).
- Streaming math/LaTeX preview (NG10).
- Multi-agent orchestration (NG11).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable.
- [x] NFRs listed with targets.
- [x] Success metrics defined (with counter-metrics).
- [x] Release criteria stated.
- [x] Open clarifications enumerated and non-blocking.
