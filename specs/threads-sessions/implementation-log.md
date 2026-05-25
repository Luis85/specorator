---
id: IMPL-TS-001
title: Threads & Sessions (P3) — Implementation log
stage: implementation
feature: threads-sessions
area: TS
epic: claudian-reboot
phase: P3
status: in-progress       # domain + infra + application + UI + wire-in + styles + dev-smoke done; gate T-TS-040/041 (human) + T-TS-042 (orchestrator) remain
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
(T-TS-007..013) + application (T-TS-014..025) + UI (T-TS-026..035) + wire-in
(T-TS-037..038) + styles (T-TS-036) + dev-smoke (T-TS-039) batches complete; the
gate batch remains: T-TS-040/041 (human-owned manual legs TEST-TS-M1/M2) +
T-TS-042 (orchestrator — full verify + parity self-review + draft PR into `next`).

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

## T-TS-014 — RED: titleGeneration pure transforms (done, dev-RED)

- **Files (new):** `tests/application/threads/titleGeneration.test.ts`.
- **Commit:** `f5aab20`
- **Spec:** SPEC-TS-016, TEST-TS-019, REQ-TS-024, NFR-TS-005.
- **Outcome:** done (RED). Module did not exist (transform/import failure).
- **Deviation:** none.

## T-TS-015 — titleGeneration.ts (pure prompt/parse/fallback) (done)

- **Files (new):** `src/application/threads/titleGeneration.ts`.
- **Commit:** `028db4a`
- **Spec:** SPEC-TS-016, REQ-TS-024, NFR-TS-005.
- **Outcome:** done. `TITLE_GENERATION_SYSTEM_PROMPT` + `buildTitleGenerationPrompt` +
  `parseTitleGenerationResponse` ported verbatim from claudian
  `core/prompt/titleGeneration.ts`; `fallbackTitle` (badge-width truncate, empty →
  'New conversation'). Pure/total; no obsidian/Vue import. TEST-TS-019 green (15).
- **Deviation:** `parseTitleGenerationResponse` is the claudian verbatim port (strip
  quotes / strip trailing punctuation / 50-char cap). Claudian does NOT apply an
  explicit sentence-case transform beyond that; the spec's "sentence-case" note
  describes the model output the system prompt requests, not a post-parse mutation.
  Ported verbatim per the T-TS-015 DoD; no invented transform.

## T-TS-016 — RED: rewindEligibility pure scan (done, dev-RED)

- **Files (new):** `tests/application/threads/rewindEligibility.test.ts`.
- **Commit:** `6213cd2`
- **Spec:** SPEC-TS-018, TEST-TS-021, REQ-TS-019, NFR-TS-005.
- **Outcome:** done (RED). Module did not exist.
- **Deviation:** none.

## T-TS-017 — rewindEligibility.ts (pure scan) (done)

- **Files (new):** `src/application/threads/rewindEligibility.ts`.
- **Commit:** `f485359`
- **Spec:** SPEC-TS-018, REQ-TS-019, NFR-TS-005.
- **Outcome:** done. `isRewindEligible(messages, userMessageId)` — forward scan
  mirroring claudian `rewind.ts findRewindContext` (hasResponse leg); eligible iff a
  following assistant (before the next user) bears a non-empty `assistantMessageId`;
  unknown id / no-following / empty → false (EC-TS-8). Pure/total; no capability check
  (the UI's runtime concern). TEST-TS-021 green (8).
- **Deviation:** none.

## T-TS-018 — RED: List/Resume/Rename/Delete + useProviderHistoryPort (done, dev-RED)

- **Files (new):** `tests/application/threads/ListConversationsUseCase.test.ts`,
  `tests/application/threads/ResumeConversationUseCase.test.ts`,
  `tests/application/threads/RenameConversationUseCase.test.ts`,
  `tests/application/threads/DeleteConversationUseCase.test.ts`,
  `tests/ui/composables/useProviderHistoryPort.test.ts`.
- **Commit:** `eeced66`
- **Spec:** SPEC-TS-011/012/017/021, TEST-TS-011/012/013, REQ-TS-010/011/012/013/014.
- **Outcome:** done (RED). The four use cases + the composable did not exist (5 failed).
- **Deviation:** none.

## T-TS-019 — List/Resume/Rename/Delete use cases + useProviderHistoryPort() (done)

- **Files (new):** `src/application/threads/ListConversationsUseCase.ts`,
  `src/application/threads/ResumeConversationUseCase.ts`,
  `src/application/threads/RenameConversationUseCase.ts`,
  `src/application/threads/DeleteConversationUseCase.ts`,
  `src/ui/composables/useProviderHistoryPort.ts`.
- **Commit:** `9525273`
- **Spec:** SPEC-TS-011/012/017/021, REQ-TS-010/011/012/013/014, NFR-TS-004/005.
- **Outcome:** done. List forwards `listSessions` (empty → ok([])); Resume hydrates →
  err-no-throw on miss/corrupt (EC-TS-5/6) + `resolveSessionId` → ResumeResult; Rename
  `updateMeta(id,{title,titleManual:true,updatedAt})` meta-only (EC-TS-14); Delete
  idempotent. Composable inject-or-throw (no aggregate). Each Result-returning; no
  provider branch; no obsidian/node:* under src/application/threads or
  src/ui/composables. TEST-TS-011/012/013 (U leg) + the composable A leg green (11).
- **Deviation:** none.

## T-TS-020 — RED: ForkConversationUseCase + chooseForkTarget (done, dev-RED)

- **Files (new):** `tests/application/threads/ForkConversationUseCase.test.ts`,
  `tests/application/threads/chooseForkTarget.test.ts`.
- **Commit:** `141a758`
- **Spec:** SPEC-TS-013/023, TEST-TS-014, REQ-TS-017/018, NFR-TS-004.
- **Outcome:** done (RED). Both modules did not exist.
- **Deviation:** none.

## T-TS-021 — ForkConversationUseCase + pure chooseForkTarget (done)

- **Files (new):** `src/application/threads/ForkConversationUseCase.ts`,
  `src/application/threads/chooseForkTarget.ts`.
- **Commit:** `7a16589`
- **Spec:** SPEC-TS-013/023, REQ-TS-017/018, NFR-TS-004/005.
- **Outcome:** done. Fork forwards `history.buildForkPlan` (derive-not-copy; M1..M3 of
  M1..M5 + forkSource{resumeAt:M3}; source untouched, EC-TS-7; first-message fork;
  id-absent → err). `chooseForkTarget(option)` maps 'new-tab'/'current-tab' through,
  unrecognised/dismissed → null. Result-returning; no provider branch. TEST-TS-014 (8).
- **Deviation:** `chooseForkTarget` takes the modal's selected option string (`'new-tab'
  | 'current-tab' | null`) and validates it to a `ForkTarget`. The Obsidian
  `ForkTargetModal` (a thin shell, coverage-excluded → TEST-TS-M2) calls this pure
  mapping. Matches SPEC-TS-023 ("the modal's option-resolution logic factored into a
  pure chooseForkTarget mapping").

## T-TS-022 — RED: RewindConversationUseCase (conversation/code modes) (done, dev-RED)

- **Files (new):** `tests/application/threads/RewindConversationUseCase.test.ts`.
- **Commit:** `13b563e`
- **Spec:** SPEC-TS-014, TEST-TS-016/017, REQ-TS-021/022, NFR-TS-004.
- **Outcome:** done (RED). Module did not exist.
- **Deviation:** none.

## T-TS-023 — RewindConversationUseCase (conversation executes / code gated) (done)

- **Files (new):** `src/application/threads/RewindConversationUseCase.ts`.
- **Commit:** `c7e0c11`
- **Spec:** SPEC-TS-014, REQ-TS-021/022, NFR-TS-004/005.
- **Outcome:** done. Pure orchestration → Result<RewindResult>. conversation mode finds
  the following assistant turn id → {truncatedThrough, checkpointSet:true,
  checkpointMessageId}; code-and-conversation gated (NG7) → {checkpointSet:false} +
  notice, NO VaultPort/fs call (takes no port), conversation untouched (EC-TS-9);
  absent id → err. TEST-TS-016/017 (U leg) green (3).
- **Deviation:** the spec's `RewindResult{truncatedThrough,checkpointSet}` is carried
  exactly; the result also surfaces `checkpointMessageId: string|null` (the assistant
  turn id the caller passes to `runtime.setResumeCheckpoint`) and `notice: string|null`
  (the gated-mode showInfo text) — the spec text explicitly references both as the data
  the caller needs (§SPEC-TS-014). Minimal, no port dependency added; the use case
  cannot touch fs by construction.

## T-TS-024 — RED: GenerateTitleUseCase + CompactConversationUseCase (done, dev-RED)

- **Files (new):** `tests/application/threads/GenerateTitleUseCase.test.ts`,
  `tests/application/threads/CompactConversationUseCase.test.ts`.
- **Commit:** `f53797f`
- **Spec:** SPEC-TS-015/016, TEST-TS-018/020, REQ-TS-023/024/025, NFR-TS-004.
- **Outcome:** done (RED). Both modules did not exist.
- **Deviation:** none.

## T-TS-025 — GenerateTitleUseCase + CompactConversationUseCase (done)

- **Files (new):** `src/application/threads/GenerateTitleUseCase.ts`,
  `src/application/threads/CompactConversationUseCase.ts`.
- **Commit:** `9a36954`
- **Spec:** SPEC-TS-015/016, REQ-TS-023/024/025, NFR-TS-004/005.
- **Outcome:** done. GenerateTitle drives a cold-start side-query
  (`query(turn,[],{forceColdStart:true})`) via `tryAsync`, accumulates `text` (ignores
  tool/thinking), `parseTitleGenerationResponse` → Result<string>; error chunk / null
  parse → err, NEVER `showError` (EC-TS-11). Compact delegates to the existing
  `RunChatTurnUseCase.run` so a `context_compacted` chunk routes through the existing
  `onContextCompacted` sink leg + the P2 `ContextCompactedBlock` (no new machinery).
  Result-returning; preserves the error-as-chunk → Result boundary (ADR-CC-001 §2); no
  provider branch. TEST-TS-018/020 (U leg) green (6).
- **Deviation:** GenerateTitle frames the side-query as
  `${SYSTEM_PROMPT}\n\n${buildTitleGenerationPrompt(msg)}` in the turn `text` because
  P3's `ChatTurnRequest` carries only `text` (no invented domain field). Compact uses a
  `/compact` command text that the runtime maps to an `{isCompact:true}` prepared turn;
  the real CLI runtime detects it (coverage-excluded → TEST-TS-M2), the Mock scripts the
  `context_compacted` chunk directly.

---

## Batch state (application)

- **Completed:** T-TS-014 .. T-TS-025 (12 tasks; one Conventional commit per RED + per impl).
- **Typecheck:** `npx vue-tsc --noEmit -p tsconfig.lint.json` → **0 errors**.
- **Lint:** `npx eslint .` → **0 errors** (same 3 pre-existing P0 warnings as the prior
  batch — eslint.config.js max-lines, ErrorBoundary.test.ts one-component-per-file ×2;
  none introduced here). Application-layer `complexity ≤10` + no-raw-try/catch (tryAsync)
  rules hold — GenerateTitle drains via `tryAsync`.
- **Unit tests:** `npx vitest run` → **113 files, 830 passed** (was 779 after the
  infra batch; +51 new application/composable tests; P0/P1/P2/domain/infra GREEN — no
  regression).
- **Manual legs (not self-claimed):** TEST-TS-M1/M2 unchanged — for the single final
  epic-review human gate.
- **Not run (orchestrator gate):** full `npm run verify` / `npm run build` / `build:web` /
  `test:storybook`. Manifest untouched. No push.

## Next batch — UI (T-TS-026 .. T-TS-035)

First ready task: **T-TS-026 (qa RED)** — `tabsStore` (SPEC-TS-019): N `TabState` DTOs +
`activeTabId` + per-`TabId` runner WeakMap + per-tab streaming isolation + min-1/clamp
(EC-TS-1/2/3/13), DTO-only boundary (no reactive use-case instance, TEST-TS-022/023).
Then T-TS-027..035 grow `TabBar` + `ResumeSessionDropdown` + the gated fork/rewind hover
affordances + the rewind menu + per-tab `ChatSurface` + compact + the two Obsidian
`Modal` subclasses (`ForkTargetModal`, `DeleteConfirmModal`), each with a `data-testid`
PageObject (ADR-009). Note: the application files landed under `src/application/threads/`
(spec/tasks canonical path), not `src/application/chat/`.

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

---

## UI + wire-in batch (T-TS-026 .. T-TS-038) — `(dev, implement — ui batch)` 2026-05-25

STRICT TDD, one Conventional commit per task (RED → impl). Executed on
`feature/threads-sessions`.

| Task | SHA | Summary |
|---|---|---|
| T-TS-026 (qa RED) | `0a88dd5` | `tabsStore` test (N tabs, isolation, runner map, min1/clamp) |
| T-TS-027 (dev) | `25eb431` | `tabsStore` — N `TabState` DTOs + per-tab runner Map + isolation + persist/title ladder |
| T-TS-028 (qa RED) | `cefd665` | `TabBar.vue` + badge PageObject |
| T-TS-029 (dev) | `404385f` | `TabBar.vue` (state machine, roving tabindex) + P3 i18n keys en+de |
| T-TS-030 (qa RED) | `ae40ef3` | `ResumeSessionDropdown.vue` PageObject + the `modalSeam` (CONFIRM_DELETE / CHOOSE_FORK_TARGET) |
| T-TS-031 (dev) | `18dd8e2` | `ResumeSessionDropdown.vue` (list/resume/rename/delete-via-seam/spin/keyboard) |
| T-TS-032 (qa RED) | `4985d5c` | gated fork/rewind affordances + rewind menu PageObject (`MessageTurn.ts.test.ts`) |
| T-TS-033 (dev) | `c7d788f` | gated fork/rewind affordances + in-surface two-mode rewind menu (`MessageTurn.vue`) |
| T-TS-034 (qa RED) | `2cad464` | `ChatSurface` per-tab + compact PageObject + the `CHAT_RUNTIME_FACTORY` seam |
| T-TS-035 (dev) | `ab68966` | `ChatSurface` per-tab binding + compact + `ForkTargetModal`/`DeleteConfirmModal` (Obsidian `Modal`) |
| T-TS-037 (qa) | `465065b` | mount-wiring test (PROVIDER_HISTORY_PORT + per-tab factory) |
| T-TS-038 (dev) | `b514b9c` | provide PROVIDER_HISTORY_PORT + per-tab runtime factory + modal seams in both entry points |

**tabsStore ↔ chatStore model (ADR-TS-002 §1, Option A):** the `tabsStore` **OWNS** the per-tab
chat state. Each `TabState` is a plain DTO (`messages`/`usage`/`status`/`title`/… — DTO-only,
ADR-003/NFR-TS-003); the per-`TabId` `TabDeps` (its own `ChatRuntimePort` instance + bound
`RunChatTurnUseCase` runner) live in a `Map<TabId, TabDeps>` OUTSIDE reactive state, keyed by the
store instance via a `WeakMap` (the P1 `chatStore` pattern generalised). One runtime per tab →
per-tab streaming isolation by construction (the sink legs resolve the live message through the
**owning** tab's `TabState`, scoped by the runner's closed-over `TabId`). The P1 `chatStore` is
**untouched** and stays green as its own single-thread unit; `ChatSurface` rebinds to
`tabsStore.activeTab`. `MessageList`/`UsageInfo` gained **optional** props (driven by the active
tab) with a `chatStore` fallback so their P1 unit tests stay green with zero assertion changes —
the lowest-churn path that keeps P2 block rendering working on the active tab.

**Obsidian modals without Vue importing `obsidian` (NFR-TS-007):** a plugin-owned modal-launch
seam (`src/ui/chat/modalSeam.ts`) declares three UI InjectionKeys — `CONFIRM_DELETE`
(`(msg) => Promise<boolean>`), `CHOOSE_FORK_TARGET` (`() => Promise<ForkTarget|null>`), and
`CHAT_RUNTIME_FACTORY` (`() => ChatRuntimePort`, one runtime per tab). The Vue components inject
and call these handles; they never import `obsidian`. `AgentSidebarView` provides them by
constructing the real Obsidian `Modal` subclasses (`ForkTargetModal`/`DeleteConfirmModal` in
`src/plugin/modals/`, DOM via `createEl`/`setText`, no `innerHTML`, resolving a `Promise`); the
standalone demo (`src/ui/main.ts`) provides browser-safe stand-ins (no `window.*`).

**Verification (this batch):** `npx vue-tsc -p tsconfig.lint.json --noEmit` → **0 errors**;
`npx eslint .` → **0 errors** (4 warnings: 2 pre-existing P0 `ErrorBoundary` one-component-per-file,
1 `chatStore` + 1 `tabsStore` `max-lines` — both stores warn-tier `src/ui/**`, non-failing, same as
the P1 `chatStore` precedent); `npx vitest run` → **119 files, 882 passed** (was 830 after the
application batch; +52 new UI/store/wire tests; P0/P1/P2 + domain/infra/application GREEN — no
regression). Provider-addressed grep gate clean (zero `provider === 'claude'` in `src/ui` /
`src/application`). Manifest untouched. No push. NOT run (orchestrator gate): full `npm run verify`
/ `build` / `build:web` / `test:storybook`.

**Deviations (load-bearing):**
1. **`tabsStore` `max-lines` warning (596 lines, budget 350).** The store carries the full per-tab
   P1+P2 sink-leg set (scoped by `TabId`) plus the fork/rewind/compact/title-ladder/persist actions.
   `max-lines` is a `warn` (not `error`) for `src/ui/**` and `npm run lint` (`eslint .`) does not
   fail on warnings — consistent with the P1 `chatStore` (a store of the same role). A follow-up
   refactor could extract the sink builder into a `tabSink.ts` module; deferred to avoid churn risk
   on the isolation-tested legs.
2. **`ChatSurface` rewire required a P1 harness update (NOT an assertion change).** The surface now
   builds runtimes via the `CHAT_RUNTIME_FACTORY` seam and needs `PROVIDER_HISTORY_PORT` +
   `ICON_PORT`, so the P1 `ChatSurface.test.ts` mount harness (`mountSurface`) was updated to provide
   them (the factory returns the one controllable runtime the test drives). All P1 assertions
   (welcome→list→busy→accumulate→done→cancel→error→usage) are unchanged. The P1/P2 `mount.test.ts` /
   `mount.rr.test.ts` were restored to green by the T-TS-038 wire-in (the entry points now provide
   the new ports), so the cross-batch tree never ships red.
3. **`useChatRuntimePort` / `CHAT_RUNTIME_PORT` are no longer consumed by a component** (the surface
   uses the per-tab factory) but are kept provided in both entry points + the composable retained —
   harmless, part of the P1 public contract; the per-tab factory is the SPEC-TS-027 contract.

**Remaining in the UI/wire-in arc (next):** **T-TS-036** (styles — the `§4.10 --sp-*` token block:
`--sp-tab-*`, `--sp-history-*`, `--sp-fork-modal-max-inline`, the reduced-motion guard zeroing
`--sp-history-spin-duration`; the components already reference these tokens with graceful fallbacks).
Then **T-TS-039** (qa `npm run dev` multi-tab smoke), and the **GATE** (T-TS-040/041 human-owned
manual legs TEST-TS-M1/M2; T-TS-042 full verify + draft PR into `next`). Manual legs unchanged, for
the single final epic-review human gate.

---

## Styles + smoke batch — T-TS-036 + T-TS-039 (2026-05-25, dev — implement)

T-TS-036 (styles) + T-TS-039 (standalone dev-leg smoke) EXECUTED on
`feature/threads-sessions` (one Conventional commit per task).

**Completed + SHAs:**

| Task | SHA | What |
|---|---|---|
| T-TS-036 🔨 | `6485a17` | §4.10 `--sp-*` token block in `tokens.css` + tokens contract test |
| T-TS-039 🧪 | `519a2cc` | standalone multi-tab dev-leg smoke `tests/ui/main.ts.test.ts` |

### T-TS-036 — §4.10 tokens (SPEC-TS-028)

Added the `§4.10 — Threads & sessions (P3)` block to `src/ui/styles/tokens.css`
(after the P2 `§4.9`), per SPEC-TS-028. Tokens declared:

- **Tab badges (REQ-TS-006/007):** `--sp-tab-size: 28px`, `--sp-tab-border-idle:
  var(--sp-border)`, `--sp-tab-border-active: var(--sp-accent)`,
  `--sp-tab-border-streaming: var(--sp-accent)`, `--sp-tab-border-attention:
  var(--sp-error)` — the active/attention/idle borders derive from existing
  `--sp-*` tokens (no new colour literal).
- **History rows:** `--sp-history-row-h: 44px`, `--sp-history-delete:
  var(--sp-error)`.
- **Drop-UP blurred menu:** `--sp-history-blur: 8px`.
- **Fork-target modal:** `--sp-fork-modal-max-inline: 340px`.
- **Streaming-border brand override:** `.specorator-root[data-provider='claude']`
  redeclares `--sp-tab-border-streaming: var(--sp-accent)` so the active
  provider's accent drives the streaming badge (inherits the P1 brand seam).
- **Reduced-motion guard:** a `@media (prefers-reduced-motion: reduce)` block
  zeroes `--sp-history-spin-duration: 0s`. The history/title **spin reuses the
  existing P2 `spin` keyframe** (`animations.css`) — **no new keyframe added**.
  In normal motion the components supply their own `var(--…, 0.8s)` /
  `var(--…, 0.15s)` fallback (the token is declared only inside the guard, per
  the spec §4.10 listing).

Every `--sp-*` token the P3 components reference now exists: `TabBar.vue`
(`--sp-tab-size`, `--sp-tab-border-idle/active/streaming/attention`,
`--sp-history-spin-duration` for the transition), `ResumeSessionDropdown.vue`
(`--sp-history-blur`, `--sp-history-row-h`, `--sp-history-delete`,
`--sp-history-spin-duration` for the spinner), `MessageTurn.vue`
(`--sp-history-spin-duration`), and the `--sp-fork-modal-max-inline` width for the
`ForkTargetModal` surface. Colour literals stay confined to the token layer
(NFR-TS-012) — no P3 component carries a hex / raw Obsidian var.

Extended `tests/ui/styles/tokens.test.ts` (the existing token-presence contract):
a `THREADS_SESSIONS_TOKENS` list asserting the nine §4.10 declarations, a
quote-agnostic assertion that the `[data-provider='claude']` block redeclares
`--sp-tab-border-streaming`, and a reduced-motion assertion that
`--sp-history-spin-duration: 0s` is declared.

### T-TS-039 — standalone multi-tab smoke (dev leg)

Added `tests/ui/main.ts.test.ts` — the deterministic leg of TEST-TS-026. It
imports `@/ui/main` (the `npm run dev` / `build:web` entry, which mounts the P3
multi-tab `ChatSurface` against `MockBridge` with one scripted runtime per tab via
the injected `CHAT_RUNTIME_FACTORY`, the `PROVIDER_HISTORY_PORT` seam, and the
browser-safe modal stand-ins) and asserts, by `data-testid` only:

1. the multi-tab surface mounts — `chat-surface`, `tab-bar` with one
   `tab-badge`, the P1/P2 `chat-welcome` + `history-open` affordances, no
   `message-list` yet;
2. sending a message in tab 1 swaps the active tab to the P1/P2 chat surface
   (`message-list` present, `chat-welcome` gone);
3. opening a second tab works (`tab-new` → two `tab-badge`s; the new empty active
   tab shows `chat-welcome`, no `message-list`);
4. switching back to tab 1 swaps the active conversation back (`message-list`
   returns, `chat-welcome` gone) — per-tab isolation without cross-write (EC-TS-3).

Microtask + reactive flushing via `flushPromises` + `nextTick`. This is the
deterministic automated leg the T-TS-039 DoD names (`tests/ui/main.ts.test.ts`);
the **live-browser feel** and the **real-CLI resume/rewind** pair with the
human's final review (T-TS-040/041). `test-plan.md` is a pending qa-stage
artifact — the TEST-TS-026 dev-leg pass/fail + date recording rides qa authoring
`test-plan.md`; this entry records the deterministic leg's green state.

### Verification (this batch)

- `npx vue-tsc -p tsconfig.lint.json --noEmit` → **0 errors**.
- `npx eslint tests/ui/main.ts.test.ts` + `tests/ui/styles/tokens.test.ts` → **0 errors**.
- `npx prettier --check` on `tokens.css` + both test files → clean.
- `npm run lint:style-tokens` → **clean (0 violations across guarded paths)**.
- `npx vitest run` → **120 files / 885 passed** (was 119 / 882 after the UI/wire-in
  batch; +3 from the 2 new §4.10 token assertions + the 1 new standalone smoke;
  P0/P1/P2/P3 + domain/infra/application GREEN — no regression). `tests/ui` subset
  (chat + stores + styles + main) = 40 files / 246 green.
- Manifest untouched. No push. NOT run (orchestrator gate T-TS-042): full
  `npm run verify` / `build` / `build:web` / `docs:api` / `test:storybook`.

### Deviations (load-bearing)

1. **`--sp-history-spin-duration` is declared only inside the reduced-motion
   guard**, matching the spec §4.10 listing exactly. The normal-motion value comes
   from each consumer's own `var(--sp-history-spin-duration, 0.8s|0.15s)` fallback
   (already in `TabBar.vue` / `ResumeSessionDropdown.vue` / `MessageTurn.vue`).
   The tokens contract test asserts the reduced-motion `0s` declaration
   separately rather than via the shared presence list, to avoid demanding a
   normal-mode declaration the spec does not mandate.
2. **`--sp-fork-modal-max-inline` is declared but not yet consumed by a CSS rule.**
   The `ForkTargetModal` (`src/plugin/modals/ForkTargetModal.ts`) builds DOM via
   `createEl`/`setText` and its visual styling (the `.sp-fork-target-modal` rules
   that would read this token) is not yet wired into `styles.css`. T-TS-036 is the
   token-layer-only task per its DoD; declaring the token satisfies SPEC-TS-028 and
   keeps the colour/measure literal confined to the token layer for the eventual
   modal-styles wiring + the manual leg TEST-TS-M2.

### Hand-off

**Remaining:**

- **T-TS-040 / T-TS-041 — human-owned manual legs** (TEST-TS-M1 Obsidian
  vault-file store round-trip + reload; TEST-TS-M2 Obsidian `Modal` flows +
  real-CLI resume/rewind). Never agent-self-claimed; they ride the single final
  epic-review human gate.
- **T-TS-042 — orchestrator gate:** full `npm run verify` + parity self-review
  (seven sub-surfaces, charter §5) + draft PR into `next`.
- **qa:** author `test-plan.md` and record the TEST-TS-026 dev-leg pass + date
  (the deterministic leg is green; the recording is a qa-stage artifact).

NEXT AGENT: human (T-TS-040/041 manual legs) ∥ orchestrator (T-TS-042 verify gate).
