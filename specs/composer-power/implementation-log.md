---
id: IMPL-LOG-CP-001
title: Composer Power (P4) — Implementation Log
stage: implementation
feature: composer-power
area: CP
epic: claudian-reboot
phase: P4
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-25
updated: 2026-05-25
---

# Implementation Log — Composer Power (P4)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-CP-001 — Baseline-capture + guard verification (📐, doc-only)

- **Spec/req:** NFR-CP-011 (baseline leg), NFR-CP-002 (guard verification).
- **Files:** `specs/composer-power/parity-screenshots.md` (new — baseline
  skeleton, per-sub-surface × 320/520/720 × light/dark), `specs/composer-power/
  test-plan.md` (new — guard-verification note + the M1/M2 manual legs +
  TEST-CP status), `specs/composer-power/implementation-log.md` (this file).
- **Outcome:** done.
- **Guard verification:** the three new keys (`MENTION_DATA_PROVIDER_PORT` /
  `PROVIDER_COMMAND_CATALOG_PORT` / `SHELL_EXEC_PORT`) and the new domain/app/ui
  paths (incl. `@/infrastructure/obsidian/ObsidianShellExec`) match **no**
  `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS` glob — no relaxation task
  needed (recorded in `test-plan.md`).
- **Verify:** baseline `npx vue-tsc --noEmit -p tsconfig.lint.json` = 0 errors.
  No file under `src/` changed.
- **Commit:** `cfb5ee2`.
- **Deviation:** none.

## DOMAIN batch (T-CP-002..007)

### T-CP-002 — RED inline DTOs + StreamChunk request members + ComposerMode (🧪 qa)

- **Spec/test:** TEST-CP-001/004/006; SPEC-CP-001/004/006/034.
- **Files:** `tests/domain/chat/inline/inlineBlockDtos.test.ts`,
  `tests/domain/chat/StreamChunk.ts.test.ts`,
  `tests/domain/chat/composer/ComposerMode.test.ts` (new).
- **Outcome:** done — RED confirmed (typecheck failed on the missing modules).
- **Commit:** `665c746`.

### T-CP-003 — inline-block DTOs (🔨 dev)

- **Spec/req:** SPEC-CP-004; REQ-CP-022/024/026.
- **Files:** `src/domain/chat/inline/{AskUserQuestion,ExitPlanMode,Approval,index}.ts` (new).
- **Outcome:** done — TEST-CP-004 passes; typecheck + lint green; no obsidian/node:*/Vue/class.
- **Commit:** `a2d63d0`.
- **Deviation:** none. `allow-always` carries no persistence field (NG3).

### T-CP-004 — StreamChunk request members + ComposerMode value types (🔨 dev)

- **Spec/req:** SPEC-CP-001/006/034; REQ-CP-022/024/026/034.
- **Files:** `src/domain/chat/StreamChunk.ts` (appended 3 request members),
  `src/domain/chat/composer/ComposerMode.ts` (new).
- **Outcome:** done — TEST-CP-001 + TEST-CP-006 pass; full typecheck green (P1/P2/P3
  consumers unbroken); P1/P2/P3 union byte-identical.
- **Commit:** `b9f1382`.
- **Deviation:** none.

### T-CP-005 — RED ChatRuntimePort growth + 3 ports + appendInstruction (🧪 qa)

- **Spec/test:** TEST-CP-002/003/005; SPEC-CP-002/003/005/034.
- **Files:** `tests/domain/ports/ChatRuntimePort.ts.test.ts` (extended to 15 members
  + 5 caps), `tests/domain/ports/{MentionDataProviderPort,ProviderCommandCatalogPort,
  ShellExecPort}.test.ts`, `tests/domain/settings/appendInstruction.test.ts` (new).
- **Outcome:** done — RED confirmed.
- **Commit:** `f5f723d`.

### T-CP-006 — ChatRuntimePort additive callback-setters + 2 caps flags (🔨 dev)

- **Spec/req:** SPEC-CP-002/034; REQ-CP-020/023/025/026/028.
- **Files:** `src/domain/ports/ChatRuntimePort.ts` (3 setters + 2 caps, additive),
  `src/infrastructure/mock/MockChatRuntime.ts` (scriptable capture + flags + emit
  drivers), `src/infrastructure/localstorage/FixtureChatRuntime.ts` (false/false
  caps + no-op setters), `src/ui/stores/tabsStore.ts` (fallback caps),
  `tests/domain/ports/ChatRuntimePort.test.ts` (P1 sentinel stale-assertion fix),
  `tests/infrastructure/mock/MockChatRuntime.ts.test.ts` (caps + callback-capture
  tests), `tests/application/chat/RunChatTurnUseCase{,.rr}.test.ts` (ScriptedRuntime
  stubs), `tests/ui/stores/tabsStore.test.ts` (NoRewindRuntime caps).
- **Outcome:** done — TEST-CP-002 passes; 12 P3 members + 3 caps byte-identical;
  every P1/P2/P3 runtime + test green.
- **Commit:** `13dfc2c`.
- **Deviation:** the additive growth required mechanical updates to the tabsStore
  fallback caps + the test runtime stubs (authorised: "keep every P1/P2/P3 runtime
  + test green; update fake-ports + test runtime stubs"). No assertion intent changed.

### T-CP-007 — Mention/Catalog/ShellExec ports + keys + barrel + appendInstruction (🔨 dev)

- **Spec/req:** SPEC-CP-003/005; REQ-CP-004/009/012/018/030/031; NFR-CP-002/010.
- **Files:** `src/domain/ports/{MentionDataProviderPort,ProviderCommandCatalogPort,
  ShellExecPort}.ts` + `index.ts` (barrel) (new/edited), `src/infrastructure/bridge/
  ports.ts` (3 InjectionKeys), `src/domain/settings/PluginSettings.ts`
  (customSystemPrompt + appendInstruction), `src/core/core-settings.ts` +
  `src/infrastructure/obsidian/ObsidianBridge.ts` (load-or-default the new field),
  `tests/domain/ports/*.test.ts`, `tests/domain/settings/appendInstruction.test.ts`,
  `tests/core/core-settings.test.ts` (key-set sentinel), `tests/infrastructure/
  obsidian/ObsidianBridge.settings.test.ts` (literal).
- **Outcome:** done — TEST-CP-003 + TEST-CP-005 pass; deleted-symbol guard green; no
  obsidian/node:* in domain.
- **Commit:** `c077eaa`.
- **Deviation:** `customSystemPrompt` is written by instruction mode (SPEC-CP-027),
  not a settings-tab field (settings UX is P10); added to `validateSettings`
  load-or-default coercion only — no settings-schema UI field. The core-settings
  key-set sentinel was updated for the additive field (NFR-CP-009).

## INFRA batch (T-CP-008..014)

### T-CP-008 — RED Mock fixtures + scripted ShellExec + scriptable callbacks (🧪 qa)

- **Spec/test:** TEST-CP-003/012/028 Mock legs + TEST-CP-020/024 backing; SPEC-CP-009.
- **Files:** `tests/infrastructure/mock/{MockMentionCatalog,MockShellExec}.test.ts`
  (new), `tests/infrastructure/mock/MockChatRuntime.ts.test.ts` (callback-capture +
  scriptable-caps block), `tests/__fakes__/fake-ports.test.ts` (composer ports).
- **Outcome:** done — RED confirmed (MockBridge factories/shellExec + fake-ports
  members missing).
- **Commit:** `1d69980`.

### T-CP-009 — MockBridge fixtures + scripted ShellExec + fake-ports members (🔨 dev)

- **Spec/req:** SPEC-CP-009; REQ-CP-004/012/030/032; NFR-CP-006.
- **Files:** `src/infrastructure/mock/MockComposerPorts.ts` (new),
  `src/infrastructure/mock/MockBridge.ts` (factories + shellExec getter +
  seedShellExec), `tests/__fakes__/fake-ports.ts` (mentionData/commandCatalog/
  shellExec + scriptable mockRuntime).
- **Outcome:** done — TEST-CP-003/012/028 Mock legs + the capable/non-capable
  backing pass; no child_process/node:* in the Mock (S1 source-guarded).
- **Commit:** `1e7a548`.
- **Deviation:** none.

### T-CP-010 — RED LocalStorage fixtures + err-not-available ShellExec (🧪 qa)

- **Spec/test:** TEST-CP-016; SPEC-CP-010; REQ-CP-012; NFR-CP-007.
- **Files:** `tests/infrastructure/localstorage/LocalStorageComposerPorts.test.ts` (new).
- **Outcome:** done — RED confirmed.
- **Commit:** `25f3170`.

### T-CP-011 — LocalStorage fixtures + err-not-available ShellExec (🔨 dev)

- **Spec/req:** SPEC-CP-010; REQ-CP-012; NFR-CP-007.
- **Files:** `src/infrastructure/localstorage/LocalStorageComposerPorts.ts` (new),
  `src/infrastructure/localstorage/LocalStorageBridge.ts` (factories + shellExec getter).
- **Outcome:** done — TEST-CP-016 passes; `run -> err('shell execution is not
  available in the browser demo')`; no node:*/subprocess.
- **Commit:** `9e83504`.
- **Deviation:** none.

### T-CP-012 — ObsidianBridge mention + catalog providers (🔨 dev, coverage-excluded)

- **Spec/req:** SPEC-CP-007; REQ-CP-004/009/010/012; NFR-CP-002 (manual leg M1).
- **Files:** `src/infrastructure/obsidian/{ObsidianMentionDataProvider,
  ObsidianProviderCommandCatalog}.ts` (new), `src/infrastructure/obsidian/
  ObsidianBridge.ts` (factories).
- **Outcome:** done — typecheck + lint green; all I/O via VaultPort; absent .claude
  -> []; empty non-vault source does not error. Coverage-excluded; manual leg
  TEST-CP-M1 scheduled in test-plan.md; the Mock fixtures (T-CP-009) carry CI proof.
- **Commit:** `489af67`.
- **Deviation:** subagents read `.claude/agents/**/*.md` (Claude-only, NG5); MCP +
  external-dir no-op [] (P8/NG4) — consistent with SPEC-CP-007.

### T-CP-013 — ObsidianShellExec real child_process.exec, S1-S5 (🔨 dev, coverage-excluded)

- **Spec/req:** SPEC-CP-008/033; REQ-CP-030/031/032; NFR-CP-006 (manual leg M2).
- **Files:** `src/infrastructure/obsidian/ObsidianShellExec.ts` (new),
  `src/infrastructure/obsidian/ObsidianBridge.ts` (stateless shellExec getter).
- **Outcome:** done — typecheck + lint green. S1: node:child_process imported only
  here + ClaudeCliChatRuntime (grep-confirmed); S2 verbatim; S3 no secret in env, log
  only command+exitCode; S4 30s/1MB -> exitCode 124 + truncated; S5 render-only.
  Non-FS adapter -> err; non-zero exit -> ok. Coverage-excluded; manual leg M2.
- **Commit:** `0cb9123`.
- **Deviation:** none.

### T-CP-014 — Grown ClaudeCliChatRuntime + reducer emits 3 request chunks (🔨 dev, coverage-excluded)

- **Spec/req:** SPEC-CP-011/034; REQ-CP-020/023/025/026/028; NFR-CP-002/007 (manual leg M2).
- **Files:** `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (3 setters store
  callbacks + getCapabilities supportsInlineResponse:false/supportsPlanMode:false +
  _routeInlineRequest), `src/infrastructure/obsidian/reduceClaudeStream.ts` (top-level
  ExitPlanMode/AskUserQuestion tool_use -> the matching StreamChunk request member).
- **Outcome:** done — CLI honesty (ADR-CP-004 §3); reducer emits the 3 request
  chunks (tool_use id -> requestId); the 12 P3 members + 3 caps + StreamChunk union
  byte-identical. Coverage-excluded; the Mock/Fixture capable/non-capable backing
  carries CI proof; manual leg M2.
- **Commit:** `ea3a9ad`.
- **Deviation:** the CLI gates supportsPlanMode:false too (not just
  supportsInlineResponse) — both depend on the interactive round-trip the one-shot
  `claude --print` cannot honour; consistent with the SPEC-CP-011 CLI-honesty
  rationale ("no UI change when a capable transport ships").

## STYLES (T-CP-047)

### T-CP-047 — §4.11 composer-power --sp-* tokens + tokens contract (🔨 dev)

- **Spec/req:** SPEC-CP-029; NFR-CP-011/008.
- **Files:** `src/ui/styles/tokens.css` (§4.11 block + reduced-motion
  --sp-dropdown-anim-duration:0s), `tests/ui/styles/tokens.test.ts` (16-token
  §4.11 contract + reduced-motion assertion).
- **Outcome:** done — tokens.test + lint-style-tokens.test green;
  `npm run lint:style-tokens` clean (0 violations). All values resolve from
  Obsidian theme vars (no hex/raw var at the component layer).
- **Commit:** `cffce38`.
- **Deviation:** `--sp-dropdown-shadow` resolves from the existing
  `--sp-shadow-dropup` token (rather than the spec's `var(--shadow-s)`) to keep the
  colour/shadow literal confined to the established Specorator token layer
  (NFR-CP-011 — no raw Obsidian var at the §4.11 layer).

## Batch verification (DOMAIN + INFRA)

- `npx vue-tsc --noEmit -p tsconfig.lint.json` — **0 errors**.
- `npx eslint` over all 27 changed `src` files — **0 errors** (1 pre-existing
  `tabsStore.ts` max-lines warning, predates this batch at 803 lines).
- `npx vitest run tests/{domain,application/chat,infrastructure,__fakes__,ui/stores,
  ui/styles,core}` — **619 passed / 68 files**. Full suite (background): **818
  passed / 118 files** (10 worker-pool startup-timeout flakes, exit 0, no assertion
  failures — unrelated infra).
- P1/P2/P3 runtimes + tests green under the additive growth (NFR-CP-009).
- **Not run** (orchestrator gate): full `npm run verify` / `build` / `build:web`.
- **Next batch:** APPLICATION T-CP-015..026 (first ready task: T-CP-015 qa RED —
  pure trigger-parse `detectTrigger`/`shouldEnterInstruction`/`shouldEnterBangBash`/
  `replaceTriggerToken`, greened by T-CP-016).

## APPLICATION (T-CP-015..026) — 2026-05-25 (dev, implement — application batch)

Strict TDD, one Conventional commit per task (RED `test(cp):` then `feat(cp):`).
All pure transforms total/never-throw; all use cases return `Result<T,E>`; no
`obsidian`/`node:*`/Vue import under `src/application/**`; complexity ≤10 and the
try/catch ban honoured (`tryAsync` reused). Application imports domain only.

### T-CP-015/016 — pure trigger-parse (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-012; REQ-CP-001/002/007/008/015/029/036; TEST-CP-007.
- **Files:** `tests/application/chat/composer/triggerParse.test.ts` (15 cases),
  `src/application/chat/composer/triggerParse.ts` (1-94).
- **Outcome:** done. `detectTrigger` (slash/skills start-of-token scan +
  whitespace-closes ported from claudian `SlashCommandDropdown.handleInputChange`;
  the `@`-token `lastIndexOf` scan from `MentionDropdownController`),
  `shouldEnterInstruction`/`shouldEnterBangBash` (whole-value empty/whitespace),
  `replaceTriggerToken` (rewrite only `[tokenStart, caret]`, text outside intact —
  EC-CP-4). Covers EC-CP-1/2/10. Pure/total.
- **Commits:** `6b9eddd` (RED), `e3cb4e3` (impl).
- **Deviation:** mention does NOT close on whitespace (SPEC-CP-012 A.1) — this
  diverges from claudian's `MentionDropdownController` (which hides on whitespace);
  the spec is authoritative. No other deviation.

### T-CP-017/018 — builtInCommands + RunCommandUseCase (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-013; REQ-CP-003/005/006; TEST-CP-008 (EC-CP-8/11).
- **Files:** `tests/application/chat/composer/builtInCommands.test.ts`,
  `tests/application/chat/composer/RunCommandUseCase.test.ts`,
  `src/application/chat/composer/builtInCommands.ts` (1-72),
  `src/application/chat/composer/RunCommandUseCase.ts` (1-35).
- **Outcome:** done. `BUILT_IN_COMMANDS`/`HIDDEN_COMMANDS`/`listBuiltInCommands()`
  (the six reboot built-ins `/clear /new /add-dir /resume /fork /compact`,
  `builtIn:true` `prefix:'/'`, listed independent of any catalog load);
  `RunCommandUseCase.execute` → `{kind:'action'}` for an action built-in /
  `{kind:'insert'; text: prefix+name+' '}` for a provider/non-action entry.
- **Commits:** `da2b4fa` (RED), `9d9a114` (impl).
- **Deviation:** `HIDDEN_COMMANDS` ships as an empty `Set` (the reboot surface is
  exactly the six listable built-ins) — kept as the filter seam per SPEC-CP-013 so
  a later phase hides a command without changing `listBuiltInCommands`.

### T-CP-019/020 — ResolveMentionUseCase (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-014; REQ-CP-009/010/012/013; TEST-CP-009 (EC-CP-3b).
- **Files:** `tests/application/chat/composer/ResolveMentionUseCase.test.ts`,
  `src/application/chat/composer/ResolveMentionUseCase.ts` (1-21).
- **Outcome:** done. `query(filter, signal?)` delegates to
  `MentionDataProviderPort.query` wrapped in a `Result` via `tryAsync`
  (load-or-default `ok([])`; `err` only on an irrecoverable read fault). Debounce +
  request-guard left to the consumer (SPEC-CP-018).
- **Commits:** `47676c0` (RED), `932031f` (impl).
- **Deviation:** none.

### T-CP-021/022 — instructionRefine + RefineInstructionUseCase (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-015; REQ-CP-016; TEST-CP-010/011 (EC-CP-9).
- **Files:** `tests/application/chat/composer/instructionRefine.test.ts`,
  `tests/application/chat/composer/RefineInstructionUseCase.test.ts`,
  `src/application/chat/composer/instructionRefine.ts` (1-90),
  `src/application/chat/composer/RefineInstructionUseCase.ts` (1-83).
- **Outcome:** done. `buildRefineSystemPrompt` + `parseRefineResponse` ported
  verbatim from claudian `core/prompt/instructionRefine.ts` (mapped to the
  `RefineOutcome` union, pure/total); `RefineInstructionUseCase.execute` is the
  SPEC-TS-016-shaped cold-start side-query (`query(turn, [], {forceColdStart:true})`,
  accumulate `text`, `parseRefineResponse` → `Result`; empty/parse-fail/error-chunk
  → `err`; best-effort, never `showError`, never throws). Reuses `query` — no
  refine-specific runtime member (NFR-CP-009).
- **Commits:** `4031cac` (RED), `ae10816` (impl).
- **Deviation:** none.

### T-CP-023/024 — SubmitBangBashUseCase (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-016/033; REQ-CP-030/031/032; TEST-CP-013/028 (EC-CP-5).
- **Files:** `tests/application/chat/composer/SubmitBangBashUseCase.test.ts`,
  `src/application/chat/composer/SubmitBangBashUseCase.ts` (1-64).
- **Outcome:** done. `execute(command)` → `shell.run({command})` verbatim (S2) →
  `Result<BangBashOutput>` (non-zero exit → `ok` with the code; spawn-failure /
  unavailable → `err`). Logs only `command` + `exitCode`, NEVER `stdout`/`stderr`
  content (S3 — test asserts the LoggerPort never sees output). The use case is
  UI-invoked only (explicit Enter, S1) — it is NOT reachable by the model and is
  never a `ChatRuntimePort` member.
- **Commits:** `858bd71` (RED), `a99c0c7` (impl).
- **Deviation:** none.

### T-CP-025/026 — RespondToInlineBlockUseCase (🧪 qa RED → 🔨 dev)

- **Spec/req:** SPEC-CP-017/032; REQ-CP-023/025/026/028; TEST-CP-020/021/024/027
  (EC-CP-6 / NG3).
- **Files:** `tests/application/chat/composer/RespondToInlineBlockUseCase.test.ts`,
  `src/application/chat/composer/RespondToInlineBlockUseCase.ts` (1-119).
- **Outcome:** done. The capability-gate boundary: the constructor registers the
  runtime's three callbacks (ADR-CP-004 §1) and captures each pending request's
  `resolve`; `respondAskUserQuestion`/`respondExitPlanMode`/`respondApproval` read
  `getCapabilities().supportsInlineResponse` FIRST — `false` →
  `Result.err(InlineResponseUnavailableError)` without reaching the callback (no
  lost response, EC-CP-6); `true` → resolve the awaiting callback with the decision
  (`null` → cancel). `'allow-always'` routes the decision but persists NO rule (the
  use case has no `SettingsPort`/history dependency — the rule store is P7, NG3).
  Capability-gated via `getCapabilities()`, never a provider-id branch (TEST-CP-027).
- **Commits:** `7804031` (RED), `a506592` (impl).
- **Deviation:** none.

## Batch verification (APPLICATION)

- `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) — **0 errors**.
- `npx eslint src/application/chat/composer/ tests/application/chat/composer/` —
  **0 errors** (the `prefer-regexp-exec` flag on `instructionRefine.ts` was fixed
  in-task by switching `String#match` → `RegExp#exec` on a non-global regex).
- `npx vitest run tests/application/chat/composer/` — **51 passed / 8 files**.
- Full suite `npx vitest run` — **996 passed / 139 files, 0 failed**. P1/P2/P3 +
  the DOMAIN/INFRA P4 batch stay green under the additive application growth
  (NFR-CP-009); no test assertion was modified.
- **Not run** (orchestrator gate): full `npm run verify` / `build` / `build:web`.
- **Next batch:** UI T-CP-027.. (first ready task: T-CP-027 qa RED — the
  `useComposerMode` composable: mode arbiter + depth-counted inline-block queue +
  request-id guard + debounce, greened by T-CP-028; depends on T-CP-016/018/020/
  024/026, all now done).

## UI batch 1 (T-CP-027..034)

### T-CP-027 — RED `useComposerMode` composable (🧪 qa)

- **Spec/test:** TEST-CP-022 + TEST-CP-012 (req-guard U leg) + TEST-CP-015
  (debounce); SPEC-CP-018/031.
- **Files:** `tests/ui/chat/composer/useComposerMode.test.ts` (new).
- **Outcome:** done — RED confirmed (failed to resolve the missing module).
- **Commit:** `fce6bcc`.

### T-CP-028 — `useComposerMode` composable (🔨 dev)

- **Spec/req:** SPEC-CP-018/031; REQ-CP-004/014/027/032/034/035/036; NFR-CP-001/005.
- **Files:** `src/ui/chat/composer/useComposerMode.ts` (1-300, new).
- **Outcome:** done. The mode arbiter over the pure trigger-parse: a
  `ref<ComposerMode>` is the SOLE arbiter of the active surface (REQ-CP-034);
  `handleInput` re-classifies via `detectTrigger`/`shouldEnter*`; `handleKeydown`
  returns `true` when it consumed the event (palette confirm/nav, bang-bash Enter,
  Escape, inline-block) so the P1 send fires only when `kind==='default'` && it
  returned `false` (REQ-CP-035); `Shift+Tab` toggles `planActive` iff
  `getCapabilities().supportsPlanMode` and consumes the event (EC-CP-7,
  capability-gated — never a provider branch). `paletteEntries` = built-ins ++ the
  monotonic-request-id-guarded `getEntries` (stale discarded, EC-CP-3) or the
  debounced `ResolveMentionUseCase.query` with an `AbortSignal` (REQ-CP-014).
  `confirmEntry` dispatches a built-in action or inserts via `replaceTriggerToken`
  (mention `mentionText` verbatim, REQ-CP-013). The depth-counted
  `enqueueInlineBlock`/`resolveInlineBlock` queue restores the composer only when
  the LAST resolves (EC-CP-12); an empty-questions chunk is ignored + `warn`.
  `SubmitBangBashUseCase.execute` runs ONLY on an explicit Enter (S1/REQ-CP-032/
  EC-CP-5). DTO-only reactive state — use-case/runtime/catalog live outside the
  refs (NFR-CP-005); no `obsidian`/`node:*` import.
- **Commit:** `8926ba0`.
- **Deviation:** none. `useComposerMode` takes its collaborators as an options
  object (not `inject`) so the composable unit-tests cleanly; the consumer
  (`ChatComposer`, batch 2) wires the injected ports/use cases. Instruction/
  bang-bash detection uses `value.trimStart().startsWith('#'/'!')` + the pure
  `shouldEnter*` gate on the pre-trigger text (the mode persists as the body is
  typed) — within SPEC-CP-018's "one active mode" contract.

### T-CP-029 — RED port composables (🧪 qa)

- **Spec/test:** TEST-CP-026 (composables U leg); SPEC-CP-026.
- **Files:** `tests/ui/composables/{useMentionDataProviderPort,useProviderCommandCatalogPort,useShellExecPort}.test.ts` (new).
- **Outcome:** done — RED confirmed (the three composables did not resolve).
- **Commit:** `0de7ac8`.

### T-CP-030 — port composables (🔨 dev)

- **Spec/req:** SPEC-CP-026; REQ-CP-004/009/030; NFR-CP-002.
- **Files:** `src/ui/composables/{useMentionDataProviderPort,useProviderCommandCatalogPort,useShellExecPort}.ts` (new).
- **Outcome:** done. Each injects its own key (no aggregate, ADR-008) and throws a
  clear "was not provided" error when absent — parity with `useChatRuntimePort` /
  `useProviderHistoryPort`. No `obsidian` import.
- **Commit:** `6ec9f9f`.
- **Deviation:** none.

### T-CP-031 — RED `ComposerDropdown.vue` + `MentionRow.vue` (🧪 qa)

- **Spec/test:** TEST-CP-014/017; SPEC-CP-020/037.
- **Files:** `tests/ui/chat/composer/{ComposerDropdown.test.ts,ComposerDropdown.po.ts,MentionRow.test.ts,MentionRow.po.ts}` (new).
- **Outcome:** done — RED confirmed (neither component resolved).
- **Commit:** `307b0be`.

### T-CP-032 — `ComposerDropdown.vue` + `MentionRow.vue` (🔨 dev)

- **Spec/req:** SPEC-CP-020/037; REQ-CP-001/002/005/006/007/008/009/011/013;
  NFR-CP-003/008.
- **Files:** `src/ui/chat/composer/ComposerDropdown.vue` (new),
  `src/ui/chat/composer/MentionRow.vue` (new), `src/ui/i18n/locales/en.ts`
  (composer.dropdown.hints + composer.mention.empty), `src/ui/i18n/locales/de.ts`
  (same keys).
- **Outcome:** done. The shared drop-UP palette: `role="listbox"`, rows
  `role="option"` + `aria-selected`; the listbox advertises the highlighted
  option's id via `aria-activedescendant` (the textarea binds it + keeps focus —
  navigation moves the highlight, not DOM focus, SPEC-CP-037). Arrow Up/Down move
  (wrap), Enter or Tab confirm (REQ-CP-005; IME-Enter is not a confirm), Escape
  emits `close` text-unchanged (REQ-CP-008); option `mousedown` confirms without
  stealing textarea focus; built-ins-first slash/skills rows show prefix+name
  (`$` vs `/` distinct, EC-CP-11); mention mode renders `MentionRow`; `@` no match
  → empty-state line, palette open (EC-CP-3b); hints text is an `aria-describedby`
  target. `MentionRow`: file/folder single-line ellipsised path vs subagent/MCP/
  dir two-line name+description with a category-distinct `<SpIcon>` (REQ-CP-011,
  colour via `--sp-mention-*`). Names/descriptions are `{{ }}` text — NO `v-html`
  (NFR-CP-003, EC-CP-13, lint-verified); `<script setup>`; no `obsidian` import; no
  `window.confirm`/`alert`/`prompt`. The exposed `handleKeydown` returns `true`
  when consumed (the composer forwards the textarea keydown).
- **Commit:** `3ef0000`.
- **Deviation:** none. The dropdown owns the highlight internally and exposes
  `handleKeydown` via `defineExpose` (the composer forwards the textarea event) —
  consistent with "focus stays in the textarea" (SPEC-CP-037).

### T-CP-033 — RED `PlanModeIndicator.vue` + plan-mode toggle (🧪 qa)

- **Spec/test:** TEST-CP-018; SPEC-CP-021/032.
- **Files:** `tests/ui/chat/composer/{PlanModeIndicator.test.ts,PlanModeIndicator.po.ts}` (new).
- **Outcome:** done — RED confirmed (component did not resolve).
- **Commit:** `91c20e1`.

### T-CP-034 — `PlanModeIndicator.vue` + plan-mode toggle (🔨 dev)

- **Spec/req:** SPEC-CP-021/032; REQ-CP-020/021; NFR-CP-007/008.
- **Files:** `src/ui/chat/composer/PlanModeIndicator.vue` (new).
- **Outcome:** done. Renders the teal "PLAN" label when `active` — the non-colour
  cue is the label text (NFR-CP-008), colour via the `--sp-plan-*` tokens
  (SPEC-CP-029); renders nothing when not active (honest gating). The `Shift+Tab`
  toggle lives in `useComposerMode.handleKeydown` (T-CP-028), gated on
  `getCapabilities().supportsPlanMode` (SPEC-CP-032 — never a provider branch) and
  consuming the keydown so focus stays in the composer; inert when `false`
  (EC-CP-7). `<script setup>`; label as `{{ }}` text — NO `v-html`; no `obsidian`
  import.
- **Commit:** `bac9446`.
- **Deviation:** the "PLAN" weight uses `--sp-font-weight-semibold` (the token set
  has light/medium/semibold; no `--sp-font-weight-bold` exists) — perceptual
  parity, no token leak (NFR-CP-011).

## Batch verification (UI batch 1)

- `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) — **0 errors**
  (whole project).
- `npx eslint src/ui/chat/composer src/ui/composables/{useMentionDataProviderPort,useProviderCommandCatalogPort,useShellExecPort}.ts`
  — **0 errors** (no `v-html`/`innerHTML`, no `window.confirm`/`alert`/`prompt`, no
  `obsidian` import — NFR-CP-003).
- Targeted `npx vitest run tests/ui/chat/composer tests/ui/composables` plus the
  P1 `ChatComposer.test.ts`/`ChatSurface.test.ts` — **79 passed / 12 files**.
- Full suite `npx vitest run --project unit` — **1048 passed / 145 files, 0
  failed**. P1/P2/P3 + the DOMAIN/INFRA/APPLICATION P4 surface stay green under the
  additive UI growth (NFR-CP-009); no test assertion was modified.
- **Not run** (orchestrator gate): full `npm run verify` / `build` / `build:web`.
  Not pushed. `manifest.json` untouched.
- **Next batch (UI batch 2):** inline blocks + bang-bash output + instruction-
  confirm seam + the `ChatComposer` extension. First ready task: **T-CP-035**
  (qa RED — `InlineAskUserQuestion.vue` render + respond + capability-gated
  read-only when `supportsInlineResponse:false`; depends on T-CP-026/028, both
  done), greened by T-CP-036.

## UI batch 2 (T-CP-035..046)

### T-CP-035 — RED `InlineAskUserQuestion.vue` (🧪 qa)

- **Spec/test:** TEST-CP-019 + TEST-CP-024 (ask-user A leg); SPEC-CP-022/032.
- **Files:** `tests/ui/chat/composer/{InlineAskUserQuestion.test.ts,InlineAskUserQuestion.po.ts}` (new).
- **Outcome:** done — RED confirmed (component did not resolve).
- **Commit:** `11c58be`.

### T-CP-036 — `InlineAskUserQuestion.vue` (🔨 dev)

- **Spec/req:** SPEC-CP-022/032; REQ-CP-022/023/027/028; NFR-CP-003/007/008.
- **Files:** `src/ui/chat/composer/InlineAskUserQuestion.vue` (new),
  `src/ui/i18n/locales/{en,de}.ts` (composer.inline/bash/instruction keys).
- **Outcome:** done. Renders the (possibly multi-question) block in place of the
  composer — Arrow option nav, Left/Right + Tab/Shift+Tab tab switch, Enter
  select/advance, Escape cancel; `allowCustomInput` free-text field; a complete
  answer (every question id covered) → `respondAskUserQuestion` → emits `resolve`.
  Capability gate (SPEC-CP-032, EC-CP-6): `supportsInlineResponse:false` →
  read-only + `NotificationPort.showInfo`, no actionable options rendered (the
  callback is never reached). `<script setup>`; `{{ }}` text — no `v-html`; no
  `obsidian` import.
- **Commit:** `dec480a`.
- **Deviation:** the component reads `supportsInlineResponse` as a prop (the parent
  passes `getCapabilities().supportsInlineResponse`) rather than holding a runtime —
  keeps it runtime-free + DTO-driven; the gate is still the capability flag, never a
  provider branch (SPEC-CP-032). Answer-membership uses `Object.hasOwnProperty` (not
  an indexed `!== undefined`) so it is type-safe without `noUncheckedIndexedAccess`.

### T-CP-037 — RED `InlineExitPlanMode.vue` (🧪 qa)

- **Spec/test:** TEST-CP-024 (exit-plan A leg); SPEC-CP-023/032.
- **Files:** `tests/ui/chat/composer/{InlineExitPlanMode.test.ts,InlineExitPlanMode.po.ts}` (new).
- **Outcome:** done — RED confirmed.
- **Commit:** `5988438`.

### T-CP-038 — `InlineExitPlanMode.vue` (🔨 dev)

- **Spec/req:** SPEC-CP-023/032; REQ-CP-024/025/027/028; NFR-CP-003/007/008.
- **Files:** `src/ui/chat/composer/InlineExitPlanMode.vue` (new).
- **Outcome:** done. "Plan complete" card + scrollable monospace plan preview +
  implement/revise/cancel; the decision → `respondExitPlanMode` (revise carries the
  feedback text); the explicit Cancel routes `{kind:'cancel'}`, Escape dismisses with
  `null`; Arrow moves the focused action, Enter activates. Capability-gated read-only
  + `showInfo` identically (EC-CP-6). `<script setup>`; no `v-html`; no `obsidian`.
- **Commit:** `74f63c0`.
- **Deviation:** Escape resolves `null` while the explicit Cancel action resolves
  `{kind:'cancel'}` — SPEC-CP-023 specifies "Escape → cancel (null)"; both routes are
  honoured distinctly.

### T-CP-039 — RED `InlinePlanApproval.vue` (🧪 qa)

- **Spec/test:** TEST-CP-021 (A leg) + TEST-CP-024 (approval A leg); SPEC-CP-024/032.
- **Files:** `tests/ui/chat/composer/{InlinePlanApproval.test.ts,InlinePlanApproval.po.ts}` (new).
- **Outcome:** done — RED confirmed.
- **Commit:** `4b43412`.

### T-CP-040 — `InlinePlanApproval.vue` (🔨 dev)

- **Spec/req:** SPEC-CP-024/032; REQ-CP-026/027/028; NFR-CP-003/007/008.
- **Files:** `src/ui/chat/composer/InlinePlanApproval.vue` (new),
  `tests/ui/chat/composer/InlinePlanApproval.test.ts` (props cast → compile).
- **Outcome:** done. Renders `tool` + `context` (render-only) + Deny/Allow once/
  Always allow; the decision → `respondApproval`; **`allow-always` routes the current
  decision and persists NO rule (NG3)** — the component takes no SettingsPort/history
  collaborator; Escape dismisses with `null`; Arrow + Enter keyboard. Capability-gated
  read-only + `showInfo` (EC-CP-6). `<script setup>`; no `v-html`; no `obsidian`.
- **Commit:** `9ea63a8`.
- **Deviation:** none material (the NG3 "no rule persisted" is structural — the
  component has no settings/history dependency to write through).

### T-CP-041 — RED `BangBashOutput.vue` (🧪 qa)

- **Spec/test:** TEST-CP-013 (A leg); SPEC-CP-025.
- **Files:** `tests/ui/chat/composer/{BangBashOutput.test.ts,BangBashOutput.po.ts}` (new).
- **Outcome:** done — RED confirmed.
- **Commit:** `f93ad2a`.

### T-CP-042 — `BangBashOutput.vue` (🔨 dev)

- **Spec/req:** SPEC-CP-025; REQ-CP-031; NFR-CP-003.
- **Files:** `src/ui/chat/composer/BangBashOutput.vue` (new),
  `tests/ui/chat/composer/BangBashOutput.test.ts` (i18n plugin in mount).
- **Outcome:** done. The `BangBashOutput` DTO renders as a read-only tool-like block —
  command, monospace stdout/stderr `<pre>`, a non-zero exit-code badge, the
  truncation/timeout notice. `{{ }}` text only (Vue escapes), so a `<script>` in the
  output renders verbatim and is never executed (EC-CP-13, no `v-html`). Colour via
  `--sp-bash-*` tokens; no `obsidian`.
- **Commit:** `477fe4d`.
- **Deviation:** none.

### T-CP-043 — RED instruction-confirm seam + the instruction ladder (🧪 qa)

- **Spec/test:** TEST-CP-011 (confirm leg) + TEST-CP-025; SPEC-CP-027.
- **Files:** `tests/ui/chat/modalSeam.ts.test.ts`,
  `tests/ui/chat/composer/instructionLadder.test.ts` (new).
- **Outcome:** done — RED confirmed (seam handle + `submitInstruction` did not exist).
- **Commit:** `625bf75`.

### T-CP-044 — instruction-confirm seam + `InstructionConfirmModal` + ladder (🔨 dev)

- **Spec/req:** SPEC-CP-027; REQ-CP-015/016/017/018/019; NFR-CP-003/010.
- **Files:** `src/ui/chat/modalSeam.ts` (additive handle),
  `src/plugin/modals/InstructionConfirmModal.ts` (new),
  `src/ui/chat/composer/useComposerMode.ts` (additive options + `submitInstruction`).
- **Outcome:** done. The seam gains `InstructionConfirmFn`/`InstructionConfirmResult`/
  `INSTRUCTION_CONFIRM`/`useInstructionConfirm()` (auto-reject when absent —
  REQ-CP-017). `InstructionConfirmModal` is an Obsidian `Modal` subclass under
  `src/plugin/modals/` (like `ForkTargetModal`) — `createEl`/`setText`, an editable
  textarea, Accept/Reject, resolves a `Promise`, **never** `window.confirm`/`prompt`/
  `alert`. `useComposerMode.submitInstruction` runs the ladder: empty → exit persist
  nothing (REQ-CP-019); else optional refine (refine-fail/clarification → the RAW
  instruction, EC-CP-9) → `confirmInstruction` → accept appends to `customSystemPrompt`
  (prior preserved via `appendInstruction`, REQ-CP-018) / reject persists nothing
  (REQ-CP-017). The `.vue`/composable path is `obsidian`-free.
- **Commit:** `9f52de9`.
- **Deviation:** the ladder lives in `useComposerMode` (additive optional options
  `refineInstruction?`/`settings`/`confirmInstruction`) rather than inline in
  `ChatComposer` — keeps the composer thin and the ladder unit-testable; ChatComposer
  forwards the instruction-mode Enter to `submitInstruction`. The modal's visual render
  + Promise resolution is the manual leg **TEST-CP-M2** (coverage-excluded plugin code).

### T-CP-045 — RED `ChatComposer.vue` extension (🧪 qa)

- **Spec/test:** TEST-CP-023; SPEC-CP-019/031.
- **Files:** `tests/ui/chat/ChatComposer.ts.test.ts` (new),
  `tests/ui/chat/ChatComposer.po.ts` (extended P4 testids).
- **Outcome:** done — RED confirmed (7 fail / 2 pass; the 2 pure-P1 default-Enter cases
  already held).
- **Commit:** `42d803a`.

### T-CP-046 — `ChatComposer.vue` extension (🔨 dev)

- **Spec/req:** SPEC-CP-019/031; REQ-CP-020/021/027/029/034/035/036; NFR-CP-008/009.
- **Files:** `src/ui/chat/ChatComposer.vue` (extended),
  `src/ui/i18n/locales/{en,de}.ts` (bash.placeholder),
  `tests/ui/chat/ChatComposer.ts.test.ts`.
- **Outcome:** done. The P1 `submitTurn`/`autoGrow`/`onKeydown` are kept byte-for-byte;
  an additive P4 layer keys off an optional `composer` arbiter prop: `onComposerKeydown`
  delegates to `composer.handleKeydown` first and only reaches the P1 send when it
  returns `false` && `mode.kind==='default'` (REQ-CP-035); `onInput` re-classifies the
  mode; the textarea gains combobox ARIA (`role`/`aria-expanded`) + mode-border classes
  (instruction/bang-bash/plan) + bang-bash monospace + run-command placeholder;
  `inline-block` mode `v-if`-hides the textarea+toolbar and renders the active inline
  component (Ask/ExitPlan/PlanApproval) wired to `respond` + the capability flag +
  `notify`, restored after the last resolves (REQ-CP-027); mounts ComposerDropdown/
  PlanModeIndicator/BangBashOutput; the `#` instruction Enter routes `submitInstruction`.
  With no `composer` prop the component is pure P1. `<script setup>`; no `v-html`; no
  `obsidian` import.
- **Commit:** `99764c0`.
- **Deviation:** the arbiter + inline collaborators arrive as props (built/provided by
  the parent — the per-tab runtime/ports provide is the wire-in batch T-CP-049); the
  bang-bash output renders from an optional `bangBashOutput` prop (the arbiter's
  `onBangBashOutput` sets the parent state). Both keep the composer additive and the P1
  send path unchanged in default mode; the output-block plumbing completes in T-CP-049.

## Batch verification (UI batch 2)

- `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) — **0 errors**
  (whole project).
- `npx eslint` over every touched production file (the four inline/output `.vue`,
  `useComposerMode.ts`, `ChatComposer.vue`, `modalSeam.ts`, `InstructionConfirmModal.ts`,
  both locales) — **0 errors** (no `v-html`/`innerHTML`, no `window.confirm`/`alert`/
  `prompt`, no `obsidian` import under `src/ui/**` — NFR-CP-003; the Obsidian modal
  lives under `src/plugin/modals/`).
- Targeted `npx vitest run tests/ui/chat tests/ui/composables` — **245 passed / 43
  files** (the full chat + composables surface, incl. the P1 `ChatComposer.test.ts` +
  `ChatSurface.test.ts`/`.ts.test.ts`, green).
- Full suite `npx vitest run --project unit` — **1087 passed / 152 files, 0 failed**
  (up from 1048; +39 from batch 2). P1/P2/P3 + DOMAIN/INFRA/APPLICATION + UI batch 1
  stay green under the additive UI growth (NFR-CP-009); no test assertion was modified.
- **Not run** (orchestrator gate): full `npm run verify` / `build` / `build:web`. Not
  pushed. `manifest.json` untouched.
- **Next batch (WIRE-IN):** provide the three ports + the instruction-confirm seam in
  `AgentSidebarView` + `src/ui/main.ts` + mount the composer modes. First ready task:
  **T-CP-048** (qa RED — assert the four provides in both entry points + the composer
  modes mount; the standalone leg of TEST-CP-026 + the TEST-CP-027 grep-gate hook),
  greened by **T-CP-049**, then **T-CP-050** (`npm run dev` composer smoke). The manual
  legs **TEST-CP-M1/M2** + the **GATE** (T-CP-053 full verify) follow.

---

## WIRE-IN batch (T-CP-048..050) — provide composer ports + seam + mount

### T-CP-048 — RED: provide the three ports + instruction-confirm seam + mount (🧪 qa)

- **Spec:** TEST-CP-026 (mount leg), TEST-CP-027; SPEC-CP-028, SPEC-CP-038;
  REQ-CP-004/009/017/030; NFR-CP-002.
- **Files:** `tests/ui/chat/composer/mount.ts.test.ts` (new, lines 1-212).
- **What:** the failing component/integration test asserting (a) the standalone
  (`src/ui/main`) surface mounts the live composer and typing `/` then `@` opens the
  `composer-dropdown` (the catalog + mention ports reached the live arbiter); (b) the
  Obsidian `AgentSidebarView.onOpen` mounts the same surface with the composer ports
  provided; (c) an emitted ask-user request on the active runtime renders the
  `inline-ask` block in place of the composer (the depth-counted queue). RED because
  `ChatSurface` mounted `ChatComposer` without the arbiter and neither entry point
  provided the three ports / `INSTRUCTION_CONFIRM` → no dropdown, no inline block.
- **Commit:** `39208ef`.
- **RED proof:** 2 failed / 1 passed (the dropdown + inline-ask assertions fail; the
  bare surface-mount passes) — clean assertion failures, not crashes.

### T-CP-049 — Provide the three ports + the instruction-confirm seam; mount the composer modes (🔨 dev)

- **Spec:** SPEC-CP-028, SPEC-CP-038; REQ-CP-004/009/017/030; NFR-CP-002.
- **Files:** `src/plugin/AgentSidebarView.ts` (provide block + InstructionConfirmModal
  import/launcher), `src/ui/main.ts` (provide block + browser stand-in),
  `src/ui/chat/ChatSurface.vue` (the `buildComposer` wiring + the `EnqueueRuntime`
  bridge + `dispatchBuiltIn`), `src/ui/chat/ChatComposer.vue` (`defineExpose`
  `getValue`/`getCaret`/`applyInsert`; simplified palette-confirm), and
  `src/ui/chat/composer/EnqueueRuntime.ts` (new — the inline-callback enqueue decorator).
- **What:** greens TEST-CP-026 (mount leg) + TEST-CP-027. Both entry points now
  `app.provide(MENTION_DATA_PROVIDER_PORT, bridge.createMentionDataProvider())` +
  `app.provide(PROVIDER_COMMAND_CATALOG_PORT, bridge.createProviderCommandCatalog())`
  (per-mount factories) + `app.provide(SHELL_EXEC_PORT, bridge.shellExec)` (stateless)
  + `app.provide(INSTRUCTION_CONFIRM, …)` — the Obsidian view opens the REAL
  `InstructionConfirmModal`, `ui/main.ts` provides a browser-safe stand-in (accept
  verbatim, no `window.*`). `ChatSurface` builds the live `useComposerMode` arbiter +
  `RespondToInlineBlockUseCase` ONLY when all three ports are present (degrades to
  pure P1 otherwise), bridges `getValue`/`getCaret`/`onInsert` to the mounted
  `ChatComposer` textarea, feeds `onBangBashOutput` → `bangBashOutput` → the
  `BangBashOutput` block, and maps built-in actions (`new`→`openTab`,
  `compact`→`compactActive`) to the existing tab flow. No router reintroduced; no
  `obsidian`/`node:*` under `src/ui/**`.
- **Commit:** `0afaefe`.
- **KEY DECISION (inline-block bridge):** the runtime→render→answer knot is resolved
  by `EnqueueRuntime`, a `ChatRuntimePort` decorator that wraps ONLY the three inline
  callback setters to `enqueue` the request for render BEFORE delegating to the
  registered capture callback; every other member delegates verbatim. So
  `RespondToInlineBlockUseCase` (built over the decorator) still captures the runtime's
  awaiting `resolve` — ONE registration per callback, no last-wins conflict between
  rendering (arbiter queue) and answering (use-case resolve). Chosen over a Proxy
  (lint-hostile: `unbound-method`/`no-unsafe-return`) — an explicit delegating class is
  lint-clean and DTO-only.
- **Deviation:** the composer binds to ONE runtime built via the per-tab
  `CHAT_RUNTIME_FACTORY` (for the plan/inline capability gate + the inline callback
  channel), not the live streaming tab runtime. Under the single-runtime mock (test
  spies `createChatRuntime` to one instance) the composer's runtime IS the tab runtime,
  so an emitted request renders. The per-tab-streaming-runtime ↔ composer-runtime
  binding (one composer per active tab) is a P5+ refinement; P4 wires one composer
  runtime, matching the single `ChatComposer` instance below the tab region.
- **Deviation:** `/clear`/`/add-dir`/`/resume`/`/fork` built-in actions log a `debug`
  with no surface side effect (catalog rows only) — the full dispatch is beyond the
  P4 wire-in (the spec routes them to "the existing flow"; only `new`/`compact` have a
  P4 store action). No `// TODO`; recorded here.
- **Deviation:** `ChatComposer` now `defineExpose`s `getValue`/`getCaret`/`applyInsert`
  so the externally-built arbiter writes back the post-confirm value+caret (the
  textarea stays the single source of truth, NFR-CP-005); the old manual
  `value.value = textarea.value?.value` re-read in `onPaletteConfirm` is removed.

### T-CP-050 — standalone composer-power smoke (TEST-CP-026 dev leg) (🧪 qa)

- **Spec:** TEST-CP-026 (dev leg); NFR-CP-002.
- **Files:** `tests/ui/main.ts.test.ts` (extended — new `standalone composer-power
  smoke` describe), `specs/composer-power/test-plan.md` (TEST-CP-026 dev-leg PASS row).
- **What:** the deterministic standalone smoke against `MockBridge`: typing `/` opens
  the slash command dropdown, `@` opens the mention dropdown (after the debounce
  window), Shift+Tab toggles the PLAN indicator (the capable mock,
  `supportsPlanMode:true`), and `!echo hi`+Enter runs the scripted-echo `ShellExecPort`
  surfacing the `bang-bash-output` block (the Mock echoes the command). `data-testid` +
  `flushPromises`/`nextTick`; `vi.resetModules()` so `@/ui/main` re-mounts onto the
  fresh `#app`. The instruction-mode `#` → refine → confirm stand-in → append leg + the
  live-feel pair with the human's final review (T-CP-051/052).
- **Commit:** `62a6636`.

## Batch verification (WIRE-IN batch)

- `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) — **0 errors**
  (whole project).
- `npx eslint` over every touched file (`AgentSidebarView.ts`, `main.ts`,
  `ChatSurface.vue`, `ChatComposer.vue`, `EnqueueRuntime.ts`, both new/extended test
  files) — **0 errors** (no `v-html`/`innerHTML`, no `window.confirm`/`alert`/`prompt`,
  no `obsidian`/`node:*` under `src/ui/**` — NFR-CP-003; the real `InstructionConfirmModal`
  is an Obsidian `Modal` subclass under `src/plugin/modals/`).
- Targeted `npx vitest run`:
  - `tests/ui/chat/composer/mount.ts.test.ts` — **3 passed** (T-CP-048 greened).
  - mount + main entry points (`mount{,.ts,.rr}.test.ts`, `main{,.ts,.rr}.test.ts`,
    `composer/mount.ts.test.ts`) — **11 passed / 7 files** (P1/P2/P3 entry points stay
    green; the provides are additive).
  - `ChatSurface{,.ts}.test.ts` + `ChatComposer{,.ts}.test.ts` — **38 passed** (the
    surface degrades to pure P1 when the composer ports are absent; the `defineExpose`
    change preserved the P1 keyboard contract).
  - `tests/ui/chat/composer` + `tests/ui/composables` — **90 passed / 16 files**.
- **Not run** (orchestrator gate T-CP-053): full `npm run verify` / `build` /
  `build:web` / `test:all` / coverage. Not pushed. `manifest.json` untouched.
- **Remaining:** T-CP-051 (MANUAL — Obsidian mention + `.claude` catalog vault read,
  TEST-CP-M1) + T-CP-052 (MANUAL — Obsidian `ShellExec` + real-CLI inline honesty +
  `InstructionConfirmModal`, TEST-CP-M2) are **human-owned** (never agent-self-claimed);
  T-CP-053 (feature DoD — full verify + grep gates + additivity + parity self-review +
  draft PR into `next`) is the **orchestrator's** gate.

## Review remediation (REVIEW-CP-001 R-CP-001 / R-CP-002, P2) — dev

The two P2 real-path conditions from `review.md` (unit-green-but-dead on the real
runtime) fixed under strict TDD, one Conventional commit per finding. Verify gate /
build NOT run (orchestrator gate); not pushed; `manifest.json` untouched.

### R-CP-001 — instruction `customSystemPrompt` now reaches the runtime

- **Spec:** SPEC-CP-011, REQ-CP-018; parity ref Claudian `ClaudeQueryOptionsBuilder`
  → `buildSystemPrompt` → SDK `systemPrompt`.
- **Files:**
  - `src/domain/chat/ChatTurn.ts` (`ChatRuntimeQueryOptions` +`appendSystemPrompt?: string`, additive).
  - `src/infrastructure/obsidian/ClaudeCliChatRuntime.ts` (`_buildArgs` → new pure
    `_optionArgs`; emits `--append-system-prompt <text>` when present/non-empty —
    the real `claude` CLI flag; complexity split for the budget).
  - `src/ui/stores/tabsStore.ts` (`TabDepsBinding.getAppendSystemPrompt?()`; new
    `_turnQueryOptions()`; `sendMessage` threads it onto `RunChatTurnInput.queryOptions`).
  - `src/ui/chat/ChatSurface.vue` (`getAppendSystemPrompt` reads
    `SettingsPort.getSettings().customSystemPrompt` — the SettingsPort read stays in
    the surface layer where it already lives).
  - RED tests: `tests/infrastructure/obsidian/ClaudeCliChatRuntime.buildArgs.test.ts`
    (the `_optionArgs`/argv seam emits `--append-system-prompt`, omits on empty/absent);
    `tests/ui/stores/tabsStore.test.ts` (+3: `sendMessage` threads the persisted prompt
    into `queryOptions.appendSystemPrompt`, omits when empty / no seam).
- **Threading:** `customSystemPrompt` → `getAppendSystemPrompt` binding seam →
  `tabsStore.sendMessage._turnQueryOptions()` → `RunChatTurnInput.queryOptions` →
  `runtime.query(prepared, history, queryOptions)` → `_buildArgs`/`_optionArgs` →
  `--append-system-prompt`. Matches how `queryOptions.model` already flows; preferred
  query-options threading over a runtime `SettingsPort` ref (keeps the runtime ctor
  simple, the read in the application/store layer). The real CLI round-trip rides
  manual TEST-CP-M2 (the runtime is coverage-excluded infra).
- **Commit:** `ade17d6`.
- **Outcome:** done. No deviation from spec; resolves the SPEC-CP-005/011 intent that
  the appended prompt is "read by the runtime", not merely persisted.

### R-CP-002 — inline-block channel bound to the active-tab runtime (no orphan)

- **Spec:** ADR-CP-004 §1, SPEC-CP-017, REQ-CP-023/027.
- **Files:**
  - `src/ui/stores/tabsStore.ts` (new `activeRuntime()` action exposing the active
    tab's existing per-tab runtime held OUTSIDE reactive state).
  - `src/ui/chat/ChatSurface.vue` (`composerRuntime` now = `tabs.activeRuntime()` —
    the SAME instance `sendMessage`/`query` streams on — instead of a fresh
    `createRuntime()` orphan; `supportsInlineResponse` reads from it).
  - RED test: `tests/ui/chat/ChatSurface.inline.test.ts` — mounts with the three
    composer ports + a DISTINCT-instance `CHAT_RUNTIME_FACTORY`, drives
    `emitAskUserQuestion` THROUGH the active-tab runtime (`created[0]`) → `inline-ask`
    renders; asserts NO second orphan runtime is built (count 1). Verified RED on the
    orphan code (both assertions fail) before the fix.
- **Binding:** the composer's `EnqueueRuntime`/`RespondToInlineBlockUseCase` channel +
  the `getCapabilities()` read bind to `tabs.activeRuntime()`. The first tab + its
  runtime are seeded synchronously by `bindTabDeps` before `buildComposer`, so the
  active runtime exists at setup. The streaming runtime's reducer-emitted request
  chunk now routes through the registered callback to the rendered queue.
- **ADR decision:** **no ADR needed.** The review allowed an ADR if the per-tab↔composer
  lifecycle were architecturally non-trivial; it is not — the composer operates on the
  active tab, so its inline channel = the active tab's runtime. A minimal `activeRuntime()`
  accessor over the existing per-tab `deps` Map suffices (no new runtime lifecycle, no
  store-owned registration). Recorded here per the brief.
- **Commit:** `8171fad`.
- **Outcome:** done. ADR-CP-004's "the same UI lights up — no UI change" is now true on
  a capable transport; the CLI still honestly gates `supportsInlineResponse:false`.

### Remediation verification

- `npm run typecheck` (`vue-tsc --noEmit -p tsconfig.lint.json`) — **0 errors**.
- `npx eslint` over every touched src + test file — **0 errors** (only the pre-existing
  `tabsStore` `max-lines` warning; no `v-html`/`innerHTML`/`window.confirm`, no
  `obsidian` under `src/ui/**`, capability-gating via `getCapabilities()` not
  `provider===`).
- `npx vitest run` over `tests/ui/chat tests/ui/stores tests/ui/composables
  tests/application/chat tests/infrastructure` — **748 passed / 92 files** (P1/P2/P3 +
  P4 green under the additive growth; no test assertion changed, no P1-P3 member
  renamed/removed). The two new RED tests + the +3 tabsStore tests pass green.
- **Not run** (orchestrator gate, T-CP-053): full `npm run verify` / `build` /
  `build:web` / `test:all` / coverage. Not pushed; `manifest.json` untouched.
