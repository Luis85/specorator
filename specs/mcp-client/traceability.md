---
id: TRACE-MC-001
title: MCP client (P8) — traceability matrix
stage: review
feature: mcp-client
area: MC
epic: claudian-reboot
phase: P8
owner: reviewer
integration_branch: next
created: 2026-05-26
updated: 2026-05-26
---

# Traceability — MCP client (P8)

Regenerable RTM (Constitution Article V). Each REQ-MC/NFR-MC links forward to its
SPEC-MC item(s), the code that satisfies it (`file:line` where load-bearing), the
TEST-MC scenario(s) and where they live, and any manual leg. Base for the diff is
`next` @ `06734d5a` (unchanged) — `git diff next..HEAD` is the entire P8 feature.

**Legend:** `(M)` = manual real-transport leg (coverage-excluded, TEST-MC-M1/M2 + the
real sub-legs TEST-MC-021/022/061/064) — recorded **pending-manual**, NOT green.

## Functional requirements

| REQ | SPEC-MC | Code (`file:line`) | TEST-MC | Test file | Status |
|---|---|---|---|---|---|
| REQ-MC-001 | 001/003/007/009 | `src/domain/chat/mcp/McpConfigCodec.ts:deserializeMcpConfig`; `src/infrastructure/obsidian/VaultMcpConfigStore.ts:35` | TEST-MC-001 | `tests/domain/chat/mcp/McpConfigCodec.test.ts` | automated green |
| REQ-MC-002 | 003/007/010/011 | `McpConfigCodec.ts` (null/empty/unparseable → ok([])); `MockMcpConfigStore.ts`; `LocalStorageMcpConfigStore.ts` | TEST-MC-002; EC-MC-11/12 | `McpConfigCodec.test.ts`, `LocalStorageMcp.test.ts` | automated green |
| REQ-MC-003 | 004/029 | `src/domain/chat/mcp/McpConfigParser.ts:parseClipboardConfig` | TEST-MC-003; EC-MC-3/5 | `tests/domain/chat/mcp/McpConfigParser.test.ts` | automated green |
| REQ-MC-004 | 004/016/029 | `McpConfigParser.ts` (trySync→`Invalid JSON`/`Invalid MCP configuration format`); `src/ui/chat/mcp/McpServerModal.vue:61` | TEST-MC-004; EC-MC-2 | `McpConfigParser.test.ts`, `McpServerModal.test.ts` | automated green |
| REQ-MC-005 | 004/029 | `McpConfigParser.ts:getMcpServerType` (bare-url→http) | TEST-MC-005; EC-MC-6 | `McpConfigParser.test.ts` | automated green |
| REQ-MC-006 | 004/029 | `McpConfigParser.ts:isValidMcpServerConfig` | TEST-MC-006; EC-MC-6 | `McpConfigParser.test.ts` | automated green |
| REQ-MC-007 | 003/007/009 | `McpConfigCodec.ts:serializeMcpConfig` (default-prune + CLI-key preserve); `VaultMcpConfigStore.ts:41` | TEST-MC-007; EC-MC-19/20 | `McpConfigCodec.test.ts` | automated green |
| REQ-MC-010 | 012/016 | `src/application/chat/mcp/McpServerManager.ts:81` | TEST-MC-010 | `tests/application/chat/mcp/McpServerManager.test.ts` | automated green |
| REQ-MC-011 | 012/016 | `McpServerManager.ts:82-87` (empty/dup reject) | TEST-MC-011; EC-MC-4 | `McpServerManager.test.ts`, `McpServerModal.test.ts` | automated green |
| REQ-MC-012 | 012/016 | `McpServerManager.ts:102` | TEST-MC-012 | `McpServerManager.test.ts` | automated green |
| REQ-MC-013 | 012/015 | `McpServerManager.ts:119` | TEST-MC-013 | `McpServerManager.test.ts` | automated green |
| REQ-MC-014 | 012/015 | `McpServerManager.ts:128` | TEST-MC-014 | `McpServerManager.test.ts` | automated green |
| REQ-MC-015 | 012/014/018 | `McpServerManager.ts:72`; `src/application/chat/mcp/buildMcpViewModel.ts` | TEST-MC-015 | `McpServerManager.test.ts`, `buildMcpViewModel.test.ts` | automated green |
| REQ-MC-016 | 012/017 | `McpServerManager.ts:139`; `src/ui/chat/mcp/McpTestModal.vue` (toggle); `src/plugin/modals/McpTestModalHost.ts:53` | TEST-MC-016 | `McpServerManager.test.ts`, `McpTestModal.test.ts` | automated green |
| REQ-MC-020 | 005/008/009 | `src/domain/chat/mcp/parseCommand.ts`; `src/infrastructure/obsidian/SdkMcpClient.ts:172` (StdioClientTransport) | TEST-MC-020/020a; TEST-MC-M1 (M) | `parseCommand.test.ts`, `MockMcpClient.test.ts` | automated green + **(M) pending** |
| REQ-MC-021 | 008/009 | `SdkMcpClient.ts:194-197` (SSEClientTransport over nodeFetch) | TEST-MC-021 (M); TEST-MC-M1 (M) | — | **(M) pending-manual** |
| REQ-MC-022 | 008/009 | `SdkMcpClient.ts:198` (StreamableHTTPClientTransport over nodeFetch) | TEST-MC-022 (M); TEST-MC-M1 (M) | — | **(M) pending-manual** |
| REQ-MC-023 | 008/028 | `SdkMcpClient.ts:174` (`Missing command`); `:156-168` (`Invalid server configuration`) | TEST-MC-023; EC-MC-7/8 | `MockMcpClient.test.ts`, `McpClientPort.test.ts` | automated green (real → M) |
| REQ-MC-030 | 008/028 | `SdkMcpClient.ts:68-89`; `MockMcpClient.ts` | TEST-MC-020/030; TEST-MC-M1 (M) | `MockMcpClient.test.ts` | automated green + **(M) pending** |
| REQ-MC-031 | 008/028 | `SdkMcpClient.ts:75-92` (10s AbortController → `Connection timeout (10s)`) | TEST-MC-031; EC-MC-15 | `MockMcpClient.test.ts` | automated green |
| REQ-MC-032 | 008/028 | `SdkMcpClient.ts:201-212` (`_listToolsLenient` → partial) | TEST-MC-032; EC-MC-14 | `MockMcpClient.test.ts` | automated green |
| REQ-MC-033 | 008/028 | `SdkMcpClient.ts:94-98` (friendly error) | TEST-MC-033; TEST-MC-M1 (M) | `MockMcpClient.test.ts` | automated green + **(M) pending** |
| REQ-MC-034 | 008/011/028 | `src/infrastructure/localstorage/LocalStorageMcpClient.ts` (`isAvailable→false`) | TEST-MC-034; EC-MC-16 | `LocalStorageMcp.test.ts` | automated green |
| REQ-MC-040 | 014/015 | `src/ui/chat/mcp/McpSettingsManager.vue`; `McpServerRow.vue` | TEST-MC-040 | `McpSettingsManager.test.ts`, `McpServerRow.test.ts` | automated green |
| REQ-MC-041 | 014/015/018 | `ChatSurface.vue:278` (`supportsMcpTools` gate); `McpSettingsManager.vue` (`!vm.supported` → render nothing) | TEST-MC-040/041 | `McpSettingsManager.test.ts` | automated green |
| REQ-MC-042 | 016/023 | `src/ui/chat/mcp/McpServerModal.vue`; `src/plugin/modals/McpServerModalHost.ts`; `src/ui/chat/modalSeam.ts` | TEST-MC-042 | `McpServerModal.test.ts`, `modalSeam.ts.test.ts` | automated green |
| REQ-MC-043 | 004/016 | `McpServerModal.vue:61` (paste→parse, needsName) | TEST-MC-043; EC-MC-2/3 | `McpServerModal.test.ts` | automated green |
| REQ-MC-044 | 017/028 | `McpTestModal.vue` (5-state machine); `McpTestModalHost.ts` | TEST-MC-044 | `McpTestModal.test.ts` | automated green |
| REQ-MC-045 | 021 | `src/ui/styles/tokens.css` §4.15 (`--sp-mcp-*`); the five MCP widgets | TEST-MC-045; TEST-MC-M2 (M) | `tests/ui/styles/tokens.test.ts` | automated green + **(M) parity pending** |
| REQ-MC-050 | 014/018 | `src/ui/chat/toolbar/McpSelector.vue` (live list+badge) | TEST-MC-050; EC-MC-8 | `McpSelector.test.ts`, `ChatSurface.mcp.test.ts` | automated green |
| REQ-MC-051 | 012/018 | `McpSelector.vue:onToggleServer`→ ToolbarStrip→ChatComposer→`ChatSurface.vue:299` `onMcpSetEnabled` | TEST-MC-051 | `McpSelector.test.ts`, `ChatSurface.mcp.test.ts` | automated green |
| REQ-MC-052 | 002/006/012/013/020 | `foldEnabledMcpServers.ts`; `tabsStore.ts:618,628` (`_turnQueryOptions` fold); `ChatSurface.vue:156` (binding) | TEST-MC-052/082 | `foldEnabledMcpServers.test.ts`, `ChatSurface.mcp.test.ts:162` | automated green + **(M) real turn** |
| REQ-MC-053 | 006/013 | `src/domain/chat/mcp/getActiveServers.ts` (context-saving ∅ exclusion) | TEST-MC-053; EC-MC-9 | `getActiveServers.test.ts` | automated green |
| REQ-MC-054 | 006/026 | `getActiveServers.ts:collectDisallowedMcpTools` (`mcp__<s>__<t>`) | TEST-MC-054; EC-MC-10 | `getActiveServers.test.ts` | automated green |
| REQ-MC-061 | 005/009/025 | `SdkMcpClient.ts:172-182` (no-shell cmd+args, merged env, `stderr:'ignore'`) | TEST-MC-020a; TEST-MC-061 (M) | `parseCommand.test.ts` | automated (args) + **(M) real spawn pending** |
| REQ-MC-062 | 025 | `VaultMcpConfigStore.ts` (load-or-default only; no auto-discover) | TEST-MC-062; EC-MC-11 | `McpServerManager.test.ts` | automated green |
| REQ-MC-063 | 025 | `McpConfigParser.ts` (JSON parse only, no eval); no separate secret store added | TEST-MC-063 | `McpConfigParser.test.ts` (no-eval), grep (no SecretStorePort) | automated green |
| REQ-MC-064 | 009/025 | `SdkMcpClient.ts:nodeFetch/runNodeRequest` (TLS not weakened) | TEST-MC-064 (M); TEST-MC-M1 (M) | — | **(M) pending-manual** |
| REQ-MC-065 | 020/026 | P7 `ApprovalGateRuntime`/`ApprovalManager` unchanged; `ChatSurface.vue:408` (gate) | TEST-MC-065; TEST-MC-M1 (M) | `tests/ui/chat/ChatSurface.mcp.test.ts:196` | automated green + **(M) real turn** |
| REQ-MC-070 | 015/016/017/018 | `McpSelector.vue` (aria-expanded, toggle aria-label); `McpServerRow.vue`; modals (labelled, Escape) | TEST-MC-070 | the component test files (A legs) | automated green |
| REQ-MC-071 | 020/027 | `McpServerManager.ts:55-64` (load err → notice + empty list); `ChatSurface.vue:292` | TEST-MC-071; EC-MC-13 | `ChatSurface.mcp.test.ts:220` | automated green |
| REQ-MC-072 | 024/027 | `McpServerManager.ts:180-188` (`commit` rollback + `feedback.reportResult`, no config value); `McpServerModal.vue:63` (category message only) | TEST-MC-072; EC-MC-18 | `McpServerManager.test.ts`, `ChatSurface.mcp.test.ts` | automated green |
| REQ-MC-080 | 009/010/011/030 | `src/infrastructure/obsidian/{SdkMcpClient,VaultMcpConfigStore}.ts` coverage-excluded; Mock/LS carry weight | TEST-MC-080; TEST-MC-M1 (M) | `MockMcpClient.test.ts`, `LocalStorageMcp.test.ts` | automated green + **(M) pending** |
| REQ-MC-081 | 007/008/019 | `src/domain/ports/{McpConfigStorePort,McpClientPort}.ts`; `bridge/ports.ts:86-90` (own keys); `useMcpConfigStorePort.ts`/`useMcpClientPort.ts` | TEST-MC-081 | `McpConfigStorePort.test.ts`, `McpClientPort.test.ts`, `useMcp*Port.test.ts` | automated green |
| REQ-MC-082 | 002/013/018/022 | `tabsStore.ts:628` (write only when defined); `ChatTurn.ts` (additive optional); `McpSelector.vue` (empty-seam) | TEST-MC-082; EC-MC-1 | `ChatTurn.ts.test.ts`, `ChatSurface.mcp.test.ts:180` | automated green |

## Non-functional requirements

| NFR | SPEC-MC | Evidence (`file:line`) | TEST-MC | Status |
|---|---|---|---|---|
| NFR-MC-001 | 002/013/022 | guarded fold `foldEnabledMcpServers.ts:23`; `tabsStore.ts:628`; `ChatTurn.ts` additive | TEST-MC-082 | automated green |
| NFR-MC-002 | 005/009/025 | `SdkMcpClient.ts:172-182` no `shell:true`/eval; bounded spawn | TEST-MC-020a; TEST-MC-061 (M) | automated (args) + **(M)** |
| NFR-MC-003 | 024/025/027 | `McpConfigParser.ts` no eval; `McpServerManager.ts` no config in notice; `McpServerModal.vue` category-message only; no SecretStorePort added | TEST-MC-063/072 | automated green |
| NFR-MC-004 | 008/012/027 | `Result`-typed ports; pure transforms total; `SdkMcpClient.test` whole-body guarded | TEST-MC-071/072 | automated green |
| NFR-MC-005 | 007/008/019 | DDD layering; own keys/composables; no aggregate; no Vue `obsidian`/`node:*` (SDK only under `obsidian/**`) | TEST-MC-081; lint | automated green |
| NFR-MC-006 | 009/010/011/030 | real transports coverage-excluded `obsidian/**`; Mock/LS carry weight | TEST-MC-080; coverage gate | automated (coverage verified by parent) |
| NFR-MC-007 | 016/017/023 | no `v-html`/`window.confirm`; modal seam via `src/plugin/**` Obsidian Modal hosts | TEST-MC-042/070 | automated green |
| NFR-MC-008 | 015/017/018 | a11y: `aria-expanded`, labelled toggles, live region | TEST-MC-070; TEST-MC-M2 (M) | automated green + **(M)** |
| NFR-MC-009 | 021 | `tokens.css` §4.15; no hex/raw-Obsidian-var leak | TEST-MC-045; TEST-MC-M2 (M) | automated green + **(M) parity** |
| NFR-MC-010 | 030 | `manifest.json` untouched; SDK externalized, never `build:web` (only `obsidian/**` imports it) | review check + TEST-MC-080 | automated (build verified by parent) |
| NFR-MC-011 | 025 | vault config; no telemetry; no egress beyond configured servers | review check | confirmed by inspection |
| NFR-MC-012 | 008/011/028 | desktop-only; clean degrade on non-Node (`LocalStorageMcpClient` inert) | TEST-MC-034; EC-MC-16 | automated green |

## ADRs

| ADR | Ratifies | Realised by | Status |
|---|---|---|---|
| ADR-MC-001 | CLAR-MC-001/002 | `McpConfigStorePort` + `VaultMcpConfigStore` (vault `.claude/mcp.json`) + pure `McpConfigParser`/`McpConfigCodec` | honoured |
| ADR-MC-002 | CLAR-MC-003/004 | `McpClientPort` + `SdkMcpClient` (coverage-excluded, SDK externalized) | honoured |
| ADR-MC-003 | CLAR-MC-005 | additive `enabledMcpServers?` + `McpServerManager` + guarded fold + unchanged P7 gating | honoured |

## Orphan check

- **REQ with no downstream chain:** none. All 45 REQ-MC + 12 NFR-MC carry SPEC + code + test (manual-only legs flagged pending).
- **Orphan SPEC items:** none — SPEC-MC-001..030 each map to ≥ 1 REQ (spec §0 index) and to landed code.
- **Orphan tests:** none — every TEST-MC-* maps to a REQ/EC (spec §9). The (M) legs are scheduled in `test-plan.md`, not self-claimed.
- **Orphan ADRs:** none — ADR-MC-001..003 each realised in code.

## Pending-manual (NOT green — final epic-review human gate)

TEST-MC-M1 (real stdio/SSE/HTTP + real vault round-trip + real Claude MCP turn + P7 gate),
TEST-MC-M2 (parity screenshots 320/520/720 light+dark), and the real-transport sub-legs
TEST-MC-021/022/061/064. These gate REQ-MC-021/022/064 (no automated leg) and the
real-path side of REQ-MC-020/030/033/052/061/065/080. Recorded pending-manual per the
coverage-exclusion (NFR-MC-006, SPEC-MC-030).
