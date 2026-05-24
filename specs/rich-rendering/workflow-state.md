---
feature: rich-rendering
area: RR
current_stage: implementation
status: active
last_updated: 2026-05-25
last_agent: dev (CLAR-RR-009 real-CLI P2 reducer defect fix)
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
  implementation-log.md: in-progress (domain-foundation T-RR-001..007, 039 + infra T-RR-008..011 + application T-RR-012..021 + ui batch 1 T-RR-022..030 + ui batch 2 T-RR-031..038 + wire-in T-RR-040..042 done; surface-integration fixes — Gap 1 UsageInfo wire-in DONE [046a0fe], Gap 2 SubagentBlock RESOLVED via CLAR-RR-008 [QA assertion 720b390 + 4-file fix 0fcf123]; T-RR-044 verify gate GREEN [npm run verify: 652 unit, coverage 96.09/89.07/91.56/96.51; npm run test:all: 88 files/653] + styles.css regenerated + deployed to D:/TestVault + draft PR #436 into next opened; T-RR-043 [MANUAL real-Obsidian backing + rich CLI turn, human-owned] + parity screenshots [#434 + P2 states] remain before merge; CLAR-RR-009 real-CLI P2 reducer defect FIXED [RED 96fe4e3 + GREEN d4aefd4 — the production reduceClaudeStream was P1-scope and never emitted P2 chunks from the real claude --output-format stream-json CLI; now maps assistant tool_use/thinking + user tool_result], re-run T-RR-044 to absorb it; the separate markdown-render defect [async MarkdownRenderPort] stays orchestrator-owned)
  test-plan.md: in-progress (TESTPLAN-RR-001; baseline reference + TEST-RR-026 dev leg PASS [T-RR-042] + manual TEST-RR-026 / T-RR-043 M leg scheduled)
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
| 7. Implementation | `implementation-log.md` + code | in-progress (domain-foundation T-RR-001..007, 039 + infra T-RR-008..011 + application T-RR-012..021 + ui batch 1 T-RR-022..030 + ui batch 2 T-RR-031..038 + wire-in T-RR-040..042 done; surface-integration fixes — Gap 1 UsageInfo wire-in DONE [046a0fe], Gap 2 SubagentBlock RESOLVED via CLAR-RR-008 [720b390 + 0fcf123]; gate T-RR-043 [MANUAL, human-owned] + T-RR-044 [verify + PR, orchestrator] remain) |
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
2026-05-25 (dev, implement -- ui batch 1): Executed UI BATCH 1 (T-RR-022..030, SPEC-RR-020/021/024/025/
                          026/027/028) on feature/rich-rendering with strict TDD, one Conventional commit
                          per task. COMPLETED (in order): T-RR-022 RED chatStore P2 sink-leg tests (23
                          cases, TEST-RR-005/006/007/009 store legs, watched fail "store.onToolUse is not
                          a function", bc1ae57) -> T-RR-023 chatStore P2 legs -- onToolUse(+tool_use
                          block, merge-on-repeat, Task/Agent seeds SubagentInfo)/onToolResult(+computeDiff
                          Write/Edit)/onToolOutput/onThinking/onText(ordered block, REQ-RR-011)/subagent
                          legs(spawn-id correlation, consolidateSubagent)/onContextCompacted/onNotice;
                          EC-RR-1/2/9 -> LoggerPort.warn+ignore (no buffer); no-op when not streaming;
                          $reset clears P2 state; ChatSurface binds useLoggerPort() (109a655); T-RR-024
                          useIconPort() inject-or-throw (270aac8); T-RR-025 RED SpCollapsible+SpIcon (11
                          cases, TEST-RR-010/011/024 A leg, 435fea9) -> T-RR-026 useCollapsible+
                          SpCollapsible.vue (WCAG 2.2 AA collapsible, logical-property rail tokens,
                          reduced-motion/forced-colors) + SpIcon.vue (recursive h() VNode tree, wrench
                          fallback, aria-hidden, no v-html) (77af3ad); T-RR-027 RED ToolCallBlock+TodoList
                          (8 cases, TEST-RR-013/015/017 A leg, 0fe655e) -> T-RR-028 ToolCallBlock.vue
                          (token status + aria-label, escaped pre-wrapped body -- <script> verbatim,
                          REQ-RR-020a) + TodoList.vue (renderTodos rows, EC-RR-6) + pure toolIcon() added
                          to toolPresentation (5ddd4a9); T-RR-029 RED ThinkingBlock (4 cases, fake timers,
                          TEST-RR-016, 8a65287) -> T-RR-030 ThinkingBlock.vue (live "Thinking Ns" 1s
                          interval, finalise freezes "Thought for Ns" + auto-collapse, interval cleared
                          on finalise+unmount EC-RR-7, MarkdownBlock body) (f2985fe).
                          BATCH-END STATE: npm run typecheck -> 0 errors; npm run lint -> 0 errors (3
                          pre-existing warnings only); full unit suite 612/612 across 79 files (was
                          566/566x73 -- +46 from 6 new test files). DEVIATIONS (both spec-faithful):
                          (1) chatStore gained an OPTIONAL third bindTurnRunner arg logger:LoggerPort
                          (defaults to a no-op) for the section-8 degrade warns without importing obsidian
                          -- the wire-in the application batch anticipated; ChatSurface passes
                          useLoggerPort(). (2) toolIcon() added to toolPresentation.ts mapping tool names
                          to the P2 static icon-name set (file/terminal/search/bot/wrench) since claudian's
                          richer lucide names exceed iconNodeMap; additive, no prior assertion changed.
                          Subagent correlation: a Task/Agent onToolUse establishes the SubagentInfo on the
                          spawning ToolCall (id = spawn tool id) so subagentId/agentId correlate to it --
                          no separate registry action (SubagentInfo rides the reactive ToolCall.subagent
                          DTO, ADR-003); $reset clears it via the cleared messages. NOT pushed;
                          manifest.json untouched; no new dependency; full verify/build/build:web/coverage/
                          audit deferred to the T-RR-044 gate. NEXT BATCH (UI batch 2, SPEC-RR-029..032):
                          FIRST TASK = T-RR-031 (qa RED -- WriteEditBlock.vue + DiffView.vue PageObjects:
                          per-line declarative diff spans with gutter + --sp-diff-* token backgrounds,
                          NEW_FILE_DISPLAY_CAP=20 truncation footer EC-RR-5, non-zero +N/-N stat chip,
                          no-diffData generic body EC-RR-3), greened by T-RR-032. Then T-RR-033/034
                          (SubagentBlock), T-RR-035/036 (MessageBlocks dispatcher + MessageTurn fork +
                          ContextCompactedBlock/UsageInfo), T-RR-037/038 (wire-in + remaining).
2026-05-25 (dev, implement -- ui batch 2): Executed UI BATCH 2 (T-RR-031..038, SPEC-RR-029/030/031/
                          032/022/023) on feature/rich-rendering with strict TDD, one Conventional
                          commit per task (RED watched to fail on the missing-component import before
                          each impl greened it). COMPLETED (in order): T-RR-031 RED WriteEditBlock +
                          DiffView (13 cases, TEST-RR-019; two test-authoring literals corrected in the
                          local RED commit -- the U+2212 minus gutter glyph and a raw-textContent
                          single-space assertion, c1dfe7b) -> T-RR-032 DiffView.vue (per-line
                          declarative gutter+text spans, --sp-diff-* token backgrounds, no
                          strikethrough, NEW_FILE_DISPLAY_CAP=20 footer EC-RR-5) + WriteEditBlock.vue
                          (SpCollapsible header + non-zero +N/-N stat chip REQ-RR-027 + DiffView body,
                          generic body when no diffData EC-RR-3) (306b605); T-RR-033 RED SubagentBlock
                          (6 cases, TEST-RR-020; expandAll PageObject re-queries nested headers across
                          passes, 1937e1d) -> T-RR-034 SubagentBlock.vue (accent bot icon, collapsible
                          prompt/result/tools, nested ToolCallBlock at --sp-font-size-xs, async pill
                          named+coloured via --sp-state-* from resolveSubagentLifecycle, sync->inline
                          no pill, EC-RR-10/11) (b6add34); T-RR-035 RED UsageInfo + ContextCompactedBlock
                          (6 cases, TEST-RR-004/022/025, a879220) -> T-RR-036 UsageInfo.vue (turn-level,
                          reads chatStore.usage, tokens + ~percentage + optional model, renders nothing
                          when null EC-RR-12, not the P6 meter) + ContextCompactedBlock.vue (static
                          render-only notice NG1) (d413954); T-RR-037 RED MessageBlocks dispatcher +
                          MessageTurn fork (13 cases incl. the P1 MessageTurn.test.ts staying green,
                          TEST-RR-008/023, bddff93) -> T-RR-038 MessageBlocks.vue (ordered dispatch per
                          block kind, Write/Edit->WriteEditBlock, dangling tool_use/subagent ref renders
                          nothing EC-RR-1, data-block-kind order assertable) + MessageTurn.vue fork
                          (contentBlocks->MessageBlocks else P1 MarkdownBlock/content path EC-RR-13,
                          streaming attr + Interrupted badge + dir=auto unchanged) (2f8256a).
                          BATCH-END STATE: npm run typecheck -> 0 errors; npx eslint every touched file
                          -> 0 errors/0 warnings; full unit suite 647/647 across 85 files (was 612/612
                          x79 -- +35 from 6 new test files). The P1 MessageTurn.test.ts (7) +
                          ChatSurface.test.ts stay green. DEVIATION (CLAR-RR-007, spec-faithful, within
                          ADR-RR-001): the MessageTurn fork exposed that onText pushes a text block (so
                          contentBlocks exists once any text streams and the fork routes to
                          MessageBlocks), but the P1 onErrorChunk/onNotice legs append inline text to
                          message.content ONLY -- so the inline error/notice text became invisible under
                          the fork (caught by the existing P1 ChatSurface TEST-CC-013 A leg
                          "partial [failed]"). Fix: extracted _extendTextBlock from onText; onErrorChunk/
                          onNotice now ALSO extend the trailing text block WHEN the live message already
                          renders via blocks (contentBlocks !== undefined) -- a pure-P1 turn keeps the
                          plain content-only path. Preserves the ADR-CC-001 §1 streaming-error boundary
                          (still the {type:'error'} chunk) + REQ-RR-011 order; the P1 store test
                          onErrorChunk ('partial boom') stays green. Touches chatStore.ts (T-RR-023
                          territory) only as needed for the T-RR-038 fork not to regress P1 (the task's
                          explicit DoD). NOT pushed; manifest.json untouched; no new dependency; full
                          verify/build/build:web/docs:api/coverage/audit deferred to the T-RR-044 gate.
                          NEXT BATCH (WIRE-IN, SPEC-RR-021 provide + demo): FIRST TASK = T-RR-040 (qa
                          RED -- assert ICON_PORT provided from bridge.createIconPort() alongside the
                          existing ports in AgentSidebarView + src/ui/main.ts, and a mounted
                          MessageBlocks/ToolCallBlock resolves icons through it; tests/ui/chat/
                          mount.rr.test.ts or the extended P1 mount test), greened by T-RR-041 (provide
                          ICON_PORT + demo wiring). Then T-RR-042 (npm run dev rich smoke, TEST-RR-026
                          dev leg, qa). Then the GATE: T-RR-043 (MANUAL Obsidian MarkdownRenderer/setIcon
                          backing + real-CLI rich turn -- human-owned, never agent-self-claimed) +
                          T-RR-044 (full verify + parity #434 + draft PR into next).
2026-05-24 (dev, implement -- wire-in batch): Executed the WIRE-IN batch (T-RR-040..042,
                          SPEC-RR-021 provide + demo) on feature/rich-rendering with strict TDD, one
                          Conventional commit per task. COMPLETED (in order): T-RR-040 RED
                          tests/ui/chat/mount.rr.test.ts -- asserts BOTH entry points provide
                          ICON_PORT from bridge.createIconPort() by mounting the real surface against
                          MockBridge, streaming the default scripted rich turn, and proving a
                          ToolCallBlock resolves its SpIcon through the injected port (SVG under
                          sp-icon). Watched fail RED for the right reason: "IconPort was not provided"
                          thrown by SpIcon.useIconPort() -> ErrorBoundary swallows -> no
                          message-blocks/sp-icon (5bc322d). T-RR-041 -- app.provide(ICON_PORT,
                          bridge.createIconPort()) added ADDITIVELY alongside the existing ports in
                          BOTH src/plugin/AgentSidebarView.ts and src/ui/main.ts, mirroring the P1
                          CHAT_RUNTIME_PORT/MARKDOWN_RENDER_PORT wiring (T-CC-029); docblocks updated;
                          T-RR-040 -> GREEN (f1ee7d4). T-RR-042 -- tests/ui/main.rr.test.ts standalone
                          rich-render smoke (TEST-RR-026 dev leg): drives the default rich turn through
                          src/ui/main + MockBridge, expands the collapsibles, asserts thinking-block +
                          tool-call-header + write-edit-header + diff-line + todo-list mount and the
                          icon resolves as declarative SVG (no v-html, no injected <script>); result
                          recorded in test-plan.md (8cd4212).
                          BATCH-END STATE: npm run typecheck -> 0 errors; npx eslint every touched file
                          -> 0 errors/0 warnings; the new rr tests 3/3; the P1 mount/standalone tests
                          stay green (tests/ui/chat/mount.test.ts, tests/ui/main.test.ts,
                          tests/plugin/* -- 5/5 re-run); full unit suite re-run 554/554 across 73 files
                          (dot reporter), no regression -- every existing provide + assertion intact,
                          the ICON_PORT provide is purely additive. DEVIATION (in-scope, recorded in
                          test-plan.md + the T-RR-042 test docblock): the TEST-RR-026 dev leg does NOT
                          assert the SUBAGENT and USAGE visual renderers. The default MockChatRuntime
                          script emits the subagent as bare subagent_tool_use/subagent_tool_result/
                          async_subagent_result chunks with NO preceding Task/Agent tool_use, so the
                          store (T-RR-023) never seeds a top-level {type:'subagent'} content block (it
                          has no subagent-block-pushing leg -- the subagent rides a spawning
                          ToolCall.subagent), and the MessageBlocks dispatcher therefore never mounts a
                          SubagentBlock from this script; UsageInfo.vue (T-RR-036) reads
                          chatStore.usage but is not yet mounted into the surface tree. Both paths are
                          stored/handled and covered by the store + component unit suites (T-RR-022/023,
                          T-RR-033/034, T-RR-035/036) -- their SURFACE wire-in is out of the P2 WIRE-IN
                          batch scope (T-RR-040..042 cover only the ICON_PORT provide + the dev smoke).
                          No prior-batch store/script/component was modified (no regression risk). NOT
                          pushed; manifest.json untouched; no new dependency; full verify/build/
                          build:web/docs:api/coverage/audit + test:all + parity #434 + the draft PR into
                          next are the T-RR-044 GATE, run by the ORCHESTRATOR (not this dev agent).
                          REMAINING: T-RR-043 (MANUAL -- Obsidian MarkdownRenderer/setIcon backing +
                          real-CLI rich turn, the M leg of TEST-RR-026; HUMAN-OWNED, never
                          agent-self-claimed; scheduled in test-plan.md) and T-RR-044 (the verify gate +
                          draft PR, ORCHESTRATOR-owned).
2026-05-25 (dev, implement -- surface-integration fixes): Closed the two surface gaps the WIRE-IN batch
                          deviation flagged out-of-scope. Strict TDD, one Conventional commit per fix.
                          GAP 1 (REQ-RR-024, SPEC-RR-031) -- DONE: UsageInfo.vue was orphaned (unit-tested
                          T-RR-036 but mounted in NO live view). RED extended tests/ui/chat/ChatSurface.test.ts
                          (+ PageObject showsUsage/usageText) to assert a usage chunk renders usage-info via
                          the mounted surface -- watched fail (usage-info absent), mounted
                          <UsageInfo class="sp-chat-surface__usage"/> as a turn-level footer row below
                          MessageList / above the composer in ChatSurface.vue (DESIGN-RR-001 A.1.1 "usage --
                          turn-level, not a content block"), watched GREEN. UsageInfo reads chatStore.usage
                          itself (no props/getter) + renders nothing when null (REQ-RR-024a/EC-RR-12). One
                          test-data fix in my own RED: the emitted usage chunk sessionId='mock-session' to
                          clear the use case EC-11 foreign-session guard (no assertion change). ChatSurface
                          8/8; tests/ui/chat + main.rr + main.test 102/102 across 22 files, no regression.
                          SHA 046a0fe.
                          GAP 2 (NFR-RR-002 parity, SPEC-RR-004/005/006/020/022, claudian StreamController
                          :1008) -- BLOCKED on a QA assertion. Verified the spec-correct fix end-to-end:
                          for a Task/Agent spawn the store's onToolUse must push {type:'subagent',subagentId:id}
                          (NOT {type:'tool_use'}) so MessageBlocks routes to SubagentBlock (parity
                          recordSubagentInMessage); + the Mock/Fixture default scripts must emit a
                          tool_use(Task) seeding the subagent before the subagent_tool_*/async_subagent_result
                          chunks (correlate by spawn id). With the 4-file fix applied, MockChatRuntime.rr +
                          main.rr 9/9 (the standalone smoke mounts SubagentBlock + usage-info end-to-end) and
                          the store rr suite 22/23. The ONE failing prior-P2 test is tests/ui/stores/
                          chatStore.rr.test.ts:271, which pins the OLD defect behaviour
                          (filter b.type==='tool_use' toHaveLength 1) -- the spec-correct change makes the
                          spawn push a subagent block, so that filter sees 0. The test's INTENT ("only the
                          spawning Task produces one top-level block") is preserved; only the literal
                          b.type==='tool_use' predicate contradicts spec+parity. Changing a QA-owned assertion
                          is QA's job (agent boundary) -- so the Gap-2 source+test changes were REVERTED to keep
                          the tree green for the T-RR-044 gate, and Gap 2 is handed back via CLAR-RR-008 with
                          the full ready-to-apply fix recorded in implementation-log.md.
                          BATCH-END STATE: npm run typecheck -> 0 errors; npx eslint on the Gap-1 touched files
                          -> 0/0; chatStore.rr 23/23 (post-revert); P1 + prior-P2 suites unchanged (Gap-1 mount
                          is purely additive). NOT pushed; manifest.json untouched; no new dependency; full
                          verify/build/build:web/docs:api/coverage/audit + test:all + parity #434 + the draft PR
                          into next are the T-RR-044 GATE (ORCHESTRATOR-owned). Gap 1 completes the live
                          UsageInfo wiring; once CLAR-RR-008 is reconciled and Gap 2 lands, the T-RR-044 verify
                          gate + the human T-RR-043 manual leg can run.
                          HAND-OFF -> qa (+ architect): reconcile chatStore.rr.test.ts:271 to assert one
                          {type:'subagent'} top-level block (or "exactly one top-level block" type-agnostically),
                          then dev lands the 4-file Gap-2 fix in one feat(rr) commit; architect optionally notes
                          the Task/Agent -> subagent-block routing in the SPEC-RR-020 onToolUse table.
2026-05-24 (dev, CLAR-RR-008 resolution): RESOLVED CLAR-RR-008 per the orchestrator decision (SPEC +
                          claudian-parity-correct behaviour WINS over the defect-pinning test). TDD: (1)
                          reconciled the QA assertion in tests/ui/stores/chatStore.rr.test.ts -- a Task/Agent
                          spawn pushes exactly one top-level {type:'subagent', subagentId} block (0 tool_use
                          blocks for the Task); a nested onSubagentToolUse adds NO top-level block (it lands
                          under the spawn's subagent.toolCalls); the SubagentInfo is still seeded + findable on
                          the spawning ToolCall. Watched RED 2/24 fail against the defect store (tool_use vs
                          subagent diff). SHA 720b390. (2) Re-applied the verified 4-file fix: chatStore.ts
                          onToolUse pushes a {type:'subagent'} block (+ keeps the SubagentInfo seeding) for
                          Task/Agent spawns; MockChatRuntime.ts DEFAULT_SCRIPT emits a tool_use(Task,
                          id:'mock-agent-1') spawn before the subagent_tool_*/async_subagent_result chunks;
                          FixtureChatRuntime.ts gains the Task(id:'fixture-agent-1') spawn + nested tool +
                          async result; main.rr.test.ts asserts subagent-block + usage-info mount from the
                          default script (stale out-of-scope NOTE replaced). Watched GREEN. SHA 0fcf123. (3)
                          Confirmed MessageBlocks.resolveSubagent resolves the seeded SubagentInfo for the new
                          subagent block (MessageBlocks.test.ts "routes a subagent block to SubagentBlock" +
                          the main.rr standalone smoke both mount SubagentBlock end-to-end). GATE: typecheck 0;
                          eslint 0/0 on the 5 touched files; touched suites (chatStore.rr + main.rr +
                          MessageBlocks + MockChatRuntime.rr + FixtureChatRuntime.rr) 44/44; P1 runtime tests
                          20/20; full tests/ui + tests/infrastructure + tests/application regression 435/435
                          across 56 files, no P1/P2 regression. Within ADR-RR-001 (the subagent ContentBlock
                          member already exists -- no new type/seam); NO v-html; <script setup>; --sp-*; Vue
                          never imports obsidian. NOT pushed; manifest untouched; no new dependency. Full
                          verify/build/build:web/docs:api/coverage/audit/test:all + parity #434 + the draft PR
                          into next are the T-RR-044 GATE (ORCHESTRATOR-owned) -- NOT run here.
                          HAND-OFF -> orchestrator (T-RR-044 verify gate + draft PR into next) and the human
                          (T-RR-043 MANUAL Obsidian MarkdownRenderer/setIcon backing + real-CLI rich turn). Both
                          P2 surface gaps (UsageInfo wiring + SubagentBlock routing) are now closed; the dev
                          implementation work for P2 is complete pending those two owner-specific legs.
                          Verification performed: typecheck + the 5 touched vitest suites + the 435-test
                          ui/infra/application regression (all green). Remaining owner: orchestrator (T-RR-044),
                          human (T-RR-043). Next agent: orchestrator.
2026-05-25 (dev, DEFECT FIX -- real-CLI P2 reducer gap, CLAR-RR-009): Fixed a P2 defect found in
                          real-Obsidian testing. The production NDJSON->StreamChunk reducer
                          (src/infrastructure/obsidian/reduceClaudeStream.ts) was authored at P1 scope and
                          never extended for P2 -- it mapped only text/usage/done/error. Against the REAL
                          claude --output-format stream-json CLI, assistant tool_use/thinking blocks and user
                          tool_result events never became StreamChunks, so NO tool-call/thinking blocks
                          rendered on the real path (only text). The Mock/Fixture scripts emit those chunks
                          directly, so every unit test + the npm run dev smoke (T-RR-042) + the demo passed --
                          the reducer is the ONLY P1 seam they bypass. STRICT TDD: RED (96fe4e3) added 10
                          canned-event cases to reduceClaudeStream.test.ts (assistant tool_use ->tool_use
                          chunk incl. {} input default; thinking/redacted_thinking ->thinking; text+tool_use
                          order preserved; user tool_result ->tool_result with string AND [{type:text}] array
                          content + is_error + structuredPatch toolUseResult + omit-when-absent; unknown
                          stream_event ->[]) -- watched fail 10/15 for the right reason (reducer emitted
                          nothing for the P2 kinds; the 14 P1 reduce tests + the forward-compatible default
                          stayed GREEN). GREEN (d4aefd4): added case 'user' to the switch + _reduceUser
                          (tool_result blocks -> {type:'tool_result', id, content, isError, toolUseResult?});
                          extended _reduceAssistant via a _reduceAssistantBlock helper (complexity<=10) to map
                          tool_use (input coerced to object) + thinking/redacted_thinking alongside text +
                          the at-most-once assistant_message_start, order preserved; pure module helpers
                          toInputObject/toToolUseResult/extractToolResultContent/isTextBlock/safeStringify
                          mirroring claudian transformClaudeMessage + core/tools/toolResultContent (string
                          passthrough / text-block array newline-join / JSON fallback). Default branch stays
                          forward-compatible; reduce stays pure/total/never-throws (NFR-RR-003). GATE: reducer
                          test 25/25 (14 P1 + 1 default + 10 new P2); npm run typecheck 0; eslint on the
                          reducer + its test 0/0; full tests/infrastructure regression 168/168 across 16
                          files, no regression. No new dependency (claudian logic reproduced inline as pure
                          helpers, NFR-RR-013); no obsidian/node:* import (the reducer is pure data); within
                          ADR-RR-001/ADR-CC-001 (the P2 StreamChunk members already exist -- no new
                          type/seam). NOT pushed; manifest.json untouched. Full verify/build/build:web/
                          test:all are the T-RR-044 GATE (orchestrator-owned), NOT run here. Commits: 96fe4e3
                          (RED), d4aefd4 (fix GREEN). OUT OF SCOPE (orchestrator handles separately): the
                          markdown-rich-rendering defect (the async MarkdownRenderPort issue in the Obsidian
                          backing) is a distinct fix, NOT addressed here.
                          HAND-OFF -> orchestrator: re-run the T-RR-044 verify gate to absorb the reducer fix
                          (the touched-surface gate is green; the full verify/build/test:all + the markdown-
                          render defect remain orchestrator-owned). Verification performed here: typecheck +
                          the reducer vitest suite (25/25) + the 168-test infrastructure regression (all
                          green). Remaining owner: orchestrator (T-RR-044 + the separate markdown-render
                          defect), human (T-RR-043 manual real-Obsidian leg). Next agent: orchestrator.
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
- [ ] CLAR-RR-007 *(new — implementation deviation, 2026-05-25 dev, ui batch 2, non-blocking)* — The
      `MessageTurn` blocks-vs-content fork (SPEC-RR-023) exposed that the P1 `onErrorChunk`/`onNotice`
      legs append their inline text to `message.content` ONLY, so once `onText` has created a
      `contentBlocks` text block the fork routes to `MessageBlocks` and the inline error/notice text
      becomes invisible (caught by the P1 `ChatSurface` `TEST-CC-013 A leg`). T-RR-038 resolves it by
      having `onErrorChunk`/`onNotice` also extend the trailing text block **when the live message
      already renders via blocks** (`contentBlocks !== undefined`), leaving the pure-P1 content-only
      path untouched. Stays within ADR-RR-001 (sink render/degrade policy; no type/seam change) and
      preserves the ADR-CC-001 §1 streaming-error boundary + REQ-RR-011 order. The spec table
      (SPEC-RR-019/020) marks `onErrorChunk`/`onNotice` as P1 legs "unchanged"; this reconciliation is
      the minimal additive change the fork requires. **Confirm at review whether the spec table should
      note the block-mirroring leg explicitly. Owner: architect/reviewer.**
- [x] CLAR-RR-008 *(RESOLVED 2026-05-24 — orchestrator decision + dev implementation)* — A `Task`/`Agent`
      spawn must render as a top-level `{type:'subagent', subagentId}` content block (so `MessageBlocks`
      routes it to `SubagentBlock`), per SPEC-RR-004/022 and claudian
      `StreamController.recordSubagentInMessage` (`:1008` pushes `{type:'subagent', subagentId: toolId}`,
      NOT a `tool_use` block). **DECISION (orchestrator, authoritative):** the SPEC + claudian-parity
      behaviour WINS over the test that pinned the old defect; dev was authorised to update the QA
      assertion. **RESOLUTION:** the QA assertion in `tests/ui/stores/chatStore.rr.test.ts` was
      reconciled (a `Task`/`Agent` spawn pushes exactly one top-level `{type:'subagent'}` block, 0
      `tool_use` blocks; a nested `onSubagentToolUse` adds NO top-level block) — RED watched, SHA
      `720b390`. The 4-file fix (`chatStore.ts` `onToolUse` pushes the `subagent` block + keeps the
      `SubagentInfo` seeding; `MockChatRuntime.ts` + `FixtureChatRuntime.ts` default scripts emit a
      `Task` spawn before the subagent chunks; `main.rr.test.ts` asserts `subagent-block` + `usage-info`
      mount) greened it — SHA `0fcf123`. `MessageBlocks.resolveSubagent` resolves the seeded
      `SubagentInfo` for the new block (`MessageBlocks.test.ts` + the `main.rr` standalone smoke both
      mount `SubagentBlock`). Stays within ADR-RR-001 (the `subagent` `ContentBlock` member already
      exists — no new type/seam). Architect MAY note the Task/Agent → `subagent`-block routing in the
      SPEC-RR-020 `onToolUse` table (optional, non-blocking).
- [x] CLAR-RR-009 *(RESOLVED 2026-05-25 — dev, real-Obsidian defect fix)* — The production NDJSON→
      `StreamChunk` reducer (`src/infrastructure/obsidian/reduceClaudeStream.ts`) was authored at **P1
      scope** and never extended for P2: it mapped only `text`/`usage`/`done`/`error`. Against the REAL
      `claude --output-format stream-json` CLI, assistant `tool_use`/`thinking` blocks and `user`
      `tool_result` events never became `StreamChunk`s, so NO tool-call/thinking blocks rendered on the
      real path (only text). The Mock/Fixture scripts (T-RR-010) emit those chunks directly, so every
      unit test + the `npm run dev` smoke (T-RR-042) + the demo passed — the reducer is the only P1 seam
      they bypass. **RESOLUTION:** extended `_reduceAssistant` (tool_use/thinking) + added `_reduceUser`
      (tool_result, string OR `[{type:'text',text}]` array content, `is_error`, structured
      `toolUseResult`) mirroring claudian `transformClaudeMessage`/`extractToolResultContent`; the reduce
      stays pure/total/never-throws, the `default` branch stays forward-compatible. RED `96fe4e3` (10
      cases watched fail) → GREEN `d4aefd4`. Within ADR-RR-001/ADR-CC-001 (the P2 `StreamChunk` members
      already exist — no new type/seam). **Separate (orchestrator-owned, NOT this fix):** the
      markdown-rich-rendering defect (the async `MarkdownRenderPort` issue in the Obsidian backing).
