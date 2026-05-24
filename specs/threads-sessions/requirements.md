---
id: PRD-TS-001
title: Threads & Sessions (P3) — multi-tab chat, history, resume, fork, rewind, compact, title-gen
stage: requirements
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: accepted     # unblocked: ADR-TS-001/002/003 recorded + accepted (CLAR-TS-001..004 resolved, autonomous drive 2026-05-25)
owner: pm
integration_branch: next
reference: D:\Projects\claudian-main   # MIT, read-only parity reference
inputs:
  - specs/claudian-reboot/parity-charter.md            # §3.2, §4 (P3 row), §5, §6
  - specs/claudian-reboot/claudian-audit-frontend.md   # §3.2 tab/history/fork/rewind/compact maps
  - specs/claudian-reboot/claudian-audit-backend.md     # sessions/history/fork/rewind storage + aux services + new ports
  - specs/chat-core/spec.md                            # SPEC-CC-001..023 (P1 single-thread contract this generalises)
  - specs/rich-rendering/spec.md                       # SPEC-RR-001..023 (P2 block model these threads carry)
  - src/domain/ports/ChatRuntimePort.ts                # the nine-member P1 port resume/rewind/fork hang off
  - src/ui/stores/chatStore.ts                         # the single-thread store P3 generalises to N tabs
created: 2026-05-25
updated: 2026-05-25
---

# PRD — Threads & Sessions (P3)

## Summary

P3 is the third vertical slice of the claudian-reboot epic. P1 (chat-core) gave us a **single-thread**
streaming chat surface; P2 (rich-rendering) gave that thread tool-calls, thinking, diffs, todos and
subagents. P3 makes the surface **multi-conversation**: the user opens and switches between several
chat tabs, each carrying its own conversation and runtime/session binding; conversations **persist**
and can be **resumed** later; a conversation can be **forked** at a point into a new tab, **rewound**
to an earlier turn, and **compacted**; and each conversation gets an **auto-generated title**. This is
charter §3.2 / §4 (P3 row). It is built on the P1/P2 surface, reproduces the Claudian tab/history/
resume/fork/rewind/compact/title-gen experience within the Specorator architecture (DDD + narrow
ports + three bridges + perceptual `--sp-*` parity), and defines the **per-provider history / title /
rewind seams** while wiring **only Claude** (Codex/Opencode arrive at P9). We do it now because the
epic operates in autonomous-drive mode and tabs+history are the next coherent Claudian surface after
rich rendering, with no dependency on the composer-power (P4) or approvals (P7) phases.

## Goals

- **G1** — Generalise the single-thread P1 `chatStore` to **N independent tabs**, each with its own
  conversation, status, runtime binding, and session id, with a DTO-only store boundary (ADR-003).
- **G2** — **Persist** conversations so they survive a view reload / Obsidian restart, and let the
  user **resume** a prior conversation from a history list.
- **G3** — Let the user **fork** a conversation at a chosen point into a **new tab**, preserving
  lineage to the source session.
- **G4** — Let the user **rewind** a conversation to an earlier turn (conversation-only at P3; the
  code-and-conversation mode affordance exists but its filesystem effect is gated to the provider seam).
- **G5** — Let the user **compact** a conversation and have a **title auto-generated** for each
  conversation (immediate fallback title, then an async AI title that yields to a manual rename).
- **G6** — Define the **per-provider history, title-generation, and rewind/fork seams** (ports /
  service shapes) such that Codex/Opencode can be added at P9 with **no rework** of the P3 surface,
  while P3 wires only the Claude provider.
- **G7** — Hit **perceptual parity** with Claudian's tabs/history/resume/fork surfaces (numbered
  square tab badges with the border-colour state machine, drop-UP blurred history menu, fork-target
  modal, rewind hover toolbar, compacted-boundary divider) through `--sp-*` tokens.

## Non-goals

- **NG1** — Composer power: slash `/`, skills `$`, `@mention`, instruction `#`, plan mode, bang-bash
  `!`. → **P4**. (The `/resume`, `/fork`, `/compact`, `/clear`, `/new` *built-in command words* are
  composer triggers and are NOT wired in P3; P3 exposes the same actions via buttons / menus only.)
- **NG2** — Inline approvals / interactive blocks (ask-user / exit-plan / plan-approval). → **P7**.
- **NG3** — Attachments (file chips, images, external/canvas/browser selection, inline edit). → **P5**.
- **NG4** — MCP client / config / selector. → **P8**.
- **NG5** — Settings-shell UX (provider tabs, env snippets, keyboard-nav settings, per-provider
  settings panels). → **P10**.
- **NG6** — Codex and Opencode providers. → **P9**. P3 defines the per-provider history / title /
  rewind seams but wires **only Claude**; no second provider, no provider registry UI, no per-tab
  provider switching menu in P3.
- **NG7** — The **filesystem/git side-effect** of "code and conversation" rewind. The two-mode rewind
  menu affordance must exist (G4), but P3 only executes the conversation-only rewind; the code rollback
  is left to the provider/runtime seam and proven in a later phase.
- **NG8** — Beyond-vault / home-directory history reading for non-Claude providers, and the Codex
  JSONL / Opencode ACP history formats. → **P9** (the `HomeFsPort` ADR is flagged but only the Claude
  path is exercised at P3, per CLAR-TS-001).
- **NG9** — i18n of P3 microcopy across the 10 locales. → **P11** (P3 ships English source strings).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| **Power chat user** (the Claudian user we are reproducing for) | Run several conversations side by side and pick up old ones | Multi-tab + resume are the daily-driver affordances; without them the surface is a toy. |
| **Spec-driven contributor** (drives Specorator features) | Fork a working conversation to try a variant without losing the original; rewind a wrong turn | Fork/rewind keep an exploratory session safe and cheap to branch. |
| **The architect** (records P3 ADRs) | Clear options + constraints for the four load-bearing P3 decisions | P3 cannot reach `accepted` until these ADRs are blessed (CLAR-TS-001..004). |
| **The reviewer / parity owner** | Each REQ maps to a Claudian source path + a testable acceptance, and to a parity screenshot | Charter §5 makes the per-surface Claudian mapping the review contract. |
| **Returning / upgrading user** | A fresh, predictable state; no half-migrated old sessions | CHARTER-REQ-FRESH: no backwards compatibility — load-or-default, no migration. |

## Jobs to be done

- When I am mid-conversation and a new question comes up, I want to **open another chat tab**, so I can
  pursue it without losing my current thread.
- When I reopen the chat days later, I want to **resume a past conversation from a list**, so I continue
  where I left off.
- When a conversation reaches a good branching point, I want to **fork it into a new tab**, so I can
  explore a variant while keeping the original intact.
- When the agent took a wrong turn, I want to **rewind to an earlier message**, so I can retry from a
  known-good point.
- When a conversation grows long, I want to **compact it** and have it **carry a meaningful title**, so
  the history list stays navigable without manual bookkeeping.

## Functional requirements (EARS)

> EARS notation (`docs/ears-notation.md`); five patterns: **ubiquitous**, **event-driven** (WHEN),
> **state-driven** (WHILE), **optional-feature** (WHERE), **unwanted-behaviour** (IF/THEN). One
> requirement per entry; one named system ("the plugin"); exactly one behaviour (no hidden `and`).
> Each REQ cites its Claudian parity source (the behaviour spec) and a testable Given/When/Then.
> Grouped by sub-surface: **tabs · history-persistence · resume · fork · rewind · compact · title-gen ·
> seams**.

### — Group A: Multi-tab chat —

#### REQ-TS-001 — Open a new chat tab

- **Pattern:** event-driven
- **Statement:** *WHEN the user activates the new-tab control, the plugin SHALL create a new empty chat
  tab with its own conversation, status, and runtime/session binding, and make it the active tab.*
- **Parity source:** `features/chat/tabs/TabManager.ts` (lifecycle, provider warmup), `tabs/Tab.ts`,
  `tabs/TabBar.ts` (new-tab control in header); `components/tabs.css`.
- **Acceptance:**
  - Given the surface shows N tabs with tab K active.
  - When the user activates the new-tab control.
  - Then a tab N+1 exists, is the active tab, shows the empty/welcome state, and tabs 1..K retain their
    conversations and statuses unchanged.
- **Priority:** must
- **Satisfies:** charter §3.2 (multi-tab), §4 P3 row; depends on SPEC-CC-016 (single-thread store)

#### REQ-TS-002 — Switch between tabs

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects a tab badge, the plugin SHALL make that tab the active tab and
  display its conversation.*
- **Parity source:** `tabs/TabBar.ts` (badge click switches tabs), `tabs/TabManager.ts`; tab badge
  state machine in `components/tabs.css`.
- **Acceptance:**
  - Given tab A is active and tab B holds a different conversation.
  - When the user selects tab B's badge.
  - Then tab B becomes active, its conversation is displayed, and tab A's conversation state is
    preserved (not reset).
- **Priority:** must
- **Satisfies:** charter §3.2

#### REQ-TS-003 — Close a chat tab

- **Pattern:** event-driven
- **Statement:** *WHEN the user closes a tab, the plugin SHALL remove that tab and its in-memory
  conversation binding and SHALL activate an adjacent remaining tab.*
- **Parity source:** `tabs/TabManager.ts` (close lifecycle), `tabs/types.ts` (MIN/MAX/DEFAULT counts).
- **Acceptance:**
  - Given two or more tabs exist and tab B is active.
  - When the user closes tab B.
  - Then tab B is gone, an adjacent tab is active, and the remaining tabs' conversations are unchanged.
- **Priority:** must
- **Satisfies:** charter §3.2

#### REQ-TS-004 — Minimum one tab

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user closes the last remaining tab, THEN the plugin SHALL leave exactly one
  empty tab open rather than zero tabs.*
- **Parity source:** `tabs/types.ts` (MIN tab count); `tabs/TabManager.ts` close guard.
- **Acceptance:**
  - Given exactly one tab is open.
  - When the user closes it.
  - Then exactly one empty/welcome tab remains and is active (the surface is never tabless).
- **Priority:** must
- **Satisfies:** charter §3.2; CHARTER constraint (surface always usable)

#### REQ-TS-005 — Tab-count ceiling

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user attempts to open a tab beyond the configured maximum, THEN the plugin
  SHALL not create the tab and SHALL surface a non-blocking notice.*
- **Parity source:** `tabs/types.ts` (MAX tab count); `tabs/TabManager.ts` create guard.
- **Acceptance:**
  - Given the maximum number of tabs is open.
  - When the user activates the new-tab control.
  - Then no new tab is created, the active tab is unchanged, and a non-blocking notice explains the
    limit.
- **Priority:** should
- **Satisfies:** charter §3.2 (MAX_TABS parity — exact value flagged in audit; resolve at design)

#### REQ-TS-006 — Per-tab streaming isolation

- **Pattern:** state-driven
- **Statement:** *WHILE one tab's conversation is streaming, the plugin SHALL keep every other tab's
  conversation status and content unaffected.*
- **Parity source:** `tabs/TabManager.ts` (per-tab runtime); `chatStore.ts` status machine generalised
  per tab; tab badge streaming state in `components/tabs.css`.
- **Acceptance:**
  - Given tab A is streaming and tab B is idle with prior messages.
  - When the user switches to tab B mid-stream.
  - Then tab A keeps streaming in the background and tab B shows its idle conversation unchanged; on
    return, tab A reflects the streamed content.
- **Priority:** must
- **Satisfies:** charter §3.2; generalises SPEC-CC-016 `ChatStatus`

#### REQ-TS-007 — Background-activity tab badge state

- **Pattern:** state-driven
- **Statement:** *WHILE a non-active tab is streaming, the plugin SHALL render that tab's badge in the
  streaming state, and WHILE a non-active tab needs attention (its turn ended or errored), the plugin
  SHALL render that badge in the attention state.*
- **Parity source:** `tabs/TabBar.ts` / `components/tabs.css` — badge border-colour machine: active =
  accent, streaming = provider brand (`[data-provider]`), attention = error colour, idle = default.
- **Acceptance:**
  - Given tab B is not active and is streaming.
  - When the user is on tab A.
  - Then tab B's badge shows the streaming (provider-brand border) state; and when tab B's turn ends
    while still non-active, its badge shows the attention (error-colour border) state.
- **Priority:** should
- **Satisfies:** charter §3.2 parity-critical (border-colour state machine, provider-brand streaming)

### — Group B: Conversation history & persistence —

#### REQ-TS-008 — Persist a conversation

- **Pattern:** event-driven
- **Statement:** *WHEN a turn in a tab completes, the plugin SHALL persist that tab's conversation
  (its messages and session metadata) to the chosen P3 persistence store.*
- **Parity source:** `core/bootstrap/SessionStorage.ts` / `storage.ts` (`SharedAppStorage` session
  metadata), `providers/claude/history/ClaudeHistoryStore.ts`; persistence location is **CLAR-TS-001**.
- **Acceptance:**
  - Given a tab whose conversation has at least one completed turn.
  - When the turn completes (`onDone`).
  - Then the conversation's messages and session metadata are written to the persistence store and are
    readable after a fresh load of the surface.
- **Priority:** must
- **Satisfies:** charter §3.2 (history); **blocked on CLAR-TS-001** (persistence location ADR)

#### REQ-TS-009 — Conversation metadata record

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL maintain, for each persisted conversation, a provider-neutral
  metadata record holding at least an id, a title, a created timestamp, an updated timestamp, the
  provider id, and the resolvable session id.*
- **Parity source:** `core/bootstrap/storage.ts` `SharedAppStorage` (provider-neutral title/timestamps/
  model metadata distinct from provider-native transcript).
- **Acceptance:**
  - Given a persisted conversation.
  - When its metadata record is read.
  - Then the record contains id, title, createdAt, updatedAt, providerId, and sessionId (or null when
    no session yet exists).
- **Priority:** must
- **Satisfies:** charter §3.2; informs CLAR-TS-002 (store model) + CLAR-TS-003 (session/fork)

#### REQ-TS-010 — List persisted conversations

- **Pattern:** event-driven
- **Statement:** *WHEN the user opens the history list, the plugin SHALL present the persisted
  conversations ordered most-recently-updated first, each showing its title and a relative date.*
- **Parity source:** `shared/components/ResumeSessionDropdown.ts` (history list), `ConversationController`
  wiring; `components/history.css`, `features/resume-session.css`.
- **Acceptance:**
  - Given three persisted conversations with distinct `updatedAt` values.
  - When the user opens the history list.
  - Then all three appear, ordered newest-updated first, each with its title and a relative date label.
- **Priority:** must
- **Satisfies:** charter §3.2 (history)

#### REQ-TS-011 — Rename a conversation

- **Pattern:** event-driven
- **Statement:** *WHEN the user confirms a rename on a history item, the plugin SHALL update that
  conversation's stored title and mark the title as manually set.*
- **Parity source:** `ResumeSessionDropdown.ts` inline rename; `components/history.css` (inline rename
  input). Manual-rename flag ties to REQ-TS-024 (title-gen yields to manual rename).
- **Acceptance:**
  - Given a history item with an auto-generated title.
  - When the user renames it and confirms.
  - Then the stored title is the new value, it persists across reload, and the conversation is flagged
    manually-titled.
- **Priority:** should
- **Satisfies:** charter §3.2 (history rename); interacts with REQ-TS-024

#### REQ-TS-012 — Delete a conversation

- **Pattern:** event-driven
- **Statement:** *WHEN the user confirms deletion of a history item, the plugin SHALL remove that
  conversation's persisted record and transcript from the persistence store.*
- **Parity source:** `ResumeSessionDropdown.ts` delete action; `ClaudeConversationHistoryService.ts`
  `deleteConversationSession`; `components/history.css` (delete hover → red).
- **Acceptance:**
  - Given a persisted conversation visible in the history list.
  - When the user deletes it and the deletion is confirmed.
  - Then it no longer appears in the list and its persisted record/transcript is gone after reload.
- **Priority:** should
- **Satisfies:** charter §3.2

### — Group C: Resume —

#### REQ-TS-013 — Resume a conversation into a tab

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects a conversation from the history list, the plugin SHALL load that
  conversation's messages into a tab and bind that tab's runtime to the conversation's session so a
  subsequent turn continues it.*
- **Parity source:** `ResumeSessionDropdown.ts` select; `ClaudeConversationHistoryService.ts`
  `hydrateConversationHistory` + `resolveSessionIdForConversation`; `ChatRuntimePort.getSessionId`.
- **Acceptance:**
  - Given a persisted conversation with messages and a resolvable session id.
  - When the user selects it from the history list.
  - Then a tab shows that conversation's messages (rendered via the P2 block path), and the tab's
    runtime resolves the conversation's session id for the next turn.
- **Priority:** must
- **Satisfies:** charter §3.2 (resume); **blocked on CLAR-TS-003** (resume-via-sessionId semantics)

#### REQ-TS-014 — Resumed history renders read-only-faithfully

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL render a resumed conversation's stored messages using the same
  P2 ordered content-block path used for live turns, with all collapsibles collapsed by default.*
- **Parity source:** P2 `MessageRenderer.renderStoredMessage` / SPEC-RR-012/018 (stored replay
  collapsed-by-default); `ChatMessage.contentBlocks`.
- **Acceptance:**
  - Given a stored conversation containing text, a tool-call, and a thinking block.
  - When it is resumed into a tab.
  - Then the blocks render in stored order via the P2 path with the tool-call and thinking block
    collapsed.
- **Priority:** must
- **Satisfies:** charter §3.2; reuses SPEC-RR-012/018 (no P2 rework)

#### REQ-TS-015 — Resume keyboard navigation

- **Pattern:** event-driven
- **Statement:** *WHEN the history list is open and focused, the plugin SHALL move the selection with
  Arrow Up / Arrow Down, activate the selected item with Enter, and close the list with Escape.*
- **Parity source:** `ResumeSessionDropdown.handleKeydown` (Arrow/Enter/Esc).
- **Acceptance:**
  - Given the history list is open with three items.
  - When the user presses Arrow Down twice then Enter.
  - Then the third item is selected and activated (resumed); and pressing Escape instead closes the
    list with no selection.
- **Priority:** must
- **Satisfies:** charter §3.2; NFR-TS-009 (WCAG keyboard nav)

### — Group D: Fork —

#### REQ-TS-016 — Fork affordance on user messages

- **Pattern:** optional-feature
- **Statement:** *WHERE the active tab's provider capability indicates fork support, the plugin SHALL
  show a fork control in each user message's hover action toolbar.*
- **Parity source:** `MessageRenderer.addForkButton` (gated by `capabilities.supportsFork`),
  `git-fork` icon in the user-message hover toolbar (`components/messages.css`).
- **Acceptance:**
  - Given the active tab's provider reports `supportsFork = true`.
  - When the user hovers a user message.
  - Then a fork control (the `git-fork` affordance) is shown in that message's action toolbar; and when
    the provider reports `supportsFork = false`, no fork control is shown.
- **Priority:** must
- **Satisfies:** charter §3.2 (fork); capability-gated per backend audit; **CLAR-TS-003** (fork semantics)

#### REQ-TS-017 — Choose fork target

- **Pattern:** event-driven
- **Statement:** *WHEN the user activates the fork control, the plugin SHALL present a fork-target
  chooser in an Obsidian `Modal` and SHALL not use `window.confirm`/`window.prompt`.*
- **Parity source:** `shared/modals/ForkTargetModal.ts` (+ `chooseForkTarget`); `modals/fork-target.css`
  (small ≤340px option list). CLAUDE.md: blocking flows use an Obsidian `Modal` subclass.
- **Acceptance:**
  - Given the user activated the fork control on a user message.
  - When the chooser opens.
  - Then it is an Obsidian `Modal` listing the fork target option(s); and no `window.confirm`/`prompt`/
    `alert` is invoked anywhere in the flow.
- **Priority:** must
- **Satisfies:** charter §3.2; NFR-TS-007 (Obsidian Modal for blocking flows)

#### REQ-TS-018 — Fork creates a new tab from the chosen point

- **Pattern:** event-driven
- **Statement:** *WHEN the user confirms a fork target, the plugin SHALL open a new tab containing the
  source conversation up to the chosen point and SHALL derive the new tab's provider session-state from
  the source session and resume offset rather than copying the transcript file.*
- **Parity source:** `rewind.ts` / `ClaudeRewindService.ts`; `ProviderConversationHistoryService.
  buildForkProviderState(sourceSessionId, resumeAt, sourceState)` (backend audit: "fork = derive new
  provider-state pointing at a source session + resume offset; not a file copy").
- **Acceptance:**
  - Given a conversation with messages M1..M5 and the user forks at M3.
  - When the fork is confirmed.
  - Then a new tab opens containing M1..M3, the source tab is unchanged, and the new tab's session-state
    references the source session id with a resume offset at M3.
- **Priority:** must
- **Satisfies:** charter §3.2 (fork); **blocked on CLAR-TS-003** (fork semantics on the runtime seam)

### — Group E: Rewind / checkpoint —

#### REQ-TS-019 — Rewind eligibility

- **Pattern:** optional-feature
- **Statement:** *WHERE a user message has a following assistant response that bears a session-turn id
  (proving the runtime processed the turn) and the provider capability indicates rewind support, the
  plugin SHALL show a rewind control in that user message's hover action toolbar.*
- **Parity source:** `rewind.ts` `findRewindContext` (scans for the previous assistant turn id +
  whether a response followed → eligibility); `MessageRenderer.addRewindButton`/`isRewindEligible`
  (gated by `supportsRewind`); `rotate-ccw` icon in `.claudian-user-msg-actions`.
- **Acceptance:**
  - Given a user message followed by an assistant response carrying a turn id, with `supportsRewind =
    true`.
  - When the user hovers that user message.
  - Then a rewind control is shown; and given a user message with no following turn-id-bearing response,
    no rewind control is shown.
- **Priority:** must
- **Satisfies:** charter §3.2 (rewind); eligibility computation is a pure application function

#### REQ-TS-020 — Two-mode rewind menu

- **Pattern:** event-driven
- **Statement:** *WHEN the user activates the rewind control, the plugin SHALL present a menu offering
  "conversation only" and "code and conversation" as two distinct, distinctly-iconed options.*
- **Parity source:** `MessageRenderer.showRewindMenu` — two items: "conversation only"
  (`message-square`) and "code and conversation" (`rotate-ccw`).
- **Acceptance:**
  - Given the user activated the rewind control.
  - When the menu opens.
  - Then it shows exactly two options — "conversation only" and "code and conversation" — each with its
    own icon.
- **Priority:** must
- **Satisfies:** charter §3.2 parity-critical (the two-mode menu)

#### REQ-TS-021 — Conversation-only rewind executes

- **Pattern:** event-driven
- **Statement:** *WHEN the user chooses "conversation only" rewind to a user message, the plugin SHALL
  truncate the tab's conversation to that point and set the runtime's resume checkpoint so the next
  turn continues from there.*
- **Parity source:** `rewind.ts`; `ClaudeRewindService.ts` (`ChatRewindMode = 'conversation'`);
  `ChatRuntimePort` resume-checkpoint seam (CLAR-TS-003).
- **Acceptance:**
  - Given a conversation M1..M5 and the user rewinds "conversation only" to M3.
  - When the rewind executes.
  - Then the tab shows M1..M3 (later messages removed) and the runtime's resume checkpoint is set at M3
    for the next turn.
- **Priority:** must
- **Satisfies:** charter §3.2 (rewind); **blocked on CLAR-TS-003** (rewind checkpoint semantics)

#### REQ-TS-022 — Code-and-conversation rewind affordance is gated, not executed

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user chooses "code and conversation" rewind in P3, THEN the plugin SHALL NOT
  perform any filesystem or git change and SHALL surface a non-blocking notice that the code-rollback
  is not available in this phase.*
- **Parity source:** charter §6 / backend audit — code rollback (`RewindFilesResult`) is the provider/
  runtime seam; NG7 defers the side-effect. The menu affordance (REQ-TS-020) still exists.
- **Acceptance:**
  - Given the rewind menu is open.
  - When the user chooses "code and conversation".
  - Then no file is modified, no git operation runs, and a non-blocking notice states the code-rollback
    is unavailable in this phase.
- **Priority:** must
- **Satisfies:** NG7; charter §6 (rewind code side-effect is a later phase)

### — Group F: Compact —

#### REQ-TS-023 — Compact a conversation

- **Pattern:** event-driven
- **Statement:** *WHEN the user invokes compact on the active tab, the plugin SHALL request a compaction
  turn from the runtime and SHALL render a context-compacted boundary in the conversation at the
  compaction point.*
- **Parity source:** `InputController.sendMessage` compact detection ("Compacting…" thinking indicator,
  `--compact` class); `MessageRenderer` `context_compacted` boundary; P2 `CompactBoundary.vue` +
  `onContextCompacted` sink leg (already in `chatStore`).
- **Acceptance:**
  - Given a tab with a multi-turn conversation.
  - When the user invokes compact.
  - Then a context-compacted boundary block is rendered at the compaction point (reusing the P2
    `context_compacted` block), and the conversation continues from the compacted state.
- **Priority:** should
- **Satisfies:** charter §3.2 (compact); reuses P2 `onContextCompacted` (REQ-RR / SPEC-RR)

### — Group G: Auto title generation —

#### REQ-TS-024 — Immediate fallback title then async AI title

- **Pattern:** event-driven
- **Statement:** *WHEN a conversation's first turn completes, the plugin SHALL set a fallback title
  immediately and SHALL then request an asynchronous AI-generated title that replaces the fallback on
  success, except WHERE the conversation has been manually renamed, in which case the plugin SHALL NOT
  overwrite the manual title.*
- **Parity source:** `InputController.triggerTitleGeneration`; `core/prompt/titleGeneration.ts`;
  `core/auxiliary/QueryBackedTitleGenerationService.ts` (one-shot cold-start aux query); status
  `pending`/`success`/`failed`. Manual-rename precedence ties to REQ-TS-011.
- **Acceptance:**
  - Given a new conversation completing its first turn and not manually renamed.
  - When the turn completes.
  - Then a fallback title appears immediately, then an AI title replaces it on success; and given the
    conversation was manually renamed first, the AI title does not overwrite the manual title.
- **Priority:** should
- **Satisfies:** charter §3.2 (title-gen); **blocked on CLAR-TS-004** (title-gen seam)

#### REQ-TS-025 — Title-generation status is observable

- **Pattern:** state-driven
- **Statement:** *WHILE an AI title is being generated for a conversation, the plugin SHALL show a
  loading indicator on that conversation's history item, and IF title generation fails, THEN the plugin
  SHALL retain the fallback title without surfacing a blocking error.*
- **Parity source:** `components/history.css` / `features/resume-session.css` (`spin` loader on the
  item during title-gen); title-gen status `pending`/`success`/`failed`.
- **Acceptance:**
  - Given title generation is in progress for a conversation visible in the history list.
  - When the list is shown.
  - Then that item shows a loading (spin) indicator; and when generation fails, the item keeps the
    fallback title and no blocking error dialog appears.
- **Priority:** could
- **Satisfies:** charter §3.2 parity (spin loader, graceful failure)

### — Group H: Per-provider seams (Claude wired; Codex/Opencode deferred) —

#### REQ-TS-026 — History/resume/fork/rewind/title route through provider seams

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL access conversation history, fork-state derivation, rewind, and
  title generation exclusively through provider-addressed seams (a history seam, a rewind/fork seam on
  the runtime, and a title-generation seam), and SHALL NOT branch on a hard-coded provider identity in
  application or UI code.*
- **Parity source:** backend audit "provider selection is data, not branch logic"; `ProviderRegistry`/
  `ProviderConversationHistoryService` contracts; `ChatRuntimePort` (resume/rewind/fork hang off it).
- **Acceptance:**
  - Given the P3 history / fork / rewind / title flows.
  - When their implementations are inspected.
  - Then each calls a provider-addressed seam (port/service) and no `if (provider === 'claude')`-style
    branch exists in application or UI layers.
- **Priority:** must
- **Satisfies:** charter §4/§6 (per-provider seams; Claude-complete first); **CLAR-TS-003/CLAR-TS-004**

#### REQ-TS-027 — Only the Claude provider is wired in P3

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL wire only the Claude provider implementation behind the P3 seams and
  SHALL NOT register a Codex or Opencode history, rewind, or title implementation in P3.*
- **Parity source:** charter §6 confirmed decision (Claude-complete first; Codex/Opencode at P9);
  `ProviderId = 'claude'` (current domain type).
- **Acceptance:**
  - Given the P3 build.
  - When the registered provider implementations are enumerated.
  - Then exactly one provider (Claude) is wired behind the history / rewind / title seams; no Codex or
    Opencode implementation is present.
- **Priority:** must
- **Satisfies:** NG6; charter §6

#### REQ-TS-028 — Seams shape additively over the P1/P2 contract

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL introduce the P3 session/rewind/fork capability additively over the
  existing nine-member `ChatRuntimePort` and the P1/P2 `ChatMessage` DTO, without renaming or removing
  any existing member.*
- **Parity source:** ADR-CC-001 (additive growth; rewind/steer/callbacks deferred to grow additively),
  ADR-RR-001 §1 (no rename/removal of P1 members); `ChatMessage.ts` doc-comment (P3 rewind fields
  `userMessageId`/`assistantMessageId`/`resumeAtMessageId` flagged as additive future growth).
- **Acceptance:**
  - Given the P1 `ChatRuntimePort` (nine members) and the P1/P2 `ChatMessage`.
  - When the P3 seams are added.
  - Then all existing members keep their names and signatures, and new capability is added by new
    members/types only.
- **Priority:** must
- **Satisfies:** ADR-CC-001 / ADR-RR-001 additive-growth invariant; **CLAR-TS-003**

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1 bounding constraints, CLAUDE.md/AGENTS.md
> architecture rules, ADR-CC-001/RR-001 conventions). Restated here, not linked. No new threshold is
> introduced beyond the documented epic constraints; the one P3-specific constraint (persistence-store
> rules) is a restatement of CHARTER-REQ-SEC/SET/FRESH, not a new threshold.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-TS-001 | architecture | DDD inward-only imports; multi-thread state regrows in the UI layer over use cases/ports | `domain ← application ← infrastructure ← ui`; no UI→infra/domain import except port types + InjectionKeys (ADR-001/008) |
| NFR-TS-002 | architecture | New seams are narrow ports with three bridge implementations | Each new port (history/rewind-fork/title) has Obsidian + Mock + LocalStorage impls; web bridges degrade gracefully |
| NFR-TS-003 | architecture | Store boundary is DTO-only; no domain class instance crosses into Pinia | Per-tab state holds plain DTOs only (ADR-003) |
| NFR-TS-004 | architecture | `Result<T,E>` at discrete/use-case boundaries; streaming failure stays the `error` `StreamChunk` member | Non-streaming P3 methods (resume/fork/rewind/title) return `Result`; no per-chunk Result/throw across the port (ADR-004, ADR-CC-001 §1) |
| NFR-TS-005 | security | No `obsidian` or `node:*` import under `src/ui/**`; all Obsidian/Node access behind ports | ESLint `no-restricted-imports` green; UI never imports `obsidian` |
| NFR-TS-006 | security | No raw HTML injection in the render path or any bridge DTO walk | No `v-html`/`innerHTML`/`outerHTML`/`insertAdjacentHTML`; enforced by lint at error severity |
| NFR-TS-007 | usability | Blocking flows use an Obsidian `Modal` subclass; non-blocking feedback uses `NotificationPort` | Fork-target chooser is an Obsidian `Modal`; no `window.confirm`/`alert`/`prompt` (`no-restricted-globals`) |
| NFR-TS-008 | maintainability | Vue components use `<script setup>` only | ESLint enforces Composition API; no Options API |
| NFR-TS-009 | accessibility | WCAG 2.2 AA: tab strip keyboard navigation + history dropdown ARIA | Tab badges reachable/operable by keyboard with roles; history list has Arrow/Enter/Esc nav + ARIA roles; "meet or beat" Claudian a11y |
| NFR-TS-010 | accessibility | Motion honours reduced-motion; states have non-colour cues | Title-gen spin + tab-badge state changes respect `prefers-reduced-motion`; tab state not conveyed by colour alone |
| NFR-TS-011 | testability | Tests mirror `src/` path-for-path with `data-testid` PageObjects; coverage gate | `tests/x/y.test.ts` mirrors `src/x/y.ts`; PageObjects query by `data-testid`; coverage 80/70/80/80 (statements/branches/functions/lines) |
| NFR-TS-012 | visual | Perceptual parity via `--sp-*` tokens; no component hex or raw Obsidian var | Tabs/history/resume/fork/rewind/compact tokens are `--sp-*`; `lint-style-tokens` guard green |
| NFR-TS-013 | privacy / persistence | Conversation transcripts persist to a store consistent with the epic rules: NOT `data.json` for settings; secrets→secret storage; device/user prefs→device-local | No secret in any persisted record; persistence location resolved by CLAR-TS-001 within these rules; no migration (load-or-default, CHARTER-REQ-FRESH) |
| NFR-TS-014 | compatibility | No backwards-compat / migration of prior sessions or settings | Fresh install starts clean; in-place upgrade ignores prior state; no compat shim, no version-bump migration (CHARTER-REQ-FRESH) |
| NFR-TS-015 | reliability | `manifest.json` identity untouched; verify gate green on `next` | `id`/`version`/`minAppVersion` unchanged; `npm run verify` + `npm run test:all` exit zero |

## Open questions / clarifications

> The four P3 decisions are **architecturally load-bearing** and are deliberately **not decided here**.
> The PM frames options + the constraint each must satisfy and (where asked) a recommendation; the
> **architect** records the ADRs in autonomous-drive mode (the architect files, the PM accepts — no
> human gate this phase). PRD `status` stays `draft` until CLAR-TS-001..004 are resolved.

- **CLAR-TS-001 — Conversation-history persistence location.** *owner: architect (ADR).*
  History transcripts are NOT a secret and NOT a device-only preference — they are user content a
  person may reasonably want portable, visible, and versioned. **Options:** (a) **vault files** under a
  feature folder (e.g. `.claudian/sessions/` or a `specs`-sibling) — portable, user-visible,
  git-trackable, via `VaultPort`; (b) **device-local store** (`app.saveLocalStorage`/`loadLocalStorage`)
  — survives reload but not synced, not git-trackable, hidden from the vault; (c) a **dedicated store**
  / home-dir store (provider-native, via the flagged `HomeFsPort`). **Constraints every option must
  satisfy:** NO `data.json` for settings; secrets→secret storage (`SecretStorePort`); device/user prefs
  →device-local; NO migration (load-or-default, CHARTER-REQ-FRESH). **PM recommendation:** option (a)
  **vault files** for the P3 Claude path — transcripts are durable user content and benefit from being
  portable, visible, and git-trackable, and `VaultPort` already exists with all three bridges; reserve
  the `HomeFsPort` home-dir path (option c) for P9 when Codex/Claude-SDK native stores arrive. The
  architect should bless the exact vault path + record the `HomeFsPort` deferral in the ADR.

- **CLAR-TS-002 — Multi-thread store model.** *owner: architect (ADR/design).*
  Generalise the single-thread P1 `chatStore` (SPEC-CC-016) to **N tabs**, each with its own messages,
  status, runtime binding, and session id. **Options:** (a) a tabs store holding an array/map of plain
  tab DTOs + the active tab id, with each tab's per-turn machinery driven the same way the P1 store
  drives a `ChatTurnSink`; (b) a store-per-tab dynamically registered/disposed; (c) keep `chatStore`
  but key all state by tab id. **Constraints:** DTO-only boundary (ADR-003, NFR-TS-003); the bound
  turn-runner + notifier stay OUTSIDE reactive state (as the P1 store does via a `WeakMap`); per-tab
  streaming isolation (REQ-TS-006); additive over the P1 store, no rename/removal of P1 actions used by
  P2 sink legs. **PM note:** no recommendation imposed — this is the architect's model call; flag the
  interaction with the (P0-removed) Vue Router (CLAUDE.md: router regrows only if a phase needs routed
  navigation — multi-tab may be pure tab state, no routing).

- **CLAR-TS-003 — Rewind/fork semantics on the runtime seam + any new history port.** *owner: architect
  (ADR).* P3 needs three session operations that ADR-CC-001 explicitly deferred from the nine-member
  `ChatRuntimePort`: **resume** (continue an existing session via its session id), **rewind**
  (set a checkpoint at an earlier turn — conversation mode at P3), and **fork** (derive a new tab's
  provider session-state from a source session + resume offset, not a file copy — backend audit). The
  backend audit recommends a **`ProviderHistoryPort`** (`hydrate`/`delete`/`resolveSessionId`/
  `buildForkState`/`listSessions`, Result-returning) alongside additive `ChatRuntimePort` growth
  (a `rewind(...)`/`setResumeCheckpoint(...)`/`resolveSessionIdForFork()` family). **Options:** (a) add
  the resume/rewind/fork members additively to `ChatRuntimePort` + a new `ProviderHistoryPort` for
  transcript hydration/lineage; (b) a single combined session port. **Constraints:** additive over the
  nine-member port (NFR-TS-004, REQ-TS-028, ADR-CC-001); `Result<T,E>` for the non-streaming members;
  fork = derive provider-state, not copy; the code-rollback rewind mode stays gated (REQ-TS-022, NG7);
  capability flags (`supportsFork`/`supportsRewind`) gate the UI (REQ-TS-016/019). This is the
  ADR-CC-001-flagged "rewind (:47) / session accessors deferred to P3" growth — bless the exact member
  set + the new port shape.

- **CLAR-TS-004 — Title generation seam.** *owner: architect (ADR/design).*
  Auto title generation is an **auxiliary one-shot model call** distinct from the main chat turn
  (`QueryBackedTitleGenerationService` over `AuxQueryRunner` — a cold-start query). **Options:** (a) a
  **side-query seam** — title-gen reuses `ChatRuntimePort.query` in a cold-start/one-shot mode (backend
  audit: "no new port needed; `AuxQueryRunner` is a one-shot wrapper over `query()`"), behind a
  `GenerateTitleUseCase` returning `Result`; (b) a **separate `AuxModelPort`** dedicated to auxiliary
  calls (frontend audit recommendation) so the UI can show pending/success/failed without coupling to
  the main stream. **Constraints:** must support the immediate-fallback-then-async-replace flow
  (REQ-TS-024) and manual-rename precedence (REQ-TS-011/024); observable status (REQ-TS-025); no
  blocking error on failure; routes through a provider-addressed seam (REQ-TS-026). **PM recommendation:**
  lean to option (a) the side-query seam for P3 (one provider, smallest additive surface — matches the
  backend audit), but defer the final call to the architect since the same seam will later carry
  instruction-refine (P4) and inline-edit (P5), which may justify the dedicated `AuxModelPort`.

## Out of scope

Restating the non-goals as deliberate exclusions for this cycle:

- Composer trigger characters and modes (`/ $ @ # !`, plan mode) — P4 (NG1).
- Inline approvals / interactive blocks — P7 (NG2).
- Attachments (files, images, selection, inline edit) — P5 (NG3).
- MCP client / config / selector — P8 (NG4).
- Settings-shell UX and per-provider settings panels — P10 (NG5).
- Codex + Opencode providers and the provider-registry UI / per-tab provider switching — P9 (NG6).
- Filesystem/git side-effect of "code and conversation" rewind — later phase (NG7).
- Beyond-vault/home-dir history and Codex JSONL / Opencode ACP history formats — P9 (NG8).
- i18n of P3 microcopy across the 10 locales — P11 (NG9).

---

## Success metrics

- **North star:** **Multi-conversation continuity** — a user can run ≥2 concurrent tabbed conversations
  and resume any persisted conversation after a full surface reload, with the resumed transcript
  rendering faithfully (REQ-TS-001/002/006/008/013/014). Measured by the P3 acceptance suite passing
  end-to-end on `next`.
- **Supporting:**
  - **Seam additivity:** the P1 nine-member `ChatRuntimePort` and the P1/P2 `ChatMessage` keep every
    member name/signature; P3 capability is added by new members/types only (REQ-TS-028) — verified by
    a type/contract check, target: zero renamed/removed P1/P2 members.
  - **Provider-agnostic flows:** zero `if (provider === ...)`-style branches in application/UI layers for
    history/fork/rewind/title (REQ-TS-026) — target: 0 occurrences.
  - **Parity coverage:** each of the seven P3 sub-surfaces (tabs, history, resume, fork, rewind, compact,
    title-gen) has ≥1 EARS REQ mapped to a Claudian source path and a parity screenshot (charter §5) —
    target: 7/7 sub-surfaces covered.
- **Counter-metric (scope leakage):** **zero** P3 artifacts implement any non-goal surface. Specifically:
  no composer trigger character / mode handler, no inline approval/interactive block, no attachment
  surface, no MCP code, no settings-shell panel, and no second provider implementation appears in the P3
  branch (NG1–NG6, NG8). Any such addition is a scope-leakage defect, not an enhancement. Tracked by the
  reviewer against this non-goals list and the `tasks.md` scope.

## Release criteria

What must be true to ship P3 (to merge `feature/threads-sessions` → `next` in autonomous-drive mode).

- [ ] CLAR-TS-001..004 resolved — the four P3 ADRs recorded by the architect and accepted by the PM
      (PRD `status` advanced from `draft` to `accepted`).
- [ ] All `must` requirements (REQ-TS-001/002/003/004/006/008/009/010/013/014/015/016/017/018/019/020/
      021/022/026/027/028) pass their acceptance criteria.
- [ ] All NFRs met (NFR-TS-001..015) or explicitly waived with an ADR.
- [ ] Test plan executed; tests mirror `src/`, use `data-testid` PageObjects, coverage 80/70/80/80; no
      critical bug open.
- [ ] Per-surface parity screenshots captured for the seven P3 sub-surfaces (charter §5.1) at the
      charter widths + light/dark, stored under the P3 parity-screenshots artifact.
- [ ] Token-mapping review green — every P3 Claudian CSS module (`tabs.css`, `history.css`,
      `resume-session.css`, `fork-target.css`, nav-sidebar) maps to `--sp-*` tokens; no raw hex/Obsidian
      var leaks (`lint-style-tokens`).
- [ ] Counter-metric clean — no non-goal surface (NG1–NG6, NG8) implemented in the P3 branch.
- [ ] `npm run verify` and `npm run test:all` exit zero on `next`; `manifest.json` untouched.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then per REQ).
- [x] NFRs listed with targets (inherited from epic constraints; restated, not linked).
- [x] Success metrics defined (including a scope-leakage counter-metric).
- [x] Release criteria stated.
- [x] `/spec:clarify` returned no open questions — **resolved**: CLAR-TS-001..004 decided by the
      architect's P3 ADRs (autonomous drive, 2026-05-25): CLAR-TS-001/003 → ADR-TS-001 (vault-file
      history + `ProviderHistoryPort`, fork-as-derive, `HomeFsPort` deferred to P9); CLAR-TS-002 +
      CLAR-TS-003 runtime half → ADR-TS-002 (N-tab `tabsStore`, router stays removed, additive
      `ChatRuntimePort` resume/rewind/`getCapabilities` growth); CLAR-TS-004 → ADR-TS-003
      (cold-start side-query title-gen, `AuxModelPort` deferred to P4/P5). PRD advanced to `accepted`.
