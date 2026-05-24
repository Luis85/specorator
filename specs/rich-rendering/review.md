---
id: REVIEW-RR-001
title: Rich rendering (P2) — parity + correctness review vs claudian-main
stage: review
feature: rich-rendering
area: RR
epic: claudian-reboot
phase: P2
status: complete
owner: reviewer
verdict: Approved with conditions
inputs:
  - specs/rich-rendering/requirements.md            # PRD-RR-001 (accepted)
  - specs/rich-rendering/design.md                  # DESIGN-RR-001 A/B/C
  - specs/rich-rendering/spec.md                    # SPEC-RR-001..034
  - specs/rich-rendering/tasks.md                   # T-RR-001..044
  - specs/rich-rendering/implementation-log.md
  - specs/rich-rendering/workflow-state.md
  - docs/adr/ADR-RR-001-rich-block-model-and-render-seam.md
  - docs/adr/ADR-RR-002-async-markdown-render-seam.md
reference: D:\Projects\claudian-main                # MIT, read-only parity truth
base: 8b7cb77 (merge-base with origin/develop)
head: 1097cf5
created: 2026-05-25
updated: 2026-05-25
---

# Review — Rich rendering (P2)

## Verdict: **Approved with conditions**

The P2 slice is architecturally sound and faithful to the blessed ADRs: the additive
`StreamChunk`/`ChatMessage` growth, the typed `ToolUseResult`, the pure application transforms, the
declarative no-`v-html` render path, the `IconPort` DTO seam, and the async `MarkdownRenderPort`
(ADR-RR-002) are all correctly built and well-tested at the unit/component layer (652 unit tests,
coverage 96/89/92/96 per the impl log; I re-ran the application + store + reducer suites and they
pass — 112/112; the 3 "errors" were vitest worker-startup timeouts, not test failures).

The conditions are **two integration-level parity gaps where the wiring drops capability the
components already implement**, plus a cluster of tool-coverage / diff-fidelity gaps:

1. **R-RR-001 (P1 blocker)** — the real Claude CLI reducer never emits the subagent / async / notice
   / compaction / tool_output members, so in real Obsidian those five renderers are dead despite
   being fully built and unit-tested.
2. **R-RR-002 (P2 important)** — the live "Thinking Ns…" counter (REQ-RR-013) is never driven in the
   integrated surface (`MessageBlocks` hardcodes `live=false`).

Neither flaw is visible in the unit/component suite (each renderer is green in isolation) or in the
Mock/Fixture demo (the scripted runtimes emit the chunks the CLI reducer omits). They surface only
on the real-CLI path — exactly the manual leg (T-RR-043) that has not been signed off yet. The
verdict is conditional on resolving R-RR-001 and R-RR-002 (or explicitly descoping R-RR-001 to a
later phase with the human's sign-off, since it touches the real-CLI seam).

Brand review: not-applicable — `brand-reviewer` is not dispatched for this internal review; the
`--sp-*` token discipline and no-`v-html` invariant are spot-checked inline below (both hold).

---

## Findings (prioritised)

Separated into **parity gaps** (missing/wrong vs claudian) and **correctness issues** (bugs).
Severity: **P1** = blocks the phase / real-Obsidian feature is dead; **P2** = important parity
deviation a user will notice; **P3** = polish. Out-of-scope deferrals are listed separately and are
NOT findings.

### Parity gaps

| ID | Sev | Gap (our behaviour vs claudian) | Recommended fix | Owner |
|---|---|---|---|---|
| **R-RR-001** | **P1** | **Real-CLI reducer emits only `tool_use`/`thinking`/`tool_result`.** `reduceClaudeStream.ts` (the only place CLI `stream-json` is translated) has zero references to `parent_tool_use_id`, `system/compact_boundary`, `system/task_notification`, blocked-message detection, or `tool_output`. Claudian's `transformClaudeMessage.ts` derives the P2 members from exactly those: subagent routing via `parent_tool_use_id` (`emitToolUse`/`emitToolResult` :23/:30 → `subagent_tool_use`/`subagent_tool_result`), `async_subagent_result` from `system/task_notification` (:48), `context_compacted` from `system/compact_boundary` (:385), `notice` from `isBlockedMessage` (:446). Result: in real Obsidian, **SubagentBlock, the async status pill, ContextCompactedBlock, blocked-notices, and streaming tool_output never render** — even though every store leg + component is built and unit-tested. The Mock/Fixture runtimes DO script these chunks, so the dev/demo and the whole unit suite are green and hide it; only T-RR-043 (manual, unsigned) would catch it. | In `reduceClaudeStream.ts`: (a) thread a per-event `parent_tool_use_id` (and the assistant `message.parent_tool_use_id`) so a `tool_use`/`tool_result` under a parent emits `subagent_tool_use`/`subagent_tool_result{subagentId: parentId}` instead of the top-level member (mirror `emitToolUse`/`emitToolResult`); (b) map `system/subtype:'compact_boundary'` → `{type:'context_compacted'}` and `system/subtype:'task_notification'` → `{type:'async_subagent_result', agentId: task_id, status, result}`; (c) emit `{type:'notice', level:'warning'}` for blocked/denied user messages. If the CLI `--output-format stream-json` shape genuinely cannot carry `parent_tool_use_id` (verify against a real transcript on the T-RR-043 leg), descope subagent/async real-CLI rendering to a later phase **explicitly** and record it — do not leave it as a silent dead path. | dev (escalate scope to pm/architect if the CLI shape forces a deferral) |
| **R-RR-002** | **P2** | **Live thinking counter never runs.** `ThinkingBlock.vue` fully implements the live "Thinking Ns…" 1s-incrementing pulse + freeze-to-"Thought for Ns" + auto-collapse (REQ-RR-013/014) and is unit-tested with `live:true` (`ThinkingBlock.test.ts:50`). But `MessageBlocks.vue:94` hardcodes `:live="false"`, and neither `MessageTurn` nor `MessageBlocks` receives any "this message is the live one / this is the open trailing thinking block" signal (`MessageList.vue:36` knows `streaming` per turn but does not pass it down). So every thinking block renders in its finalised collapsed state; the streaming pulse REQ-RR-013 describes is never seen. | Pass a `streaming`/`live` boolean from `MessageList` → `MessageTurn` → `MessageBlocks`, and have `MessageBlocks` compute `live = isStreamingTurn && block is the last contentBlock && block.type==='thinking'` (claudian finalises the *previous* thinking block when a new content type arrives, so only the trailing thinking block on the live message is live). Drive `ThinkingBlock :live` from that. | dev |
| **R-RR-003** | **P2** | **Tool icons collapsed to 5 generic names; claudian uses ~20 specific lucide icons.** `toolPresentation.toolIcon()` maps every tool to one of `file`/`terminal`/`search`/`bot`/`wrench`. Claudian's `toolIcons.ts` `getToolIcon` distinguishes: Read→`file-text`, Write→`file-plus`, Edit/NotebookEdit→`file-pen`, Glob→`folder-search`, Grep→`search`, LS→`list`, TodoWrite→`list-checks`, WebSearch→`globe`, WebFetch→`download`, Task/Agent→`bot`, plus MCP (`mcp__*`→custom marker), Skill→`zap`, AskUserQuestion→`help-circle`, etc. Because `toolIcon()` returns the *resolved* name and `ObsidianBridge.createIconPort` passes that name straight to Obsidian `setIcon`, **even the production icon is wrong** — Read/Write/Edit all show the same generic file glyph and TodoWrite/Glob/web tools fall back to `wrench`. The impl log frames this as "claudian's richer lucide names exceed iconNodeMap" — but iconNodeMap only bounds the Mock/demo placeholders; the Obsidian backing can resolve any lucide name. | Replace `toolIcon()`'s 5-way switch with claudian's `getToolIcon` map (the real lucide names: `file-text`/`file-plus`/`file-pen`/`folder-search`/`list`/`list-checks`/`globe`/`download`/`bot`/`wrench` + the `mcp__` prefix → MCP marker). The ObsidianBridge will then render the correct icon. Extend `iconNodeMap.ts` with placeholder shapes for the added names so Mock/demo stay recognisable (lower priority — the Obsidian backing is the parity truth per SPEC-RR-012). Confirm against `toolIcons.ts:36-70`. | dev |
| **R-RR-004** | **P2** | **DiffView shows all lines flat; no hunking / context elision.** Claudian's `DiffRenderer.renderDiffContent` calls `splitIntoHunks(diffLines, 3)` (`:23`) so a multi-change Edit shows only ±3 equal-context lines around each change, with `...` separators between hunks. Our `DiffView.vue` renders **every** `DiffLine` flat and only special-cases the all-insert new-file cap. For an Edit with distant changes (e.g. two edits 40 lines apart on a 200-line file), claudian shows two compact hunks; we render the entire 200-line equal-context body inside the 300px scroll. Perceptually quite different. | Port `splitIntoHunks` (`DiffRenderer.ts:23-73`) into the application layer (e.g. alongside `computeDiff`, pure/total) and have `DiffView` render hunks with the `...` separator between them, keeping the all-insert `NEW_FILE_DISPLAY_CAP=20` path. The hunk split is pure list math — no new dependency (NFR-RR-013 holds). | dev |
| **R-RR-005** | **P2** | **Tool name/summary/label coverage narrower than claudian.** `toolPresentation.ts` covers Read/Write/Edit/Bash/Glob/Grep/LS/TodoWrite. Claudian's `getToolName` also names EnterPlanMode→"Entering plan mode" / ExitPlanMode→"Plan complete"; `getToolSummary` covers WebSearch (action-typed), WebFetch (url), Skill, ToolSearch, apply_patch (file-extraction), write_stdin, agent-lifecycle tools. With the CLI capable of emitting any of these, a WebFetch/WebSearch/Skill tool call renders name verbatim + an **empty** summary (the one-line "what it did" is lost). SPEC-RR-014 explicitly scoped P2 to "the common path" and deferred the niche summaries (CLAR-RR-005), so this is a *documented* narrowing — but WebSearch/WebFetch are common enough to call out. | If WebFetch/WebSearch are in-scope for P2 real use, add their `getToolSummary` cases (`url` / web-search action summary, `ToolCallRenderer.ts:94-97`). Otherwise leave as the CLAR-RR-005 deferral but confirm with pm that web tools are acceptable as name-only in P2. The expanded-body specialised renderers (WebSearch links, apply_patch diff sections, AskUserQuestion review) remain correctly deferred. | pm (scope confirm) / dev |
| **R-RR-006** | **P3** | **Generic tool body dumps `JSON.stringify(input)` then raw result; claudian renders per-tool, line-capped bodies.** `ToolCallBlock.vue` shows the full input JSON + the full result text in two `<pre>` blocks. Claudian's `renderExpandedContent` caps lines per tool (Read 15, Grep/Glob/LS 15, generic 20, with a "... N more lines" footer), strips Read's `\d+→` gutters, and shows Bash as `$ command` + output. Functionally safe and escaped (REQ-RR-020a holds — `<script>` shows verbatim), but visually busier and unbounded vs claudian. | Add a line cap + "... N more lines" footer to the generic body (mirror `renderLinesExpanded` :463, cap 20), and consider dropping the raw input-JSON dump in favour of the summary (claudian does not show input JSON in the generic body). Low priority — escaping + correctness are fine. | dev |
| **R-RR-007** | **P3** | **Subagent status pill shown for async only; claudian shows the consolidated subagent status; orphaned ladder is timer-less.** `resolveSubagentLifecycle` classifies async via `agentId !== undefined || mode==='async'`. In our store, `onToolUse` seeds the subagent **without** an `agentId` (only the spawn-tool id), and `agentId` is never set from the CLI (R-RR-001), so a Task subagent classifies as **sync** and shows no pill at all on the real path. On the Mock path the `async_subagent_result` correlates by `subagent.id === agentId` (chatStore.ts:410) so it works. Also `startedAt`/`completedAt` are in the domain type but never set, so no async elapsed-timer parity. | Tie to R-RR-001: once the CLI emits `async_subagent_result` with the real `task_id`, ensure the spawning Task's `subagent.agentId` is set to that id (or the correlation key claudian uses) so async classification fires. The elapsed-timer is a P3 polish item (claudian shows it; SPEC-RR-006 carries the fields). | dev |

### Correctness issues (bugs)

| ID | Sev | Bug (file:line) | Recommended fix | Owner |
|---|---|---|---|---|
| **R-RR-008** | **P2** | **Blocked-status detection absent.** Claudian sets a tool `blocked` status (orange shield-off) when the result text matches "outside the vault"/"access denied"/"user denied"/"approval" (`isBlockedToolResult`, `ToolCallRenderer.ts:810`) and applies it in `handleToolResult` (:613, except `skipsBlockedDetection` tools). Our `chatStore.onToolResult` only ever sets `'completed'`/`'error'` from `isError`; `'blocked'` is a declared `ToolCall.status` value (and `ToolCallBlock`/`WriteEditBlock` style + icon it) that **nothing ever produces**. So a hook-denied tool shows green-completed instead of orange-blocked. REQ-RR-020 lists blocked as one of the four colour-coded states. | Port `isBlockedToolResult` as a pure application helper and apply it in `chatStore.onToolResult`/`onSubagentToolResult`: `status = isError ? 'error' : (isBlocked ? 'blocked' : 'completed')`. (Claudian also has `skipsBlockedDetection` for plan/ask tools — out of P2 scope, can be ignored until P7.) | dev |
| **R-RR-009** | **P3** | **`computeDiff` Edit-input fallback diverges from claudian semantics.** Our `fromToolInput` (computeDiff.ts:82) emits ALL `old_string` lines as deletes then ALL `new_string` lines as inserts (a block delete+insert). Claudian's `diffFromToolInput` (`utils/diff.ts:147`) is the structuredPatch fallback and is rarely hit (the SDK almost always provides `structuredPatch`), so the visible divergence is small — but the all-delete-then-all-insert block is not a real line diff and will look odd for a one-word edit. SPEC-RR-015 §2 actually specifies exactly this behaviour, so it is spec-faithful; flagging only because it differs perceptibly from a real diff when the fallback fires. | Acceptable as specified (the structuredPatch path is the norm). If the fallback proves common on the T-RR-043 leg, consider a minimal LCS line-diff. No action required for P2. | (note only) |
| **R-RR-010** | **P3** | **Usage percentage always 0 from the real CLI; UsageInfo shows tokens only.** `reduceClaudeStream._extractUsage` sets `contextWindow: 0` and `percentage: 0` (the CLI `result.usage` lacks a context-window size). `UsageInfo.vue` correctly hides the percentage when `contextWindow===0` (so it shows "N tokens" with no %). Claudian computes `percentage = round(contextTokens/contextWindow*100)` from `getContextWindowSize(model)` (transformClaudeMessage.ts:307). Parity-wise the % is simply absent on the CLI path, not wrong. NOTE: the PRD-RR-024 acceptance example ("~0.6%" for `percentage:0.6`) is a **PRD typo** — claudian's `percentage` is a 0–100 integer, which our `UsageInfo` renders correctly. | Optional: map the model → context-window size (port a small subset of `getContextWindowSize`) so the % renders on the CLI path. Low priority for P2 (NG5 keeps the meter widget in P6); fold into P6 if not done now. The PRD acceptance-text typo should be corrected when requirements are next touched. | dev (optional) / pm (PRD typo) |
| **R-RR-011** | **P3** | **Markdown walk drops links and flattens nested lists.** `walkMarkdownFragment` handles headings/paragraphs/code_block/lists + text/code/strong/em inlines, but: (a) `<a>` links degrade to plain text (href lost) — `inlineSpanForElement` has no link kind; (b) `listItemsFor` emits only a single `paragraph` per `<li>`, so nested lists / multi-block list items collapse to one line; (c) tables and callouts (Obsidian renders both) degrade to a paragraph of their text. Claudian renders Obsidian's full output. The `MarkdownNode`/`MarkdownInline` union has no `link`/`table` kind, so this needs an additive type widening. Within the no-`v-html` invariant a link must become a declarative `<a>` VNode with an escaped href. | Additively widen `MarkdownInline` with `{kind:'link'; href; spans}` and have the walk read `<a href>` + the VNode renderer emit a safe `<a :href rel="noopener">`. Nested-list and table fidelity are larger; reasonable to defer to a markdown-fidelity follow-up if the P2 content (thinking/subagent/tool text) rarely contains them. Confirm scope with pm — flagged as a perceptual gap, not a blocker. | dev / pm (scope) |

---

## What is solid (verified, not findings)

- **Additive contract held (ADR-RR-001 §1).** `StreamChunk` makes only the `toolUseResult?: unknown → ToolUseResult` edit on `tool_result`/`subagent_tool_result`; `ChatMessage` grows `contentBlocks?`/`toolCalls?` additively; no P1 member renamed/removed. Matches spec SPEC-RR-001/008 and claudian `chat.ts`.
- **Pure transforms are faithful and total.** `toolName`/`toolSummary`/`toolLabel` (TodoWrite "Tasks N/M", Bash 60-char trunc, fileNameOnly, shortenPath) match `ToolCallRenderer.ts:60/79/119` for the covered tools; `renderTodos` (`check`/`dot`, gerund-when-in_progress) matches `todoUtils.ts`; `computeDiff` structuredPatch walk matches `utils/diff.ts:9`; `consolidateSubagent` orphaned/error ladder matches the spec. All degrade (never throw) on malformed input — verified by the green application suite.
- **No-`v-html` invariant (NFR-RR-006, the hardest NFR) holds end-to-end.** Diffs are per-line declarative spans; tool input/result is escaped `<pre>{{ }}`; `MarkdownBlock` builds a VNode tree via `h()` (no `v-html`); `SpIcon` walks the `IconNode` DTO to VNodes; the bridge walks the detached Obsidian fragment / `setIcon` SVG to data and discards the element. A literal `<script>` renders verbatim (REQ-RR-020a). Confirmed by reading every render path — no `v-html`/`innerHTML` sink reaches the UI.
- **Async markdown seam (ADR-RR-002) correct.** `MarkdownRenderPort.render` is `Promise<SafeRenderResult>`; `ObsidianBridge.createMarkdownRenderPort` awaits the real `MarkdownRenderer.render` into a detached element, walks it, and degrades to `safeMarkdownRender` on an empty/failed fragment; `MarkdownBlock` is async-aware with a replace-latest token guard + raw-text first-paint seed. The CLAR-RR-009 reducer fix and the ADR-RR-002 markdown fix both landed.
- **Dispatch + store legs** match the SPEC-RR-018/020 contract: id-keyed tool update, ordered `contentBlocks`, Task/Agent → `{type:'subagent'}` block (not `tool_use`), out-of-order/unknown-id → warn+ignore (EC-RR-1/2/9), no-op when not streaming, forward-compatible default branch (REQ-RR-007). The streaming-error boundary (`{type:'error'}` chunk, never a thrown `Result`) is preserved (ADR-CC-001 §1).
- **`--sp-*` token discipline** holds across DiffView/ToolCallBlock/WriteEditBlock/ThinkingBlock/SubagentBlock/UsageInfo (statuses, state ladder, diff washes, rail indents, mono sizes) — no raw hex / raw Obsidian var in the components (NFR-RR-007). Tokens §4.9 present in `tokens.css`.
- **Collapsibles** default-collapsed (REQ-RR-018), with `SpCollapsible`/`useCollapsible` carrying ARIA + keyboard + reduced-motion (per the unit suite + design B token map).

## Correctly deferred (out of scope — NOT findings)

- **Inline interactive / approval blocks** (AskUserQuestion interaction, ExitPlanMode, plan approval) → **P7**. We may render the read-only *result* of a completed tool, but build no interaction. `ToolCallRenderer`'s `renderAskUserQuestionResult`/`renderApplyPatchExpanded` specialised bodies are out of P2.
- **Provider-lifecycle subagent consolidation** (Codex/Opencode `spawn_agent`/`wait`/`close`) → **P9** (NG7). Our `resolveSubagentLifecycle` is Claude-path-only by design; claudian's `subagentLifecycleResolution`/`ProviderSubagentLifecycleAdapter`/`StreamController.handleProviderSubagent*` are correctly absent.
- **Async-subagent hydration retries** (`loadSubagentToolCalls`/`loadSubagentFinalResult`, the 200/600/1500ms retry ladder in `StreamController:1161-1257`) → later phase; P2 renders what arrives.
- **Tabs / history / resume / fork / rewind / real compaction machinery** → **P3** (NG1). We render the `context_compacted` *block* (once R-RR-001 emits it) but implement no compaction.
- **Composer power, file/image context, toolbar control strip, MCP, P6 context-meter arc widget** → P4/P5/P6/P8 (NG2/4/5/6).
- **`isExpanded`/`resolvedAnswers` on `ToolCall`, per-block timer state on the DTO** → UI-layer / P7 state, correctly excluded from the domain types (ADR-RR-001 §1).

---

## Traceability

`traceability.md` does not yet exist (frontmatter: `pending`). REQ↔SPEC↔TEST coverage is asserted in
spec §0 + tasks coverage table and the unit suite is green, so the downstream chains exist in the
artifacts; the matrix file itself must be generated before `/spec:review` is declared complete
(Constitution Art. V). **Action:** regenerate `specs/rich-rendering/traceability.md` from the
artifacts. Two requirements have a downstream chain that is present in code but **not exercised on the
delivery path**, which the matrix should flag: REQ-RR-013 (live thinking — R-RR-002) and
REQ-RR-006/021a (subagent/async routing on the real CLI — R-RR-001).

## Quality metrics evidence

`specorator quality:metrics --feature rich-rendering --json`: overall 64.3, maturity L1
"Documented", requirementCoverage 50, artifactCompletion 0 (review/traceability/test-report still
pending — expected at this stage). The score reflects unfinished downstream artifacts, not code
quality; it does not override the findings above.

## Hand-off

- **R-RR-001 (P1)** and **R-RR-002 (P2)** are the conditions on the verdict — both are dev fixes
  (R-RR-001 may need a pm/architect scope call if the CLI `stream-json` shape cannot carry
  `parent_tool_use_id`). **R-RR-008 (P2)** blocked-status, **R-RR-003** icons, **R-RR-004** diff
  hunking are the next-priority dev tasks.
- T-RR-043 (manual real-Obsidian + real-CLI rich turn) remains unsigned and is the leg that would
  have caught R-RR-001/002/003 — it must be run before merge.
- After fixes: regenerate `traceability.md`, complete `test-report.md`, then re-review.
