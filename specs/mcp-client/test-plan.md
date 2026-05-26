---
id: TESTPLAN-MC-001
title: MCP client (P8) — test plan
stage: testing
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
owner: qa / dev
created: 2026-05-26
updated: 2026-05-26
---

# Test plan — MCP client (P8)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-MC-M1/M2 + the real-transport sub-legs) that ride the single final
epic-review human gate.

## Deleted-symbol guard verification (T-MC-001 / NFR-MC-005)

Confirmed against `eslint.config.js` (read 2026-05-26):

- `DELETED_INJECTION_KEYS.importNames` does **not** contain
  `MCP_CONFIG_STORE_PORT` or `MCP_CLIENT_PORT` — the new InjectionKeys resolve
  clean (only `METADATA_CACHE_PORT`, `CANVAS_PORT`, `CHAT_TRANSPORT_PORT`,
  `PROVIDER_REGISTRY_KEY`, `TRANSPORT_LIFECYCLE_PORT`, `CONFIRM_MODAL_PORT`,
  `SECRET_STORE_PORT`, `TRANSPORT_KIND_KEY`, `IS_MOBILE_KEY`,
  `SETTINGS_VERSION_KEY`, `OPEN_PLUGIN_SETTINGS_KEY`, `PLUGIN_MANIFEST_KEY` are
  banned).
- `DELETED_SUBSYSTEM_BAN.group` matches **none** of the new P8 domain/application/ui
  paths: `@/domain/chat/mcp/**`, `@/application/chat/mcp/**`, `@/ui/chat/mcp/**`,
  `@/domain/ports/McpConfigStorePort`, `@/domain/ports/McpClientPort`. (`@/domain/chat`
  regrew in P1 and `@/application/chat` likewise; both are off the list. There is
  no `@/ui/chat` ban glob — only `@/domain/feature` / `@/application/feature` /
  `@/application/migration` are banned. Only the OLD `@/domain/ports/ObsidianMcpServerPort`
  is banned, NOT the new `McpConfigStorePort`/`McpClientPort`.)
- The new symbols `McpConfigStorePort`, `McpClientPort`, `MCP_CONFIG_STORE_PORT`,
  `MCP_CLIENT_PORT`, `McpServerManager`, `McpConfigParser`, `McpConfigCodec`,
  `McpTypes`, `getActiveServers`, `parseCommand`, `McpSettingsManager`,
  `McpServerRow`, `McpServerModal`, `McpTestModal`, `McpSelector` appear nowhere
  in the guard.

Therefore **no guard-relaxation task is required** in P8. A whole-project
`npm run lint` over the new domain/port/key surface confirms the imports resolve
without a `no-restricted-imports` violation (re-confirmed at the gate, T-MC-031).

## File-naming directive — Obsidian-infra batch (T-MC-013, SPEC-MC-009)

The two OLD Obsidian-layer ban globs `@/infrastructure/obsidian/ObsidianMcp*` and
`@/infrastructure/obsidian/mcp/**` are **still active** (they still match a real
P0-deleted path) and would catch any new file named `ObsidianMcp…` or placed under
`src/infrastructure/obsidian/mcp/`. The P8 real-transport infra (SPEC-MC-009) MUST
therefore be named so as **NOT** to match either glob:

- the vault config store → e.g. `src/infrastructure/obsidian/VaultMcpConfigStore.ts`
- the real SDK client → e.g. `src/infrastructure/obsidian/SdkMcpClient.ts`

(or fold the methods onto the existing `ObsidianBridge` import surface). **Never**
prefix the file `ObsidianMcp` and **never** place it under
`src/infrastructure/obsidian/mcp/`. No scoped guard-relax is needed — the fix is a
file-naming choice, not a ban edit. T-MC-013 carries this directive; T-MC-031 (the
gate) re-confirms it. No `src/` change in the DOMAIN batch (T-MC-001..011) touches
that surface.

## Coverage-excluded manual legs (human-run, final review gate)

| Leg | Surface | Scheduled by |
|---|---|---|
| TEST-MC-M1 | The **real** SDK stdio/SSE/HTTP transports + the **real** vault `.claude/mcp.json` round-trip in Obsidian + a real Claude turn calling an MCP tool through the SDK + the P7 approval gate | T-MC-013 |
| TEST-MC-M2 | Per-surface parity screenshots vs claudian-main at 320 / 520 / 720 px, light + dark (settings empty + list, the add/edit modal incl. paste + name-required + parse-error, the test modal in each of the five states, the expanded selector with mixed enabled/disabled + count badge, the no-servers selector seam) | T-MC-031 (review gate) |
| TEST-MC-021 | The **real** SSE transport (`SSEClientTransport` over the Node http(s) fetch) | T-MC-013 |
| TEST-MC-022 | The **real** HTTP transport (`StreamableHTTPClientTransport` over the Node fetch) | T-MC-013 |
| TEST-MC-061 | The **real** bounded stdio spawn args (no-shell `parseCommand` cmd+args, `env` + enhanced `PATH`, `stderr:'ignore'`) | T-MC-013 |
| TEST-MC-064 | The **real** Node fetch / TLS not weakened on the remote probe | T-MC-013 |

> The **real** vault `.claude/mcp.json` read/write + the **real** SDK
> stdio/SSE/HTTP transports live under `src/infrastructure/obsidian/**`
> (coverage-excluded). Their behavioural gate is TEST-MC-M1 + TEST-MC-021/022/061/064
> — never self-claimed by an agent. The **pure** parser / codec / `parseCommand` /
> `getActiveServers` / `foldEnabledMcpServers` / `buildMcpViewModel`, the
> `McpServerManager` lifecycle (over the scriptable Mock store + client), the Mock
> scriptable store (`seedMcpServers` + `setMcpStoreFailMode`) + the scriptable
> client (`scriptTestResult` + `setClientMode`), and the LocalStorage
> browser-localStorage / inert impls carry the unit/component weight + the
> 80/70/80/80 coverage gate (NFR-MC-006).

## DOMAIN batch (T-MC-002..011) — automated structural/type/behaviour legs

| Leg | Status | Where |
|---|---|---|
| TEST-MC-001 (type-shape) — `McpTypes` shapes (`McpServerConfig` union / `ManagedMcpServer` / `McpTool` / `McpTestResult` / `ParsedMcpConfig` / `EnabledMcpServers` / `DEFAULT_MCP_SERVER`) | covered (RED→green, T-MC-002→003) | `tests/domain/chat/mcp/McpTypes.test.ts` |
| TEST-MC-082 (serialisation) — `ChatRuntimeQueryOptions.enabledMcpServers?` appended after `permissionMode`; a P7-shaped query byte-identical | covered (RED→green, T-MC-002→003) | `tests/domain/chat/ChatTurn.ts.test.ts` |
| TEST-MC-003/004/005/006 + EC-MC-2/3/5/6 — the PURE parser truth table (`parseClipboardConfig` 4 formats + `needsName`, `getMcpServerType`, `isValidMcpServerConfig`); never throws | covered (RED→green, T-MC-004→005) | `tests/domain/chat/mcp/McpConfigParser.test.ts` |
| TEST-MC-001/002/007 + EC-MC-12/19/20 — the PURE codec round-trip (load-or-default, default-pruning, CLI-key preservation, 2-space indent); never throws | covered (RED→green, T-MC-006→007) | `tests/domain/chat/mcp/McpConfigCodec.test.ts` |
| TEST-MC-020a + EC-MC-7 — the PURE `parseCommand`/`splitCommandString` (quote-aware split, empty-command, no shell/eval) | covered (RED→green, T-MC-008→009) | `tests/domain/chat/mcp/parseCommand.test.ts` |
| TEST-MC-052/053/054 + EC-MC-9/10 — the PURE `getActiveServers(∅)` + `collectDisallowedMcpTools` (enabled/context-saving filter, trim/dedupe/sort) | covered (RED→green, T-MC-008→009) | `tests/domain/chat/mcp/getActiveServers.test.ts` |
| TEST-MC-081 (port-shape) — `McpConfigStorePort` (`load`/`save`/`exists`) + `McpClientPort` (`isAvailable`/`test`/`connect`/`listTools`/`callTool`/`disconnect`) + the two own keys + the barrel re-exports | covered (RED→green, T-MC-010→011) | `tests/domain/ports/McpConfigStorePort.test.ts`, `tests/domain/ports/McpClientPort.test.ts` |

> **Build-green note (T-MC-003, the additive-only invariant):** the single domain
> interface change is the purely additive optional
> `ChatRuntimeQueryOptions.enabledMcpServers?` (SPEC-MC-002). The runtimes read the
> optional field; they do not re-declare the interface — so it carries **no**
> `implements ChatRuntimePort` break and **no** companion-stub concern (same as the
> P6 `ChatRuntimeQueryOptions` grow + the P7 `permissionMode?` optional). The two
> new ports (`McpConfigStorePort`/`McpClientPort`) are NEW interfaces with no prior
> impl, so adding them breaks nothing until a bridge declares `implements` (the
> bridge tasks add the impl + the `fake-ports` member in the same task).

## INFRA / APPLICATION / UI / STYLES / WIRE-IN / GATE batches

The scriptable Mock store (`seedMcpServers` + `setMcpStoreFailMode`) + the
scriptable client (`scriptTestResult` + `setClientMode` across the SPEC-MC-028
matrix), the LocalStorage browser-localStorage / inert impls, the `McpServerManager`
lifecycle, the pure `foldEnabledMcpServers`/`buildMcpViewModel`, and the Vue
components carry the unit/component weight + the 80/70/80/80 coverage gate. Tracked
per RED test task (qa-owned). These ride the INFRA (T-MC-012..017), APPLICATION,
UI, STYLES, WIRE-IN, and GATE batches — out of the DOMAIN batch scope.
