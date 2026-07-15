---
title: Migrate the chat transcript rendering pipeline (MessageRenderer + block renderers) to a Vue 3 + Pinia island
date: 2026-07-12
status: draft
scope: src/features/chat (MessageRenderer, rendering/*, StreamController + streaming coordinators, ChatState streaming fields), src/features/chat/ui/vue/transcript (new)
---

# Transcript Rendering Vue Migration — Design

## Context

`features/chat` is the largest remaining imperative surface. Its full view migration is
decomposed into four independently shippable sub-projects, each its own spec → plan → PR
(see ADR 0005):

1. **Chat shell** — header + tab strip + content host (shipped, ADR 0005).
2. **Transcript rendering pipeline** — `MessageRenderer` + block renderers (**THIS spec**).
3. **Composer + input toolbar**.
4. **Side panels** — status, conversation history, navigation sidebar, file/image context.

This spec covers sub-project 2. It is the biggest and highest-risk of the four: the
transcript is the daily-driver's live surface, and — unlike sub-projects 1, 3, and 4 — it
cannot be done over a genuinely untouched engine, because the live-streaming render path is
not a clean seam.

### What exists today

- **Stored render path** (`MessageRenderer`, `rendering/*`) is a clean, injectable boundary:
  it takes callbacks (`rewindCallback`, `forkCallback`, `getCapabilities`, `getWorkOrderPath`),
  does not import `ChatState` or `StreamController`, and is constructed with a mock plugin in
  `messageRenderer.perf`. `renderMessages` / `renderMessagesChunked` mount a trailing window,
  block dispatch runs through `renderAssistantMessageContent` over `ChatMessage.contentBlocks`.
- **Live-streaming path is co-owned by `ChatState` + four controllers + free-function block
  renderers.** `ChatState` holds raw DOM element pointers (`currentContentEl`, `currentTextEl`,
  `currentTextContent`, `currentThinkingState`, `thinkingEl`, `toolCallElements: Map`,
  `writeEditStates: Map`, `pendingTools`). `StreamController` routes chunks and runs a DOM-free
  block-transition projection (`StreamProjection.projectBlockTransition`), then patches DOM
  subtrees in place; `TextRenderCoordinator` / `ThinkingRenderCoordinator` accumulate content
  and re-render whole blocks on a size-aware throttle (`streamRenderBackoff`); the block
  renderers (`ToolCallRenderer.updateToolCallResult`, `WriteEditRenderer.updateWriteEditWithDiff`,
  etc.) mutate specific child elements.
- **Windowing** (`RENDER_WINDOW_SIZE = 80`) applies to stored renders only; earlier messages
  mount on demand via an explicit "Load earlier" control (not scroll-driven) and never unmount.
- **Markdown** is produced by Obsidian's async `MarkdownRenderer.render()` into a div, with
  `formatCodeBlocks` + `processFileLinks` post-processing — Obsidian owns that DOM subtree.
- **Content model** — `ChatMessage.contentBlocks: ContentBlock[]`, a discriminated union
  preserving stream order: `text`, `tool_use` (references `msg.toolCalls` by id), `thinking`,
  `subagent`, `context_compacted`, `runtime_error`. `tool_use`/`subagent` carry stable ids;
  the others have positional identity only.
- **Interactive blocking cards** (tool approval, ask-user-question, exit-plan-mode, post-plan
  approval) render under `rendering/` but are owned and resolved by `InlinePromptController`,
  which wraps each in a promise the provider runtime awaits mid-turn.

## Goal

Replace the imperative transcript — `MessageRenderer`, every block renderer, and the
DOM-patching streaming write-side — with a single **Vue 3 + Pinia island** that renders both
stored and live turns through one reactive path. The stream **consumption** logic stays; the
stream **output** changes from DOM-patching to reactive-data mutation.

## Decisions (from brainstorming)

- **Deep / unified path.** One Vue render path for live and stored — not a dual live-imperative
  / stored-Vue split. This necessarily rewrites the streaming write-side (below).
- **One big-bang plan / PR.** A single characterization-gated plan, hard-cutting the whole
  transcript at once. Internally staged into many tasks (foundation → components → streaming
  rewire → cutover → cleanup), landing as one PR. No throwaway intermediate bridge.
- **Hard cut, no feature flag.** ADR 0003/0004/0005 precedent: characterization/parity tests
  before deletion, perf suite green, manual vault smoke checklist as the merge gate.

## Architecture

The ADR 0004/0005 island seam pushed one level deeper — into the per-tab `messagesEl`.
`TabManager`, tab lifecycle, and the provider runtimes are untouched. The stream **consumption**
logic — `StreamController`'s chunk routing, `StreamProjection.projectBlockTransition` (already
DOM-free), throttle/backoff scheduling — stays intact. Only its **output target** changes from
raw DOM to reactive data.

### The DOM contract (hard constraint)

Vue takes over the transcript DOM, but four still-imperative consumers read it by
class/attribute and are **out of scope** for this sub-project:

- `NavigationController` / `NavigationSidebar` (sub-project 4) scan `.specorator-message-user`
  + `offsetTop`; `navigationSidebar.perf` gates that scan as O(mounted).
- `SelectionController` / `BrowserSelectionController` / `CanvasSelectionController` observe
  transcript content.
- `ChatDropController` overlays the transcript.
- `StreamController` auto-scroll drives the scroll container and reads pin-to-bottom state.

**The Vue transcript must reproduce the existing class names and data attributes exactly** —
`.specorator-message`, `.specorator-message-{role}`, `.specorator-message-content`,
`data-message-id`, `data-role`, `.specorator-text-block`, `.specorator-tool-*`,
`.specorator-response-footer`, the welcome / load-earlier / hydration-error chrome, etc. This
is a public contract this sub-project may not change; characterization tests lock it before the
cut, and the untouched controllers/sidebar keep working against Vue-rendered DOM.

## The reactive store + streaming write-side rewrite (the crux)

`useTranscriptStore` (Pinia, one per chat leaf, mirroring `globalPinia` from the shell island)
is a reactive read-model over the active tab's `ChatState`:

- `messages: ChatMessage[]` — projected from `ChatState.messages`; `shallowRef`, whole-array
  replacement on change (churn-minimizing contract from `useAgentBoardStore` /
  `useChatShellStore`).
- `activeStream` — the in-flight turn's reactive state: the active assistant message id, the
  active block index, `isThinking` / `isWriting` flags, and the elapsed timer. Drives the
  streaming indicator and tells `MessageBubble` which trailing block is live.

Truth stays in `ChatState`; the store never owns I/O. The write-side changes:

- **Text / thinking.** `TextRenderCoordinator` / `ThinkingRenderCoordinator` stop creating
  `currentTextEl` and calling `renderer.renderContent`. They accumulate into a reactive text
  buffer on the active block. `MarkdownHost` (below) watches that buffer and re-renders on the
  same size-aware throttle (`streamRenderBackoff`: per-frame under 4096 chars, coalesced behind
  a 200 ms frame at/over it) so perf parity holds. Collapse mode (default) keeps the
  "Writing response…" placeholder and renders once on finalize — now a reactive flag instead of
  a suppressed render.
- **Tool calls.** `StreamController` mutates `ToolCallInfo.status` / `result` / `diffData` /
  `isExpanded` on the reactive object; the Vue `ToolCall` component reacts. The
  `toolCallElements` / `writeEditStates` Maps and the DOM-patch functions
  (`updateToolCallResult`, `updateRenderedToolCallHeader`, `updateWriteEditWithDiff`,
  `mergeExistingToolCallInput`) are deleted. Streaming tool output (`tool_output`, long Bash
  logs) updates the reactive `result` under the same backoff.
- **`ChatState` DOM-pointer fields** (`currentContentEl`, `currentTextEl`, `thinkingEl`,
  `toolCallElements`, `writeEditStates`, and the raw-element side of `pendingTools`) are removed,
  replaced by data references (active message id / block index).
- **Streaming indicator** becomes reactive flags (`isThinking`, `isWriting`, elapsed seconds)
  the Vue `StreamingIndicator` renders — replacing `StreamingIndicator`'s imperative
  `state.thinkingEl` + `setInterval` DOM writes.
- **Auto-scroll.** `StreamController` keeps owning auto-scroll and pin-to-bottom detection.
  `TranscriptRoot` exposes its scroll container to the engine via the callbacks seam (mirroring
  the shell's `CONTENT_HOST_KEY` handoff) so `scrollToBottom` / `scrollToBottomIfNeeded` /
  `autoScrollEnabled` keep working against the Vue-owned container.

The in-flight assistant message is therefore an ordinary `ChatMessage` in the store whose
`contentBlocks` and `toolCalls` are appended/updated as **data** during the turn; Vue renders it
through the same components as any stored message. There is no separate live path.

## The async-markdown seam — `MarkdownHost.vue`

The one Vue-hostile surface. `MarkdownHost` owns a single element and treats its children as
opaque: on text-prop change it `empty()`s and calls `MarkdownRenderer.render(app, md, el, '',
component)`, then runs `formatCodeBlocks(el)` + `processFileLinks(app, el)` — today's exact
pipeline, including math-delimiter escaping and image-embed normalization. A monotonic
generation token drops stale async renders (a newer text value supersedes an in-flight render),
reproducing `streamRenderLoop`'s identity-token discipline. Vue never diffs inside the host.

Requirements: the Obsidian `Component` (for `MarkdownRenderer` lifecycle) and `App` are provided
via inject keys. Cross-window popout safety: element guards use `nodeType === 1` /
`ownerDocument`, never `instanceof HTMLElement` (the mountLucide / IconButton lesson).

Used by: `TextBlock`, `ThinkingBlock`, plan previews, and the work-order handoff card sections.

## Component tree

Under `src/features/chat/ui/vue/transcript/`, styled on the `.specorator-vue` baseline +
`--sp-*` tokens, but emitting the legacy `.specorator-*` transcript classes required by the DOM
contract:

```
TranscriptRoot.vue            — mounts store + event routing; exposes scroll container; owns windowing state
├── WelcomeBanner.vue         — greeting + hydration-error banner
├── LoadEarlierControl.vue    — mounts the previous window chunk above (scroll-anchored)
├── MessageList.vue           — windowed v-for (RENDER_WINDOW_SIZE = 80) over projected messages
│   └── MessageBubble.vue     — shell (.specorator-message[data-message-id][data-role]); user vs assistant
│       ├── MessageContextCard.vue     — @mention file/folder rows
│       ├── MessageImages.vue          — attachment thumbnails + full-size modal
│       ├── MessageActionBar.vue       — copy / rewind (Obsidian Menu) / fork; capability-gated
│       └── BlockList.vue              — <component :is> dispatch over contentBlocks
│            ├── TextBlock.vue          → MarkdownHost (+ copy button, work-order segment split)
│            ├── ThinkingBlock.vue      → MarkdownHost (collapsible, live "Thinking Ns…" timer)
│            ├── ToolCall.vue           — header (icon/name/summary/status) + collapsible content
│            │    ├── WriteEditView.vue → DiffView
│            │    ├── DiffView.vue      — unified-diff hunks + ± stats
│            │    ├── TodoListView.vue
│            │    └── WebSearchView.vue
│            ├── SubagentBlock.vue      — sync + async lifecycle; nested tool views; collapsible sections
│            ├── WorkOrderProgressCard.vue / WorkOrderNeedsInputCard.vue
│            │    / WorkOrderNeedsApprovalCard.vue / WorkOrderHandoffCard.vue
│            ├── RuntimeErrorCard.vue   — classified error + open-settings / retry / login hint
│            ├── ContextCompactedMarker.vue
│            └── AskQuestionResult.vue  — read-only answered ask-user state
├── StreamingIndicator.vue    — reactive isThinking / isWriting / elapsed
└── inline/                    — blocking interactive cards (see below)
     ├── InlineApproval.vue
     ├── InlineAskUserQuestion.vue      — tabbed multi-question, multi-select, custom input, keyboard nav
     ├── InlineExitPlanMode.vue
     └── InlinePlanApproval.vue
```

**v-for keys.** `tool_use` / `subagent` blocks key on their stable `toolId` / `subagentId`
(→ `ToolCallInfo.id`). `text` / `thinking` / `context_compacted` / `runtime_error` blocks have
no id today, so keys are synthesized as `${type}:${index}` — safe because blocks are append-only
and positionally stable within a turn.

**Collapsible / interaction chrome.** The shared `collapsible` + `inlineChoiceCard` behavior
becomes small Vue composables/components, preserving the click/Enter/Space keyboard contract.

## Interactive blocking cards

The four blocking cards become Vue components, but **`InlinePromptController` keeps owning the
promise/resolution** the runtime awaits — it hides the composer (depth-counted), sets
`needsAttention`, and resolves/rejects on user action, exactly as today. The Vue card captures
input and calls the injected `resolve`. This inverts the shell's "island hosts imperative
widget": here the engine controller owns lifecycle, Vue owns the widget. `dismissPendingApproval`
still destroys pending prompts on turn teardown.

- **Tool approval** → `InlineApproval` (Deny / Allow-once / Always-allow), resolves an
  `ApprovalDecision`.
- **Ask-user-question** → `InlineAskUserQuestion` (the heaviest, ~641 LOC imperative today:
  tabbed per-question options, multi-select, custom "other" input, review/submit, keyboard nav),
  resolves `Record<question, answer>`.
- **Exit-plan-mode** → `InlineExitPlanMode` (reads plan file, preview + permissions,
  approve-new-session / approve-current / feedback), resolves an `ExitPlanModeDecision`.
- **Post-plan approval** → `InlinePlanApproval` (Implement / revise / Cancel), resolves
  `{decision, invalidated}`.

## Data flow

```
Provider runtime → StreamController (routing + block-transition projection, unchanged logic)
  → mutates reactive ChatState data (contentBlocks / toolCalls / activeStream) — NOT DOM
  → useTranscriptStore projection
  → MessageList / BlockList / block components (render)
       └── TextBlock / ThinkingBlock → MarkdownHost (throttled Obsidian render into owned el)

User action (rewind / fork / collapse / approve / answer …)
  → callbacks seam (inject key) → SpecoratorView / controllers / InlinePromptController (unchanged)

Auto-scroll: StreamController → scroll container handed up from TranscriptRoot (callbacks seam)
```

## Cutover

Hard cut in one PR. `MessageRenderer`, the `rendering/*` block renderers and free functions, and
the DOM-patch paths of `StreamController` / `TextRenderCoordinator` / `ThinkingRenderCoordinator`
/ `StreamingIndicator` are deleted; `ChatState`'s DOM-pointer fields are removed.
`tabControllerSetup` / `SpecoratorView` mount `TranscriptRoot` into the per-tab content area and
wire the callbacks seam. The engine's stream-consumption logic and provider runtimes are
untouched, so the blast radius is the transcript view + the streaming write-side.

## Testing (Vitest lane, `tests/vue/chat/transcript/`)

- **Characterization first, per block family** — before deleting each renderer, lock its exact
  DOM (class/attribute contract), collapsible/interaction behavior, and streaming update
  behavior. Then assert the Vue component reproduces each (parity). Priority order by risk:
  streaming text/thinking, tool-call streaming + result patching, Write/Edit diffs, subagents
  (sync + async), the four inline blocking cards, work-order cards.
- **MarkdownHost seam test** (novel risk): mount, set text, assert Obsidian render + post-process
  ran into the owned element; change text mid-render, assert the stale generation is dropped;
  assert Vue never clears imperative children on parent re-render.
- **DOM-contract test**: assert the Vue transcript emits every class/attribute the un-migrated
  controllers + sidebar query (`.specorator-message-user`, `data-message-id`, etc.).
- **Store / routing tests**: `ChatState` change → the right store setter; churn-minimizing (no
  new array reference when nothing changed); `activeStream` transitions.
- **Streaming write-side tests**: a `tool_use` chunk mutates `ToolCallInfo` data (not DOM); a
  `tool_result` flips `status` + `result`; collapse mode holds the placeholder then renders once.
- **Perf**: `messageRenderer.perf` + `navigationSidebar.perf` stay green — mounted
  `.specorator-message` ≤ `RENDER_WINDOW_SIZE`, DOM/listeners O(window), one stream chunk
  re-renders exactly one block. Where these must move to the Vue lane (like `agentBoardScaling`),
  mirror the assertions there.

## Guardrails

- Jest `collectCoverageFrom` excludes `src/features/chat/ui/vue/**` (already excluded for the
  shell); Vitest `coverage.include` adds the new transcript tree.
- LOC ratchet re-locked (large net deletion: `MessageRenderer`, top-level/stored
  renderers, and DOM-patch coordinator paths out; detached lifecycle adapters remain).
- `check:css` + the `.specorator-vue` namespace guard cover the new styles; the legacy
  `.specorator-*` transcript classes the DOM contract requires are retained.
- `check:quality` ratchet re-locked after the cut.
- Cross-window popout safety (`nodeType` / `ownerDocument`, never `instanceof HTMLElement`) from
  the start.

## Risks & mitigations

1. **Streaming perf regression** — reactive re-render must stay per-block, and `MarkdownHost`
   throttling must match `streamRenderBackoff`. Guarded by the perf suite + the one-chunk /
   one-block assertion.
2. **DOM contract drift** breaking the un-migrated controllers + navigation sidebar → locked by
   the DOM-contract characterization test on class/attribute output.
3. **Async-markdown races** → the generation-token discipline in `MarkdownHost`.
4. **Big-bang risk on the daily driver** → bounded only by characterization/parity + the manual
   vault smoke checklist (the accepted trade-off). Merge gate covers: live streaming
   (text/thinking/tools/collapse mode), tool-result patching, Write/Edit diffs, subagents
   (sync + async), all four inline blocking cards, work-order cards, windowing + load-earlier,
   rewind/fork, navigation sidebar + selection still tracking, cross-window popout.
5. **`ChatState` field removal** ripples to `InputController` / `tabRuntimeHost` (they read
   `state.currentContentEl` etc.) → those reads migrate to the reactive-data equivalents in the
   same PR; typecheck is the backstop.

## Identity and migration-debt hardening (2026-07-14)

- Every snapshot carries `conversationId` and a monotonic
  `projectionRevision`. `TranscriptRoot` resets window/scroll state on identity
  changes and rejects stale projections, including delayed history hydration.
- Optimistic composer placeholders roll back and the original draft/pills are
  restored when runtime initialization fails before the first chunk.
- The obsolete `toolCallElements` DOM map and top-level/stored shadow renderers
  were deleted. Tool name/summary/blocking and web-search branching now live in
  shared DOM-free projections.
- Both inline plan cards share one focus/keyboard/abort/exactly-once lifecycle
  composable. The remaining imperative renderer is only the detached subagent
  lifecycle adapter still consumed by stream coordinators.

## Out of scope (later sub-projects)

The composer + input toolbar (sub-project 3) and the side panels — status panel, conversation
history, navigation sidebar, file/image context (sub-project 4). The navigation sidebar and
selection controllers stay imperative here and rely on the DOM contract above; they migrate with
sub-project 4.
