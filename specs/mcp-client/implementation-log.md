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
- **Commit:** `db5226d6`.
- **Deviation:** none.

### T-MC-004 — RED pure `McpConfigParser` truth table (🧪 qa)

- **Spec/test:** TEST-MC-003/004/005/006 + EC-MC-2/3/5/6; SPEC-MC-004/029;
  REQ-MC-003/004/005/006; NFR-MC-004.
- **Files:** `tests/domain/chat/mcp/McpConfigParser.test.ts` (new — the four
  formats + `needsName`, the skip-invalid-entry, the empty/no-valid → err, the
  malformed (`Invalid JSON` / `Invalid MCP configuration format`) cases incl. array
  / null / primitive, the `getMcpServerType` (sse/http/bare-url→http/stdio) +
  `isValidMcpServerConfig` per-shape tables, and the never-throws assertion across
  an odd-input matrix incl. `null`).
- **Outcome:** done — RED confirmed (27 failing; the parser functions are not yet
  exported from `@/domain/chat/mcp`).
- **Commit:** `12e68ec1`.

### T-MC-005 — `McpConfigParser.ts` + barrel (🔨 dev)

- **Spec/req:** SPEC-MC-004/029; REQ-MC-003/004/005/006; NFR-MC-003/004.
- **Files:** `src/domain/chat/mcp/McpConfigParser.ts` (new —
  `parseClipboardConfig` (the four formats → `Result<ParsedMcpConfig>`, the
  malformed/err paths) + `getMcpServerType` + `isValidMcpServerConfig`, ported
  verbatim from claudian `McpConfigParser.ts:17` + `core/types/mcp.ts:74/81` with
  the throw paths converted to `Result.err`; `JSON.parse` wrapped in `trySync` per
  the domain Result-discipline ban on raw try/catch); `src/domain/chat/mcp/index.ts`
  (the parser re-exports appended).
- **Outcome:** done — the prior RED (TEST-MC-003/004/005/006 + EC-MC-2/3/5/6) now
  green (27/27); the functions never throw across the odd-input matrix; the stored
  config is never corrupted on a malformed parse.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 27/27. No
  `obsidian`/`node:*`/Vue import in `src/domain/chat/mcp/**`; no `eval` — JSON parse
  only.
- **Commit:** `1ff81b07`.
- **Deviation:** `getMcpServerType` gains a leading `isRecord` guard (returns
  `'stdio'` on a non-object) so it is **total — never throws** for any runtime input
  (SPEC-MC-004 + NFR-MC-004 pin all three functions total; the QA never-throws leg
  asserts it on `null`). For every real `McpServerConfig` the result is verbatim
  Claudian. The JSON parse uses `trySync` (the domain layer bans raw `try/catch` per
  the Result-discipline ESLint rule) and maps any parse fault to the contracted
  `'Invalid JSON'` message — behaviour-identical to the Claudian `SyntaxError` branch.

### T-MC-006 — RED pure `McpConfigCodec` round-trip (🧪 qa)

- **Spec/test:** TEST-MC-001/002/007 + EC-MC-12/19/20; SPEC-MC-003;
  REQ-MC-001/002/007; NFR-MC-004.
- **Files:** `tests/domain/chat/mcp/McpConfigCodec.test.ts` (new — the
  load-or-default (null/empty/unparseable/no-`mcpServers`/non-object-`mcpServers` →
  `ok([])`), the sidecar default-application + `disabledTools` filter +
  skip-invalid, the serialise default-pruning (all-default ⇒ no sidecar) +
  non-default-only fields + 2-space indent + round-trip, the CLI-key preservation
  (unknown top-level keys + non-`servers` `_claudian` keys) + the empty-`_claudian`
  deletion + a non-`servers` key kept even when all servers are default, and the
  never-throws assertion).
- **Outcome:** done — RED confirmed (19 failing; the codec functions are not yet
  exported from `@/domain/chat/mcp`).
- **Commit:** `e4790abe`.

### T-MC-007 — `McpConfigCodec.ts` + barrel (🔨 dev)

- **Spec/req:** SPEC-MC-003; REQ-MC-001/002/007; NFR-MC-004.
- **Files:** `src/domain/chat/mcp/McpConfigCodec.ts` (new —
  `deserializeMcpConfig(raw)` (load-or-default `ok([])`; `hydrateServer` applies
  `DEFAULT_MCP_SERVER` defaults; `normalizeDisabledTools` keeps trimmed-non-empty;
  skip `!isValidMcpServerConfig`) + `serializeMcpConfig(servers, existingRaw)`
  (write `mcpServers` + ONLY non-default `_claudian.servers` via `buildSidecarMeta`;
  `resolveClaudian` preserves non-`servers` `_claudian` keys + unknown top-level
  keys; emits no/empty `_claudian` when nothing non-default; 2-space indent); ported
  from claudian `McpStorage.load:14-56` + `save:58-134`, `JSON.parse` via `trySync`,
  the `delete` operator replaced by object-rebuild rest-spread (codec ban)); the
  barrel `index.ts` re-exports appended.
- **Outcome:** done — the prior RED (TEST-MC-001/002/007 + EC-MC-12/19/20) now green
  (19/19); the full `tests/domain/chat/mcp` + `ChatTurn` suite 61/61; load-or-default,
  default-pruning, CLI-key preservation, 2-space indent, never-throws all proven.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 19/19 (codec) +
  61/61 (mcp + ChatTurn). No `obsidian`/`node:*`/Vue import in `src/domain/chat/mcp/**`.
- **Commit:** <pending>
- **Deviation:** `normalizeDisabledTools` filters by **trimmed**-non-empty on load
  (claudian load only filters `typeof === 'string'` and trims on save); the QA
  contract (TEST-MC-001) + SPEC-MC-003 ("filtered to non-empty strings") asserts a
  whitespace-only `'  '` is dropped on load, so load + save are symmetric. The kept
  values stay verbatim (untrimmed) — only the filter predicate trims. The `delete`
  operator was replaced by rest-spread object-rebuild (the project's `no-restricted-syntax`
  bans `delete`); behaviour-identical to the Claudian `delete file._claudian`.
