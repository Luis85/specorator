---
feature: mcp-host-side-proposals
area: MHP
current_stage: tasks
status: active
last_updated: 2026-05-24
last_agent: dev
artifacts:
  idea.md: complete
  research.md: complete
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: complete
  implementation-log.md: in-progress
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
| 6. Tasks | `tasks.md` | complete |
| 7. Implementation | `implementation-log.md` + code | in-progress |
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
2026-05-24 (pm-analyze-fix):  Applied 9 PRD edits from /spec:analyze
                              critical+important: F-001 (REQ-MHP-008 → 8
                              tools), F-003/F-005 (REQ-MHP-006), F-004
                              (REQ-MHP-028 + NFR-MHP-010 deep-equal), F-006
                              (REQ-MHP-035 clientInfo.name), F-011 (gate REQ
                              range), F-012 (REQ-MHP-022 dimensions), F-013
                              (REQ-MHP-039 terminal-outcome), F-015 (REQ-MHP-
                              033 addendum path). Architect inherits 6 spec/
                              design findings (F-002/-007/-008/-009/-010/-017).
2026-05-24 (architect-analyze-fix): Applied 6 spec/design edits from /spec:
                                    analyze critical+important: F-002
                                    (ProposalKind expanded 3→5 canvas kinds),
                                    F-007 (cli_failed in error table), F-008
                                    (mutate_threw in error table), F-009
                                    (EC-MHP-041 + design notice copy), F-010
                                    (ActiveFeatureResolver in components
                                    table), F-017 (ProposalEventBus label).
                                    /spec:tasks now safe to run; advisory
                                    findings F-014/-016 ride to /spec:implement
                                    and /spec:release respectively.
2026-05-24 (planner):     tasks.md complete. 56 tasks across 10 work
                          packages (WP-MHP-0..J). T-MHP-001 is the
                          baseline-capture task and gates every other
                          per Part C hand-off; numbers must land in
                          test-plan.md §Baselines before any new code
                          path ships. 46/46 REQs and 14/14 NFRs covered
                          (matrix at bottom of tasks.md). TDD invariant
                          holds: 21 implementation tasks each list
                          their blocking test task in `dependencies`.
                          NFR-MHP-012 stability loop (1000-pair dual-
                          accept fuzz) encoded 1:1 as T-MHP-014 with
                          N=1000 verbatim in title + DoD. Three tasks
                          flagged 🪓 may-slice: T-MHP-011 (ProposalStore
                          extension — 3 slices), T-MHP-021 (8 write-tool
                          wirings — 2 slices), T-MHP-072 (12 Tier-A
                          reads — 3 slices). Two architect-flagged
                          unknowns surfaced as explicit discovery /
                          decision tasks: T-MHP-130 (locate sidepanel
                          prompt-assembly hook, escalate via
                          /spec:clarify if not found) and T-MHP-082
                          (document DevTools result-delivery choice in
                          implementation-log.md). ADR-019 acceptance
                          gate is T-MHP-087, blocked on T-MHP-088
                          drift-guard test (RISK-MHP-015). First ready
                          task: T-MHP-001 (owner: qa). After it lands:
                          Batch 1 test-authoring tasks (12 tasks, all
                          qa-owned) and Batch 2 foundational impl tasks
                          (9 tasks, all dev-owned) can run in parallel.
                          Hand-off → qa: pick up T-MHP-001 first; the
                          three baseline numbers must be recorded in
                          test-plan.md before any WP-MHP-A..I task PR
                          opens.
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
2026-05-24 (dev):          T-MHP-010 / T-MHP-011 / T-MHP-013 implemented
                           (Batch 3 ProposalStore extension chain). Added
                           tests/infrastructure/obsidian/ProposalStore.
                           extended.test.ts (21 tests covering acceptBy/
                           rejectBy/discardPending/tryQueue + per-id mutex
                           single-mutate invariant + 100-iter fuzz +
                           event-bus emission + post-accept failure
                           classification + queue cap 1000). Extended
                           src/infrastructure/obsidian/ProposalStore.ts:
                           new optional `{eventBus, auditLog,
                           clientIdentifier, logger}` deps; new methods
                           acceptBy / rejectBy / tryQueue / pendingCount /
                           listPending / discardPending; new ProposalError
                           class with 4 codes (queue_full / not_found /
                           already_decided / write_failed); per-id mutex
                           via Map<id, Promise<void>> serialises every
                           accept/reject. Legacy `queue / accept / reject /
                           getAll / get` preserved verbatim (jsdoc
                           @deprecated) so ObsidianMcpServerAdapter and the
                           8 write-tool registrars keep working with zero
                           changes until T-MHP-041 rewires them. Extracted
                           helpers into new src/infrastructure/obsidian/
                           proposalStoreInternals.ts (buildEntry,
                           cloneDomainProposal, buildAuditRow,
                           buildNotFoundAuditRow, QUEUE_CAPACITY,
                           UNKNOWN_CLIENT, coerceKind) to keep
                           ProposalStore.ts under the 350-line lint cap.
                           T-MHP-013 audit wiring landed in the same slice:
                           acceptBy / rejectBy / discardPending and the
                           not_found error path all call auditLog.append
                           BEFORE the Result returns; row ordering invariant
                           asserted by the test. Verification: 39/39 green
                           on ProposalStore + legacy proposal-store tests;
                           1136/1136 green on tests/infrastructure +
                           tests/application slice; typecheck clean on
                           changed surface (the 8 pre-existing errors on
                           tests/core/PluginSettings.devtools.test.ts are
                           Batch-1 TDD for T-MHP-008 and remain out of
                           scope); eslint --max-warnings 0 clean on the
                           three changed files. Two deviations from
                           SPEC-MHP-034 letter, documented in impl-log
                           T-MHP-011 entry: (a) two-surface store (legacy
                           queue + new tryQueue) instead of single
                           `queue(QueueInput): QueueResult` shape — chosen
                           per user brief's backwards-compat directive;
                           (b) acceptBy/rejectBy take a single
                           ProposalDecision argument (which already carries
                           `by`) instead of the spec's (by, decidingClient)
                           tuple — caller constructs the decision
                           server-side from the connection's stashed
                           ClientIdentity. Both flagged for architect at
                           T-MHP-041. Implementation-log artifact remains
                           in-progress: many WP-MHP-A/B/D/F/G/I tasks still
                           owned by dev (workflow_proposal_* registrars,
                           8 write-tool wiring, MigrationService wiring,
                           StatusBar/Notice emitter, FileWriteProposalCard
                           S24, etc.). Next agent: dev (continue WP-MHP
                           backlog) — recommended next slice T-MHP-015 /
                           T-MHP-016 (workflow_proposal_* MCP tools)
                           which is the call-site that exercises the new
                           acceptBy / rejectBy surface end-to-end.
2026-05-24 (dev):          T-MHP-130 / T-MHP-132 / T-MHP-123 implemented.
                           Hook for SystemPromptAddendum located at
                           src/application/chat/ChatTurnOrchestrator.ts
                           composeSystemSuffix (rejected alternatives in
                           assembleSystemPrompt.ts + TurnInputBuilder.ts —
                           both have pinned .toBe equality on the suffix).
                           Structured-output path (dispatchStructured) now
                           routes through composeSystemSuffix too, so the
                           addendum lands symmetrically on free-text +
                           structured turns. Added 3 src files:
                           src/application/agent/SystemPromptAddendum.ts,
                           src/application/mcp/threatParagraphs.ts,
                           src/plugin/settings/DevToolsEnableConfirmModal.ts.
                           Verification: tests/application/agent/
                           SystemPromptAddendum.test.ts (5/5) +
                           tests/ui/components/chat/FileWriteProposalCard.
                           devtoolsConfirm.test.ts (8/8) PASS;
                           tests/application/chat/ 368/368 regression
                           clean; typecheck + lint clean on changed files
                           (pre-existing 404-line warning on
                           ChatTurnOrchestrator.ts shifts to 407; two
                           pre-existing lint errors on the qa-authored
                           confirm-modal test file are qa's responsibility,
                           not in dev scope). Deviation: confirm modal
                           does NOT extend Obsidian's Modal class because
                           tests/__fakes__/obsidian.stub.ts does not export
                           Modal — documented in implementation-log.md
                           T-MHP-123 entry. Test scaffolding: removed three
                           now-unused @ts-expect-error directives from the
                           two target test files (typecheck flagged them as
                           TS2578); no assertion changed. Implementation-
                           log artifact remains in-progress: many
                           WP-MHP-A/B/C/D/E/F/G/H/I tasks still owned by
                           dev; close-out pending until the rest land.
                           Next agent: dev (continue WP-MHP backlog).
2026-05-24 (dev):          Polish slice: T-MHP-072 verified (12 Tier-A read
                           registrars already complete from T-MHP-071 —
                           registrar covers all 12 SPEC-MHP-013..024 tools
                           with per-tool Zod schemas + cli.runJson mapping;
                           no per-tool deliverable split needed); T-MHP-074
                           implemented obsidian_cli_read_command escape hatch
                           at src/infrastructure/obsidian/mcp/
                           registerEscapeHatchTool.ts plus
                           denyList.ts holding the REQ-MHP-014 PERMANENT_
                           DENY_LIST (24 entries); T-MHP-073 escape-hatch
                           test PASSING (19 tests covering shell-meta
                           regex, .. traversal, absolute prefixes,
                           allow-list, deny-list, deny-overrides-allow,
                           runner-not-spawned-on-rejection); T-MHP-075
                           deny-list tools/list test PASSING (6 tests
                           covering REQ-MHP-014 constant, no Tier-A name
                           collision, escape-hatch deny-list-handler,
                           combined-surface 13-tool inventory, ADR-019 §3
                           DevTools carve-out); T-MHP-032 audit-error-
                           triggers PASSING (9 tests over the 4 REQ-MHP-045
                           triggers — post-accept write failure, mutate
                           throw, schema-validation failure, not-found —
                           plus 3 non-error closure checks). Verification:
                           37 tests across 4 task files green; typecheck
                           clean for my surface; eslint clean (auto-fix
                           applied two `!` assertions + removed two
                           redundant type casts). Implementation-log
                           updated with detailed entries per task.
                           Implementation-log artifact remains in-progress:
                           Stage 7 close-out blocked until WP-MHP-A/B/D/E/
                           F/G/H/I remaining tasks land. Next agent: dev
                           (continue WP-MHP backlog — DevToolsToolRegistrar
                           T-MHP-081 is currently the failing-first import
                           gap blocking the mcp test sweep).
2026-05-24 (dev):          Batch T-MHP-015 / -016 / -040 / -041 landed —
                           THE critical unlock: ANY MCP client can now
                           list / get / accept / reject host-side
                           proposals. New files: tests/infrastructure/
                           obsidian/mcp/registerWorkflowProposalTools.test
                           .ts (14 tests, all green); src/infrastructure/
                           obsidian/mcp/registerWorkflowProposalTools.ts
                           (4-tool registrar per SPEC-MHP-001..004);
                           tests/infrastructure/obsidian/ObsidianMcpServer
                           Adapter.test.ts (7 tests, all green — verifies
                           rewire via live HTTP tools/list + private-field
                           probes). Modified: src/infrastructure/obsidian/
                           ObsidianMcpServerAdapter.ts (constructor now
                           wires ProposalEventBus + AuditLogWriter +
                           McpClientIdentifier + 4-dep ProposalStore;
                           accept/reject route through acceptBy/rejectBy
                           with by:'user' decision; getProposals uses
                           listPending; _handleMcpRequest registers
                           workflow_proposal_* + Tier-A reads + attaches
                           clientIdentifier hook when SDK exposes
                           onInitialize); src/infrastructure/obsidian/
                           ProposalStore.ts (+getDomain(id) for SPEC-MHP-
                           002 read); src/infrastructure/obsidian/mcp/
                           index.ts (re-exports new registrars). Two
                           deviations logged: (a) accept/rejectBy still
                           take a single ProposalDecision argument rather
                           than (by, decidingClient) per SPEC-MHP-034 —
                           inherited from T-MHP-011; (b) attachInitialize
                           Hook is typeof-guarded no-op until MCP SDK
                           exposes onInitialize, so per-connection client
                           identity falls back to 'unknown' in v1. Audit-
                           row provenance is intact via decision.by
                           literal. Verification: 21/21 new tests green;
                           39/39 ProposalStore + legacy tests green (no
                           regression); typecheck exit 0 across changed
                           surface; eslint clean on 6 touched files.
                           Pre-existing TDD-red on tests/infrastructure/
                           obsidian/mcp/DevToolsToolRegistrar.test.ts
                           (T-MHP-080 / T-MHP-081) remains red — out of
                           scope. Implementation-log artifact remains
                           in-progress: WP-MHP-B (write-tool wiring),
                           WP-MHP-D (DevTools), WP-MHP-F (migration plug-
                           in wiring), WP-MHP-G (status-bar / notice),
                           WP-MHP-I (FileWriteProposalCard S24) still
                           owned by dev. Next agent: dev (continue WP-MHP
                           backlog — T-MHP-021 8-write-tool wiring +
                           T-MHP-022 auto-accept algorithm are the next
                           critical-path slices that unblock end-to-end
                           pending-proposal demos).
2026-05-24 (dev):          WP-MHP-D DevTools opt-in surface landed
                           (T-MHP-080..088). New files: src/infrastructure/
                           obsidian/mcp/DevToolsToolRegistrar.ts (T-MHP-081
                           matrix-driven 8-tool registrar per SPEC-MHP-026..
                           033 + SPEC-MHP-041; auto-accept low-risk via
                           tryQueue→acceptBy; refresh() reconciles tool set
                           on settings change); src/plugin/settings/DevTools
                           SettingsSection.ts (T-MHP-085 MCP-write-proposals
                           + DevTools sections with verbatim Part B microcopy,
                           per-tool flip opens DevToolsEnableConfirmModal,
                           cancel reverts toggle); tests/infrastructure/
                           obsidian/mcp/DevToolsToolRegistrar.test.ts
                           (T-MHP-080 matrix, 12/12 green); tests/plugin/
                           settings/DevToolsEnableConfirmModal.interaction
                           .test.ts (T-MHP-083 modal interaction, 17/17 green);
                           tests/application/mcp/threatParagraphs.driftGuard
                           .test.ts (T-MHP-088 RISK-MHP-015 drift-guard, 10/10
                           green — asserts each threat block byte-equals
                           ADR-019 §4 after normalising Markdown decoration;
                           dev:cdp permitted its Part-B §S07 trailing
                           "always prompts" sentence). Extended: src/domain/
                           settings/PluginSettings.ts (5 new keys per spec
                           §"Settings additions"); src/core/core-settings.ts
                           (validateDevtools nested coercion); src/plugin/
                           settings.ts (wires renderDevToolsSettingsSection
                           into display()); src/infrastructure/obsidian/
                           proposalStoreInternals.ts (coerceKind translates
                           dev:foo→dev_foo so DevTools proposals carry the
                           correct ProposalKind without forcing the
                           registrar to pre-map). T-MHP-082 decision:
                           always-via-accept (DevTools tools return
                           {proposalId, status, tool}; clients call
                           workflow_proposal_accept to obtain the side-effect
                           payload — architecturally simpler path satisfying
                           REQ-MHP-019 + REQ-MHP-046; payload never enters
                           audit row per REQ-MHP-021). T-MHP-084 verified:
                           Batch-2C DevToolsEnableConfirmModal already
                           implements §S07–S09 end-to-end; no class changes
                           needed. Verification: 68/68 tests green across
                           the six target files (10 drift-guard + 17 modal-
                           interaction + 12 registrar matrix + 12 Plugin
                           Settings devtools + 9 PluginSettings WS-2 + 8
                           DevTools confirm-modal-from-T-MHP-122); 39/39
                           ProposalStore regression green (coerceKind
                           extension is additive); typecheck exit 0 across
                           full project; eslint --max-warnings 0 clean on
                           all 8 changed source/test files. settings.ts
                           pre-existing max-lines warn shifts from 419→430
                           (warn not error). Out of scope: T-MHP-102 plug-
                           in-start wiring that mounts the registrar against
                           the live MCP server (renderDevToolsSettingsSection's
                           onSettingsChange is currently a documented no-op).
                           Implementation-log artifact remains in-progress:
                           WP-MHP-B (write-tool wiring T-MHP-020..022),
                           WP-MHP-F (migration plug-in wiring T-MHP-112),
                           WP-MHP-G (status-bar / notice T-MHP-090..102),
                           WP-MHP-I (FileWriteProposalCard S24 T-MHP-120..
                           126) still owned by dev. Next agent: dev
                           (continue WP-MHP backlog). T-MHP-087 architect
                           gate (flip ADR-019 status: proposed → accepted)
                           now unblocked by T-MHP-088.
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


## Consistency findings (analyze) — 2026-05-24

Generated by `/spec:analyze`. Findings are owned by the listed agent; orchestrator gates the fix before `/spec:tasks`.

Counts: 6 Critical, 7 Important, 4 Advisory.

Top 3 most-cited REQs in findings: REQ-MHP-008 (write-tool enumeration count + canvas naming, 2 findings), REQ-MHP-006 (audit-row contradiction with EC-MHP-002 + scheduler-tick wording, 2 findings), REQ-MHP-027/-028/-030 + NFR-MHP-010 (byte-vs-deep-equal residue, 1 finding).

`/spec:tasks` recommendation: **WAIT for fixes.** Critical findings F-001 / F-002 / F-003 must be resolved before planner can author tasks — the planner cannot enumerate write-tool implementation tasks while requirements name 6 tools and spec names 8 with mismatched canvas identifiers, and the audit-row contradiction creates two incompatible test expectations.

### Critical (blocks /spec:tasks)

- **F-001 — Write-tool count mismatch (six vs eight).** REQ-MHP-008 (and PRD §Summary / NG3) names *six* write tools: `canvas_create_node`, `canvas_link`, `canvas_update_node`, `vault_write_note`, `vault_append_to_note`, `obsidian_cli_append_note`. spec.md §Scope and SPEC-MHP-005..012 enumerate *eight* tools: `vault_write_note`, `vault_append_to_note`, `obsidian_cli_append_note`, `canvas_create`, `canvas_add_text_node`, `canvas_add_file_node`, `canvas_add_edge`, `canvas_update_node`. The canvas tool names differ on both sides (`canvas_create_node` vs `canvas_create`; `canvas_link` vs `canvas_add_edge`; new `canvas_add_text_node` / `canvas_add_file_node`). · Owner: **pm** (canonical list lives in REQ-MHP-008). · Action: PM reconciles REQ-MHP-008 wording with the spec's eight tools (or architect amends spec to the requirements' six), then update design's "Components and responsibilities" canvas tool references and the `ProposalKind` discriminator. Until reconciled the planner cannot scope canvas write-tool work.

- **F-002 — `ProposalKind` discriminator does not match registered tool names.** Design data model and spec.md §Data structures declare `ProposalKind` union with `canvas_create_node | canvas_link | canvas_update_node` (3 canvas values), but spec.md SPEC-MHP-008..012 register canvas tools named `canvas_create`, `canvas_add_text_node`, `canvas_add_file_node`, `canvas_add_edge`, `canvas_update_node` (5 distinct tools). The kind discriminator therefore cannot uniquely identify 4 of the 5 canvas write tools at audit time. REQ-MHP-036 requires `kind` to distinguish tool classes. · Owner: **architect**. · Action: Expand `ProposalKind` union in spec.md §Data structures + design.md §Data model to one entry per registered canvas tool, or collapse the SPEC-MHP-008..012 canvas tools back to the REQ-MHP-008 trio. Couples to F-001's reconciliation.

- **F-003 — REQ-MHP-006 acceptance contradicts EC-MHP-002 / SPEC-MHP-003 on audit-row count for dual-accept.** REQ-MHP-006 acceptance states: "the audit log contains two rows for the proposal — the first with `decision.outcome: 'accepted'` and the second with `decision.outcome: 'already-decided'`." EC-MHP-002 explicitly says: "Return `already_decided` carrying the prior decision. No additional `mutate` call. **No new audit row written for this read attempt.**" SPEC-MHP-003 step 2 also returns `already_decided` without writing a row. NFR-MHP-012 test design (TEST-MHP-006) lists "first returns `ok`; second returns `already_decided`" with no row-count assertion — but if REQ-MHP-006 stands the test must assert two rows. · Owner: **pm** (REQ is canonical) and **architect** (must align spec). · Action: pick one — either (a) reword REQ-MHP-006 acceptance to "audit log contains exactly one row (accepted); second call returns `already_decided` and writes no row", or (b) update EC-MHP-002 + SPEC-MHP-003 step 2 to write the second row. Tier-policy preference: option (a) — second-accept is a no-op, not a state transition.

- **F-004 — REQ-MHP-028 + NFR-MHP-010 still mandate "byte-match" / "byte-equal" after CLAR-MHP-015 resolved to semantic/deep equality.** REQ-MHP-027 + REQ-MHP-030 were reworded to deep equality per CLAR-MHP-015 (architect did update those). REQ-MHP-028 statement still reads "does not byte-match the source `.mcp.json`"; NFR-MHP-010 row reads "100% of nested fields byte-equal in `.obsidian/mcp.local.json` vs source `.mcp.json`". Design §"Key decisions" and SPEC-MHP-038 implement deep equality (`JSON.stringify(value, null, 2)` + deep-equal verify), so byte-equality cannot hold for inputs with non-canonical whitespace. TEST-MHP-031 ("Nested-object `.mcp.json` survives migration with deep equality") would fail the byte-equality wording. · Owner: **pm**. · Action: Reword REQ-MHP-028 ("does not deeply equal") and NFR-MHP-010 ("deeply equal") to match CLAR-MHP-015 / REQ-MHP-027 / REQ-MHP-030.

- **F-005 — REQ-MHP-006 acceptance still uses "scheduler tick" wording that CLAR-MHP-008 explicitly retired.** REQ-MHP-006 acceptance reads "two MCP clients call `workflow_proposal_accept` for that proposal within the same scheduler tick". CLAR-MHP-008 resolution mandates replacing scheduler-tick wording with "per-proposal-id mutex held across the entire accept critical section". Design §"Key decisions" and SPEC-MHP-003 step 1 + SPEC-MHP-034 §"Per-id mutex invariant" use the mutex framing; REQ-MHP-006 still leaks the deprecated phrasing. · Owner: **pm**. · Action: Reword REQ-MHP-006 acceptance to express the invariant as "two concurrent `workflow_proposal_accept` calls on the same proposal id MUST result in exactly one mutation execution" per CLAR-MHP-008.

- **F-006 — REQ-MHP-035 acceptance references `x-mcp-client-name` header after CLAR-MHP-006 retired it.** REQ-MHP-035 acceptance reads: "Given an MCP client sends no `x-mcp-client-name` and no `User-Agent`". CLAR-MHP-006 resolved client identification to `clientInfo.name` from MCP `initialize` (REQ-MHP-034 reworded; design §"Key decisions" + design §"Alternatives considered" + SPEC-MHP-036 all use `clientInfo.name`). The leftover header reference in REQ-MHP-035 acceptance contradicts the resolved mechanism and may mislead an implementer into wiring up a custom header. · Owner: **pm**. · Action: Reword REQ-MHP-035 acceptance to express the fallback as "client completes the MCP `initialize` handshake without a `clientInfo.name` field" — drop the `x-mcp-client-name` and `User-Agent` references entirely.

### Important (should-fix before /spec:tasks)

- **F-007 — Spec introduces `cli_failed` error code; design's error-code table does not list it.** SPEC-MHP-013..024 (Tier-A reads) and SPEC-MHP-025 (escape hatch) document `cli_failed` as the response when the `obsidian-cli` subprocess returns non-zero exit. Design Part C §"Error code table" lists only `not_found`, `already_decided`, `write_failed`, `queue_full`, `invalid_argument`, `not_allowed`. The Tier-A read tools and escape hatch therefore use an error code the architect's error-vocabulary table does not acknowledge. · Owner: **architect**. · Action: Add `cli_failed` row to design.md Part C error-code table with origin "Tier-A read tools + escape hatch" and a REQ trace (arguably also surface in REQ-MHP-011 acceptance).

- **F-008 — Spec introduces `mutate_threw` error code; design's error-code table does not list it.** spec.md §"MCP-wide envelope and error codes" table includes `mutate_threw` (mapped to `write_failed` for clients but logged internally). Design Part C §"Error code table" does not list it. · Owner: **architect**. · Action: Either add `mutate_threw` to design's error-code table as an internal classification (with note that it aliases to `write_failed` for clients), or remove it from spec.md and rely on `write_failed` exclusively with telemetry classification via `result.error` text.

- **F-009 — Spec introduces an EC-MHP-019-extension scenario (both `.mcp.json` AND `.obsidian/mcp.local.json` present) without a numbered edge case or matching design notice copy.** spec.md §Compatibility → on-disk artifacts says: "if `.obsidian/mcp.local.json` exists AND `.mcp.json` exists, the migration aborts ... reported via the failure notice copy ... EC-MHP-019-extension". The edge case table (EC-MHP-001..040) does not have an entry for this scenario; design.md Part B §S17–S19 migration-notice copy does not cover it; the architect's own hand-off in workflow-state explicitly flagged this as needing a planner UI-content task. · Owner: **architect** (add a numbered EC-MHP-NNN) and **ui-designer** (add the missing notice copy string to design Part B). · Action: Add EC-MHP-041 (or split EC-MHP-019 into -019a/-019b) with explicit notice copy, e.g. "Both `.mcp.json` and `.obsidian/mcp.local.json` exist. Resolve manually before reload."

- **F-010 — `ActiveFeatureResolver` is a SPEC-MHP-037 component but absent from design's "Components and responsibilities" table.** Design Part C lists 12 components in the table; SPEC-MHP-037 introduces `ActiveFeatureResolver` as a first-class component referenced from `ProposalStore`. Design only mentions it inline in data-flow F1 step 4 ("`MigrationService`-adjacent `ActiveFeatureResolver`"). REQ-MHP-041 is satisfied by it. · Owner: **architect**. · Action: Add a row for `ActiveFeatureResolver` to design.md Part C §"Components and responsibilities" with Layer=infrastructure, Responsibility=resolve single `status: active` slug per CLAR-MHP-007, Dependencies=VaultPort + LoggerPort, New/modified=NEW.

- **F-011 — PRD Quality gate references "REQ-MHP-001..040" though requirements now run to REQ-MHP-046.** requirements.md §"Quality gate" line: "Every functional requirement uses EARS and has an ID. (REQ-MHP-001..040, each tagged…)". The orchestrator hand-off added REQ-MHP-041..046; this checklist line is stale. NFR-MHP-NNN runs to 014 (consistent) but the wording understates scope by 6 REQs. · Owner: **pm**. · Action: Update PRD §"Quality gate" to read "REQ-MHP-001..046, each tagged with one of the five EARS patterns".

- **F-012 — REQ-MHP-022 acceptance mixes decision-by and decision-outcome dimensions.** REQ-MHP-022 acceptance lists triggers as "(auto-accept, user-accept, client-accept, reject, or error)" — inflating to 5 mixed-axis values. REQ-MHP-040 + design data model + spec data model use 4 orthogonal `decision.by` values (auto, user, client, shutdown) and 5 `decision.outcome` values (accepted, rejected, discarded, error, already-decided). The REQ-MHP-022 acceptance text crosses the dimensions and obscures the actual matrix. · Owner: **pm**. · Action: Reword REQ-MHP-022 acceptance to express the trigger orthogonally — "any proposal decision combining `decision.by ∈ {auto, user, client, shutdown}` with `decision.outcome ∈ {accepted, rejected, discarded, error}`" — REQ-MHP-040 already enumerates the provenance dimension.

- **F-013 — REQ-MHP-039 narrative covers only accept/reject; ignores discarded + error audit-row paths.** REQ-MHP-039 statement: "When `workflow_proposal_accept` or `workflow_proposal_reject` resolves a proposal, the Specorator MCP server shall append exactly one audit-log row". This omits the shutdown-discard path (REQ-MHP-038), the post-accept error path (REQ-MHP-044), and the schema-validation / not-found-on-accept paths (REQ-MHP-045). SPEC-MHP-035 + EC-MHP-014/-015 + EC-MHP-007 all write audit rows for those outcomes. · Owner: **pm**. · Action: Reword REQ-MHP-039 to: "When a proposal transitions to any terminal outcome (`accepted`, `rejected`, `discarded`, `error`), the Specorator MCP server shall append exactly one audit-log row before returning the corresponding MCP response (where one exists)." Cross-references REQ-MHP-038, REQ-MHP-044, REQ-MHP-045.

### Advisory (nice-to-fix; can land in /spec:implement)

- **F-014 — Spec §SPEC-MHP-026..033 leaves DevTools result delivery as "implementer choice" between out-of-band content block and always-via-accept.** SPEC-MHP-026..033 §"Common per-tool behaviour" step 4 says "implementer chooses the simpler path that satisfies REQ-MHP-019 + REQ-MHP-046". The architect's own hand-off in workflow-state (2026-05-24 architect note) flagged this as something the planner should "add a task to pick one and document it in the implementation log". Surface-contract ambiguity is acceptable at the /spec:implement boundary but worth flagging. · Owner: **planner / dev**. · Action: Planner adds an early implementation-decision task before SPEC-MHP-026..033 code lands; record decision in implementation-log.md.

- **F-015 — REQ-MHP-033 acceptance still says addendum file "exact path determined at /spec:design"; spec fixes it but requirements text was not updated.** REQ-MHP-033 acceptance reads "Given the addendum file is committed under `src/` (exact path determined at /spec:design)". SPEC-MHP-039 + design §"Key decisions" pin the path to `src/application/agent/SystemPromptAddendum.ts`. The REQ acceptance can now be tightened. · Owner: **pm**. · Action: Update REQ-MHP-033 acceptance to name the file path resolved by design (`src/application/agent/SystemPromptAddendum.ts`), removing the "TBD at design" hedge.

- **F-016 — ADR-019 status is `proposed`; PRD release-criteria says "ADR-019 authored and accepted".** ADR-019 frontmatter `status: proposed`. PRD release-criteria checkbox 3 reads "ADR-019 authored and accepted". Not a /spec:tasks blocker (release gate is later) but the release-manager will trip on this if not flipped to `accepted` before the release PR. · Owner: **architect / release-manager**. · Action: Flip ADR-019 status to `accepted` after final sign-off, before the release PR.

- **F-017 — Design Part C §"System overview" mermaid graph labels the bus `EventBus`; spec.md SPEC-MHP-040 + design's components-table file path use `ProposalEventBus`.** The label `EventBus` (diagram) vs `ProposalEventBus` (SPEC-MHP-040 + component-table file path `src/infrastructure/events/ProposalEventBus.ts`) is non-blocking but creates a grep mismatch for the implementer. · Owner: **architect**. · Action: Standardise on `ProposalEventBus` across design.md Part C diagram and prose.

### Clean checks (no findings)

- **A. REQ coverage in design — clean (60/60).** All REQ-MHP-001..046 and NFR-MHP-001..014 appear in design.md §"Requirements coverage" table. No duplicates; no omissions. Spot-check of 10 random IDs (REQ-MHP-003, -011, -017, -022, -029, -034, -041, -046; NFR-MHP-004, -011) confirms each "Addressed in" cell points to a section that actually exists in design.md.
- **B. REQ coverage in spec — clean.** Every REQ-MHP-001..046 and every NFR-MHP-001..014 is referenced at least once in a SPEC-MHP-NNN "Satisfies:" line, an EC-MHP-NNN row, a TEST-MHP-NNN row, or an observability/perf-budget row. NFR-MHP-009 (backwards-compat) and NFR-MHP-011 (a11y contrast) are covered indirectly via §Compatibility and via design (NFR table) rather than a dedicated TEST-MHP row, which is acceptable since these are review-gate/Storybook assertions not unit tests.
- **C. Reverse trace — spec to REQ — clean.** Every SPEC-MHP-001..042, every EC-MHP-001..040, and every TEST-MHP-001..056 carries an explicit "Satisfies:" line referencing at least one REQ-MHP-NNN, NFR-MHP-NNN, CLAR-MHP-NNN, or RISK-MHP-NNN.
- **D. Conflicting numbers — clean** for queue cap (1000 in REQ-MHP-042, spec EC-MHP-006/TEST-MHP-045, design UI §S13), shutdown budget (500 ms in REQ-MHP-038, spec EC-MHP-015/TEST-MHP-040/§Performance budget, design RISK-MHP-014), audit-log rotation (2 MiB × 5 in REQ-MHP-024 + NFR-MHP-008, spec SPEC-MHP-035/TEST-MHP-025, design §"Key decisions"), and latency budgets (NFR-MHP-001/-002/-003 numbers consistent across design §"Performance, security, observability" and spec §"Performance budget").
- **D (tool naming).** `workflow_proposal_*` namespace clean across all artifacts; no `proposal_*` or `mhp_proposal_*` leaks found.
- **D (DevTools deny-list).** REQ-MHP-014 deny-list and ADR-019 Part 2 deny-list both exclude the 8 DevTools tools per CLAR-MHP-004; ADR-019 Part 3 matrix governs DevTools registration. Consistent.
- **F. ADR-019 vs requirements/spec — clean.** Tier policy (Part 1) matches REQ-MHP-009/-010/-019/-043; deny-list (Part 2) matches REQ-MHP-014/-015; DevTools matrix (Part 3) matches REQ-MHP-016/-017/-018/-020/-021. Threat paragraphs (Part 4) match research.md §Q3 source — drift-guard test specified in RISK-MHP-015 + ADR-019 §Compliance.
- **G (setting key names).** Design Part B uses `devtools.masterEnabled`, `devtools.autoAcceptLowRisk`, `devtools.tools.<id>.enabled`; spec §"Settings additions" uses the same dotted-path keys. `requireExplicitAcceptForAllWrites` consistent across REQ-MHP-010, design, spec.
- **G (client identity field name).** Design's `ClientIdentity.id` field and spec's `ClientIdentity.id` field match; both populated from `clientInfo.name`. No `client.name` vs `client.id` drift.



