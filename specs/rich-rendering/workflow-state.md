---
feature: rich-rendering
area: RR
current_stage: implementation
status: active
last_updated: 2026-05-24
last_agent: dev (implement — application batch)
epic: claudian-reboot
phase: P2
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.1 + audits + claudian-main stand in — CLAR-RR-001, mirrors P1)
  research.md: skipped (charter §3.1 + audits + claudian-main stand in — CLAR-RR-001, mirrors P1)
  requirements.md: accepted (PRD-RR-001; human-blessed via ADR-RR-001 2026-05-24)
  design.md: complete (DESIGN-RR-001 Parts A/B/C; ADR-RR-001 accepted — human-blessed 2026-05-24)
  ADR-RR-001: accepted (docs/adr/ADR-RR-001-rich-block-model-and-render-seam.md — human-blessed 2026-05-24)
  spec.md: complete (SPEC-RR-001..034; extends SPEC-CC-* P1 contract; 27 TEST-RR scenarios)
  tasks.md: complete (TASKS-RR-001; 44 tasks T-RR-001..044; full SPEC/REQ/NFR/TEST coverage table)
  implementation-log.md: in-progress (domain-foundation T-RR-001..007, 039 + infra T-RR-008..011 + application T-RR-012..021 done; ui/wire-in/gate batches remain)
  test-plan.md: in-progress (TESTPLAN-RR-001; baseline reference + manual TEST-RR-026 / T-RR-043 legs scheduled)
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — rich-rendering (P2)

> **>>> CHECKPOINT CLEARED <<<** ADR-RR-001 was **human-blessed as-is on 2026-05-24** (charter §6a
> "bless as-is" — typed `ToolUseResult` + additive `StreamChunk`/`ChatMessage` growth, per-type
> components behind a dispatcher, Obsidian markdown backing, new `IconPort`). ADR-RR-001 → accepted;
> requirements PRD-RR-001 → accepted; CLAR-RR-002/003 resolved. `/spec:specify` is unblocked.

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped (CLAR-RR-001 — audits + charter stand in, mirrors P1) |
| 2. Research | `research.md` | skipped (CLAR-RR-001 — audits + charter stand in, mirrors P1) |
| 3. Requirements | `requirements.md` | accepted (PRD-RR-001; human-blessed via ADR-RR-001) |
| 4. Design | `design.md` | complete (Parts A/B/C; ADR-RR-001 accepted — human-blessed 2026-05-24) |
| 5. Specification | `spec.md` | complete (SPEC-RR-001..034; 27 TEST-RR) |
| 6. Tasks | `tasks.md` | complete (TASKS-RR-001; T-RR-001..044) |
| 7. Implementation | `implementation-log.md` + code | in-progress (domain-foundation T-RR-001..007, 039 + infra T-RR-008..011 + application T-RR-012..021 done; ui/wire-in/gate remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (test-plan scaffolded; report pending) |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`.

## Epic context — claudian-reboot P2 (rich rendering)

P0 (shell reboot, #432) and P1 (chat-core, #433 squash `5e014d5`) are merged to `next`.
P2 is the second vertical slice: **rich message rendering** on the P1 chat surface.

**Scope (charter §4 P2 row + §3.1):** render —
- **tool-calls** (`ToolCallRenderer`, `toolIcons`/`toolInput`/`toolNames`/`toolResultContent`):
  per-tool icon, collapsible input/result;
- **thinking blocks** (`ThinkingBlockRenderer`, collapsible);
- **todo lists** (`TodoListRenderer`, `todoUtils`, `core/tools/todo`);
- **write/edit with word-level diff** (`WriteEditRenderer`, `DiffRenderer`);
- **collapsible primitive**;
- **subagent rendering + lifecycle** (`SubagentRenderer`, `SubagentManager`,
  `subagentLifecycleResolution`);
- **usage / token info** (`usageInfo`) — surfaced now (P1 stored but did not render it, NG4).

**Out of P2 (later phases):** tabs/history/resume/fork/rewind/compact/title-gen (P3); composer
power — slash/@mention/instruction/plan/bang-bash (P4); inline interactive blocks —
ask-user-question / exit-plan-mode / plan-approval / approvals (P7); context & attachments —
file chips / images (later); Codex/Opencode providers (P9).

**Builds on P1:** extends the `StreamChunk` union with the additive members the P1 design
documented-for-P2 (`thinking`, `tool_use`, `tool_result`, `tool_output`, `context_compacted`,
`subagent`) + the matching `RunChatTurnUseCase.dispatchChunk` handlers + `ChatTurnSink` legs +
`chatStore` state + new render components — **without redesigning** the P1 contract (per ADR-CC-001
"grow per phase" and the StreamChunk additive-union note). `ChatMessage` grows `contentBlocks`/
`toolCalls` (P1 excluded them, REQ-CC-006).

**Mandatory inputs (charter §6 + READ FIRST):** `specs/claudian-reboot/parity-charter.md` (§3.1
inventory, §4 P2 row, §5 parity acceptance), `specs/claudian-reboot/claudian-audit-{frontend,backend}.md`
(MessageRenderer / ToolCallRenderer / ThinkingBlockRenderer / TodoListRenderer / WriteEditRenderer /
DiffRenderer / SubagentRenderer maps), and `D:\Projects\claudian-main` as the visual/parity truth.

**Epic constraints (every phase):** secrets → `app.secretStorage` behind `SecretStorePort`, never
`data.json`; device-local settings; NO backwards compat (load-or-default); DDD inward imports + narrow
ports + 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm`; `<script
setup>`; `Result<T,E>`; tests mirror `src/` with `data-testid` PageObjects; coverage 80/70/80/80;
look/feel via `--sp-*` tokens = **perceptual** parity (not pixel); identity stays Specorator; WCAG 2.2
AA; never touch manifest id/version/minAppVersion; CI `uses:` SHA-pinned + actionlint. VERIFY GATE every
phase (`npm run verify` + `npm run test:all` exit zero, zero bypasses). Draft PR into `next` with parity
evidence; checkpoint with the human at charter §6 ADR decisions + the P2 PR + screenshots.

**Carry-over:** P1 parity-screenshot matrix is deferred to issue **#434** (capture during/alongside P2).

## Skips

- (to be decided) — P1 skipped `idea.md`/`research.md` (charter §3 + audits stood in). P2 likely
  mirrors this: the analyst confirms whether the charter §3.1 inventory + the per-surface audits +
  `claudian-main` suffice as idea+research, or whether a thin `idea.md` is warranted.

## Hand-off notes

```
2026-05-24 (orchestrator): P2 bootstrapped on feature/rich-rendering (off next; P0 #432 + P1 #433
                          merged). workflow-state scaffolded. Scope = charter §4 P2 row / §3.1 rich
                          message rendering (tool-calls, thinking, todo, write/edit + word-diff,
                          collapsible, subagent, usage). NOTE corrected a stale roadmap belief: P2 is
                          RICH RENDERING, not threads (threads = P3, charter §3.2).
                          Next: /spec:research or /spec:requirements (analyst/pm) reading charter §3.1
                          + claudian-audit-{frontend,backend} + claudian-main (the renderers named
                          above), then design A/B/C — file the P2 ADRs (StreamChunk additive members;
                          render-port/component seams; any approval-deferral lines), add the
                          audit-named ports/components. EARS requirements, each mapped to a claudian
                          path + a test, mirroring the P1 PRD discipline. Checkpoint with the human on
                          any charter §6 ADR decision before design proper.
2026-05-24 (pm, requirements): PRD-RR-001 written at specs/rich-rendering/requirements.md (status
                          DRAFT, held — mirrors P1's PRD-CC-001 discipline). Idea/research SKIPPED
                          (CLAR-RR-001: charter §3.1 + frontend/backend audits + claudian-main stand
                          in, as in P1). 30 EARS requirements REQ-RR-001..027 grouped by sub-surface,
                          each mapped 1:1 to a claudian path/symbol + a testable Given/When/Then:
                          A stream→chunk emit/dispatch (RR-001..007 → chat.ts:137 + StreamController +
                          RunChatTurnUseCase.dispatchChunk default branch); B message-model growth
                          (RR-010..012 → ChatMessage chat.ts:39 contentBlocks/toolCalls, ContentBlock
                          chat.ts:31, MessageRenderer); C collapsible primitive (RR-015..018 →
                          collapsible.ts + the 2px rail); D tool-call render (RR-019/019a/020/020a →
                          ToolCallRenderer + toolIcons/toolNames/toolInput/toolResultContent); E
                          thinking (RR-013/014 → ThinkingBlockRenderer); F todo (RR-022/023 →
                          todoUtils + todo.ts); G write/edit + word-diff (RR-025..027 →
                          WriteEditRenderer + DiffRenderer + diff.ts); H subagent + lifecycle
                          (RR-021/021a/021b → SubagentRenderer + subagentLifecycleResolution +
                          SubagentInfo, Claude path only — Codex/Opencode deferred P9); I usage render
                          (RR-024/024a → usageInfo + UsageInfo chat.ts:165, surfacing what P1 stored).
                          14 NFRs NFR-RR-001..014: DDD + 3 bridges, **NFR-RR-006 no `v-html`/innerHTML
                          = the hardest, called out explicitly** (declarative safe nodes for tool/
                          thinking/todo/diff/markdown), Result<T,E>, <script setup>, tests mirror src/
                          + data-testid POs, coverage 80/70/80/80, --sp-* token parity (perceptual,
                          not pixel; reuse AUX work as reference not copy), WCAG 2.2 AA (collapsibles
                          keyboard + ARIA), manifest untouched, no secret/no migration. Success metrics
                          + release criteria set; counter-metric = scope leakage vs the NG list (incl.
                          the P7 Inline* widgets and P6 meter widget). Non-goals enumerate NG1..NG10
                          deferring tabs/composer/inline-interactive/attachments/toolbar/MCP/providers.
                          OPEN CLARS sharpened/added: CLAR-RR-002 is ADR-worthy + BLOCKS `accepted`
                          (the union+ChatMessage growth, incl. the toolUseResult:unknown→SDKToolUseResult
                          shape divergence flagged vs claudian — do not silently change); CLAR-RR-003
                          is the render-seam + MarkdownRenderPort-backing design call (CLAR-CC-005's
                          "defer to P2" lands here); CLAR-RR-001/004/005/006 non-blocking/design-time.
                          HAND-OFF → /spec:design (architect Part A UX / Part B UI / Part C ADRs):
                          (1) file the CLAR-RR-002 ADR (StreamChunk + ChatMessage additive growth +
                          typed toolUseResult) BEFORE design proper — checkpoint with the human, charter
                          §6; (2) resolve CLAR-RR-003 render seam + port backing in design; (3) Part B
                          token map for every renderer (statuses, async ladder, diff washes, the rail
                          indents, mono sizes) from --sp-* not hardcoded hex; capture P2 parity
                          screenshots (matrix coordinated with #434). current_stage stays at
                          requirements; status DRAFT until CLAR-RR-002 blessed. No design/code; not committed.
2026-05-24 (architect, design): DESIGN-RR-001 written at specs/rich-rendering/design.md (Parts
                          A/B/C). ADR-RR-001 FILED at docs/adr/ADR-RR-001-rich-block-model-and-render-seam.md
                          (status PROPOSED) + indexed in docs/adr/README.md. ADR mirrors ADR-CC-001's
                          "grow per phase" + additive-union discipline and rules on the four load-bearing
                          P2 seams: (1) CLAR-RR-002 — type `tool_result`/`subagent_tool_result`
                          `toolUseResult?: unknown` → typed domain `ToolUseResult` (+ `StructuredPatchHunk`/
                          `DiffLine`/`DiffStats`, mirroring claudian diff.ts:27); grow `ChatMessage` with
                          `contentBlocks?`/`toolCalls?` (chat.ts:39/46/47) + new domain types `ContentBlock`/
                          `ToolCall`/`SubagentInfo`/`TodoItem`; images/rewind-ids/currentNote/inline-approval
                          fields stay excluded (later phases). (2) CLAR-RR-003 part 1 — per-type block
                          components (`ToolCallBlock`/`ThinkingBlock`/`TodoList`/`WriteEditBlock`+`DiffView`/
                          `SubagentBlock`/`UsageInfo`) behind a thin `MessageBlocks.vue` dispatcher (chose
                          this over a mega-renderer for NFR-RR-005 isolation); pure transforms
                          (`toolPresentation`/`computeDiff`/`renderTodos`/`resolveSubagentLifecycle`) in the
                          application layer mirroring the P1 `safeMarkdownRender` seam. (3) CLAR-RR-003 part 2
                          + CLAR-CC-005 — upgrade `MarkdownRenderPort` production backing to Obsidian
                          `MarkdownRenderer` in ObsidianBridge, walked to the EXISTING `SafeRenderResult`
                          DTO (shape UNCHANGED → not an ADR shape change; Mock/LocalStorage keep pure
                          `safeMarkdownRender`). (4) New narrow `IconPort` (declarative icon-node DTO, own
                          ICON_PORT key + useIconPort()) regrowing the P0-deleted icon seam; all other P2
                          ports deferred. Rejected: keep-`unknown`+guard (C), mega-renderer (B),
                          extend-pure-markdown-only (D). NFR-RR-006 (no v-html) satisfied for diffs (per-line
                          declarative spans), tool blocks (escaped pre-wrapped text), markdown/icons (bridge
                          walks fragment→DTO; no sink reaches UI). CLAR-RR-004 (Claude subagent path only,
                          Codex/Opencode P9), CLAR-RR-005 (generic expanded renderer + Write/Edit diff in P2),
                          CLAR-RR-006 (thinking colour from `--sp-accent`, not `#D97757`) all confirmed in
                          design. 17 edge cases (EC-RR-1..17) + 23 QA-seam scenarios + observability + Part C
                          coverage table. current_stage advanced to design (NOT past it). No spec.md/tasks/
                          code; not committed.
                          HAND-OFF → planner (Tasks) — BLOCKED until the human blesses ADR-RR-001:
                          (a) ADR-RR-001 must be accepted (charter §6a) before /spec:specify, mirroring the
                          P1 ADR-CC-001 gate; (b) once blessed, /spec:specify writes spec.md from DESIGN-RR-001
                          (SPEC-RR-* extending SPEC-CC-002 StreamChunk, SPEC-CC-004 ChatMessage, SPEC-CC-008
                          ports, SPEC-CC-014 markdown seam, SPEC-CC-015 dispatch, SPEC-CC-016 store) — full
                          per-interface contracts for the new sink legs, the typed `ToolUseResult`, the pure
                          transforms, `IconPort`, and the edge cases EC-RR-1..17; (c) open clarifications to
                          watch at spec: EC-RR-2 out-of-order tool_result handling (buffer vs ignore — spec
                          must decide), EC-RR-17 Obsidian-vs-pure markdown perceptual equivalence
                          (compatibility note + parity check), and the exact P2 node-model extension for the
                          Obsidian markdown backing (if it forces a `SafeRenderResult` shape change, that
                          returns to ADR-RR-001 as an amendment/superseding ADR).
2026-05-24 (architect, specification): SPEC-RR-001..034 written at specs/rich-rendering/spec.md
                          (status complete), extending the P1 SPEC-CC-* contract (SPEC-CC-002 StreamChunk,
                          SPEC-CC-004 ChatMessage, SPEC-CC-007 MarkdownRenderPort, SPEC-CC-008/009 ports,
                          SPEC-CC-013 bridges, SPEC-CC-015 dispatch/sink, SPEC-CC-016 store, SPEC-CC-017
                          composables, SPEC-CC-019 message render, SPEC-CC-023 tokens) additively — no P1
                          member renamed/removed. 34 spec items grouped by layer: DOMAIN (SPEC-RR-001..009 —
                          the StreamChunk `toolUseResult?:unknown`→`ToolUseResult` edit [the ONLY edit to a
                          declared P1 member], ToolUseResult/StructuredPatchHunk, DiffLine/DiffStats/
                          ToolDiffData, ContentBlock ordered union, ToolCall, SubagentInfo/SubagentMode/
                          AsyncSubagentStatus, TodoItem, additive ChatMessage.contentBlocks?/toolCalls?, new
                          IconPort + IconNode DTO + ICON_PORT key + barrel re-export); INFRA (SPEC-RR-010..013
                          — Obsidian MarkdownRenderer backing walked to the UNCHANGED SafeRenderResult DTO,
                          MarkdownNode/Inline declarative extension, IconPort on all 3 bridges, Mock/Fixture
                          scripted rich chunks); APPLICATION (SPEC-RR-014..019 — pure/total transforms
                          toolPresentation/computeDiff/renderTodos/resolveSubagentLifecycle [Claude path
                          only], dispatchChunk P2 handlers + the new ChatTurnSink legs, streaming-error
                          boundary PRESERVED); UI (SPEC-RR-020..032 — chatStore block/tool/subagent legs,
                          useIconPort, MessageBlocks dispatcher, MessageTurn fork, SpCollapsible+useCollapsible,
                          SpIcon, ToolCallBlock, ThinkingBlock, TodoList, WriteEditBlock+DiffView,
                          SubagentBlock, UsageInfo, ContextCompactedBlock — each with its data-testid
                          PageObject, declarative nodes only, WCAG 2.2 AA collapsible); STYLES (SPEC-RR-033
                          tokens §4.9 + SPEC-RR-034 the no-v-html cross-cutting invariant). 17 edge cases
                          (EC-RR-1..17) + EC-RR-XSS + EC-RR-ICON, all testable. 27 TEST-RR scenarios with the
                          U/A/M split (12 pure U + 13 A + the Obsidian markdown/icon backing as the single M
                          leg of TEST-RR-026, coverage-excluded infra) — 25 automatable. Full
                          REQ-RR↔SPEC-RR↔TEST-RR coverage table proving all 27 REQ + all 14 NFR map to ≥1
                          spec + test. RESOLVED the spec-time watch item EC-RR-2 (out-of-order tool_result):
                          the store IGNORES + warns, no buffer/late-bind (claudian StreamController find+skip
                          parity) — stays within ADR-RR-001 (sink degrade policy, no type/seam change).
                          NO return to ADR-RR-001 was needed: the StreamChunk toolUseResult edit (ADR-RR-001
                          §1) + the MarkdownNode union widening (ADR-RR-001 §3, keeps the SafeRenderResult
                          field contract) both stay within the blessed ADR; flagged as an implementation
                          watch item in spec §12 in case the Obsidian fragment walk forces a return-shape
                          change. current_stage stays at specification (NOT advanced). No tasks/code; not committed.
                          HAND-OFF → planner (Tasks): decompose SPEC-RR-001..034 into T-RR-NNN. TDD ORDERING:
                          (1) domain types FIRST (SPEC-RR-001..009) — the StreamChunk member-shape edit + the
                          ICON_PORT key land early since all downstream imports them; (2) pure transforms next
                          (SPEC-RR-014..017 — fully unit-testable, no mount); (3) dispatch + sink + store
                          (SPEC-RR-018..020); (4) components last (SPEC-RR-022..032) with co-located
                          data-testid PageObjects; (5) the Obsidian MarkdownRenderer/setIcon backing
                          (SPEC-RR-010/012 production half) is coverage-excluded → MANUAL leg (TEST-RR-026 M),
                          not unit-covered; add a --sp-* token task (SPEC-RR-033) + a Mock/Fixture
                          rich-chunk-script task (SPEC-RR-013) EARLY so npm run dev / demo drive every
                          renderer from the start; pair with the NFR-RR-011 baseline-capture (#434). OPEN
                          ITEMS for planner (spec §12): EC-RR-2 closed; the MarkdownNode union-widening +
                          EC-RR-17 Obsidian-vs-pure perceptual equivalence are implementation/parity-review
                          watch items, not blockers.
2026-05-24 (planner, tasks): TASKS-RR-001 written at specs/rich-rendering/tasks.md (status complete).
                          44 tasks T-RR-001..044 decompose SPEC-RR-001..034, mirroring the P1 TASKS-CC-001
                          discipline: TDD-ordered (every RED test [owner qa] precedes the impl [owner dev]
                          that greens it; each dev task's FIRST DoD line is "the prior RED test(s) now
                          pass"), one stable id per task, ≤½ day each (S/M, no L), explicit deps, testable
                          DoD. Ordered by DDD inward layering in 7 batches: (1) DOMAIN T-RR-002..007 — the
                          structural RED (T-RR-002), the StreamChunk toolUseResult typing edit + ChatMessage
                          growth, the new diff/block/tool/subagent/todo types, IconPort+ICON_PORT key+barrel;
                          (2) INFRA T-RR-008..011 — IconPort on the 3 bridges + Mock/Fixture scripted rich
                          chunks + the Obsidian MarkdownRenderer/setIcon backing (coverage-excluded → manual
                          leg); (3) APPLICATION T-RR-012..021 — the four pure transforms (toolPresentation/
                          computeDiff/renderTodos/resolveSubagentLifecycle) each RED→green, then dispatchChunk
                          handlers + the new ChatTurnSink legs; (4) UI T-RR-022..038 — chatStore P2 legs,
                          useIconPort, then the components (SpCollapsible+useCollapsible, SpIcon, ToolCallBlock,
                          TodoList, ThinkingBlock, WriteEditBlock+DiffView, SubagentBlock, UsageInfo,
                          ContextCompactedBlock, MessageBlocks dispatcher + MessageTurn fork), each with a
                          co-located data-testid PageObject; (5) STYLES T-RR-039 (--sp-* §4.9 tokens, no deps);
                          (6) WIRE-IN T-RR-040..042 (provide ICON_PORT + npm run dev rich smoke); (7) GATE
                          T-RR-043 (MANUAL Obsidian backing + real-CLI rich turn — human-owned, never
                          agent-self-claimed, mirrors P1 TEST-CC-017) + T-RR-044 (full verify + parity #434 +
                          draft PR into next). The deleted-symbol guard relaxation for IconPort/SpIcon/ICON_PORT
                          is its own task (T-RR-003, mirrors P1 CLAR-CC-007), sequenced before T-RR-007 so the
                          icon imports resolve. NFR-RR-006 (no v-html/innerHTML — the hardest P2 NFR) is an
                          explicit DoD line on every render-component task + the bridge DTO-walks + the final
                          gate. Full coverage table proves all 34 SPEC-RR + 27 REQ-RR + 14 NFR-RR + 27 TEST-RR
                          map to ≥1 task. current_stage advanced to tasks (NOT past it — no implementation). No
                          code; not committed.
                          HAND-OFF → dev/qa (Implementation): FIRST READY TASK is T-RR-002 (qa — RED domain
                          types/StreamChunk/ChatMessage structural tests), which the dev T-RR-004..006 green.
                          NO-DEP TASKS runnable in parallel from the start: T-RR-001 (baseline, dev),
                          T-RR-003 (guard relax, dev), T-RR-039 (--sp-* tokens, dev), and T-RR-002 (domain RED,
                          qa). GUARD-RELAX = T-RR-003 (must land before T-RR-007). The single human-owned leg is
                          T-RR-043 (Obsidian markdown/icon backing + real CLI) — schedule + record it in
                          test-plan.md, never self-claim. Parity screenshots ride #434 at /spec:review (T-RR-044).
2026-05-24 (dev, implement — domain-foundation batch): Executed the DOMAIN-FOUNDATION batch on
                          feature/rich-rendering with strict TDD, one Conventional commit per task.
                          COMPLETED (in order): T-RR-001 baseline docs (d42bdde); T-RR-003 deleted-symbol
                          guard relax for IconPort/ICON_PORT — SpIcon permitted by construction; positive
                          control still fires (80cdd71); T-RR-002 RED structural tests, 7 files TEST-RR-001/
                          002/003, watched fail on typecheck TS2307+TS2322 + a runtime missing-value-import
                          (7557246); T-RR-004 diff domain types ToolUseResult/StructuredPatchHunk/DiffLine/
                          DiffStats/ToolDiffData → TEST-RR-003 green (e781f4e); T-RR-005 ContentBlock/ToolCall/
                          Subagent/TodoItem (+isValidTodoItem) P2 subsets → TEST-RR-002 green (baf866e);
                          T-RR-006 StreamChunk toolUseResult?:unknown→ToolUseResult edit + additive
                          ChatMessage.contentBlocks?/toolCalls? → TEST-RR-001+002 green (39c4abc);
                          T-RR-007 IconPort+IconNode DTO+ICON_PORT key+barrel re-export (92464ed);
                          T-RR-039 §4.9 --sp-* tokens + --sp-success-rgb, lint:style-tokens clean (5b10e30).
                          BATCH-END STATE: `npx vue-tsc --noEmit -p tsconfig.lint.json` → 0 errors; `npm run
                          lint` → 0 errors (3 pre-existing warnings: eslint.config.js max-lines + 2
                          ErrorBoundary one-component-per-file); lint:style-tokens clean; touched-file tests
                          → 11 files / 49 tests pass (chat domain 48 incl. all 7 RED-now-GREEN; chatStore
                          18/18; tokens 7/7; deleted-subsystem guard 2/2). DEVIATION: T-RR-006 also touched
                          one P1 consumer — chatStore.$reset switched from the object form of $patch to the
                          mutator form, because the object overload's _DeepPartial no longer resolves once
                          ChatMessage carries the recursive contentBlocks/toolCalls fields. Behaviour-
                          preserving; the minimal edit required for T-RR-006 to typecheck; no test assertion
                          changed. NOT pushed; manifest.json untouched; full verify/build/build:web deferred
                          to the T-RR-044 gate. NEXT BATCH (infra, SPEC-RR-010..013): FIRST TASK = T-RR-008
                          (qa — RED: createIconPort on the 3 bridges + Mock/Fixture rich-chunk scripts,
                          TEST-RR-024/026 U legs), greened by T-RR-009 (IconPort impls) + T-RR-010 (scripted
                          rich chunks) + T-RR-011 (MarkdownRenderPort Obsidian backing + node-model widening).
                          The Obsidian backing half is coverage-excluded → manual leg of TEST-RR-026 (T-RR-043,
                          human-owned, recorded in test-plan.md). T-RR-008 depends on T-RR-007 (done).
2026-05-24 (dev, implement — infra batch): Executed the INFRA batch (SPEC-RR-010..013) on
                          feature/rich-rendering with strict TDD, one Conventional commit per task.
                          COMPLETED (in order): T-RR-008 RED — createIconPort on Mock/LocalStorage +
                          Mock/Fixture rich-chunk scripts (3 new test files, 25+9+5 assertions),
                          watched fail for the right reason (createIconPort TS2339 compile-failure +
                          runtime script-still-text…done) (b3d49e9; lint fixup 80e825e); T-RR-009
                          IconPort impls — shared static name→IconNode Map (iconNodeMap.ts +
                          staticIconPort.ts) on Mock+LocalStorage, ObsidianBridge setIcon→detached
                          element→walkSvgElementToIconNode→discard (no UI sink, NFR-RR-006); TEST-RR-024
                          U leg 25/25 (514782f); T-RR-010 Mock DEFAULT_SCRIPT + Fixture FIXTURE_TRANSCRIPT
                          emit the rich turn (thinking/Read/Write+structuredPatch+3-1/TodoWrite/subagent/
                          async/usage), per-chunk yield + single done preserved, still injectable;
                          TEST-RR-026 U leg green (1032af0); T-RR-011 MarkdownNode/MarkdownInline widened
                          additively (heading/code_block/list + strong/em), SafeRenderResult.nodes field
                          contract UNCHANGED; ObsidianBridge.createMarkdownRenderPort()→MarkdownRenderer.
                          render into detached element→walkMarkdownFragment→DTO, degrade to
                          safeMarkdownRender (sync/total/never-throws), Mock/LocalStorage keep the pure
                          backing (56de482).
                          BATCH-END STATE: vue-tsc -p tsconfig.lint.json → 0 errors; npm run lint → 0
                          errors (3 pre-existing warnings only — eslint.config.js max-lines + 2
                          ErrorBoundary one-component-per-file); touched-surface tests 261/261
                          (tests/application/chat + tests/infrastructure + tests/ui/chat +
                          tests/domain/chat + tests/ui/stores). DEVIATIONS (both within ADR-RR-001, no
                          ADR return): (1) the union widening forced behaviour-preserving kind-narrows in
                          three P1 consumers/tests that read node.spans/span.value directly
                          (MarkdownBlock.vue paragraph+text/code filter; safeMarkdownRender/
                          safeMarkdownRenderPort/createChatRuntime test span-flatten helpers) — NO test
                          assertion changed, compile-only, the pure backing output is byte-identical
                          (this is the documented spec §12 watch item; SafeRenderResult.nodes contract
                          intact). (2) MarkdownRenderer.render is async vs the synchronous port — the
                          backing kicks it off + walks synchronously, degrading to the pure baseline when
                          the fragment is not yet populated (the spec's degrade-never-throw path within
                          the sync contract; the real-Obsidian behaviour is gated by the manual
                          TEST-RR-026 leg). NOT pushed; manifest.json untouched; full verify/build/
                          build:web/coverage deferred to the T-RR-044 gate. MANUAL legs (T-RR-043,
                          human-owned) for the Obsidian MarkdownRenderer/setIcon backing stay scheduled
                          in test-plan.md — never self-claimed. NEXT BATCH (application, SPEC-RR-014..019):
                          FIRST TASK = T-RR-012 (qa RED — toolPresentation pure transform: toolName/
                          toolSummary/toolLabel, TEST-RR-014), greened by T-RR-013, then T-RR-014..021
                          (computeDiff, renderTodos, resolveSubagentLifecycle, dispatchChunk P2 handlers +
                          the new ChatTurnSink legs). All four transforms are pure/total + fully
                          unit-testable, no mount.
2026-05-24 (dev, implement — application batch): Executed the APPLICATION batch (SPEC-RR-014..019) on
                          feature/rich-rendering with strict TDD, one Conventional commit per task.
                          COMPLETED (in order): T-RR-012 RED toolPresentation (19 cases, TEST-RR-014,
                          c3eed8d) → T-RR-013 toolPresentation.ts toolName/toolSummary/toolLabel +
                          fileNameOnly, claudian getToolName/Summary/Label parity, TodoWrite count via
                          domain isValidTodoItem guard, toolLabel factored to stay complexity≤10
                          (2b99242); T-RR-014 RED computeDiff (11 cases, TEST-RR-018, fb2dde5) →
                          T-RR-015 computeDiff.ts structuredPatch + Edit/Write-input paths, no new dep,
                          malformed/absent degrade to empty (EC-RR-3/4) (9ab80ea); T-RR-016 RED
                          renderTodos/parseTodos (10 cases, TEST-RR-017, bbe0f97) → T-RR-017
                          renderTodos.ts icon-NAME rows + guard-filtered parseTodos (75d1f47); T-RR-018
                          RED resolveSubagentLifecycle (13 cases, TEST-RR-021, f1f23dd) → T-RR-019
                          resolveSubagentLifecycle.ts + consolidateSubagent, Claude path only
                          (Codex/Opencode deferred P9), non-mutating, orphaned on no-result (EC-RR-11)
                          (86838f7); T-RR-020 RED dispatchChunk P2 handlers + ChatTurnSink P2 legs
                          (16 cases, TEST-RR-005/006/007/009/012/027, 13/16 watched-fail, d344476) →
                          T-RR-021 grew ChatTurnSink with the 9 P2 legs + routed each P2 chunk via
                          extracted dispatchToolChunk/dispatchSubagentOrMiscChunk/logP2 helpers
                          (default branch + streaming-error boundary preserved, ADR-CC-001 §1)
                          (ca021de).
                          BATCH-END STATE: npm run typecheck (vue-tsc -p tsconfig.lint.json) → 0 errors;
                          npx eslint on every touched file → 0 errors/0 warnings (complexity≤10 held);
                          tests/application/chat + tests/ui/stores 113/113; full unit suite re-run
                          566/566 across 73 files (no regression). DEVIATIONS: (1) toolPresentation —
                          non-string file_path degrades to '' per SPEC-RR-014's explicit wording
                          (stricter than claudian's number coercion; spec is the contract, Constitution
                          Art. I); (2) RunChatTurnUseCase — added an OPTIONAL logger?:LoggerPort ctor
                          arg for §8's per-chunk debug (mandatory would break the P1
                          new RunChatTurnUseCase(runtime) in ChatSurface.vue); (3) cross-batch type
                          bridge — growing ChatTurnSink forced inert P2-leg no-op stubs in chatStore.ts
                          _sink() + the P1 RunChatTurnUseCase.test.ts makeSink() fixture so the wider
                          interface type-checks NOW (typecheck-0 is this batch's gate); the concrete
                          store behaviour (SPEC-RR-020) is owned by T-RR-023 (UI batch) and driven by
                          the T-RR-022 RED tests — stubs marked "pending T-RR-023"; no P1 test assertion
                          changed. NOT pushed; manifest.json untouched; no new dependency (NFR-RR-013);
                          full verify/build/build:web/coverage/audit deferred to the T-RR-044 gate.
                          NEXT BATCH (UI, SPEC-RR-020..032): FIRST TASK = T-RR-022 (qa RED — chatStore
                          P2 sink-leg actions / state machine: onToolUse + tool_use block, onToolResult
                          + computeDiff for Write/Edit, onToolOutput, onThinking, subagent legs,
                          EC-RR-1/2/9/10 + order preservation + no-op-when-not-streaming + $reset,
                          tests/ui/stores/chatStore.rr.test.ts), greened by T-RR-023 (which replaces the
                          inert _sink() P2 stubs landed here with the real block/tool/subagent state
                          mutations + subagent registry). Then T-RR-024 (useIconPort) + the components
                          T-RR-025..038.
```

## Open clarifications

> **Spec-time resolutions (2026-05-24, architect):** EC-RR-2 (out-of-order `tool_result`) RESOLVED in
> SPEC-RR-020 — ignore + `warn`, no buffer. The MarkdownNode union-widening (SPEC-RR-011) + EC-RR-17
> (Obsidian-vs-pure markdown perceptual equivalence) are implementation/parity-review watch items, not
> blockers. NO return to ADR-RR-001 was required (the StreamChunk `toolUseResult` edit + node-union
> widening stay within ADR-RR-001 §1/§3). CLAR-RR-004/005/006 confirmed in spec (Claude subagent path
> only; generic expanded renderer + Write/Edit diff in P2; thinking colour from `--sp-accent`).

- [ ] CLAR-RR-001 — Idea/research depth: thin `idea.md` vs charter §3.1 + audits standing in (mirror P1)?
      **(pm recommendation: mirror P1 — audits + charter stand in; idea/research skipped above.
      Non-blocking. Owner: analyst/pm.)**
- [ ] CLAR-RR-002 — `StreamChunk` + `ChatMessage` additive growth — **ADR-worthy, blocks `accepted`.**
      Members already declared in `src/domain/chat/StreamChunk.ts`; confirmed vs `claudian-main`
      `chat.ts:137`: names + field shapes **match**, with ONE divergence to flag — our
      `tool_result`/`subagent_tool_result` carry `toolUseResult?: unknown`, Claudian uses typed
      `SDKToolUseResult` (`diff.ts:27`, `{ structuredPatch?, filePath?, … }`). The Write/Edit diff
      (REQ-RR-026) reads `structuredPatch`, so P2 likely tightens `unknown` → typed. The growth also
      adds `ChatMessage.contentBlocks`/`toolCalls` (P1 excluded, REQ-CC-006) + new domain types
      `ContentBlock`/`ToolCallInfo`/`DiffLine`/`DiffStats`/`SubagentInfo`/`TodoItem`. **Do not silently
      change the union — architect ADR (mirroring ADR-CC-001) before design proper. Owner: architect.**
- [ ] CLAR-RR-003 — Render seam + `MarkdownRenderPort` backing (design-time). (1) one
      `MessageBlockRenderer` tree switching on `ContentBlock.type` (mirrors `MessageRenderer`) vs
      per-type components behind a thin dispatcher. (2) P1 `MarkdownRenderPort` ships paragraph-only
      `safeMarkdownRender`; CLAR-CC-005 deferred the Obsidian `MarkdownRenderer` backing **to P2** —
      decide: upgrade the backing to Obsidian's renderer **while keeping the structured-node DTO
      shape** (so UI stays declarative, NFR-RR-006 no `v-html`), or extend the safe node model.
      **(pm recommendation: per-type components behind a thin dispatcher; upgrade backing without
      changing the return shape. ADR only if the port shape changes. Owner: architect — resolve at design.)**
- [ ] CLAR-RR-004 *(new — design-time, non-blocking)* — Provider-lifecycle subagent split: P2 scopes
      the Claude Task/Agent subagent path only; Codex/Opencode `spawn_agent`/`wait` consolidation
      **deferred to P9** (NG7, REQ-RR-021b). Confirm the seam at design. Owner: pm/architect.
- [ ] CLAR-RR-005 *(new — design-time, non-blocking)* — Which of `ToolCallRenderer`'s ~14 specialised
      expanded renderers are P2 vs deferred. pm recommendation: generic expanded renderer + Write/Edit
      diff in P2; niche ones (web-search links, tool-search, agent-lifecycle JSON) deferable. Owner:
      ux-ui-designer/architect.
- [ ] CLAR-RR-006 *(new — design-time, non-blocking)* — Thinking brand colour: drive from `--sp-accent`
      (optional `[data-provider]` aliasing), not Claudian's hardcoded `#D97757`/compact cyan `#5bc0de`
      (charter §1, NFR-RR-007). Owner: ux-ui-designer/brand-reviewer.
