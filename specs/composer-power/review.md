---
id: REVIEW-CP-001
title: Composer Power (P4) — parity + correctness review (autonomous self-review)
stage: review
feature: composer-power
area: CP
epic: claudian-reboot
phase: P4
status: complete
owner: reviewer
integration_branch: next
reference: D:\Projects\claudian-main
diff_base: 8b7cb77 (merge-base HEAD origin/develop)
diff_head: d2565cf (feature/composer-power)
reviewed: 2026-05-25
inputs:
  - specs/composer-power/requirements.md      # PRD-CP-001 (REQ-CP-001..036, NFR-CP-001..013)
  - specs/composer-power/design.md            # DESIGN-CP-001 (ADR-CP-001..004)
  - specs/composer-power/spec.md              # SPEC-CP-001..038, TEST-CP-001..028 + M1/M2
  - specs/composer-power/tasks.md             # TASKS-CP-001 (T-CP-001..053)
  - specs/composer-power/implementation-log.md
  - specs/composer-power/workflow-state.md
  - D:\Projects\claudian-main\src             # MIT parity reference (read-only)
verdict: Approved with conditions
---

# Review — Composer Power (P4)

> **Scope of this review.** Composer power per charter §3.3: slash `/` + skills `$`,
> `@mention`, instruction `#`, plan-mode + inline ask-user/exit-plan/plan-approval blocks,
> bang-bash `!`, and the composer-mode orchestration. Approval RULES / persistence (P7),
> attachments (P5), toolbar widgets (P6), MCP client (P8), other providers (P9), settings UX
> (P10) are correctly **out of scope** and are NOT counted as gaps below.
>
> This is the autonomous-drive self-review that replaces the per-phase human gate. The bias of
> this review is toward the **REAL-CLI / REAL-Obsidian** paths the Mock/Fixture-backed unit
> tests structurally hide — the P2 R-RR-001 / P3 R-TS-001/002/003 failure mode.

## Verdict: **Approved with conditions** — both P2 conditions RESOLVED (`ade17d6`, `8171fad`)

> **Update 2026-05-25 (dev):** the two P2 conditions below (R-CP-001, R-CP-002) are now fixed under
> strict TDD (one Conventional commit each); the P3 polish/parity findings (R-CP-003..009) remain
> scheduled. The remaining gate is the human manual leg (TEST-CP-M1/M2) + the orchestrator verify gate.

The P4 vertical slice is well-engineered. The pure layers (trigger-parse, built-ins,
instruction-refine, the inline DTOs, the use cases) are faithful ports of Claudian and are
exhaustively unit-tested; the security posture on bang-bash (S1–S5) is genuinely enforced; the
capability-gating discipline (zero `provider === 'claude'` branches, `getCapabilities()`-driven)
holds; no `v-html`/`innerHTML`/`window.confirm`/`obsidian`-in-UI violations; the full unit suite
is green (1092 tests / 154 files); the additive-growth contract is honoured.

**The condition** is two REAL-path defects the unit suite cannot see — both are the exact
"unit-green-but-dead-on-the-real-runtime" class the brief flagged:

1. **R-CP-001 (P2)** — the instruction `#` append reaches `PluginSettings.customSystemPrompt`
   but **nothing ever feeds `customSystemPrompt` into the runtime**, so on the real CLI the
   instruction has zero effect on the agent.
2. **R-CP-002 (P2)** — the inline-block render/respond channel is registered on a **separate
   runtime instance** from the per-tab streaming runtime, and the streaming consumer never
   enqueues the three request chunks, so the inline blocks never render from a real turn (today
   masked because Claude CLI gates `supportsInlineResponse:false` and the single-runtime Mock
   makes the two instances coincide).

Neither is a *user-visible regression on the Claude CLI today* (instruction mode is new; inline
answering is honestly capability-gated off), which is why this is "Approved with conditions"
rather than "Blocked" — but both are real defects that contradict spec text, and both must be
either fixed or **explicitly re-scoped in the spec** (e.g. "instruction wiring to the wire is
P5", "inline-block runtime binding is P5") before P4 is declared done, so the gap is tracked and
not silently inherited. The single final human review gate (TEST-CP-M1/M2) should specifically
exercise these two paths.

---

## 1. Requirements compliance (REQ-CP-001..036)

| REQ | Status | Evidence / note |
|---|---|---|
| REQ-CP-001 slash at start-of-token | ✅ | `triggerParse.ts:21-66` `scanSlashTrigger` (index 0 / post-whitespace), TEST-CP-007 |
| REQ-CP-002 skills `$` | ✅ | same scan, `kind:'skills'`, distinct `$` prefix |
| REQ-CP-003 built-ins before provider entries | ✅ (parity note) | `builtInCommands.ts`, `useComposerMode.ts:163-178` built-ins prepended. **Parity:** see R-CP-006 (six built-ins vs Claudian's four). |
| REQ-CP-004 lazy catalog, request-id guarded | ✅ | `useComposerMode.ts:159-179` monotonic `requestId`, stale discard |
| REQ-CP-005 insert `prefix+name+space` | ✅ | `RunCommandUseCase.ts:30`, `replaceTriggerToken` |
| REQ-CP-006 built-in runs action | ⚠️ partial | `RunCommandUseCase` returns `{kind:'action'}`; **but `dispatchBuiltIn` (ChatSurface.vue:191-203) only wires `new`+`compact`; `/clear`,`/add-dir`,`/resume`,`/fork` log a debug and DO NOTHING** — see R-CP-003 |
| REQ-CP-007 whitespace closes palette | ✅ | `detectTrigger` returns null on whitespace in slash filter, TEST-CP-014 |
| REQ-CP-008 Esc dismisses, text intact | ✅ | `handleEscape` `closePalette` + `setMode('default')` |
| REQ-CP-009 `@` opens mention palette | ✅ | `detectTrigger` `@`-scan + `loadMentionPalette` |
| REQ-CP-010 vault via VaultPort | ✅ | `ObsidianMentionDataProvider.ts:42/52` `listFiles('')`/`listFolders('')`; no `obsidian` in UI |
| REQ-CP-011 categories distinguished | ✅ | `MentionRow.vue` file single-line vs subagent two-line + category icon |
| REQ-CP-012 subagent/MCP/dir via catalog seam; empty no-error | ✅ | MCP/dir no-op `[]`, subagent Claude-only; `_claudeSubagents` catch → `[]` |
| REQ-CP-013 selecting inserts resolved token | ✅ (parity note) | `confirmEntry` inserts `mentionText`. **Parity:** no trailing space + full path vs Claudian `@name ` — R-CP-007 |
| REQ-CP-014 debounced filtering | ✅ | `loadMentionPalette` 120ms debounce + AbortSignal, TEST-CP-015 |
| REQ-CP-015 `#` empty → instruction | ✅ | `shouldEnterInstruction` + `handleInput:213` |
| REQ-CP-016 refine side-query | ✅ | `RefineInstructionUseCase`, cold-start `forceColdStart`, best-effort fall-through, TEST-CP-011 |
| REQ-CP-017 confirm modal gates | ✅ | `InstructionConfirmModal` (Obsidian Modal, `createEl`/`setText`); reject persists nothing |
| REQ-CP-018 append (not replace) | ⚠️ literal-pass / effect-dead | `appendInstruction` + `saveSettings` append is correct (TEST-CP-005/025); **but the appended value never reaches the runtime** — see R-CP-001 |
| REQ-CP-019 Esc/empty exits | ✅ | `submitInstruction:335` empty → `default`, no persist |
| REQ-CP-020 Shift+Tab plan, capability-gated | ✅ | `togglePlan` reads `supportsPlanMode`; inert on CLI (false) |
| REQ-CP-021 Shift+Tab no focus traversal | ✅ | `togglePlan` `event.preventDefault()` + returns true (consumed) |
| REQ-CP-022 ask-user renders + keyboard | ✅ | `InlineAskUserQuestion.vue` multi-question tabs, Arrow/Enter/Esc |
| REQ-CP-023 ask-user routes to runtime | ⚠️ unit-pass / real-path dead | `RespondToInlineBlockUseCase.respondAskUserQuestion` correct in isolation; **the render arrival from a real turn is wired to the wrong runtime** — see R-CP-002 |
| REQ-CP-024 exit-plan renders | ✅ | `InlineExitPlanMode.vue` scrollable preview + implement/revise/cancel |
| REQ-CP-025 exit-plan routes | ⚠️ | as REQ-CP-023 (R-CP-002) |
| REQ-CP-026 approval renders + routes, no rule | ✅ (route) / ⚠️ (arrival) | `InlinePlanApproval.vue`; `allow-always` persists no rule (TEST-CP-021, no Settings/history dep). **But `approval_request` is never emitted by the reducer** (Claudian routes approval through SDK `canUseTool`, not the stream) → the block can never arrive on the CLI path — see R-CP-004 |
| REQ-CP-027 inline block replaces composer | ✅ | `ChatComposer.vue:233` `v-if` swap; depth-counted queue `resolveInlineBlock` |
| REQ-CP-028 capability-gated inline | ✅ | `RespondToInlineBlockUseCase:102` reads flag first; components render read-only + `showInfo` (TEST-CP-024) |
| REQ-CP-029 `!` empty → bang-bash | ✅ | `shouldEnterBangBash` + monospace + border |
| REQ-CP-030 runs exactly typed command | ✅ | `SubmitBangBashUseCase` verbatim; `ObsidianShellExec` S2 passthrough |
| REQ-CP-031 output as block | ✅ | `BangBashOutput.vue` stdout/stderr + exit badge + notice |
| REQ-CP-032 never auto-executes | ✅ | `useComposerMode.ts:263-268` shell runs ONLY from explicit-Enter branch; Mock no-spawn (TEST-CP-028) |
| REQ-CP-033 Esc exits, runs nothing | ✅ | `handleEscape` covers bang-bash |
| REQ-CP-034 one mode state machine | ✅ | `useComposerMode` single `ref<ComposerMode>`, one-active-mode (TEST-CP-022) |
| REQ-CP-035 P1 send preserved | ✅ | `ChatComposer.vue:85-99` `onKeydown` byte-identical; gated behind `default`+`handleKeydown→false` |
| REQ-CP-036 cancel restores text | ✅ | `replaceTriggerToken` only on confirm; Esc never rewrites (TEST-CP-023) |

**Satisfied: 31/36 cleanly.** 5 carry conditions (REQ-CP-006, 018, 023, 025, 026) tied to the
four REAL-path findings below.

## 2. Design compliance

The implementation honours DESIGN-CP-001 / ADR-CP-001..004 structurally:
- ADR-CP-001 `useComposerMode` discriminated-union arbiter + pure trigger-parse — faithful.
- ADR-CP-002 three narrow ports + S1–S5 ShellExec posture — faithful and enforced.
- ADR-CP-003 instruction-refine as a 2nd cold-start side-query over `query` (no `AuxModelPort`) — faithful.
- ADR-CP-004 +3 callback setters, +2 caps, +3 StreamChunk request members, CLI honesty — the
  *shapes* are faithful; the **wiring** has the R-CP-002 runtime-binding gap the ADR/design did
  not anticipate (the design assumed one runtime stream; the P3 reboot is per-tab runtimes).

Drift: the spec/ChatSurface comment ("the inline request the runtime pulls renders here … under
a single-runtime mock the composer's runtime IS the streaming runtime") is true only for the
single-runtime Mock; it is false for per-tab runtimes and for the real CLI (R-CP-002).

## 3. Spec compliance / deviations log

The implementation log records the relevant deviations honestly:
- Deviation (a) "composer binds ONE runtime via CHAT_RUNTIME_FACTORY … per-tab↔composer binding
  is a P5+ refinement" — this is **R-CP-002**, under-stated as a refinement; it is a correctness
  gap that defeats the inline render path on a capable transport.
- Deviation (b) "`/clear`//add-dir//resume//fork log a debug with no surface side effect" — this
  is **R-CP-003**; REQ-CP-006 is `should`, so it is a legitimate partial, but it must be visible
  in release notes (four palette commands are inert).
- `customSystemPrompt` added to load-or-default only, "written by instruction mode" — the log
  does NOT note that nothing **reads** it back to the wire (**R-CP-001**). This is the material
  omission.

No ADR was opened for the runtime-binding change (R-CP-002) even though it is architecturally
load-bearing for the entire inline-block surface.

## 4. Constitution check

- Article I (spec-first): mostly honoured; R-CP-001 is a spec/impl mismatch that should have
  surfaced as a spec update ("wire customSystemPrompt to `--append-system-prompt`") rather than a
  silent dead-end. Article V (traceability): every REQ has a downstream chain (see traceability.md).
- Article IV (quality gates, earliest-stage): R-CP-002 traces to a **design** gap (per-tab runtime
  reality vs single-stream assumption), not a coding defect — fix at design.
- No violations of Articles II/III/VI/VII/VIII/IX/X observed.

## 5. Risk status

- Charter §6 transport-honesty (NFR-CP-007): **upheld** — Claude CLI reports
  `supportsInlineResponse:false`/`supportsPlanMode:false`; the answerable affordance is gated off
  and rendered read-only with a notice. This is the correct, honest degrade.
- New risk surfaced: **R-CP-002** — the gating currently *masks* a dead channel rather than
  gating a working-but-unsupported one. When a capable transport (Agent-SDK/ACP) flips the flag,
  the inline blocks will NOT light up "with no UI change" as the ADR promises, because the
  callbacks are on the wrong runtime and the stream consumer doesn't enqueue. The promise is
  currently false.

---

## 6. Findings (prioritized)

**Severity:** P1 = blocker (must fix before merge to `next`); P2 = important (fix or explicitly
re-scope in spec before P4 done); P3 = polish (schedule). **Class:** [PARITY] gap vs Claudian
behaviour · [CORRECTNESS] real-path bug · [A11Y] · [SCOPE].

| ID | Sev | Class | Title | Our file:line vs Claudian | Recommendation / owner |
|---|---|---|---|---|---|
| **R-CP-001** | **P2 — RESOLVED** (`ade17d6`) | CORRECTNESS (real-CLI dead, unit-green) | **Instruction append never reaches the runtime system prompt.** `customSystemPrompt` is written on accept and round-trips through settings, but no code reads it into a turn. `ClaudeCliChatRuntime.prepareTurn` (`src/infrastructure/obsidian/ClaudeCliChatRuntime.ts:73-81`) sets `prompt: request.text` only; `_buildArgs:277-290` never emits `--append-system-prompt`/`--system-prompt`. `ChatTurnRequest`/`PreparedChatTurn` (`src/domain/chat/ChatTurn.ts:8-27`) carry no system-prompt field. So instruction mode is a no-op on the agent. | OURS: `ClaudeCliChatRuntime.ts:73,277` + `useComposerMode.ts:355` (write only) · CLAUDIAN: `ClaudeQueryOptionsBuilder.ts:105` `customPrompt: ctx.settings.systemPrompt` → `buildSystemPrompt` → SDK query options. | Either (a) thread `customSystemPrompt` → `prepareTurn` → a `--append-system-prompt <value>` arg on the CLI (the CLI supports it), updating `ChatTurnRequest`/SPEC; OR (b) **explicitly re-scope in spec.md**: "P4 captures+persists the instruction; feeding it to the wire is P5." Today it is neither wired nor scoped-out. **Owner: architect (spec decision) → dev.** **RESOLVED `ade17d6` (dev):** option (a) — `ChatRuntimeQueryOptions.appendSystemPrompt` (additive) threaded `customSystemPrompt` (read via a `SettingsPort`-backed `tabsStore` binding seam) → `sendMessage` query options → `ClaudeCliChatRuntime._buildArgs` emits `--append-system-prompt <text>` (the real CLI flag). RED at the argv seam + the store threading; real round-trip rides TEST-CP-M2. |
| **R-CP-002** | **P2 — RESOLVED** (`8171fad`) | CORRECTNESS (wrong-runtime binding; unit-green) | **Inline-block render/respond channel registered on an orphan runtime.** `ChatSurface.vue:131` builds `composerRuntime = createRuntime()` — a *fresh* instance (MockBridge `createChatRuntime()` returns `new MockChatRuntime()` each call; real bridge a new `ClaudeCliChatRuntime`). The arbiter's `EnqueueRuntime`+`RespondToInlineBlockUseCase` register the 3 callbacks on **this** runtime, but real turns stream on the **per-tab** runtime (`tabsStore.ts:263 binding.createRuntime()`). The two are different objects. Additionally the streaming consumer (`RunChatTurnUseCase`/`tabsStore`/`chatStore`) does **not** handle the 3 inline request chunks. Result: an inline request from a real turn never enqueues → never renders. Masked today by (i) Claude CLI `supportsInlineResponse:false` and (ii) the single-runtime Mock making the two instances *happen* to coincide in the dev-smoke; but **no test drives an inline block through `sendMessage`** — every inline test calls `enqueueInlineBlock`/`RespondToInlineBlockUseCase` directly. `MockChatRuntime.query` (`:202-213`) also never invokes the captured callback when it yields an inline chunk (unlike the real reducer's `_routeInlineRequest`). | OURS: `ChatSurface.vue:131,184-186` (orphan runtime) vs `tabsStore.ts:263` (per-tab runtime); `RunChatTurnUseCase.ts` / `tabsStore.ts` (no inline chunk handling) · CLAUDIAN: `InputController` holds the single `ChatRuntime` and registers `setAskUserQuestionCallback`/etc on the same instance that streams. | Bind the inline-block callbacks to the **active tab's** runtime (route through `tabsStore`, registering the enqueue-decorator on `binding.createRuntime()`'s per-tab instance), and have the streaming consumer enqueue the 3 request chunks. **Open an ADR** for the per-tab↔composer runtime binding (architecturally load-bearing). OR re-scope: "inline-block runtime binding is P5." The ADR-CP-004 claim "the same UI lights up — no UI change" is currently unachievable. **Owner: architect (ADR) → dev.** **RESOLVED `8171fad` (dev):** the composer's inline channel + capability reads bind to the active tab's runtime via a new `tabsStore.activeRuntime()` accessor (the same per-tab instance `sendMessage`/`query` streams on) instead of a `createRuntime()` orphan. **No ADR needed** — the composer operates on the active tab, so its inline channel = the active-tab runtime (no new runtime lifecycle; a minimal accessor over the existing per-tab deps Map). RED test (`ChatSurface.inline.test.ts`) drives an ask-user request THROUGH the active-tab runtime with a distinct-instance factory → `inline-ask` renders + no orphan built; verified RED on the orphan code. ADR-CP-004's "lights up unchanged" is now true on a capable transport. |
| **R-CP-003** | **P3** | PARITY / SCOPE | **Four built-in palette commands are inert.** `/clear`, `/add-dir`, `/resume`, `/fork` resolve `{kind:'action'}` but `dispatchBuiltIn` (`ChatSurface.vue:191-203`) only wires `new`→`openTab` and `compact`→`compactActive`; the other four log a debug and do nothing. REQ-CP-006 is `should`, so this is an acceptable partial, but four of six built-ins not doing the thing is a parity gap a Claudian migrant will notice (`/clear`, `/resume`, `/fork` are core flows that already exist in the P3 store). | OURS: `ChatSurface.vue:201-202` · CLAUDIAN: `builtInCommands.ts` actions `clear`/`add-dir`/`resume`/`fork` all dispatched by `InputController`. | Wire `/clear`→tab reset, `/resume`→`ResumeSessionDropdown`, `/fork`→`ForkTargetModal` (all P3 stores/modals exist). At minimum, note the four inert commands in release-notes and the spec. **Owner: dev.** |
| **R-CP-004** | **P3** | PARITY (documentation) | **`approval_request` has a callback + DTO + UI but no emission path.** The reducer (`reduceClaudeStream.ts:544-559`) emits `exit_plan_mode`/`ask_user_question` from tool_use blocks but **never** `approval_request`. This is actually *correct* parity — Claudian routes approval through the SDK `canUseTool` callback (`providers/claude/runtime/ClaudeApprovalHandler.ts`), not the stream, and `claude --print` has no `canUseTool` channel — but the spec/SPEC-CP-001 implies the reducer emits all three "where the wire surfaces" them, which is misleading for approval. Not a bug; a doc/spec accuracy gap. | OURS: `reduceClaudeStream.ts:544` (no approval branch) · CLAUDIAN: `ClaudeChatRuntime.ts:687,1788 canUseTool` / `ClaudeApprovalHandler.ts:35`. | Add a sentence to SPEC-CP-001/011 clarifying approval arrives via the SDK permission callback (P7/capable transport), not the `--print` stream — the declared-now member is forward-compat only. **Owner: architect (spec note).** |
| **R-CP-005** | **P3** | PARITY / perf | **Mention provider has no result cap.** `ObsidianMentionDataProvider.query` lists the whole vault root (`listFiles('')`) + folders + subagents with no cap before filtering; Claudian caps (`MentionDropdownController.ts:389 .slice(0,50)` / `:404 .slice(0,100)`). On a large vault this risks the NFR-CP-001 responsiveness budget. Coverage-excluded infra (unit tests can't see it); a manual-leg (M1) concern. | OURS: `ObsidianMentionDataProvider.ts:84` `_filter` (no cap) · CLAUDIAN: `MentionDropdownController.ts:389/404`. | Add a post-filter cap (50–100, parity `VaultMentionCache`). Verify in TEST-CP-M1 against a real vault. **Owner: dev.** |
| **R-CP-006** | **P3** | PARITY | **Built-in command set diverges from Claudian.** Ours lists six distinct built-ins (`clear`,`new`,`add-dir`,`resume`,`fork`,`compact`); Claudian's `BUILT_IN_COMMANDS` is four (`clear`,`add-dir`,`resume`,`fork`) with `new` as an **alias** of `clear` and `compact` NOT a built-in command. The six-command set is what REQ-CP-003 specifies, so the impl matches the spec — but the spec diverged from Claudian without noting it. Low impact. | OURS: `builtInCommands.ts:23-30` · CLAUDIAN: `core/commands/builtInCommands.ts` (4 + `new` alias). | Accept as a deliberate Specorator divergence (the P3 reboot surface is six tabs/sessions actions); record the rationale in the spec so the parity charter audit is honest. **Owner: architect (spec note).** |
| **R-CP-007** | **P3** | PARITY | **Mention insert format diverges.** Ours inserts `@<full-path>` for a file (no trailing space) and `@<name>` for a subagent; Claudian inserts `@<name> ` (trailing space) for files and `@<id> (agent) ` for agents. The trailing space matters for caret flow after insert; the `(agent)` suffix is a Claudian affordance. REQ-CP-013 leaves `mentionText` to the provider, so not a violation. | OURS: `ObsidianMentionDataProvider.ts:81` · CLAUDIAN: `MentionDropdownController.ts:562/575`. | Consider matching `@name ` (+ trailing space) for parity feel; verify in M1. **Owner: dev (optional).** |
| **R-CP-008** | **P3** | A11Y | **`aria-activedescendant`/`aria-controls` on the wrong element.** SPEC-CP-020/037 requires the combobox **textarea** to carry `aria-controls`→listbox id and `aria-activedescendant`→active option id. `ComposerDropdown.vue:125` puts `aria-activedescendant` on the listbox; `ChatComposer.vue:279-280` textarea has only `role="combobox"`+`aria-expanded`. A screen reader on the textarea won't announce the active option. The dropdown's own comment ("the TEXTAREA mirrors it") is not realized. | OURS: `ChatComposer.vue:279` / `ComposerDropdown.vue:125` · WCAG 2.2 combobox pattern. | Move `aria-activedescendant`+`aria-controls` onto the textarea (bind the active option id up from the dropdown). **Owner: dev.** |
| **R-CP-009** | **P3** | CORRECTNESS (minor) | **Genuine spawn failure surfaces as exit code 1, not `err`.** `ObsidianShellExec._toResult` maps a non-`killed` exec error with a non-numeric `code` (e.g. `'ENOENT'` — shell not found) to `completedExitCode → 1` and returns `ok(...)`; the spec says "only a spawn failure → err." The bang-bash output block would show exit 1 rather than the unavailable notice. Low impact (vault cwd + `/bin/bash`/`cmd.exe` almost always resolve). Coverage-excluded; M2 concern. | OURS: `ObsidianShellExec.ts:79-96,117-120` · spec SPEC-CP-008. | Distinguish spawn-failure error codes (`ENOENT`/`EACCES`) → `err`; keep completed non-zero exits as `ok`. **Owner: dev (optional).** |

### What is solid (do not regress)

- **Pure trigger-parse** (`triggerParse.ts`) — start-of-token vs mid-word, whitespace-closes, `@`
  in-token, empty-input gates: a faithful, exhaustively-tested port of `slashCommand.ts`.
- **Bang-bash S1–S5 posture** — explicit-Enter-only (`useComposerMode.ts:263`), verbatim
  passthrough, no plugin secret in child env, no stdout/stderr logged, 30s/1MB→124, Mock
  no-spawn, LocalStorage `err`. Genuinely enforced and grep-gated (TEST-CP-028).
- **Capability-gating discipline** — zero `provider === 'claude'` branches in `src/application`/
  `src/ui` (grep-confirmed); every gate reads `getCapabilities()`. The read-only inline render +
  `showInfo` honesty is correct.
- **P1 send preservation** — `ChatComposer.vue` `onKeydown` byte-identical, IME-safe, gated behind
  `kind==='default'`. No P1/P2/P3 member renamed/removed (additivity holds; 1092 tests green).
- **Reducer emits `exit_plan_mode`/`ask_user_question`** from real tool_use blocks
  (`reduceClaudeStream.ts:544`) — the REAL-CLI emission side IS wired (the gap is the consumer
  binding, R-CP-002, not the reducer).
- **No `v-html`/`innerHTML`/`window.confirm`/`obsidian`-in-UI**; instruction confirm via Obsidian
  `Modal` + `createEl`/`setText`; bang-bash output verbatim text (a `<script>` renders as text).
- **`--sp-*` token parity** (§4.11) resolving from theme vars; no hex/raw-var leak in components.

## 7. Correct deferrals (out-of-scope — NOT gaps)

- P5 attachments / file chips / images / selection / inline-edit — `@`-file inserts the token
  only (NG1); no chip code present. ✅
- P6 toolbar widget selectors + usage meter — only the plan-mode indicator ships. ✅
- P7 approval RULES / persistence / `ApprovalManager` — `allow-always` persists no rule;
  `RespondToInlineBlockUseCase` has no Settings/history dependency (TEST-CP-021). ✅
- P8 MCP client — mention MCP source no-ops `[]`. ✅
- P9 Codex/Opencode — per-provider seams built, only Claude wired; no provider registry expansion. ✅
- P10 settings UX — `customSystemPrompt` is load-or-default only, no settings tab. ✅ (but see
  R-CP-001 — "load-or-default only" must not also mean "never read by the runtime").
- `AuxModelPort` (NG7) — instruction-refine reuses the cold-start side-query; no new port. ✅

Counter-metric (scope leakage): **none observed** — no P5/P6/P7/P8/P9/P10 surface ships in the diff.

## 8. Conditions to clear before P4 is declared done

1. **R-CP-001** — ✅ **RESOLVED `ade17d6`** — `customSystemPrompt` wired to the CLI via
   `--append-system-prompt` (threaded through `ChatRuntimeQueryOptions.appendSystemPrompt`). Real-CLI
   effect still to be confirmed on the human manual leg (TEST-CP-M2).
2. **R-CP-002** — ✅ **RESOLVED `8171fad`** — the inline-block channel binds to the active-tab runtime
   (`tabsStore.activeRuntime()`); the streaming runtime's reducer-emitted request chunk now routes to
   the rendered queue. No ADR required (straightforward active-tab binding). The "lights up with no UI
   change" promise is now true on a capable transport; real-turn inline arrival still to be confirmed on
   TEST-CP-M2.
3. The two manual legs (**TEST-CP-M1/M2**) must specifically exercise: instruction → system-prompt
   effect on the real CLI (R-CP-001), inline-block arrival from a real turn (R-CP-002), the
   mention vault read + cap (R-CP-005), and the bang-bash spawn-failure path (R-CP-009).
4. Run the full verify gate (`npm run verify` + `npm run test:all`, coverage 80/70/80/80) — not
   re-run in this review beyond the unit suite (1092/154 green).

Findings R-CP-003..009 are P3 polish/parity — schedule, not blocking, but each needs at least a
spec/release-note line so the gap is tracked.
