---
feature: rich-rendering
area: RR
current_stage: idea
status: active
last_updated: 2026-05-24
last_agent: orchestrator (P2 bootstrap)
epic: claudian-reboot
phase: P2
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: pending
  research.md: pending
  requirements.md: pending
  design.md: pending
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

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | pending |
| 2. Research | `research.md` | pending |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
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
```

## Open clarifications

- [ ] CLAR-RR-001 — Idea/research depth: thin `idea.md` vs charter §3.1 + audits standing in (mirror P1)?
- [ ] CLAR-RR-002 — `StreamChunk` additive members final shape (thinking/tool_use/tool_result/
      tool_output/context_compacted/subagent) vs `claudian-main` `chat.ts:137` — bless the union growth.
- [ ] CLAR-RR-003 — Render seam: one `MessageBlockRenderer` component tree vs per-type components;
      does the minimal `MarkdownRenderPort` (P1) need the Obsidian `MarkdownRenderer` backing now (P2,
      per CLAR-CC-005's "defer to P2")?
