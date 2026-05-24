---
feature: threads-sessions
area: TS
current_stage: design
status: active
last_updated: 2026-05-25
last_agent: architect (design)
epic: claudian-reboot
phase: P3
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.2 + audits + claudian-main stand in, mirrors P1/P2)
  research.md: skipped (charter §3.2 + audits + claudian-main stand in)
  requirements.md: accepted (PRD-TS-001; CLAR-TS-001..004 resolved by ADR-TS-001/002/003)
  design.md: complete (DESIGN-TS-001; Parts A/B/C; ADR-TS-001/002/003 accepted)
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

# Workflow state — threads-sessions (P3)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted (PRD-TS-001) |
| 4. Design | `design.md` | complete (DESIGN-TS-001) |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
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
```
