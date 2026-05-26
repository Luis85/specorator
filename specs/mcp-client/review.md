---
id: REVIEW-MC-001
title: MCP client (P8) — Stage-9 review
stage: review
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
owner: reviewer
integration_branch: next
verdict: approve-with-nits
created: 2026-05-26
updated: 2026-05-26
---

# Review — MCP client (P8)

Stage-9 review of `feature/mcp-client` against `next` @ `06734d5a` (base unchanged →
`git diff next..HEAD` is the entire P8 feature, 88 files / +12,866). Read: PRD-MC-001,
DESIGN-MC-001, SPEC-MC-001..030, TASKS-MC-001, the implementation log, test-plan, the
full diff, and the claudian-main parity reference. Targeted tests run read-only by this
reviewer; the full suite + builds are the parent's (Stage 8) job.

## Verdict

**Approve with conditions (approve-with-nits).** The feature is correctly wired, additive,
secure, and architecture-clean. No P1/P2 (release-blocking) findings. The conditions are:
(a) the manual legs TEST-MC-M1/M2 + TEST-MC-021/022/061/064 remain **pending** and must be
recorded at the final epic-review human gate before the real-transport REQs are claimed
green (this is by design — coverage-excluded infra, NFR-MC-006 — not a defect); (b) two P3
nits below are worth scheduling but do not block merge to `next`.

## Finding counts

| Severity | Count |
|---|---|
| P1 (critical — blocks release) | 0 |
| P2 (high — blocks merge) | 0 |
| P3 (medium — schedule) | 2 |
| P4 (low / nit) | 3 |

**No P1/P2 findings.** Nothing for the parent to fix before merge.

## Security confirmation (the load-bearing P8 concern)

| Claim | Verdict | Evidence |
|---|---|---|
| Vault config store writes ONLY `.claude/mcp.json` via `VaultPort`, never `data.json` | **confirmed** | `VaultMcpConfigStore.ts:8` `MCP_CONFIG_PATH='.claude/mcp.json'`; only `createFolder('.claude')`+`writeFile(MCP_CONFIG_PATH)`; project-wide grep shows no MCP path touching `data.json` |
| No plaintext secret duplicated by P8 (auth stays in user-authored config) | **confirmed** | No `SecretStorePort` introduced (it is P0-deleted + still banned); auth headers/env round-trip verbatim through the codec; CLAR-MC-004 deferral honoured |
| stdio spawn bounded / explicit / no shell-eval | **confirmed** | `SdkMcpClient.ts:172-182` — `parseCommand` (no-shell tokeniser) cmd+args, `env:{...stringEnv,...config.env,PATH:enhancedPath}`, `stderr:'ignore'`, no `shell:true`, no `eval`/`exec`; spawn is the SDK `StdioClientTransport`, not a raw `child_process.exec` |
| Malformed paste/config → `Result.err`, never a crash | **confirmed** | `McpConfigParser.parseClipboardConfig` total (`trySync` → `Invalid JSON`/`Invalid MCP configuration format`); `McpConfigCodec` total (`ok([])` on unparseable); `McpServerModal.vue:61` shows the parse error and submits nothing |
| MCP tool call gated by P7 ApprovalManager (NOT auto-trusted, no special-case) | **confirmed** | `ApprovalManager.ts:17` "No `providerId` branch"; `ChatSurface.vue:408` gates the active runtime via the UNCHANGED `ApprovalGateRuntime`; `ChatSurface.mcp.test.ts:196` TEST-MC-065 proves `mcp__fs__read` flows through `ApprovalManager.decide` with no MCP branch |
| SDK externalized — `build:web` cannot bundle node-only transports | **confirmed (by inspection)** | `@modelcontextprotocol/sdk` imported ONLY in `src/infrastructure/obsidian/{SdkMcpClient,ObsidianBridge}.ts`; `src/ui/main.ts`→`MockBridge` never imports `obsidian/**`; `node:http`/`https`/`path` confined to `SdkMcpClient.ts`. (Final `build`/`build:web` is the parent's gate.) |

Additionally: TLS is **not** weakened (`SdkMcpClient.ts` `nodeFetch`/`runNodeRequest` leave
Node's default verification); the 10s `AbortController` is enforced (`:75-92`); explicit-add-only
(load-or-default, no auto-discover/auto-spawn). No config value reaches a notice or log
(`McpServerManager.commit` uses `feedback.reportResult` with an `errorLabel`, not the config;
`McpServerModal` surfaces only the parser's category message).

## Live-wiring confirmation (the P5 lesson — wired, not built-but-dead)

- **Per-surface manager built:** `ChatSurface.vue:265` constructs ONE `McpServerManager` per
  surface when `MCP_CONFIG_STORE_PORT` is provided (parity the P7 `ApprovalManager`), loads it
  on mount (`:167,292`), and drives both the settings (`McpSettingsManager`, `:753`) and the
  toolbar selector from the same reactive `mcpVm` (`:283`).
- **`foldEnabledMcpServers` on the real submit path:** `ChatSurface.vue:156` binds
  `getEnabledMcpServers: () => mcpManager?.getEnabledMcpServers(new Set())` into `bindTabDeps`;
  `tabsStore._turnQueryOptions:618` calls it and `:628` writes `queryOptions.enabledMcpServers`
  ONLY when defined; `sendMessage:663` threads `queryOptions` into the runner. This is the live
  turn path, not a dead helper. TEST-MC-052 (`ChatSurface.mcp.test.ts:162`) asserts the fold
  reaches `runtime.query`.
- **Both ports + both launchers provided in BOTH surfaces:** `AgentSidebarView.ts:182-193`
  provides `MCP_CONFIG_STORE_PORT`, `MCP_CLIENT_PORT`, `OPEN_MCP_SERVER_MODAL`,
  `OPEN_MCP_TEST_MODAL`; `src/ui/main.ts:118-130` provides both ports + browser-safe seam
  stand-ins. No transient unwired window.
- **Modal-seam launchers open real Obsidian Modal hosts:** `mcpModalLaunchers.ts` →
  `McpServerModalHost.ts` / `McpTestModalHost.ts` under `src/plugin/**` (the only `obsidian`-
  importing MCP files); the Vue surface launches via the seam.
- **Selector/settings read the manager:** the toggle (`McpSelector.onToggleServer`) emits
  `set-enabled` → ToolbarStrip → ChatComposer → `ChatSurface.onMcpSetEnabled:299` →
  `mcpManager.setEnabled` → refresh. Live.
- **Optional-inject degrade = byte-identical P6/P7:** with the ports absent, `mcpManager` is
  `null`, `hasMcp` false (settings unmounted), `ToolbarStrip` falls back to the P6 empty-seam
  `McpViewModel`, and the binding's `getEnabledMcpServers?` is undefined → the turn omits the
  field. TEST-MC-082 degrade (`ChatSurface.mcp.test.ts:236`) and `ChatTurn.ts.test.ts` confirm
  byte-identical serialisation.

## File-naming-ban-honoured check

**Confirmed honoured.** `eslint.config.js:138,145` still ban
`@/infrastructure/obsidian/ObsidianMcp*` and `@/infrastructure/obsidian/mcp/**` (and
`@/domain/ports/ObsidianMcpServerPort` at `:156`). The new real-transport files are
`src/infrastructure/obsidian/VaultMcpConfigStore.ts` + `SdkMcpClient.ts` — directly under
`obsidian/`, NOT prefixed `ObsidianMcp`, NOT under `obsidian/mcp/`; the new keys
`MCP_CONFIG_STORE_PORT`/`MCP_CLIENT_PORT` are absent from `DELETED_INJECTION_KEYS`. No
guard-relaxation was needed and none was performed.

## Parity assessment (one line)

The pure parser/codec/`parseCommand`/`getActiveServers`/tester-state-model are ported verbatim
from claudian `McpConfigParser`/`McpStorage`/`McpTester`/`utils/mcp.ts` with throws converted to
`Result` (ADR-004); the 4 paste formats + `getMcpServerType` (bare-url→http) + `_claudian`
default-pruning + CLI-key preservation match the reference — structural parity is faithful;
visual parity (TEST-MC-M2 screenshots) remains the pending manual leg.

## Requirements compliance

All 45 REQ-MC + 12 NFR-MC trace to SPEC + code + test (see `traceability.md`). Automated legs
are green per the implementation log and this reviewer's spot-runs (108/108 across
`tests/domain/chat/mcp` + `tests/application/chat/mcp`; 11/11 i18n locale-parity). The
real-transport legs (REQ-MC-021/022/064 manual-only; the real side of 020/030/033/052/061/065/080)
are **pending-manual** — correctly NOT claimed green.

## Design / spec / constitution compliance

- **Design honoured:** additive `enabledMcpServers?` after `permissionMode`; two narrow ports,
  one consumer each, no aggregate; three-bridge story (vault/scriptable/inert); guarded fold;
  unchanged P7 gating; no `providerId` branch. The five design open items are resolved as spec §0
  pinned (mentionedNames always ∅; `callTool` off turn-time; codec CLI-key preservation;
  await-save ordering; modal-seam signatures) and the code matches.
- **Spec deviations logged:** the implementation log records each deviation (T-MC-005 `getMcpServerType`
  total-guard; T-MC-007 `delete`→rest-spread + trimmed-disabledTools filter; T-MC-009 `stepCharacter`
  complexity extraction; T-MC-013 SSE `no-deprecated` disable + enhanced-PATH scoping; T-MC-029
  `existingNames` prop; T-MC-036 `_turnQueryOptions` complexity refactor). All are behaviour-preserving
  and parity-faithful; none warrant a new ADR (ADR-MC-001..003 cover the architecture).
- **Constitution:** Article I (spec-first), II (separation), III (incremental TDD RED→green),
  IV (quality gates), V (traceability — RTM regenerated here), VIII (EARS) all upheld.

## Findings

### P3-MC-001 (medium) — `enhancedPath` hard-codes POSIX dirs only; no Windows augmentation
- **Location:** `src/infrastructure/obsidian/SdkMcpClient.ts:251-255`
- **Detail:** `_enhancedPath()` appends `/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`
  and joins with the platform `PATH_DELIMITER`. On Windows the extra dirs are inert (harmless)
  but a GUI-launched Obsidian with a sparse PATH gets no Windows-appropriate augmentation, so a
  user-installed stdio MCP binary on Windows may not resolve. This is coverage-excluded infra,
  so it surfaces only at the manual TEST-MC-061 leg. The deviation note says it mirrors
  `ObsidianShellExec._enhancedPath`, so the gap (if any) is pre-existing and consistent — not a
  regression. **Recommendation:** verify on the Windows manual leg (TEST-MC-M1) that a stdio
  server resolves, or note the POSIX-only augmentation as a known limitation. **Owner:** dev /
  manual-leg runner.

### P3-MC-002 (medium) — `McpClientPort.test` uses the global `activeWindow` timer in coverage-excluded infra
- **Location:** `src/infrastructure/obsidian/SdkMcpClient.ts:76,100`
- **Detail:** `activeWindow.setTimeout/clearTimeout` is the Obsidian global. It is correct for the
  production bridge (and this file is coverage-excluded), but it means the 10s-timeout path
  (REQ-MC-031) has no automated coverage on the *real* client — only the Mock's `setClientMode('timeout')`
  exercises the timeout semantics. That is the intended split (the real timer is a manual leg), but
  the reliance on a non-Node global makes the file un-unit-testable by construction. **Recommendation:**
  none required for P8 (it is the accepted coverage-exclusion); flag for the retro if a future phase
  wants a thin injectable clock seam. **Owner:** architect (retro note).

### P4-MC-003 (low / nit) — `getMcpServerType` cast bypasses the validity guard for `_buildTransport`
- **Location:** `src/infrastructure/obsidian/SdkMcpClient.ts:160-163`
- **Detail:** `_buildTransport` classifies via `getMcpServerType(config)` then casts
  `config as McpStdioServerConfig` / `as UrlServerConfig`. A config that classifies stdio but has
  an empty `command` is caught (`:174` → `Missing command`); a URL type with a malformed `url` is
  caught by the `try` around `new URL`. So the cast is safe in practice, but it leans on the catch
  rather than `isValidMcpServerConfig`. **Recommendation:** optional — the construct guards already
  return the contracted structured errors (REQ-MC-023); no change needed. **Owner:** dev (optional).

### P4-MC-004 (low / nit) — test-modal per-tool toggle uses a launcher-local manager, not the surface manager
- **Location:** `src/plugin/mcpModalLaunchers.ts:46-53`; `ChatSurface.vue:338-345`
- **Detail:** `openMcpTestModal` builds a launcher-local `McpServerManager` over the same vault
  store; after the modal closes, `ChatSurface.onMcpTest` re-`load`s so the surface snapshot reflects
  the saved truth. This is correct (single `.claude/mcp.json` source of truth, documented in T-MC-036)
  but means a brief window of two manager instances writing the same file. Concurrency is bounded by
  await-save ordering (open item #4) and the modal is blocking, so there is no real race.
  **Recommendation:** none — documented and safe. **Owner:** — (informational).

### P4-MC-005 (low / nit) — `test-report.md` absent at review time
- **Location:** `specs/mcp-client/`
- **Detail:** Stage-9 ran in parallel with Stage-8; no `test-report.md` exists yet. The
  implementation log records per-task green counts and the coverage gate is the parent's verify
  step. **Recommendation:** ensure the parent's Stage-8 `test-report.md` lands (with the 80/70/80/80
  coverage figure + the pending-manual legs) before release. **Owner:** qa / release-manager.

## Conditions for clearing "with conditions"

1. The manual legs TEST-MC-M1/M2 + TEST-MC-021/022/061/064 are recorded (pass/date) at the final
   epic-review human gate before the real-transport REQs are claimed green. (By design.)
2. The parent's Stage-8 full suite + `npm run verify` + `build`/`build:web` are green (the SDK
   absent from the standalone graph) — this reviewer confirmed the externalization by inspection
   and ran targeted unit legs only.

## Quality-metrics note

`specorator quality:metrics --feature mcp-client --json`: EARS 100%, frontmatter 100%, 0 blockers,
0 open clarifications. `requirementCoverage`/`stageTraceabilityCoverage` reported ~23.7% because the
regenerable RTM did not exist when the metric ran — this review produces `traceability.md`, which
closes the chain (every REQ has SPEC+code+test). The low KPI is an artefact of RTM-absence, not a
real coverage gap, and does not override the manual verification above.
