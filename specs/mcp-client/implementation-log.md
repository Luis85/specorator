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
- **Commit:** `1747e432`.
- **Deviation:** `normalizeDisabledTools` filters by **trimmed**-non-empty on load
  (claudian load only filters `typeof === 'string'` and trims on save); the QA
  contract (TEST-MC-001) + SPEC-MC-003 ("filtered to non-empty strings") asserts a
  whitespace-only `'  '` is dropped on load, so load + save are symmetric. The kept
  values stay verbatim (untrimmed) — only the filter predicate trims. The `delete`
  operator was replaced by rest-spread object-rebuild (the project's `no-restricted-syntax`
  bans `delete`); behaviour-identical to the Claudian `delete file._claudian`.

### T-MC-008 — RED pure `parseCommand` + `getActiveServers`/`collectDisallowedMcpTools` (🧪 qa)

- **Spec/test:** TEST-MC-020a/052/053/054 + EC-MC-7/9/10; SPEC-MC-005/006;
  REQ-MC-020/023/052/053/054/061; NFR-MC-004.
- **Files:** `tests/domain/chat/mcp/parseCommand.test.ts` (new — providedArgs
  passthrough, quote-aware split, empty/whitespace command →`{ cmd:'', args:[] }`,
  single/double quote grouping, never-throws) + `tests/domain/chat/mcp/getActiveServers.test.ts`
  (new — the enabled/disabled/context-saving(∅)-filter active set, the mentioned
  inclusion, the fresh map; `collectDisallowedMcpTools` enabled-only pre-register
  ignoring `contextSaving`, the `mcp__server__tool` trim/dedupe/sort, never-throws).
- **Outcome:** done — RED confirmed (23 failing; `parseCommand.ts` +
  `getActiveServers.ts` are not yet exported from `@/domain/chat/mcp`).
- **Commit:** `13d00eec`.

### T-MC-009 — `parseCommand.ts` + `getActiveServers.ts` + barrel (🔨 dev)

- **Spec/req:** SPEC-MC-005/006; REQ-MC-020/023/052/053/054/061; NFR-MC-002/004.
- **Files:** `src/domain/chat/mcp/parseCommand.ts` (new — `parseCommand` +
  `splitCommandString`, the no-shell quote-aware tokeniser ported from claudian
  `utils/mcp.ts:46/59`; the per-char state machine extracted into a `stepCharacter`
  helper to stay ≤ cap-10 complexity) + `src/domain/chat/mcp/getActiveServers.ts`
  (new — `getActiveServers(servers, mentionedNames)` enabled ∧ (¬contextSaving ∨
  mentioned) + `collectDisallowedMcpTools(servers)` enabled-only trim/dedupe/sort,
  ported from `McpServerManager.getActiveServers:38` + `getAllDisallowedMcpTools:74-94`);
  the barrel `index.ts` re-exports appended.
- **Outcome:** done — the prior RED (TEST-MC-020a/052/053/054 + EC-MC-7/9/10) now
  green (23/23); the full `tests/domain/chat/mcp` suite 73/73; the functions never
  throw; `splitCommandString` invokes no shell/eval.
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 23/23 (the two
  files) + 73/73 (the mcp suite). No `obsidian`/`node:*`/Vue import in
  `src/domain/chat/mcp/**`.
- **Commit:** `bf78a92a`.
- **Deviation:** `splitCommandString`'s single-pass quote/whitespace state machine
  would exceed the cap-10 complexity inline; rather than a complexity-disable (the
  P7 `ApprovalMatcher` precedent) the per-char branch was extracted into a
  `stepCharacter(state, char, push)` helper — behaviour-identical to the verbatim
  Claudian loop, no disable needed.

### T-MC-010 — RED `McpConfigStorePort` + `McpClientPort` + keys + barrels (🧪 qa)

- **Spec/test:** TEST-MC-081 (port-shape leg); SPEC-MC-007/008;
  REQ-MC-001/002/007/020..023/030..034; NFR-MC-005.
- **Files:** `tests/domain/ports/McpConfigStorePort.test.ts` (new — exactly
  `load`/`save`/`exists` Result-typed + own `MCP_CONFIG_STORE_PORT` key + the barrel
  re-export of the port + `ManagedMcpServer`) + `tests/domain/ports/McpClientPort.test.ts`
  (new — exactly `isAvailable`/`test`/`connect`/`listTools`/`callTool`/`disconnect`
  (`test` → `McpTestResult` never throws, the live methods Result-typed) +
  `McpConnection { readonly id }` + own `MCP_CLIENT_PORT` key + the barrel re-exports).
- **Outcome:** done — RED confirmed (`vue-tsc` failed on the missing port modules,
  the missing barrel members, and the missing keys; the unresolved imports fail the
  vitest run).
- **Commit:** `7f59e830`.

### T-MC-011 — `McpConfigStorePort` + `McpClientPort` + keys + barrel re-exports (🔨 dev)

- **Spec/req:** SPEC-MC-007/008; REQ-MC-001/002/007/020..023/030..034; NFR-MC-005/004.
- **Files:** `src/domain/ports/McpConfigStorePort.ts` (new — `load`/`save`/`exists`,
  all `Promise<Result<…>>`, the documented per-method contract: load-or-default
  `ok([])`, codec-round-trip + CLI-key preservation, `exists`); `src/domain/ports/McpClientPort.ts`
  (new — `isAvailable`/`test`/`connect`/`listTools`/`callTool`/`disconnect` +
  `McpConnection`; `test` returns a structured `McpTestResult` and never throws, the
  documented 10s-timeout + SPEC-MC-028 matrix contract); `src/infrastructure/bridge/ports.ts`
  (the `MCP_CONFIG_STORE_PORT` + `MCP_CLIENT_PORT` `InjectionKey`s appended — own
  keys, no aggregate); `src/domain/ports/index.ts` (the barrel re-exports of the two
  ports + `McpConnection` + the MCP DTOs `McpServerConfig`/`McpServerType`/
  `ManagedMcpServer`/`McpTool`/`McpTestResult`/`ParsedMcpConfig`/`EnabledMcpServers`
  appended).
- **Outcome:** done — the prior RED (TEST-MC-081 port-shape leg) now green (4/4);
  the whole `tests/domain/{chat,ports}` surface 196/196. **Deleted-symbol guard green**
  — the new keys / the new port paths resolve clean (no relaxation needed).
- **Verify:** `vue-tsc -p tsconfig.lint.json` 0 errors (whole project); whole-project
  `npm run lint` 0 errors (12 pre-existing warnings); `vitest run` 4/4 (the two port
  files) + 196/196 (domain chat + ports). No `obsidian`/`node:*` import in
  `src/domain/**`.
- **Commit:** `e31d929f`.
- **Deviation:** none.

---

## INFRA batch (T-MC-012..017)

### T-MC-012 — Add `@modelcontextprotocol/sdk` + confirm externals + dep rationale (🔨 dev)

- **Spec/req:** SPEC-MC-030; REQ-MC-080; NFR-MC-010; ADR-MC-002 §3.
- **Files:** `package.json` (the `@modelcontextprotocol/sdk` runtime dependency,
  `^1.29.0`) + `package-lock.json` (resolved) — **already present** in the worktree
  (added when the worktree was provisioned; `git status` clean, no diff). No
  `vite.config.ts` change needed.
- **Outcome:** done (verification + rationale).
- **Verification (by inspection):**
  - `@modelcontextprotocol/sdk@^1.29.0` is in `package.json` `dependencies`; the
    installed copy under `node_modules/@modelcontextprotocol/sdk` reports
    `version 1.29.0`, `license MIT`. `npm install` clean (lockfile committed).
  - `vite.config.ts` `ALL_EXTERNALS` = `OBSIDIAN_EXTERNALS` + `builtinModules` +
    `builtinModules.map(node:…)`. The SDK's Node entry points
    (`node:http`/`https`/`child_process`/`process`/`url`/`stream` …) are all node
    builtins → covered in **both** bare and `node:` forms; **no new external
    needed**. The SDK package itself (`@modelcontextprotocol/sdk`) is NOT in
    `OBSIDIAN_EXTERNALS`, so — exactly like `@anthropic-ai/claude-agent-sdk` — it
    **bundles into the plugin `main.js`** while its node builtins stay external.
  - The SDK is imported **only** under `src/infrastructure/obsidian/**` (the new
    `SdkMcpClient.ts`, T-MC-013). Confirmed by inspection: a project-wide grep for
    `@modelcontextprotocol/sdk` under `src/**` matches **only**
    `src/infrastructure/obsidian/SdkMcpClient.ts`. The standalone `build:web` mounts
    `MockBridge` via `src/ui/main.ts` and never imports `obsidian/**`, so the SDK +
    its `node:*` deps cannot reach the browser graph. (Per the batch directive the
    full `build`/`build:web` chain is run by the orchestrator at the gate, not here.)
- **Dependency rationale (AGENTS.md §8):**
  - **License:** MIT (`node_modules/@modelcontextprotocol/sdk/package.json`).
  - **Maintenance:** authored + maintained by Anthropic — the official Model Context
    Protocol TypeScript SDK; the same vendor as the already-bundled
    `@anthropic-ai/claude-agent-sdk`.
  - **Why-not-existing:** there is no in-tree MCP client/transport; the SDK is the
    only sanctioned implementation of the MCP `Client` + the stdio/SSE/HTTP
    transports the tester (SPEC-MC-009) needs. Hand-rolling the protocol would
    re-implement the wire format the Claude CLI already speaks.
  - **Blast radius:** bundled into `main.js` (desktop plugin only); never reaches
    `build:web`; `node:*` transports stay external; `manifest.json` untouched
    (NFR-MC-010).
- **Commit:** _(see batch close-out)_.
- **Deviation:** the dependency line was already present in the provisioned worktree
  (no `npm install` mutation was required); T-MC-012 reduces to the externals +
  bundle-boundary verification and the AGENTS.md §8 rationale record.

### T-MC-013 — `ObsidianBridge` real vault store + real SDK client (coverage-excluded) (🔨 dev)

- **Spec/req:** SPEC-MC-009; REQ-MC-001/007/020..023/030..034/061..064/080;
  NFR-MC-002/006 (manual leg).
- **Files:**
  - `src/infrastructure/obsidian/VaultMcpConfigStore.ts` (new — the
    `McpConfigStorePort` over `VaultPort` on `.claude/mcp.json`: `load` probes
    `fileExists` then reads the text or `null` → `deserializeMcpConfig`; `save`
    reads the prior text → `serializeMcpConfig(servers, existingRaw)` → `createFolder('.claude')`
    + `writeFile`; `exists` → `fileExists`. Vault file, NOT `data.json`, NOT
    device-local — the pure codec is the round-trip authority, this bridge is thin
    `Result`-typed I/O via `tryAsync`, never throws).
  - `src/infrastructure/obsidian/SdkMcpClient.ts` (new — the `McpClientPort` real SDK
    transports over `@modelcontextprotocol/sdk`: `isAvailable()→true`; `test` builds
    the per-type transport — stdio (`StdioClientTransport`, bounded explicit spawn:
    no-shell `parseCommand` cmd+args, merged `env` + enhanced `PATH`, `stderr:'ignore'`),
    SSE (`SSEClientTransport`) / HTTP (`StreamableHTTPClientTransport`) over a Node
    `http`/`https` fetch shim (no renderer CORS, TLS not weakened) — connects with a
    **10s `AbortController`**, maps the SPEC-MC-028 state model (success / partial /
    timeout / error / unavailable), tears every transport down in `finally`, NEVER
    throws; `connect`/`listTools`/`callTool`/`disconnect` retain a live `Client` keyed
    by an opaque id (the future-non-SDK / Mock seam, OFF the P8 turn-time path)).
  - `src/infrastructure/obsidian/ObsidianBridge.ts` (the `get mcpConfigStore` →
    `new VaultMcpConfigStore(this)` + `get mcpClient` → `new SdkMcpClient()` lazy
    getters appended; `McpConfigStorePort`/`McpClientPort` added to the type imports —
    NOT to the `implements` clause, since the bridge exposes them via getters like the
    other P3–P7 factory/getter ports, not as direct members).
- **File-naming directive honoured:** the files are `VaultMcpConfigStore.ts` +
  `SdkMcpClient.ts` directly under `src/infrastructure/obsidian/` — NOT prefixed
  `ObsidianMcp`, NOT under `src/infrastructure/obsidian/mcp/`, so neither still-active
  ban glob (`@/infrastructure/obsidian/ObsidianMcp*` / `obsidian/mcp/**`) matches.
- **Outcome:** done. Coverage-excluded (`src/infrastructure/obsidian/**`); the SDK is
  imported ONLY here. The behavioural gate is the MANUAL legs **TEST-MC-M1** + the
  real-transport sub-legs **TEST-MC-021/022/061/064** — scheduled in `test-plan.md`,
  NOT self-claimed green by this agent.
- **Verify:** whole-project `vue-tsc -p tsconfig.lint.json` **0 errors**; whole-project
  `npm run lint` **0 errors** (12 pre-existing warnings only); `npm run build` (plugin)
  green — the SDK + the stdio/SSE/HTTP transports **bundle into `main.js`** (1.65 MB,
  4 transport-symbol matches), the node builtins stay external, `styles.css` clean. No
  `obsidian`/SDK/`node:*` symbol leaks past the two files (the bridge imports only the
  classes). `build:web` deliberately NOT run here (the orchestrator runs the full chain
  at the gate; the SDK lives only under `obsidian/**` which `src/ui/main.ts` never imports).
- **Deviation:** the SSE transport keeps a single `eslint-disable-next-line
  @typescript-eslint/no-deprecated` on `new SSEClientTransport` (the SDK marks SSE
  deprecated in favour of streamable-HTTP, but REQ-MC-021 requires SSE for legacy
  servers — parity claudian `createLegacySseTransport`). The Node fetch shim is ported
  from claudian `McpTester.createNodeFetch`, refactored into a top-level `runNodeRequest`
  executor (complexity cap) with braced void-expression callbacks (project lint rules);
  behaviour-identical. `_enhancedPath` mirrors `ObsidianShellExec._enhancedPath` /
  `ClaudeCliChatRuntime._buildEnv` (the established plugin enhanced-PATH posture) rather
  than porting claudian's 460-line `utils/env.ts` `getEnhancedPath` — the same
  no-secret, GUI-sparse-PATH augmentation, scoped to what the spawn needs.

### T-MC-014 — RED scriptable Mock store + client + fake-ports members (🧪 qa)

- **Spec/test:** TEST-MC-001/002/007/030..034/072/080; SPEC-MC-010;
  REQ-MC-002/004/007/030..033/080; NFR-MC-006.
- **Files:** `tests/infrastructure/mock/MockMcpConfigStore.test.ts` (new — the
  `seedMcpServers` pre-populate, the `load`/`save`/`exists` codec round-trip +
  default-pruning, the `setMcpStoreFailMode('load'|'save'|'none')` fault inject, the
  never-throws + the `MockBridge.mcpConfigStore` accessor + stable-instance legs);
  `tests/infrastructure/mock/MockMcpClient.test.ts` (new — `isAvailable→true`, the
  `setClientMode` SPEC-MC-028 matrix success/partial/timeout/error/unavailable, the
  per-server `scriptTestResult` override, the canned
  `connect`/`listTools`/`callTool`/`disconnect`, the never-throws + the
  `MockBridge.mcpClient` accessor legs); `tests/__fakes__/fake-ports.test.ts` (extended
  — the `mcpConfigStore` seedable/round-trip + fail-mode legs + the `mcpClient`
  mode-driven matrix leg).
- **Outcome:** done — RED confirmed (the two Mock modules
  `@/infrastructure/mock/MockMcpConfigStore` / `MockMcpClient` + the
  `mcpConfigStore`/`mcpClient` fake-ports members do not yet exist; 3 test files failed
  on the unresolved imports / undefined members).
- **Commit:** `73b574b4`.

### T-MC-015 — `MockMcpConfigStore` + `MockMcpClient` + `fake-ports` members (🔨 dev)

- **Spec/req:** SPEC-MC-010; REQ-MC-002/004/030..033/080; NFR-MC-006.
- **Files:**
  - `src/infrastructure/mock/MockMcpConfigStore.ts` (new — the scriptable in-memory
    store: holds the `.claude/mcp.json` document text in memory, `seedMcpServers`
    serialises through the **pure `McpConfigCodec`**, `load`/`save` round-trip through
    the same codec (so default-pruning + CLI-key preservation are exercised), `exists`
    reflects whether a document is present, `setMcpStoreFailMode('load'|'save'|'none')`
    forces `Result.err`; total — never throws).
  - `src/infrastructure/mock/MockMcpClient.ts` (new — the scriptable client:
    `isAvailable→true`; `scriptTestResult(serverName,result)` (per-server canned,
    highest precedence); `setClientMode(...)` driving the SPEC-MC-028 `test` matrix
    (success w/ tools / partial empty-tools / `'Connection timeout (10s)'` / friendly
    error / unavailable); canned `connect`/`listTools`/`callTool`/`disconnect` keyed by
    an opaque connection id; total — `test` never throws).
  - `src/infrastructure/mock/MockBridge.ts` (the `mcpConfigStorePort`/`mcpClientPort`
    members + the `get mcpConfigStore`/`get mcpClient` accessors appended, mirroring
    `approvalRuleStore`).
  - `tests/__fakes__/fake-ports.ts` (the `mcpConfigStore` + `mcpClient` members +
    `FakePorts` types appended, wired off the same `MockBridge`).
- **Outcome:** done — the prior RED (the Mock store seed/codec-round-trip/fail-inject +
  the scriptable client matrix + the `fake-ports` members) now green (39/39 across the
  three files); `MockBridge` 10/10 unchanged. `setMcpStoreFailMode`/`setClientMode`
  drive the paths deterministically.
- **Verify:** whole-project `vue-tsc -p tsconfig.lint.json` **0 errors**; whole-project
  `npm run lint` **0 errors** (12 pre-existing warnings); `npx vitest run` 39/39 (the
  three files) + 10/10 (`MockBridge`). No `node:*`/`obsidian` import in
  `src/infrastructure/mock/**`; total — never throws.
- **Deviation:** none.

## DOMAIN batch (T-MC-001..011) — close-out

All eleven DOMAIN-batch tasks executed in strict TDD order (RED qa → green dev), one
commit per task (T-MC-001 the doc-only baseline). The single domain interface change
— the purely additive optional `ChatRuntimeQueryOptions.enabledMcpServers?`
(SPEC-MC-002) — kept the whole-project build green with **no `implements ChatRuntimePort`
break** (the runtimes read the optional field; no companion-stub, no fan-out). The two
new ports (`McpConfigStorePort`/`McpClientPort`) are new interfaces with no prior impl,
so adding them + their keys + barrel re-exports broke nothing. The pure DOMAIN slice
landed: `McpTypes` (the config union + `ManagedMcpServer`/`McpTool`/`McpTestResult`/
`ParsedMcpConfig`/`EnabledMcpServers`/`DEFAULT_MCP_SERVER`), the PURE `McpConfigParser`
(the four-format truth table + `getMcpServerType` + `isValidMcpServerConfig`), the PURE
`McpConfigCodec` (load-or-default + default-pruning + CLI-key preservation), the PURE
`parseCommand`/`splitCommandString` (no-shell tokeniser), the PURE `getActiveServers` +
`collectDisallowedMcpTools` — all ported verbatim from `D:\Projects\claudian-main` with
Claudian throws converted to `Result.err` (ADR-004); all pure + total (never throw).

**Additivity proven:** a P7-shaped `ChatRuntimeQueryOptions` (no `enabledMcpServers`)
serialises byte-identically to P7 (TEST-MC-082); `externalContextPaths?` stays EXCLUDED;
`PreparedChatTurn.mcpMentions` stays the empty `Set`.

**Final gate over the batch surface:** `vue-tsc -p tsconfig.lint.json` **0 errors**
(whole project), whole-project `npm run lint` **0 errors** (12 pre-existing warnings
only), `npx vitest run tests/domain/{chat,ports}` **196/196 green**. No
`obsidian`/`node:*`/Vue import under `src/domain/chat/mcp/**` or `src/domain/ports/Mcp*`;
the parser/codec/`parseCommand`/`getActiveServers` are pure + total; the `McpClientPort.test`
contract is documented to return a structured result and never throw. **Deleted-symbol
guard green** — the new keys + the new paths resolve clean (no relaxation needed); the
Obsidian-infra file-naming directive (`VaultMcpConfigStore.ts`/`SdkMcpClient.ts`, never
`ObsidianMcp…`/`obsidian/mcp/`) is recorded in `test-plan.md` for the INFRA batch.
`styles.css` untouched (no build run). The INFRA batch (T-MC-012..017: the SDK dep-add +
the three-bridge store/client) onward is out of this batch's scope.

## APPLICATION batch (T-MC-018..021)

### T-MC-018 — RED `McpServerManager` lifecycle over the scriptable Mock store (🧪 qa)

- **Spec/req:** SPEC-MC-012; REQ-MC-010..016/050/051/052..054/071/072; NFR-MC-004;
  EC-MC-4/8/9/10/18.
- **Files:**
  - `tests/application/chat/mcp/McpServerManager.test.ts` (new — 23 specs over the
    scriptable `MockMcpConfigStore`: load (seeded list / load-or-default / err →
    `showInfo` + keep `[]`), add (DEFAULT_MCP_SERVER `enabled` + draft `contextSaving`;
    await-save proven via a fresh-manager reload; empty + duplicate-name reject with the
    existing server unchanged; save-err → `showError` + rollback to `[]`), edit/remove/
    setEnabled/setToolDisabled (locate-by-name, missing → `err`, save-err rollback),
    getEnabledCount, getActiveServers(∅), getEnabledMcpServers(∅ → `undefined` /
    non-empty fold with `disallowedTools`), and the never-throws-across-the-boundary
    path).
- **Outcome:** done (RED) — the test module fails to resolve
  `@/application/chat/mcp/McpServerManager` (it imports `foldEnabledMcpServers`, whose
  RED is T-MC-020), the documented RED signal.
- **Commit:** `9c85ef19`.
- **Verify:** `npx vitest run tests/application/chat/mcp/McpServerManager.test.ts` → 1
  file failed, no tests (unresolved import) — RED confirmed.
- **Deviation:** none.

### T-MC-020 — RED `foldEnabledMcpServers` + `buildMcpViewModel` (🧪 qa)

- **Spec/req:** SPEC-MC-013/014; REQ-MC-015/040/050/051/052/082; NFR-MC-001;
  EC-MC-1/8/9/13.
- **Files:**
  - `tests/application/chat/mcp/foldEnabledMcpServers.test.ts` (new — empty list →
    `undefined`, all-disabled → `undefined`, all-context-saving(∅) → `undefined`, a
    non-empty active set → `{ servers, disallowedTools }`, the disallowed pre-registration
    over all enabled servers even when only one is active, never-throws).
  - `tests/application/chat/mcp/buildMcpViewModel.test.ts` (new — `supported` gate,
    `kind` empty-seam-vs-live, the `McpServerVm` stdio/sse/http transport mapping,
    `enabledCount`, never-throws).
- **Outcome:** done (RED) — both modules fail to resolve their `@/application/chat/mcp/*`
  imports (the transforms do not yet exist), the documented RED signal.
- **Commit:** `5facd46e`.
- **Verify:** `npx vitest run` the two files → 2 files failed, no tests (unresolved
  imports) — RED confirmed.
- **Deviation:** none.

### T-MC-021 — `foldEnabledMcpServers.ts` + `buildMcpViewModel.ts` (pure) (🔨 dev)

- **Spec/req:** SPEC-MC-013/014; REQ-MC-015/040/050/051/052/082; NFR-MC-001/005.
- **Files:**
  - `src/application/chat/mcp/foldEnabledMcpServers.ts` (new — the guarded fold:
    `getActiveServers(servers, mentioned)`; an empty active map → `undefined` (the
    surface omits `enabledMcpServers` → byte-identical P7); a non-empty map →
    `{ servers, disallowedTools: collectDisallowedMcpTools(servers) }` (the disallowed
    list pre-registered over all enabled servers); pure + total — never throws).
  - `src/application/chat/mcp/buildMcpViewModel.ts` (new — the `McpServerVm` +
    `McpViewModel` `{ kind, servers, enabledCount, supported }`; `kind = 'empty-seam'`
    at 0 servers / `'live'` at ≥ 1; each server mapped via `getMcpServerType`;
    `enabledCount` = the enabled count; DTO-only, no `providerId` branch; pure + total).
- **Outcome:** done — the prior RED (T-MC-020, TEST-MC-015/040/050/052/082 +
  EC-MC-1/8/9/13) now green: 12/12 across the two files.
- **Commit:** `b783c83b`.
- **Verify:** `npx vitest run` the two files **12/12 green**; whole-project
  `vue-tsc -p tsconfig.lint.json` **0 errors**; whole-project `npm run lint` **0 errors**
  (the only remaining type/lint findings at this point were the not-yet-implemented
  `McpServerManager.test.ts` leftovers from T-MC-018 RED). No `obsidian`/`node:*`/Vue
  import; no `providerId` branch; pure + total.
- **Deviation:** none. (Implemented before T-MC-019 to satisfy the manager's dependency
  on `foldEnabledMcpServers` — T-MC-019 `Depends on: T-MC-021` — so each commit stays
  type-valid; the RED-before-green discipline is preserved within each pair.)

### T-MC-019 — `McpServerManager.ts` lifecycle use case + `McpServerDraft` (🔨 dev)

- **Spec/req:** SPEC-MC-012; REQ-MC-010..016/050/051/052..054/071/072; NFR-MC-003/004.
- **Files:**
  - `src/application/chat/mcp/McpServerManager.ts` (new — the `McpServerDraft` interface +
    the `McpServerManager` class over `McpConfigStorePort` + `FeedbackService`:
    `load`/`getServers`/`getEnabledCount`; `add` (reject empty/duplicate; apply
    `DEFAULT_MCP_SERVER.enabled` + draft `contextSaving`); `edit`/`remove`/`setEnabled`/
    `setToolDisabled` (locate-by-name, missing → `err`); a private `commit(next, op)`
    that **awaits** `store.save` before resolving and rolls the in-memory list back +
    `feedback.reportResult(...)` (`showError`) on a save `err`; `getActiveServers(∅)` →
    the pure SPEC-MC-006 fold; `getEnabledMcpServers(∅)` → `foldEnabledMcpServers`
    (`undefined` when empty). A load `err` degrades to `feedback.info` (`showInfo`) + an
    empty list, returning `ok([])` — never crashes. Result-returning, never throws across
    the port boundary; logs/notifies no secret/config value).
- **Outcome:** done — the prior RED (T-MC-018, TEST-MC-010..016/050/051/052..054/072 +
  the EC-MC legs) now green: 23/23.
- **Commit:** `ffa6b8b5`.
- **Verify:** `npx vitest run tests/application/chat/mcp/McpServerManager.test.ts` **23/23
  green**; whole-project `vue-tsc -p tsconfig.lint.json` **0 errors**; whole-project
  `npm run lint` **0 errors** (12 pre-existing warnings, none in `src/application/chat/mcp/**`);
  `npx vitest run tests/application/chat/mcp/` **35/35** across the three files. No
  `obsidian`/`node:*`/Vue import; never throws across the port boundary.
- **Deviation:** none.

## APPLICATION batch (T-MC-018..021) — close-out

All four APPLICATION-batch tasks executed RED-first (qa → dev), one commit per task. The
strict commit order respected the dependency graph (`T-MC-019 Depends on T-MC-021`): the
two RED tasks first (T-MC-018, T-MC-020), then the pure transforms (T-MC-021), then the
manager (T-MC-019) — so every commit is type-valid while the RED-before-green discipline
holds within each pair. The application slice landed: the `McpServerManager` lifecycle
use case (await-save + dup-reject + rollback-on-save-err + load-degrade + the ∅-mention
active-set/fold delegates), the PURE guarded `foldEnabledMcpServers` (empty → `undefined`
so a no-servers / all-disabled / all-context-saving(∅) turn stays byte-identical to P7),
and the PURE `buildMcpViewModel` (empty-seam-vs-live + `enabledCount`, DTO-only, no
`providerId` branch). The manager is `Result`-returning and never throws across the port
boundary; the two transforms are pure + total.

**Final gate over the batch surface:** whole-project `vue-tsc -p tsconfig.lint.json`
**0 errors**; whole-project `npm run lint` **0 errors** (12 pre-existing warnings only,
none in `src/application/chat/mcp/**`); `npx vitest run tests/application/chat/mcp/`
**35/35 green**. No `obsidian`/`node:*`/Vue import under `src/application/chat/mcp/**`;
no `providerId` branch; `styles.css` untouched (no build run). The UI batch (T-MC-022
onward: the composables + the settings/modal/selector components + the wiring) is out of
this batch's scope.

---

## UI batch (T-MC-022..033)

### T-MC-022 / T-MC-023 — `useMcpConfigStorePort` + `useMcpClientPort`

- **Files:**
  - `tests/ui/composables/useMcpConfigStorePort.test.ts` (new, 1-44) — RED.
  - `tests/ui/composables/useMcpClientPort.test.ts` (new, 1-44) — RED.
  - `src/ui/composables/useMcpConfigStorePort.ts` (new, 1-23) — green.
  - `src/ui/composables/useMcpClientPort.ts` (new, 1-23) — green.
- **Spec:** SPEC-MC-019, REQ-MC-081, NFR-MC-005 (TEST-MC-081 composable leg).
- **Description:** Two composables mirroring `useApprovalRuleStorePort`/`useVaultPort`
  inject-or-throw: each `inject`s its own key (`MCP_CONFIG_STORE_PORT` /
  `MCP_CLIENT_PORT`), returns it when provided, throws a clear "was not provided" error
  when absent. One-port-one-composable, no aggregate.
- **Outcome:** done — the prior RED (TEST-MC-081 composable leg) now green: 4/4.
- **Commits:** RED `T-MC-022`; green `T-MC-023` (SHAs below in close-out).
- **Verify:** `npx vitest run tests/ui/composables/useMcpConfigStorePort.test.ts
  tests/ui/composables/useMcpClientPort.test.ts` **4/4 green**; whole-project
  `vue-tsc -p tsconfig.lint.json` **0 errors**; whole-project `npm run lint` **0 errors**
  (12 pre-existing warnings only). No `obsidian`/`node:*` import under `src/ui/**`; no
  aggregate `usePorts`.
- **Deviation:** none.

### T-MC-024 / T-MC-025 — `modalSeam.ts` MCP launchers (`OpenMcpServerModalFn` / `OpenMcpTestModalFn`)

- **Files:**
  - `tests/ui/chat/modalSeam.ts.test.ts` (extended: imports + two probe helpers +
    two describe blocks) — RED.
  - `src/ui/chat/modalSeam.ts` (4-5 imports; appended ~140-178 the two fn types + the
    two keys + `useOpenMcpServerModal`/`useOpenMcpTestModal`) — green.
- **Spec:** SPEC-MC-023, REQ-MC-042/044, NFR-MC-007 (TEST-MC-042/044 seam legs).
- **Description:** Appended the P8 MCP modal-seam launchers, additive to the P3/P4/P5
  handles: `OpenMcpServerModalFn = (input?: McpServerDraft) => Promise<McpServerDraft |
  null>` (add when `input` absent, edit when present; `null` on dismiss) +
  `OpenMcpTestModalFn = (server) => Promise<void>`; the `OPEN_MCP_SERVER_MODAL` /
  `OPEN_MCP_TEST_MODAL` keys; `useOpenMcpServerModal()` falling back to AUTO-DISMISS
  (`null`), `useOpenMcpTestModal()` to a no-op resolve. The P3/P4/P5 handles stay
  byte-identical.
- **Outcome:** done — the prior RED (TEST-MC-042/044 seam legs) now green; 12/12 (the 8
  P3/P4/P5 legs unchanged + 4 new).
- **Commits:** RED `T-MC-024`; green `T-MC-025` (SHAs in close-out).
- **Verify:** `npx vitest run tests/ui/chat/modalSeam.ts.test.ts` **12/12 green**;
  whole-project `vue-tsc` **0 errors**; whole-project `npm run lint` **0 errors**. No
  `obsidian` import under `src/ui/**`.
- **Deviation:** none.
