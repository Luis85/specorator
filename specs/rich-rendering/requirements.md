---
id: PRD-RR-001
title: Rich rendering (P2) — tool-calls, thinking, todo, write/edit + word-diff, collapsible, subagent, usage
stage: requirements
feature: rich-rendering
area: RR
epic: claudian-reboot
phase: P2
status: draft     # draft | proposed | accepted | superseded — HELD at draft until the architect's
                  # design-time ADR for the render seam (CLAR-RR-003) + the StreamChunk/ChatMessage
                  # growth (CLAR-RR-002) is human-blessed, mirroring P1's discipline (PRD-CC-001).
owner: pm
inputs:
  - specs/rich-rendering/workflow-state.md            # P2 scope, epic constraints, CLAR-RR-001/002/003
  - specs/claudian-reboot/parity-charter.md           # §3.1 inventory, §4 (P2 row), §5 parity acceptance, §6 ADRs/constraints
  - specs/claudian-reboot/claudian-audit-frontend.md  # tool-call / thinking / todo / write-edit+diff / subagent / collapsible / usage maps
  - specs/claudian-reboot/claudian-audit-backend.md    # StreamChunk taxonomy + render seam notes
  - specs/chat-core/requirements.md                   # PRD-CC-001 — P1 contract (SPEC-CC-002 StreamChunk, REQ-CC-006 ChatMessage, CLAR-CC-005 markdown seam)
  - specs/chat-core/spec.md                            # P1 StreamChunk + ChatMessage + dispatch contract
created: 2026-05-24
updated: 2026-05-24
---

# PRD — Rich rendering (P2)

## Summary

P2 is the second vertical slice of the **claudian-reboot** epic. It builds **on top of** the P1
chat surface (`chat-core`, PRD-CC-001: `ChatRuntimePort` async-generator streaming, single-thread
`chatStore`, `MessageList`/`MessageTurn`/`MarkdownBlock`, `safeMarkdownRender` behind
`MarkdownRenderPort`) and does **one thing**: it makes the assistant turn render **rich**. P1
streamed plain text and *stored* usage but rendered none of the structured blocks Claudian shows
in a turn. P2 emits and renders them.

Concretely, on the assistant turn, P2 reproduces the Claudian §3.1 renderers:

- **tool-calls** — per-tool icon + collapsible input/result, end-pinned colour-coded status, the
  2px "tree-branch" rail (`ToolCallRenderer`, `toolIcons`, `toolNames`, `toolInput`,
  `toolResultContent`);
- **thinking blocks** — live "Thinking Ns…" pulse that freezes to "Thought for Ns" and
  auto-collapses (`ThinkingBlockRenderer`);
- **todo lists** — pending/in-progress/completed with the 2×-scaled dot and `activeForm` text,
  plus the "Tasks N/M" header count (`TodoListRenderer`, `todoUtils`, `core/tools/todo`);
- **write/edit with WORD-LEVEL diff preview** — background-highlight diff (no strikethrough),
  16px prefix gutter, `+N -N` stat chip (`WriteEditRenderer`, `DiffRenderer`);
- **a reusable collapsible primitive** — the universal expand/collapse motif every block shares
  (`collapsible.ts`);
- **subagent rendering + lifecycle** — nested collapsibles (prompt/result/tools), async
  status-colour ladder, spawn+wait+close consolidation (`SubagentRenderer`,
  `subagentLifecycleResolution`);
- **usage / token info** — surfaced now (P1 stored it but did not render it — PRD-CC-001 NG4).

The mechanism is **additive, never a redesign** (charter §6, ADR-CC-001 "grow per phase"): P2
**emits** the `StreamChunk` members P1 already declared-for-P2 (`thinking`, `tool_use`,
`tool_result`, `tool_output`, `async_subagent_result`, `subagent_tool_use`,
`subagent_tool_result`, `notice`, `context_compacted`), grows the `ChatMessage` model with the
`contentBlocks`/`toolCalls` P1 deliberately excluded (REQ-CC-006), adds `RunChatTurnUseCase`
dispatch handlers (the default branch is already forward-compatible) and `ChatTurnSink`/`chatStore`
legs, and adds new declarative Vue render components — all **without renaming or redesigning** the
P1 contract.

Parity is **perceptual, not pixel** (charter §1): every Claudian hardcoded value resolves through
a `--sp-*` token; identity stays Specorator. Visual/behavioural truth is `D:\Projects\claudian-main`
(MIT, read-only). The single hardest constraint, called out explicitly, is **no `v-html` /
`innerHTML`**: tool blocks, thinking content, diffs, and todo lists must be built as declarative,
safe Vue nodes — never raw HTML — extending the P1 `MarkdownRenderPort` node model rather than
injecting markup (Claudian builds these imperatively with `createDiv`/`setText`/`setIcon`, which
we reproduce as SFCs + `SpIcon`).

Audience: the same Obsidian desktop user from P1, now seeing what the agent actually *does*
during a turn (tools it runs, files it edits, its plan, its reasoning) rather than only its prose.

## Goals

- G1 — **Emit** the P2 `StreamChunk` members in the runtime and dispatch them through
  `RunChatTurnUseCase` into new `ChatTurnSink`/`chatStore` legs, additively (no rename/redesign of
  the P1 union or dispatch).
- G2 — **Grow the message model**: `ChatMessage` gains `contentBlocks` (ordered render list) and
  `toolCalls` (tool tracking) mirroring Claudian's `chat.ts:39`, so blocks render in streaming
  order and replay identically from stored messages.
- G3 — Render each §3.1 block type — tool-call, thinking, todo, write/edit + word-level diff,
  subagent (+ lifecycle), usage — at **perceptual parity** with Claudian, driven by `--sp-*` tokens.
- G4 — Ship **one reusable collapsible primitive** (the 2px tree-branch rail, keyboard-operable,
  ARIA-correct) that tool-calls, thinking, write/edit, and subagent sections all reuse.
- G5 — **Surface usage/token info** that P1 stored but did not render (PRD-CC-001 NG4).
- G6 — Keep every block render **XSS-safe by construction** — declarative Vue nodes only, no
  `v-html`/`innerHTML`; extend the `MarkdownRenderPort` node model where block content is markdown.
- G7 — Keep the slice strictly within P2: no tabs/history, no composer power, no inline
  *interactive*/approval blocks, no attachments, no extra providers (see Non-goals).

## Non-goals

> Each maps to a later charter phase. The Non-goals are defined as deliberately as the Goals; the
> **counter-metric** (Success metrics) measures scope leakage against this exact list.

- **NG1 — Tabs / sessions / history / resume / fork / rewind / compact / title-gen → P3** (charter
  §3.2). P2 renders the `context_compacted` *block* if a compaction chunk arrives, but does **not**
  implement compaction, history, or any thread machinery.
- **NG2 — Composer power → P4** (charter §3.3): no slash `/`, skills `$`, `@mention`, instruction
  `#`, plan-mode `Shift+Tab`, bang-bash `!`, queue/steer row. P2 changes nothing in the composer.
- **NG3 — Inline INTERACTIVE / approval blocks → P7** (charter §3.1 inline blocks). The Claudian
  files `InlineAskUserQuestion.ts`, `InlineExitPlanMode.ts`, `InlinePlanApproval.ts` are **OUT of
  P2**. P2 may *render the read-only result* of a completed tool call (e.g. an AskUserQuestion
  tool's resolved answers as static text), but builds **no** interaction, no approval flow, no
  composer-replacing inline widget, no `ConfirmModalPort` approval. Rendering only — no decisions.
- **NG4 — File / image context & attachments → P5** (charter §3.4): no file chips, no image
  thumbnails/modal, no selection indicators.
- **NG5 — Toolbar control strip → P6** (charter §3.5): no model/mode/permission/thinking/
  service-tier/MCP selectors. **Usage is surfaced as in-turn token info (G5), NOT the P6 240° arc
  context-meter toolbar widget** — the meter widget and its placement in the composer toolbar are P6.
- **NG6 — MCP client / config / tester / selector → P8** (charter §3.7).
- **NG7 — Codex / Opencode providers, provider registry UI, model routing → P9** (charter §3.6).
  P2 renders Claude's blocks; the provider-lifecycle subagent consolidation for Codex/Opencode
  `spawn_agent`/`wait` (frontend-audit subagent open question) is **deferred to P9** — P2 covers the
  Claude Task/Agent subagent path only.
- **NG8 — Stored secret / API-key transport / `SecretStorePort` usage** (carried from PRD-CC-001
  NG10; P2 introduces no secret).
- **NG9 — Backwards compatibility / migration** (charter CHARTER-REQ-FRESH): load-or-default only;
  no migration of prior chat/message state.
- **NG10 — Settings UX, new locales, a11y final sign-off pass** (P10/P11/P12). P2 surfaces still
  meet WCAG 2.2 AA (NFR-RR-008); the final cross-surface a11y/screenshot sign-off is P12.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Obsidian power user with `claude` CLI logged in | See *what the agent did* during a turn — tools run, files edited, its plan and reasoning, token usage | Primary P2 user; P1 showed only prose, so the agent's actions were invisible |
| Plugin developer running `npm run dev` (MockBridge) | Drive a canned stream of P2 chunk types (tool_use/tool_result/thinking/todo/subagent/usage) to build + test the renderers without a live CLI | The scripted stream must reach the new sink legs so every renderer is testable headlessly |
| GitHub Pages demo visitor (LocalStorageBridge) | See a fixture transcript replay rich blocks (a tool call, a diff, a todo list) | Demo must show the "Claudian feel" without a subprocess |
| Architect (downstream, P2 design) | A blessed decision on the `StreamChunk`/`ChatMessage` additive growth (CLAR-RR-002) and the render seam (one block-renderer tree vs per-type components) + the `MarkdownRenderPort` backing upgrade (CLAR-RR-003) | The message-model growth and render-seam are architecturally load-bearing; mirror P1's CLAR-CC-001 ADR gate |
| Reviewer / brand-reviewer | Perceptual + `--sp-*` token + interaction parity evidence vs `claudian-main` for each renderer; **zero `v-html`/raw-HTML** leak | Charter §5 gates the phase; the no-raw-HTML rule is the hardest rich-render NFR |

## Jobs to be done

- When the agent runs a tool during my turn, I want to see a per-tool icon, a one-line summary,
  and a colour-coded status, so I can tell at a glance what it did and whether it succeeded.
- When I want detail, I want to click (or keyboard-toggle) a tool/thinking/subagent block open to
  read its input and result, so I can inspect without the turn being cluttered by default.
- When the agent writes or edits a file, I want a word-level diff preview with `+N -N` stats, so I
  can review the change inline without leaving the chat.
- When the agent reasons, I want to watch a live "Thinking Ns…" line that settles to "Thought for
  Ns" and collapses, so I see it is working without the reasoning dominating the transcript.
- When the agent keeps a todo list, I want pending/active/done items with the active item phrased
  as a gerund and an "N/M" count, so I can follow its plan.
- When the agent spawns a subagent, I want a consolidated block with its prompt, nested tool
  calls, and result, plus an async status, so a background agent is legible.
- When a turn completes, I want to see the token usage it consumed, so I understand context cost.

## Functional requirements (EARS)

> EARS five patterns: **ubiquitous** ("The `<system>` shall …"), **event-driven** ("When
> `<trigger>`, the `<system>` shall …"), **state-driven** ("While `<state>`, the `<system>` shall
> …"), **optional-feature** ("Where `<feature>`, the `<system>` shall …"), **unwanted-behaviour**
> ("If `<condition>`, then the `<system>` shall …"). One requirement per entry; the system is named
> explicitly; the response is testable. Each REQ maps 1:1 to (a) a Claudian path/symbol it
> reproduces and (b) a testable acceptance criterion (so it maps 1:1 to a future test). Grouped by
> sub-surface.

---

### Group A — Stream → chunk mapping (emit + dispatch)

#### REQ-RR-001 — The runtime emits the P2 StreamChunk members; the union grows additively, not by rename

- **Pattern:** ubiquitous
- **Statement:** *The `ChatRuntimePort` runtime shall, in P2, emit the declared-for-P2 `StreamChunk`
  members — `thinking`, `tool_use`, `tool_result`, `tool_output`, `notice`, `context_compacted`,
  `async_subagent_result`, `subagent_tool_use`, `subagent_tool_result` — using the existing union
  member names and field shapes, without renaming or removing any P1 member.*
- **Reproduces (Claudian):** `D:\Projects\claudian-main\src\core\types\chat.ts:137` (the normalized
  `StreamChunk` union — same member names/shapes) emitted via the provider runtime; our P1 declaration
  is `src/domain/chat/StreamChunk.ts` (members already present, EMITTED here for the first time).
- **Acceptance:**
  - Given the P2 runtime (Mock/LocalStorage fixture) scripted to yield, in order, `tool_use`,
    `tool_result`, `thinking`, `usage`, `done`,
  - When a test iterates `query(...)`,
  - Then each chunk is delivered with the exact P1-declared member name and fields (e.g.
    `{type:'tool_use', id, name, input}`; `{type:'tool_result', id, content, isError?, toolUseResult?}`),
    no member is renamed, and all P1 members (`text`/`error`/`done`/`usage`) still behave as in P1.
- **Priority:** must
- **Satisfies:** charter §3.1, §4 (P2 row); workflow-state CLAR-RR-002; PRD-CC-001 REQ-CC-001a
- **Refines into:** design (StreamChunk growth review + ADR, CLAR-RR-002), spec (emit contract), tests

#### REQ-RR-002 — `tool_use` chunks create a tracked tool call and an ordered content block

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `tool_use` chunk during a turn, the chat session shall
  create a tool-call record `{ id, name, input, status:'running' }` on the live assistant message
  and append a `{ type:'tool_use', toolId }` entry to that message's ordered content-block list.*
- **Reproduces (Claudian):** `StreamController.handleStreamChunk` `case 'tool_use'` (creates a
  `ToolCallInfo` — `core/types/tools.ts:32` — and pushes a `ContentBlock {type:'tool_use', toolId}`
  — `chat.ts:31`/`:47`); `RunChatTurnUseCase.dispatchChunk` adds the handler (P1 default branch).
- **Acceptance:**
  - Given a streaming turn and a `tool_use` chunk `{id:'t1', name:'Read', input:{file_path:'a.md'}}`,
  - When it is dispatched,
  - Then the live assistant message has a tool-call record keyed `t1` with status `running` and its
    content-block list ends with `{type:'tool_use', toolId:'t1'}` (block order preserved).
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-001, REQ-RR-010 (model growth)
- **Refines into:** design (dispatch + sink leg + store state), spec, tests

#### REQ-RR-003 — `tool_result` / `tool_output` chunks update the matching tool call by id

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `tool_result` chunk (or an interim `tool_output` chunk),
  the chat session shall locate the tool call by `chunk.id` and update its result content and status
  (`completed`, or `error` when `isError` is true), without creating a new block.*
- **Reproduces (Claudian):** `StreamController` `case 'tool_result'`/`case 'tool_output'` —
  `updateToolCallResult` matches by id and sets `result`/`status`; `chat.ts:143`/`:144` shapes
  (`isError?`, `toolUseResult?`).
- **Acceptance:**
  - Given a tool call `t1` in status `running`,
  - When a `tool_result {id:'t1', content:'…', isError:false}` is dispatched,
  - Then `t1`'s result is set to that content and its status becomes `completed`; and when
    `isError:true`, the status becomes `error`; no extra content block is added.
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-002
- **Refines into:** design (id-keyed update), spec, tests

#### REQ-RR-004 — `thinking` chunks accumulate into an ordered thinking block

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `thinking` chunk, the chat session shall append a
  `thinking` content block to the live assistant message (or accumulate onto the open one) and
  accumulate `chunk.content` as that block's reasoning text.*
- **Reproduces (Claudian):** `StreamController` `case 'thinking'` — accumulates into the active
  thinking block, pushing a `ContentBlock {type:'thinking', content, durationSeconds?}` (`chat.ts:34`).
- **Acceptance:**
  - Given a streaming turn and `thinking` chunks `["Plan", "ning…"]` then `done`,
  - When they are dispatched,
  - Then the live message has one `thinking` content block whose content equals `"Planning…"` and it
    is positioned in stream order relative to text/tool blocks.
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-001, REQ-RR-013 (thinking render)
- **Refines into:** design (thinking-block sink leg), spec, tests

#### REQ-RR-005 — `usage` chunk surfaces token info (P2 renders what P1 only stored)

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a `usage` chunk, the chat session shall update the
  conversation's usage state from `chunk.usage` and make that token info renderable on the turn,
  without altering any message content.*
- **Reproduces (Claudian):** `StreamController` `case 'usage'` (`state.usage = chunk.usage`);
  `UsageInfo` `chat.ts:165`. P1 stored it (`chatStore.onUsage`, REQ-CC-005a) but rendered nothing
  (PRD-CC-001 NG4); P2 surfaces it (REQ-RR-024).
- **Acceptance:**
  - Given a streaming turn whose runtime yields a `usage` chunk before `done`,
  - When it is dispatched,
  - Then the usage state reflects `chunk.usage` (`contextTokens`, `contextWindow`, `percentage`,
    optional `model`) and no assistant message content changes.
- **Priority:** must
- **Satisfies:** charter §3.1 usage; PRD-CC-001 REQ-CC-005a/NG4; REQ-RR-024
- **Refines into:** design (usage seam to render), spec, tests

#### REQ-RR-006 — Subagent chunks route to a subagent block without disturbing top-level blocks

- **Pattern:** event-driven
- **Statement:** *When the runtime yields a subagent chunk (`subagent_tool_use`,
  `subagent_tool_result`, or `async_subagent_result`), the chat session shall route it to the
  subagent identified by `subagentId`/`agentId` — creating or updating that subagent's nested
  tool-call list and status — and shall not append a top-level tool-call block for it.*
- **Reproduces (Claudian):** `StreamController` subagent cases + `SubagentManager` — nested tools
  attach to a `SubagentInfo` (`tools.ts:66`); `chat.ts:150–152` shapes.
- **Acceptance:**
  - Given a subagent `s1` exists on the live message,
  - When a `subagent_tool_use {subagentId:'s1', id:'st1', name:'Grep', input:{…}}` then
    `subagent_tool_result {subagentId:'s1', id:'st1', content:'…'}` are dispatched,
  - Then `s1`'s nested tool list contains `st1` with its result, and the message's top-level
    tool-call list is unchanged.
- **Priority:** must
- **Satisfies:** charter §3.1 subagent; REQ-RR-021 (subagent render)
- **Refines into:** design (subagent routing in dispatch/store), spec, tests

#### REQ-RR-007 — Unknown / future chunk members are ignored without breaking the turn

- **Pattern:** unwanted-behaviour
- **Statement:** *If the runtime yields a `StreamChunk` member that P2 does not handle (a
  later-phase member, e.g. a P3+ control chunk), then the dispatch shall ignore it and continue the
  turn, leaving the forward-compatible default branch intact.*
- **Reproduces (Claudian):** the normalized-union contract (`chat.ts:135` comment "providers may
  keep provider-native turn metadata internally"); our `RunChatTurnUseCase.dispatchChunk` default
  branch (`RunChatTurnUseCase.ts:132`).
- **Acceptance:**
  - Given a turn whose runtime yields a chunk type not in P2's handled set, then `done`,
  - When the stream is drained,
  - Then no error is raised, the unhandled chunk produces no block, and `done` finalises the turn
    normally.
- **Priority:** must
- **Satisfies:** charter §6 (grow per phase); PRD-CC-001 forward-compatibility
- **Refines into:** design (default-branch preservation), spec, tests

---

### Group B — Message model growth

#### REQ-RR-010 — `ChatMessage` grows `contentBlocks` and `toolCalls` (P1 excluded them)

- **Pattern:** ubiquitous
- **Statement:** *The `ChatMessage` model shall, in P2, gain an optional ordered `contentBlocks`
  list and an optional `toolCalls` list mirroring Claudian's shapes, added additively to the P1
  fields (`id`, `role`, `content`, `timestamp`, `displayContent?`, `durationSeconds?`) with no P1
  field renamed or removed.*
- **Reproduces (Claudian):** `ChatMessage` `chat.ts:39` — `contentBlocks?: ContentBlock[]`
  (`chat.ts:47`) and `toolCalls?: ToolCallInfo[]` (`chat.ts:46`); `ContentBlock` union `chat.ts:31`;
  `ToolCallInfo` `tools.ts:32`. P1 excluded these (PRD-CC-001 REQ-CC-006); P2 grows them.
- **Acceptance:**
  - Given the P2 `ChatMessage` type,
  - When compared to `chat.ts:39`,
  - Then it declares `contentBlocks` and `toolCalls` (P2-needed members of `ContentBlock`/
    `ToolCallInfo`), all six P1 fields remain unchanged, and members not yet needed (`images`,
    rewind ids, `currentNote`) stay excluded and documented as later-phase.
- **Priority:** must
- **Satisfies:** charter §3.1; PRD-CC-001 REQ-CC-006; CLAR-RR-002
- **Refines into:** design (model growth + ADR, CLAR-RR-002), spec (type contract), tests

#### REQ-RR-011 — `ContentBlock` preserves streaming order across all block types

- **Pattern:** ubiquitous
- **Statement:** *The assistant message's `contentBlocks` shall be an ordered list whose entries
  (`text`, `thinking`, `tool_use`, `subagent`, `context_compacted`) appear in the exact order the
  runtime emitted them, so the rendered turn interleaves prose, reasoning, tool calls, and
  subagents in arrival order.*
- **Reproduces (Claudian):** `MessageRenderer.renderContentBlocks` iterates `msg.contentBlocks` in
  order (frontend-audit §3.1 "renders `contentBlocks` in order"); `ContentBlock` union `chat.ts:31`.
- **Acceptance:**
  - Given a turn emitting `text("A")`, `tool_use(t1)`, `text("B")`, `thinking("…")` in that order,
  - When the message is finalised and rendered,
  - Then the content-block list is `[text:"A", tool_use:t1, text:"B", thinking]` in that order and
    the rendered turn shows the blocks in the same sequence (assertable by `data-testid` order).
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-002, REQ-RR-004
- **Refines into:** design (block ordering in store), spec, tests

#### REQ-RR-012 — A stored (replayed) message renders identically to its streamed form

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render a stored assistant message from its `contentBlocks`
  + `toolCalls` to a visual result equivalent to its live-streamed form (same blocks, order, status,
  diff, collapsed-by-default state).*
- **Reproduces (Claudian):** the `addMessage` (live) vs `renderStoredMessage` (batch replay) parity
  in `MessageRenderer` (frontend-audit §3.1), plus the `renderStored*` variants
  (`renderStoredThinkingBlock`, `renderStoredWriteEdit`).
- **Acceptance:**
  - Given a `ChatMessage` populated with `contentBlocks`/`toolCalls` (no live stream),
  - When the surface renders it,
  - Then the same block types, order, tool statuses, and diffs appear as a streamed equivalent, and
    collapsible blocks are collapsed by default (REQ-RR-018).
- **Priority:** should
- **Satisfies:** charter §3.1 (stored vs live parity); REQ-RR-011
- **Refines into:** design (stored-render path), spec, tests

---

### Group C — Collapsible primitive

#### REQ-RR-015 — A single collapsible primitive provides click + keyboard toggle with correct ARIA

- **Pattern:** ubiquitous
- **Statement:** *The rich-render surface shall provide one reusable collapsible primitive whose
  header is a focusable control that toggles on click, Enter, and Space, exposes `aria-expanded`
  reflecting the open state, and carries a dynamic accessible label of the form
  `"<label> - click to expand"` / `"<label> - click to collapse"`.*
- **Reproduces (Claudian):** `rendering/collapsible.ts` `setupCollapsible` — click + Enter/Space
  toggle, `aria-expanded`, `role="button"`, `tabindex="0"`, dynamic `aria-label`, `expanded` class.
- **Acceptance:**
  - Given a collapsible with base label "Read a.md",
  - When it renders collapsed, its header has `aria-expanded="false"` and accessible label
    "Read a.md - click to expand"; when toggled via Space or Enter or click, `aria-expanded`
    becomes `"true"`, the content becomes visible, and the label becomes "… - click to collapse".
- **Priority:** must
- **Satisfies:** charter §3.1 collapsible; NFR-RR-008 (WCAG); frontend-audit "Collapsible"
- **Refines into:** design (`useCollapsible` composable + frame component), spec, tests

#### REQ-RR-016 — The collapsible renders the shared 2px tree-branch rail with the parity indents

- **Pattern:** ubiquitous
- **Statement:** *The collapsible primitive's expanded content shall render the shared
  "tree-branch" rail — a 2px inline-start border with the 7px inline-start margin + 16px
  inline-start padding indent — driven by `--sp-*` tokens, with a 24px indent variant for thinking
  blocks.*
- **Reproduces (Claudian):** the rail repeated across `toolcalls.css` / `thinking.css` /
  `subagent.css` (frontend-audit "the single most repeated visual motif": 2px `border-inline-start`
  + 7px margin + 16px padding; 24px for thinking).
- **Acceptance:**
  - Given an expanded collapsible,
  - When inspected, its content uses the rail driven by `--sp-tool-rail` /
    `--sp-tool-rail-indent` tokens (no raw hex/Obsidian var), and the thinking variant uses the
    24px indent token; no physical-direction property leaks (logical properties only).
- **Priority:** must
- **Satisfies:** charter §1 token parity; NFR-RR-007; frontend-audit "Collapsible"
- **Refines into:** design (Part B token map), spec, tests

#### REQ-RR-017 — Collapsibles honour reduced-motion and forced-colors

- **Pattern:** optional-feature
- **Statement:** *Where the user has `prefers-reduced-motion` or a forced-colors mode active, the
  collapsible (and any block animation: thinking pulse, spinners) shall present a static,
  non-animated, theme-legible state.*
- **Reproduces (Claudian):** charter §1 a11y ("meet or beat" Claudian's minimal `accessibility.css`);
  frontend-audit motion inventory ("All motion must honor `prefers-reduced-motion`").
- **Acceptance:**
  - Given `prefers-reduced-motion: reduce`,
  - When a collapsible toggles and a thinking block streams,
  - Then no transition/pulse animation runs (static dim instead of pulse) and the block remains
    legible under forced-colors.
- **Priority:** should
- **Satisfies:** charter §1; NFR-RR-008
- **Refines into:** design (reduced-motion guard token), spec, tests

#### REQ-RR-018 — Collapsible blocks are collapsed by default

- **Pattern:** state-driven
- **Statement:** *While a collapsible block (tool-call, thinking-when-finalised, write/edit,
  subagent section) is in its default state, the chat surface shall render it collapsed, showing
  only its header.*
- **Reproduces (Claudian):** "Collapsed by default" (`toolcalls.css` / `WriteEditRenderer` /
  `renderStoredThinkingBlock` all init `setupCollapsible` with `initiallyExpanded=false`).
- **Acceptance:**
  - Given a completed tool-call / write-edit / stored thinking block,
  - When the turn renders, then each is collapsed (content hidden, `aria-expanded="false"`) until
    the user expands it.
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-015
- **Refines into:** design, spec, tests

---

### Group D — Tool-call render

#### REQ-RR-019 — A tool-call renders an icon, monospace name + summary, and an end-pinned status

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render each tool call as a collapsible block with a per-tool
  icon, the tool name and a one-line summary in monospace, and an end-pinned status indicator;
  empty summaries shall be hidden.*
- **Reproduces (Claudian):** `ToolCallRenderer` header build + `toolIcons.ts` (`getToolIcon`),
  `getToolName`/`getToolSummary` (`ToolCallRenderer.ts:60`/`:79`), `toolcalls.css` (mono 13px name +
  summary, `:empty` summary hidden, status `margin-left:auto`).
- **Acceptance:**
  - Given a completed tool call `{name:'Read', input:{file_path:'docs/a.md'}}`,
  - When rendered, then its header shows the Read icon (mapped via `IconPort`), the name "Read" and
    a filename-only summary "a.md" in monospace, with an end-pinned status icon; a tool with an
    empty summary shows no summary element.
- **Priority:** must
- **Satisfies:** charter §3.1 tool-call; frontend-audit "Tool-call rendering"
- **Refines into:** design (`ToolCallBlock.vue` + `toolIcon`/`toolSummary` application helpers), spec, tests

#### REQ-RR-020 — Tool-call status is colour-coded by the four states via `--sp-status-*` tokens

- **Pattern:** state-driven
- **Statement:** *While a tool call is in a given status, the chat surface shall colour and icon its
  status indicator: running → accent (no terminal icon), completed → green check, error → red x,
  blocked → orange shield-off — driven by `--sp-status-*` tokens.*
- **Reproduces (Claudian):** `toolcalls.css` status colours (running `--text-accent`, completed
  `--color-green`, error `--color-red`, blocked `--color-orange`; icons check/x/shield-off);
  `ToolCallInfo.status` `tools.ts:36`.
- **Acceptance:**
  - Given tool calls in each of running/completed/error/blocked,
  - When rendered, then each shows the mapped colour token and icon (running shows the accent
    running state, completed a green check, error a red x, blocked an orange shield-off), with no
    raw colour value in the component.
- **Priority:** must
- **Satisfies:** charter §3.1; NFR-RR-007; frontend-audit "Status colors"
- **Refines into:** design (status→token map), spec, tests

#### REQ-RR-019a — Tool name and summary are derived by pure application-layer helpers, not the component

- **Pattern:** ubiquitous
- **Statement:** *The chat application layer shall provide pure functions that map a tool
  `(name, input)` to its display name and one-line summary, applying the per-tool heuristics
  (path → filename, bash command → 60-char truncation, glob/grep → pattern, TodoWrite → "Tasks N/M"),
  and the render component shall consume those functions rather than computing summaries itself.*
- **Reproduces (Claudian):** `getToolName` (`ToolCallRenderer.ts:60`), `getToolSummary`
  (`:79`), `getToolLabel` (`:119`), `toolNames.ts`, `toolInput.ts`; frontend-audit "Tool metadata …
  belongs in application layer (pure functions)".
- **Acceptance:**
  - Given inputs for Read `{file_path:'a/b/c.md'}`, Bash `{command:<long>}`, and TodoWrite
    `{todos:[2 completed of 3]}`,
  - When the helpers run, then they return `"c.md"`, a ≤60-char command summary, and the name
    `"Tasks 2/3"` respectively — independently of any Vue component (unit-testable in isolation).
- **Priority:** must
- **Satisfies:** charter §3.1; NFR-RR-005; frontend-audit "Tool metadata in application layer"
- **Refines into:** design (application helpers), spec, tests

#### REQ-RR-020a — Tool input and result render as safe declarative nodes, never raw HTML

- **Pattern:** unwanted-behaviour
- **Statement:** *If a tool call's input or result contains markup, code, or arbitrary text, then the
  chat surface shall render it as escaped declarative nodes (monospace pre-wrapped text via the
  safe node model), and shall not assign `innerHTML`/`outerHTML` or use `v-html`.*
- **Reproduces (Claudian):** `ToolCallRenderer` per-line output via `createDiv`/`setText`
  (`toolResultContent.ts`); our no-raw-HTML rule (CLAUDE.md, charter §1). Claudian's `setText` is
  XSS-safe by construction; the Vue parity is declarative spans.
- **Acceptance:**
  - Given a tool result containing the literal text `<script>alert(1)</script>`,
  - When the block is expanded,
  - Then that text is shown verbatim as escaped text (no script executes, no element injected), and
    a lint scan confirms no `v-html`/`innerHTML` in the render path.
- **Priority:** must
- **Satisfies:** charter §1; NFR-RR-006 (the hardest NFR); CLAUDE.md DOM rules
- **Refines into:** design (safe node render of tool content), spec, tests

---

### Group E — Thinking render

#### REQ-RR-013 — A live thinking block shows a pulsing "Thinking Ns…" counter that increments each second

- **Pattern:** state-driven
- **Statement:** *While a thinking block is streaming, the chat surface shall display a brand-coloured
  italic label "Thinking Ns…" whose second-count increments each second, with a pulse animation
  (subject to reduced-motion, REQ-RR-017).*
- **Reproduces (Claudian):** `ThinkingBlockRenderer.createThinkingBlock` (1s `setInterval` updating
  "Thinking Ns…"); `thinking.css` `thinking-pulse` (opacity 0.5↔1, 1.5s) in brand colour italic.
- **Acceptance:**
  - Given a thinking block opened during streaming,
  - When ~2 seconds elapse (fake timers), then the label reads "Thinking 2s…" in the brand
    (`--sp-thinking-color`) italic style with the pulse class applied (absent under reduced-motion).
- **Priority:** must
- **Satisfies:** charter §3.1 thinking; frontend-audit "Thinking blocks"
- **Refines into:** design (`ThinkingBlock.vue` timer + token), spec, tests

#### REQ-RR-014 — A finalised thinking block freezes to "Thought for Ns" and auto-collapses

- **Pattern:** event-driven
- **Statement:** *When a thinking block finalises (the turn moves past it), the chat surface shall
  stop the timer, replace the label with "Thought for Ns" (the elapsed duration), and collapse the
  block.*
- **Reproduces (Claudian):** `ThinkingBlockRenderer.finalizeThinkingBlock` (clears interval, sets
  "Thought for Ns", `collapseElement`).
- **Acceptance:**
  - Given a streaming thinking block at 3 seconds,
  - When it finalises, then the timer stops, the label reads "Thought for 3s" (no trailing "…"), and
    the block is collapsed (`aria-expanded="false"`).
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-013, REQ-RR-018
- **Refines into:** design (finalise transition), spec, tests

---

### Group F — Todo render

#### REQ-RR-022 — A todo list renders status-distinct items with the active item phrased as a gerund

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render a todo list with one row per item, each carrying a
  status-distinct icon (pending/in-progress → dot, completed → check) and colour
  (`--sp-todo-pending`/`--sp-todo-active`/`--sp-todo-done`), showing the item's `activeForm`
  (gerund) when in-progress and its `content` otherwise.*
- **Reproduces (Claudian):** `todoUtils.renderTodoItems` (`getTodoStatusIcon`, `getTodoDisplayText`),
  `core/tools/todo.ts` (`TodoItem` `{content, status, activeForm}`); `status-panel.css` (the 2×-scaled
  dot, per-status colour).
- **Acceptance:**
  - Given todos `[{content:'Run tests', activeForm:'Running tests', status:'in_progress'},
    {content:'Lint', status:'pending'}, {content:'Build', status:'completed'}]`,
  - When rendered, then the in-progress row shows "Running tests" with the active colour, the
    pending row shows "Lint" with a dot, and the completed row shows "Build" with a check + done
    colour.
- **Priority:** must
- **Satisfies:** charter §3.1 todo; frontend-audit "Todo-list rendering"
- **Refines into:** design (`TodoList.vue` + todo parse helper), spec, tests

#### REQ-RR-023 — A TodoWrite tool header shows a live "Tasks N/M" completed count

- **Pattern:** state-driven
- **Statement:** *While a TodoWrite tool call is present, the chat surface shall show its header name
  as "Tasks N/M" where N is the completed count and M the total.*
- **Reproduces (Claudian):** `getToolName` `case TOOL_TODO_WRITE` (`ToolCallRenderer.ts:62`) → "Tasks
  N/M"; frontend-audit "the 'Tasks N/M' header count".
- **Acceptance:**
  - Given a TodoWrite tool call whose `input.todos` has 2 of 5 completed,
  - When rendered, then its tool-call header name reads "Tasks 2/5".
- **Priority:** must
- **Satisfies:** charter §3.1; REQ-RR-019a, REQ-RR-022
- **Refines into:** design, spec, tests

---

### Group G — Write/Edit + word-level diff render

#### REQ-RR-025 — Write/Edit renders a word-level diff with background-highlight lines (no strikethrough)

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render a Write or Edit tool call as a collapsible block with
  a per-line diff where inserted lines carry an insert-background highlight and deleted lines a
  delete-background highlight (background only — **no strikethrough**), each line prefixed by a
  16px-gutter +/−/space marker, in monospace.*
- **Reproduces (Claudian):** `WriteEditRenderer` + `DiffRenderer.renderDiffContent`; `features/diff.css`
  ("background highlight, no strikethrough" explicit comment; 16px centred prefix gutter;
  insert/delete washes); `DiffLine` `diff.ts:5`.
- **Acceptance:**
  - Given a diff of `DiffLine[]` with one `insert`, one `delete`, one `equal`,
  - When rendered, then the insert line has the `--sp-diff-insert-bg` background and "+" gutter, the
    delete line has `--sp-diff-delete-bg` and "−" gutter (no strikethrough text-decoration), and the
    equal line is muted with a space gutter.
- **Priority:** must
- **Satisfies:** charter §3.1 write/edit + diff; frontend-audit "Write/Edit rendering"
- **Refines into:** design (`WriteEditBlock.vue` + `DiffView.vue` + token map), spec, tests

#### REQ-RR-026 — Diff lines and stats are computed by a pure function returning `DiffLine[]` + counts

- **Pattern:** ubiquitous
- **Statement:** *The chat application/domain layer shall provide a pure function that, given the
  tool's diff source (the SDK structured patch / file-update data), returns an ordered `DiffLine[]`
  and `{ added, removed }` stats, and the render component shall consume that result rather than
  computing the diff itself.*
- **Reproduces (Claudian):** `DiffRenderer.splitIntoHunks`/`renderDiffStats` + `utils/diff`
  (`parseApplyPatchDiffs`/`parseFileUpdateChangeDiffs`); `SDKToolUseResult`/`StructuredPatchHunk`/
  `DiffStats` (`diff.ts:12`/`:18`/`:27`); `ToolDiffData` (`tools.ts:4`); frontend-audit "Diff
  computation → application/domain pure function returning `DiffLine[]`".
- **Acceptance:**
  - Given a structured-patch input adding 3 lines and removing 1,
  - When the function runs, then it returns the corresponding `DiffLine[]` (in order, with line
    types) and stats `{added:3, removed:1}`, independently of any component (unit-testable).
- **Priority:** must
- **Satisfies:** charter §3.1; NFR-RR-005; frontend-audit "Diff computation in application layer"
- **Refines into:** design (diff function placement), spec, tests

#### REQ-RR-027 — The Write/Edit header shows `+N -N` diff stats and a capped scrolling body

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render, in the Write/Edit block header, a `+N` (green) /
  `-N` (red) monospace stat chip from the computed stats, and shall cap the diff body height with
  internal scroll, truncating very large all-insert diffs with a "... N more lines" footer.*
- **Reproduces (Claudian):** `DiffRenderer.renderDiffStats` (`+N`/`-N` spans) into the header
  `statsEl`; `diff.css` `max-height:300px` scroll; `NEW_FILE_DISPLAY_CAP` truncation footer
  (`DiffRenderer.ts:76`).
- **Acceptance:**
  - Given a diff with `{added:5, removed:2}` and a 30-line all-insert new file,
  - When rendered, then the header shows "+5" in green and "-2" in red (monospace), the body
    scrolls within its height cap, and the all-insert case shows the first capped lines plus a
    "... N more lines" footer.
- **Priority:** should
- **Satisfies:** charter §3.1; REQ-RR-026
- **Refines into:** design (stat chip + scroll cap tokens), spec, tests

---

### Group H — Subagent render + lifecycle

#### REQ-RR-021 — A subagent renders as a block with collapsible prompt / result / tools sections

- **Pattern:** ubiquitous
- **Statement:** *The chat surface shall render a subagent as a collapsible block (accent icon)
  containing its own collapsible sections — prompt, result, and nested tool calls — where each
  nested tool call reuses the tool-call render (smaller scale) and the result body scrolls within a
  height cap.*
- **Reproduces (Claudian):** `SubagentRenderer` (`createSection` prompt/result/tools, nested
  `SubagentToolView`); `subagent.css` (accent icon, 2px rail, result `max-height:220px`,
  nested 13px-icon/12px-text tools); `SubagentInfo` `tools.ts:66`.
- **Acceptance:**
  - Given a subagent with a prompt, two nested tool calls, and a result,
  - When rendered, then the block shows collapsible prompt/result/tools sections, the nested tools
    render as (smaller) tool-call blocks reusing the same primitive, and the result body scrolls
    within its cap.
- **Priority:** must
- **Satisfies:** charter §3.1 subagent; frontend-audit "Subagent rendering + lifecycle"
- **Refines into:** design (`SubagentBlock.vue` reusing collapsible + nested `ToolCallBlock`), spec, tests

#### REQ-RR-021a — An async subagent shows a status pill colour-coded across its lifecycle states

- **Pattern:** state-driven
- **Statement:** *While an async subagent is in a given lifecycle state, the chat surface shall show
  a status pill coloured by state — pending (muted), running (accent), completed (green), error
  (red), orphaned (orange) — driven by `--sp-state-*` tokens.*
- **Reproduces (Claudian):** `subagent.css` `.claudian-subagent-status-text` colour ladder;
  `AsyncSubagentStatus` (`tools.ts:58`); `async_subagent_result` chunk (`chat.ts:150`).
- **Acceptance:**
  - Given an async subagent transitioning pending → running → completed,
  - When rendered at each state, then the pill text/colour reflects that state via the mapped
    `--sp-state-*` token (no raw colour), ending green for completed and red for error.
- **Priority:** should
- **Satisfies:** charter §3.1; NFR-RR-007; frontend-audit "async status-text color ladder"
- **Refines into:** design (state→token map), spec, tests

#### REQ-RR-021b — Sync-vs-async subagent and lifecycle consolidation are resolved by a pure helper

- **Pattern:** ubiquitous
- **Statement:** *The chat application layer shall provide a pure resolution that determines a
  subagent's sync-vs-async mode and consolidates a spawn+wait(+close) lifecycle into a single
  subagent block, and the render component shall consume that resolution rather than inferring it
  itself.*
- **Reproduces (Claudian):** `subagentLifecycleResolution.ts` (lifecycle-adapter resolution),
  `MessageRenderer.renderTaskSubagent`/`renderProviderLifecycleSubagent` (sync/async + consolidation);
  `SubagentMode` (`tools.ts:55`). **P2 scope: the Claude Task/Agent path only** — provider-lifecycle
  (Codex/Opencode `spawn_agent`/`wait`) consolidation is **deferred to P9** (NG7).
- **Acceptance:**
  - Given a Claude Task subagent with `run_in_background` set and a separate result tool, and given a
    sync Task subagent,
  - When the resolution runs, then it classifies the first as async and the second as sync, and
    consolidates the async spawn+result into one subagent block (unit-testable in isolation, no
    component).
- **Priority:** should
- **Satisfies:** charter §3.1; NFR-RR-005; frontend-audit subagent open question (P2 vs P9 split)
- **Refines into:** design (lifecycle resolution placement; provider-lifecycle deferred), spec, tests

---

### Group I — Usage render

#### REQ-RR-024 — Token usage is surfaced on the completed turn (in-turn, not the P6 meter widget)

- **Pattern:** optional-feature
- **Statement:** *Where a turn has usage state from a `usage` chunk, the chat surface shall surface
  the turn's token info — at minimum context tokens used and percentage of the context window — as
  a declarative, theme-tokened element on or beside the turn, distinct from (and not implementing)
  the P6 composer-toolbar context-meter widget.*
- **Reproduces (Claudian):** `utils/usageInfo` + `ContextUsageMeter` consume `UsageInfo`
  (`chat.ts:165`: `contextTokens`, `contextWindow`, `percentage`, optional `model`). P2 surfaces the
  numbers P1 stored (PRD-CC-001 REQ-CC-005a/NG4); the 240° arc meter + its toolbar placement are P6
  (NG5).
- **Acceptance:**
  - Given a finalised turn with usage `{contextTokens:1200, contextWindow:200000, percentage:0.6}`,
  - When the turn renders, then the token info (tokens used and ~0.6% of the window) is shown via
    `--sp-*`-tokened text, and no P6 arc-gauge meter widget is rendered in the composer toolbar.
- **Priority:** should
- **Satisfies:** charter §3.1 usage; PRD-CC-001 REQ-CC-005a/NG4; REQ-RR-005
- **Refines into:** design (in-turn usage element + token map), spec, tests

#### REQ-RR-024a — Usage rendering hides cleanly when there is no usage state

- **Pattern:** unwanted-behaviour
- **Statement:** *If a turn has no usage state, then the chat surface shall render no usage element
  for that turn (no zero-token placeholder).*
- **Reproduces (Claudian):** `ContextUsageMeter` "hidden when no usage" (frontend-audit usage meter
  "Behaviour").
- **Acceptance:**
  - Given a turn with `usage === null`,
  - When it renders, then no usage element (`data-testid`) is present.
- **Priority:** should
- **Satisfies:** charter §3.1; REQ-RR-024
- **Refines into:** design, spec, tests

## Non-functional requirements

> Inherited project defaults are **restated** here (not linked), per the PRD contract and the epic
> constraints in `workflow-state.md` / charter §1. Baseline-relative parity targets (NFR-RR-011)
> capture the baseline from `claudian-main` on the `next` integration branch before P2
> implementation (carry-over P1 screenshot matrix is issue #434); pair with a baseline-capture task
> in `tasks.md`.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-RR-001 | architecture | DDD inward-only imports (domain ← application ← infrastructure ← ui; plugin imports all). Chunk emission lives in infrastructure (behind `ChatRuntimePort`); chunk→block mapping/dispatch in application; render in ui. Vue never imports `obsidian` or `node:*`. New seams (icon, markdown backing) go through narrow ports + the three bridges. | ESLint import-direction + `no-restricted-imports` green; zero violations |
| NFR-RR-002 | architecture (3 bridges) | All three bridges supply the P2 capability: ObsidianBridge backs the real renderers (incl. any Obsidian `MarkdownRenderer` / icon backing, CLAR-RR-003); MockBridge scripts the P2 chunk types; LocalStorageBridge replays a fixture with rich blocks — no subprocess on the non-desktop bridges. | All three bridges drive every P2 renderer in tests/dev |
| NFR-RR-006 | security (DOM / XSS) — **HARDEST P2 NFR** | **No `v-html` / `innerHTML` / `outerHTML` / `insertAdjacentHTML` anywhere in the rich-render path.** Tool input/result, thinking content, todo text, diffs, subagent content, and markdown are built as **declarative safe Vue nodes** (extending the `MarkdownRenderPort` node model and `SpIcon`), never raw HTML strings. Diffs render as per-line declarative spans; tool/result text renders as escaped pre-wrapped text. | ESLint `no-restricted-properties` + `vue/no-v-html` green; zero raw-HTML sink in any P2 render component; XSS-payload-as-text test passes (REQ-RR-020a) |
| NFR-RR-003 | error-handling | Non-streaming domain/use-case methods (chunk→block mapping, diff/summary/lifecycle helpers) return `Result<T,E>` where they can fail, or are pure-total where they cannot; streaming failures still arrive as the `{type:'error'}` chunk (P1 contract), not as a thrown error across the port. No throwing across the port for expected failures. | 100% of fallible P2 non-streaming methods return `Result`; pure helpers are total |
| NFR-RR-004 | code-style | Vue components use `<script setup>`; Options API forbidden. No `window.confirm`/`alert`/`prompt`. | ESLint `<script setup>` + `no-restricted-globals` green |
| NFR-RR-005 | testability | Tests mirror `src/` path-for-path; mounted components have co-located `data-testid` PageObjects; no CSS-class/id selectors in tests. Tool name/summary, diff, todo-parse, and subagent-lifecycle logic live as pure functions unit-testable without mounting. | 80/70/80/80 (stmts/branches/funcs/lines); PageObject + data-testid only |
| NFR-RR-007 | parity (token) | Every Claudian CSS value the P2 renderers reproduce maps to a `--sp-*` token (no raw Obsidian var or hardcoded hex/colour leak in components): brand `#D97757`→`--sp-accent`/thinking, status running/completed/error/blocked, async-state ladder, diff insert/delete washes, the 2px rail + 7px/16px/24px indents, mono 12/13px. Drive from `--sp-accent` with optional `[data-provider]` aliasing — never hardcode `#D97757`. The `lint-style-tokens` guard (AUX, regrowing — reference, do not copy) passes. | Zero raw-var/hex/colour leaks in P2 components; logical-direction properties only |
| NFR-RR-008 | accessibility | WCAG 2.2 AA for the rich-render surfaces: every collapsible header is keyboard-operable (Enter/Space) and focusable with `aria-expanded` + a dynamic accessible label; status/icon meaning is not colour-only (icon + label); motion honours `prefers-reduced-motion`; blocks are legible under forced-colors. | WCAG 2.2 AA; keyboard + ARIA assertions pass |
| NFR-RR-009 | compatibility / manifest | `manifest.json` `id`, `version`, and `minAppVersion` (1.12.7) are **not** modified by P2. Desktop-only (subprocess provider). | manifest identity unchanged; desktop-only |
| NFR-RR-010 | security / privacy / persistence | P2 introduces **no secret** (no `SecretStorePort` usage; no key in `data.json`). **No backwards-compat / migration**: any new chat/message/render state loads-or-defaults; device-scoped settings (if touched) persist device-local, never `data.json` (charter CHARTER-REQ-SET/FRESH). | Zero secrets in `data.json`; load-or-default; no migration code |
| NFR-RR-011 | parity (visual) | Per-surface screenshot parity vs `claudian-main` for the P2 renderers (tool-call collapsed/expanded, thinking live/finalised, todo, write/edit diff, subagent, usage) at **320 / 520 / 720 px**, **light + dark** theme, captured under `specs/rich-rendering/parity-screenshots.md`. Perceptual (not pixel) parity. | Side-by-side reads as "same product"; reviewer sign-off (charter §5.1) |
| NFR-RR-012 | parity (interaction) | P2 interactions match Claudian: collapsibles collapsed-by-default, click + Enter/Space toggle; thinking timer increments then freezes + auto-collapses; tool status state machine; diff background-highlight (no strikethrough) — asserted in component tests + the screenshot set (charter §5.3). | Interaction assertions pass |
| NFR-RR-013 | supply-chain | Any new runtime dependency (e.g. a diff library, if introduced) records its rationale (license/maintenance/why-not-existing) per AGENTS.md §8; `ci.yml` `uses:` stay SHA-pinned; `npm audit --audit-level=high` clean. Prefer reproducing Claudian's own diff/hunk logic over a new dep. | Documented deps; SHA-pinned CI; audit clean |
| NFR-RR-014 | performance | Rich blocks render incrementally as their chunks arrive (no batch-on-complete); the live thinking timer and tool-status updates are visible during the turn; large diffs cap their DOM (REQ-RR-027) to avoid jank. Detailed latency thresholds inherit from steering once populated. | Incremental render observable; capped diff DOM; no perceptible batch delay vs baseline (NFR-RR-011) |

> **New-threshold note:** the project steering docs (`docs/steering/quality.md`,
> `docs/steering/operations.md`) remain unpopulated for this repo (as in PRD-CC-001), so NFR-RR-014
> states a qualitative incremental-render target tied to the captured `claudian-main` baseline
> (NFR-RR-011) rather than a numeric latency. Any numeric latency target introduced later must be
> recorded here and in steering. P2 introduces **no other new numeric threshold**; the diff
> display caps (300px scroll, `NEW_FILE_DISPLAY_CAP`) are reproduced from Claudian
> (`DiffRenderer.ts`), not newly invented.

## Success metrics

- **North star:** A user with the `claude` CLI logged in runs a turn that uses tools, edits a file,
  thinks, and keeps a todo list, and the agent sidebar renders each as a legible, collapsible,
  perceptually-Claudian block (tool-call, word-level diff, thinking, todo, subagent) plus the turn's
  token usage — end-to-end, in a clean vault.
- **Supporting:**
  - Every P2 renderer renders + behaves against the MockBridge in `npm run dev` and the
    LocalStorageBridge fixture replay, with no subprocess.
  - All P2 surface screenshots (320/520/720 px, light+dark) pass perceptual + `--sp-*` token parity
    review against `claudian-main` (charter §5; matrix coordinated with issue #434).
  - Every `must` REQ-RR-* maps 1:1 to at least one passing test (traceability green).
  - Zero `v-html`/`innerHTML` in the P2 render path (NFR-RR-006 lint + the XSS-as-text test pass).
- **Counter-metric — scope leakage vs the Non-goals list:** zero P2 code, tokens, or components
  implement an out-of-scope surface — specifically **none of**: tabs/history/resume/fork/rewind/
  compact/title-gen (NG1), composer power (NG2), **any inline interactive / approval block or
  `Inline*` widget** (NG3 — `InlineAskUserQuestion`/`InlineExitPlanMode`/`InlinePlanApproval` must
  not be implemented), attachments (NG4), the P6 toolbar context-meter widget or other selectors
  (NG5), MCP (NG6), Codex/Opencode provider-lifecycle subagent consolidation (NG7), stored secret
  (NG8), migration code (NG9). Measured by the reviewer against this list; any leak fails the gate.

## Release criteria

What must be true to ship P2 (merge the P2 slice to `next`):

- [ ] All `must` REQ-RR-* pass their acceptance criteria with tests (REQ-RR-001, 002, 003, 004,
      005, 006, 007, 010, 011, 015, 016, 018, 019, 019a, 020, 020a, 013, 014, 022, 023, 025, 026, 021).
- [ ] `should` REQ-RR-012, 017, 021a, 021b, 024, 024a, 027 pass, or are explicitly deferred with a
      recorded decision.
- [ ] All NFR-RR-* met, or explicitly waived with an ADR — **especially NFR-RR-006 (no `v-html`/
      raw-HTML, the hardest)**, NFR-RR-001/002 (DDD + 3 bridges), NFR-RR-009 (manifest unchanged),
      NFR-RR-010 (no secret / no migration).
- [ ] CLAR-RR-002 resolved: the architect's ADR blessing the additive `StreamChunk` + `ChatMessage`/
      `ContentBlock`/`ToolCallInfo` growth (incl. the `toolUseResult` shape decision — see CLARs) is
      filed and accepted **before P2 design proper**.
- [ ] CLAR-RR-003 resolved: the render-seam decision (one block-renderer tree vs per-type
      components) and the `MarkdownRenderPort` backing upgrade (Obsidian `MarkdownRenderer`) are
      decided in design.
- [ ] CLAR-RR-001 confirmed (idea/research depth — charter §3.1 + audits + `claudian-main` stand in,
      mirroring P1; or a thin `idea.md` filed).
- [ ] Parity screenshots captured and signed off (NFR-RR-011/012; charter §5.1–§5.4; matrix #434).
- [ ] Full verify gate green on `next`: `npm audit` + typecheck + lint + test (coverage 80/70/80/80)
      + build + build:web + docs:api; `npm run test:all` exit zero, zero bypasses.
- [ ] Traceability matrix shows every requirement with a downstream chain by `/spec:review`.

## Open questions / clarifications

> CLAR-RR-001..003 originate in `workflow-state.md`; CLAR-RR-002 (union/model growth) is the
> ADR-worthy one that must be blessed before design proper, mirroring P1's CLAR-CC-001 gate.

- **CLAR-RR-001** — *Idea/research depth (mirror P1).* Confirm whether the charter §3.1 inventory +
  the per-surface frontend/backend audits + `claudian-main` suffice as idea+research for P2 (as they
  did for P1, where `idea.md`/`research.md` were skipped), or whether a thin `idea.md` is warranted.
  **Owner: analyst / pm.** Recommendation: **mirror P1** — the audits + charter stand in; no separate
  idea/research. Non-blocking for requirements.

- **CLAR-RR-002** — *`StreamChunk` + `ChatMessage` additive growth — bless the union/model growth
  (ADR-worthy).* The P2 `StreamChunk` members are **already declared** in
  `src/domain/chat/StreamChunk.ts`; P2 emits them. Confirmation against `claudian-main`
  `chat.ts:137` finds the member **names and field shapes match**, with **one shape divergence to
  flag**: our `tool_result`/`subagent_tool_result` declare `toolUseResult?: unknown`, while Claudian
  uses the typed `toolUseResult?: SDKToolUseResult` (`diff.ts:27` — `{ structuredPatch?,
  filePath?, … }`). Because the Write/Edit word-level diff (REQ-RR-026) reads `structuredPatch`, P2
  likely needs to tighten `unknown` → a `SDKToolUseResult`-equivalent domain type. **This narrowing,
  plus the `ChatMessage` growth (`contentBlocks`/`toolCalls`) and the new `ContentBlock` /
  `ToolCallInfo` / `DiffLine` / `DiffStats` / `SubagentInfo` / `TodoItem` domain types, is the
  architecturally load-bearing growth that needs the architect's ADR before design proper.** Do not
  silently change the union — flag and ADR it. **Owner: architect.** Recommendation: file an ADR
  (mirroring ADR-CC-001) that (a) blesses the additive `ChatMessage`/`ContentBlock`/`ToolCallInfo`
  growth, and (b) replaces `toolUseResult?: unknown` with a typed domain shape mirroring
  `SDKToolUseResult`. **Blocks `accepted` status.**

- **CLAR-RR-003** — *Render seam + `MarkdownRenderPort` backing (design-time, ADR-worthy).* Two
  coupled decisions: (1) **render-seam shape** — one `MessageBlockRenderer` component tree that
  switches on `ContentBlock.type` (mirroring Claudian's single `MessageRenderer.renderContentBlocks`
  loop), vs per-type components (`ToolCallBlock`/`ThinkingBlock`/`WriteEditBlock`/`SubagentBlock`/
  `TodoList`) composed by a thin dispatcher. (2) **`MarkdownRenderPort` backing** — P1 ships
  `safeMarkdownRender` returning paragraph-only nodes (`MarkdownRenderPort.ts`), and CLAR-CC-005
  deferred the **Obsidian `MarkdownRenderer` backing to P2**; tool/thinking/subagent content is
  richer markdown, so P2 must decide whether to (a) upgrade the port's backing to Obsidian's
  renderer **while keeping the structured-node DTO shape** (so the UI stays declarative, no
  `v-html`), or (b) extend the safe node model with the block types P2 needs. **Owner: architect.**
  Recommendation: per-type components behind a thin block-dispatcher (testable in isolation,
  NFR-RR-005), and upgrade the `MarkdownRenderPort` backing to Obsidian's `MarkdownRenderer`
  **without changing the structured-node return shape** (honouring NFR-RR-006). Resolve in design;
  ADR if the port shape changes. **Held for design.**

- **CLAR-RR-004** *(new — design-time, non-blocking)* — *Provider-lifecycle subagent split.* The
  frontend audit flags whether provider-lifecycle (Codex/Opencode `spawn_agent`/`wait`) subagent
  consolidation is P2 or deferred. This PRD scopes **P2 = the Claude Task/Agent subagent path only**
  and **defers provider-lifecycle consolidation to P9** (NG7, REQ-RR-021b). **Owner: pm
  (scoped) / architect (confirms the seam).** Confirm at design; non-blocking for requirements.

- **CLAR-RR-005** *(new — design-time, non-blocking)* — *Number of specialised expanded tool
  renderers in P2.* `ToolCallRenderer` has ~14 specialised expanded renderers (bash `$ command` +
  output, web-search link rows, tool-search, apply_patch diff, agent-lifecycle JSON). Decide which
  are P2 vs deferred. **Owner: ux-ui-designer (Part A) / architect.** Recommendation: P2 ships the
  **generic expanded renderer** (monospace pre-wrapped result + the per-tool summary heuristics
  REQ-RR-019a) plus the **Write/Edit diff** specialisation (Group G); the niche specialised
  renderers (web-search link parsing, tool-search rows, agent-lifecycle JSON) are a design-time
  scope call, deferable without breaking parity of the common path. Non-blocking for requirements.

- **CLAR-RR-006** *(new — design-time, non-blocking)* — *Thinking brand colour source.* Claudian's
  thinking uses the provider brand `#D97757` (and compact cyan `#5bc0de`). Per charter §1, P2 must
  drive thinking colour from `--sp-accent` (with optional `[data-provider]` aliasing), not the
  hardcoded hex. **Owner: ux-ui-designer / brand-reviewer.** Confirm the token at design (REQ-RR-013,
  NFR-RR-007). Non-blocking for requirements.

## Out of scope

Explicitly **not** in P2 (each maps to a later charter phase; see Non-goals NG1–NG10):

- Tabs / sessions / history / resume / fork / rewind / compact / title-gen (P3) — P2 renders the
  `context_compacted` block if it arrives but implements no compaction/history/thread machinery.
- Composer power: slash `/`, skills `$`, `@mention`, instruction `#`, plan mode `Shift+Tab`,
  bang-bash `!`, queue/steer row (P4).
- **Inline interactive / approval blocks**: ask-user-question, exit-plan-mode, plan-approval, any
  approval flow — the `InlineAskUserQuestion.ts` / `InlineExitPlanMode.ts` / `InlinePlanApproval.ts`
  surfaces (P7). P2 is **render-only**, no interaction/approval.
- File / image context & attachments: file chips, image thumbnails/embed/modal, selection
  indicators, inline-edit (P5).
- Toolbar control strip: model / mode / permission / thinking / service-tier / MCP selectors,
  external-context control, and the **240° arc context-meter toolbar widget** (P6). P2 surfaces
  in-turn token info (REQ-RR-024), not the meter widget.
- MCP client / config / tester / selector (P8).
- Codex + Opencode providers, provider registry UI, model routing, and provider-lifecycle subagent
  consolidation (P9).
- Stored secret / API-key transport / `SecretStorePort` usage (defers; carried from PRD-CC-001).
- Settings shell / per-provider settings UX (P10); i18n beyond the existing en/de stub (P11); a11y
  final cross-surface sign-off pass (P12 — P2 surfaces still meet WCAG 2.2 AA per NFR-RR-008).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then on every REQ; each REQ maps to a Claudian
      path/symbol + a future test).
- [x] NFRs listed with targets (inherited defaults restated; no new numeric threshold introduced —
      caps reproduced from Claudian; NFR-RR-006 no-raw-HTML called out as the hardest).
- [x] Success metrics defined (including a counter-metric: scope leakage vs the Non-goals list).
- [x] Release criteria stated.
- [ ] `/spec:clarify` returned no open questions — **CLAR-RR-002 (ADR: union + `ChatMessage` growth,
      incl. `toolUseResult` shape) must be resolved before design proper; CLAR-RR-003 (render seam +
      `MarkdownRenderPort` backing) resolves at design; CLAR-RR-001/004/005/006 are
      non-blocking/design-time.** Status held at `draft` until CLAR-RR-002 is blessed (then
      `accepted`), mirroring PRD-CC-001's discipline.
