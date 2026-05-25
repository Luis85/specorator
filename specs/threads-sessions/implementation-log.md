---
id: IMPL-TS-001
title: Threads & Sessions (P3) — Implementation log
stage: implementation
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: in-progress       # domain + infra batches done; application/UI/styles/wire-in/gate remain
owner: dev
integration_branch: next
branch: feature/threads-sessions
reference: D:\Projects\claudian-main
inputs:
  - SPEC-TS-001            # specs/threads-sessions/spec.md (SPEC-TS-001..034)
  - TASKS-TS-001           # specs/threads-sessions/tasks.md (T-TS-001..042)
created: 2026-05-25
updated: 2026-05-25
---

# Implementation log — Threads & Sessions (P3)

Append-only, one entry per executed task. Domain (T-TS-002..006) + infra
(T-TS-007..013) batches complete; the application (T-TS-014..025), UI
(T-TS-026..035), styles (T-TS-036), wire-in (T-TS-037..039), and gate
(T-TS-040..042) batches remain.

> **TDD-ordering note (load-bearing):** the three additive `ChatRuntimePort`
> members (`resumeSession`/`setResumeCheckpoint`/`getCapabilities`) +
> `RuntimeCapabilities` + `ChatRuntimeQueryOptions.forceColdStart` are an
> **additive interface growth**. TypeScript forces *every* implementor
> (`MockChatRuntime`, `FixtureChatRuntime`, `ClaudeCliChatRuntime`, the two
> `ScriptedRuntime` test stubs) to satisfy the grown interface for the codebase to
> compile. So the runtime member **implementations** necessarily landed in
> **T-TS-005** (the green of the domain growth), not in T-TS-013. The T-TS-012 RED
> test therefore passes on author (behavioural-confirmation contract for SPEC-TS-009)
> rather than RED→green. T-TS-013 carries no further production code for the
> Mock/Fixture half; the ClaudeCli session/resume seam (also landed in T-TS-005) is
> coverage-excluded → manual leg TEST-TS-M2.

---

## T-TS-001 — Baseline parity scaffold + guard verification (done)

- **Files:** `specs/threads-sessions/parity-screenshots.md` (new). No file under `src/`.
- **Commit:** `1990dcc`
- **Spec:** NFR-TS-012 (baseline leg), NFR-TS-001 (guard verification).
- **Outcome:** done. Scaffolded the seven-sub-surface × 320/520/720 × light/dark matrix
  (baseline column pre-impl, Specorator column filled at the final review). Verified the
  deleted-symbol guard (`eslint.config.js`) does **not** list `PROVIDER_HISTORY_PORT` /
  `ProviderHistoryPort` / `ConversationRecord` / `@/infrastructure/history/**` — no relaxation needed.
- **Deviation:** none.

## T-TS-002 — RED: domain port/types/settings + additive growth (done, qa-RED)

- **Files (new):** `tests/domain/ports/ProviderHistoryPort.test.ts`,
  `tests/domain/chat/ConversationRecord.test.ts`,
  `tests/domain/ports/ChatRuntimePort.ts.test.ts`,
  `tests/domain/chat/ChatMessage.ts.test.ts`,
  `tests/domain/settings/settingsResolve.test.ts`.
- **Commit:** `ccb9e5c`
- **Spec:** TEST-TS-001..005, SPEC-TS-001..005.
- **Outcome:** done (RED). Failed vue-tsc + runtime sentinels — the types/members/helpers did not exist.
- **Deviation:** none.

## T-TS-003 — ConversationRecord types + CONVERSATION_RECORD_VERSION (done)

- **Files (new):** `src/domain/chat/ConversationRecord.ts` (full file).
- **Commit:** `753b2a9`
- **Spec:** SPEC-TS-002, REQ-TS-008/009/018, NFR-TS-013/014.
- **Outcome:** done. `CONVERSATION_RECORD_VERSION = 1 as const` + ConversationRecord/Meta/
  ProviderSessionState/ClaudeProviderState/ForkPlan. Pure interfaces; no secret field.
  TEST-TS-002 green; typecheck + lint green.
- **Deviation:** none.

## T-TS-004 — ProviderHistoryPort + HistoryError + PROVIDER_HISTORY_PORT key + barrel (done)

- **Files:** `src/domain/ports/ProviderHistoryPort.ts` (new),
  `src/infrastructure/bridge/ports.ts` (+`PROVIDER_HISTORY_PORT`),
  `src/domain/ports/index.ts` (re-export port/HistoryError + conversation types).
- **Commit:** `99baab2`
- **Spec:** SPEC-TS-001, REQ-TS-008/010/012/013/018/026, NFR-TS-002/004.
- **Outcome:** done. Seven-method Result-returning port + typed `HistoryError{kind}`; own
  InjectionKey (no aggregate); barrel re-exports. TEST-TS-001 green; guard does not fire.
- **Deviation:** none.

## T-TS-005 — Additive ChatRuntimePort/ChatMessage growth + forceColdStart (done)

- **Files (src):** `src/domain/ports/ChatRuntimePort.ts` (+RuntimeCapabilities + 3 members),
  `src/domain/ports/index.ts` (+RuntimeCapabilities re-export), `src/domain/chat/ChatTurn.ts`
  (+forceColdStart), `src/domain/chat/ChatMessage.ts` (+3 rewind ids),
  `src/infrastructure/mock/MockChatRuntime.ts`, `src/infrastructure/localstorage/FixtureChatRuntime.ts`
  (recorded-no-op session ops + capabilities + forceColdStart recording + accessors),
  `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (resumeSession→next --resume,
  setResumeCheckpoint→pending resume-at consumed/logged, getCapabilities, forceColdStart skips --resume).
- **Files (tests):** `tests/domain/ports/ChatRuntimePort.test.ts` + `tests/domain/chat/ChatMessage.rr.test.ts`
  (P1/P2 sentinels updated to the superseding additive contract),
  `tests/application/chat/RunChatTurnUseCase.test.ts` + `.rr.test.ts` (ScriptedRuntime stubs implement
  the 3 new members — runnability).
- **Commit:** `a263d14`
- **Spec:** SPEC-TS-003/004, REQ-TS-013/019/021/028, NFR-TS-004/014.
- **Outcome:** done. TEST-TS-003 + TEST-TS-004 green; every P1/P2 runtime test stays green
  (52 in the affected set). The nine P1 members byte-identical; streaming-error boundary unchanged.
- **Deviation:** the additive interface growth forced the three runtime-member implementations into
  this task (the runnability mandate) — see the TDD-ordering note above. Two P1/P2 exact-count test
  *assertions* (ChatRuntimePort.test.ts exact-nine; ChatMessage.rr.test.ts rewind-id-absent) were
  updated to the additive contract; the superseding exact contracts live in the new `*.ts.test.ts`
  files. This is a `qa`-owned test-assertion change executed within the qa-RED scope of this batch.

## T-TS-006 — PluginSettings.sessionsFolder + maxTabs + resolve/clamp helpers (done)

- **Files:** `src/domain/settings/PluginSettings.ts` (+fields/defaults/MIN_TABS/MAX_TABS_CEILING/
  resolveSessionsFolder/clampMaxTabs), `src/core/core-settings.ts` (validateSettings resolves/clamps +
  schema text/number fields), `src/infrastructure/obsidian/ObsidianBridge.ts` (load-or-default the new
  fields via a static `_coerceSettings` helper). Tests: `tests/core/core-settings.test.ts` +
  `tests/infrastructure/obsidian/ObsidianBridge.settings.test.ts` (P0 PSR exact-shape sentinels updated
  to the grown shape).
- **Commit:** `b77048b`
- **Spec:** SPEC-TS-005, REQ-TS-005/008, NFR-TS-013.
- **Outcome:** done. TEST-TS-005 green; full unit suite (743 at that point) green; typecheck 0.
  Device-local persistence; no obsidian/node:* in domain.
- **Deviation:** the P0 PSR settings-shape *assertions* were updated for the additive growth
  (runnability + correctness); the no-migration invariant is unchanged.

## T-TS-007 — RED: conversationRecordCodec + pure buildForkPlan (done, qa-RED)

- **Files (new):** `tests/infrastructure/history/conversationRecordCodec.test.ts`,
  `tests/infrastructure/history/buildForkPlan.test.ts`.
- **Commit:** `e84ec06`
- **Spec:** TEST-TS-010 + TEST-TS-014 (U leg), SPEC-TS-010, SPEC-TS-006 (pure fork-derive).
- **Outcome:** done (RED). Both modules did not exist (import failure).
- **Deviation:** none.

## T-TS-008 — conversationRecordCodec.ts + pure buildForkPlan.ts (done)

- **Files (new):** `src/infrastructure/history/conversationRecordCodec.ts`,
  `src/infrastructure/history/buildForkPlan.ts`.
- **Commit:** `325176b`
- **Spec:** SPEC-TS-010, SPEC-TS-006 (pure fork-derive), REQ-TS-008/018, NFR-TS-013/014.
- **Outcome:** done. serialise stamps version:1 + strips non-contract fields; deserialise
  total/never-throws (corrupt→{ok:false}, any/missing version accepted, no migration branch);
  buildForkPlan truncates inclusive + derives forkSource (not a copy), source untouched.
  TEST-TS-010 + TEST-TS-014 (codec/fork-derive U leg) green; raw try/catch confined to infra.
- **Deviation:** none.

## T-TS-009 — RED: Mock/LocalStorage ProviderHistoryPort + fake-ports member (done, qa-RED)

- **Files (new):** `tests/infrastructure/mock/MockHistoryStore.test.ts`,
  `tests/infrastructure/localstorage/FixtureHistoryStore.test.ts`; extended
  `tests/__fakes__/fake-ports.test.ts`.
- **Commit:** `50ede98`
- **Spec:** TEST-TS-011/012 (U leg), SPEC-TS-007/008.
- **Outcome:** done (RED). 16 failing — the stores + factory member did not exist.
- **Deviation:** none.

## T-TS-010 — Mock/LocalStorage ProviderHistoryPort impls + fake-ports member (done)

- **Files:** `src/infrastructure/mock/MockHistoryStore.ts` (new),
  `src/infrastructure/mock/MockBridge.ts` (+createProviderHistoryPort, stable store),
  `src/infrastructure/localstorage/FixtureHistoryStore.ts` (new, 3 canned records),
  `src/infrastructure/localstorage/LocalStorageBridge.ts` (+createProviderHistoryPort, non-durable),
  `tests/__fakes__/fake-ports.ts` (+providerHistory member).
- **Commit:** `138303c`
- **Spec:** SPEC-TS-007/008, REQ-TS-008/010/012/013/018, NFR-TS-002.
- **Outcome:** done. TEST-TS-011/012 (U leg) green; DESC sort / empty→ok([]) / idempotent delete /
  meta-only updateMeta (EC-TS-14) / resolveSessionId→ok(null) (EC-TS-5) / buildForkPlan via the pure
  helper (EC-TS-7). DTO-only; no vault/node:*.
- **Deviation:** none.

## T-TS-011 — ObsidianBridge vault-file ProviderHistoryPort (VaultFileHistoryStore) (done, coverage-excluded)

- **Files:** `src/infrastructure/obsidian/history/VaultFileHistoryStore.ts` (new),
  `src/infrastructure/obsidian/ObsidianBridge.ts` (+createProviderHistoryPort).
- **Commit:** `899bb58`
- **Spec:** SPEC-TS-006, REQ-TS-008/010/012/013/018, NFR-TS-002 (manual leg), NFR-TS-014.
- **Outcome:** done (structural + typecheck). One JSON file per conversation under
  resolveSessionsFolder(sessionsFolder); save/hydrate/listSessions(corrupt-skip+warn)/updateMeta
  (meta-only)/delete(idempotent)/resolveSessionId/buildForkPlan; all I/O via VaultPort; codec never
  throws across the boundary. Coverage-excluded (src/infrastructure/obsidian/**); behavioural gate =
  MANUAL leg **TEST-TS-M1** (vault-file round-trip + reload) — scheduled for the final epic-review
  human gate (NOT self-claimed).
- **Deviation:** none. (test-plan.md does not yet exist — a qa-stage artifact; the manual leg is
  recorded here pending qa authoring it.)

## T-TS-012 — RED: grown ChatRuntimePort impls + cold-start backing (done, qa-RED→passes-on-author)

- **Files (new):** `tests/infrastructure/mock/MockChatRuntime.ts.test.ts`.
- **Commit:** `42fc119`
- **Spec:** TEST-TS-016 (runtime U leg), TEST-TS-020 (cold-start backing), SPEC-TS-009.
- **Outcome:** done. Passes on author — the runtime members + forceColdStart recording landed in
  T-TS-005 (additive-interface compile mandate). Serves as the behavioural-confirmation contract.
- **Deviation:** TDD-ordering — see the load-bearing note at the top.

## T-TS-013 — Grown ChatRuntimePort impls on the bridges + cold-start backing (done)

- **Files:** no further production code — Mock/Fixture (recorded-no-op session ops + capabilities +
  cold-start) and ClaudeCli (resumeSession→--resume, setResumeCheckpoint→pending resume-at,
  getCapabilities, forceColdStart skips --resume) all landed in **T-TS-005** (commit `a263d14`).
  A lint fix to the T-TS-007 codec test (drop an unnecessary `as` assertion) rides this task's commit.
- **Commit:** see the doc/lint commit closing the infra batch.
- **Spec:** SPEC-TS-009, REQ-TS-013/019/021/024/027, NFR-TS-002.
- **Outcome:** done. TEST-TS-016 (runtime U leg) + TEST-TS-020 (cold-start backing) green;
  forceColdStart ignores the bound session for that one query. The ObsidianBridge CLI session/resume
  seam half is coverage-excluded → manual leg **TEST-TS-M2** (real-CLI resume/rewind), scheduled for
  the final epic-review human gate.
- **Deviation:** the implementation landed in T-TS-005 (additive-interface compile mandate); this
  task is the confirmation + the manual-leg backing. No empty production commit was created.

---

## Batch state (domain + infra)

- **Completed:** T-TS-001 .. T-TS-013.
- **Typecheck:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → **0 errors**.
- **Lint:** `npx eslint .` → **0 errors** (3 pre-existing warnings from P0: ErrorBoundary.test.ts
  one-component-per-file ×2, a tabs-area max-lines warning — none introduced by this batch).
- **Unit tests:** `npx vitest run` → **101 files, 779 passed** (was 743 pre-batch; P0/P1/P2 green).
- **Manual legs (not self-claimed):** TEST-TS-M1 (vault-file store round-trip + reload),
  TEST-TS-M2 (real-CLI resume/rewind) — for the single final epic-review human gate.
- **Not run (orchestrator gate):** full `npm run verify` / `npm run build` / `build:web` /
  `test:storybook`. Manifest untouched. No push.

## Next batch — APPLICATION (T-TS-014 .. T-TS-025)

First ready task: **T-TS-014 (qa RED)** — `titleGeneration.ts` pure transforms
(`parseTitleGenerationResponse` 50-char/strip-quotes/sentence-case/''→null;
`fallbackTitle`; `TITLE_GENERATION_SYSTEM_PROMPT` + `buildTitleGenerationPrompt` ported verbatim
from claudian `core/prompt/titleGeneration.ts`). It has no dependencies (Batch-0 parallel-ready),
so it can start immediately; T-TS-018/020/022/024 RED tasks gate the remaining use cases.
