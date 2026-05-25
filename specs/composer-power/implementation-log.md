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
