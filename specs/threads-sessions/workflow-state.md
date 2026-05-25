---
feature: threads-sessions
area: TS
current_stage: implementation
status: active
last_updated: 2026-05-25
last_agent: dev (implement — parity-fix batch, REVIEW-TS-001 R-TS-001/003/004/005/006/007)
epic: claudian-reboot
phase: P3
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.2 + audits + claudian-main stand in, mirrors P1/P2)
  research.md: skipped (charter §3.2 + audits + claudian-main stand in)
  requirements.md: accepted (PRD-TS-001; CLAR-TS-001..004 resolved by ADR-TS-001/002/003)
  design.md: complete (DESIGN-TS-001; Parts A/B/C; ADR-TS-001/002/003 accepted)
  spec.md: complete (SPEC-TS-001..034; 26 automatable TEST-TS + 2 manual legs)
  tasks.md: complete (TASKS-TS-001; T-TS-001..042; 42 tasks)
  implementation-log.md: in-progress (IMPL-TS-001; domain T-TS-002..006 + infra T-TS-007..013 + application T-TS-014..025 + UI T-TS-026..035 + wire-in T-TS-037/038 + styles T-TS-036 + dev-smoke T-TS-039 done; parity-fix batch R-TS-001/003/004/005/006/007 done [e34f18c/6f5e874/6cef786/b14021f]; remain: R-TS-002 [architect ADR] + gate T-TS-040/041 [human manual legs] + T-TS-042 [orchestrator verify])
  test-plan.md: pending
  test-report.md: pending
  review.md: complete (REVIEW-TS-001; verdict BLOCKED — 3 P1 real-path blockers R-TS-001/002/003; resolution log appended — R-TS-001/003/004/005/006/007 RESOLVED by dev, R-TS-002 deferred to architect; re-verdict pending R-TS-002 + verify gate)
  traceability.md: complete-with-broken-links (TRACE-TS-001; REQ-TS-018/019/021 chains broken at code→test)
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — threads-sessions (P3)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted (PRD-TS-001) |
| 4. Design | `design.md` | complete (DESIGN-TS-001) |
| 5. Specification | `spec.md` | complete (SPEC-TS-001..034) |
| 6. Tasks | `tasks.md` | complete (TASKS-TS-001) |
| 7. Implementation | `implementation-log.md` + code | in-progress (domain + infra + application + UI + wire-in + styles + dev-smoke done; gate T-TS-040/041 [human] + T-TS-042 [orchestrator] remain) |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | complete — **verdict BLOCKED** (REVIEW-TS-001) |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P3 (tabs / sessions / history)

P0 #432, P1 chat-core #433, P2 rich-rendering #436 merged to `next`. P3 = the third vertical
slice: **multi-tab chat + conversation persistence + resume/fork/rewind/compact + title-gen** on
the P1/P2 chat surface.

**Scope (charter §4 P3 row + §3.2):**
- **Multi-tab chat** (`TabBar`, `TabManager`, `Tab`, `tabs/types.ts`, `tabs/providerResolution.ts`)
- **Conversation history + resume** (`ResumeSessionDropdown`, per-provider history stores —
  `ClaudeConversationHistoryService`, `ClaudeHistoryStore`, `sdkHistoryTypes`)
- **Fork** a conversation (`ForkTargetModal`, `rewind.ts`, `ClaudeRewindService`)
- **Rewind / checkpoint** to an earlier turn
- **Compact** a conversation + **auto title generation** (`titleGeneration`,
  `ClaudeTitleGenerationService`, `QueryBackedTitleGenerationService`)
- CSS: `tabs.css`, `history.css`, `resume-session.css`, `fork-target.css`, nav-sidebar

**Out of P3 (later phases):** composer power slash/@mention/instruction/plan/bang-bash (P4);
approvals/inline-interactive (P7); attachments (later); Codex/Opencode providers (P9 — P3 builds
the per-provider history/title SEAMS but wires only Claude); MCP (P8); settings-UX shell (P10).

**Key P3 ADR decisions to make (autonomous — record each):**
- **Conversation-history persistence location.** History transcripts are neither a secret nor a
  device-pref. Decide: vault files (portable, user-visible, git-trackable) vs device-local vs a
  dedicated store — under the epic constraints (secrets→secretStorage; device/user settings→
  device-local; NO data.json for settings). Claudian uses per-provider history stores. File an ADR.
- **Thread/tab state model** — Pinia multi-thread store (DTO-only) replacing the P1 single-thread
  `chatStore`; how the per-tab `ChatRuntime` + history bind. (Router regrows IF needed — CLAUDE.md
  notes Vue Router was removed in P0; multi-tab may not need routing, just tab state.)
- **Rewind/fork semantics** — how `rewind.ts`/`ClaudeRewindService` map onto our `ChatRuntimePort`
  (`resetSession`/resume + the rewind checkpoint model); the new ports the backend audit names.
- **Title generation** — the `QueryBackedTitleGenerationService` seam (a side query) on the port.

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat (load-or-default); DDD inward
imports + narrow ports + 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/
`window.confirm` (Obsidian `Modal` for fork-target etc.); `<script setup>`; `Result<T,E>`; tests
mirror `src/` + `data-testid` PageObjects; coverage 80/70/80/80; perceptual parity via `--sp-*`;
identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned + actionlint. VERIFY GATE
(`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after each big chunk; merge P3 to `next` autonomously; manual-Obsidian
+ parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.2/§4/§5/§6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (the §3.2 sources:
`features/chat/tabs/*`, `features/chat/rewind.ts`, `shared/components/ResumeSessionDropdown.ts`,
`shared/modals/ForkTargetModal.ts`, `providers/claude/history/*`, `providers/claude/runtime/ClaudeRewindService.ts`,
`core/prompt/titleGeneration.ts`, `core/auxiliary/QueryBackedTitleGenerationService.ts`).

## Hand-off notes

```
2026-05-25 (orchestrator): P3 bootstrapped on feature/threads-sessions (off next; P0/P1/P2 merged).
                          Scope = charter §4 P3 / §3.2 (tabs/history/resume/fork/rewind/compact/
                          title-gen). Autonomous drive. Next: /spec:requirements (pm) grounded in
                          charter §3.2 + audits + the claudian §3.2 sources; then design A/B/C with
                          the P3 ADRs (history persistence location; multi-thread store model;
                          rewind/fork semantics + new ports; title-gen seam). EARS reqs each mapped
                          to a claudian path + test.

2026-05-25 (pm, requirements): PRD-TS-001 written (status: draft) →
                          specs/threads-sessions/requirements.md. 28 EARS functional reqs
                          (REQ-TS-001..028) grouped by sub-surface: tabs (001-007),
                          history+persistence (008-012), resume (013-015), fork (016-018),
                          rewind (019-022), compact (023), title-gen (024-025), per-provider
                          seams (026-028). Each maps 1:1 to a claudian §3.2 source path + a
                          Given/When/Then. 15 NFRs (NFR-TS-001..015) restating epic constraints
                          (DDD/ports/3-bridges, no obsidian-in-Vue, no v-html/innerHTML/
                          window.confirm, Obsidian Modal for fork-target, <script setup>,
                          Result<T,E>, tests-mirror-src + data-testid PageObjects, coverage
                          80/70/80/80, --sp-* perceptual parity, WCAG 2.2 AA tab/dropdown nav,
                          manifest untouched, NOT-data.json persistence + secrets→secret-store +
                          device-prefs→device-local, NO migration/load-or-default).

                          HAND-OFF → /spec:design (architect). PRD is HELD at status:draft until
                          the FOUR P3 ADRs are recorded (autonomous drive — architect files, PM
                          accepts; no human gate this phase). The four open clarifications the
                          architect MUST decide (framed as options + constraints in the PRD §Open
                          questions, NOT decided by PM):
                            - CLAR-TS-001 — conversation-history persistence location (vault files
                              vs device-local vs dedicated/home store). PM RECOMMENDS vault files
                              via VaultPort for the P3 Claude path (durable portable git-trackable
                              user content; all 3 bridges exist); defer HomeFsPort to P9. Architect
                              to bless exact path + record HomeFsPort deferral.
                            - CLAR-TS-002 — multi-thread store model (generalise SPEC-CC-016
                              single-thread chatStore to N tabs; DTO-only boundary; turn-runner
                              stays out of reactive state; per-tab streaming isolation). Architect's
                              model call; flag P0-removed Vue Router (regrow only if needed).
                            - CLAR-TS-003 — rewind/fork semantics on the runtime seam + new history
                              port (additive ChatRuntimePort growth: resume via sessionId, rewind
                              checkpoint conversation-mode, fork = derive provider-state not copy;
                              backend audit's ProviderHistoryPort). Code-rollback rewind stays gated
                              (REQ-TS-022/NG7). This is the ADR-CC-001-deferred rewind/session growth.
                            - CLAR-TS-004 — title-generation seam (side-query on ChatRuntimePort.query
                              cold-start vs a dedicated AuxModelPort). PM LEANS side-query for P3;
                              architect decides (same seam later carries P4 instruction-refine /
                              P5 inline-edit).

                          SCOPE RISKS flagged to design: (1) the "code and conversation" rewind menu
                          option must EXIST but must NOT touch fs/git in P3 (REQ-TS-022) — easy to
                          over-build. (2) per-tab provider-switching is OUT (NG6) — tabs are
                          Claude-only in P3. (3) the /resume //fork //compact //clear //new built-in
                          COMMAND WORDS are P4 composer triggers — P3 exposes those actions via
                          buttons/menus only (NG1). (4) home-dir / Codex-JSONL / Opencode-ACP history
                          is OUT (NG8) — P3 exercises only the Claude vault path.

2026-05-25 (architect, design): DESIGN-TS-001 written (Parts A/B/C) →
                          specs/threads-sessions/design.md. CLAR-TS-001..004 RESOLVED; the four P3
                          ADRs FILED + ACCEPTED (autonomous drive — architect files, PM accepts, human
                          defers to one final epic-review gate):
                            - ADR-TS-001 (docs/adr/ADR-TS-001-conversation-history-persistence-and-
                              provider-history-port.md) — CLAR-TS-001 + CLAR-TS-003: conversation
                              transcripts persist to VAULT FILES via VaultPort (default
                              .specorator/sessions/<id>.json, configurable PluginSettings.sessionsFolder)
                              — never data.json, never device-local, never a secret. New narrow
                              ProviderHistoryPort (listSessions/hydrate/save/updateMeta/delete/
                              resolveSessionId/buildForkPlan), Result-returning, own InjectionKey +
                              composable, bridge-factory-provided (createProviderHistoryPort()). Fork =
                              DERIVE provider-state (forkSource pointer + truncated transcript), NOT a
                              file copy. ConversationRecord{meta,messages,providerState}; ConversationMeta
                              {id,title,titleManual,createdAt,updatedAt,providerId,sessionId}. 3 bridges:
                              Obsidian=vault files, Mock=in-memory Map, LocalStorage=fixture. HomeFsPort /
                              Codex-JSONL / Opencode history DEFERRED to P9 (NG8). No migration
                              (load-or-default), no secret in any record.
                            - ADR-TS-002 (docs/adr/ADR-TS-002-multi-thread-tabs-store-and-additive-
                              runtime-growth.md) — CLAR-TS-002 + CLAR-TS-003 runtime half: ONE tabsStore
                              (Option A) keyed by tab id holding N TabState DTOs + activeTabId; runners
                              stay OUT of reactive state in a per-TabId WeakMap (the P1 pattern,
                              generalised); one ChatRuntimePort instance PER TAB → per-tab streaming
                              isolation by construction. Vue Router STAYS REMOVED (tabs = in-surface
                              state, not routing). ChatRuntimePort grows ADDITIVELY: resumeSession,
                              setResumeCheckpoint, getCapabilities():RuntimeCapabilities{supportsFork,
                              supportsRewind}. ChatMessage gains optional userMessageId/assistantMessageId/
                              resumeAtMessageId (pre-flagged P3 growth) → rewind-eligibility is a pure
                              app fn. Conversation-only rewind EXECUTES; code-and-conversation GATED
                              (no fs/git, notice — NG7). MIN_TABS=1 (vs Claudian floor 3), MAX clamp 1..10,
                              default 3.
                            - ADR-TS-003 (docs/adr/ADR-TS-003-title-generation-side-query-seam.md) —
                              CLAR-TS-004: title-gen = COLD-START SIDE-QUERY over ChatRuntimePort.query
                              behind a GenerateTitleUseCase (Result<string>); ported pure prompt/parse
                              fns; immediate fallback → async AI title → manual-rename wins; failure keeps
                              fallback, NO blocking error; spin status. AuxModelPort DEFERRED to P4/P5
                              (instruction-refine / inline-edit) — upgrade is additive. NO new port in P3.
                          All additive over P1 nine-member ChatRuntimePort + P1/P2 ChatMessage
                          (REQ-TS-028); provider-addressed, zero provider branches (REQ-TS-026); one
                          Claude impl (REQ-TS-027). README index rows added for all three ADRs. PRD-TS-001
                          advanced draft → ACCEPTED.

                          HAND-OFF → /spec:specify (architect). Build the implementation-ready spec.md
                          (SPEC-TS-001..) on these ADRs. Open clarifications for /spec:specify:
                            (1) Exact PluginSettings.sessionsFolder + maxTabs field shapes + validation
                                (design blesses default .specorator/sessions, maxTabs default 3 clamp 1..10,
                                MIN_TABS=1).
                            (2) Fork-target options in P3 — design recommends NEW-TAB primary; decide
                                whether current-tab fork ships in P3 or defers.
                            (3) ConversationRecord JSON serialisation/versioning detail (no migration, but
                                a version tag for future-proofing is a /spec:specify call).
                          Reuse the P2 context_compacted block + onContextCompacted sink leg for compact
                          (no new render machinery). Preserve the Result/error-as-chunk boundary
                          (ADR-CC-001 §1/§2) and DTO-only store (ADR-003). Tests mirror src/ + data-testid
                          PageObjects; coverage 80/70/80/80; --sp-* parity; no v-html / no window.confirm
                          (Obsidian Modal for fork-target + delete-confirm). Parity-screenshot capture for
                          the 7 sub-surfaces accumulates to the single final human review gate.

2026-05-25 (architect, specification): SPEC-TS-001..034 written →
                          specs/threads-sessions/spec.md. 34 spec items in five layer groups:
                          DOMAIN (001-005), INFRA (006-010), APPLICATION (011-018), UI (019-027),
                          STYLES (028-029), CROSS-CUTTING (030-034). Implementation-ready, claudian
                          paths cited inline, mirrors the P2 SPEC-RR style. 26 automatable TEST-TS
                          (14 U + 6 A + the U/A halves of the mixed ones) + 2 manual legs
                          (TEST-TS-M1 Obsidian vault-file store round-trip; TEST-TS-M2 Obsidian
                          modals + real-CLI resume/rewind). Full REQ-TS↔SPEC-TS↔TEST-TS coverage
                          table (every REQ-TS 001-028 + NFR-TS 001-015 mapped); quality gate green.

                          THE THREE DESIGN OPEN ITEMS RESOLVED:
                            (1) PluginSettings.sessionsFolder (string, default '.specorator/sessions',
                                resolved via resolveSessionsFolder — trim/strip-slash/empty→default,
                                never '') + maxTabs (number, default 3, clampMaxTabs → MIN_TABS=1 ..
                                MAX_TABS_CEILING=10; 0→1, 99→10, NaN→3, 2.7→2). SPEC-TS-005.
                            (2) Current-tab fork SHIPS in P3 — ForkTarget = 'new-tab' | 'current-tab';
                                new-tab primary/default, current-tab the simplest second target (same
                                ForkPlan, only the destination differs). SPEC-TS-023/031.
                            (3) ConversationRecord.version = 1 — a forward-proofing CONSTANT tag, NOT a
                                migration mechanism; reader load-or-defaults any/missing version, writer
                                always stamps 1. SPEC-TS-002/010. NFR-TS-014 (no migration) holds.

                          KEY SHAPES (all additive over P1/P2, claudian-grounded):
                            - ProviderHistoryPort (SPEC-TS-001): listSessions/hydrate/save/updateMeta/
                              delete/resolveSessionId/buildForkPlan — all Result-returning; own
                              PROVIDER_HISTORY_PORT InjectionKey + useProviderHistoryPort composable, no
                              aggregate. ConversationRecord{version,meta,messages,providerState};
                              ConversationMeta{id,title,titleManual,createdAt,updatedAt,providerId,
                              sessionId}; ProviderSessionState=opaque Record (no secret); ForkPlan
                              {messages,providerState(derived forkSource),sourceTitle}. HistoryError
                              {kind:'not-found'|'corrupt'|'io'}.
                            - ChatRuntimePort +3 additive members (SPEC-TS-003): resumeSession(sessionId)
                              :void, setResumeCheckpoint(assistantMessageId):void, getCapabilities():
                              RuntimeCapabilities{supportsFork,supportsRewind}. Nine P1 members
                              byte-identical.
                            - ChatMessage +3 optional fields (SPEC-TS-004): userMessageId?,
                              assistantMessageId? (presence = rewind eligibility), resumeAtMessageId?.
                            - tabsStore (SPEC-TS-019): TabState[] DTOs + activeTabId; per-tab runner in a
                              Map<TabId,TabDeps>/WeakMap OUTSIDE reactive state; one ChatRuntimePort per
                              tab → per-tab streaming isolation; the P1/P2 sink legs operate on the OWNING
                              tab; min 1, clamp maxTabs.

                          HAND-OFF → /spec:tasks (planner). TDD ORDERING HINTS (§12 of spec.md):
                            1. Domain types/ports first (SPEC-TS-001..005) — everything imports these;
                               the additivity contract tests (TEST-TS-003/004/026) gate the rest.
                            2. Settings fields + resolve/clamp helpers (SPEC-TS-005) and the pure
                               transforms (conversationRecordCodec SPEC-TS-010 load-or-default-never-throw,
                               titleGeneration SPEC-TS-016 pure half, rewindEligibility SPEC-TS-018) —
                               fully unit-testable, no mount, de-risk the use cases.
                            3. The additive ChatRuntimePort members + the history port impls EARLY:
                               Mock + LocalStorage stores (SPEC-TS-006/007/008/009) so npm run dev + demo
                               + units exercise full history/resume/fork with no vault; wire the
                               fake-ports factory's new `providerHistory` member here. THE OBSIDIAN
                               VAULT-FILE STORE (SPEC-TS-006) + CLI session seam ARE COVERAGE-EXCLUDED →
                               MANUAL LEG (TEST-TS-M1/M2).
                            4. Use cases (SPEC-TS-011..017) — Result-returning, against the Mock store;
                               preserve the Result/streaming-error boundary; compact reuses the existing
                               P2 context_compacted chunk + onContextCompacted sink leg (no new render
                               machinery).
                            5. tabsStore (SPEC-TS-019), THEN components (TabBar 020, ResumeSessionDropdown
                               022, gated hover affordances 025, per-tab ChatSurface 026) with data-testid
                               PageObjects. The two Obsidian Modal subclasses (ForkTargetModal,
                               DeleteConfirmModal) + the rewind menu live with the view (NOT src/ui/**);
                               visual proof = manual leg, pure logic (chooseForkTarget, mode dispatch) =
                               unit.
                            6. Styles (§4.10 token block, SPEC-TS-028) + wiring (SPEC-TS-027: provide
                               PROVIDER_HISTORY_PORT in both mount points; TabBar over ChatSurface;
                               one runtime per tab).
                          No open clarification blocks tasks. Coverage 80/70/80/80; --sp-* parity; no
                          v-html / no window.confirm (Obsidian Modal for fork-target + delete-confirm);
                          provider-addressed (grep gate TEST-TS-026), one Claude impl.

2026-05-25 (planner, tasks): TASKS-TS-001 written → specs/threads-sessions/tasks.md. 42 tasks
                          (T-TS-001..042) decomposing SPEC-TS-001..034, TDD-ordered (RED qa task
                          before each green dev task; every dev task's first DoD line = "the prior
                          RED test(s) now pass"), DDD inward layering: baseline → DOMAIN (002-006) →
                          INFRA (007-013) → APPLICATION (014-025) → UI (026-035) → STYLES (036) →
                          WIRE-IN (037-039) → GATE (040-042). Each Vue component task pairs a
                          data-testid PageObject + a no-v-html/no-window.confirm DoD line;
                          ForkTargetModal/DeleteConfirmModal are Obsidian Modal subclasses (T-TS-035).
                          Coverage table maps all 34 SPEC-TS + 28 REQ-TS + 15 NFR-TS + 26 automatable
                          TEST-TS + the 2 manual legs (TEST-TS-M1/M2) to ≥1 task; M1/M2 ride the single
                          final human review gate (T-TS-040/041, human-owned, never agent-self-claimed).

                          DELETED-SYMBOL GUARD: NO relaxation task needed in P3 (verified against
                          eslint.config.js) — unlike P2's IconPort/SpIcon/ICON_PORT, none of the P3
                          symbols (ProviderHistoryPort, PROVIDER_HISTORY_PORT, ConversationRecord,
                          tabsStore, TabBar, ResumeSessionDropdown, ForkTargetModal, DeleteConfirmModal)
                          were P0-deleted; DELETED_SUBSYSTEM_BAN + DELETED_INJECTION_KEYS don't list
                          them and @/domain/chat regrew in P1. T-TS-001 + T-TS-042 carry a one-line
                          lint-confirmation DoD.

                          HAND-OFF → /spec:implement (dev) + /spec:test (qa). FIRST READY TASK:
                          T-TS-002 (qa) — RED: domain port/types/settings + additive ChatRuntimePort/
                          ChatMessage growth (structural; TEST-TS-001..005). It is the RED pair gating
                          the domain impl tasks (T-TS-003..006). NO-DEP TASKS (Batch 0 — start in
                          parallel immediately): T-TS-001 (dev, baseline 📐), T-TS-002 (qa, domain RED),
                          T-TS-014 (qa, titleGeneration RED), T-TS-036 (dev, tokens 🔨). Critical path
                          (16 tasks): 002→003→004→009→010→018→019→026→027→030→031→034→035→037→038→042.
                          Coverage 80/70/80/80; --sp-* parity; provider-addressed grep gate; one Claude
                          impl; manifest untouched; verify + test:all green at T-TS-042 (draft PR → next).

2026-05-25 (dev, implement — domain+infra batch): T-TS-001..013 EXECUTED on
                          feature/threads-sessions (STRICT TDD, one Conventional commit per task) →
                          specs/threads-sessions/implementation-log.md (IMPL-TS-001).
                          COMPLETED + SHAs:
                            T-TS-001 1990dcc (baseline parity scaffold + guard verification, doc-only)
                            T-TS-002 ccb9e5c (qa RED: domain port/types/settings + additive growth)
                            T-TS-003 753b2a9 (ConversationRecord types + CONVERSATION_RECORD_VERSION)
                            T-TS-004 99baab2 (ProviderHistoryPort + HistoryError + PROVIDER_HISTORY_PORT + barrel)
                            T-TS-005 a263d14 (additive ChatRuntimePort/ChatMessage growth + forceColdStart)
                            T-TS-006 b77048b (PluginSettings.sessionsFolder + maxTabs + resolve/clamp)
                            T-TS-007 e84ec06 (qa RED: conversationRecordCodec + buildForkPlan)
                            T-TS-008 325176b (conversationRecordCodec.ts + pure buildForkPlan.ts)
                            T-TS-009 50ede98 (qa RED: Mock/LocalStorage history stores + fake-ports member)
                            T-TS-010 138303c (MockHistoryStore + FixtureHistoryStore + fake-ports providerHistory)
                            T-TS-011 899bb58 (VaultFileHistoryStore — coverage-excluded; manual leg TEST-TS-M1)
                            T-TS-012 42fc119 (qa RED behavioural contract; passes-on-author — see below)
                            T-TS-013 (this commit) — no further prod code; the lint fix to the codec test rides here.
                          STATE: vue-tsc -p tsconfig.lint.json = 0 errors; npx eslint . = 0 errors
                          (3 pre-existing P0 warnings); npx vitest run = 101 files / 779 passed
                          (was 743 pre-batch; P0/P1/P2 GREEN — no regression). NOT run (orchestrator
                          gate): full verify/build/build:web/test:storybook. Manifest untouched. No push.

                          THE THREE ADDITIVE ChatRuntimePort MEMBERS (SPEC-TS-009, ALL three runtimes):
                            - MockChatRuntime / FixtureChatRuntime: resumeSession/setResumeCheckpoint =
                              recorded no-ops (getResumedSessionId/getResumeCheckpoint accessors);
                              getCapabilities() → {supportsFork:true,supportsRewind:true}; forceColdStart
                              recorded per query (getLastForceColdStart) + a scripted text→done cold-start
                              side-query for title-gen.
                            - ClaudeCliChatRuntime (coverage-excluded): resumeSession(sessionId) sets the
                              next --resume session id (empty → cold-start, EC-TS-5); setResumeCheckpoint
                              stores a pending resume-at consumed once per turn (debug-logged, no message
                              content — NFR-TS-013); getCapabilities() → {fork,rewind}; forceColdStart in
                              _buildArgs skips --resume for that one query.

                          DEVIATION (load-bearing, recorded in IMPL-TS-001): the additive ChatRuntimePort
                          growth forces EVERY implementor to satisfy the grown interface for the codebase
                          to compile, so the runtime-member impls necessarily landed in T-TS-005 (the
                          green of the domain growth), not T-TS-013. T-TS-012's RED test therefore passes
                          on author (a behavioural-confirmation contract). Two P1/P2 exact-count test
                          ASSERTIONS (ChatRuntimePort.test.ts exact-nine; ChatMessage.rr.test.ts
                          rewind-id-absent) + the P0 PSR settings-shape assertions were updated to the
                          superseding additive contract (qa-owned test-assertion changes executed within
                          this batch's qa-RED scope; the new *.ts.test.ts files carry the exact contracts).
                          test-plan.md does NOT yet exist (a qa-stage artifact) — the two manual legs
                          (TEST-TS-M1 vault-file round-trip + reload; TEST-TS-M2 real-CLI resume/rewind)
                          are recorded in IMPL-TS-001 pending qa authoring test-plan.md; both ride the
                          single final epic-review human gate, never agent-self-claimed.

                          HAND-OFF → NEXT BATCH = APPLICATION (T-TS-014..025). FIRST READY TASK:
                          T-TS-014 (qa RED) — titleGeneration.ts pure transforms (no deps, Batch-0
                          parallel-ready): parseTitleGenerationResponse (50-char/strip-quotes/sentence-
                          case/''→null), fallbackTitle (truncate/empty→'New conversation'),
                          TITLE_GENERATION_SYSTEM_PROMPT + buildTitleGenerationPrompt ported VERBATIM
                          from claudian core/prompt/titleGeneration.ts (SPEC-TS-016, TEST-TS-019). Then
                          T-TS-016/018/020/022/024 RED gate the use cases (List/Resume/Fork/Rewind/
                          Compact/GenerateTitle/Rename/Delete + chooseForkTarget + rewindEligibility).

2026-05-25 (dev, implement — application batch): T-TS-014..025 EXECUTED on
                          feature/threads-sessions (STRICT TDD, one Conventional commit per RED +
                          per impl) → specs/threads-sessions/implementation-log.md (IMPL-TS-001).
                          COMPLETED + SHAs (RED → impl):
                            T-TS-014 f5aab20 → T-TS-015 028db4a (titleGeneration.ts pure transforms)
                            T-TS-016 6213cd2 → T-TS-017 f485359 (rewindEligibility.ts pure scan)
                            T-TS-018 eeced66 → T-TS-019 9525273 (List/Resume/Rename/Delete use cases +
                              useProviderHistoryPort)
                            T-TS-020 141a758 → T-TS-021 7a16589 (ForkConversationUseCase + chooseForkTarget)
                            T-TS-022 13b563e → T-TS-023 c7e0c11 (RewindConversationUseCase conv/code modes)
                            T-TS-024 f53797f → T-TS-025 9a36954 (GenerateTitleUseCase + CompactConversationUseCase)
                          STATE: vue-tsc -p tsconfig.lint.json = 0 errors; npx eslint . = 0 errors
                          (3 pre-existing P0 warnings); npx vitest run = 113 files / 830 passed
                          (was 779 after the infra batch; +51 new app/composable tests; P0/P1/P2/
                          domain/infra GREEN — no regression). Application layer imports domain only;
                          every discrete use case returns Result<…,Error>; pure transforms total/
                          never-throw; GenerateTitle drains via tryAsync (no raw try/catch);
                          complexity ≤10 holds. NOT run (orchestrator gate): full verify/build/
                          build:web/test:storybook. Manifest untouched. No push.

                          PATH NOTE: the application files landed under src/application/threads/ +
                          tests/application/threads/ (the spec.md SPEC-TS-011..018 + tasks.md DoD
                          canonical path), NOT src/application/chat/. useProviderHistoryPort.ts is the
                          one UI composable in this batch (T-TS-019 DoD), under src/ui/composables/.

                          DEVIATIONS (all recorded in IMPL-TS-001): (1) parseTitleGenerationResponse is
                          the claudian verbatim port (no explicit post-parse sentence-case beyond strip
                          quotes / trailing punctuation / 50-char cap — the spec's "sentence-case" note
                          describes the model output the system prompt requests). (2) RewindResult
                          carries the spec's {truncatedThrough,checkpointSet} exactly plus
                          checkpointMessageId + notice (the data §SPEC-TS-014 says the caller needs);
                          the use case takes no port → cannot touch fs by construction (EC-TS-9).
                          (3) GenerateTitle frames the side-query prompt into the turn text + Compact
                          uses a /compact command (P3 ChatTurnRequest carries only text; no invented
                          domain field) — the real-CLI compact/title seams are coverage-excluded →
                          TEST-TS-M2. Manual legs TEST-TS-M1/M2 unchanged, for the single final
                          epic-review human gate; test-plan.md still a pending qa-stage artifact.

                          HAND-OFF → NEXT BATCH = UI (T-TS-026..035). FIRST READY TASK:
                          T-TS-026 (qa RED) — tabsStore (SPEC-TS-019): N TabState DTOs + activeTabId +
                          per-TabId runner WeakMap + per-tab streaming isolation + min-1/clamp
                          (EC-TS-1/2/3/13), DTO-only (no reactive use-case instance, TEST-TS-022/023).
                          Then T-TS-027..035: TabBar + ResumeSessionDropdown + gated fork/rewind hover
                          affordances + rewind menu + per-tab ChatSurface + compact + the two Obsidian
                          Modal subclasses (ForkTargetModal, DeleteConfirmModal), each with a
                          data-testid PageObject (ADR-009). VERIFICATION PERFORMED THIS BATCH: typecheck
                          0, lint 0 errors, 830 unit tests green. REMAINING OWNER: dev (UI batch) +
                          qa (test-plan.md). NEXT AGENT: dev (/spec:implement) + qa (/spec:test).

2026-05-25 (dev, implement — ui batch): T-TS-026..035 + T-TS-037/038 EXECUTED on
                          feature/threads-sessions (STRICT TDD, one Conventional commit per task) →
                          implementation-log.md (IMPL-TS-001, "UI + wire-in batch" section).
                          COMPLETED + SHAs (RED → impl):
                            T-TS-026 0a88dd5 → T-TS-027 25eb431 (tabsStore: N TabState DTOs + per-tab
                              runner Map OUTSIDE reactive state + isolation + persist/title ladder)
                            T-TS-028 cefd665 → T-TS-029 404385f (TabBar.vue state machine + roving
                              tabindex + P3 i18n keys en+de)
                            T-TS-030 ae40ef3 → T-TS-031 18dd8e2 (ResumeSessionDropdown.vue + modalSeam
                              CONFIRM_DELETE/CHOOSE_FORK_TARGET)
                            T-TS-032 4985d5c → T-TS-033 c7d788f (gated fork/rewind affordances + in-surface
                              two-mode rewind menu on MessageTurn.vue)
                            T-TS-034 2cad464 → T-TS-035 ab68966 (ChatSurface per-tab binding + compact +
                              ForkTargetModal/DeleteConfirmModal Obsidian Modal subclasses)
                            T-TS-037 465065b → T-TS-038 b514b9c (provide PROVIDER_HISTORY_PORT + per-tab
                              runtime factory + modal seams in AgentSidebarView + ui/main.ts)

                          MODEL CHOSEN (ADR-TS-002 §1 Option A): tabsStore OWNS the per-tab chat state
                          (TabState[] DTOs + activeTabId); per-TabId runtime+runner held in a Map keyed
                          by store instance via WeakMap, OUTSIDE reactive state; one ChatRuntimePort per
                          tab → streaming isolated by construction (sink legs resolve the live message
                          through the OWNING tab, scoped by the runner's closed-over TabId). P1 chatStore
                          UNTOUCHED (still its own single-thread unit); ChatSurface rebinds to
                          tabsStore.activeTab; MessageList/UsageInfo gained OPTIONAL props (chatStore
                          fallback) so their P1 unit tests stay green — the lowest-churn path keeping P2
                          block rendering on the active tab.

                          OBSIDIAN MODALS w/o Vue importing obsidian: src/ui/chat/modalSeam.ts declares
                          CONFIRM_DELETE / CHOOSE_FORK_TARGET / CHAT_RUNTIME_FACTORY UI InjectionKeys; the
                          Vue components inject + call these handles. AgentSidebarView provides them by
                          constructing the real Obsidian Modal subclasses (src/plugin/modals/, createEl/
                          setText, no innerHTML, resolve a Promise); the standalone demo provides
                          browser-safe stand-ins (no window.*).

                          VERIFICATION PERFORMED THIS BATCH: vue-tsc -p tsconfig.lint.json = 0 errors;
                          eslint . = 0 errors (4 warnings: 2 pre-existing P0 ErrorBoundary
                          one-component-per-file, 1 chatStore + 1 tabsStore max-lines — warn-tier
                          src/ui/**, non-failing, same precedent as P1 chatStore); vitest run = 119 files
                          / 882 passed (was 830 after the application batch; +52 UI/store/wire tests;
                          P0/P1/P2 + domain/infra/application GREEN — no regression). Provider-addressed
                          grep gate clean. Manifest untouched. No push. NOT run (orchestrator gate): full
                          verify/build/build:web/test:storybook.

                          DEVIATIONS (recorded in IMPL-TS-001): (1) tabsStore max-lines warning (596,
                          budget 350) — warn-tier, non-failing, same role as P1 chatStore; sink-builder
                          extraction deferred to avoid churn on isolation-tested legs. (2) the per-tab
                          ChatSurface rewire required a P1 ChatSurface.test.ts HARNESS update (provide the
                          new ports + the runtime factory) — NOT an assertion change; the P1/P2
                          mount.test/mount.rr.test were restored to green by the T-TS-038 wire-in so the
                          tree never ships red. (3) useChatRuntimePort/CHAT_RUNTIME_PORT kept provided
                          (P1 public contract) though no longer consumed by a component.

                          HAND-OFF → STYLES + dev-smoke + GATE. FIRST READY TASK: T-TS-036 (dev, styles 🔨,
                          no deps) — add the §4.10 --sp-* token block to src/ui/styles/tokens.css per
                          SPEC-TS-028: --sp-tab-size, --sp-tab-border-idle/active/streaming/attention,
                          --sp-history-row-h, --sp-history-delete, --sp-history-blur,
                          --sp-fork-modal-max-inline, the [data-provider='claude'] streaming-border brand
                          override, and the prefers-reduced-motion guard zeroing --sp-history-spin-duration
                          (reuse the existing P2 `spin` keyframe — NO new keyframe). The P3 components
                          already reference these tokens with graceful fallbacks. Then T-TS-039 (qa, npm
                          run dev multi-tab smoke), T-TS-040/041 (human-owned manual legs TEST-TS-M1/M2),
                          T-TS-042 (dev — full verify + parity self-review + draft PR into next).
                          REMAINING OWNER: dev (styles T-TS-036 + gate T-TS-042) + qa (test-plan.md +
                          T-TS-039) + human (T-TS-040/041 manual legs). NEXT AGENT: dev (/spec:implement).

2026-05-25 (dev, implement — styles+smoke batch): T-TS-036 + T-TS-039 EXECUTED on
                          feature/threads-sessions (one Conventional commit per task) →
                          implementation-log.md (IMPL-TS-001, "Styles + smoke batch" section).
                          COMPLETED + SHAs:
                            T-TS-036 6485a17 (styles 🔨 — §4.10 --sp-* token block in tokens.css +
                              tokens contract test)
                            T-TS-039 519a2cc (dev-leg smoke 🧪 — tests/ui/main.ts.test.ts standalone
                              multi-tab)

                          T-TS-036: added the §4.10 — Threads & sessions (P3) block to
                          src/ui/styles/tokens.css per SPEC-TS-028 — tab badges (--sp-tab-size,
                          --sp-tab-border-idle/active/streaming/attention), history rows
                          (--sp-history-row-h, --sp-history-delete), drop-UP blur (--sp-history-blur),
                          fork-modal width (--sp-fork-modal-max-inline), the [data-provider='claude']
                          streaming-border brand override, and the prefers-reduced-motion guard zeroing
                          --sp-history-spin-duration (REUSES the existing P2 `spin` keyframe — NO new
                          keyframe). Colour literals confined to the token layer (NFR-TS-012). Every
                          --sp-* token the P3 components reference (TabBar / ResumeSessionDropdown /
                          MessageTurn / ForkTargetModal) now exists. Extended tokens.test.ts with the
                          §4.10 presence + reduced-motion assertions (quote-agnostic provider selector).

                          T-TS-039: added tests/ui/main.ts.test.ts (the deterministic leg of
                          TEST-TS-026). It mounts @/ui/main against MockBridge and asserts the multi-tab
                          surface mounts (TabBar + one badge + welcome + history opener), a second tab
                          opens (two badges), switching tabs swaps the active conversation (send in tab 1
                          → message-list; new tab → welcome; switch back → message-list returns; EC-TS-3),
                          and the active tab renders the P1/P2 chat surface. data-testid-only;
                          flushPromises + nextTick. The live-browser feel + real-CLI resume/rewind pair
                          with the human's final review (T-TS-040/041). test-plan.md (the TEST-TS-026
                          dev-leg pass/date recording) remains a pending qa-stage artifact.

                          VERIFICATION PERFORMED THIS BATCH: vue-tsc -p tsconfig.lint.json = 0 errors;
                          eslint (touched test files) = 0 errors; prettier --check (tokens.css + both
                          test files) clean; npm run lint:style-tokens = clean (0 violations); vitest run
                          = 120 files / 885 passed (was 119 / 882; +3 new assertions/test; P0/P1/P2/P3 +
                          domain/infra/application GREEN — no regression). Manifest untouched. No push.
                          NOT run (orchestrator gate T-TS-042): full verify/build/build:web/docs:api/
                          test:storybook.

                          REMAINING: T-TS-040/041 (HUMAN-owned manual legs TEST-TS-M1/M2 — vault-file
                          round-trip + Obsidian Modal flows + real-CLI resume/rewind; never
                          agent-self-claimed) + T-TS-042 (ORCHESTRATOR — full npm run verify + parity
                          self-review over the seven sub-surfaces + draft PR into next) + qa
                          (test-plan.md authoring + TEST-TS-026 dev-leg recording).
                          NEXT AGENT: human (T-TS-040/041) ∥ orchestrator (T-TS-042).

2026-05-25 (reviewer, parity review): REVIEW-TS-001 + TRACE-TS-001 written →
                          specs/threads-sessions/{review.md,traceability.md}. VERDICT = **BLOCKED**
                          (autonomous self-review gate, pre-merge to next). Reviewed feature/threads-
                          sessions @ 5d1b52f vs claudian-main, P3 surface scoped out of the 856-file
                          reboot diff (base merge-base=8b7cb77). Ran the threads app + tabsStore suites
                          (68 passed) and quality:metrics (overall 64.3, maturity L1 — pending artifacts,
                          not a signal).

                          HEADLINE — THREE P1 BLOCKERS, all the R-RR-001 failure mode (real-CLI/real-
                          Obsidian path dead/incomplete but UNIT-GREEN via Mock/Fixture):
                            - R-TS-001 (REQ-TS-019/020): rewind eligibility keys on
                              ChatMessage.assistantMessageId, which is NEVER set on the live turn path
                              (assistantMessage()/sink legs/ClaudeStreamReducer/MockChatRuntime all omit
                              it; only LocalStorage fixtures + hand-seeded tests carry it). The rewind
                              control therefore never renders for any real conversation. Claudian derives
                              it from the SDK turn UUID (ClaudeChatRuntime.ts:500-515).
                            - R-TS-002 (REQ-TS-021): conversation-only rewind does NOT rewind the provider
                              session on the subprocess CLI — setResumeCheckpoint stores resumeCheckpoint
                              (ClaudeCliChatRuntime.ts:169) but query() logs+clears it (:80-85) and
                              _buildArgs emits only --resume <sessionId> (:193-206). UI truncates so it
                              LOOKS rewound; the model continues from the latest state. Claudian passes
                              resumeSessionAt to the Agent SDK (ClaudeQueryOptionsBuilder.ts:164-166).
                              LIKELY a transport-mismatch → architect ADR (SDK vs subprocess) needed.
                            - R-TS-003 (REQ-TS-018): fork lineage (forkSource providerState) is derived by
                              buildForkPlan.ts:42 then DROPPED — tabsStore.forkActive omits providerState
                              from the payload (:382), _persistTab hard-codes providerState:{} (:693). Forked
                              tabs persist with no lineage → next turn cold-starts instead of resuming the
                              source session at the fork point.

                          P2 correctness: R-TS-004 (_persistTab resets createdAt + wipes providerState on
                          every save → wrong history ordering/dates + lineage loss), R-TS-005 (resume
                          clobbers the active tab incl. an in-flight stream with no cancel/guard), R-TS-006
                          (compact boundary may be dropped — no live assistant message to attach
                          onContextCompacted to). Brand: R-TS-007 — 🗑/✎/⌃ emoji+glyphs in
                          ResumeSessionDropdown.vue instead of SpIcon (Lucide) — emoji is brand-blocking-
                          class; folded into BLOCKED. Parity polish (P3): R-TS-008 badge priority
                          (streaming-vs-attention swapped vs Claudian), R-TS-009 per-badge data-provider
                          (defer P9), R-TS-010 resolveSessionId omits providerSessionId lookup.

                          SOLID (do not regress): per-tab streaming isolation (one runtime/tab + tabId-
                          scoped sink closures), the pure codec (resume DOES reconstruct rich contentBlocks
                          — the flagged most-likely-gap is actually fine), zero provider branches
                          (REQ-TS-026 clean), additivity intact (REQ-TS-028), title-gen uses a FRESH runtime
                          (no forceColdStart pollution), Obsidian-Modal seams keep Vue obsidian-free.

                          CORRECT DEFERRALS confirmed (not gaps): P4 command-words, P7 approvals, P5
                          attachments, P8 MCP, P9 other-provider history, NG7 code-rewind fs effect (gated
                          by construction). Tabs-across-reload is out of P3 scope (Claudian doesn't persist
                          open tabs either).

                          HAND-OFF → orchestrator: dispatch fixes to OWNING agents, then re-test + re-review.
                            - dev: R-TS-001 (runtime+reducer+sink surface assistantMessageId), R-TS-003/004
                              (carry+persist fork lineage; preserve createdAt; persist providerState),
                              R-TS-005 (resume guard/cancel), R-TS-006 (compact live message), R-TS-007
                              (emoji→SpIcon).
                            - architect: R-TS-002 — decide SDK-vs-subprocess transport for the rewind-at
                              seam (ADR), or amend REQ-TS-021 to the achievable semantics. Do not ship the
                              silent no-op.
                            - qa: after fixes, add REAL-SHAPED contract tests for the three seams (drive the
                              actual ClaudeStreamReducer / assert resume-at args / assert persisted lineage —
                              NOT fixture-seeded DTOs), author test-plan.md + test-report.md, run the manual
                              legs TEST-TS-M1/M2 (which would have caught R-TS-001/002/003).
                            - reviewer: regenerate traceability.md (clear the 3 broken chains) + re-verdict
                              once the blockers close.
                          P3 must NOT merge to next until R-TS-001..007 are resolved (or R-TS-002 descoped
                          by ADR) and the verify gate (T-TS-042) is green.

2026-05-25 (dev, implement — parity-fix batch): R-TS-001/003/004/005/006/007 RESOLVED on
                          feature/threads-sessions (STRICT TDD, RED→green, one Conventional commit per
                          finding/pair) → implementation-log.md ("Parity-fix batch" section) +
                          review.md (Resolution log).
                          COMMITS:
                            R-TS-001    e34f18c (populate message ids on the live turn path)
                            R-TS-003/004 6f5e874 (persist fork lineage + preserve createdAt/providerState)
                            R-TS-005/006 6cef786 (guard resume clobber + standalone compact boundary)
                            R-TS-007    b14021f (history-list emoji glyphs → Lucide SpIcon)

                          R-TS-001: ClaudeStreamReducer captures the per-turn assistant id (envelope uuid
                          / inner message.id) → terminal `done`; RunChatTurnUseCase forwards to
                          onDone(assistantMessageId?); tabsStore stamps assistantMessageId on the live
                          assistant message (runtime id else a stable id at finalise) + userMessageId on
                          the user message at send; MockChatRuntime surfaces the id. Rewind eligibility
                          (REQ-TS-019/020) now reaches production. Additive done.assistantMessageId?
                          forced four P1/P2 exact-`done` test assertions to the additive contract
                          (toMatchObject; same class as the T-TS-005 qa-RED update). R-TS-002 (the
                          conversation-rewind EXECUTION on the subprocess transport) is NOT touched —
                          architect's ADR; this fix only populates the ids.

                          R-TS-003/004: TabState grows createdAt (set once) + providerState; forkActive
                          threads the derived {forkSource} through TabLoadPayload → TabState; _persistTab
                          persists {...tab.providerState} (was {}) + preserves createdAt (only bumps
                          updatedAt). Forked tab resumes the source session (REQ-TS-018); history orders
                          newest-first (REQ-TS-008/010).

                          R-TS-005/006: loadIntoTab cancels an in-flight runner before overwriting a
                          streaming tab (claudian-faithful busy guard — no transcript corruption);
                          onContextCompacted seeds a fresh live assistant message when the compact turn
                          produced none → the boundary always renders (REQ-TS-023).

                          R-TS-007: ResumeSessionDropdown.vue ⌃/✎/🗑 → <SpIcon chevron-up/pencil/trash-2>;
                          three lucide shapes added to the static icon map. No emoji/glyph literal.

                          VERIFICATION: vue-tsc -p tsconfig.lint.json 0 errors; eslint touched files
                          0 errors (only pre-existing warn-tier max-lines); chat-UI + store + application
                          + history + domain suites GREEN (no P0/P1/P2/P3 regression). Manifest untouched.
                          No push. NOT run (orchestrator gate T-TS-042): full verify/build/build:web/
                          docs:api/test:storybook.

                          HAND-OFF →
                            - architect: R-TS-002 transport ADR (SDK vs subprocess --resume-at) or amend
                              REQ-TS-021 to the achievable semantics. Do not ship the silent no-op. This
                              is the ONLY remaining P1 blocker for the BLOCKED verdict.
                            - qa: with the ids/lineage now populated on the real path, add the REAL-SHAPED
                              contract tests REVIEW-TS-001 §Risks names (drive the actual ClaudeStreamReducer
                              → assert done.assistantMessageId; assert the persisted forkSource lineage),
                              author test-plan.md + test-report.md, run TEST-TS-M1/M2.
                            - reviewer: regenerate traceability.md (REQ-TS-018/019 chains now populated) +
                              re-verdict once R-TS-002 closes and the verify gate is green.
                            - R-TS-008/009/010 remain scheduled P3-polish / P9.
                          REMAINING OWNER: architect (R-TS-002) + qa (test-plan/report + manual legs) +
                          orchestrator (T-TS-042 verify gate). NEXT AGENT: architect (R-TS-002 ADR).
```
