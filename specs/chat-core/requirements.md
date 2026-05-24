---
id: PRD-CC-001
title: Chat core (P1) — ChatRuntime port + Claude CLI provider + single-thread streaming chat
stage: requirements
feature: chat-core
area: CC
epic: claudian-reboot
phase: P1
status: draft        # draft | proposed | accepted | superseded
owner: pm
inputs:
  - specs/claudian-reboot/parity-charter.md      # §1 constraints, §3.1/§3.3/§3.6, §4 (P1 row), §5 parity acceptance, §6 ADR flags
  - specs/claudian-reboot/claudian-audit-frontend.md   # chat stream + composer-send surfaces
  - specs/claudian-reboot/claudian-audit-backend.md    # ChatRuntime port + Claude provider + streaming seam
created: 2026-05-24
updated: 2026-05-24
---

# PRD — Chat core (P1)

## Summary

P1 is the first vertical chat slice of the **claudian-reboot** epic, built on the gutted
P0 shell (`plugin-shell-reboot`: six ADR-008 ports, three bridges, `Result<T,E>`, typed
`EventBus`, Pinia + i18n, and an empty `AgentPanelRoot` agent sidebar). It delivers a
**provider-agnostic `ChatRuntime` port**, a single **Claude provider over the user's own
`claude` CLI login**, a **single-thread** conversation, **token-by-token streaming**, a
**basic user/assistant message render** (plain text + minimal markdown), and a **minimal
send-only composer**. The P0 empty placeholder is replaced by a working chat surface inside
the existing agent sidebar.

Audience: an Obsidian desktop user who has the `claude` CLI installed and logged in and
wants to chat with Claude from inside Obsidian. P1 reproduces the *core conversational loop*
of Claudian (`D:\Projects\claudian-main`) — send → stream `text` chunks accumulated into the
assistant message → `done` terminates — within the Specorator architecture, with
**perceptual** (not pixel) parity. The streaming contract mirrors Claudian's real solution
exactly: `ChatRuntime.query(...)` returns an `AsyncGenerator<StreamChunk>` over ONE normalized
discriminated union (`src/core/types/chat.ts:137`); P1 emits the subset
`{ assistant_message_start?, text, error, done, usage }`, accumulating `text.content` onto the
assistant message and finalising on `done`. There is no "text-delta" and no terminal "final"
chunk — `done` is the terminator. It is deliberately the smallest slice that is usable; all
rich rendering, composer power, tabs, history, toolbar widgets, approvals, and additional
providers are later phases that **add members to the same union and handlers to the same
controller** without redesign.

## Goals

- G1 — Establish a provider-agnostic `ChatRuntime` seam (port) so the chat UI never touches
  Node/subprocess/`obsidian`, and Mock/LocalStorage bridges can drive the chat with no CLI.
- G2 — Ship one working Claude provider behind that seam, driving the user's own `claude` CLI
  login (no stored secret).
- G3 — Deliver the end-to-end single-thread conversational loop mirroring Claudian: send a
  user message, accumulate streamed `text` chunks onto the live assistant message, finalise on
  `done` (no terminal "final" chunk).
- G4 — Replace the P0 empty agent-sidebar placeholder with the live chat surface, including
  the empty / loading / streaming / error visual states.
- G5 — Reproduce the Claudian chat-stream and send-composer surfaces at **perceptual** parity
  through `--sp-*` tokens (charter §1, §5), keeping Specorator identity.

## Non-goals

- NG1 — **No multiple threads, tabs, history, resume, fork, rewind, or compact.** Single
  thread only (charter P3).
- NG2 — **No rich rendering**: no tool-call, thinking, todo, write/edit diff, collapsible,
  subagent, usage-meter, or inline interactive blocks (charter P2/P4). Assistant content is
  plain text + minimal markdown only.
- NG3 — **No composer power**: no slash `/`, skills `$`, `@mention`, instruction `#`, plan
  mode `Shift+Tab`, bang-bash `!`, queue/steer row, or attachments (charter P4/P5).
- NG4 — **No toolbar control strip**: no model/mode/permission/thinking/service-tier/MCP
  selectors or context meter (charter P6). The only toolbar control is **send**.
- NG5 — **No approvals / permissions / inline-edit / word-diff** (charter P4/P7).
- NG6 — **No Codex or Opencode provider, no provider registry UI, no model routing**
  (charter P9). P1 ships ONE provider (Claude CLI) created directly; Claudian's full
  `ProviderRegistration` (`providers/types.ts:55` — capabilities, chatUIConfig, reconcilers,
  history, subagent adapters) is P9/registry scope. The `ProviderRegistryPort` seam is kept
  **only if stubbing it costs nothing**; otherwise the registry defers entirely to P9. A
  minimal `ProviderCapabilities`-style flag set is optional for P1.
- NG7 — **No MCP client / config / selector** (charter P6/P8).
- NG8 — **No settings UX** for chat (charter P10). P1 uses existing `PluginSettings` only.
- NG9 — **No new locales** beyond the existing en/de stub (charter P11).
- NG10 — **No stored secret** and **no API-key transport**. `SecretStorePort` and its ADR
  defer to the first API-key provider (later phase). See NFR-CC-006 and CLAR-CC-002.
- NG11 — **No backwards compatibility / migration** of any prior chat state (charter
  CHARTER-REQ-FRESH). Load-or-default only.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Obsidian power user with `claude` CLI logged in | Chat with Claude inside Obsidian without leaving the vault | Primary P1 user; the conversational loop must work end-to-end with their own login |
| Plugin developer running `npm run dev` (MockBridge) | Drive the chat UI with a canned stream, no CLI/Node | The port + Mock bridge make UI work and tests possible without a live provider |
| GitHub Pages demo visitor (LocalStorageBridge) | See the chat surface replay a fixture transcript | Demo must not require a subprocess; the seam degrades gracefully on web |
| Architect (downstream, P1 design) | A blessed `ChatRuntime` port shape before design | The async-generator `query` + (deferred) callback-setter extension pattern bends ADR-008's method-only style; needs an ADR (CLAR-CC-001) mirroring `ChatRuntime.ts` |
| Reviewer / brand-reviewer | Perceptual + token + interaction parity evidence vs claudian-main | Charter §5 gates the phase on screenshot + token-mapping review |

## Jobs to be done

- When I have the `claude` CLI installed and logged in, I want to open the agent sidebar and
  type a message, so I can get a streamed answer from Claude without leaving Obsidian.
- When I send a message, I want to watch the assistant reply appear token-by-token as `text`
  chunks accumulate, so the chat feels responsive (parity with Claudian's streaming feel).
- When the provider is unavailable (CLI missing / not logged in / error), I want a clear,
  non-blocking error in the conversation, so I know what failed and what to do next.
- When I am running `npm run dev` or the GitHub Pages demo, I want the chat to work against a
  canned/fixture stream, so I can build and review the UI without a live provider.

## Functional requirements (EARS)

> EARS five patterns: **ubiquitous** ("The `<system>` shall …"), **event-driven** ("When
> `<trigger>`, the `<system>` shall …"), **state-driven** ("While `<state>`, the `<system>`
> shall …"), **optional-feature** ("Where `<feature>`, the `<system>` shall …"),
> **unwanted-behaviour** ("If `<condition>`, then the `<system>` shall …"). One requirement
> per entry; the system is named explicitly; the response is testable.

### REQ-CC-001 — ChatRuntime port streams a turn via an async generator over the StreamChunk union

- **Pattern:** ubiquitous
- **Statement:** *The `ChatRuntimePort` shall expose `query(turn, conversationHistory?,
  queryOptions?): AsyncGenerator<StreamChunk>` that, given a prepared turn and prior
  conversation history, yields normalized `StreamChunk` values terminated by exactly one
  `done` chunk (or an `error` chunk on failure).*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:33`
  (`query(turn, conversationHistory?, queryOptions?): AsyncGenerator<StreamChunk>`) — the
  parity-critical streaming heart. There is **no** "text-delta" and **no** terminal "final"
  chunk: `text` chunks carry incremental content and `done` terminates the stream.
- **Acceptance:**
  - Given the `ChatRuntimePort` interface and a `MockBridge` runtime scripted to yield
    `text` chunks `["Hel", "lo"]` then `done`,
  - When a test calls `query(turn, [])` and iterates the async generator,
  - Then it receives, in order, `{type:'text',content:'Hel'}`, `{type:'text',content:'Lo'}`,
    `{type:'done'}`; the generator completes after `done`; and the concatenation of the
    `text.content` values equals the scripted text `"Hello"`.
- **Priority:** must
- **Satisfies:** charter §3.6 ChatRuntime seam (P1 row), backend-audit "ChatRuntime contract",
  CLAR-CC-001, CLAR-CC-003
- **Refines into:** design ADR for the port shape (CLAR-CC-001); spec `SPEC-CC-*` port contract

### REQ-CC-001a — The StreamChunk union mirrors Claudian's normalized contract; P1 emits a subset

- **Pattern:** ubiquitous
- **Statement:** *The P1 `StreamChunk` type shall be declared as one discriminated union that
  mirrors Claudian's member names and shapes, and the P1 runtime shall emit only the subset
  `assistant_message_start?` | `{ type:'text'; content:string }` | `{ type:'error';
  content:string }` | `{ type:'done' }` | `{ type:'usage'; usage; sessionId? }`, leaving later
  members (`thinking`, `tool_use`, `tool_result`, `tool_output`, `context_compacted`, subagent
  variants) to be added in their phases without renaming or redesign.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\core\types\chat.ts:137` — the
  normalized `StreamChunk` union with the contract comment "All providers must emit: text,
  tool_use, tool_result, error, done, usage." `UsageInfo` is `chat.ts:165`.
- **Acceptance:**
  - Given the P1 `StreamChunk` type declaration,
  - When a maintainer reads it against `chat.ts:137`,
  - Then every P1 member name and shape (`text {content}`, `error {content}`, `done`,
    `usage {usage, sessionId?}`, optional `assistant_message_start {itemId?}`) is byte-for-byte
    name-and-field compatible with the Claudian member, and no P1-invented member name exists
    (no `text-delta`, no `final`); deferred members are documented as additive for P2+.
- **Priority:** must
- **Satisfies:** charter §3.6 (parity-critical contract), backend-audit "StreamChunk taxonomy",
  CLAR-CC-001, REQ-CC-001
- **Refines into:** design (StreamChunk union type + ADR), spec (type contract), tests

### REQ-CC-002 — Chat UI consumes the runtime only through the port (no Node / no obsidian in UI)

- **Pattern:** ubiquitous
- **Statement:** *The chat UI shall obtain the chat runtime solely through the injected
  `ChatRuntimePort` and shall not import `obsidian`, `node:child_process`, or any
  provider-specific module.*
- **Reproduces (Claudian):** Claudian is not DDD-layered (imperative DOM + direct subprocess);
  the reboot quarantines all subprocess/transport in infrastructure behind the port (backend
  audit "Port placement" / "Desktop / Node-subprocess concerns").
- **Acceptance:**
  - Given the chat UI source under `src/ui/`,
  - When ESLint (`no-restricted-imports`) and the import-direction lint run,
  - Then no chat UI file imports `obsidian`, `node:*`, or a `src/infrastructure/agent/**`
    module; the runtime arrives via the port `InjectionKey` only.
- **Priority:** must
- **Satisfies:** charter §1 (ports + DDD), CLAUDE.md narrow-ports rule, NFR-CC-001
- **Refines into:** design (layer placement), spec (injection wiring)

### REQ-CC-002a — The P1 ChatRuntimePort surface is the streaming + lifecycle subset of Claudian's runtime

- **Pattern:** ubiquitous
- **Statement:** *The `ChatRuntimePort` shall expose, for P1, exactly: `readonly providerId`,
  `prepareTurn(request)`, `ensureReady(options?): Promise<boolean>`, `query(turn, history?,
  options?): AsyncGenerator<StreamChunk>`, `cancel(): void`, `getSessionId(): string | null`,
  `resetSession(): void`, `onReadyStateChange(listener): () => void`, and `isReady(): boolean`
  — and shall NOT expose the tool/approval/plan callback setters, subagent, rewind, or steer
  members in P1.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:20` —
  the full `ChatRuntime` interface. P1 takes the streaming + lifecycle subset
  (`providerId` :21, `prepareTurn` :24, `onReadyStateChange` :25, `ensureReady` :32,
  `query` :33, `cancel` :39, `resetSession` :40, `getSessionId` :41, `isReady` :43). The
  callback setters (`setApprovalCallback` :48, `setAskUserQuestionCallback` :50,
  `setExitPlanModeCallback` :51, `setAutoTurnCallback` :54) and `rewind` :47 / `steer` :38 /
  subagent members are REAL in Claudian but belong to P2–P4 and are deferred; the port grows
  per phase.
- **Acceptance:**
  - Given the P1 `ChatRuntimePort` interface,
  - When a maintainer compares it to `ChatRuntime.ts:20`,
  - Then it declares only the nine listed members with matching signatures, and no
    callback-setter / `rewind` / `steer` / subagent member is present; the omitted members are
    documented as additive for their phases (P2 tools, P3 history/rewind, P4 approvals/plan).
- **Priority:** must
- **Satisfies:** charter §3.6 (port surface), CLAR-CC-001, REQ-CC-001
- **Refines into:** design ADR (CLAR-CC-001 — bless the shape), spec (port contract), tests

### REQ-CC-003 — Sending a user message dispatches a turn through the runtime

- **Pattern:** event-driven
- **Statement:** *When the user submits a non-empty message, the chat session shall append the
  user message to the single-thread conversation, call `prepareTurn({ text })` to build a
  `PreparedChatTurn`, and start `query(preparedTurn, conversationHistory)` through the
  `ChatRuntimePort`.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:24`
  (`prepareTurn(request: ChatTurnRequest): PreparedChatTurn`) feeding `query(...)` at
  `ChatRuntime.ts:33`; `ChatTurnRequest` / `PreparedChatTurn` shapes at
  `D:\Projects\claudian-main\src\core\runtime\types.ts:45` and `:56` (P1 uses at least
  `request.text`). User message appended to the message array.
- **Acceptance:**
  - Given an idle conversation and a non-empty composer value,
  - When the user submits the message,
  - Then a user message with that exact text is appended to the conversation, the composer is
    cleared, `prepareTurn` is called once with `{ text }`, and exactly one `query(preparedTurn,
    history)` is started on the port with history containing the new user message.
- **Priority:** must
- **Satisfies:** charter §3.3 composer-core (P1), frontend-audit "Composer core", REQ-CC-001
- **Refines into:** design (chat session store), spec (turn dispatch), tasks/tests

### REQ-CC-004 — `text` chunks accumulate onto the live assistant message and render incrementally

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `text` chunk during a turn, the chat surface shall
  append `chunk.content` to the live assistant message's `content` and incrementally render the
  growing message.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\features\chat\controllers\StreamController.ts:116`
  (`handleStreamChunk`) — the assistant `ChatMessage` for the turn is created up front; on each
  `case 'text'` it runs `msg.content += chunk.content` then `appendText(chunk.content)` to the
  active element (the token-by-token "streaming feel"; backend audit "Parity-critical:
  streaming feel"). This is text-accumulate, not a delta-reducer.
- **Acceptance:**
  - Given an in-progress turn whose Mock runtime yields `text` chunks `["Hel", "lo", " world"]`
    then `done`,
  - When each `text` chunk is handled,
  - Then `msg.content` is observably updated after each chunk (`"Hel"` → `"Hello"` →
    `"Hello world"`) and the live assistant message reads `"Hello world"` before `done`
    (assertable via the message PageObject across chunk ticks).
- **Priority:** must
- **Satisfies:** charter §3.1 message stream (P1), frontend-audit "Message stream", REQ-CC-001,
  REQ-CC-001a
- **Refines into:** design (streaming state in store), spec (text-accumulate handler), tests

### REQ-CC-005 — A `done` chunk finalises the assistant message; there is no terminal "final" chunk

- **Pattern:** event-driven
- **Statement:** *When the runtime yields the `done` chunk for a turn, the chat session shall
  finalise the live assistant message as a stored assistant message and return the conversation
  to the idle state.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\features\chat\controllers\StreamController.ts:200`
  (`case 'done'`) — `done` is the stream terminator (it flushes pending work); the assistant
  message has been assembled in place by the preceding `text` chunks, so finalisation happens
  on `done`, not via a separate "final message" chunk.
- **Acceptance:**
  - Given a streaming turn that has emitted its `text` chunks,
  - When the `done` chunk is yielded and the async generator completes,
  - Then the assistant message is marked final (no longer streaming) with `content` equal to
    the accumulated text, the conversation state is idle, and the composer is re-enabled for the
    next message. No separate "final" chunk is consumed.
- **Priority:** must
- **Satisfies:** charter §3.1 (P1), REQ-CC-001, REQ-CC-001a, REQ-CC-004
- **Refines into:** design, spec (turn lifecycle), tests

### REQ-CC-005a — A `usage` chunk updates context usage without altering message content

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `usage` chunk, the chat session shall update the
  conversation's context-usage state from `chunk.usage` and shall not modify any assistant
  message content.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\features\chat\controllers\StreamController.ts:217`
  (`case 'usage'`) — sets `state.usage = chunk.usage` (model-merged); `UsageInfo` is `chat.ts:165`.
  P1 stores usage but the context-meter UI is P6 (NG4) — P1 keeps the state seam only.
- **Acceptance:**
  - Given a streaming turn whose Mock runtime yields a `usage` chunk before `done`,
  - When the `usage` chunk is handled,
  - Then the conversation's usage state reflects `chunk.usage` and no assistant message
    `content` changes as a result of the `usage` chunk.
- **Priority:** should
- **Satisfies:** charter §3.6 (usage in the contract subset), REQ-CC-001a
- **Refines into:** design (usage state seam), spec, tests

### REQ-CC-006 — User and assistant messages render with role-distinct styling and minimal markdown

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render user messages and assistant messages — each a
  `ChatMessage` with `{ id, role:'user'|'assistant', content, timestamp }` (P1 may also use the
  optional `durationSeconds?` / `displayContent?`) — as visually distinct turns, rendering
  message `content` with minimal markdown (paragraphs, inline code, line breaks) and without
  raw HTML injection.*
- **Reproduces (Claudian):** `ChatMessage` shape at
  `D:\Projects\claudian-main\src\core\types\chat.ts:39` — P1 fields = `id` / `role` / `content`
  / `timestamp` (+ optional `durationSeconds?` / `displayContent?`); the `contentBlocks?`,
  `toolCalls?`, and `images?` fields are P2+ and are **excluded from the P1 require** (they
  regrow with rich rendering, attachments). Single-thread `ChatMessage[]` array — no
  `Conversation` / threads in P1 (P3). Styling: `components/messages.css` — **asymmetric
  bubbles**: user has a background + right alignment + clipped bottom-trailing corner; assistant
  is transparent, full-width, left-aligned with a clipped bottom-leading corner;
  `line-height:1.5`, tight paragraph margins. Rich block types (tool/thinking/diff) are
  explicitly P2.
- **Acceptance:**
  - Given a conversation with one user message and one assistant message containing a short
    markdown string (a paragraph with `inline code`),
  - When the surface renders,
  - Then the user and assistant messages carry distinct `data-testid`s and distinct
    role/visual treatment, the inline code renders as a code element, and no `v-html` /
    `innerHTML` is used (lint-enforced).
- **Priority:** must
- **Satisfies:** charter §3.1 message render (P1), frontend-audit "Message stream", NFR-CC-002,
  NFR-CC-008
- **Refines into:** design (Part B token map: `--sp-msg-user-bg`, `--sp-msg-radius`,
  `--sp-msg-radius-clip`, `--sp-msg-gap`), spec, tests

### REQ-CC-007 — A minimal composer supports text entry and send

- **Pattern:** ubiquitous
- **Statement:** *The composer shall present an auto-growing multi-line text field and a send
  control, and the send control shall dispatch the composer's current value as a user message.*
- **Reproduces (Claudian):** `components/input.css` — single bordered rounded wrapper with a
  borderless transparent auto-grow textarea; `ui/textareaResize.ts`. Send is the one P1
  toolbar control (the full control strip is P6, charter §3.5 — out of scope).
- **Acceptance:**
  - Given the composer with text entered,
  - When the user activates the send control,
  - Then REQ-CC-003 fires for that text; and given an empty/whitespace-only composer, the send
    control does not dispatch a turn.
- **Priority:** must
- **Satisfies:** charter §3.3 composer-core (P1), frontend-audit "Composer core", REQ-CC-003
- **Refines into:** design (`ChatInput.vue` shell, token map `--sp-input-*`), spec, tests

### REQ-CC-008 — Enter sends and Shift+Enter inserts a newline

- **Pattern:** event-driven
- **Statement:** *When the user presses Enter in the composer without Shift and without an
  active IME composition, the chat session shall submit the message; when the user presses
  Shift+Enter, the composer shall insert a newline and not submit.*
- **Reproduces (Claudian):** the managers' `!e.shiftKey && !e.isComposing` send check;
  Shift+Enter = newline (frontend-audit keyboard-shortcut map, P1 rows).
- **Acceptance:**
  - Given the composer with non-empty text and no active IME composition,
  - When the user presses Enter without Shift, then the message is submitted (REQ-CC-003);
  - When the user presses Shift+Enter, then a newline is inserted and no turn starts;
  - When the user presses Enter during an IME composition, then no submit occurs.
- **Priority:** must
- **Satisfies:** charter §5 interaction parity, frontend-audit keyboard map, REQ-CC-007
- **Refines into:** design (key handler), spec, tests

### REQ-CC-009 — The composer is disabled and a streaming indicator shows while a turn is in progress

- **Pattern:** state-driven
- **Statement:** *While a turn is streaming, the chat surface shall show a streaming/busy
  indicator and shall prevent a new turn from being started by send or Enter.*
- **Reproduces (Claudian):** runtime `isReady()`
  (`D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:43`) /
  `onReadyStateChange(listener)` (`ChatRuntime.ts:25`) drive the toolbar's enabled state
  (backend audit "Lifecycle"); P1 simplification — no queue/steer (that is P4, out of scope;
  see NG3).
- **Acceptance:**
  - Given a turn that is currently streaming,
  - When the user attempts to send or presses Enter,
  - Then no second turn is started, and a streaming/busy indicator is visible; and once the
    turn finalises (REQ-CC-005), the composer is re-enabled.
- **Priority:** must
- **Satisfies:** charter §5 states (streaming), backend-audit lifecycle, REQ-CC-005
- **Refines into:** design (busy state in store), spec, tests

### REQ-CC-010 — An in-progress turn can be aborted

- **Pattern:** event-driven
- **Statement:** *When the user requests cancellation of an in-progress turn, the chat session
  shall call the runtime's `cancel()` operation, stop applying further `text` chunks, finalise
  the partial assistant message as interrupted, and return the conversation to idle.*
- **Reproduces (Claudian):** runtime `cancel(): void`
  (`D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:39`) lifecycle;
  `components/messages.css` **Interrupt state** — `Interrupted` in red with a muted hint. (P1
  reproduces interrupt state; the "What should X do instead?" steer microcopy is P4, out of
  scope.)
- **Acceptance:**
  - Given a streaming turn,
  - When cancellation is requested,
  - Then `cancel()` is invoked on the port, no further `text` chunks mutate the message, the
    partial assistant message is marked interrupted, and the conversation returns to idle.
- **Priority:** should
- **Satisfies:** charter §5 states, backend-audit lifecycle/cancel, REQ-CC-001
- **Refines into:** design (cancel wiring), spec, tests

### REQ-CC-011 — An empty conversation shows a welcome/empty state

- **Pattern:** state-driven
- **Statement:** *While the conversation has no messages, the chat surface shall show a
  welcome/empty state and shall hide it once the first message is sent.*
- **Reproduces (Claudian):** `components/messages.css` welcome/empty state — centered greeting,
  hidden (`.claudian-hidden`) on first send. (Serif-font identity is a Specorator brand
  decision — see CLAR-CC-004.)
- **Acceptance:**
  - Given a conversation with zero messages,
  - When the chat surface renders, then the empty/welcome state is visible;
  - When the first user message is sent, then the empty/welcome state is no longer visible.
- **Priority:** should
- **Satisfies:** charter §5 states (empty), frontend-audit "Welcome / empty state"
- **Refines into:** design (`WelcomeGreeting.vue` shell, token `--sp-welcome-*`), spec, tests

### REQ-CC-012 — Runtime errors surface as a non-blocking in-conversation error

- **Pattern:** unwanted-behaviour
- **Statement:** *If the runtime yields an `error` chunk or the turn fails to start, then the
  chat surface shall render the `error.content` inline in the conversation, return to idle, and
  re-enable the composer — without using `window.confirm`/`alert` or raw HTML.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\features\chat\controllers\StreamController.ts:194`
  (`case 'error'`) — the `error` chunk's `content` is appended inline to the assistant message
  (`appendText("...Error: " + chunk.content)`); the generator carries error as the
  `{ type:'error'; content }` union member (`chat.ts:145`), not as a per-chunk `Result`.
  Friendly start-failure mapping (missing CLI/Node) also routes through `NotificationPort`.
- **Acceptance:**
  - Given a Mock runtime scripted to yield `{type:'error',content:'...'}` (or to fail
    `ensureReady`),
  - When a turn is started,
  - Then the `error.content` is rendered inline in the conversation describing the failure, the
    conversation returns to idle, the composer is re-enabled, and no blocking dialog or
    `innerHTML`/`v-html` is used (lint-enforced).
- **Priority:** must
- **Satisfies:** charter §5 states (error), CLAUDE.md DOM rules, NFR-CC-008, REQ-CC-001
- **Refines into:** design (error state), spec (error chunk variant), tests

### REQ-CC-013 — The Claude provider drives the user's own CLI login with no stored secret

- **Pattern:** ubiquitous
- **Statement:** *The Claude provider runtime shall implement the `ChatRuntimePort` by spawning
  the user's installed `claude` CLI subprocess and adapting its streamed output
  (stream-json / NDJSON) into the `StreamChunk` union, using the CLI's own session/login, and
  shall not read, write, or require any API key, token, or secret stored by the plugin.*
- **Reproduces (Claudian):** the Claude runtime created by
  `ProviderRegistration.createRuntime` (`D:\Projects\claudian-main\src\core\providers\types.ts:63`);
  the deleted P0-history `ClaudeSubprocessAdapter` + `StreamDeltaReducer` (charter §7 reference,
  develop/history) drove the user's own `claude` login (no key) and reduced CLI output into
  chunks. Backend audit "Subprocess spawning" — `customSpawn`, CLI/Node discovery. This is an
  infrastructure adapter: process-spawning lives behind the runtime port; Vue/domain never
  spawn (REQ-CC-002).
- **Acceptance:**
  - Given the production Claude provider runtime,
  - When it prepares and executes a turn,
  - Then it spawns the resolved `claude` CLI invocation only, adapts its streamed output into
    `text`/`error`/`done`/`usage` chunks (REQ-CC-001a), and a review of the runtime source plus
    a check of `data.json` confirms no API key / token / secret is read or persisted by the
    plugin (NFR-CC-006).
- **Priority:** must
- **Satisfies:** charter §3.6 Claude provider (P1), CLAR-CC-002, NFR-CC-006, REQ-CC-001a
- **Refines into:** design (provider impl in infrastructure, CLI→StreamChunk adapter), spec
  (CLI invocation + output-adaptation contract), tasks/tests

### REQ-CC-014 — All three bridges supply a runtime; non-desktop bridges supply a scripted/fixture stream

- **Pattern:** ubiquitous
- **Statement:** *Each of the three bridges shall provide a `ChatRuntimePort` implementation:
  the production bridge a real Claude CLI subprocess runtime, the mock bridge a scripted
  in-memory async generator yielding `text`/`done` chunks, and the localStorage bridge a
  fixture-replay async generator — with no subprocess on the non-desktop bridges.*
- **Reproduces (Claudian):** backend audit "Bridge" rows for ChatRuntime — ObsidianBridge =
  real subprocess; MockBridge = scripted `AsyncGenerator<StreamChunk>`; LocalStorageBridge =
  fixture replay. (Claudian itself is single-runtime; the three-bridge fan-out is the reboot's
  DDD adaptation of the same port.)
- **Acceptance:**
  - Given each of the three bridges,
  - When the chat surface requests a runtime,
  - Then a runtime is provided; the mock runtime's `query(...)` yields a scripted
    `text…done` chunk sequence and the localStorage runtime replays a fixture transcript,
    neither spawning a subprocess; and `npm run dev` shows a working chat against the mock
    runtime.
- **Priority:** must
- **Satisfies:** charter §1 (three bridges), backend-audit bridge mapping, REQ-CC-001, REQ-CC-002
- **Refines into:** design (bridge wiring), spec, tests

### REQ-CC-015 — The agent sidebar mounts the chat surface in place of the P0 placeholder

- **Pattern:** ubiquitous
- **Statement:** *The agent sidebar view shall mount the chat surface as its content, replacing
  the P0 empty placeholder, and shall provide the `ChatRuntimePort` to the chat UI alongside
  the existing core ports.*
- **Reproduces (Claudian):** the chat lives in the plugin's sidebar view; P0 `AgentSidebarView`
  + `AgentPanelRoot` (the empty placeholder, `data-testid="agent-panel-empty"`) is the mount
  point being replaced.
- **Acceptance:**
  - Given the plugin loads and the agent sidebar opens,
  - When the view renders,
  - Then the chat surface (composer + message area) is present instead of the
    `agent-panel-empty` placeholder, and the `ChatRuntimePort` is provided to the Vue app via
    its `InjectionKey` together with the six core ports.
- **Priority:** must
- **Satisfies:** charter §4 (P1 surfaces: container, header), REQ-CC-002, REQ-CC-014
- **Refines into:** design (view + provide wiring), spec, tests

## Non-functional requirements

> Inherited project defaults are **restated** here (not linked), per the PRD contract.
> Baseline-relative parity targets (NFR-CC-011) capture the baseline from `claudian-main` on
> the `next` integration branch before P1 implementation; pair with a baseline-capture task in
> `tasks.md`.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-CC-001 | architecture | DDD inward-only imports (domain ← application ← infrastructure ← ui; plugin imports all). All Obsidian/CLI/Node access behind narrow ports + the three bridges; Vue never imports `obsidian` or `node:*`. | ESLint import-direction + `no-restricted-imports` green; zero violations |
| NFR-CC-002 | accessibility | WCAG conformance for the chat + composer surfaces; keyboard-operable send (Enter/Shift+Enter), focus management, forced-colors + reduced-motion support (charter §1 "meet or beat" Claudian's `accessibility.css`). | WCAG 2.2 AA |
| NFR-CC-003 | error-handling | Domain methods and use cases return `Result<T,E>` for non-streaming operations; `query` is an `AsyncGenerator<StreamChunk>` that carries failure as the `{ type:'error'; content }` union member (`chat.ts:145`), not as a per-chunk `Result`. No throwing across the port for expected failures. | 100% of P1 non-streaming port/use-case methods return `Result`; streaming errors arrive as `error` chunks |
| NFR-CC-004 | code-style | Vue components use `<script setup>`; no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`; no `window.confirm`/`alert`/`prompt`. | ESLint `no-restricted-properties` + `vue/no-v-html` + `no-restricted-globals` green |
| NFR-CC-005 | testability | Tests mirror `src/` path-for-path; mounted components have co-located `data-testid` PageObjects; no CSS-class/id selectors in tests. Coverage thresholds enforced. | 80/70/80/80 (stmts/branches/funcs/lines); PageObject + data-testid only |
| NFR-CC-006 | security / privacy | P1 stores **no secret**. No API key, token, or secret is read from or written to `data.json` (or any plugin store). The Claude provider uses only the user's own `claude` CLI login. `SecretStorePort` and its ADR defer to the first API-key transport (later phase). | Zero secrets in `data.json`; no `SecretStorePort` usage in P1 |
| NFR-CC-007 | compatibility / manifest | `manifest.json` `id`, `version`, and `minAppVersion` (1.12.7) are not modified by P1. Desktop-only (subprocess provider). | manifest identity unchanged; desktop-only |
| NFR-CC-008 | security (DOM/XSS) | Message content (incl. minimal markdown) is rendered XSS-safe by construction (no raw HTML injection); markdown rendering routes through a safe renderer, not `v-html`. | No raw-HTML sink in chat render path |
| NFR-CC-009 | persistence | No backwards-compat / migration. Any chat-related state loads-or-defaults; user/device-scoped settings (if touched) persist device-local, never `data.json` (charter CHARTER-REQ-SET/FRESH). | Load-or-default; no migration code |
| NFR-CC-010 | supply-chain | Any new runtime dependency records its rationale (license/maintenance/why-not-existing) per AGENTS.md §8; `ci.yml` `uses:` stay SHA-pinned; `npm audit --audit-level=high` clean. | Documented deps; SHA-pinned CI; audit clean |
| NFR-CC-011 | parity (visual) | Per-surface screenshot parity vs `claudian-main` for the P1 surfaces (message stream, composer/send, empty/loading/streaming/error states) at **320 / 520 / 720 px**, **light + dark** theme, captured under `specs/chat-core/parity-screenshots.md`. Perceptual (not pixel) parity. | Side-by-side reads as "same product"; reviewer sign-off (charter §5.1) |
| NFR-CC-012 | parity (token) | Every Claudian CSS value the P1 surfaces reproduce maps to a `--sp-*` token (no raw Obsidian var or hardcoded hex leak in components); the `lint-style-tokens` guard (AUX, regrowing) passes. | Zero raw-var/hex leaks in P1 surface components |
| NFR-CC-013 | parity (interaction) | P1 keyboard + state interactions match Claudian: Enter send / Shift+Enter newline, empty→streaming→idle→error transitions, interrupt state — asserted in component tests + the screenshot set (charter §5.3). | Interaction assertions pass |
| NFR-CC-014 | performance | Streaming feels token-by-token: assistant deltas render incrementally as they arrive (no batch-on-complete); cancel is responsive. Detailed latency thresholds inherit from steering once populated. | Incremental render observable per delta; no perceptible batch delay vs baseline (NFR-CC-011) |

> **New threshold note:** the project steering docs (`docs/steering/quality.md`,
> `docs/steering/operations.md`) are not yet populated for this repo, so NFR-CC-014 states a
> qualitative streaming-feel target tied to the captured `claudian-main` baseline (NFR-CC-011)
> rather than a numeric latency. Any numeric latency target introduced later must be recorded
> here and in steering. No other NFR introduces a new numeric threshold.

## Success metrics

- **North star:** A user with the `claude` CLI logged in can send a message in the agent
  sidebar and see a streamed assistant reply complete, end-to-end, in a clean Obsidian vault.
- **Supporting:**
  - The chat surface renders and streams against the MockBridge in `npm run dev` and the
    LocalStorageBridge fixture replay, with no subprocess.
  - All P1 surface screenshots (320/520/720 px, light+dark) pass perceptual + token parity
    review against `claudian-main` (charter §5).
  - Every `must` REQ-CC-* maps 1:1 to at least one passing test (traceability green).
- **Counter-metric:** Scope leakage — zero P1 code, tokens, or components implement an
  out-of-scope surface (rich render, tabs/history, composer power, toolbar widgets, approvals,
  MCP, extra providers). Measured by the reviewer against the NG list; any leak fails the gate.

## Release criteria

What must be true to ship P1 (merge the P1 slice to `next`):

- [ ] All `must` REQ-CC-* pass their acceptance criteria with tests (REQ-CC-001, 001a, 002,
      002a, 003, 004, 005, 006, 007, 008, 009, 012, 013, 014, 015).
- [ ] `should` REQ-CC-005a (usage seam), REQ-CC-010 (abort), and REQ-CC-011 (empty state) pass,
      or are explicitly deferred with a recorded decision.
- [ ] All NFR-CC-* met, or explicitly waived with an ADR (esp. NFR-CC-006 no-secret,
      NFR-CC-007 manifest-unchanged, NFR-CC-001 ports/DDD).
- [ ] CLAR-CC-001 resolved: the `ChatRuntimePort` shape ADR is filed and accepted before P1
      design proper.
- [ ] CLAR-CC-002 and CLAR-CC-003 confirmed (secret-vacuous; P1 scope = Claude CLI single
      provider, single thread, no rich render).
- [ ] Parity screenshots captured and signed off (NFR-CC-011/012/013; charter §5.1–§5.4).
- [ ] Full verify gate green on `next`: `npm audit` + typecheck + lint + test (coverage
      80/70/80/80) + build + build:web + docs:api.
- [ ] Traceability matrix shows every requirement with a downstream chain by `/spec:review`.

## Open questions / clarifications

> Carried-forward and new clarifications. CLAR-CC-001..003 are recorded in
> `workflow-state.md`; CLAR-CC-001 must be resolved (ADR) before design proper.

- **CLAR-CC-001** — *`ChatRuntimePort` shape vs ADR-008.* Two things bend ADR-008's "narrow
  method-only" port style: (a) `query(...)` returns an `AsyncGenerator<StreamChunk>` rather than
  a `Result`-returning method, and (b) Claudian's full runtime extends itself with injected
  callback **setters** (`setApprovalCallback`/`setAskUserQuestionCallback`/
  `setExitPlanModeCallback`/`setAutoTurnCallback`, `ChatRuntime.ts:48–54`). **Owner: architect.**
  Resolution: file an ADR that **blesses the overall shape** — async-generator `query` plus the
  callback-setter extension pattern as the runtime grows per phase (mirroring
  `D:\Projects\claudian-main\src\core\runtime\ChatRuntime.ts:20`). **P1's surface is the
  streaming + lifecycle subset only** (REQ-CC-002a): `providerId`, `prepareTurn`, `ensureReady`,
  `query` (async generator over the P1 `StreamChunk` subset `{ assistant_message_start?, text,
  error, done, usage }` — REQ-CC-001a), `cancel`, `getSessionId`, `resetSession`,
  `onReadyStateChange`, `isReady`. The callback setters, `rewind`, `steer`, and subagent
  members are REAL in Claudian but DEFERRED to P2–P4; the port grows per phase without
  redesign.
- **CLAR-CC-002** — *Secrets deferred (RESOLVED for P1).* `app.secretStorage` is verified
  present at `minAppVersion 1.12.7` (`obsidian.d.ts:458`), so no manifest bump and no NG6
  escalation. P1's Claude CLI path uses the user's own `claude` login and stores **no secret**;
  `SecretStorePort` + its ADR **defer** to the first API-key transport (later phase). Encoded as
  NFR-CC-006. **Owner: pm (confirmed) / architect (defers the port).**
- **CLAR-CC-003** — *P1 scope (RESOLVED, human-confirmed).* P1 = Claude CLI single provider,
  single thread; no rich rendering (P2), no composer power (P4), no toolbar widgets (P6), no
  approvals (P7), no MCP (P8), no Codex/Opencode (P9). Encoded in Non-goals. **Owner: pm.**
- **CLAR-CC-004** *(new — design-time, non-blocking)* — *Welcome-state serif identity & playful
  microcopy.* Claudian's empty-state uses a serif greeting font and a playful "Baked for mm:ss"
  duration footer (frontend audit §3.1 open questions). Decide whether Specorator keeps a
  token-driven serif greeting / neutralises the duration-footer microcopy under Specorator
  brand. **Owner: ux-ui-designer (Part A) / brand-reviewer.** Non-blocking for requirements;
  resolve at P1 design. (Note: the duration footer itself is P2-adjacent; P1 needs only the
  empty/welcome state, REQ-CC-011.)
- **CLAR-CC-005** *(design-time, non-blocking — framing re-confirmed)* — *Minimal-markdown
  render seam.* REQ-CC-006 requires minimal markdown (paragraphs / inline code / line breaks)
  rendered XSS-safe, applied to the assistant message `content` that REQ-CC-004 accumulates
  from `text` chunks. The frontend audit names a `MarkdownRenderPort` (wrapping Obsidian
  `MarkdownRenderer.render`) for the full feature; confirm whether P1 introduces that port now
  (Obsidian markdown renderer behind a port) or ships a smaller safe text/inline-code renderer
  and adds the port in P2. **Owner: architect.** Non-blocking for requirements; both satisfy
  NFR-CC-008. (Note: incremental rendering during streaming reads `msg.content`, so the render
  seam must tolerate re-render on each accumulated `text` chunk — REQ-CC-004.)

## Out of scope

Explicitly **not** in P1 (each maps to a later charter phase; see Non-goals NG1–NG11):

- Multiple threads / tabs / history / resume / fork / rewind / compact / title-gen (P3).
- Rich rendering: tool-calls, thinking, todo, write/edit + word-diff, collapsible, subagent,
  usage/context meter, inline ask-user/exit-plan/plan-approval blocks (P2/P4).
- Composer power: slash `/`, skills `$`, `@mention`, instruction `#`, plan mode `Shift+Tab`,
  bang-bash `!`, queue/steer row, attachments (file chips / images / selection) (P4/P5).
- Toolbar control strip: model / mode / permission / thinking / service-tier / MCP selectors,
  external-context control, usage meter (P6).
- Approvals / permissions / inline-edit / word-diff (P4/P7).
- MCP client / config / tester / selector (P6/P8).
- Codex + Opencode providers, provider registry UI, model routing (P9).
- Settings shell / per-provider settings UX (P10); i18n beyond the existing en/de stub (P11);
  a11y final sign-off pass (P12 — though P1 surfaces still meet WCAG 2.2 AA per NFR-CC-002).
- Any stored secret / API-key transport / `SecretStorePort` usage (defers; CLAR-CC-002).
- `HomeFsPort` / beyond-vault filesystem reads (P3/P9 — not needed for the P1 CLI loop).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then on every REQ).
- [x] NFRs listed with targets (inherited defaults restated; new threshold flagged).
- [x] Success metrics defined (including a counter-metric: scope leakage).
- [x] Release criteria stated.
- [ ] `/spec:clarify` returned no open questions — **CLAR-CC-001 (ADR) must be resolved before
      design proper; CLAR-CC-004/005 resolve at design.** Status held at `draft` until
      CLAR-CC-001 is blessed (then `accepted`).
