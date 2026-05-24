---
feature: mcp-host-side-proposals
area: MHP
current_stage: tasks
status: active
last_updated: 2026-05-24
last_agent: architect
artifacts:
  idea.md: complete
  research.md: complete
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — mcp-host-side-proposals

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | complete |
| 3. Requirements | `requirements.md` | complete |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Section semantics + status enums: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

_None yet._

## Blocks

_None._

## Hand-off notes

```
2026-05-24 (orchestrator): Feature bootstrapped. Existing discovery artifacts
                           live under discovery/obsidian-cli-mcp-expansion/
                           (SYNTHESIS.md is the entry point) — analyst should
                           cite them as upstream evidence during /spec:research.
2026-05-24 (analyst):      idea.md complete; gate PASS. Open CLARs MHP-002/
                           003/004 carried forward to research with current
                           resolution status noted. Researcher should converge
                           on tier-policy thresholds (CLAR-MHP-002) and
                           confirm webviewer carve-out (CLAR-MHP-003) before
                           handoff to PM. Q4–Q7 added in idea.md surface
                           audit-log format, tool naming, system-prompt
                           addendum, DevTools settings ergonomics as new
                           research-stage gaps.
2026-05-24 (analyst):      research.md complete; gate PASS. All 7 research
                           questions answered. Webviewer carve-out confirmed
                           (CLAR-MHP-003 closed). DevTools threat-model text
                           ready for ADR-019 (CLAR-MHP-004 closed). New
                           CLAR-MHP-005 surfaced: proposal-queue ephemerality
                           on plugin restart — recommend ephemeral v1 with
                           shutdown logging; PM to confirm. New risks
                           RISK-MHP-001..008 documented; PM should map to
                           requirements (esp. RISK-MHP-001 dual-accept race,
                           RISK-MHP-008 system-prompt-addendum drift). Tool
                           naming verdict: `workflow_proposal_*` namespace.
2026-05-24 (pm):           requirements.md complete; 40 REQs + 14 NFRs + 6
                           JTBDs. Gate FAIL on 2 open CLARs. CLAR-MHP-005
                           closed by REQ-MHP-038 (ephemeral v1 + shutdown
                           audit rows). New CLAR-MHP-006 surfaced: client
                           identification mechanism (`x-mcp-client-name`
                           header vs MCP-native `clientInfo.name` from
                           initialize). REQ-MHP-014 deny-list explicitly
                           EXCLUDES the 8 DevTools commands (CLAR-MHP-004
                           user override over SYNTHESIS deny-list).
                           Recommend `/spec:clarify` to resolve CLAR-MHP-002
                           (user signoff on REQ-MHP-009) and CLAR-MHP-006
                           before `/spec:design`.
2026-05-24 (pm-clarify):   12 new CLARs surfaced (CLAR-MHP-007..018) against
                           the PRD. Ambiguity profile: 3 missing-quantifier,
                           3 missing-error-path, 2 missing-settings-defn, 2
                           file-system semantics, 1 active-slug rule, 1
                           UX surfacing. No PRD rewrite recommended.
2026-05-24 (orchestrator): All 14 open CLARs resolved (user signoff on
                           judgment calls -002/-006/-017; defaults accepted
                           on the remaining 11). Architect MUST apply the
                           resolution wording into requirements.md during
                           /spec:design: (a) reword REQ-MHP-013, -027, -030,
                           -031, -034, -038 and NFR-MHP-003 per resolutions;
                           (b) add new REQs for CLAR-MHP-007 (active-slug
                           rule), -009 (write-tool response shape), -010
                           (devtoolsAutoAcceptLowRisk setting), -011
                           (post-accept failure path), -013 (error-row
                           triggers), -017 (NotificationPort + status-bar).
                           Stage 3 gate now PASS.
2026-05-24 (ui-designer):  design.md Part B complete. 26 UI states enumerated
                           across 6 surfaces (settings DevTools section,
                           confirm modal, status bar, notices, existing
                           FileWriteProposalCard, new AutoAcceptReceipt).
                           Three NEW components introduced and justified:
                           (a) DevToolsEnableConfirmModal (Obsidian Modal
                           subclass; parameterised by tool + verbatim threat
                           paragraph; mod-warning destructive primary, no
                           Enter-default, triangle-alert glyph); (b)
                           AutoAcceptReceipt.vue (compact muted row inside
                           the agent's message bubble for F2 silent auto-
                           accept and S26 DevTools-low-risk auto-accept);
                           (c) DevToolsToggleRow helper on
                           SpecoratorSettingTab (skeleton for the 5 high-
                           risk per-tool rows). FileWriteProposalCard.vue
                           gets ONE additive change (S24): a
                           proposal-card-decided-elsewhere note rendered
                           inside existing accepted/rejected terminal states
                           when the deciding client.id !== self — satisfies
                           the F3 cross-surface invariant without adding a
                           5th render state. Status-bar item is plain text
                           "MCP: N pending" (no pill, no animation, hidden
                           at N=0, absolute integer up to queue cap 1000 —
                           no "99+" truncation). 1 NEW token proposed:
                           --sp-status-bar-glyph-size; zero new colour
                           tokens (theme-robustness). NFR-MHP-011 contrast
                           assertions made for 7 token combos; disabled
                           per-tool toggle row keeps label at
                           var(--text-normal) full strength (not muted
                           ghost) to stay ≥4.5:1 — non-interactivity is
                           carried by the toggle's own disabled state +
                           aria-disabled + helper text "Enable DevTools
                           first." Microcopy: ~40 verbatim strings written
                           (settings, modal, notices, status bar, two new
                           i18n keys for the card update, three new i18n
                           keys for AutoAcceptReceipt). Confirm-modal threat
                           text NOT duplicated in design.md — sourced from
                           research.md §Q3 at impl time (ADR-019 will
                           codify). Hand-offs to architect (Part C): (a)
                           proposalDecided event contract that the modified
                           FileWriteProposalCard subscribes to for S24;
                           (b) confirm where the per-tool risk summaries +
                           threat paragraphs live as a TS constant so the
                           settings row and confirm modal share one source.
                           No new CLARs surfaced; no Part A flow revisions
                           requested.
2026-05-24 (architect):    design.md Part C complete and cross-cutting
                           requirements-coverage table closed (60 rows:
                           REQ-MHP-001..046 + NFR-MHP-001..014). ADR-019
                           authored at docs/adr/ADR-019-mcp-tier-policy-and-
                           devtools-opt-in.md (status: proposed). Tier policy,
                           verbatim deny-list, DevTools opt-in matrix, and
                           per-tool threat paragraphs codified (verbatim from
                           research.md §Q3). requirements.md edited per
                           orchestrator hand-off: rewords on REQ-MHP-013/-027/
                           -030/-031/-034/-038 + NFR-MHP-003; six new REQs
                           added (REQ-MHP-041 active-feature slug resolution
                           per CLAR-MHP-007; REQ-MHP-042 write-tool response
                           shape + queue cap per CLAR-MHP-009; REQ-MHP-043
                           devtoolsAutoAcceptLowRisk per CLAR-MHP-010;
                           REQ-MHP-044 post-accept failure path per
                           CLAR-MHP-011; REQ-MHP-045 exhaustive error-row
                           triggers per CLAR-MHP-013; REQ-MHP-046
                           NotificationPort + status-bar surfacing per
                           CLAR-MHP-017). Five new architecture-level risks
                           surfaced (RISK-MHP-011..015) beyond the 10 from
                           research.md: EventBus listener leak (card unmount
                           hygiene); StatusBar dispose race; per-id-mutex
                           re-entrance; audit-row drop on graceful shutdown
                           500 ms budget; threat-paragraph three-way drift
                           (ADR-019 Part 4 / research.md §Q3 / runtime TS
                           constant). Hand-offs to planner (Tasks): (a) define
                           baselines for NFR-MHP-001/-002/-003 as the FIRST
                           task before any new code path lands; (b) the
                           sidepanel-prompt-assembly hook for
                           SystemPromptAddendumProvider needs an exact source
                           file path — current sidepanel prompt-assembly code
                           was not located during Part C drafting (the
                           SystemPromptAddendum constant location is fixed at
                           src/application/agent/SystemPromptAddendum.ts but
                           the integration point in the existing sidepanel is
                           TBD-by-dev); (c) the EventBus has no existing
                           project-wide implementation — a feature-local
                           ProposalEventBus is fine but if a global bus lands
                           in a sibling spec before /spec:implement, prefer
                           that. No new CLARs surfaced. Part C + cross-cutting
                           gates ticked; UX/UI gates remain
                           ux-designer/ui-designer's responsibility per
                           sequencing.
2026-05-24 (architect):    spec.md complete. 42 SPEC-MHP-NNN interface
                           sections (4 workflow tools, 8 modified write
                           tools, 12 Tier-A reads, 1 escape hatch, 8
                           DevTools, plus 9 internal components:
                           ProposalStore, AuditLogWriter,
                           McpClientIdentifier, ActiveFeatureResolver,
                           MigrationService, SystemPromptAddendumProvider,
                           ProposalEventBus, StatusBarBadge,
                           ProposalNoticeEmitter). 40 edge cases (EC-MHP-
                           001..040). 56 test scenarios (TEST-MHP-001..056)
                           covering every REQ-MHP-001..046 and every
                           NFR-MHP-001..014, plus 5 architecture-risk
                           scenarios (RISK-MHP-011..015). 5 new settings
                           keys added: requireExplicitAcceptForAllWrites,
                           devtools.masterEnabled, devtools.autoAcceptLow
                           Risk, devtools.tools.<id>.enabled × 5 (counted
                           as a single nested key family per design).
                           Audit-log JSONL schema v1 byte-precise. State
                           machine for PendingProposal.status diagrammed
                           (pending → accepted | rejected | error;
                           terminal). Server-wide error vocabulary: 7
                           codes. Hand-offs to planner (Tasks): (a) the
                           FIRST task must capture baselines for NFR-MHP-
                           001/-002/-003 before any new code lands (per
                           Part C hand-off); (b) sidepanel-prompt-assembly
                           hook integration point for
                           SystemPromptAddendumProvider remains TBD-by-dev
                           (the constant location is fixed at
                           src/application/agent/SystemPromptAddendum.ts
                           per SPEC-MHP-039 but the existing prompt-
                           assembly call site needs to be located during
                           implementation; if not findable, the planner
                           should add a discovery task before the
                           addendum-wiring task); (c) the DevTools tool
                           response delivery (out-of-band result vs.
                           always-via-accept) noted as implementer choice
                           in SPEC-MHP-026..033 — planner should add a
                           task to pick one and document it in the
                           implementation log; (d) `.obsidian/
                           mcp.local.json` exists AND `.mcp.json` exists
                           is documented as a 'failed' migration with a
                           distinct notice (EC-MHP-019-extension) — needs
                           one extra notice copy string not in design.md
                           Part B; planner to add a UI-content task. No
                           new CLARs surfaced; all 18 prior CLARs remain
                           resolved. Stage 5 gate PASS.
2026-05-24 (ux-designer):  design.md Part A complete. 7 flows mapped
                           (F1 external-write headline, F2 auto-accept,
                           F3 in-process+card, F4 list+reject, F5 DevTools
                           opt-in incl. confirm-modal, F6 .mcp.json migration,
                           F7 Notice+status-bar surfacing). IA table covers
                           4 surfaces; deep-link convention = none.
                           Empty/loading/error states prescribed per
                           surface. A11y covers keyboard order, focus
                           return, ARIA-live polite for status-bar,
                           role=alertdialog for confirm modal, reduced-
                           motion compliant. Hand-offs flagged inline:
                           ui-designer owns visual treatment of badge,
                           confirm modal, in-card receipt, disabled per-
                           tool rows (NFR-MHP-011 contrast); architect
                           owns proposal-store event emission contract,
                           cross-surface invariant (card observes external
                           accept), .gitignore-failure error class shape.
                           No new CLARs surfaced.
```

## Open clarifications

- [x] CLAR-MHP-001 — Bearer-token policy. *(resolved 2026-05-24: no token for this feature; loopback + proposal-gating + read allow-list. Revisit if multi-user.)*
- [x] CLAR-MHP-002 — Tier-policy thresholds. *(resolved 2026-05-24: yes, auto-accept appends inside `specs/<active>/*.md` per REQ-MHP-009; both `vault_append_to_note` and `obsidian_cli_append_note`; audit row written; 10-second undo window deferred to Tier-B follow-up.)*
- [x] CLAR-MHP-003 — Webviewer scope. *(resolved 2026-05-24: carve out into separate spec; this feature emits `kind` discriminator only for forward compatibility — `research.md` Q2.)*
- [x] CLAR-MHP-004 — DevTools opt-in surface. *(resolved 2026-05-24: per-tool threat model drafted in `research.md` Q3 and will be embedded verbatim in ADR-019.)*
- [x] CLAR-MHP-005 — Proposal-queue persistence across plugin restarts. *(resolved 2026-05-24 by REQ-MHP-038: ephemeral v1, log discarded proposals on shutdown, persistence deferred to follow-up.)*
- [x] CLAR-MHP-006 — Client identification mechanism. *(resolved 2026-05-24: parse `clientInfo.name` from the MCP `initialize` request; fall back to `unknown` when absent or malformed. Standard MCP handshake field; works with any compliant client. Architect to reword REQ-MHP-034 accordingly.)*
- [x] CLAR-MHP-007 — Active-feature slug resolution rule. *(resolved 2026-05-24: scan `specs/*/workflow-state.md`; the active slug is the single feature whose YAML frontmatter `status: active`. Zero matches → no auto-accept (queue as pending). Multiple matches → no auto-accept + `LoggerPort.warn` with the matching slugs. Architect to add explicit REQ.)*
- [x] CLAR-MHP-008 — Concurrency window for the dual-accept race. *(resolved 2026-05-24: replace "scheduler tick" wording with "per-proposal-id mutex held across the entire accept critical section". Observable invariant: two concurrent `workflow_proposal_accept` calls on the same proposal id MUST result in exactly one mutation execution; the second call returns `proposal_not_pending` error. NFR-MHP-012 fuzz: 1000 concurrent-pair runs, asserts mutate-callback invocation count === 1.)*
- [x] CLAR-MHP-009 — Behaviour of in-scope writes outside the auto-accept carve-out. *(resolved 2026-05-24: synchronous response shape for every write tool: `{ proposalId: string, status: 'pending' | 'accepted', tool: string }`. Auto-accept path returns `accepted` immediately; all others return `pending`. Queue capacity 1000; on overflow return MCP error code `queue_full`. Architect to add explicit REQ.)*
- [x] CLAR-MHP-010 — DevTools auto-accept setting. *(resolved 2026-05-24: setting key `devtoolsAutoAcceptLowRisk: boolean`, default `false`. When `true`, auto-accepts proposals for the three low-risk DevTools tools only (`dev:screenshot`, `dev:errors`, `dev:console`). Has NO effect on high-risk DevTools tools (REQ-MHP-020 always-prompt invariant). Architect to add explicit REQ.)*
- [x] CLAR-MHP-011 — Vault-mutation failure after accept. *(resolved 2026-05-24: proposal status transitions to `error` (terminal); audit row written with `decision.outcome: error` and populated `result.error`; MCP response is error with code `write_failed` and a `proposalId` reference. Proposal stays in store for inspection until plugin shutdown. Architect to add explicit REQ.)*
- [x] CLAR-MHP-012 — Escape-hatch path-traversal and command-allow-list source. *(resolved 2026-05-24: (a) argument values must additionally reject `..` path segments and absolute path prefixes (`/`, `C:\`, `\\?\`); (b) the allow-list is a hard-coded server-side constant equal to the 12 Tier-A CLI command names in REQ-MHP-011 — not user-editable. Architect to reword REQ-MHP-013.)*
- [x] CLAR-MHP-013 — Audit-row `error` outcome triggers. *(resolved 2026-05-24: exhaustive list — vault-write failure post-accept (CLAR-MHP-011), tool body throws inside `mutate` callback, schema-validation failure on inbound payload, proposal-id-not-found on accept/reject. All four emit `decision.outcome: error` row AND `LoggerPort.warn`. Architect to add explicit REQ.)*
- [x] CLAR-MHP-014 — `.gitignore` line idempotence and encoding. *(resolved 2026-05-24: (a) match rule — exact-line match for `.obsidian/mcp.local.json` (no glob detection; idempotent if line already present); (b) appended line uses LF (no platform branching); (c) check runs once at migration time only, not on every start. Architect to reword REQ-MHP-031.)*
- [x] CLAR-MHP-015 — Migration byte-equality on JSON files. *(resolved 2026-05-24: semantic equality (deep object equality) is the acceptance criterion. Migration re-serialises via `JSON.stringify(value, null, 2)`; read-back verifies deep equality (not byte equality). Architect to reword REQ-MHP-027 and REQ-MHP-030.)*
- [x] CLAR-MHP-016 — Shutdown audit-write durability. *(resolved 2026-05-24: (a) best-effort, non-blocking from Obsidian's perspective; (b) 500 ms upper-bound time budget — proposals not flushed within window are silently dropped; (c) non-graceful exits (forced quit, OS kill, crash) are explicitly out of scope. Consequence: proposals silently lost, audit log inconsistent — accepted as a v1 trade-off. Architect to reword REQ-MHP-038.)*
- [x] CLAR-MHP-017 — User-facing surfacing of pending proposals when sidepanel is closed. *(resolved 2026-05-24: dual surface — (a) `NotificationPort` non-blocking notice on every new pending proposal (severity: info; clickable when feasible); (b) Obsidian status-bar badge showing pending-proposal count (`Plugin.addStatusBarItem`). Both surfaces in scope for this feature. Architect to add explicit REQ.)*
- [x] CLAR-MHP-018 — NFR-MHP-003 baseline. *(resolved 2026-05-24: baseline is "time to spawn the underlying `obsidian-cli` subprocess from within the plugin process, excluding MCP framing". The 20 ms budget covers JSON serialisation of the result. Measured at the MCP server boundary. Architect to reword NFR-MHP-003.)*


