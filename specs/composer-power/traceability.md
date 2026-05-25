---
id: TRACE-CP-001
title: Composer Power (P4) — traceability matrix (validated at review)
stage: review
feature: composer-power
area: CP
epic: claudian-reboot
phase: P4
status: complete-with-conditioned-links   # 2 chains real-path-dead at code→test (R-CP-001/002); see review.md
owner: reviewer
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
inputs:
  - specs/composer-power/{requirements.md,spec.md,tasks.md,implementation-log.md,review.md}
  - docs/adr/ADR-CP-001/002/003/004
  - D:\Projects\claudian-main\src
---

# Traceability — Composer Power (P4)

Chain: **REQ-CP → SPEC-CP → T-CP → code(file) → TEST-CP → review-finding**. Regenerated from the
artifacts at `/spec:review`. **Two chains are real-path-dead at the code→test link** — the unit
test passes against directly-constructed channels the production wiring never drives end-to-end
(the R-RR-001 / R-TS-001 failure mode). Those rows carry the conditioning finding id; a passing
TEST cell with a finding id is a **false-green for the real runtime**.

> Legend — TEST cell: `✔` real-path proven (or pure/structural unit); `⚠ false-green` passes only
> via direct construction / single-runtime-Mock coincidence, real path unproven/dead; `M` manual
> leg (pending, human-owned); `—` n/a.

## REQ → downstream chain

| REQ-CP | SPEC-CP | T-CP | Code (file) | TEST-CP | Finding | Status |
|---|---|---|---|---|---|---|
| 001 slash start-of-token | 006,012,018,020 | 015,016,027,028,031 | `triggerParse.ts:21,45` | 007,014 ✔ | — | OK |
| 002 skills `$` | 012,018,020 | 015,016,031 | `triggerParse.ts:52` | 007,014 ✔ | — | OK |
| 003 built-ins first | 013,018,020 | 017,018,031 | `builtInCommands.ts:66`,`useComposerMode.ts:163` | 008 ✔ | R-CP-006 (parity) | OK (parity note) |
| 004 lazy catalog, req-guard | 005,007,009,013,018,026,028 | 007,018,028,031 | `useComposerMode.ts:159` | 008,012,026 ✔ | — | OK |
| 005 insert prefix+name+space | 012,013,018,020 | 016,018,031 | `RunCommandUseCase.ts:30` | 008,014 ✔ | — | OK |
| 006 built-in runs action | 013,018,020 | 018,031 | `RunCommandUseCase.ts:26`; `ChatSurface.vue:191` | 008,014 ⚠ false-green | **R-CP-003** | partial (4/6 inert in dispatch) |
| 007 whitespace closes | 012,018,020 | 016,031 | `triggerParse.ts:51` | 007,014 ✔ | — | OK |
| 008 Esc dismiss text-intact | 018,020 | 028,031 | `useComposerMode.ts:240` | 014,023 ✔ | — | OK |
| 009 `@` mention palette | 003,007,014,018,020,026 | 007,020,028,031 | `triggerParse.ts:59`,`useComposerMode.ts:182` | 003,009 ✔ | — | OK |
| 010 vault via VaultPort | 003,007,014 | 007,012,020 | `ObsidianMentionDataProvider.ts:42` | 009 ✔ / M1 | R-CP-005 (cap) | OK (cap nit, M1) |
| 011 categories distinguished | 020 | 032 | `MentionRow.vue` | 017 ✔ | — | OK |
| 012 catalog seam; empty no-error | 003,007,009,010,014 | 007,009,011,012,020 | `ObsidianMentionDataProvider.ts:60`,`MockComposerPorts.ts` | 003,009,016 ✔ | — | OK |
| 013 selecting inserts token | 014,018,020 | 020,028,031 | `useComposerMode.ts:279`,`ObsidianMentionDataProvider.ts:81` | 009 ✔ | R-CP-007 (format) | OK (parity nit) |
| 014 debounced filtering | 014,018 | 020,028 | `useComposerMode.ts:182` | 015 ✔ | — | OK |
| 015 `#` empty → instruction | 012,018,027 | 016,028,043,044 | `triggerParse.ts:69`,`useComposerMode.ts:213` | 007,011 ✔ | — | OK |
| 016 refine side-query | 015,027 | 021,022,043 | `instructionRefine.ts`,`RefineInstructionUseCase.ts` | 010,011 ✔ | — | OK |
| 017 confirm modal gates | 027 | 043,044 | `InstructionConfirmModal.ts`,`modalSeam.ts` | 011,025 ✔ / M2 | — | OK (modal proven M2) |
| **018 append not replace** | 005,027 | 006,043,044 | `PluginSettings.ts:appendInstruction`,`useComposerMode.ts:355` | 005,025 ⚠ false-green | **R-CP-001** | **real-path dead** (append OK; never read by runtime) |
| 019 Esc/empty exits | 018,027 | 028,044 | `useComposerMode.ts:335` | 025 ✔ | — | OK |
| 020 Shift+Tab plan gated | 002,021,032 | 006,033,034 | `useComposerMode.ts:224` | 002,018,027 ✔ | — | OK |
| 021 Shift+Tab no tab-out | 018,021 | 028,034 | `useComposerMode.ts:226` | 018 ✔ | — | OK |
| 022 ask-user renders+keyboard | 001,004,022 | 003,035,036 | `InlineAskUserQuestion.vue` | 004,019 ✔ | — | OK (render) |
| **023 ask-user routes to runtime** | 002,017,022 | 006,026,036 | `RespondToInlineBlockUseCase.ts`,`EnqueueRuntime.ts`,`ChatSurface.vue:184` | 020 ⚠ false-green | **R-CP-002** | route OK in isolation; **real-turn arrival dead** |
| 024 exit-plan renders | 001,004,023 | 003,037,038 | `InlineExitPlanMode.vue` | 004,024 ✔ | — | OK (render) |
| **025 exit-plan routes** | 002,017,023 | 006,026,038 | `RespondToInlineBlockUseCase.ts`,`ChatSurface.vue:184` | 020 ⚠ false-green | **R-CP-002** | as 023 |
| 026 approval renders+routes, no rule | 001,004,017,024 | 003,026,040 | `InlinePlanApproval.vue`,`RespondToInlineBlockUseCase.ts` | 004,020,021 ✔ (no-rule) / ⚠ (arrival) | R-CP-002, R-CP-004 | no-rule OK; **no emission path** for approval |
| 027 block replaces composer | 018,019,022,023,024 | 028,036,038,040,046 | `ChatComposer.vue:233`,`useComposerMode.ts:300` | 019,022,023 ✔ | — | OK |
| 028 capability-gated inline | 002,011,017,022,023,024,032 | 006,026,036,038,040 | `RespondToInlineBlockUseCase.ts:102`,inline `*.vue` onMounted | 024,027 ✔ | — | OK (honest gate) |
| 029 `!` empty → bang-bash | 012,018,019 | 016,028,046 | `triggerParse.ts:74`,`useComposerMode.ts:217` | 007,022 ✔ | — | OK |
| 030 runs exactly typed | 005,008,016,033 | 007,013,024 | `SubmitBangBashUseCase.ts`,`ObsidianShellExec.ts:51` | 013,028 ✔ / M2 | — | OK (verbatim) |
| 031 output as block | 008,016,025 | 013,024,041,042 | `BangBashOutput.vue`,`SubmitBangBashUseCase.ts` | 013 ✔ / M2 | R-CP-009 (spawn-err nit) | OK (M2) |
| 032 never auto-executes | 016,018,033 | 024,028 | `useComposerMode.ts:263` (explicit-Enter only) | 022,028 ✔ | — | OK (S1) |
| 033 Esc exits, runs nothing | 018 | 028 | `useComposerMode.ts:240` | 022 ✔ | — | OK |
| 034 one mode machine | 006,018,031 | 005,027,028 | `useComposerMode.ts:128` | 006,022 ✔ | — | OK |
| 035 P1 send preserved | 018,019,031 | 028,045,046 | `ChatComposer.vue:85,167` | 022,023 ✔ | — | OK (byte-identical) |
| 036 cancel restores text | 012,018,031 | 016,028,046 | `triggerParse.ts:84`,`useComposerMode.ts` | 007,023 ✔ | — | OK |

## NFR → evidence

| NFR-CP | SPEC-CP | Evidence (code/gate) | TEST-CP | Finding | Status |
|---|---|---|---|---|---|
| 001 responsiveness | 018 | pure `detectTrigger`+`v-if`; debounce 120ms; req-guard | 012,015 ✔ | R-CP-005 (uncapped mention) | OK (perf nit on large vault) |
| 002 DDD/ports/3-bridges | 007..011,038 | per-mount factories; ShellExec stateless; 3 bridges impl all ports | 016 ✔ / M1,M2 | — | OK |
| 003 no v-html/innerHTML/confirm/obsidian-in-UI | 030 | grep-clean (only comments); ESLint error-severity | 013,028 ✔ (+ESLint) | — | OK |
| 004 Result boundary / error-as-chunk | 035 | all 5 use cases return `Result`; refine maps error-chunk→err | 011,013,020 ✔ | — | OK |
| 005 `<script setup>` / DTO-only store | 006,018,031 | arbiter `ref<ComposerMode>` DTO, no Pinia, no domain instance in state | 022 ✔ | — | OK |
| 006 bang-bash posture | 008,016,033,036 | S1–S5 enforced; Mock no-spawn; no stdout/stderr logged | 013,028 ✔ / M2 | R-CP-009 | OK (spawn-err nit) |
| 007 transport-honesty | 011,017,032 | `getCapabilities()`-driven; zero `provider==='claude'` | 024,027 ✔ | R-CP-002 (gate masks dead channel) | OK (honest) but see finding |
| 008 a11y combobox/listbox + keyboard | 020,021,022,037 | listbox/option roles; keyboard nav; non-colour cues | 018,019 ✔ | **R-CP-008** | partial (activedescendant on wrong element) |
| 009 additivity | 001,002,034 | +3 setters/+2 caps/+3 chunk members/+1 settings field; 0 renamed | 001,002 ✔ | — | OK (1092 tests green) |
| 010 no secret / no migration | 005,033,036 | load-or-default; no `data.json` secret; render-only output | 005,028 ✔ | — | OK |
| 011 `--sp-*` token parity | 029 | §4.11 tokens resolve from theme vars; lint-style-tokens | (lint gate) ✔ | — | OK |
| 012 tests mirror + coverage | 019..025 | PageObjects + `data-testid`; 80/70/80/80 | (coverage gate) — | — | unverified here (orchestrator T-CP-053) |
| 013 manifest untouched + verify | 034 | `manifest.json` unchanged | 001,002 ✔ | — | OK (full verify pending) |

## SPEC-CP → REQ back-trace (orphan check)

Every SPEC-CP-001..038 traces to ≥1 REQ-CP / NFR-CP (per spec §11 table, re-validated): no
orphan spec items. The three cross-cutting invariants (SPEC-CP-031/032/033) and the additivity /
Result / observability / a11y / factory invariants (SPEC-CP-034..038) are grep-/structure-proven
(TEST-CP-027/028 + ESLint). **No orphan tests, tasks, or ADRs** — all 28 automatable TEST-CP map
to ≥1 REQ; T-CP-001..050 are implemented; T-CP-051/052 (M1/M2) human-owned pending; T-CP-053
(verify gate) orchestrator-owned pending. ADR-CP-001..004 each back a REQ chain.

## Broken / conditioned chains (summary)

| Chain | Break point | Finding | Resolution required |
|---|---|---|---|
| REQ-CP-018 (instruction append) | code→runtime: `customSystemPrompt` written, never read into a turn | **R-CP-001 (P2)** | wire to `--append-system-prompt` OR spec re-scope to P5 |
| REQ-CP-023/025 (inline routes) | code→runtime: callbacks on orphan `composerRuntime`, not the per-tab streaming runtime; consumer doesn't enqueue | **R-CP-002 (P2)** | bind to per-tab runtime + enqueue chunks (open ADR) OR spec re-scope to P5 |
| REQ-CP-026 (approval) | reducer has no `approval_request` emission (correct parity — SDK `canUseTool`, not stream) | R-CP-004 (P3) | spec doc note (forward-compat declared-now member) |

All other 31 `must`/`should` chains are real-path proven (pure/structural unit or component) or
manual-leg-pending (M1/M2) without a blocking break.
