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
- **Commit:** <pending>
- **Deviation:** none. No file under `src/` changed.
