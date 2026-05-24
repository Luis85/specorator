---
id: AUDIT-CLAUDIAN-FRONTEND
title: Claudian Reboot — Per-Surface Frontend / UX Audit
status: draft
owner: research
created: 2026-05-24
epic: claudian-reboot
reference: D:\Projects\claudian-main   # MIT, read-only structural + visual reference
charter: specs/claudian-reboot/parity-charter.md
---

# Claudian Reboot — Per-Surface Frontend / UX Audit

Design-input reference for phases **P1–P6**. Every entry maps a Claudian surface
(charter §3) to its real source files, captures the CSS *structure + intent* (we
render through `--sp-*` tokens, not copied hex — charter §1), the behaviour/keyboard
affordances, and the target Specorator component / DDD layer / narrow port.

**Grounding note.** The Specorator worktree already carries a substantial agent-UI
scaffold from the discarded AUX work: `src/ui/components/agent/*` and
`src/ui/components/chat/*` (e.g. `MessageList.vue`, `MessageBubble.vue`,
`ToolCallBlock.vue`, `ThinkingBlock.vue`, `TodoList.vue`, `InputToolbar.vue`,
`ModelSelector.vue`, `ContextMeter.vue`, `InlineApprovalCard.vue`,
`ThreadTabStrip.vue`, `ThreadHistoryMenu.vue`, `MentionDropdown.vue`,
`SlashCommandDropdown.vue`, `ContextFileChip.vue`, `FloatingNavSidebar.vue`,
`StatusPanel.vue`), primitives (`SpIcon`, `SpButton`, `SpDropdownPanel`,
`SpToggleSwitch`, `HoverActions`, `SpIconButton`), Pinia stores
(`messagesStore`, `chatThreadsStore`, `streamingTurnStore`, `contextUsageStore`,
`chatInputModeStore`, `attachmentsStore`, `pendingApprovalsStore`, …), and a wide
port set (`ChatTransportPort`, `MarkdownRenderPort`, `IconPort`, `CanvasPort`,
`MetadataCachePort`, `TransportLifecyclePort`, `SecretStorePort`,
`ObsidianCliPort`). Most mappings below therefore say "extend X" rather than
"create X". The new ports recommended at the end are the genuinely missing seams.

Claudian's UI is **imperative DOM builders** (`createDiv`/`setIcon`/`setText`) with
~45 hand-written CSS modules scoped under `.claudian-container`. Vue parity means
declarative SFCs with `data-testid` + PageObjects, `SpIcon` for `setIcon`, and
`MarkdownRenderPort` for `MarkdownRenderer.render` (no `v-html`).

---

## 3.1 Chat conversation surface

### Message stream & user/assistant rendering — charter §3.1 · Phase P1
- **Claudian source:**
  - `src/features/chat/rendering/MessageRenderer.ts` — owns the `.claudian-messages` list; `addMessage` (live streaming) vs `renderStoredMessage` (batch replay); branches on `msg.role`; renders `contentBlocks` in order (`thinking` | `text` | `tool_use` | `context_compacted` | `subagent`) with a defensive fallback that replays orphan `toolCalls`.
  - `src/features/chat/controllers/StreamController.ts` (referenced) — streams chunks into the active assistant message; thinking indicator.
- **CSS / visual:** `components/messages.css`.
  - **Asymmetric bubbles** are the signature detail. **User**: `background: rgba(0,0,0,0.3)`, `align-self:flex-end`, `max-width:95%`, rounded except `border-end-end-radius:4px` (a clipped bottom-trailing corner). **Assistant**: fully transparent, `align-self:stretch`, full width, clipped `border-end-start-radius:4px`, `text-align:start`.
  - Container is `flex column`, `gap:12px`, `padding:12px 0`, custom 6px thin scrollbar.
  - Content uses `unicode-bidi:plaintext` + `dir="auto"` for RTL mix; `line-height:1.5`; tight paragraph margins (`0 0 8px`, last child 0); full-width tables with bordered cells + hover row.
  - **Welcome / empty state**: centered column, greeting in a *serif* font stack (`Copernicus`/`Tiempos`/Georgia), 28px weight-300, `--text-muted`. Hidden (`.claudian-hidden`) on first send.
  - **Interrupt state**: `Interrupted` in red (`#d45d5d`) + muted hint "· What should Claudian do instead?".
  - **Response-duration footer**: italic muted line `* {flavorWord} for mm:ss` (flavor word random from `constants.COMPLETION_FLAVOR_WORDS`, default "Baked").
- **Behaviour:** streaming appends to the live assistant element; `scrollToBottomIfNeeded` keeps view pinned within 100px threshold (auto-scroll gated by `enableAutoScroll` setting). Empty/whitespace text blocks skipped. Image-only user messages skip the bubble. Per-text-block and per-user-message copy buttons appear on hover (clipboard icon → "Copied!" for 1.5s).
- **Specorator mapping:** `MessageList.vue` + `MessageItem.vue` + `MessageBubble.vue` + `MarkdownBlock.vue` + `StreamingCursor.vue` + `WelcomeGreeting.vue` (all already scaffolded). Streaming state in `streamingTurnStore` + `messagesStore`. Markdown via **`MarkdownRenderPort`** (exists) wrapping `MarkdownRenderer.render`. Copy via clipboard composable. **Token needs:** `--sp-msg-user-bg`, `--sp-msg-radius`, `--sp-msg-radius-clip` (the 4px clipped corner), `--sp-msg-gap`, `--sp-welcome-font` (serif greeting), `--sp-interrupt-color`.
- **Parity-critical:** the asymmetric clipped corner (4px on the inner-bottom corner) on both bubbles; assistant messages are *transparent full-width* not bubbles; serif weight-300 greeting; the italic random-flavor duration footer; thin 6px scrollbar; `dir="auto"` bidi.
- **Open questions:** keep the playful "Baked for …" flavor-word footer, or neutralise microcopy under Specorator brand? Serif greeting font — substitute a token-driven stack or drop the serif identity?

### Tool-call rendering — charter §3.1 · Phase P2
- **Claudian source:** `src/features/chat/rendering/ToolCallRenderer.ts` (large: header build, per-tool summary/label, status icon, 14 specialised expanded renderers); `src/core/tools/toolIcons.ts` (icon intent map), `toolNames.ts`, `toolInput.ts`, `toolResultContent.ts`. `MessageRenderer.renderToolCall` routes Write/Edit → `WriteEditRenderer`, subagent tools → subagent, lifecycle spawn tools → consolidated subagent, else generic.
- **CSS / visual:** `components/toolcalls.css`.
  - Header row: `flex`, `gap:8px`, `padding:4px 0`, hover `opacity:.85`. Icon `--text-accent` 16px; **name in monospace 13px** `--text-normal`; **summary monospace 13px** `--text-muted` ellipsized & flex-filled; `:empty` summary hidden. Status pinned end via `margin-left:auto`, 14px.
  - **Status colors:** running `--text-accent`, completed `--color-green`, error `--color-red`, blocked `--color-orange` (icons: check / x / shield-off).
  - **Collapsed by default.** Expanded content has the signature **2px `border-inline-start`** + `margin-inline-start:7px` + `padding-inline-start:16px` "tree-branch" rail. Todo/ask variants drop the rail.
  - Per-line output is monospace 12px `--text-muted`, `white-space:pre`, `overflow-x:auto`; truncation footer `... N more lines` (faint italic). Bash shows `$ command` line then output, and hides summary when expanded. Web-search renders link rows + summary; ToolSearch renders icon+name rows.
- **Behaviour:** click/Enter/Space toggle (via `collapsible.ts`); `aria-expanded` + dynamic `aria-label` "<label> - click to expand/collapse". Per-tool summary truncation rules (paths → filename, bash → 60 chars, etc.). TodoWrite header shows live "Tasks N/M" + current-task preview that hides when expanded. Streaming starts "Running…", updated in place by `updateToolCallResult`.
- **Specorator mapping:** `ToolCallBlock.vue` + `NestedDetailFrame.vue` (the bordered rail) already exist. Icon map → **`IconPort`** (exists) + an `toolIcon(name)` helper. Tool metadata (name/summary/label/status mapping) belongs in **application layer** (pure functions, easily unit-tested) — not the component. **Token needs:** `--sp-tool-rail` (2px border-inline-start), `--sp-tool-rail-indent` (7px margin + 16px padding), `--sp-status-running/completed/error/blocked`, `--sp-mono-13`, `--sp-mono-12`.
- **Parity-critical:** the 2px tree-branch rail with the exact 7px/16px indent; monospace name+summary header with end-pinned colored status icon; collapsed-by-default; the per-tool summary heuristics (filename-only, 60-char bash, query parsing).
- **Open questions:** how many of the ~14 specialised expanded renderers (apply_patch diff, web-search link parsing, tool-search, agent-lifecycle JSON) are P2 vs deferred? Which tool icons map to which `IconPort` glyphs (lucide names listed in `toolIcons.ts`).

### Write/Edit rendering with word-level diff — charter §3.1 · Phase P2
- **Claudian source:** `src/features/chat/rendering/WriteEditRenderer.ts` + `src/features/chat/rendering/DiffRenderer.ts`; `parseApplyPatchDiffs`/`parseFileUpdateChangeDiffs` (`utils/diff`).
- **CSS / visual:** `features/diff.css`.
  - Header mirrors tool-call but in its own classes: monospace name ("Write"/"Edit") + ellipsized filename summary; **diff stats** `+N` green / `-N` red monospace 11px pinned end; status 16px (completed green, error/blocked red). Empty status hidden when `.done`.
  - Diff body: monospace 12px, `max-height:300px` scroll. Per-line `flex` with a 16px centered **prefix gutter** (+/−/space). Insert = `rgba(80,200,80,.25)`, delete = `rgba(255,80,80,.25)` — **background highlight, no strikethrough** (explicit comment); equal lines muted. Hunk separator is a dashed top/bottom rule with italic centered text.
- **Behaviour:** starts "Writing…"/loading; collapsible; diff computed then stats rendered into header. Word-level diff is computed upstream (`DiffRenderer`).
- **Specorator mapping:** new `WriteEditBlock.vue` (or extend `ToolCallBlock.vue` with a diff variant) + a `DiffView.vue`; reuses `FileWriteProposalCard.vue` patterns already present. Diff computation → **application/domain** pure function returning `DiffLine[]` (testable). **Token needs:** `--sp-diff-insert-bg`, `--sp-diff-delete-bg`, `--sp-diff-gutter`, `--sp-added` / `--sp-removed`.
- **Parity-critical:** background-highlight diff (no strikethrough) with the 16px prefix gutter; `+N -N` monospace stat chip in header; 300px scroll cap.
- **Open questions:** reuse the existing `FileWriteProposalCard.vue` (approval flow) vs a separate read-only diff renderer for completed Write/Edit tool calls — they overlap.

### Thinking blocks — charter §3.1 · Phase P2
- **Claudian source:** `src/features/chat/rendering/ThinkingBlockRenderer.ts` (`createThinkingBlock` live with 1s timer; `renderStoredThinkingBlock` static); uses `collapsible.ts`.
- **CSS / visual:** `components/thinking.css`.
  - Live streaming "thinking" line: `--claudian-brand` italic, **`thinking-pulse` animation** (opacity 0.5↔1, 1.5s ease-in-out infinite). Compact variant uses `--claudian-compact` (#5bc0de).
  - Block header: brand-colored label 13px weight-500; content is the **same 2px tree-branch rail** but `padding-inline-start:24px`, `max-height:400px` scroll, 13px `--text-muted`.
- **Behaviour:** live label counts "Thinking Ns…" every second; on finalize → "Thought for Ns" and auto-collapses. Collapsed by default when stored. Tabular-nums for the timer.
- **Specorator mapping:** `ThinkingBlock.vue` (exists). Timer in component (or `streamingTurnStore`). **Token needs:** `--sp-thinking-color` (brand), `--sp-thinking-compact-color`, reuse `--sp-tool-rail`; motion keyframe `--sp-anim-pulse` honoring reduced-motion.
- **Parity-critical:** the pulse animation on the live "Thinking" line in brand color + italic; live second-counter that freezes to "Thought for Ns" and collapses; 24px rail indent (vs 16px for tools).
- **Open questions:** brand color for thinking — Claudian uses provider brand (`#D97757`); Specorator should drive from `--sp-accent`. Confirm reduced-motion fallback (static dim, no pulse).

### Todo-list rendering — charter §3.1 · Phase P2
- **Claudian source:** `todoUtils.ts` (`renderTodoItems`), `TodoListRenderer.ts` (re-export), `core/tools/todo.ts`. Rendered both inline (TodoWrite tool content) and in the persistent StatusPanel via the shared `.claudian-todo-list-container` class.
- **CSS / visual:** in `components/status-panel.css` (shared container).
  - Each item: `flex` start-aligned, 12px monospace text with `padding-left:12px`. Status icon: pending/in_progress use the `dot` glyph **scaled 2×** (`transform:scale(2)`); completed uses `check`. Colors: pending `--text-normal`, in_progress `--interactive-accent`, completed icon green + text `--text-muted`. In-progress shows `activeForm`; otherwise `content`.
  - TodoWrite tool header surfaces live "Tasks N/M" count and current in-progress task preview.
- **Specorator mapping:** `TodoList.vue` (exists) shared by `ToolCallBlock.vue` and `StatusPanel.vue`. Todo parsing → application layer. **Token needs:** `--sp-todo-pending`, `--sp-todo-active` (accent), `--sp-todo-done`.
- **Parity-critical:** the 2×-scaled dot for pending/active; in-progress shows `activeForm` (gerund) not `content`; the "Tasks N/M" header count.
- **Open questions:** none significant.

### Subagent rendering + lifecycle — charter §3.1 · Phase P2
- **Claudian source:** `SubagentRenderer.ts`, `subagentLifecycleResolution.ts`, `services/SubagentManager.ts`. `MessageRenderer.renderTaskSubagent` (sync vs async) and `renderProviderLifecycleSubagent` (consolidates spawn+wait/close).
- **CSS / visual:** `components/subagent.css`.
  - Header like tool-call but icon uses `--interactive-accent`. Content uses the 2px rail. Nested **sections** (prompt / result / tools) are themselves collapsible (monospace 12px headers, hover → normal). Result output `max-height:220px` scroll. Nested tool items are a smaller tool-call (13px icons, 12px text).
  - **Async status pill** (`.claudian-subagent-status-text`) color-coded by state: pending muted, running accent, awaiting yellow, completed green, error red, orphaned orange.
- **Behaviour:** sync vs async inferred from `run_in_background` / tool result text heuristics; expandable nested tool calls.
- **Specorator mapping:** new `SubagentBlock.vue` reusing `NestedDetailFrame.vue` + nested `ToolCallBlock.vue`. Lifecycle resolution (spawn+wait merge, async-status inference) → application layer. **Token needs:** `--sp-subagent-icon` (accent), async state color set (`--sp-state-pending/running/awaiting/completed/error/orphaned`).
- **Parity-critical:** nested collapsibles-within-collapsible; the async status-text color ladder; lifecycle consolidation (one block for spawn+wait+close).
- **Open questions:** is the provider-lifecycle (Codex/Opencode `spawn_agent`/`wait`) subagent consolidation in scope for P2, or deferred to provider phase P9?

### Inline interactive blocks (ask-user / exit-plan / plan-approval) — charter §3.1 · Phase P4
- **Claudian source:** `rendering/InlineAskUserQuestion.ts` (tabbed multi-question keyboard-driven widget), `rendering/InlineExitPlanMode.ts` ("Plan complete" card with plan preview + permissions + implement/revise/cancel), `rendering/InlinePlanApproval.ts`. Orchestrated by `InputController` (`handleAskUserQuestion`, `handleExitPlanMode`, `handleApprovalRequest`, `showPlanApproval`) which **hides the input container** (`claudian-hidden`, depth-counted) and mounts the inline widget in its place.
- **CSS / visual:** `features/ask-user-question.css`, `features/plan-mode.css`.
  - Whole widget is **monospace 12px**, `outline:none`, bold muted title. Tab bar: pill tabs, active = `hsla(55,30%,50%,.18)` wash, green tick when answered, a terminal "Submit" tab. Items are terminal-style rows: a `›`/nbsp **cursor column** (2ch, accent), numbered, optional `[ ]`/`[✓]` multi-select brackets (green when checked), label bold + green when selected, muted description. Custom "Other" input is a borderless inline text field. Hints line (faint, top-bordered): "Enter to select · Tab/Arrow keys to navigate · Esc to cancel".
  - Plan card: "Plan complete" title, scrollable markdown plan preview (`max-height:300px`, bordered), requested-permissions `<ul>`, action rows. **Plan-mode input border** = teal `rgb(92,148,140)` with 1px ring.
  - Approval header: tool icon (brand) + tool name chip, optional decision-reason / blocked-path (monospace) / agent rows, monospace description block. Options rendered as an *immediate-select* single question ("Allow this action?" → Deny / Allow once / Always allow).
- **Behaviour:** full keyboard model — Arrow Up/Down move focus, Left/Right or Tab/Shift+Tab switch question tabs, Enter selects/advances (single-select auto-advances to next tab), Esc cancels. `immediateSelect` mode (approvals + single question) resolves on Enter without a submit tab. `requestAnimationFrame` focus + `scrollIntoView`. Honors `AbortSignal`. Submit disabled until all answered.
- **Specorator mapping:** `InlineApprovalCard.vue` (exists) covers approvals; new `InlineAskQuestion.vue` and `InlinePlanCard.vue`. State in `pendingApprovalsStore`. The "hide composer, mount inline" swap → a composer-region store flag (`chatInputModeStore`). Plan content read from vault via **`VaultPort`** (Claudian reads plan file from `fs` directly — must route through the port). **Token needs:** `--sp-plan-accent` (teal), `--sp-ask-tab-active`, `--sp-ask-cursor` (accent), `--sp-mono-12`.
- **Parity-critical:** terminal-aesthetic keyboard-first widget — the `›` cursor column, `[ ]`/`[✓]` brackets, tab ticks, the exact hint microcopy; composer is *replaced* (not overlaid) by the prompt; teal plan-mode border; immediate-select for approvals.
- **Open questions:** Obsidian-`Modal` vs in-flow inline widget — CLAUDE.md mandates `Modal` for *blocking* flows, but Claudian's whole UX is inline-in-thread. Decide whether ask/plan/approval stay inline (non-blocking, AbortSignal-driven) — recommend inline to preserve parity, with `ConfirmModalPort` reserved for destructive confirmations only.

---

## 3.2 Tabs, sessions, history, fork, rewind, compact, title-gen

### Multi-tab chat — charter §3.2 · Phase P3
- **Claudian source:** `tabs/TabManager.ts` (lifecycle, persistence, provider warmup, fork), `tabs/Tab.ts`, `tabs/TabBar.ts`, `tabs/providerResolution.ts`, `tabs/types.ts` (MIN/MAX/DEFAULT tab counts).
- **CSS / visual:** `components/tabs.css`.
  - Tabs are **square 24×24 numbered badges** (not text tabs), 2px border, 4px radius, monospace-ish 12px. States via border-color: active = `--interactive-accent`; **streaming = provider brand** (`[data-provider]` switches the brand color); attention = `--text-error`; idle = border default. Badges live in a `flex gap:4px` strip; content container is `flex column` filling height.
- **Behaviour:** badges switch tabs; new-tab button in header; per-tab provider + draft model; streaming/attention badge states reflect background tab activity.
- **Specorator mapping:** `ThreadTabStrip.vue` + `ThreadTab.vue` + `ThreadTabBadge.vue` (exist). State in `chatThreadsStore` + `chatProviderStore`. Tab→provider resolution in application layer. **Token needs:** `--sp-tab-border`, `--sp-tab-active`, `--sp-tab-attention`, provider-brand tokens `--sp-provider-claude/codex/opencode`.
- **Parity-critical:** numbered square badges (not labelled tabs); border-color state machine, especially the **provider-brand streaming border** via `data-provider`.
- **Open questions:** MAX_TABS parity value; do we expose per-tab provider switching in P3 or after the provider phase?

### History + resume — charter §3.2 · Phase P3
- **Claudian source:** `shared/components/ResumeSessionDropdown.ts`; history dropdown wired through `ConversationController`; `/resume` built-in command triggers it (`InputController.showResumeDropdown`).
- **CSS / visual:** `components/history.css`, `features/resume-session.css`.
  - **Drop-UP menu** (`bottom:100%`, opens upward since composer is at bottom) with `backdrop-filter:blur(20px)`, uppercase letter-spaced header, scrollable list (`max-height:350-400px`). Items: icon + title (ellipsized 13px) + faint date; hover wash; **active/current item** = secondary bg + 2px `inset-inline-start` accent border + accent icon. Per-item hover actions (rename/delete) fade in; delete hover → red. Rename = inline input with accent ring. Title-gen loading = `spin` animation. Header-mode variant flips to drop-DOWN.
- **Behaviour:** keyboard nav (Arrow/Enter/Esc) in `ResumeSessionDropdown.handleKeydown`; select switches/opens conversation; rename/delete inline.
- **Specorator mapping:** `ThreadHistoryMenu.vue` + `SessionResumeIndicator.vue` (exist) + `SpDropdownPanel.vue`. History persistence is per-provider (provider phase); for P3 use the local feature repo via **`VaultPort`**. **Token needs:** `--sp-menu-bg`, `--sp-menu-blur`, `--sp-menu-shadow`, `--sp-active-rail`.
- **Parity-critical:** drop-UP direction with blur backdrop; current-item 2px inset accent rail; hover-reveal rename/delete actions; spin loader during title generation.
- **Open questions:** `backdrop-filter:blur` performance/forced-colors fallback; header-mode (drop-down) — is the header-mode layout in scope?

### Fork — charter §3.2 · Phase P3
- **Claudian source:** `shared/modals/ForkTargetModal.ts` (+ `chooseForkTarget`), `rewind.ts`, `ClaudeRewindService` (provider). Fork button on user messages (`MessageRenderer.addForkButton`, gated by `capabilities.supportsFork`); `/fork` command (`onForkAll`).
- **CSS / visual:** `modals/fork-target.css` — small (`max-width:340px`) Obsidian-modal option list, 10px/12px padded rows, hover wash, 6px radius.
- **Behaviour:** fork icon (`git-fork`) in the per-user-message hover toolbar; opens target chooser modal.
- **Specorator mapping:** `MessageActions.vue` (fork/rewind buttons) + a `ForkTargetModal` via **`ConfirmModalPort`** (exists) — this is genuinely a blocking modal, so the port fits. Fork logic → application/provider layer. **Token needs:** reuse `--sp-menu-*`.
- **Parity-critical:** `git-fork` icon in the message hover toolbar; capability-gated visibility.
- **Open questions:** fork is provider-capability gated — stub the seam in P3, fully wire in P9?

### Rewind / checkpoint — charter §3.2 · Phase P3
- **Claudian source:** `rewind.ts` (`findRewindContext` — scans for the previous assistant UUID and whether a response followed, proving SDK processed the turn → rewind eligibility), `MessageRenderer.addRewindButton`/`showRewindMenu`/`isRewindEligible`.
- **CSS / visual:** rewind button lives in `.claudian-user-msg-actions` (messages.css) — hover-reveal toolbar below user bubble (`bottom:-20px`, `gap:12px`, fades in on bubble hover).
- **Behaviour:** `rotate-ccw` icon → Obsidian **`Menu`** with two items: "conversation only" (`message-square`) and "code and conversation" (`rotate-ccw`). Capability-gated (`supportsRewind`). Failure → `Notice`.
- **Specorator mapping:** `MessageActions.vue` + `HoverActions.vue` (exist). Rewind menu → a small popover (`SpDropdownPanel`) or `Menu` equivalent. Eligibility computation (`findRewindContext`) → pure application function. Rewind execution → provider layer behind **`ChatTransportPort`**. **Token needs:** reuse hover-action tokens.
- **Parity-critical:** the two-mode rewind menu (conversation vs code+conversation) with distinct icons; eligibility only after a UUID-bearing response; hover-reveal action toolbar 20px below the bubble.
- **Open questions:** "code and conversation" rewind touches the filesystem/git — out of P3 frontend scope, but the menu affordance must exist. Confirm provider seam.

### Compact + auto title generation — charter §3.2 · Phase P3
- **Claudian source:** compaction triggered by `/compact` (detected in `InputController.sendMessage`, shows "Compacting…" thinking indicator with `--compact` class); boundary block rendered by `MessageRenderer` (`context_compacted`). Title-gen: `InputController.triggerTitleGeneration` + `core/prompt/titleGeneration.ts` + provider `TitleGenerationService` — sets fallback title immediately, fires async AI title, status `pending`/`success`/`failed`, respects manual rename.
- **CSS / visual:** `components/messages.css` `.claudian-compact-boundary` — centered label "Conversation compacted" flanked by `::before`/`::after` 1px hairlines (a horizontal divider with centered text); compact thinking uses `--claudian-compact` (#5bc0de).
- **Behaviour:** compact replaces the duration footer; title-gen loading spinner in history item; usage meter tooltip suggests `/compact` past 80%.
- **Specorator mapping:** `CompactBoundary.vue` (exists). Title-gen → application service behind a provider seam; status into `chatThreadsStore`. **Token needs:** `--sp-compact-color`, `--sp-divider-hairline`.
- **Parity-critical:** the hairline-flanked centered "Conversation compacted" divider; cyan compact thinking color; immediate fallback title then async replacement that yields to manual rename.
- **Open questions:** title generation needs an auxiliary-model call (provider runtime) — frontend just shows status; confirm the seam name.

---

## 3.3 Composer / input

### Composer core (textarea, send, queue, auto-resize) — charter §3.1/§3.3 · Phase P1 (core), P4 (power)
- **Claudian source:** `controllers/InputController.ts` (the hub — send, queue/steer, built-in commands, instruction, approvals, resume), `ui/textareaResize.ts`, `ui/InputToolbar.ts`. Queue/steer indicator built in `updateQueueIndicator`.
- **CSS / visual:** `components/input.css`.
  - `.claudian-input-wrapper`: bordered rounded (6px) column, `min-height:140px` (documented as context-row 36 + textarea 60 + toolbar 38 + border). Textarea is **borderless/transparent** (`border:none!important; background:transparent!important`), 14px, auto-grow between `--claudian-textarea-min/max-height`, `unicode-bidi:plaintext`.
  - Context row (top, collapsed until `.has-content`), nav row (tab badges + header icons), toolbar row at bottom.
  - **Queue/steer row**: muted 12px; preview text "⌙ Queued: …" / "⌙ Steering: …" ellipsized; action buttons "Steer Now", pencil (edit), trash (discard); accent text-buttons + 22px icon buttons.
- **Behaviour:** Enter sends, Shift+Enter newline (per managers' `!e.shiftKey && !e.isComposing`). While streaming, new messages **queue** (merge), with steer/edit/discard. Built-in commands (`/clear`, `/new`, `/add-dir`, `/resume`, `/fork`) intercepted before send. Cancel restores queued message to input.
- **Specorator mapping:** `ChatInput.vue` + `InputToolbar.vue` (exist). Queue/steer state → `streamingTurnStore` (+ a queued-message slice). Built-in command parsing → application layer. Send through **`ChatTransportPort`** (exists). **Token needs:** `--sp-input-border`, `--sp-input-radius`, `--sp-input-min-h`, `--sp-queue-color`.
- **Parity-critical:** borderless transparent textarea inside a single bordered wrapper; the `min-height:140px` composer; the ⌙ queue/steer preview row with Steer/edit/discard actions; Enter-to-send / Shift+Enter newline.
- **Open questions:** "Steer" is a provider-runtime capability (`supportsTurnSteer`) — show the affordance only when capable.

### Slash commands `/` + Skills `$` — charter §3.3 · Phase P4
- **Claudian source:** `shared/components/SlashCommandDropdown.ts`, `core/commands/builtInCommands.ts`, provider command catalogs. Trigger scan in `handleInputChange` over `providerConfig.triggerChars` (default `['/']`; `$` added for skills).
- **CSS / visual:** `features/slash-commands.css` — drop-UP, blur backdrop, 6px radius, `max-height:300px`. Items: monospace 12px name (with `displayPrefix`), muted argument hint (8px-margin), ellipsized 11px description; selected/hover wash. Fixed-position variant (for inline editor) uses CSS vars `--claudian-fixed-dropdown-{bottom,left,width}`.
- **Behaviour:** trigger only at start-of-token (pos 0 or preceded by whitespace); built-ins only when `/` at position 0; `$` and provider skills fetched lazily (`getProviderEntries`, request-id guarded). Arrow/Enter/Tab select (inserts `prefix+name `), Esc hides; mouse hover sets selection. Whitespace in search closes it.
- **Specorator mapping:** `SlashCommandDropdown.vue` (exists) + `useSlashPalette.ts`/`useSlashPalette` composable. Command catalog (built-ins + provider entries) → application/provider layer. **Token needs:** reuse `--sp-menu-*`; `--sp-mono-12`.
- **Parity-critical:** drop-UP with blur; start-of-token trigger rule; built-ins vs `$` skills separation; keyboard select inserting `prefix+name+space`; argument-hint + description rows.
- **Open questions:** `$` skills are per-provider — for P4, support built-ins + a stub catalog, fully wire in provider phase.

### @mention (files, subagents, MCP, external dirs) — charter §3.3 · Phase P4/P5
- **Claudian source:** `shared/mention/MentionDropdownController.ts`, `VaultMentionCache.ts`, `VaultMentionDataProvider.ts`, `shared/components/SelectableDropdown.ts`. Resolves vault files/folders, MCP servers, agents, and external-context files.
- **CSS / visual:** `features/file-context.css` (the `.claudian-mention-*` block). Drop-UP blur menu; items `flex gap:8px` icon+text. **Icon color encodes category:** mcp-server / agent = accent/link, context-file = brand, vault-folder/context-folder = muted. Two-line text (name + muted description) for MCP/agents; single ellipsized path for files. Fixed-position variant like slash.
- **Behaviour:** `@` trigger; debounced filtering; folder drill-down filters (`@Agents/`, context roots); selecting a file attaches it (→ file chip) or toggles an MCP server / selects an agent. MCP mentions sync to the MCP selector (`addMentionedServers`).
- **Specorator mapping:** `MentionDropdown.vue` (exists) + `useMentionPicker.ts`. Vault data via **`VaultPort`** + **`MetadataCachePort`** (exist); external-dir scan via the external-context seam. **Token needs:** category icon-color tokens `--sp-mention-file/folder/mcp/agent/context`.
- **Parity-critical:** category-colored icons; two-line MCP/agent rows vs single-line file rows; `@`-mention of an MCP server enabling it in the toolbar selector (the cross-link).
- **Open questions:** subagent/MCP mentions depend on provider + MCP subsystems (P8/P9) — scope file/folder mentions to P4/P5, defer MCP/agent mentions.

### Instruction mode `#` — charter §3.3 · Phase P4
- **Claudian source:** `ui/InstructionModeManager.ts` (placeholder "# Save in custom system prompt"; enters on `#` when input empty), `shared/modals/InstructionConfirmModal.ts` (`InstructionModal`), `core/prompt/instructionRefine.ts`, `InputController.handleInstructionSubmit` (refine → clarify loop → confirm → append to `systemPrompt`).
- **CSS / visual:** `components/input.css` `.claudian-input-instruction-mode` = **blue** (`#60a5fa`) border + 1px ring. Modal in `modals/instruction.css`: original (italic muted) vs refined (bordered) sections, edit/response textareas, reject/edit/accept button row, spinner loading.
- **Behaviour:** `#` at empty input enters mode; submit runs AI refine; modal shows clarification questions or refined instruction; accept appends to custom system prompt (`appendMarkdownSnippet`); Esc/empty exits.
- **Specorator mapping:** new `InstructionMode` composable + an `InstructionModal` via **`ConfirmModalPort`** (blocking flow — fits). Mode flag in `chatInputModeStore`. Refine service is an auxiliary-model call → provider seam. System prompt persisted via **`SettingsPort`**. **Token needs:** `--sp-instruction-border` (blue).
- **Parity-critical:** blue composer border in instruction mode; the refine→clarify→confirm modal loop; appends to (not replaces) the system prompt.
- **Open questions:** refine needs auxiliary model — frontend shows the modal; confirm provider seam. The blue/teal/pink mode-border palette must reconcile with `--sp-*` (these are hardcoded hex in Claudian).

### Plan mode toggle `Shift+Tab` — charter §3.3 · Phase P4
- **Claudian source:** permission/plan handling in `InputToolbar.ts` `PermissionToggle` (`planValue`, `supportsPlanMode`); plan border + cards in `features/plan-mode.css`. (Shift+Tab keybind wired in the view's keydown handler.)
- **CSS / visual:** `features/plan-mode.css` `.claudian-input-plan-mode` = **teal** (`rgb(92,148,140)`) border + ring; the permission label shows "PLAN" in teal weight-600 when active (toggle hidden).
- **Behaviour:** `Shift+Tab` cycles into plan mode; plan completion surfaces the `InlineExitPlanMode` card.
- **Specorator mapping:** `ModeIndicators.vue` + `InputToolbar.vue` (exist); mode state in `chatInputModeStore`. Keybind in the view host. **Token needs:** `--sp-plan-accent` (teal) — shared with the plan-approval card.
- **Parity-critical:** teal "PLAN" label + composer border; `Shift+Tab` toggle; capability-gated.
- **Open questions:** confirm `Shift+Tab` doesn't collide with Obsidian/textarea focus traversal.

### Bang-bash `!` run-bash mode — charter §3.3 · Phase P4
- **Claudian source:** `ui/BangBashModeManager.ts` (enters on `!` when input empty; placeholder from i18n; Enter submits, Esc clears), `services/BangBashService.ts`.
- **CSS / visual:** `components/input.css` `.claudian-input-bang-bash-mode` = **pink** (`#f472b6`) border + ring, and the textarea switches to **monospace** font in this mode.
- **Behaviour:** `!` at empty input → bash mode; Enter (no shift, not composing) runs the command via `BangBashService`; Esc exits.
- **Specorator mapping:** new `BangBashMode` composable; mode flag in `chatInputModeStore`; command execution via **`ObsidianCliPort`** (exists) or a dedicated bash seam. **Token needs:** `--sp-bash-border` (pink), reuse `--sp-mono`.
- **Parity-critical:** pink border + monospace textarea in bash mode; `!`-at-empty trigger; bash output surfaces in the StatusPanel.
- **Open questions:** bash execution is desktop-only subprocess — security/approval implications (P7); confirm port.

### Navigation sidebar + status panel — charter §3.3 · Phase P3
- **Claudian source:** `ui/NavigationSidebar.ts` (floating top/prev/next/bottom chevrons), `ui/StatusPanel.ts` (persistent bottom panel: todos + bash output).
- **CSS / visual:** `components/nav-sidebar.css` — absolutely positioned right-edge floating column of 32px circular buttons; **`opacity:0` hidden → `0.15` when scrollable → `1` on hover** (ghosted until needed). `components/status-panel.css` — bottom-pinned panel with collapsible todo + bash sections, bash content `max-height:min(40vh,320px)` scroll.
- **Behaviour:** sidebar visibility toggles on scroll when content overflows (>clientHeight+50); prev/next jump between **user** messages (skipping assistant) with smooth scroll; chevrons-up/down jump to top/bottom. StatusPanel shows live todos and accumulated bash output with collapse + clear actions.
- **Specorator mapping:** `FloatingNavSidebar.vue` + `NavSidebarButton.vue` + `StatusPanel.vue` + `BashHistoryList.vue` (all exist). State in `statusPanelStore`. **Token needs:** `--sp-nav-ghost-opacity` (0.15), `--sp-nav-btn` sizing.
- **Parity-critical:** the ghosted-to-0.15-to-1 opacity ramp; prev/next snapping to user messages only; StatusPanel as a persistent bottom region (not overlay).
- **Open questions:** none significant.

---

## 3.4 Context & attachments

### File context / chips — charter §3.4 · Phase P5
- **Claudian source:** `ui/FileContext.ts`, `ui/file-context/` (FileChipsView, FileContextState), `utils/fileLink.ts` (clickable links), `processFileLinks`/`registerFileLinkHandler` in MessageRenderer. Current-note tracking + `@`-mention attachment.
- **CSS / visual:** `components/input.css` (file chips) + `features/file-link.css`.
  - Chips: pill (`border-radius:12px`), bordered, 12px, `max-width:200px`, muted icon + ellipsized name + circular remove button (× hover → wash). Sit in the collapsed context-row (shows when `.has-content`).
  - File links in messages: `--text-accent`, hover underline + accent-hover; works inside inline code.
- **Behaviour:** current note auto-tracked + sent once (`markCurrentNoteSent`); chips removable; `[[wikilinks]]` post-processed into clickable links (only when source contains `[[`); click opens file via workspace.
- **Specorator mapping:** `ContextFileChip.vue` + `ContextFileList.vue` (exist); `AttachmentStrip.vue`. File-link click → **`WorkspacePort`** (exists, `openFile`). State in `attachmentsStore`. Wikilink processing → `MarkdownRenderPort` post-pass or a link composable. **Token needs:** `--sp-chip-radius`, `--sp-chip-border`, `--sp-link` / `--sp-link-hover`.
- **Parity-critical:** pill chips with circular remove; the collapsed-until-content context row; clickable `[[wikilinks]]` and file paths opening in Obsidian.
- **Open questions:** "send current note once" semantics — confirm the toggle UX.

### Image context / embed / modal — charter §3.4 · Phase P5
- **Claudian source:** `ui/ImageContext.ts`, `utils/imageEmbed.ts` (`replaceImageEmbedsWithHtml`), `MessageRenderer.renderMessageImages`/`showFullImage`/`setImageSrc`.
- **CSS / visual:** `features/image-context.css`, `features/image-embed.css`, `features/image-modal.css`.
  - Composer image chips: 40px thumbnail + name + size + circular **CSS-drawn ×** remove (two rotated pseudo-element bars). Drop overlay = dashed brand border + brand wash, "drop" content, shown via `.visible`.
  - Message images: right-aligned wrap above the user bubble, **120×120 cover** thumbs, hover `scale(1.03)` + shadow.
  - Embeds (`![[img]]`) → inline `<img>` max-width 100%, click to enlarge; fallback chip when missing.
  - Full-image modal: fixed `rgba(0,0,0,.85)` overlay, contained image (90vw/90vh), floating round close (×), Esc/overlay-click to close.
- **Behaviour:** paste/drop images → chips → sent as `ImageAttachment` (base64 data URI). Click thumbnail → full modal. Capability-gated (`supportsImageAttachments`).
- **Specorator mapping:** extend `AttachmentStrip.vue` for image chips + a new `ImageThumb.vue` + `ImageModal.vue` (the modal is an overlay — could use `ConfirmModalPort` host or a dedicated overlay component; CLAUDE.md forbids raw `body.createDiv` overlays so this needs a Vue teleport/overlay, not Claudian's `body.body.createDiv`). Embeds via `MarkdownRenderPort` pre-pass. **Token needs:** `--sp-drop-overlay`, `--sp-image-thumb` (120px), `--sp-modal-overlay`.
- **Parity-critical:** 120×120 right-aligned message thumbnails above the user bubble; the drop overlay (dashed brand border); click-to-zoom full modal with Esc; base64 data-URI handling.
- **Open questions:** Claudian creates the modal via `ownerDocument.body.createDiv` (raw DOM) — Specorator must use a teleported Vue overlay (no innerHTML). Confirm overlay primitive.

### External / browser-selection / canvas-selection — charter §3.4 · Phase P5
- **Claudian source:** `controllers/BrowserSelectionController.ts`, `controllers/CanvasSelectionController.ts`, `controllers/SelectionController.ts`, `shared/components/SelectionHighlight.ts`. External context paths managed by `InputToolbar.ExternalContextSelector`.
- **CSS / visual:** `components/input.css` selection indicators (`.claudian-selection-indicator`, `.claudian-browser-selection-indicator`, `.claudian-canvas-indicator`) — light-blue (`#7abaff`) 12px pill at end of context row, ellipsized, non-interactive. External-context selector dropdown in `toolbar/external-context.css` (covered in 3.5).
- **Behaviour:** when the user selects text in the editor / browser view / canvas, an indicator appears in the context row and the selection is sent as context; `SelectionHighlight` highlights the source range (CM6 decoration / CSS Highlight API).
- **Specorator mapping:** selection capture via **`CanvasPort`** (exists) + a new editor/browser-selection seam (see new ports below). Indicator → a small Vue chip in the context row. Highlight → CM6 decoration in the plugin layer. **Token needs:** `--sp-selection-indicator` (light blue), `--sp-selection-highlight`.
- **Parity-critical:** the light-blue selection indicator pill in the context row; live highlight of the source selection; three distinct selection sources (editor/browser/canvas).
- **Open questions:** browser-selection requires the Obsidian web-viewer; canvas requires the canvas API (`CanvasPort` exists). Which of the three are in P5 vs deferred?

### Inline edit modal with word-level diff — charter §3.4 · Phase P5
- **Claudian source:** per-provider inline-edit services + `core/prompt/inlineEdit.ts`; CM6 widget (decorations) — not a classic modal but an in-editor inline input + diff.
- **CSS / visual:** `features/inline-edit.css`. Transparent CM6 widget: bordered rounded input (8px) with a trailing **spinner** (`claudian-spin`); agent-reply box (bordered, muted, pre-wrap); **inline diff** replaces the selection in place — delete = red strikethrough (`claudian-diff-del`), insert = green bg (`claudian-diff-ins`); accept (green ✓) / reject (red ✗) buttons inline (16px, borderless). Selection highlight via `--text-selection` + CSS Highlight API.
- **Behaviour:** select text → invoke inline edit → type instruction → spinner → agent may ask a clarifying question (reply box) → diff appears in place → accept/reject.
- **Specorator mapping:** mostly **plugin layer** (CM6 editor decorations live outside the Vue sidebar). The instruction input + diff render could share `DiffView.vue`. Service = auxiliary-model call → provider seam. **Token needs:** `--sp-diff-del` (strikethrough), `--sp-diff-ins`, `--sp-spinner`, reuse `--sp-selection-highlight`.
- **Parity-critical:** in-editor (not sidebar) inline input + in-place diff with strikethrough-delete (note: *different* from the no-strikethrough Write/Edit diff in 3.1); inline accept/reject ✓/✗; CSS Highlight API for preview-mode selection.
- **Open questions:** this is the one surface that lives in the **editor** not the chat sidebar — confirm it's in the reboot's frontend scope at all (it touches CM6 + provider auxiliary model heavily). Two diff styles coexist (strikethrough here vs background-only in chat) — keep both.

---

## 3.5 Input toolbar widgets (the control strip)

All widgets are built imperatively in `src/features/chat/ui/InputToolbar.ts` and
laid into `.claudian-input-toolbar` (a `flex` row at the composer bottom). Each is a
small class with `updateDisplay()`/`renderOptions()`. Specorator already has
`InputToolbar.vue`, `ModelSelector.vue`, `ContextMeter.vue`, `ModeIndicators.vue`,
`McpIndicator.vue`, `SpToggleSwitch.vue`, `ProviderMenu.vue`, `ProviderBadge.vue`.

### Model selector — charter §3.5 · Phase P6
- **Claudian source:** `InputToolbar.ts` `ModelSelector` — button (current label, brand-colored) + **hover** drop-UP listing models, grouped, with provider icons and a selected highlight; options reversed (most-recent at top).
- **CSS / visual:** `toolbar/model-selector.css` — brand-colored 12px button; hover-reveal drop-UP (`opacity/visibility` transition, `bottom:100%`); group headers (8px uppercase faint, top-bordered); options with provider icon (12px, 0.7 opacity) + label; selected = brand wash + brand text weight-500.
- **Behaviour:** **hover** opens (no click), click an option changes model; group separators by `model.group`; provider icon via `createProviderIconSvg`.
- **Specorator mapping:** `ModelSelector.vue` + `ProviderMenu.vue` (exist) + `SpDropdownPanel.vue`. Model catalog from provider config (provider layer). Provider icon via **`IconPort`** + provider-icon SVGs. State in `chatProviderStore`. **Token needs:** `--sp-accent` (brand), `--sp-menu-*`, `--sp-group-header`.
- **Parity-critical:** hover-to-open drop-UP; grouped options with provider icons; brand-colored current label + selected brand wash.
- **Open questions:** hover-open vs click-open accessibility (keyboard users need click/focus open) — recommend click+focus in addition to hover for a11y.

### Mode selector & permission toggle — charter §3.5 · Phase P6 (perm also P7)
- **Claudian source:** `InputToolbar.ts` `ModeSelector` (two-option toggle: label + `SpToggleSwitch`), `PermissionToggle` (label + toggle; special PLAN state hides the switch and shows teal "PLAN").
- **CSS / visual:** `toolbar/mode-selector.css`, `toolbar/permission-toggle.css`. Both: `margin-left:auto` (push to end), 11px muted label (brand/teal when active). **Toggle switch** is a 32×18 pill with a 14px knob that slides 14px on `.active`; active track = brand wash, knob = brand.
- **Behaviour:** click toggles between the two configured options; permission toggle reads provider toggle config (`activeValue`/`inactiveValue`); PLAN mode (capability-gated) collapses the switch.
- **Specorator mapping:** `ModeIndicators.vue` + `SpToggleSwitch.vue` (exist). Config from provider layer. Permission state → `chatInputModeStore`; approval rules → `approvalRulesStore` (P7). **Token needs:** `--sp-toggle-track`, `--sp-toggle-knob`, `--sp-toggle-active`, `--sp-plan-accent`.
- **Parity-critical:** the 32×18 pill toggle with 14px sliding knob + brand active state; the PLAN special-case (label replaces switch).
- **Open questions:** permission semantics overlap with the P7 approvals subsystem — wire the toggle UI in P6, behavior in P7.

### Thinking selector (effort / budget) — charter §3.5 · Phase P6
- **Claudian source:** `InputToolbar.ts` `ThinkingBudgetSelector` — two variants: **effort gears** (adaptive models, e.g. High/Medium/Low) and **budget gears** (custom models, token amounts). Auto-hides when `reasoningControl:'none'` or only one option.
- **CSS / visual:** `toolbar/thinking-selector.css` — "Effort:"/"Thinking:" 11px label + a current value (brand 11px) that **hover-expands a vertical drop-UP** of gear options (reversed), selected = brand wash. Token-count tooltip on budget gears.
- **Behaviour:** hover expands; click selects; adaptiveness decided by `uiConfig.isAdaptiveReasoningModel`.
- **Specorator mapping:** new `ThinkingSelector.vue` reusing `SpDropdownPanel`. Reasoning options from provider config. State in `chatProviderStore`. **Token needs:** reuse `--sp-accent`, `--sp-menu-*`.
- **Parity-critical:** the dual effort/budget mode; hover-expand vertical option stack; brand current-value; token tooltip on budget.
- **Open questions:** reasoning options are deeply provider-specific (provider phase) — render the widget shell in P6, fully populate post-P9.

### Service-tier toggle — charter §3.5 · Phase P6
- **Claudian source:** `InputToolbar.ts` `ServiceTierToggle` — a single `zap`-icon button (Codex fast-mode). Auto-hidden when no toggle config.
- **CSS / visual:** `toolbar/service-tier-toggle.css` — 22×22 icon button, `zap` icon, hover wash, **brand color when active**; tooltip "Toggle on/off fast mode".
- **Behaviour:** click toggles `activeValue`/`inactiveValue`.
- **Specorator mapping:** `SpIconButton.vue` + a small toggle composable; state in `chatProviderStore`. Icon via `IconPort`. **Token needs:** `--sp-accent`, reuse icon-button tokens.
- **Parity-critical:** the `zap` icon going brand-colored when active; the exact tooltip.
- **Open questions:** Codex-only — confirm provider gating.

### MCP selector — charter §3.5 · Phase P6 (shell) / P8 (wired)
- **Claudian source:** `InputToolbar.ts` `McpServerSelector` — MCP icon + count badge + hover drop-UP list of enabled servers with checkbox toggles; syncs with `@`-mentions (`addMentionedServers`); context-saving servers get an `@` badge.
- **CSS / visual:** `toolbar/mcp-selector.css` — 24px icon `--text-faint`→normal on hover; **active = brand + `mcp-glow` animation** (purple drop-shadow pulse, 2s). Badge (brand 9px) shows count when >1. Drop-UP (`translateX(-50%)` centered, blur-less but shadowed, 200/280px) with header, checkbox rows (brand check, enabled wash), context-saving `@` badge. A `::after` bridges the hover gap.
- **Behaviour:** hover opens (re-renders list on mouseenter); mousedown toggles a server; auto-hides when no servers configured.
- **Specorator mapping:** `McpIndicator.vue` (exists) + a server-list dropdown; state in `mcpStatusStore`. MCP data via **`ObsidianMcpServerPort`** (exists). **Token needs:** `--sp-mcp-glow` (purple), `--sp-accent`, `--sp-menu-*`.
- **Parity-critical:** the purple `mcp-glow` pulse when active; count badge >1; `@`-mention ↔ selector sync; context-saving `@` badge.
- **Open questions:** full MCP wiring is P8 — render the selector shell in P6, populate in P8.

### External-context control — charter §3.5 · Phase P6/P5
- **Claudian source:** `InputToolbar.ts` `ExternalContextSelector` — folder icon + count badge + dropdown of added external dirs with per-path **lock (persist)** and remove; native Electron folder picker; `/add-dir` integration; persistence to settings.
- **CSS / visual:** `toolbar/external-context.css` — folder icon `--text-faint`→normal; **active = brand + `external-context-glow`** (brand drop-shadow pulse). Dropdown rows: monospace path (`~` home-shortened) + lock toggle (brand when locked) + red-hover remove.
- **Behaviour:** click icon → native folder picker (Electron `remote.dialog`); duplicate/nested-path conflict detection; lock toggles session-only ↔ persistent; paths validated, invalid ones pruned with a notice.
- **Specorator mapping:** new `ExternalContextSelector.vue`; folder picker → a desktop-only port (Electron dialog) — see new ports. Persistence via **`SettingsPort`**. Path validation → application layer. **Token needs:** `--sp-ec-glow` (brand), reuse `--sp-menu-*`, `--sp-error` for remove hover.
- **Parity-critical:** the brand glow when active; lock/persist per-path; `~` home-shortened monospace paths; native folder picker.
- **Open questions:** Electron `remote.dialog` is desktop-only and not behind a port — must introduce one (no raw `require('electron')` in Vue).

### Usage / context meter — charter §3.5 · Phase P6
- **Claudian source:** `InputToolbar.ts` `ContextUsageMeter` + `utils/usageInfo.ts`. SVG **240° arc gauge** (16px) drawn programmatically (computes path from start/end angles), with a percent label.
- **CSS / visual:** `components/context-footer.css` — gauge bg stroke `--background-modifier-border`, fill stroke = brand with animated `stroke-dashoffset` (0.3s); percent label brand 11px; **warning >80%** → pale red (`#E57373`) fill + label; custom CSS tooltip (`data-tooltip`) "Ntok / Mtok (Approaching limit, run /compact…)".
- **Behaviour:** hidden when no usage; updates fill + percent on each usage event; warning class >80%; tooltip suggests `/compact`.
- **Specorator mapping:** `ContextMeter.vue` (exists). Usage state in `contextUsageStore`. Usage events from the transport layer (`ChatTransportPort` stream metadata). **Token needs:** `--sp-meter-fill` (brand), `--sp-meter-warn` (pale red), `--sp-meter-bg`.
- **Parity-critical:** the 240° SVG arc gauge with animated fill + percent; brand→pale-red at 80%; the `/compact` suggestion tooltip.
- **Open questions:** usage data is provider/runtime sourced — confirm the stream-metadata seam carries `{contextTokens, contextWindow, percentage}`.

---

## Cross-cutting frontend notes

### Shared primitives (already scaffolded → reuse)
- **Collapsible** (`rendering/collapsible.ts`): the universal expand/collapse — click + Enter/Space, `aria-expanded`, dynamic `aria-label` "<label> - click to expand/collapse", `.expanded` class, `.claudian-hidden` toggle. Used by tool-calls, thinking, subagents, write/edit. → `NestedDetailFrame.vue` + a `useCollapsible` composable. **Every collapsible shares the 2px `border-inline-start` + 7px margin + 16px padding "tree-branch" rail** (24px for thinking) — this is the single most repeated visual motif.
- **Dropdowns**: three flavors — (a) **hover drop-UP** menus (model/thinking/mcp/external selectors), (b) **trigger-driven** drop-UP palettes (slash/mention/resume/history), (c) Obsidian `Menu` (rewind, code-lang). All open *upward* (`bottom:100%`) because the composer sits at the bottom; history has a header-mode drop-down variant. Blur backdrop (`backdrop-filter:blur(20px)`) on palette menus. → `SpDropdownPanel.vue`, `SelectableDropdown` → a generic `useDropdown`/`SelectableList`.
- **Hover-reveal actions**: user-message toolbar (copy/rewind/fork) and history-item actions (rename/delete) use `opacity:0 → 1` on parent hover. → `HoverActions.vue` (exists).
- **Icons**: Claudian uses Obsidian `setIcon` (lucide names) everywhere; tool icons mapped in `toolIcons.ts`; MCP uses a custom SVG (`MCP_ICON_MARKER`/`appendMcpIcon`); provider icons via `createProviderIconSvg`. → **`IconPort`** (exists) + `SpIcon.vue`; provide a `toolIcon(name)` mapping helper in the application layer.
- **Status colors** (shared across tool/subagent/write-edit): running = accent, completed = `--color-green`, error = `--color-red`, blocked = `--color-orange`; async-subagent adds awaiting=yellow, orphaned=orange. Codify as `--sp-status-*` tokens.
- **Copy buttons**: clipboard icon → "Copied!" (accent, monospace 11px) for 1.5s; on text blocks and user messages.
- **Provider brand system** (`base/variables.css`): `--claudian-brand` resolves per `[data-provider]` (claude `#D97757`, codex grey, opencode grey, with light-theme overrides). The accent threads through *everything* (tool icons, thinking, model label, meter, toggles, glows). → drive from `--sp-accent` with optional `[data-provider]` aliasing; **do not** hardcode `#D97757`.

### Motion / animation inventory (`base/animations.css`)
- `thinking-pulse` (opacity 0.5↔1, 1.5s) — live thinking line.
- `spin` / `claudian-spin` (rotate 360°) — title-gen loader, inline-edit spinner, instruction-modal spinner.
- `external-context-glow` — brand drop-shadow pulse on the active external-context icon (2s).
- `mcp-glow` — **purple** (`#7C3AED`) drop-shadow pulse on the active MCP icon (2s).
- Transition staples: `opacity/visibility 0.15s` (dropdowns), `background/color 0.15s` (hovers), `transform 0.2s` (toggle knob), `stroke-dashoffset 0.3s` (usage meter), `scale(1.03)` on image hover, `transform:scale(1.05)` on nav buttons.
- **All motion must honor `prefers-reduced-motion`** (charter §1 a11y; Claudian's `accessibility.css` is minimal — only focus-visible rings, so Specorator must *beat* it by adding reduced-motion + forced-colors handling). → token `--sp-motion-*` + a global reduced-motion guard.

### Keyboard-shortcut map (parity-critical interaction contract)
| Trigger | Context | Effect | Source |
|---|---|---|---|
| `Enter` | composer | send message | `InputController.sendMessage` |
| `Shift+Enter` | composer | newline | managers' `!e.shiftKey` checks |
| `/` (start-of-token) | composer | slash-command palette | `SlashCommandDropdown` |
| `$` (start-of-token) | composer | skills palette | `SlashCommandDropdown` triggerChars |
| `@` | composer | mention palette | `MentionDropdownController` |
| `#` (empty input) | composer | instruction mode | `InstructionModeManager` |
| `!` (empty input) | composer | bang-bash mode | `BangBashModeManager` |
| `Shift+Tab` | composer | toggle plan mode | view keydown + `PermissionToggle` |
| `Arrow Up/Down` | any dropdown / ask-question | navigate items | `handleKeydown`/`handleNavigationKey` |
| `Arrow Left/Right`, `Tab`/`Shift+Tab` | ask-question | switch question tabs | `InlineAskUserQuestion` |
| `Enter`/`Tab` | dropdown | select item | `SlashCommandDropdown.handleKeydown` |
| `Enter` | ask/plan/approval | select / advance / submit | inline widgets |
| `Esc` | dropdowns, modes, inline widgets, image modal | cancel / exit / close | throughout |
| `Enter`/`Space` | any collapsible header | toggle expand | `collapsible.ts` |
| click | nav prev/next chevrons | jump between user messages | `NavigationSidebar` |

### Recommended NEW narrow ports to introduce
The existing ports already cover most seams (`ChatTransportPort`, `MarkdownRenderPort`,
`IconPort`, `CanvasPort`, `MetadataCachePort`, `VaultPort`, `WorkspacePort`,
`SettingsPort`, `NotificationPort`, `ConfirmModalPort`, `ObsidianMcpServerPort`,
`ObsidianCliPort`, `SecretStorePort`, `TransportLifecyclePort`). Genuinely missing:
1. **`FilePickerPort`** — native folder/file dialog (external-context selector uses Electron `remote.dialog`; Vue must not `require('electron')`). `pickDirectory()` / `pickFiles()`.
2. **`EditorSelectionPort`** — read the active editor's text selection + range, and apply CM6 highlight/decoration (drives the selection indicator, inline-edit, and selection-as-context). Browser/canvas selection can be sibling methods or `CanvasPort` extensions (canvas already covered).
3. **`ClipboardPort`** — copy-to-clipboard with the secure-context fallback Claudian guards against (`navigator.clipboard` can throw). Many copy buttons + code-label copy.
4. **`AuxModelPort`** (or fold into `ChatTransportPort`) — title generation, instruction refine, and inline edit are *auxiliary* model calls distinct from the main chat turn; they need a named seam so the UI can show pending/clarify/confirm states without coupling to the main stream.

(Image-modal/overlay needs a teleported Vue overlay primitive rather than a port —
Claudian's `body.createDiv` overlay is not portable to the no-innerHTML world.)

### Token-mapping discipline (for /spec:review, charter §5.4)
Every Claudian hardcoded value below must resolve to a `--sp-*` token, never raw
Obsidian vars or hex in components: brand `#D97757`, plan teal `rgb(92,148,140)`,
instruction blue `#60a5fa`, bash pink `#f472b6`, selection blue `#7abaff`, mcp purple
`#7C3AED`, compact cyan `#5bc0de`, warn red `#E57373`, diff insert/delete washes,
user-bubble `rgba(0,0,0,.3)`. Physical-direction properties are already logical in
Claudian (`inset-inline-start`, `border-end-end-radius`, `margin-inline-start`) — keep
that; the `lint-style-tokens` guard (AUX, regrowing per charter §7) enforces both.
