---
id: PRD-CCS-001
title: "Claude CLI chat sidebar"
stage: requirements
feature: claude-cli-chat-sidebar
status: accepted
owner: pm
inputs:
  - IDEA-CCS-001
  - RESEARCH-CCS-001
created: 2026-05-14
updated: 2026-05-14
---

# PRD — Claude CLI chat sidebar

## Summary

Specorator embeds a chat sidebar inside the Obsidian panel that lets users ask questions about their vault files and receive AI-generated responses without leaving the application. The sidebar is backed by the Anthropic Claude SDK via a narrow `ClaudeCliPort` port; it assembles file context automatically from the active editor file and from files the user explicitly adds, trims that context to a 50 000-token ceiling, and forwards the assembled prompt to the adapter. When the adapter is not usable — because the API key is absent, the SDK cannot start, or the user is on a mobile device — the sidebar renders a plain-language explanation and keeps all other plugin capabilities intact. The feature closes the gap that forces users to leave Obsidian and switch to a separate AI tool whenever they need help with their workflow.

## Goals

- G1: Provide a persistent, always-accessible chat surface inside the Obsidian panel.
- G2: Include the file the user is actively editing in every message without any manual step.
- G3: Let users pin additional vault files as context with a single right-click action.
- G4: Enforce a 50 000-token context ceiling that degrades gracefully rather than failing.
- G5: Surface all error and degraded states in plain language with no AI or SDK terminology.
- G6: Keep the `ClaudeCliPort` interface as a stable narrow port so the underlying SDK can be swapped in a future version without touching application or UI call sites.

## Non-goals

- NG1: Conversation history persistence to the vault or plugin settings. (Memory-only in v1; deferred.)
- NG2: Multi-turn agent responses. (maxTurns is fixed at 1 in v1.)
- NG3: Streaming token-by-token rendering. (Response is buffered, then displayed as a complete string.)
- NG4: Write-operation proposal / review cards. (Deferred to v2 design.)
- NG5: Stage-aware suggested conversation starters. (Deferred to v2 design.)
- NG6: Provider selection UI or model configuration surface.
- NG7: Multi-agent orchestration or direct integration with the Specorator agent orchestrator.
- NG8: Persona or workflow-stage context injection (Layer 1–4). (Only file content and user text are assembled in v1.)

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Non-technical founder / PM | Ask open-ended questions about a spec or idea without writing a prompt | Reduces cognitive friction and avoids switching tools mid-workflow |
| Solo developer / engineering lead | Get AI assistance scoped to the file currently open | Active-file auto-context means the answer is always relevant to where the user is |
| Any Specorator user | Understand what is wrong when the chat cannot start | Plain-language degradation states prevent confusion and direct the user to a resolution |

## Jobs to be done

- When I am reading a spec file in Obsidian, I want to ask a question about it, so I can move forward without switching to a separate AI tool.
- When I want the AI to consider additional files alongside the one I have open, I want to add them from the file menu, so I do not have to paste content manually.
- When the chat cannot start because my API key is missing, I want a plain explanation and a link to settings, so I can fix it in one step.
- When the chat cannot start for a technical reason, I want a plain explanation, so I know Specorator is still working even if AI assistance is temporarily unavailable.

---

## Functional requirements (EARS)

### REQ-CCS-001 — API key storage field

- **Pattern:** ubiquitous
- **Statement:** The system shall provide a password-masked text field in the Obsidian settings tab that accepts the user's Anthropic API key, stores it in the plugin data blob, and never writes it to any vault file.
- **Acceptance:**
  - Given the user opens Settings > Specorator.
  - When the Anthropic key field is rendered.
  - Then the input type is `password`, autocomplete is `off`, the current stored value is pre-filled (masked), and changes are persisted to the plugin data blob on input.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — API key not exposed to vault)

---

### REQ-CCS-002 — API key trimmed on save

- **Pattern:** event-driven
- **Statement:** WHEN the user saves the API key field, the system shall trim leading and trailing whitespace from the value before persisting it.
- **Acceptance:**
  - Given the user types `  sk-ant-abc  ` into the Anthropic key field.
  - When the field's onChange fires.
  - Then the stored value is `sk-ant-abc` with no surrounding whitespace.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — no configuration surface exposed)

---

### REQ-CCS-003 — SDK startup deferred to layout-ready

- **Pattern:** event-driven
- **Statement:** WHEN the Obsidian workspace layout is ready, the system shall call `ClaudeCliPort.startup()` to pre-warm the adapter.
- **Acceptance:**
  - Given the plugin has loaded and `onLayoutReady` fires.
  - When `startup()` is called.
  - Then the adapter attempts to resolve the SDK binary and marks itself available or unavailable; `onload()` is not delayed.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (Technical considerations — Sidebar hosting; RISK-CCS-005)

---

### REQ-CCS-004 — SDK shutdown on plugin unload

- **Pattern:** event-driven
- **Statement:** WHEN the plugin is unloaded, the system shall call `ClaudeCliPort.shutdown()` synchronously.
- **Acceptance:**
  - Given the plugin is being unloaded by Obsidian.
  - When `onunload()` executes.
  - Then `shutdown()` is called; it does not throw; `_sdkReady` and `_available` flags are reset.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — graceful degradation)

---

### REQ-CCS-005 — Active file auto-context

- **Pattern:** event-driven
- **Statement:** WHEN the active editor leaf changes, the system shall update the chat store's auto context slot with the path and label of the newly active file.
- **Acceptance:**
  - Given a file is open in the editor.
  - When the user switches to a different file.
  - Then `chatStore.contextFiles` contains exactly one entry with `isAuto: true` whose `path` matches the newly active file, placed at index 0.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — context-aware responses)

---

### REQ-CCS-006 — Active file cleared when no file is open

- **Pattern:** event-driven
- **Statement:** WHEN the active editor leaf changes to a state where no markdown file is open, the system shall remove the auto context slot from the chat store.
- **Acceptance:**
  - Given an auto context entry exists in `chatStore.contextFiles`.
  - When `active-leaf-change` fires and `getActiveFile()` returns null.
  - Then no entry with `isAuto: true` remains in `chatStore.contextFiles`.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — active file context)

---

### REQ-CCS-007 — Chat panel accessible via ribbon and command

- **Pattern:** event-driven
- **Statement:** WHEN the user clicks the Specorator ribbon icon or runs the "Open panel" command, the system shall open or reveal the Specorator view and navigate to the `/chat` route.
- **Acceptance:**
  - Given the Specorator panel is not open.
  - When the user clicks the ribbon icon.
  - Then the panel opens in the right sidebar and the chat view is visible.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — always visible side panel)

---

### REQ-CCS-008 — URI handler for open-chat action

- **Pattern:** event-driven
- **Statement:** WHEN the system receives an `obsidian://specorator?action=open-chat` URI, the system shall activate the Specorator view and navigate to the `/chat` route.
- **Acceptance:**
  - Given the plugin is loaded.
  - When `obsidian://specorator?action=open-chat` is invoked.
  - Then `activateView()` is called and `navigateTo('/chat')` is dispatched; no error is shown to the user.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — URI handler)

---

### REQ-CCS-009 — Right-click "Add to chat context" menu item

- **Pattern:** event-driven
- **Statement:** WHEN the user right-clicks a file in the Obsidian file menu, the system shall display an "Add to chat context" menu item that, when clicked, adds the file to the chat store as a manual context entry.
- **Acceptance:**
  - Given any vault file is right-clicked.
  - When "Add to chat context" is clicked.
  - Then the Specorator view is activated and `chatStore.addContextFile({ path, label, isAuto: false })` is called with the correct file path and name.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (preliminary scope — file-menu integration)

---

### REQ-CCS-010 — No-duplicate context files

- **Pattern:** unwanted behaviour
- **Statement:** IF the user attempts to add a file to the context list, THEN the system shall ignore the addition when an entry with the same vault-relative path is already present in the context list.
- **Acceptance:**
  - Given `chatStore.contextFiles` already contains an entry with `path = "specs/idea.md"`.
  - When `addContextFile({ path: "specs/idea.md", label: "idea.md", isAuto: false })` is called.
  - Then `chatStore.contextFiles.length` is unchanged.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (preliminary scope — context assembly)

---

### REQ-CCS-011 — Remove manual context file

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the remove control on a manual context chip, the system shall remove that entry from the context list.
- **Acceptance:**
  - Given a manual context chip is visible and the panel is not in the loading state.
  - When the user clicks or presses Enter/Space on the remove button.
  - Then the entry is removed from `chatStore.contextFiles` and the chip disappears.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (preliminary scope — context assembly)

---

### REQ-CCS-012 — Context truncation notice

- **Pattern:** state-driven
- **Statement:** WHILE `chatStore.truncated` is `true`, the system shall display a plain-language notice informing the user that some content was shortened to fit the message.
- **Acceptance:**
  - Given `buildPrompt()` returned `truncated: true` and `chatStore.setResponse()` was called with `wasTruncated: true`.
  - When the response is displayed.
  - Then a visible notice is shown that does not use the words "token" or "context window".
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (RISK-CCS-008)

---

### REQ-CCS-013 — Send message and display response

- **Pattern:** event-driven
- **Statement:** WHEN the user sends a non-empty message, the system shall assemble the context prompt, call `ClaudeCliPort.query()`, and display the returned text in the response area.
- **Acceptance:**
  - Given the adapter is available, `userText` is non-empty, and `status` is `idle`.
  - When the user submits the message.
  - Then `beginRequest()` is called, `ClaudeCliPort.query()` is awaited, and on success `setResponse(text, truncated)` is called, `userText` is cleared, and the response text is visible.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — sending a message)

---

### REQ-CCS-014 — Loading state during query

- **Pattern:** state-driven
- **Statement:** WHILE a query is in flight, the system shall set `chatStore.status` to `loading` and disable the send control and context remove controls.
- **Acceptance:**
  - Given `beginRequest()` has been called and the query has not yet resolved.
  - When the chat panel renders.
  - Then the send button is disabled, context chip remove buttons are not rendered, and any loading indicator is visible.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (success criteria — visible progress)

---

### REQ-CCS-015 — Empty message guard

- **Pattern:** unwanted behaviour
- **Statement:** IF the user attempts to send a message, THEN the system shall not call `ClaudeCliPort.query()` when `userText` is empty or whitespace-only.
- **Acceptance:**
  - Given `userText` is `"   "` (whitespace only).
  - When the send action fires.
  - Then `ClaudeCliPort.query()` is not called and `chatStore.status` remains `idle`.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (preliminary scope — send flow)

---

### REQ-CCS-016 — Error state on query failure or timeout

- **Pattern:** event-driven
- **Statement:** WHEN `ClaudeCliPort.query()` returns an error result, the system shall set `chatStore.status` to `error`, set `chatStore.errorType` to the appropriate type, and display a plain-language error message without AI or SDK terminology.
- **Acceptance:**
  - Given the query returns `ClaudeCliError{ errorCode: 'TIMEOUT' }`.
  - When the result is processed.
  - Then `chatStore.errorType === 'timeout'`, the error message shown reads "That took too long. Please try again.", and `userText` is retained.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — plain language)

---

### REQ-CCS-017 — userText retained on error

- **Pattern:** state-driven
- **Statement:** WHILE `chatStore.status` is `error`, the system shall retain the value of `userText` so the user can retry or edit without retyping.
- **Acceptance:**
  - Given the user sent `"What should I do next?"` and the query returned an error.
  - When the error state renders.
  - Then the text input still contains `"What should I do next?"`.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — graceful degradation)

---

### REQ-CCS-018 — API key missing degraded state

- **Pattern:** state-driven
- **Statement:** WHILE `ClaudeCliPort.isAvailable()` returns false and the stored `anthropicApiKey` is empty, the system shall display the message "Chat is not set up yet." together with a link to the settings screen.
- **Acceptance:**
  - Given `isAvailable()` resolves to `false` and `settings.anthropicApiKey` is `""`.
  - When the chat panel mounts or availability is re-checked.
  - Then the heading "Chat is not set up yet." is visible, a settings link is rendered, and the message input is not shown.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (RISK-CCS-002); IDEA-CCS-001 (constraints — graceful degradation)

---

### REQ-CCS-019 — SDK unavailable degraded state

- **Pattern:** state-driven
- **Statement:** WHILE `ClaudeCliPort.isAvailable()` returns false and the stored `anthropicApiKey` is non-empty, the system shall display the message "AI assistant is not available right now." with a plain-language explanation.
- **Acceptance:**
  - Given `isAvailable()` resolves to `false` and `settings.anthropicApiKey` is non-empty.
  - When the chat panel mounts or availability is re-checked.
  - Then the heading "AI assistant is not available right now." is visible, no message input is shown, and no SDK or binary terminology is used.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (RISK-CCS-001); IDEA-CCS-001 (constraints — graceful degradation)

---

### REQ-CCS-020 — Mobile degraded state

- **Pattern:** state-driven
- **Statement:** WHILE the plugin is running on a mobile device, the system shall display the message "Chat is available on desktop only." and shall not render the message input.
- **Acceptance:**
  - Given `usePlatform().isMobile` is `true`.
  - When the chat panel mounts.
  - Then the heading "Chat is available on desktop only." is visible and the rest of the chat UI is not rendered.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — graceful degradation)

---

### REQ-CCS-021 — ClaudeCliPort narrow port interface

- **Pattern:** ubiquitous
- **Statement:** The system shall define `ClaudeCliPort` as a domain-layer interface whose file does not import from `obsidian` or `@anthropic-ai/claude-agent-sdk`, exposing exactly four methods: `query()`, `isAvailable()`, `startup()`, and `shutdown()`.
- **Acceptance:**
  - Given any import audit of `src/domain/ports/ClaudeCliPort.ts`.
  - When the file is statically analysed.
  - Then no import from `obsidian` or `@anthropic-ai/claude-agent-sdk` is found, and the interface declares exactly the four named methods.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — ClaudeCliPort as narrow port per ADR-008)

---

### REQ-CCS-022 — isAvailable() never throws

- **Pattern:** ubiquitous
- **Statement:** The system shall ensure that `ClaudeCliPort.isAvailable()` never throws; all implementors shall catch internal errors and return `false`.
- **Acceptance:**
  - Given any implementor of `ClaudeCliPort` (production or mock).
  - When `isAvailable()` is called under any condition including adapter startup failure.
  - Then a boolean is returned without throwing.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — stable port seam)

---

### REQ-CCS-023 — MockClaudeCliPort browser stub defaults to unavailable

- **Pattern:** ubiquitous
- **Statement:** The system shall provide a `MockClaudeCliPort` implementation where `isAvailable()` returns `false` by default, so the standalone browser UI (`npm run dev`) renders the degraded state without a subprocess.
- **Acceptance:**
  - Given `MockClaudeCliPort` is instantiated with no arguments.
  - When `isAvailable()` is awaited.
  - Then it returns `false`.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints — works in standalone browser UI)

---

### REQ-CCS-024 — Settings change re-checks availability

- **Pattern:** event-driven
- **Statement:** WHEN the user saves a change to the Anthropic API key in settings, the system shall call `ClaudeCliPort.isAvailable()` and update the chat panel's availability state without requiring a restart.
- **Acceptance:**
  - Given the chat panel is showing the "Chat is not set up yet." degraded state.
  - When the user enters a valid API key in settings and saves.
  - Then the settings tab calls `bumpSettingsVersion()` on all open Specorator view leaves, the `settingsVersion` watcher in `ChatSidebar` fires, `isAvailable()` is re-awaited, and the panel re-renders accordingly.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (Technical considerations — API key handling)

---

### REQ-CCS-025 — Context preamble format

- **Pattern:** ubiquitous
- **Statement:** The system shall assemble the prompt as: preamble `"The following files are provided for context:\n\n"`, followed by one `---\nFile: <path>\n---\n<content>\n\n` block per context file, then `---\n\n`, then the user's message text.
- **Acceptance:**
  - Given `buildPrompt("hello", [{ path: "a.md", content: "x", isAuto: true, label: "a.md" }])` is called.
  - When the result is inspected.
  - Then `prompt` equals `"The following files are provided for context:\n\n---\nFile: a.md\n---\nx\n\n---\n\nhello"` exactly.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (Q1 — context payload)

---

### REQ-CCS-026 — Token cap enforcement — manual file LIFO removal

- **Pattern:** unwanted behaviour
- **Statement:** IF the assembled prompt exceeds the 50 000-token character budget, THEN the system shall remove manual context files in reverse-insertion order (LIFO) until the prompt is within budget or all manual files are exhausted.
- **Acceptance:**
  - Given two manual files whose combined content causes the prompt to exceed 200 000 characters.
  - When `buildPrompt()` is called.
  - Then the last-added manual file is removed first; if budget is met, `truncated` is `true` and the earlier manual file is still present.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (preliminary scope — context assembly); RESEARCH-CCS-001 (Q1)

---

### REQ-CCS-027 — Token cap enforcement — auto file floor

- **Pattern:** unwanted behaviour
- **Statement:** IF the prompt still exceeds the character budget after all manual files are removed, THEN the system shall trim the auto file's content from the end, preserving at least 500 characters of that content.
- **Acceptance:**
  - Given the auto file content is 5 000 characters and the budget is exceeded with no manual files.
  - When `buildPrompt()` is called.
  - Then the auto file content in the assembled prompt is at least 500 characters and the prompt length is within budget.
- **Priority:** must
- **Satisfies:** RESEARCH-CCS-001 (Q1 — token cap; MIN_ACTIVE_FILE_CHARS)

---

### REQ-CCS-028 — Obsidian Sync API key disclosure notice

- **Pattern:** ubiquitous
- **Statement:** The system shall display a notice in the API key settings field description informing the user that if Obsidian Sync is enabled, the API key will be included in the sync.
- **Acceptance:**
  - Given the user opens Settings > Specorator and reads the Anthropic key field description.
  - When the description text is read.
  - Then it contains a statement that the key will be synced if Obsidian Sync is active, and recommends using a key scoped to personal devices.
- **Priority:** must
- **Satisfies:** IDEA-CCS-001 (constraints); `PluginSettings.ts` code comment (C.7)

---

## Non-functional requirements

> Steering documents (`docs/steering/quality.md`, `docs/steering/operations.md`) are stubs at the time of writing. All thresholds below are introduced by this PRD and must be tracked against the code that is already merged to `develop`. Any future update to the steering docs that contradicts these thresholds requires a superseding PRD amendment.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-CCS-001 | correctness | `buildPrompt()` is a pure function with no side effects | Verified by unit tests; no I/O or state mutations permitted |
| NFR-CCS-002 | performance | `ClaudeCliPort.startup()` must not block the `onload()` path | Startup is deferred to `onLayoutReady`; `onload()` completes before startup begins |
| NFR-CCS-003 | reliability | Query timeout clamped to [1 000, 300 000] ms; default 30 000 ms | Values outside range are silently clamped by the adapter; never exposed in error messages |
| NFR-CCS-004 | testability | `MockClaudeCliPort` supports configurable `available`, `cannedResponse`, `queryError`, `delayMs`, and `queryLog` | All error modes exercisable in unit tests without subprocess infrastructure |
| NFR-CCS-005 | security | `anthropicApiKey` must never appear in log output | `LoggerPort` calls in the adapter must not include the key value; `_mapError` must redact auth errors |
| NFR-CCS-006 | security | API key input masked in settings UI | `inputEl.type = 'password'` and `autocomplete = 'off'` enforced on the settings field |
| NFR-CCS-007 | reliability | `ClaudeCliPort.shutdown()` must be synchronous and must not throw | Called from Obsidian's synchronous `onunload()` path; fire-and-forget is acceptable |
| NFR-CCS-008 | correctness | `buildPrompt()` hard-truncates at the character budget as a last resort | Prompt length never exceeds `tokenCap × 4` characters under any input |
| NFR-CCS-009 | accessibility | Degraded state headings receive programmatic focus on mount | `tabindex="-1"` and `focus()` called on the first heading when the panel is not available |
| NFR-CCS-010 | accessibility | Context chip remove buttons carry accessible labels | `aria-label="Remove <filename> from context"` present on every remove button |
| NFR-CCS-011 | portability | `ClaudeCliPort` interface file must not import from `obsidian` or `@anthropic-ai/claude-agent-sdk` | Enforced by ESLint `no-restricted-imports` on domain layer files |
| NFR-CCS-012 | plain language | No AI terminology, system-prompt references, or methodology jargon in UI copy | "token", "context window", "system prompt", "Claude CLI", "SDK", "subprocess" must not appear in user-visible strings |

---

## Success metrics

- **North star:** Percentage of active Specorator users who send at least one chat message per session within 30 days of the feature shipping.
- **Supporting — setup completion rate:** Percentage of users who arrive at the API-key-missing degraded state and subsequently enter a valid key within the same session.
- **Supporting — send success rate:** Percentage of submitted messages that result in a successful response (status transitions to `idle` with non-null `response`), as a proxy for adapter reliability.
- **Supporting — truncation notice rate:** Percentage of successful responses where `truncated === true`; validate whether the 50 000-token default is appropriate for real vault sizes.
- **Counter-metric:** Rate of unhandled errors reaching the Obsidian console (i.e., errors not mapped to a `ClaudeCliErrorCode`). An increase indicates the error-mapping coverage in the adapter is incomplete.

---

## Release criteria

- [ ] All `must`-priority functional requirements (REQ-CCS-001 through REQ-CCS-028) have passing acceptance tests.
- [ ] All NFRs met, with particular attention to NFR-CCS-005 (no key in logs) and NFR-CCS-011 (no forbidden imports on `ClaudeCliPort`).
- [ ] `npm run verify` passes on `develop` (typecheck, lint, unit tests, build, standalone build).
- [ ] Unit tests cover `buildPrompt()` with at minimum: zero context files, single auto file within budget, manual file LIFO removal, auto file floor trimming, and hard-truncation fallback.
- [ ] Unit tests cover `MockClaudeCliPort`: default unavailable, canned success response, each `ClaudeCliErrorCode`, and `delayMs` simulation.
- [ ] `ChatSidebar` component tests (with PageObject) cover: available ready state, API-key-missing degraded state, SDK-unavailable degraded state, mobile degraded state, send loading state, send success, timeout error, and query_failed error.
- [ ] No user-visible string contains "token", "context window", "system prompt", "Claude CLI", "SDK", or "subprocess".
- [ ] The `ClaudeCliPort` interface file passes static import audit (no `obsidian` or `@anthropic-ai/claude-agent-sdk` imports).
- [ ] QA sign-off on all degraded states against a live Obsidian install (no API key, valid API key, mobile).

---

## Open questions / clarifications

None. All clarifications resolved before acceptance.

---

## Out of scope

The following items are explicitly excluded from this release cycle. They are candidates for v1.x or v2.0 planning.

- Conversation history persistence (vault file or plugin settings).
- Multi-turn responses (`maxTurns > 1`).
- Streaming token-by-token rendering (`ClaudeCliPort.queryStream()`).
- Write-operation proposal and review cards.
- Stage-aware or persona-aware suggested conversation starters.
- Layer 1–4 context injection (persona, workflow state, stage metadata).
- Provider selection, model configuration, or temperature controls.
- `obsidian://specorator?action=send-message` URI handler (returns "not yet implemented" notice in v1).
- Multi-agent orchestration integration.
- Background worker or main-process IPC for API key isolation (RISK-CCS-006 mitigation deferred).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable.
- [x] NFRs listed with targets.
- [x] Success metrics defined (including a counter-metric).
- [x] Release criteria stated.
- [x] No open clarifications.
