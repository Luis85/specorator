---
feature: composer-power
area: CP
current_stage: tasks
status: active
last_updated: 2026-05-25
last_agent: dev (review remediation — R-CP-001/002 P2)
epic: claudian-reboot
phase: P4
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.3 + audits + claudian-main stand in, mirrors P1-P3)
  research.md: skipped
  requirements.md: accepted (PRD-CP-001; released after ADR-CP-001..004 accepted)
  design.md: complete (DESIGN-CP-001; A/B/C; ADR-CP-001..004 accepted)
  spec.md: complete (SPEC-CP-001..038; TEST-CP-001..028 + M1/M2)
  tasks.md: complete (TASKS-CP-001; T-CP-001..053)
  implementation-log.md: in-progress (DOMAIN+INFRA T-CP-001..014 + T-CP-047 + APPLICATION T-CP-015..026 + UI batch 1 T-CP-027..034 + UI batch 2 T-CP-035..046 + WIRE-IN T-CP-048..050 + REVIEW REMEDIATION R-CP-001 ade17d6 / R-CP-002 8171fad done; remaining = T-CP-051/052 manual legs [human, final review] + T-CP-053 verify gate [orchestrator])
  test-plan.md: in-progress (guard verification + M1/M2 manual legs scheduled; TEST-CP-026 dev leg PASS 2026-05-25; TEST-CP status by batch)
  test-report.md: pending
  review.md: complete (REVIEW-CP-001; Approved with conditions — both P2 R-CP-001 ade17d6 / R-CP-002 8171fad RESOLVED; R-CP-003..009 P3 scheduled)
  traceability.md: complete (TRACE-CP-001; the 2 real-path-dead chains now wired — R-CP-001/002 fixed)
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — composer-power (P4)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted (PRD-CP-001) |
| 4. Design | `design.md` | complete (DESIGN-CP-001) |
| 5. Specification | `spec.md` | complete (SPEC-CP-001..038) |
| 6. Tasks | `tasks.md` | complete (TASKS-CP-001; T-CP-001..053) |
| 7. Implementation | `implementation-log.md` + code | in-progress (DOMAIN+INFRA + tokens + APPLICATION + UI batch 1 + UI batch 2 + WIRE-IN + REVIEW REMEDIATION R-CP-001/002 done; remaining = T-CP-051/052 manual legs [human] + T-CP-053 verify gate [orchestrator]) |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | complete (Approved with conditions — both P2 RESOLVED) |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P4 (composer power)

P0 #432, P1 #433, P2 #436, P3 #437 merged to `next`. P4 = composer power on the P1-P3 chat surface.

**Scope (charter §4 P4 row + §3.3 + inline blocks):**
- **Slash commands `/`** + **Skills `$`** (`SlashCommandDropdown`, `builtInCommands`, `slashCommand.ts`,
  `ProviderCommandCatalog`/`ClaudeCommandCatalog`, `SlashCommandStorage`/`SkillStorage`)
- **`@mention`** of vault files / subagents / MCP servers / external dirs (`MentionDropdownController`,
  `VaultMentionCache`, `VaultMentionDataProvider`, `contextMentionResolver`, `shared/mention/types.ts`)
- **Instruction mode `#`** (`InstructionModeManager`, `InstructionConfirmModal`, `instructionRefine`,
  `QueryBackedInstructionRefineService`)
- **Plan mode** toggle (Shift+Tab) + the inline **plan/exit-plan/ask-user blocks**
  (`InlineExitPlanMode`, `InlinePlanApproval`, `InlineAskUserQuestion`) — these are INTERACTIVE
  (the user responds inline); the plan-mode composer state + the render+response of these blocks.
- **Bang-bash `!`** run-bash mode (`BangBashModeManager`, `BangBashService`)
- `InputController` + `InputToolbar` composer-mode orchestration; CSS: slash-commands / plan-mode /
  ask-user-question / input.

**Out of P4 (later phases):** context/attachments — file chips, images, selection, inline-edit (P5);
toolbar widget selectors + usage meter (P6); the APPROVAL MACHINERY — ApprovalManager, permission
rules + persistence (P7 — note P4 renders + responds to the inline ask-user/exit-plan/plan-approval
blocks, but the security/approval-rules layer is P7); MCP client (P8); Codex/Opencode + their
skill/command/mention providers (P9 — P4 builds the per-provider command/skill/mention SEAMS but
wires only Claude); settings UX (P10).

**Likely P4 ADR decisions (autonomous — record each):**
- Composer-mode model: how `/`, `$`, `@`, `#`, `!` trigger detection + the dropdown/overlay state
  attach to the P1 `ChatComposer` (a composer-mode state machine; mirror `InputController`).
- New narrow ports the audits name: a **mention/vault-listing seam** (`@`-file mentions read the
  vault — `VaultPort.listFiles` exists; subagent/MCP mentions need a catalog seam), a **command/skill
  catalog seam** (`ProviderCommandCatalog`/`SkillStorage`), and a **bang-bash execution seam** (run a
  shell command — a process/exec port; respect the no-secret + sandbox constraints). Decide port vs
  reuse.
- Instruction-refine seam (`QueryBackedInstructionRefineService`) — side-query like P3 title-gen
  (reuse the cold-start side-query pattern / the deferred AuxModelPort decision from ADR-TS-003).
- The inline interactive blocks' response transport (ask-user-question answer / exit-plan approval →
  back to the runtime) on the `ChatRuntimePort` (a respond/answer seam) — and what the `claude --print`
  CLI can faithfully carry (cf. ADR-TS-004 transport-honesty: gate by capability if the CLI can't).
- Confirm modals (InstructionConfirmModal) via the Obsidian `Modal` seam (P3's modalSeam pattern).

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat; DDD inward imports + narrow ports
+ 3 bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm` (Obsidian `Modal`
via the modalSeam for confirms); `<script setup>`; `Result<T,E>`; tests mirror `src/` + `data-testid`
PageObjects; coverage 80/70/80/80; perceptual `--sp-*` parity; identity stays Specorator; WCAG 2.2 AA
(dropdown listbox/combobox, keyboard nav); manifest untouched; CI SHA-pinned + actionlint. VERIFY GATE
(`npm run verify` + `npm run test:all` exit zero). **bang-bash runs a shell command** — treat as a
dual-use capability: only the user's own explicit `!cmd`, no auto-exec, surface output as a tool-like
block; respect the security posture.

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after each big chunk; merge P4 to `next` autonomously; manual-Obsidian
+ parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.3/§4/§5/§6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (§3.3 sources:
`features/chat/controllers/InputController.ts`, `features/chat/ui/{InputToolbar,InstructionModeManager,BangBashModeManager}.ts`,
`features/chat/services/BangBashService.ts`, `features/chat/rendering/{InlineAskUserQuestion,InlineExitPlanMode,InlinePlanApproval}.ts`,
`shared/components/SlashCommandDropdown.ts`, `shared/mention/{MentionDropdownController,VaultMentionCache,VaultMentionDataProvider,types}.ts`,
`shared/modals/InstructionConfirmModal.ts`, `core/commands/builtInCommands.ts`, `core/prompt/instructionRefine.ts`,
`core/providers/commands/*`, `utils/{slashCommand,contextMentionResolver}.ts`,
`providers/claude/{commands,storage}/*`).

## Hand-off notes

```
2026-05-25 (orchestrator): P4 bootstrapped on feature/composer-power (off next; P0-P3 merged).
                          Scope = charter §4 P4 / §3.3 composer power + inline plan/exit/ask-user
                          blocks. Autonomous drive. Next: /spec:requirements (pm) grounded in charter
                          §3.3 + audits + the claudian §3.3 sources; then design A/B/C with the P4 ADRs
                          (composer-mode state machine; mention/command-catalog/bang-bash ports;
                          instruction-refine + inline-block-response seams + CLI transport honesty).
                          EARS reqs each mapped to a claudian path + test. NOTE for scope: the inline
                          ask-user/exit-plan/plan-approval blocks RENDER + RESPOND in P4; the approval
                          RULES/persistence machinery is P7.

2026-05-25 (pm, requirements): PRD-CP-001 written to requirements.md (status: draft). 36 EARS reqs
                          REQ-CP-001..036 across six sub-surfaces — A slash/skills (001-008),
                          B @mention (009-014), C instruction (015-019), D plan-mode + inline
                          ask/exit/approval blocks (020-028), E bang-bash (029-033), F composer-mode
                          orchestration (034-036). Each maps 1:1 to a claudian §3.3 source path +
                          a Given/When/Then. NFR-CP-001..013 restate the epic constraints + the NEW
                          bang-bash security posture (NFR-CP-006) and transport-honesty (NFR-CP-007).
                          Counter-metric = scope leakage vs NG1-NG7. SCOPE GUARD: D-group renders +
                          RESPONDS to inline blocks; approval RULES/persistence/ApprovalManager are
                          P7 (NG3, REQ-CP-026). Built per-provider command/skill/mention SEAMS, wired
                          ONLY Claude (NG5). MCP client deferred (NG4, REQ-CP-012). No AuxModelPort
                          committed (NG7).

                          HAND-OFF → /spec:design (architect). PRD held at `draft` until the four P4
                          ADRs are recorded + accepted (autonomous drive, no human gate). The four
                          framed clarifications for the architect to resolve as ADRs:
                          - CLAR-CP-001  composer-mode trigger state machine (extends ChatComposer.vue;
                                         preserve P1 send contract; DTO-only) → REQ-CP-034/036.
                          - CLAR-CP-002  new ports — mention/data-provider seam (VaultPort + subagent/
                                         MCP/dir catalog), command/skill catalog+storage seam, and the
                                         SECURITY-SENSITIVE bang-bash EXEC seam (sole shell path, no
                                         secret capture) → REQ-CP-004/009/010/012/030/031/032.
                          - CLAR-CP-003  instruction-refine side-query — reuse ADR-TS-003 cold-start
                                         pattern vs introduce the deferred AuxModelPort now → REQ-CP-016.
                          - CLAR-CP-004  inline-block RESPONSE transport on ChatRuntimePort (additive
                                         callbacks per backend audit) + what `claude --print` can carry
                                         vs must be capability-gated (charter §6 transport-honesty)
                                         → REQ-CP-023/025/026/028.
                          On ADR acceptance flip requirements.md status draft → accepted, then design.

2026-05-25 (architect, design): DESIGN-CP-001 written to design.md (Parts A/B/C, status: complete).
                          The four framed CLARs RESOLVED as four accepted ADRs (autonomous drive,
                          no per-phase human gate; legs accumulate for the single final epic-review):
                          - ADR-CP-001 composer-mode state machine — a `useComposerMode` composable
                            owning a discriminated `ComposerMode` union (default/slash/skills/mention/
                            instruction/bang-bash/inline-block + an orthogonal `planActive` boolean) +
                            PURE trigger-parse fns in application (detectTrigger/shouldEnterInstruction/
                            shouldEnterBangBash/replaceTriggerToken). `ChatComposer.vue` extended
                            additively; P1 send contract gated behind `kind==='default'`. DTO-only,
                            no Pinia store for the mode. (CLAR-CP-001 → REQ-CP-034/036.)
                          - ADR-CP-002 three new narrow ports — MentionDataProviderPort (a composite:
                            VaultPort vault source + a provider-addressed subagent/MCP/dir catalog
                            source; MCP no-ops [] until P8, Claude-only subagent), ProviderCommandCatalogPort
                            (provider entries only; built-ins are a PURE app list; request-id guarded
                            in the consumer), and the SECURITY-BOUNDED ShellExecPort (the SOLE shell
                            path; S1 user-explicit-only/never model-reachable, S2 no rewrite, S3 no
                            secret capture/log/render, S4 bounded 30s/1MB→exitCode 124, S5 output-as-
                            block; 3-bridge: Obsidian real child_process.exec coverage-excluded, Mock
                            scripted/echo no-spawn, LocalStorage err 'unavailable in browser demo').
                            (CLAR-CP-002 → REQ-CP-004/009/010/012/030/031/032; NFR-CP-006.)
                          - ADR-CP-003 instruction-refine — REUSE the ADR-TS-003 cold-start side-query
                            over ChatRuntimePort.query (2nd consumer after title-gen), behind a new
                            RefineInstructionUseCase; ported pure buildRefineSystemPrompt/parseRefineResponse;
                            AuxModelPort deferral RE-CONFIRMED to P5 (inline-edit is the re-eval point;
                            two small re-point sites). No new port in P4. (CLAR-CP-003 → REQ-CP-016, NG7.)
                          - ADR-CP-004 inline-block response transport — +3 ADDITIVE ChatRuntimePort
                            callback-setters (setAskUserQuestionCallback/setExitPlanModeCallback/
                            setApprovalCallback — the ADR-CC-001 §3 pre-blessed channel) + +2 additive
                            RuntimeCapabilities flags (supportsPlanMode/supportsInlineResponse) +3
                            additive StreamChunk REQUEST members (ask_user_question/exit_plan_mode/
                            approval_request — audit confirmed the P2 union does NOT yet carry these).
                            CLI transport honesty (ADR-TS-004 pattern): a flow `claude --print` can't
                            round-trip is capability-GATED via getCapabilities() (never provider===),
                            rendered read-only + a notice, NO lost response. Approval RULES/persistence/
                            ApprovalManager stay P7 (NG3 — P4 transports a one-shot decision, stores
                            nothing). (CLAR-CP-004 → REQ-CP-022/023/024/025/026/028; NFR-CP-007.)

                          Everything ADDITIVE + claudian-grounded: zero P1-P3 member renamed/removed;
                          ChatComposer.vue/tabsStore/ChatRuntimePort grown additively only. README.md
                          rows added; requirements.md flipped draft → accepted.

                          HAND-OFF → /spec:specify (architect writes spec.md). Open clarifications for
                          the spec author: (1) the EXACT AskUserQuestion answer DTO shape (single vs
                          multi-question, custom-input) — mirror Claudian core/types/tools AskUserQuestionItem;
                          (2) the ProviderCommandCatalog file layout + the Claude commands/storage source
                          paths to port (.claude/commands, skills) — confirm against providers/claude/
                          {commands,storage}/*; (3) the instruction-append target field in the custom
                          system prompt + whether it lives in PluginSettings (device-local) or a vault
                          file (REQ-CP-018 says SettingsPort — confirm the field name); (4) the exact
                          ShellExecPort cwd resolution (vault adapter base path) for the Obsidian impl.
                          None blocks spec; each is a small contract detail to pin in spec.md.

2026-05-25 (architect, specification): SPEC-CP-001..038 written to spec.md (status: complete).
                          38 spec items across five layer groups: DOMAIN (001-006 — the 3 additive
                          StreamChunk request members, the +3 ChatRuntimePort callback-setters + 2
                          RuntimeCapabilities flags, MentionDataProviderPort/ProviderCommandCatalogPort/
                          ShellExecPort + keys + barrel, the inline-block DTOs, ComposerMode value
                          types, PluginSettings.customSystemPrompt); INFRA (007-011 — 3-bridge mention/
                          catalog factories, the coverage-excluded Obsidian ShellExec, Mock scripted-
                          echo + scriptable callbacks, LocalStorage err-not-available, the grown
                          runtimes emitting the 3 request chunks w/ CLI honesty); APPLICATION (012-017
                          — pure trigger-parse, builtInCommands + RunCommand, ResolveMention,
                          instructionRefine + RefineInstruction side-query, SubmitBangBash,
                          RespondToInlineBlock); UI (018-028 — useComposerMode, extended ChatComposer,
                          dropdown/mention/plan/inline/bash components w/ PageObjects, port composables,
                          the instruction-confirm seam + Obsidian Modal, wiring); STYLES (029-030);
                          CROSS-CUTTING (031-038). TEST-CP-001..028 + 2 manual legs; full REQ-CP /
                          NFR-CP ↔ SPEC-CP ↔ TEST-CP coverage table (§11) — every REQ-CP-001..036 +
                          NFR-CP-001..013 covered; every SPEC-CP traces back. The 4 design open items
                          RESOLVED: (1) AskUserQuestionAnswer DTO (multi-question array keyed by
                          question id + optional customInput) — SPEC-CP-004; (2) Claude catalog paths
                          (.claude/commands/**/*.md, .claude/skills/**/SKILL.md via VaultPort) —
                          SPEC-CP-007/013; (3) instruction-append target = device-local
                          PluginSettings.customSystemPrompt, APPEND w/ \n\n (appendInstruction helper)
                          — SPEC-CP-005/027; (4) Obsidian ShellExec cwd = vault adapter base path
                          (FileSystemAdapter.getBasePath), 30s/1MB, enhanced PATH — SPEC-CP-008.
                          Everything ADDITIVE + claudian-grounded: zero P1-P3 member renamed/removed
                          (TEST-CP-001/002 assert byte-identical 12 runtime members + 3 caps + the
                          StreamChunk union).

                          HAND-OFF → /spec:tasks (planner). TDD ORDERING HINTS:
                          1. DOMAIN FIRST — the value types/DTOs/ports/keys/barrel + the StreamChunk +
                             ChatRuntimePort additive growth (SPEC-CP-001..006); they are the contract
                             every other layer compiles against and TEST-CP-001..006 are pure shape
                             tests with no mount.
                          2. PURE PARSE/REFINE BEFORE COMPONENTS — triggerParse (SPEC-CP-012),
                             builtInCommands (SPEC-CP-013), instructionRefine pure fns (SPEC-CP-015),
                             appendInstruction (SPEC-CP-005) are total functions unit-tested in
                             isolation (TEST-CP-005/007/008/010); land them before the use cases and
                             well before any Vue mount.
                          3. USE CASES (SPEC-CP-013..017) next — each returns Result; the refine + the
                             inline-block-respond use cases carry the streaming-error→Result boundary
                             and the capability gate; back them with the Mock runtime (capable +
                             non-capable) from the fake-ports factory.
                          4. SHELLEXEC OBSIDIAN COVERAGE-EXCLUDED → MANUAL LEG — the real
                             child_process.exec impl (SPEC-CP-008) lives under
                             src/infrastructure/obsidian/** (coverage-excluded); its automated proof is
                             the Mock scripted-echo (no spawn, TEST-CP-028) + the LocalStorage err
                             (TEST-CP-016); the real exec + cwd/timeout is TEST-CP-M2 (manual). Do NOT
                             schedule unit-coverage tasks against the Obsidian impl.
                          5. INLINE-BLOCK CAPABILITY-GATING — the gate lives in
                             RespondToInlineBlockUseCase (SPEC-CP-017) reading getCapabilities()
                             .supportsInlineResponse, with the read-only render + notice in the three
                             inline components (SPEC-CP-022..024). Schedule a capable-mock task AND a
                             non-capable-mock task (TEST-CP-020 vs TEST-CP-024); the real-CLI honest
                             read-only state is TEST-CP-M2 (manual). The grep-gate invariant
                             (TEST-CP-027: zero `provider === 'claude'`) is a cheap guard to land early.
                          6. WIRING LAST — provide the 3 new ports (mention/catalog as per-mount
                             FACTORIES, ShellExec stateless/direct) + the instruction-confirm seam in
                             AgentSidebarView + ui/main.ts (SPEC-CP-028); the Obsidian InstructionConfirmModal
                             is a plugin-layer Modal (TEST-CP-M2 manual), the standalone gets a stand-in.
                          No open clarifications block tasks — all four design items resolved in-spec.

2026-05-25 (planner, tasks): TASKS-CP-001 written to tasks.md (status: complete). 53 tasks
                          T-CP-001..053 across the seven DDD layers + the gate, TDD-ordered (every
                          RED test task `qa`-owned precedes the `dev` impl whose first DoD line is "the
                          prior RED test(s) now pass"). Layers: 0 baseline (T-CP-001); DOMAIN (002-007
                          — inline DTOs, StreamChunk+ComposerMode, ChatRuntimePort growth, the 3 ports
                          +keys+barrel, customSystemPrompt+appendInstruction); INFRA (008-014 — Mock
                          fixtures+scripted-echo ShellExec+scriptable callbacks, LocalStorage err,
                          Obsidian mention/catalog [M1] + Obsidian ShellExec [coverage-excluded, S1-S5
                          DoD, M2] + grown runtimes/reducer [CLI honesty, M2]); APPLICATION (015-026 —
                          pure triggerParse, builtIn+RunCommand, ResolveMention, instructionRefine+
                          Refine side-query, SubmitBangBash, RespondToInlineBlock capability-gate);
                          UI (027-046 — useComposerMode, 3 port composables, ComposerDropdown+MentionRow,
                          PlanModeIndicator, the 3 inline blocks, BangBashOutput, instruction-confirm
                          seam+InstructionConfirmModal, ChatComposer extension — each Vue component
                          pairs a data-testid PageObject + no-v-html/no-window.confirm DoD); STYLES
                          (047 — §4.11 --sp-* tokens + tokens.test); WIRE-IN (048-050 — provide 3 ports
                          +seam as per-mount factories/stateless, mount, npm run dev smoke); GATE
                          (051 M1, 052 M2, 053 feature DoD + grep gates + draft PR into next).

                          GUARD-RELAX: NONE needed (verified vs eslint.config.js DELETED_SUBSYSTEM_BAN
                          / DELETED_INJECTION_KEYS — no P4 mention/command/bang-bash/inline-block symbol
                          was P0-deleted; the 3 new keys + the new domain/app/ui composer paths match no
                          ban glob; @/domain/chat regrew in P1). Unlike P2 (IconPort relax); like P3.

                          Coverage table maps all 38 SPEC-CP + all 36 REQ-CP + 13 NFR-CP + all 28
                          automatable TEST-CP + the 2 manual legs (M1/M2) → ≥1 task. No stability-loop
                          NFR in scope. Parity-screenshots = single final epic-review human gate (T-CP-053).

                          HAND-OFF → /spec:implement (dev) + the qa RED legs.
                          FIRST READY TASK: T-CP-002 (qa, RED — inline DTOs + StreamChunk request
                          members + ComposerMode value types; names TEST-CP-001/004/006) → greened by
                          T-CP-003 (dev, inline DTOs) → T-CP-004 (dev, StreamChunk+ComposerMode).
                          NO-DEP PARALLEL TASKS (Batch 0, run anytime): T-CP-001 (dev, baseline +
                          guard verify), T-CP-002 (qa, domain RED — inline/StreamChunk/ComposerMode),
                          T-CP-005 (qa, domain RED — runtime growth/3 ports/appendInstruction),
                          T-CP-047 (dev, §4.11 tokens). The qa RED pair to start immediately is
                          T-CP-002 + T-CP-005 (both no-dep). Critical path (14 tasks): T-CP-005 → 007 →
                          009 → 025 → 026 → 027 → 028 → 035 → 036 → 045 → 046 → 048 → 049 → 053.

2026-05-25 (dev, implement — domain+infra batch): DOMAIN (T-CP-002..007) + INFRA (T-CP-008..014)
                          + STYLES (T-CP-047) + baseline (T-CP-001) DONE, STRICT TDD, one
                          Conventional commit per task. Verification at batch end: vue-tsc
                          -p tsconfig.lint.json = 0 errors; eslint over the 27 changed src files = 0
                          errors (only the pre-existing tabsStore max-lines warning); targeted vitest
                          (domain/application-chat/infrastructure/__fakes__/ui-stores/ui-styles/core)
                          = 619 passed / 68 files; full background suite = 818 passed / 118 files (10
                          worker-pool startup-timeout flakes, exit 0, unrelated). P1/P2/P3 runtimes +
                          tests GREEN under the additive growth (NFR-CP-009).

                          SHAs (last commit of each task; RED test commits precede their green):
                          - T-CP-001 docs(cp) baseline + test-plan guard verify ........ cfb5ee2
                          - T-CP-002 RED inline/StreamChunk/ComposerMode (qa) ........... (test(cp) T-CP-002)
                          - T-CP-003 inline-block DTOs ................................. (feat(cp) T-CP-003)
                          - T-CP-004 StreamChunk request members + ComposerMode ........ (feat(cp) T-CP-004)
                          - T-CP-005 RED ChatRuntimePort/3 ports/appendInstruction (qa)  (test(cp) T-CP-005)
                          - T-CP-006 ChatRuntimePort +3 setters +2 caps ............... 13dfc2c
                          - T-CP-007 Mention/Catalog/ShellExec ports+keys+barrel+helper  c077eaa
                          - T-CP-008 RED Mock fixtures/scripted-echo/callbacks (qa) .... (test(cp) T-CP-008)
                          - T-CP-009 MockBridge fixtures + scripted ShellExec + fakes .. (feat(cp) T-CP-009)
                          - T-CP-010 RED LocalStorage fixtures + err ShellExec (qa) .... (test(cp) T-CP-010)
                          - T-CP-011 LocalStorage fixtures + err ShellExec ............. (feat(cp) T-CP-011)
                          - T-CP-012 ObsidianBridge mention + catalog (cov-excluded, M1) (feat(cp) T-CP-012)
                          - T-CP-013 ObsidianShellExec child_process.exec S1-S5 (M2) ... (feat(cp) T-CP-013)
                          - T-CP-014 ClaudeCliChatRuntime + reducer 3 chunks (M2) ...... ea3a9ad
                          - T-CP-047 §4.11 --sp-* tokens + tokens contract ............. (feat(cp) T-CP-047)

                          KEY DECISIONS: (a) ShellExec security — ObsidianShellExec is the SOLE real
                          shell path (S1, node:child_process only here + ClaudeCliChatRuntime,
                          grep-confirmed), verbatim passthrough (S2), no plugin secret in the child env
                          + LoggerPort logs only command+exitCode never stdout/stderr (S3), bounded
                          30s/1MB -> ok(exitCode 124, truncated, notice) (S4), render-only DTO (S5),
                          cwd = vault adapter base path (non-FS -> err), NEVER a ChatRuntimePort member;
                          Mock = scripted echo (no spawn), LocalStorage = err 'not available in the
                          browser demo'. (b) The 3 runtime callback-setters land on all 3 runtimes:
                          Mock captures + scriptable caps (capable default), Fixture no-op + false/false
                          caps, ClaudeCli stores + routes via the reducer-emitted request chunks. (c)
                          CLI honesty (ADR-CP-004 §3): ClaudeCliChatRuntime reports
                          supportsInlineResponse:false AND supportsPlanMode:false — the one-shot
                          claude --print cannot round-trip a mid-turn interactive answer; the same UI
                          lights up unchanged when a capable transport ships.

                          DEVIATIONS (all logged in implementation-log.md): customSystemPrompt added to
                          validateSettings load-or-default only, NOT a settings-tab UI field (settings
                          UX = P10; written by instruction mode SPEC-CP-027); --sp-dropdown-shadow
                          resolves from --sp-shadow-dropup (not raw var(--shadow-s)) to keep the
                          shadow literal at the Specorator token layer (NFR-CP-011); ClaudeCli gates
                          supportsPlanMode:false too (both flags depend on the interactive round-trip).
                          Mechanical additivity updates to tabsStore fallback caps + test runtime stubs
                          + the core-settings key-set sentinel (authorised "keep P1/P2/P3 green").

                          NOT RUN (orchestrator gate): full npm run verify / build / build:web. NOT
                          pushed. manifest.json untouched.

                          HAND-OFF → APPLICATION batch (T-CP-015..026). FIRST READY TASK: T-CP-015 (qa,
                          RED — pure trigger-parse detectTrigger/shouldEnterInstruction/
                          shouldEnterBangBash/replaceTriggerToken; TEST-CP-007) → greened by T-CP-016
                          (dev, triggerParse.ts ported from claudian utils/slashCommand.ts). The Mock
                          capable/non-capable runtime toggle (fake-ports.mockRuntime) + the scripted
                          ShellExec + the fixture mention/catalog providers are ready to back the use-
                          case RED legs (RunCommand/ResolveMention/RefineInstruction/SubmitBangBash/
                          RespondToInlineBlock, T-CP-017..026).
```

## Hand-off notes

```
2026-05-25 (dev, implement — domain+infra batch): DOMAIN+INFRA+tokens batch complete.
                          Verification performed: vue-tsc 0 errors; eslint 0 errors on changed src;
                          vitest 619/68 targeted + 818/118 full (10 infra flakes). implementation-log.md
                          set in-progress (APPLICATION/UI/WIRE/GATE remain). test-plan.md in-progress
                          (M1/M2 manual legs scheduled). Remaining owner: dev (APPLICATION T-CP-015..026)
                          + qa (RED legs). Next agent: qa for T-CP-015 RED, then dev T-CP-016.
                          No blockers; all four design open items remain resolved in-spec.

2026-05-25 (dev, implement — application batch): APPLICATION batch T-CP-015..026 complete
                          (strict TDD, one Conventional commit per task — RED test(cp) then feat(cp)).
                          Delivered: triggerParse.ts (T-CP-016, 6b9eddd/e3cb4e3); builtInCommands.ts +
                          RunCommandUseCase (T-CP-018, da2b4fa/9d9a114); ResolveMentionUseCase (T-CP-020,
                          47676c0/932031f); instructionRefine.ts + RefineInstructionUseCase cold-start
                          side-query (T-CP-022, 4031cac/ae10816); SubmitBangBashUseCase (T-CP-024,
                          858bd71/a99c0c7); RespondToInlineBlockUseCase capability-gated (T-CP-026,
                          7804031/a506592). Verification performed: npm run typecheck 0 errors; eslint 0
                          errors over src/application/chat/composer + tests; vitest 51/8 composer + full
                          996/139, 0 failed (P1/P2/P3 + DOMAIN/INFRA P4 green, NFR-CP-009; no test
                          assertion changed). One deviation logged: mention does NOT close on whitespace
                          (SPEC-CP-012 A.1, diverges from claudian MentionDropdownController — spec is
                          authoritative). implementation-log.md kept in-progress (UI/WIRE/GATE remain).
                          Not run (orchestrator gate): npm run verify / build / build:web; no push.
                          Remaining owner: qa (T-CP-027 RED) + dev (T-CP-028..). Next agent: qa for
                          T-CP-027 RED (useComposerMode composable — mode arbiter / depth-counted queue /
                          req-id guard / debounce), then dev T-CP-028. No blockers; the five composer use
                          cases + pure trigger-parse are the ready inputs for the UI batch.

2026-05-25 (dev, implement — ui batch 1): UI batch 1 T-CP-027..034 complete (strict TDD,
                          one Conventional commit per task — RED test(cp) then feat(cp)). Delivered:
                          useComposerMode composable (T-CP-027/028, fce6bcc/8926ba0 — the mode arbiter
                          over the pure trigger-parse: one active mode, P1-send gated behind
                          kind==='default' && handleKeydown→false, Shift+Tab plan toggle capability-gated,
                          Escape text-intact, built-ins-first + request-id-guarded getEntries, debounced
                          mention query w/ AbortSignal, depth-counted inline-block queue, bang-bash
                          explicit-Enter only, DTO-only reactive state); the three port composables
                          useMentionDataProviderPort/useProviderCommandCatalogPort/useShellExecPort
                          (T-CP-029/030, 0de7ac8/6ec9f9f — inject-or-throw, no aggregate); ComposerDropdown
                          + MentionRow (T-CP-031/032, 307b0be/3ef0000 — role=listbox/option +
                          aria-activedescendant, Arrow/Enter/Tab/Esc keyboard, built-ins-first, $ vs /
                          distinct, file single-line vs subagent/MCP/dir two-line w/ category SpIcon,
                          empty-state, no-v-html verbatim text; +en/de dropdown.hints/mention.empty keys);
                          PlanModeIndicator (T-CP-033/034, 91c20e1/bac9446 — teal PLAN label, non-colour
                          cue, capability-gated toggle via useComposerMode, inert when supportsPlanMode
                          false). Verification performed: vue-tsc 0 errors (whole project); eslint 0 errors
                          over the composer + new composables (no v-html/innerHTML/window.confirm/obsidian
                          — NFR-CP-003); targeted vitest 79/12 (composer + composables + P1
                          ChatComposer/ChatSurface green); full unit suite 1048 passed / 145 files, 0
                          failed (P1/P2/P3 + DOMAIN/INFRA/APPLICATION P4 green, NFR-CP-009; no test
                          assertion changed). KEY DECISIONS: (a) the composer-mode arbiter takes its
                          collaborators as an options object (not inject) so it unit-tests cleanly — the
                          consumer (ChatComposer, batch 2) wires the injected ports/use cases; (b) the
                          dropdown owns the highlight internally + exposes handleKeydown via defineExpose
                          (the composer forwards the textarea keydown) so DOM focus stays in the textarea
                          per SPEC-CP-037; (c) capability-gating reads getCapabilities().supportsPlanMode,
                          never a provider=== branch (SPEC-CP-032). DEVIATIONS (logged in
                          implementation-log.md): PLAN weight uses --sp-font-weight-semibold (no
                          --sp-font-weight-bold token exists — no leak, NFR-CP-011); instruction/bang-bash
                          detection uses trimStart().startsWith('#'/'!') + the pure shouldEnter* gate on
                          the pre-trigger text (mode persists as the body is typed — within SPEC-CP-018's
                          one-active-mode contract). implementation-log.md kept in-progress (UI batch 2 +
                          WIRE/GATE remain). Not run (orchestrator gate): npm run verify / build /
                          build:web; not pushed; manifest.json untouched. Remaining owner: qa (T-CP-035
                          RED) + dev (T-CP-036..). Next agent: qa for T-CP-035 RED (InlineAskUserQuestion
                          — render + respond + capability-gated read-only when supportsInlineResponse:false,
                          EC-CP-6; depends on T-CP-026/028, done), then dev T-CP-036. First task of UI
                          batch 2 = T-CP-035. No blockers; useComposerMode (enqueue/resolve queue) +
                          RespondToInlineBlockUseCase + the three port composables are the ready inputs.

2026-05-25 (dev, implement — ui batch 2): UI batch 2 T-CP-035..046 complete (strict TDD,
                          one Conventional commit per task — RED test(cp) then feat(cp)). Delivered:
                          InlineAskUserQuestion (T-CP-035/036, 11c58be/dec480a — render in place of the
                          composer, multi-question tabs, Arrow/Enter/Escape, allowCustomInput field,
                          complete-answer → respondAskUserQuestion, capability-gated read-only + showInfo
                          when supportsInlineResponse:false, EC-CP-6); InlineExitPlanMode (T-CP-037/038,
                          5988438/74f63c0 — Plan-complete card + scrollable monospace preview +
                          implement/revise(feedback)/cancel, Escape dismisses null, capability-gated);
                          InlinePlanApproval (T-CP-039/040, 4b43412/9ea63a8 — deny/allow/allow-always,
                          allow-always routes the current decision and persists NO rule (NG3 — no
                          SettingsPort/history collaborator), Escape→null, capability-gated);
                          BangBashOutput (T-CP-041/042, f93ad2a/477fe4d — monospace stdout/stderr <pre> +
                          non-zero exit badge + truncation notice, {{ }} text so a <script> renders
                          verbatim, EC-CP-13/no-v-html); the instruction-confirm seam + InstructionConfirmModal
                          + the instruction ladder (T-CP-043/044, 625bf75/9f52de9 — modalSeam
                          InstructionConfirmFn/INSTRUCTION_CONFIRM + useInstructionConfirm auto-reject
                          fallback; the Obsidian Modal under src/plugin/modals/ building DOM via
                          createEl/setText with an editable field, never window.confirm/prompt/alert;
                          useComposerMode.submitInstruction: empty→persist-nothing, optional refine
                          (refine-fail→raw, EC-CP-9), confirm, accept appends to customSystemPrompt prior
                          preserved REQ-CP-018 / reject→nothing REQ-CP-017); and the ChatComposer extension
                          (T-CP-045/046, 42d803a/99764c0 — additive optional `composer` arbiter prop: the
                          keydown handler delegates to composer.handleKeydown first and only falls through
                          to the byte-identical P1 send when it returns false && mode.kind==='default'
                          (REQ-CP-035); onInput re-classifies; combobox ARIA + mode-border classes
                          (instruction/bang-bash/plan) + bang-bash monospace + run-command placeholder;
                          inline-block mode v-if-hides the textarea+toolbar and renders the active block
                          wired to RespondToInlineBlockUseCase + the capability flag + notify, restored
                          after the last resolves REQ-CP-027; mounts ComposerDropdown/PlanModeIndicator/
                          BangBashOutput; the # instruction Enter routes submitInstruction; with no arbiter
                          the component is pure P1). HOW THE THREE CONTRACTS WORK: (1) inline-block
                          capability-gating — each inline component reads a `supportsInlineResponse` prop
                          (the parent passes runtime.getCapabilities().supportsInlineResponse, never a
                          provider=== branch, SPEC-CP-032): when false it renders a read-only block + fires
                          NotificationPort.showInfo onMounted and never wires actionable options, so
                          RespondToInlineBlockUseCase's callback is never reached (no lost response,
                          EC-CP-6); when true the chosen decision calls respond*(decision) and emits
                          resolve so the arbiter dequeues. (2) instruction Obsidian-Modal-via-seam — the
                          .vue/composable path stays obsidian-free: useComposerMode.submitInstruction calls
                          the injected InstructionConfirmFn (modalSeam INSTRUCTION_CONFIRM, auto-reject when
                          absent); the plugin provides the real InstructionConfirmModal launcher (Obsidian
                          Modal subclass, src/plugin/modals/, createEl/setText, resolves a Promise), the
                          standalone provides a browser-safe stand-in — mirrors P3 ForkTargetModal/
                          DeleteConfirmModal. The provide is T-CP-049's job (wire-in batch). (3) ChatComposer
                          P1-send preservation — submitTurn/autoGrow/the original onKeydown are kept
                          byte-for-byte; the new onComposerKeydown wraps them: with no `composer` prop it
                          calls onKeydown directly (pure P1); with an arbiter it consumes palette/inline/plan
                          keys first and only reaches the P1 send when handleKeydown→false && kind==='default'
                          (Enter sends only in default mode; Shift+Enter newline; Esc closes the dropdown not
                          the turn). Verification performed: vue-tsc 0 errors (whole project); eslint 0
                          errors over all touched production files (no v-html/innerHTML, no
                          window.confirm/alert/prompt, no obsidian import under src/ui/** — NFR-CP-003);
                          targeted vitest 245/43 (the full chat + composables surface green incl. P1
                          ChatComposer + ChatSurface); full unit suite 1087 passed / 152 files, 0 failed
                          (+39 from batch 2; P1/P2/P3 + DOMAIN/INFRA/APPLICATION + UI batch 1 stay green
                          under the additive growth, NFR-CP-009; no test assertion changed). KEY DECISIONS:
                          (a) the inline components + the ChatComposer extension take their collaborators as
                          props (the arbiter, respond, supportsInlineResponse, notify) so they unit-test
                          cleanly and ChatComposer stays pure P1 when the props are absent — the actual
                          per-tab runtime/ports provide is the wire-in batch (T-CP-049); (b) Escape
                          dismisses an inline block with null (cancel), distinct from the explicit Cancel
                          action which routes {kind:'cancel'} on exit-plan; (c) capability-gating reads the
                          flag never a provider=== branch (SPEC-CP-032). DEVIATIONS (logged in
                          implementation-log.md): the inline components receive `supportsInlineResponse` as
                          a prop (the parent reads getCapabilities()) rather than each holding a runtime —
                          keeps the components runtime-free and DTO-driven, the gate is still the capability
                          flag (SPEC-CP-032 honoured); the bang-bash output renders from an optional
                          `bangBashOutput` prop on ChatComposer (the arbiter's onBangBashOutput sets the
                          parent state) — the output-block plumbing completes in the wire-in. Two new i18n
                          subtrees added (composer.inline / composer.bash / composer.instruction, en+de).
                          implementation-log.md kept in-progress (WIRE-IN + GATE remain). Not run
                          (orchestrator gate): npm run verify / build / build:web; not pushed; manifest.json
                          untouched. Remaining owner: qa (T-CP-048 RED) + dev (T-CP-049). Next agent: qa for
                          T-CP-048 RED (provide the three ports + the instruction-confirm seam in
                          AgentSidebarView + src/ui/main.ts + mount the composer modes; the standalone path
                          leg of TEST-CP-026 + the TEST-CP-027 grep-gate hook), then dev T-CP-049, then qa
                          T-CP-050 (npm run dev composer smoke). First task of the wire-in batch = T-CP-048.
                          No blockers; all UI components + useComposerMode.submitInstruction + the seam +
                          the Mock fixtures/scripted ShellExec are the ready inputs for the provide+mount.

2026-05-25 (dev, implement — wire-in batch): WIRE-IN batch T-CP-048..050 complete
                          (strict TDD, one Conventional commit per task — RED test(cp) then feat(cp)).
                          Delivered: the both-entry-point provides + the composer-mode mount (T-CP-048
                          RED 39208ef → T-CP-049 0afaefe) — AgentSidebarView.onOpen + src/ui/main.ts now
                          app.provide MENTION_DATA_PROVIDER_PORT (bridge.createMentionDataProvider(),
                          per-mount factory) + PROVIDER_COMMAND_CATALOG_PORT
                          (bridge.createProviderCommandCatalog(), factory) + SHELL_EXEC_PORT
                          (bridge.shellExec, stateless) + INSTRUCTION_CONFIRM (the Obsidian view → the
                          REAL InstructionConfirmModal launcher under src/plugin/modals/; ui/main.ts → a
                          browser-safe accept-verbatim stand-in, no window.*); ChatSurface builds the
                          live useComposerMode arbiter + RespondToInlineBlockUseCase when the three ports
                          are present (degrades to pure P1 when absent so P1/P2/P3 mount+surface tests
                          stay green), bridges getValue/getCaret/onInsert to the mounted ChatComposer
                          (now defineExpose getValue/getCaret/applyInsert), feeds onBangBashOutput →
                          bangBashOutput → the BangBashOutput block, and maps built-ins (new→openTab,
                          compact→compactActive). The runtime→render→answer knot is resolved by a new
                          src/ui/chat/composer/EnqueueRuntime.ts decorator wrapping ONLY the 3 inline
                          callback setters to enqueue-for-render before delegating to the use case's
                          capture (one registration per callback, no last-wins conflict). And the
                          standalone composer smoke (T-CP-050 62a6636) — tests/ui/main.ts.test.ts drives
                          /→slash dropdown, @→mention dropdown, Shift+Tab→PLAN indicator (capable mock),
                          !echo hi+Enter→scripted-echo output block against MockBridge (deterministic;
                          live-feel + the instruction # leg pair with the human final review). DEV-SMOKE
                          ASSERTIONS: composer-dropdown present on /, composer-dropdown present on @ after
                          the debounce, plan-indicator present after Shift+Tab, bang-bash-output +
                          bang-bash-output-stdout containing the echoed command on !echo hi+Enter.
                          Verification performed: vue-tsc 0 errors (whole project); eslint 0 errors over
                          all touched files (no v-html/innerHTML/window.confirm/obsidian under src/ui/**,
                          NFR-CP-003); targeted vitest — composer/mount.ts.test.ts 3 passed; the 7
                          mount+main entry-point files 11 passed (P1/P2/P3 green); ChatSurface+ChatComposer
                          38 passed (pure-P1 degrade + the defineExpose keyboard contract preserved);
                          composer+composables 90 passed. No test assertion changed. DEVIATIONS (logged in
                          implementation-log.md): (a) the composer binds ONE runtime via CHAT_RUNTIME_FACTORY
                          for the caps/inline channel (under the single-runtime mock it IS the tab runtime);
                          the per-tab-streaming ↔ composer-runtime binding is a P5+ refinement; (b)
                          /clear//add-dir//resume//fork built-ins log a debug with no surface side effect
                          (only new/compact have a P4 store action; the spec routes the rest to "the existing
                          flow"); (c) ChatComposer defineExpose getValue/getCaret/applyInsert so the arbiter
                          writes back post-confirm value+caret (textarea = single source of truth). Not run
                          (orchestrator gate T-CP-053): full npm run verify / build / build:web / test:all /
                          coverage; not pushed; manifest.json untouched. REMAINING: T-CP-051 (MANUAL —
                          Obsidian mention + .claude catalog vault read, TEST-CP-M1) + T-CP-052 (MANUAL —
                          Obsidian ShellExec + real-CLI inline honesty + InstructionConfirmModal, TEST-CP-M2)
                          are HUMAN-OWNED (never agent-self-claimed; recorded for the single final epic-review
                          gate); T-CP-053 (feature DoD — full verify + grep gates + additivity + parity
                          self-review + draft PR into next) is the ORCHESTRATOR's gate. Next agent:
                          orchestrator (T-CP-053) after the human manual legs.
```

## Hand-off notes (reviewer)

```
2026-05-25 (reviewer, parity review): REVIEW-CP-001 + TRACE-CP-001 written. VERDICT =
                          Approved with conditions. Full unit suite re-run GREEN (1092 tests /
                          154 files); grep gates pass (zero provider==='claude' in app/ui; node:*
                          only in src/infrastructure/obsidian; no v-html/innerHTML/window.confirm/
                          obsidian-in-UI). Pure layers (triggerParse, builtInCommands,
                          instructionRefine, inline DTOs, the 5 use cases) are faithful claudian
                          ports; bang-bash S1-S5 genuinely enforced; capability-gating honest; P1
                          send byte-identical; additivity holds.

                          TWO P2 REAL-PATH FINDINGS (unit-green-but-dead — the P2/P3 failure mode):
                          - R-CP-001 (P2): instruction # append writes customSystemPrompt and
                            round-trips, but NOTHING reads it into a turn — prepareTurn sets
                            prompt:request.text only, _buildArgs never emits --append-system-prompt,
                            ChatTurnRequest has no system-prompt field. Instruction mode is a no-op
                            on the real CLI agent. Claudian feeds settings.systemPrompt via
                            ClaudeQueryOptionsBuilder -> buildSystemPrompt -> SDK. Fix to the wire OR
                            spec-rescope-to-P5; verify TEST-CP-M2.
                          - R-CP-002 (P2): inline-block callbacks register on an ORPHAN
                            composerRuntime (ChatSurface.vue:131 createRuntime() = fresh instance)
                            separate from the per-tab streaming runtime (tabsStore.ts:263); the
                            streaming consumer never enqueues the 3 request chunks. Inline blocks
                            never render from a real turn. Masked by CLI supportsInlineResponse:false
                            + single-runtime Mock coincidence; NO test drives inline via sendMessage
                            (all inline tests call enqueue/RespondToInlineBlock directly;
                            MockChatRuntime.query never invokes the captured callback). ADR-CP-004's
                            "lights up with no UI change" is currently unachievable. Open an ADR for
                            the per-tab<->composer runtime binding + consumer enqueue, OR rescope-P5.

                          P3 polish/parity (non-blocking, each needs a spec/release-note line):
                          R-CP-003 four built-ins (/clear,/add-dir,/resume,/fork) inert in
                          dispatchBuiltIn; R-CP-004 approval_request has no reducer emission (correct
                          parity — SDK canUseTool not stream — spec wording misleading);
                          R-CP-005 mention provider uncapped vs claudian slice(0,50/100);
                          R-CP-006 six built-ins vs claudian four+`new` alias; R-CP-007 mention
                          insert format (no trailing space / full path) diverges; R-CP-008 a11y
                          aria-activedescendant/aria-controls on the listbox not the combobox
                          textarea; R-CP-009 ObsidianShellExec genuine spawn failure -> exit 1 not err.

                          OUT-OF-SCOPE deferrals all correct (P5/P6/P7/P8/P9/P10); zero counter-metric
                          scope leakage in the diff.

                          HAND-OFF -> orchestrator: dispatch R-CP-001 + R-CP-002 fixes to the
                          ARCHITECT first (spec decision: wire vs explicit P5 re-scope; R-CP-002
                          needs an ADR for the runtime binding) -> then DEV. The human final review
                          gate (TEST-CP-M1/M2) must specifically exercise: instruction->system-prompt
                          effect on the real CLI (R-CP-001), inline-block arrival from a real turn
                          (R-CP-002), mention vault read + cap (R-CP-005), bang-bash spawn-failure
                          (R-CP-009). T-CP-053 full verify gate (npm run verify + test:all + coverage
                          80/70/80/80) NOT re-run beyond the unit suite — still orchestrator's gate.
```

## Hand-off notes (dev — review remediation)

```
2026-05-25 (dev, review remediation): the two P2 conditions from REVIEW-CP-001 FIXED under
                          strict TDD, one Conventional commit per finding.
                          - R-CP-001 (ade17d6): customSystemPrompt now reaches the CLI. Additive
                            ChatRuntimeQueryOptions.appendSystemPrompt threaded customSystemPrompt
                            (read via a SettingsPort-backed tabsStore binding seam getAppendSystemPrompt,
                            wired in ChatSurface where SettingsPort lives) → sendMessage query options →
                            ClaudeCliChatRuntime._buildArgs/_optionArgs emits --append-system-prompt
                            <text> (the real claude CLI flag; parity counterpart of Claudian's SDK
                            systemPrompt). RED at the argv seam (ClaudeCliChatRuntime.buildArgs.test.ts)
                            + the store threading (tabsStore.test.ts +3). Real round-trip = TEST-CP-M2.
                          - R-CP-002 (8171fad): inline-block channel bound to the active-tab runtime.
                            New tabsStore.activeRuntime() exposes the active tab's existing per-tab
                            runtime (held outside reactive state); ChatSurface points the composer's
                            EnqueueRuntime/RespondToInlineBlock channel + getCapabilities() read at it
                            instead of a createRuntime() orphan. NO ADR needed — the composer operates
                            on the active tab so its inline channel = the active-tab runtime (minimal
                            accessor over the existing deps Map; no new runtime lifecycle). RED test
                            (ChatSurface.inline.test.ts) drives ask-user THROUGH the active-tab runtime
                            with a distinct-instance factory → inline-ask renders + no orphan; verified
                            RED on the orphan code.

                          Verification performed: vue-tsc 0 errors; eslint 0 errors over touched
                          src+test (only the pre-existing tabsStore max-lines warning); vitest 748
                          passed / 92 files over chat-UI + stores + composables + application + infra
                          (P1/P2/P3/P4 green; no test assertion changed; no P1-P3 member renamed/removed;
                          capability-gating via getCapabilities() not provider===; no v-html/innerHTML/
                          window.confirm; no obsidian under src/ui/**). Docs updated: implementation-log.md
                          (remediation section + per-finding files/SHAs/threading/binding), review.md
                          (R-CP-001/002 → RESOLVED in the findings table + §8 conditions + verdict note),
                          this workflow-state.md. NOT run (orchestrator gate T-CP-053): full npm run
                          verify / build / build:web / test:all / coverage. NOT pushed. manifest.json
                          untouched. implementation-log.md kept in-progress (human manual legs T-CP-051/052
                          + orchestrator verify gate T-CP-053 remain).

                          Remaining owner: human (T-CP-051/052 manual legs — must exercise R-CP-001
                          instruction→system-prompt + R-CP-002 inline-arrival from a real turn) +
                          orchestrator (T-CP-053 verify gate). Next agent: orchestrator (T-CP-053) after
                          the human manual legs.
```
