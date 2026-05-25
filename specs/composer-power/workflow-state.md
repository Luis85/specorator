---
feature: composer-power
area: CP
current_stage: requirements
status: active
last_updated: 2026-05-25
last_agent: orchestrator (P4 bootstrap)
epic: claudian-reboot
phase: P4
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.3 + audits + claudian-main stand in, mirrors P1-P3)
  research.md: skipped
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

# Workflow state — composer-power (P4)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
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
```
