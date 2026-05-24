---
feature: rich-rendering
area: RR
current_stage: specification
status: active
last_updated: 2026-05-24
last_agent: architect (design)
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
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
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
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
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
```

## Open clarifications

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
