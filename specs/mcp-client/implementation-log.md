---
id: IMPL-LOG-MC-001
title: MCP client (P8) — Implementation Log
stage: implementation
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Implementation Log — MCP client (P8)

Append-only. One entry per task: files changed (line ranges), commit SHA, spec
reference, outcome, deviations. TDD per task — RED first (qa), then minimal impl
(dev) to green.

## T-MC-001 — Baseline-capture + guard verification + file-naming directive (📐, doc-only)

- **Spec/req:** NFR-MC-009 (baseline leg), NFR-MC-005 (guard verification),
  SPEC-MC-001/003/004/009/015/016/017/018/021/030.
- **Files:** `specs/mcp-client/parity-screenshots.md` (new — baseline skeleton,
  eight surfaces × 320/520/720 × light/dark, baseline column keyed to `claudian-main`
  `McpStorage` / `McpConfigParser` / `McpTester` / `McpServerManager` / `utils/mcp.ts`
  + the three `mcp-*.css` modules), `specs/mcp-client/test-plan.md` (new —
  guard-verification note + the file-naming directive for the Obsidian infra +
  the TEST-MC-M1/M2 + TEST-MC-021/022/061/064 manual legs + the DOMAIN-batch
  automated status), `specs/mcp-client/implementation-log.md` (new — this file).
- **Outcome:** done.
- **Guard verification:** the new `MCP_CONFIG_STORE_PORT` / `MCP_CLIENT_PORT` keys
  and the new domain/application/ui MCP paths (`@/domain/chat/mcp/**`,
  `@/application/chat/mcp/**`, `@/ui/chat/mcp/**`, `@/domain/ports/McpConfigStorePort`,
  `@/domain/ports/McpClientPort`) match **no** `DELETED_SUBSYSTEM_BAN` /
  `DELETED_INJECTION_KEYS` glob — no relaxation task needed (recorded in
  `test-plan.md`). The OLD `@/infrastructure/obsidian/ObsidianMcp*` /
  `@/infrastructure/obsidian/mcp/**` globs ARE still active; the Obsidian-infra
  file-naming directive (`VaultMcpConfigStore.ts` / `SdkMcpClient.ts`, never
  `ObsidianMcp…`, never under `obsidian/mcp/`) is recorded in `test-plan.md`. A
  whole-project `npm run lint` over the pre-existing surface passes clean (no new
  key/port referenced yet).
- **Commit:** `bcff6d77`.
- **Deviation:** none. No file under `src/` changed.

## DOMAIN batch (T-MC-002..011)

### T-MC-002 — RED `McpTypes` shapes + additive `enabledMcpServers?` (🧪 qa)

- **Spec/test:** TEST-MC-001 (type-shape leg), TEST-MC-082 (serialisation leg);
  SPEC-MC-001/002/022; REQ-MC-052/082; NFR-MC-001.
- **Files:** `tests/domain/chat/mcp/McpTypes.test.ts` (new — the config union +
  `ManagedMcpServer`/`McpTool`/`McpTestResult`/`ParsedMcpConfig`/`EnabledMcpServers`
  exact-key + per-field type legs + the `DEFAULT_MCP_SERVER` value + construction
  legs); `tests/domain/chat/ChatTurn.ts.test.ts` (extended — the `_queryKeys`
  exact-keys grown to eight appending `enabledMcpServers`, the `enabledMcpServers?`
  type leg, the `externalContextPaths`-stays-EXCLUDED leg, the P7-shaped
  byte-identical serialisation leg + the empty-query leg + the carried-when-present
  leg, the `mcpMentions` empty-`Set` seam).
- **Outcome:** done — RED confirmed (`vue-tsc -p tsconfig.lint.json` failed on the
  missing `@/domain/chat/mcp` module + `enabledMcpServers` not a key on
  `ChatRuntimeQueryOptions`; the unresolved import also fails the vitest run).
- **Commit:** `ea5c1c71`.

### T-MC-003 — `McpTypes.ts` + `ChatRuntimeQueryOptions.enabledMcpServers?` + barrel (🔨 dev)

- **Spec/req:** SPEC-MC-001/002/022; REQ-MC-052/082; NFR-MC-001.
- **Files:** `src/domain/chat/mcp/McpTypes.ts` (new — the config union +
  `ManagedMcpServer` + `McpTool` + `McpTestResult` + `ParsedMcpConfig` +
  `EnabledMcpServers` + `DEFAULT_MCP_SERVER`, regrown verbatim from claudian
  `core/types/mcp.ts` + `core/mcp/McpTester.ts:13-25`, `readonly` on the
  store-boundary collections); `src/domain/chat/mcp/index.ts` (new — the barrel
  re-export); `src/domain/chat/ChatTurn.ts` (the optional `enabledMcpServers?:
  EnabledMcpServers` appended AFTER `permissionMode`, importing from
  `./mcp/McpTypes`; the P0–P7 members byte-identical;
  `PreparedChatTurn`/`ChatRuntimeEnsureReadyOptions`/`ChatTurnRequest` unchanged;
  `externalContextPaths?` stays EXCLUDED).
- **Outcome:** done — the TEST-MC-001 type-shape leg + TEST-MC-082 serialisation
  leg now green (15/15 across the two files); a P7-shaped query is byte-identical
  to P7. **No `implements ChatRuntimePort` break** (additive-only — the runtimes
  read the optional field; no companion-stub needed).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 15/15 green. No
  `obsidian`/`node:*`/Vue import in `src/domain/chat/mcp/**`.
- **Commit:** <pending>
- **Deviation:** none.
