---
id: PRD-CP-001
title: Composer Power (P4) — slash/skills, @mention, instruction, plan mode + inline blocks, bang-bash
stage: requirements
feature: composer-power
area: CP
status: accepted     # draft | proposed | accepted | superseded — released after the P4 ADRs (ADR-CP-001..004) were recorded + accepted (CLAR-CP-001..004 resolved)
owner: pm
epic: claudian-reboot
phase: P4
integration_branch: next
reference: D:\Projects\claudian-main   # MIT, read-only structural + visual parity reference
inputs:
  - specs/composer-power/workflow-state.md                       # P4 bootstrap scope (charter §4 P4 / §3.3 + inline blocks)
  - specs/claudian-reboot/parity-charter.md                      # §3.3 / §4 (P4 row) / §5 (parity method) / §6 (decisions) — mandatory
  - specs/claudian-reboot/claudian-audit-frontend.md             # §3.3 composer maps + recommended new ports
  - specs/claudian-reboot/claudian-audit-backend.md              # ChatRuntime callbacks, aux services, security/approvals split
  - specs/threads-sessions/spec.md                               # SPEC-TS-003 (additive ChatRuntimePort growth this extends)
  - docs/adr/ADR-TS-003-title-generation-side-query-seam.md      # the cold-start side-query pattern instruction-refine reuses; AuxModelPort deferral
  - src/ui/chat/ChatComposer.vue                                 # the P1 composer this extends (keyboard contract, borderless textarea)
  - src/domain/ports/ChatRuntimePort.ts                          # the runtime seam + P3 additive members; inline-block response transport extends here
  - src/domain/ports/VaultPort.ts                                # listFiles/listFolders for @-mentions
  - src/ui/chat/modalSeam.ts                                     # the Obsidian Modal seam (InstructionConfirmModal reuses this pattern)
created: 2026-05-25
updated: 2026-05-25
---

# PRD — Composer Power (P4)

## Summary

P4 turns the P1–P3 send-only chat composer into the full Claudian **power composer**: a single
textarea that recognises five trigger characters and switches behaviour for each. Typing `/` (commands)
or `$` (skills) opens a palette over a command/skill catalog; `@` opens a mention palette over vault
files, subagents, MCP servers, and external directories; `#` at an empty input enters *instruction
mode* (capture a custom-system-prompt instruction, optionally AI-refine it, confirm in a modal);
`Shift+Tab` toggles *plan mode*; `!` at an empty input enters *bang-bash mode* (run one shell command
and surface its output). Plan mode also surfaces three **inline interactive blocks** — ask-user-question,
exit-plan-mode, and plan-approval — that P4 must both *render* and *let the user respond to inline*,
routing the answer back to the runtime.

This is the phase where the "Claudian feel" is mostly won (charter §4). It is delivered as a vertical
slice on the `next` integration branch in the Specorator architecture (Vue 3 SFC + DDD + narrow ports +
three bridges), reproducing Claudian's `InputController`/`InputToolbar` composer-mode orchestration as a
declarative composer-mode state machine — **not** a fork of Claudian's imperative DOM code.

P4 builds the *per-provider seams* for commands, skills, and mentions (so Codex/Opencode can plug in at
P9) but **wires only Claude**. P4 *renders and responds to* the inline approval/ask/exit-plan blocks but
**defers the approval-rules + permission-persistence machinery to P7**. Bang-bash runs only the user's
own explicit `!cmd` — never auto-executed, never secret-capturing.

## Goals

- **G1 — Trigger detection + palettes.** `/`, `$`, `@`, `#`, `!` are detected at the correct positions
  (start-of-token for `/`/`$`/`@`; empty-input for `#`/`!`) and each opens its surface with full
  keyboard navigation, mirroring Claudian's `InputController.handleInputChange`.
- **G2 — Slash commands + skills.** A drop-UP palette lists built-in commands and (lazily) a
  per-provider command/skill catalog; selecting inserts `prefix+name+space` (or runs a built-in).
- **G3 — @mention.** A drop-UP mention palette over a cached data provider lists vault files,
  subagents, MCP servers, and external dirs; selecting inserts the mention / attaches the referent.
- **G4 — Instruction mode `#`.** Capture an instruction, optionally run an AI *refine* side-query, and
  confirm via an Obsidian `Modal` before appending it to the custom system prompt.
- **G5 — Plan mode + inline blocks.** `Shift+Tab` toggles plan mode (capability-gated); the ask-user /
  exit-plan / plan-approval blocks render *and* accept an inline user response routed back to the runtime.
- **G6 — Bang-bash `!`.** Run a single user-typed shell command from the composer and surface its
  output as a block — within a strict security posture.
- **G7 — Composer-mode orchestration.** One composer-mode state machine arbitrates the five modes +
  the inline-block "replace the composer" swap, reproducing `InputController`/`InputToolbar`.
- **G8 — Parity + constraints.** Perceptual `--sp-*` parity with Claudian's composer; WCAG 2.2 AA
  combobox/listbox keyboard semantics; DDD/ports/3-bridges; no `v-html`/`innerHTML`/`window.confirm`.

## Non-goals

- **NG1 — Context & attachments (P5).** File chips, image context/embed/modal, browser/canvas/editor
  selection-as-context, and the inline-edit modal are out of P4. `@`-mentioning a *file* in P4 inserts
  the mention token; turning it into a removable **file chip** is P5.
- **NG2 — Toolbar widget selectors + usage meter (P6).** Model/mode/permission/thinking/service-tier/MCP
  selector widgets and the context-usage gauge are P6. P4 owns only the composer-mode orchestration and
  the plan-mode indicator, not the toolbar control strip.
- **NG3 — Approval RULES + persistence + ApprovalManager (P7).** P4 *renders and responds to* the inline
  ask-user / exit-plan / plan-approval blocks (the user picks an option, the answer routes to the
  runtime). The **permission-rule matching, `allow-always` persistence, project/session rule scoping,
  and the `ApprovalManager` machinery are P7.** P4 stores no approval rule and persists no permission.
- **NG4 — MCP client (P8).** No live MCP connection, tester, config parser, or tool listing. `@`-mention
  of an MCP server in P4 is gated/stubbed behind the mention catalog seam; the wired MCP subsystem is P8.
- **NG5 — Codex / Opencode providers + their command/skill/mention providers (P9).** P4 builds the
  per-provider command/skill/mention **seams** but wires **only Claude**. No Codex/Opencode catalog,
  no provider registry expansion.
- **NG6 — Settings UX (P10).** No slash-command/skill/agent settings tabs, no env-snippet manager, no
  instruction/system-prompt settings surface. P4 persists the instruction append via the existing
  `SettingsPort` only; the management UI is P10.
- **NG7 — A dedicated `AuxModelPort`.** Instruction-refine reuses the ADR-TS-003 cold-start side-query
  pattern over the existing runtime seam. A dedicated `AuxModelPort` is a flagged P4/P5 decision
  (CLAR-CP-003), not a committed P4 deliverable.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Power user (Claudian migrant) | The exact `/ $ @ # !` triggers, plan mode, and inline blocks they already know | Parity is the whole charter; a missing or re-feeling composer breaks the "same product" promise (charter §1) |
| Keyboard-first user | Full arrow/Enter/Tab/Esc navigation in every palette and inline block; no mouse required | WCAG 2.2 AA + Claudian's keyboard-driven terminal-aesthetic widgets (audit-frontend §3.3) |
| Cautious user | Bang-bash never runs anything they did not explicitly type; no surprise shell execution | Bang-bash is a dual-use capability; trust depends on a tight, predictable security posture |
| Architect (downstream) | Clear, framed ADR decisions (state machine, ports, refine seam, inline transport) without PM pre-deciding *how* | P4 is held until the ADRs land; the CLARs must frame options + constraints, not prescribe design |
| Reviewer (parity gate) | Each REQ mapped to a Claudian source path + a testable acceptance | charter §5.2 — every claimed §3 item maps to a Claudian path and a test |

## Jobs to be done

- When I want to run a saved command or skill, I want to **type `/` or `$` and pick from a list**, so I
  can invoke it without remembering its exact name.
- When I want the agent to consider a specific file, subagent, MCP server, or directory, I want to
  **type `@` and pick it**, so I can reference it inline without leaving the composer.
- When I want to teach the agent a standing instruction, I want to **type `#`, refine it, and confirm**,
  so it is appended to the custom system prompt deliberately rather than buried in one turn.
- When I want the agent to plan before acting, I want to **toggle plan mode with `Shift+Tab` and then
  approve/revise its plan inline**, so I stay in control of execution.
- When the agent asks me a question or requests approval mid-turn, I want to **answer it inline**, so the
  conversation does not stall and the answer reaches the runtime.
- When I want a quick shell result, I want to **type `!cmd` and see the output**, so I do not have to
  leave Obsidian — and I want to be certain nothing else runs.

## Functional requirements (EARS)

> EARS notation (`docs/ears-notation.md`). One requirement per entry; stable IDs. Each REQ maps 1:1 to
> a Claudian source path under `D:\Projects\claudian-main\src\` (the behaviour spec) and a Given/When/Then
> acceptance (charter §5.2). Grouped by sub-surface. "Satisfies" cites the charter / audit / state inputs.

---

### Group A — Slash commands `/` + Skills `$`

#### REQ-CP-001 — Slash trigger opens the command palette at start-of-token

- **Pattern:** event-driven
- **Statement:** *When the user types `/` at the start of the composer input or immediately after
  whitespace, the composer shall open the slash-command palette filtered by the text typed after `/`.*
- **Claudian path:** `shared/components/SlashCommandDropdown.ts`, `utils/slashCommand.ts`,
  `features/chat/controllers/InputController.ts` (`handleInputChange`).
- **Acceptance:**
  - Given the composer input is empty (or the caret follows whitespace)
  - When the user types `/`
  - Then the slash-command palette opens as a drop-UP, and typing further characters filters the list by name
- **Priority:** must
- **Satisfies:** charter §3.3 (slash), audit-frontend §3.3 "Slash commands `/` + Skills `$`", workflow-state P4 scope

#### REQ-CP-002 — Skills trigger opens the skills palette

- **Pattern:** event-driven
- **Statement:** *When the user types `$` at the start of the composer input or immediately after
  whitespace, the composer shall open the skills palette filtered by the text typed after `$`.*
- **Claudian path:** `SlashCommandDropdown.ts` (`triggerChars` incl. `$`), `core/providers/commands/ProviderCommandCatalog.ts`.
- **Acceptance:**
  - Given the caret is at start-of-token
  - When the user types `$`
  - Then the skills palette opens listing skill entries from the catalog
- **Priority:** must
- **Satisfies:** charter §3.3 (skills `$`), audit-frontend §3.3

#### REQ-CP-003 — Built-in commands are listed before provider entries

- **Pattern:** ubiquitous
- **Statement:** *The composer shall list the built-in commands (`/clear`, `/new`, `/add-dir`,
  `/resume`, `/fork`, `/compact`) in the slash palette independent of any provider catalog.*
- **Claudian path:** `core/commands/builtInCommands.ts`, `core/providers/commands/hiddenCommands.ts`.
- **Acceptance:**
  - Given no provider catalog has loaded yet
  - When the slash palette opens
  - Then the built-in commands appear, and any command in the hidden-commands set is excluded
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3, audit-backend "Agent/skill/slash-command settings"

#### REQ-CP-004 — Provider command/skill entries load lazily behind a per-provider catalog seam

- **Pattern:** event-driven
- **Statement:** *When the slash or skills palette opens, the composer shall request provider command
  and skill entries through a per-provider catalog seam, request-id-guarded so a stale response never
  populates the open palette.*
- **Claudian path:** `core/providers/commands/{ProviderCommandCatalog,ProviderCommandEntry}.ts`,
  `providers/claude/commands/*`, `providers/claude/storage/*`.
- **Acceptance:**
  - Given the palette is open and the user changes the filter before the first catalog response arrives
  - When a stale (superseded request-id) catalog response returns
  - Then the open palette ignores the stale response and shows only entries for the current request
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("`getProviderEntries`, request-id guarded"), NG5 (seam built, only Claude wired)

#### REQ-CP-005 — Keyboard selection inserts `prefix + name + space`

- **Pattern:** event-driven
- **Statement:** *When the user confirms a palette entry with Enter or Tab, the composer shall replace
  the trigger token with the entry's `prefix + name` followed by a single space and close the palette.*
- **Claudian path:** `SlashCommandDropdown.ts` (`handleKeydown`), `utils/slashCommand.ts`.
- **Acceptance:**
  - Given the slash palette is open with an entry highlighted
  - When the user presses Enter (or Tab)
  - Then the composer text becomes the entry's display prefix + name + a trailing space, and the palette closes
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3, audit-frontend "Keyboard-shortcut map"

#### REQ-CP-006 — A built-in command runs its action instead of inserting text

- **Pattern:** event-driven
- **Statement:** *When the user confirms a built-in command from the slash palette, the composer shall
  invoke that command's action rather than inserting it as message text.*
- **Claudian path:** `core/commands/builtInCommands.ts`, `InputController.ts` (`/clear`,`/new`,`/resume`,`/fork` interception before send).
- **Acceptance:**
  - Given the slash palette has `/clear` highlighted
  - When the user confirms it
  - Then the clear action runs and the literal text `/clear` is not sent as a message
- **Priority:** should
- **Satisfies:** charter §3.3, audit-frontend §3.3 "Composer core (built-in commands intercepted before send)"

#### REQ-CP-007 — Whitespace in the search closes the palette

- **Pattern:** unwanted-behaviour
- **Statement:** *If the user types a whitespace character into the active slash/skills search, then the
  composer shall close the palette and treat the input as literal text.*
- **Claudian path:** `SlashCommandDropdown.ts` (whitespace closes), `utils/slashCommand.ts`.
- **Acceptance:**
  - Given the slash palette is open with a partial filter
  - When the user types a space
  - Then the palette closes and the typed text (including the space) remains literal in the composer
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3

#### REQ-CP-008 — Escape dismisses the palette without altering text

- **Pattern:** event-driven
- **Statement:** *When the user presses Escape while a slash/skills palette is open, the composer shall
  close the palette and leave the composer text unchanged.*
- **Claudian path:** `SlashCommandDropdown.ts` (`handleKeydown`, Esc hides).
- **Acceptance:**
  - Given the slash palette is open
  - When the user presses Escape
  - Then the palette closes and no text is inserted or removed
- **Priority:** must
- **Satisfies:** audit-frontend "Keyboard-shortcut map" (Esc cancel)

---

### Group B — `@mention`

#### REQ-CP-009 — `@` opens the mention palette over a cached data provider

- **Pattern:** event-driven
- **Statement:** *When the user types `@` in the composer, the composer shall open the mention palette
  populated from a cached mention data provider and filter it by the text typed after `@`.*
- **Claudian path:** `shared/mention/{MentionDropdownController,VaultMentionCache,VaultMentionDataProvider}.ts`.
- **Acceptance:**
  - Given the composer is focused
  - When the user types `@vau`
  - Then the mention palette opens listing referents whose name matches `vau`, sourced from the cache
- **Priority:** must
- **Satisfies:** charter §3.3 (@mention), audit-frontend §3.3 "@mention"

#### REQ-CP-010 — Vault files and folders are mentionable via VaultPort

- **Pattern:** ubiquitous
- **Statement:** *The mention data provider shall source vault file and folder referents through the
  `VaultPort` (`listFiles`/`listFolders`), never by importing `obsidian` in the UI.*
- **Claudian path:** `shared/mention/VaultMentionDataProvider.ts`; Specorator seam `src/domain/ports/VaultPort.ts`.
- **Acceptance:**
  - Given a vault containing `notes/a.md` and a folder `notes/`
  - When the mention palette opens with filter `note`
  - Then both the file and folder appear, and no Vue module imports `obsidian`
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("Vault data via `VaultPort`"), epic constraint (Vue-no-obsidian)

#### REQ-CP-011 — Mention categories are visually distinguished

- **Pattern:** ubiquitous
- **Statement:** *The mention palette shall render each referent's category — vault file/folder,
  subagent, MCP server, external directory — with a category-distinct icon and a row layout matching the
  referent type (single-line path for files, two-line name+description for subagents/MCP).*
- **Claudian path:** `shared/mention/types.ts`, `features/file-context.css` (`.claudian-mention-*`).
- **Acceptance:**
  - Given the palette lists a vault file and a subagent
  - When both rows render
  - Then the file row is a single ellipsised path and the subagent row is a two-line name+description with a category-distinct icon
- **Priority:** should
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("Icon color encodes category; two-line MCP/agent rows")

#### REQ-CP-012 — Subagent / MCP / external-dir mentions resolve through a catalog seam

- **Pattern:** event-driven
- **Statement:** *When the mention palette requests non-vault referents (subagents, MCP servers,
  external directories), the composer shall obtain them through a mention catalog seam such that the
  vault-file source and the subagent/MCP/dir sources are independently swappable.*
- **Claudian path:** `shared/mention/MentionDropdownController.ts`, `utils/contextMentionResolver.ts`.
- **Acceptance:**
  - Given the subagent/MCP catalog source returns an empty list in P4 (only Claude wired, MCP deferred to P8)
  - When the mention palette opens
  - Then vault files still list correctly and the empty non-vault sources do not error the palette
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3, NG4 (MCP deferred), NG5 (subagent provider seam, Claude only)

#### REQ-CP-013 — Selecting a mention inserts the resolved mention token

- **Pattern:** event-driven
- **Statement:** *When the user confirms a mention referent, the composer shall replace the `@`-trigger
  token with the referent's resolved mention text and close the palette.*
- **Claudian path:** `utils/contextMentionResolver.ts`, `MentionDropdownController.ts` (select).
- **Acceptance:**
  - Given the mention palette lists `notes/a.md` highlighted
  - When the user presses Enter
  - Then the `@`-token is replaced by the resolved mention for `notes/a.md` and the palette closes
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3. *(File-chip attachment is explicitly P5 — NG1.)*

#### REQ-CP-014 — Mention filtering is debounced

- **Pattern:** event-driven
- **Statement:** *When the user types into the mention filter, the composer shall debounce the filter
  evaluation so rapid keystrokes do not trigger a re-query per character.*
- **Claudian path:** `MentionDropdownController.ts` (debounced filtering).
- **Acceptance:**
  - Given the user types five characters within the debounce window
  - When the keystrokes land
  - Then the data provider is queried once after the window, not five times
- **Priority:** should
- **Satisfies:** audit-frontend §3.3 ("debounced filtering"), NFR-CP-001 (responsiveness)

---

### Group C — Instruction mode `#`

#### REQ-CP-015 — `#` at empty input enters instruction mode

- **Pattern:** event-driven
- **Statement:** *When the user types `#` while the composer input is empty, the composer shall enter
  instruction mode and display the instruction-mode placeholder and the instruction-mode border state.*
- **Claudian path:** `features/chat/ui/InstructionModeManager.ts` (placeholder "# Save in custom system prompt").
- **Acceptance:**
  - Given the composer input is empty
  - When the user types `#`
  - Then the composer enters instruction mode, shows the instruction placeholder, and applies the instruction-mode border token
- **Priority:** must
- **Satisfies:** charter §3.3 (instruction `#`), audit-frontend §3.3 "Instruction mode `#`"

#### REQ-CP-016 — Submitting an instruction can run an AI refine side-query

- **Pattern:** optional-feature
- **Statement:** *Where the active provider supports instruction refinement, when the user submits an
  instruction, the composer shall run a refine side-query and present the refined instruction (or a
  clarification prompt) before confirmation.*
- **Claudian path:** `core/prompt/instructionRefine.ts`, `core/auxiliary/QueryBackedInstructionRefineService.ts`, `InputController.handleInstructionSubmit`.
- **Acceptance:**
  - Given the provider reports instruction-refine capability and the user has typed an instruction
  - When the user submits it
  - Then a refine side-query runs and the refined text (or a clarification question) is presented to the user
- **Priority:** should
- **Satisfies:** charter §3.3, audit-frontend §3.3, ADR-TS-003 (reuses the cold-start side-query / deferred `AuxModelPort` pattern), CLAR-CP-003

#### REQ-CP-017 — A confirm modal gates the instruction before it is saved

- **Pattern:** event-driven
- **Statement:** *When the instruction (refined or raw) is ready, the composer shall present an Obsidian
  `Modal` (via the modal seam) offering accept / edit / reject, and shall not persist the instruction
  until the user accepts.*
- **Claudian path:** `shared/modals/InstructionConfirmModal.ts`; Specorator seam `src/ui/chat/modalSeam.ts`.
- **Acceptance:**
  - Given a refined instruction is ready
  - When the confirm modal is shown and the user rejects it
  - Then nothing is appended to the system prompt
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3, epic constraint (Obsidian `Modal` via modalSeam, no `window.confirm`)

#### REQ-CP-018 — Accepting an instruction appends to (not replaces) the custom system prompt

- **Pattern:** event-driven
- **Statement:** *When the user accepts an instruction in the confirm modal, the composer shall append it
  to the existing custom system prompt via `SettingsPort` and shall not overwrite prior instructions.*
- **Claudian path:** `InputController.handleInstructionSubmit` (append to `systemPrompt`, `appendMarkdownSnippet`).
- **Acceptance:**
  - Given the custom system prompt already contains a prior instruction
  - When the user accepts a new instruction
  - Then the new instruction is appended below the prior one and the prior one is preserved
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("appends to, not replaces"), audit-backend (settings via `SettingsPort`)

#### REQ-CP-019 — Escape or an empty submit exits instruction mode

- **Pattern:** event-driven
- **Statement:** *When the user presses Escape in instruction mode, or submits an empty instruction, the
  composer shall exit instruction mode and restore the default composer state without persisting anything.*
- **Claudian path:** `InstructionModeManager.ts` (Esc/empty exits).
- **Acceptance:**
  - Given the composer is in instruction mode
  - When the user presses Escape
  - Then the composer returns to default mode and the instruction-mode border is removed
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3

---

### Group D — Plan mode + inline interactive blocks

#### REQ-CP-020 — `Shift+Tab` toggles plan mode when the provider supports it

- **Pattern:** optional-feature
- **Statement:** *Where the active provider reports plan-mode capability, when the user presses
  `Shift+Tab` in the composer, the composer shall toggle plan mode and reflect it with the plan-mode
  indicator (teal "PLAN" label + plan-mode composer border).*
- **Claudian path:** `features/chat/ui/InputToolbar.ts` (`PermissionToggle` plan state), `features/plan-mode.css`; capability via `ChatRuntimePort.getCapabilities()`.
- **Acceptance:**
  - Given the active provider reports plan-mode capability
  - When the user presses `Shift+Tab`
  - Then plan mode toggles on, the "PLAN" label and plan-mode border appear, and a second `Shift+Tab` toggles it off
- **Priority:** must
- **Satisfies:** charter §3.3 (plan mode), audit-frontend §3.3 "Plan mode toggle", capability-gating discipline (SPEC-TS-003 `getCapabilities`)

#### REQ-CP-021 — `Shift+Tab` does not collide with focus traversal

- **Pattern:** unwanted-behaviour
- **Statement:** *If the composer textarea is focused when `Shift+Tab` is pressed, then the composer
  shall consume the event for plan-mode toggling and shall not move focus out of the composer.*
- **Claudian path:** view keydown handler + `PermissionToggle` (audit-frontend §3.3 open question).
- **Acceptance:**
  - Given the composer textarea has focus
  - When the user presses `Shift+Tab`
  - Then plan mode toggles and focus remains in the composer (no tab-out)
- **Priority:** should
- **Satisfies:** audit-frontend §3.3 ("confirm `Shift+Tab` doesn't collide with focus traversal")

#### REQ-CP-022 — The ask-user-question block renders and is keyboard-navigable

- **Pattern:** event-driven
- **Statement:** *When the runtime emits an ask-user-question request, the composer region shall render
  the question block in place of the composer and support Arrow (item navigation), Left/Right or
  Tab/Shift+Tab (question-tab switching), Enter (select/advance), and Escape (cancel).*
- **Claudian path:** `features/chat/rendering/InlineAskUserQuestion.ts`, `features/ask-user-question.css`.
- **Acceptance:**
  - Given the runtime requests a multi-question ask-user prompt
  - When the block renders and the user presses Arrow Down then Enter
  - Then focus moves to the next item, the item is selected, and the composer is hidden while the block is active
- **Priority:** must
- **Satisfies:** charter §3.1/§3.3 inline blocks, audit-frontend §3.3 "Inline interactive blocks"

#### REQ-CP-023 — Answering the ask-user block routes the response to the runtime

- **Pattern:** event-driven
- **Statement:** *When the user submits an answer to the ask-user-question block, the composer shall
  route the answer to the runtime through the inline-block response transport and restore the composer.*
- **Claudian path:** `InputController.handleAskUserQuestion` (callback resolves to the runtime); `ChatRuntimePort` response seam.
- **Acceptance:**
  - Given the ask-user block is showing and the user submits a complete answer
  - When the submission resolves
  - Then the answer is delivered to the runtime's ask-user callback and the composer reappears
- **Priority:** must
- **Satisfies:** charter §3.1/§3.3, audit-backend "ChatRuntime callbacks" (`setAskUserQuestionCallback`), CLAR-CP-004

#### REQ-CP-024 — The exit-plan-mode block renders the plan and offers implement/revise/cancel

- **Pattern:** event-driven
- **Statement:** *When the runtime emits an exit-plan-mode request, the composer region shall render the
  "plan complete" card with a scrollable plan preview and the implement / revise / cancel actions.*
- **Claudian path:** `features/chat/rendering/InlineExitPlanMode.ts`, `InputController.handleExitPlanMode`, `features/plan-mode.css`.
- **Acceptance:**
  - Given the runtime requests exit-plan-mode with a plan body
  - When the block renders
  - Then the plan preview is shown scrollable and the implement / revise / cancel actions are present and keyboard-operable
- **Priority:** must
- **Satisfies:** charter §3.1/§3.3, audit-frontend §3.3 "Inline interactive blocks"

#### REQ-CP-025 — Responding to the exit-plan block routes the decision to the runtime

- **Pattern:** event-driven
- **Statement:** *When the user chooses implement, revise, or cancel on the exit-plan-mode block, the
  composer shall route that decision to the runtime through the inline-block response transport.*
- **Claudian path:** `InputController.handleExitPlanMode`; `ChatRuntimePort` `setExitPlanModeCallback` seam.
- **Acceptance:**
  - Given the exit-plan block is showing
  - When the user chooses "implement"
  - Then the implement decision is delivered to the runtime's exit-plan callback
- **Priority:** must
- **Satisfies:** charter §3.1/§3.3, audit-backend "ChatRuntime callbacks" (`setExitPlanModeCallback`), CLAR-CP-004

#### REQ-CP-026 — The plan-approval block renders and routes an approve/deny decision

- **Pattern:** event-driven
- **Statement:** *When the runtime emits an approval request, the composer region shall render the
  approval block (tool/action context + decision options) and route the chosen decision to the runtime;
  it shall **not** persist any approval rule.*
- **Claudian path:** `features/chat/rendering/InlinePlanApproval.ts`, `InputController.handleApprovalRequest`/`showPlanApproval`.
- **Acceptance:**
  - Given the runtime requests approval for an action
  - When the user selects "Allow once"
  - Then the decision is delivered to the runtime's approval callback and **no** persistent rule is written (NG3 — P7 owns rules)
- **Priority:** must
- **Satisfies:** charter §3.1, audit-backend "Security/approvals" (render+respond now, rules in P7), NG3, CLAR-CP-004

#### REQ-CP-027 — An inline block replaces the composer while active

- **Pattern:** state-driven
- **Statement:** *While an inline interactive block (ask-user / exit-plan / plan-approval) is active, the
  composer shall be hidden and replaced by the block, and shall be restored when the block resolves or
  is cancelled.*
- **Claudian path:** `InputController` (`claudian-hidden`, depth-counted composer hide/restore).
- **Acceptance:**
  - Given an ask-user block becomes active while a second approval request also arrives
  - When the blocks resolve in turn
  - Then the composer stays hidden until the last active block resolves, then reappears (depth-counted restore)
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("composer is *replaced* (not overlaid)")

#### REQ-CP-028 — Inline-response flows the CLI cannot carry are capability-gated

- **Pattern:** unwanted-behaviour
- **Statement:** *If the active provider's transport cannot faithfully carry an inline-block response
  (ask-user answer / plan decision / approval), then the composer shall not present that block as
  answerable and shall surface the limitation rather than silently dropping the response.*
- **Claudian path:** ADR-TS-003 / charter §6 transport-honesty; `ChatRuntimePort.getCapabilities()`.
- **Acceptance:**
  - Given a provider whose transport cannot carry an exit-plan decision
  - When an exit-plan request would otherwise render as answerable
  - Then the block is gated (not presented as answerable) and the user is informed, with no lost response
- **Priority:** must
- **Satisfies:** charter §6 (transport-honesty), audit-backend "ChatRuntime callbacks", CLAR-CP-004

---

### Group E — Bang-bash `!`

#### REQ-CP-029 — `!` at empty input enters bang-bash mode

- **Pattern:** event-driven
- **Statement:** *When the user types `!` while the composer input is empty, the composer shall enter
  bang-bash mode, switch the textarea to monospace, and apply the bang-bash border state.*
- **Claudian path:** `features/chat/ui/BangBashModeManager.ts`, `components/input.css` (`.claudian-input-bang-bash-mode`).
- **Acceptance:**
  - Given the composer input is empty
  - When the user types `!`
  - Then the composer enters bang-bash mode, the textarea font becomes monospace, and the bang-bash border token is applied
- **Priority:** must
- **Satisfies:** charter §3.3 (bang-bash `!`), audit-frontend §3.3 "Bang-bash `!`"

#### REQ-CP-030 — Submitting in bang-bash mode runs exactly the typed command

- **Pattern:** event-driven
- **Statement:** *When the user presses Enter (without Shift, not composing) in bang-bash mode, the
  composer shall execute through the bang-bash execution seam exactly the command the user typed, with
  no command rewriting, augmentation, or chaining.*
- **Claudian path:** `features/chat/services/BangBashService.ts`, `BangBashModeManager.ts` (Enter submits).
- **Acceptance:**
  - Given bang-bash mode contains the text `echo hi`
  - When the user presses Enter
  - Then exactly `echo hi` is executed (no prefix/suffix/extra command is added)
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3, NFR-CP-006 (bang-bash security posture), CLAR-CP-002

#### REQ-CP-031 — Bang-bash output surfaces as a block

- **Pattern:** event-driven
- **Statement:** *When a bang-bash command completes, the composer surface shall display the command's
  output as a tool-like output block (including a non-zero exit indication).*
- **Claudian path:** `BangBashService.ts`, `features/chat/ui/StatusPanel.ts` (bash output section).
- **Acceptance:**
  - Given a bang-bash command that prints to stdout and exits non-zero
  - When it completes
  - Then its stdout/stderr is surfaced as an output block and the non-zero exit is indicated
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3 ("bash output surfaces in the StatusPanel")

#### REQ-CP-032 — Bang-bash never auto-executes

- **Pattern:** unwanted-behaviour
- **Statement:** *If a command reaches the bang-bash mode by any path other than the user's explicit
  Enter submission, then the composer shall not execute it.*
- **Claudian path:** `BangBashModeManager.ts` (explicit submit only); charter epic constraint ("only the user's own explicit `!cmd`, no auto-exec").
- **Acceptance:**
  - Given bang-bash mode is pre-filled by a paste or programmatic set
  - When no explicit user Enter occurs
  - Then no command executes
- **Priority:** must
- **Satisfies:** charter epic constraint (bang-bash security), NFR-CP-006, CLAR-CP-002

#### REQ-CP-033 — Escape exits bang-bash mode without running anything

- **Pattern:** event-driven
- **Statement:** *When the user presses Escape in bang-bash mode, the composer shall exit bang-bash mode,
  restore the default composer state, and run no command.*
- **Claudian path:** `BangBashModeManager.ts` (Esc clears/exits).
- **Acceptance:**
  - Given the composer is in bang-bash mode with typed text
  - When the user presses Escape
  - Then the composer returns to default mode and no command is executed
- **Priority:** must
- **Satisfies:** charter §3.3, audit-frontend §3.3

---

### Group F — Composer-mode orchestration

#### REQ-CP-034 — One composer-mode state machine arbitrates the modes

- **Pattern:** ubiquitous
- **Statement:** *The composer shall maintain a single active composer mode (default | slash | skills |
  mention | instruction | bang-bash | plan, plus the inline-block-active state) such that entering one
  mode deterministically resolves any other trigger-driven mode.*
- **Claudian path:** `features/chat/controllers/InputController.ts`, `features/chat/ui/InputToolbar.ts`.
- **Acceptance:**
  - Given the composer is in instruction mode
  - When the user clears the input and types `!`
  - Then the composer transitions to a single well-defined mode (per the state machine) and is never in two trigger modes at once
- **Priority:** must
- **Satisfies:** charter §3.3, workflow-state "composer-mode model" ADR note, CLAR-CP-001

#### REQ-CP-035 — The P1 send keyboard contract is preserved outside a special mode

- **Pattern:** ubiquitous
- **Statement:** *When no palette, special mode, or inline block is active, the composer shall preserve
  the P1 send contract: Enter sends a non-empty message and prevents the newline; Shift+Enter inserts a
  newline; Enter during IME composition does not send.*
- **Claudian path:** P1 `src/ui/chat/ChatComposer.vue` (REQ-CC-008); Claudian `InputController.sendMessage`.
- **Acceptance:**
  - Given the composer is in default mode with non-empty text
  - When the user presses Enter (no Shift, not composing)
  - Then the message sends and no newline is inserted
- **Priority:** must
- **Satisfies:** P1 ChatComposer keyboard contract, charter §4 (P4 extends P1, does not break it), NFR-CP-009 (additivity)

#### REQ-CP-036 — Cancelling a mode restores the composer text intact

- **Pattern:** state-driven
- **Statement:** *While transitioning out of any trigger-driven mode by cancellation (Escape), the
  composer shall restore the composer to a coherent default state without losing user text that was not
  part of the cancelled trigger token.*
- **Claudian path:** `InputController.ts` (mode exit + queued-message restore patterns).
- **Acceptance:**
  - Given the user typed `look at @no` and the mention palette is open
  - When the user presses Escape
  - Then the palette closes and the literal text `look at @no` remains in the composer
- **Priority:** should
- **Satisfies:** charter §3.3, audit-frontend §3.3, CLAR-CP-001

## Non-functional requirements

> Inherited from the epic constraints (charter §1 bounding constraints + workflow-state "Epic
> constraints (every phase)") and the P3 NFR baseline (`specs/threads-sessions` NFR-TS-001..015), which
> P4 restates rather than links. New thresholds are flagged inline. Baseline for NFR-CP-001 (composer
> responsiveness) is captured on `next` before P4 implementation; pair with a baseline-capture task.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-CP-001 | performance | Trigger-to-palette-open + per-keystroke filter responsiveness | Palette opens within one animation frame of the trigger; filtered list updates ≤ 1 frame after the debounced filter window; no perceptible composer-typing lag vs the `next` P3 baseline |
| NFR-CP-002 | architecture | DDD inward-only imports (ADR-001) + narrow ports + three bridges (ADR-008) | `domain ← application ← infrastructure ← ui`; every Obsidian/Node touch behind a narrow port; all new ports implemented by `ObsidianBridge`, `MockBridge`, `LocalStorageBridge` |
| NFR-CP-003 | security | No `obsidian`/`node:*` import under `src/ui/**`; no `innerHTML`/`outerHTML`/`insertAdjacentHTML`; no `v-html`; no `window.confirm`/`alert`/`prompt` | Zero occurrences; blocking confirms (InstructionConfirmModal) use the Obsidian `Modal` seam (`modalSeam.ts`) only |
| NFR-CP-004 | reliability | `Result<T,E>` at every discrete/use-case boundary; streaming failure stays the `{type:'error'}` `StreamChunk` member, not a thrown error/`Result` across the runtime port | All new use cases return `Result`; the inline-response transport surfaces failure without throwing across `src/ui/**` |
| NFR-CP-005 | maintainability | Vue `<script setup>` only; Pinia stores DTO-only (no domain instance crosses the boundary, ADR-003) | ESLint-enforced; composer-mode state crosses as plain DTOs |
| NFR-CP-006 | security | **Bang-bash posture (new — P4):** only the user's explicit `!cmd` runs; no auto-execution; no environment-secret capture or echo into output; output surfaced as a tool-like block; execution behind a dedicated EXEC seam (port) | No command runs without explicit Enter (REQ-CP-032); no secret value is read into, logged, or rendered with bang-bash output; the exec seam is the sole shell-execution path |
| NFR-CP-007 | security | **Transport-honesty (charter §6 / ADR-TS-003 lineage):** any inline-response or plan flow the active provider's CLI cannot faithfully carry is capability-gated, not silently degraded | A non-capable provider never presents an unanswerable block as answerable (REQ-CP-028); gating reads `ChatRuntimePort.getCapabilities()`, never a `provider === 'claude'` branch |
| NFR-CP-008 | accessibility | WCAG 2.2 AA combobox/listbox semantics + full keyboard nav for every palette and inline block; non-colour state cues; `prefers-reduced-motion` honoured | Palettes expose combobox/listbox roles + `aria-activedescendant`; all triggers/blocks operable by keyboard; mode borders carry a non-colour cue; motion respects reduced-motion |
| NFR-CP-009 | compatibility | Additivity — no rename/removal of any P1/P2/P3 member; the composer extends `ChatComposer.vue` and grows `ChatRuntimePort` additively only | Zero renamed/removed P1–P3 members; any new runtime member is additive (mirrors SPEC-TS-003 growth) |
| NFR-CP-010 | privacy | No stored secret; no migration — load-or-default; the instruction append writes only to the existing settings store via `SettingsPort` | No secret written to `data.json`; no migration code path; settings load-or-default |
| NFR-CP-011 | usability | Perceptual `--sp-*` token parity for all composer surfaces; no raw Obsidian var or hex literal in components (colour literals confined to the token layer) | New mode-border / palette / inline-block colours resolve to `--sp-*` tokens (plan teal, instruction blue, bash pink, mention category colours); `lint-style-tokens` guard passes |
| NFR-CP-012 | reliability | Tests mirror `src/` path-for-path; `data-testid` PageObjects for mounted components; coverage gate | Coverage 80/70/80/80 (statements/branches/functions/lines); CSS-class/id selectors forbidden in `tests/**` |
| NFR-CP-013 | compatibility | `manifest.json` identity (`id`, `version`, `minAppVersion`) untouched; CI SHA-pinned + actionlint; full verify gate green on `next` | `npm run verify` + `npm run test:all` exit zero; manifest unchanged |

## Success metrics

- **North star:** A Claudian migrant performs all five composer power-flows (`/` command, `$` skill,
  `@` mention, `#` instruction with refine+confirm, `Shift+Tab` plan + inline plan approval) and one
  `!cmd` end-to-end in the rebuilt composer, by keyboard alone, with side-by-side screenshots reading as
  "the same product" (charter §5.1 per-surface parity).
- **Supporting:**
  - 100% of P4 `must` REQs covered by an automated test mapped to a Claudian source path (charter §5.2).
  - All five trigger characters detected at the correct positions with the documented keyboard map
    (audit-frontend "Keyboard-shortcut map") asserted in component tests.
  - Inline ask-user / exit-plan / plan-approval blocks each render *and* route a response to a mock
    runtime in tests (REQ-CP-023/025/026).
- **Counter-metric (scope leakage vs the non-goals):** zero P5/P6/P7/P8/P9/P10 surface ships in P4 —
  measured as: no file-chip/image/selection/inline-edit code (NG1), no toolbar selector widget or usage
  meter (NG2), **no approval-rule persistence / `ApprovalManager` (NG3)**, no MCP client/tester/parser
  (NG4), no Codex/Opencode catalog wired (NG5), no settings-management UI (NG6), no `AuxModelPort`
  committed (NG7). Any such code in the P4 diff is a counter-metric failure.

## Release criteria

What must be true to ship P4 on `next`.

- [ ] All `must` REQs (REQ-CP-001/002/003/004/005/007/008/009/010/012/013/015/017/018/019/020/022/023/024/025/026/027/028/029/030/031/032/033/034/035) pass acceptance.
- [ ] All `should` REQs pass or are explicitly waived with rationale.
- [ ] All NFR-CP-001..013 met (or explicitly waived with an ADR).
- [ ] The four P4 ADRs resolving CLAR-CP-001..004 are recorded and accepted (status flips `draft → accepted` only after).
- [ ] Bang-bash security posture (NFR-CP-006) verified by test: no auto-exec, no secret capture, output-as-block.
- [ ] Transport-honesty (NFR-CP-007) verified by test: a non-capable provider never presents an unanswerable inline block.
- [ ] Per-surface parity screenshots captured for the composer sub-surfaces (charter §5.1) and stored under `specs/composer-power/parity-screenshots.md`.
- [ ] `npm run verify` + `npm run test:all` exit zero on `next`; coverage gate 80/70/80/80 met.
- [ ] No counter-metric (scope-leakage) violation in the P4 diff.

## Open questions / clarifications

> Flagged ADR-worthy decisions for the **architect** (`/spec:design`). Each frames options + constraints;
> none is decided here (PM defines *what*; architect decides *how*). The PRD stays `draft` until these
> are recorded and accepted.

- **CLAR-CP-001 — Composer-mode trigger state machine.** *owner: architect.* How do the five trigger
  detections (`/`,`$`,`@`,`#`,`!`), plan mode, and the inline-block "replace the composer" swap compose
  into a single deterministic mode machine attached to the P1 `ChatComposer.vue`? Options: (a) a Pinia
  composer-mode store (DTO state) + composables per mode; (b) a `useComposerMode` state-machine
  composable owning a discriminated mode union; (c) a small XState-style machine. Constraints: must
  extend, not rewrite, `ChatComposer.vue` (NFR-CP-009); preserve the P1 send contract (REQ-CP-035);
  DTO-only store boundary (NFR-CP-005); mirror `InputController`'s arbitration without its imperative DOM.
  Frames REQ-CP-034/036.

- **CLAR-CP-002 — New ports: mention/data-provider, command/skill catalog+storage, bang-bash EXEC.**
  *owner: architect.* Three seams the audits name. (i) A **mention/data-provider seam** — vault files via
  `VaultPort`, plus a subagent/MCP/dir catalog source; one port or a `VaultPort`-composed provider + a
  separate catalog port? (ii) A **command/skill catalog + storage seam** (`ProviderCommandCatalog` /
  `SkillStorage`) — port vs application service over `VaultPort`? (iii) A **bang-bash EXEC seam** — a
  process/shell port; **security-sensitive** (NFR-CP-006). Constraints: ADR-008 "no port before its
  consumer earns it"; three-bridge impls (real / mock / unavailable-on-web); the EXEC port is the sole
  shell path and must not capture secrets. Frames REQ-CP-004/009/010/012/030/031/032.

- **CLAR-CP-003 — Instruction-refine side-query seam.** *owner: architect.* Reuse the ADR-TS-003
  cold-start side-query over `ChatRuntimePort.query` (smallest additive surface, matches title-gen), or
  introduce the deferred **`AuxModelPort`** now (ADR-TS-003 §3 flags instruction-refine P4 / inline-edit
  P5 as the trigger for it)? Constraints: provider-addressed (no `provider === 'claude'` branch);
  additive runtime growth (NFR-CP-009); refine must not couple to the tab's main stream. Frames REQ-CP-016.

- **CLAR-CP-004 — Inline-block RESPONSE transport on `ChatRuntimePort` + CLI transport honesty.**
  *owner: architect.* How does an ask-user answer / exit-plan decision / approval decision route back to
  the runtime — additive callback-registration members on `ChatRuntimePort`
  (`setAskUserQuestionCallback`/`setExitPlanModeCallback`/`setApprovalCallback`, per the backend audit)
  or a response/answer method? And **what can the `claude --print` CLI faithfully carry** — which inline
  flows are answerable vs must be capability-gated (charter §6 transport-honesty, ADR-TS-003 lineage)?
  Constraints: render+respond is P4, approval **rules/persistence/`ApprovalManager` are P7** (NG3);
  capability-gate via `getCapabilities()` (NFR-CP-007); additive growth only (NFR-CP-009). Frames
  REQ-CP-023/025/026/028.

## Out of scope

Explicitly not this cycle (see Non-goals NG1–NG7 for the binding list): file chips / images / selection
/ inline-edit (P5); toolbar widget selectors + usage meter (P6); approval rules + persistence +
`ApprovalManager` (P7); MCP client (P8); Codex/Opencode + their providers (P9 — seams only, Claude
wired); settings management UX (P10). P4 builds the per-provider command/skill/mention **seams** but
wires only Claude.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID.
- [x] Acceptance criteria testable (Given/When/Then, each mapped to a Claudian source path).
- [x] NFRs listed with targets (epic constraints restated; new bang-bash + transport-honesty thresholds flagged).
- [x] Success metrics defined (including a counter-metric — scope leakage vs the non-goals).
- [x] Release criteria stated.
- [x] `/spec:clarify` returned no open questions — **RESOLVED:** CLAR-CP-001..004 were the intentional ADR hand-offs to the architect; recorded + accepted as ADR-CP-001 (composer-mode state machine), ADR-CP-002 (mention/command-catalog/shell-exec ports), ADR-CP-003 (instruction-refine side-query), ADR-CP-004 (inline-block response transport + CLI capability-gating). `status` flipped `draft → accepted`.
