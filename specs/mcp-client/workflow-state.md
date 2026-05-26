---
feature: mcp-client
area: MC
current_stage: implementation
status: active
last_updated: 2026-05-26
last_agent: dev (implementation — DOMAIN batch T-MC-001..011 complete; the pure types/parser/codec/parseCommand/getActiveServers + the additive enabledMcpServers? + the two ports/keys/barrels; INFRA batch onward pending)
epic: claudian-reboot
phase: P8
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.7/§4 P8 + audits + claudian-main stand in, mirrors P1-P7)
  research.md: skipped
  requirements.md: accepted (PRD-MC-001; CLAR-MC-001..005 resolved-by-recommendation → P8 architect ADRs, notably McpConfigStorePort vault-file + McpClientPort transport contract)
  design.md: complete (DESIGN-MC-001; Parts A/B/C; ADR-MC-001 McpConfigStorePort vault file + ADR-MC-002 McpClientPort transport seam + ADR-MC-003 enabledMcpServers? + P7 approval composition — all accepted)
  spec.md: complete (SPEC-MC-001; 30 spec items SPEC-MC-001..030 across domain/infra/app/ui/styles/cross-cutting; EC-MC-1..20; TEST-MC-001..082 + 020a + M1/M2; REQ-MC ↔ SPEC-MC ↔ TEST-MC coverage table — all 45 REQ-MC + 12 NFR-MC chained; the five design open items resolved in §0)
  tasks.md: complete (TASKS-MC-001; 42 tasks T-MC-001..043, TDD-ordered RED(qa)→impl(dev), 7 batches DOMAIN→INFRA→APP→UI→STYLES→WIRE-IN→GATE; dep graph + parallel batches + critical path + full SPEC/REQ/NFR/TEST coverage table; NO guard-relax needed; @modelcontextprotocol/sdk dep-add = T-MC-012; manual legs T-MC-041/042 (M1/M2))
  implementation-log.md: in-progress (DOMAIN batch T-MC-001..011 complete; INFRA/APP/UI/STYLES/WIRE-IN/GATE batches T-MC-012..043 pending)
  test-plan.md: in-progress (guard-verification + Obsidian-infra file-naming directive + manual legs TEST-MC-M1/M2 + TEST-MC-021/022/061/064 scaffolded; DOMAIN-batch automated legs recorded)
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — mcp-client (P8)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted (PRD-MC-001) |
| 4. Design | `design.md` | complete (DESIGN-MC-001; ADR-MC-001..003 accepted) |
| 5. Specification | `spec.md` | complete (SPEC-MC-001; 30 items, full coverage) |
| 6. Tasks | `tasks.md` | complete (TASKS-MC-001; 42 tasks T-MC-001..043, TDD-ordered, full coverage) |
| 7. Implementation | `implementation-log.md` + code | in-progress (DOMAIN batch T-MC-001..011 complete; INFRA→GATE pending) |
| 8. Testing | `test-plan.md`, `test-report.md` | in-progress (test-plan scaffolded; test-report pending) |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P8 (MCP client)

P0-P7 merged to `next` (P7 approvals-security #448 / 06734d5a). P8 = the in-app MCP client +
config + tester + settings UI on the P1-P7 surface. **Claude in-app vault-managed MCP** (§3.7 —
"Claude manages vault MCP in-app; Codex uses CLI-managed config"; MCP for non-Claude providers is
out, charter §6b line 258).

**Scope (charter §4 P8 row + §3.7):** `McpServerManager` (server lifecycle — add/remove/enable/
connect/disconnect), `McpConfigParser` (parse + validate the MCP server config), `McpTester` (test a
server connection → success/error), transports **stdio / SSE / HTTP**, and the settings UI
(`McpServerModal` add/edit a server, `McpSettingsManager` the list/manage surface, `McpTestModal` the
test result). Backs the **P6 MCP-selector seam** (P6 shipped it visible-disabled "MCP servers arrive in
a later release"; P8 makes it list + select enabled servers). CSS: `mcp-modal`/`mcp-settings`/
`mcp-selector` (charter §3.10) → `--sp-*`.

**Key P8 ADRs (architecturally load-bearing — charter §6a/§6b line 266):**
- **`McpClientPort`** — the MCP client/transport seam (connect/list-tools/call-tool/disconnect over
  stdio/SSE/HTTP). stdio = subprocess spawn (security surface, like `ShellExecPort`); SSE/HTTP = network.
  The real transports live in `src/infrastructure/obsidian/**` (coverage-excluded → manual legs); Mock
  scriptable + LS inert carry the automated weight. Decide the narrow contract (no aggregate).
- **`McpConfigStorePort` + MCP-config source/shape** — where the server list persists. Claude manages
  vault MCP in-app → likely a vault file (e.g. the project `.mcp.json` Claude CLI reads) OR device-local
  per CHARTER-REQ-SET. **Tension:** Claude CLI expects a specific config location/format; CHARTER-REQ-SET
  says device-scoped state is device-local. Resolve: is the MCP server list a vault artifact (shared,
  Claude-CLI-readable) or device-local? The architect decides + files the ADR (may differ from the
  approval-rules device-local call because Claude CLI must READ the MCP config). NO secret in the config
  in plain text — server auth/secrets via `SecretStorePort` (CHARTER-REQ-SEC) if any.
- How the MCP tools reach a turn (the runtime's MCP-enabled-servers seam) + how the P6 MCP selector
  reads the enabled-server list (additive — P0-P7 byte-identical).

**Out of P8 (later phases):** Codex/Opencode providers + their MCP/CLI-managed config (P9); settings
shell polish (P10). P8 builds Claude in-app MCP + the SEAMS.

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user state→device-local (BUT MCP config may be a Claude-CLI-readable vault file —
ADR decides); NO backwards compat; DDD inward imports + narrow ports + 3 bridges; Vue never imports
`obsidian`; no `innerHTML`/`v-html`/`window.confirm` (Obsidian `Modal`/modal-seam for the MCP modals);
`<script setup>`; `Result<T,E>`; tests mirror `src/` + `data-testid` POs; coverage 80/70/80/80;
perceptual `--sp-*` parity; identity stays Specorator; WCAG 2.2 AA; manifest untouched; CI SHA-pinned +
actionlint. VERIFY GATE (`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive, /goal 2026-05-26):** AUTONOMOUS DRIVE the FULL remaining epic
(P8→P12) via dedicated subagents in loops — no per-phase human checkpoint; self-parity-review vs
claudian; merge each phase to `next` after a green gate + green CI; deploy to `D:/TestVault` after each
merge. Manual-Obsidian + parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.7/§6a/§6b/§4 P8 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (`McpServerManager`,
`McpConfigParser`, `McpTester`, the stdio/SSE/HTTP transports, `McpServerModal`/`McpSettingsManager`/
`McpTestModal`, the `mcp-modal`/`mcp-settings`/`mcp-selector` css).

## Hand-off notes

```
2026-05-26 (orchestrator): P8 bootstrapped on feature/mcp-client (off next; P0-P7 merged).
                          Scope = charter §3.7 in-app Claude MCP — manager/parser/tester +
                          stdio/SSE/HTTP transports + settings UI; back the P6 MCP-selector seam.
                          Autonomous full-epic drive. Next: /spec:requirements (pm) grounded in
                          charter §3.7/§6a-b + audits + the claudian McpServerManager/McpConfigParser/
                          McpTester/transport/modal sources. KEY decisions for pm/architect: the
                          McpClientPort transport contract (stdio spawn security surface), the
                          McpConfigStorePort + config source (vault Claude-CLI-readable vs device-local
                          — resolve the CHARTER-REQ-SET tension), and how enabled MCP servers reach the
                          runtime + the P6 selector (additive). Claude-only (non-Claude MCP is P9+, out).

2026-05-26 (pm): Stage 3 ACCEPTED. Wrote PRD-MC-001 (specs/mcp-client/requirements.md):
                 36 EARS REQ-MC grouped — config/parse 001-007 · server-manager lifecycle 010-016 ·
                 transports 020-023 · tester 030-034 · settings UI 040-045 · selector+runtime 050-054 ·
                 security 061-065 · a11y+additivity 070-082 — + 12 NFR-MC + metrics + release criteria.
                 Each REQ carries Given/When/Then, MoSCoW, a 1:1 claudian path, and a future TEST-MC id.
                 GROUNDED IN CLAUDIAN:
                 - Config SOURCE = a VAULT FILE `.claude/mcp.json` (McpStorage.ts:9 MCP_CONFIG_PATH) —
                   an `mcpServers` map + a `_claudian` per-server metadata sidecar (enabled/contextSaving/
                   disabledTools/description); the Claude Agent-SDK/CLI reads this path. Four paste formats
                   parsed (McpConfigParser.parseClipboardConfig); malformed → Result.err, never crash.
                 - TRANSPORTS = stdio / SSE / HTTP, ALL THREE P8-BACKED for Claude (McpTester.ts branches);
                   bare-url defaults to http (getMcpServerType). Tester = 10s AbortController timeout,
                   PARTIAL-SUCCESS (connect ok but listTools fails → success+empty tools), friendly error
                   map, Node http/https fetch to bypass renderer CORS (createNodeFetch) while keeping SDK
                   transports. Real transports + the MCP SDK = coverage-excluded infra (manual leg M1).
                 - SELECTOR + RUNTIME = P6 McpSelector seam (visible-empty "coming later") now LISTS +
                   TOGGLES enabled servers + count badge; an enabled server's active set reaches the turn
                   via the ADDITIVE ChatRuntimeQueryOptions.enabledMcpServers? (currently EXCLUDED in
                   ChatTurn.ts:51 — introduced additively); disabledTools → mcp__<server>__<tool> disallowed.
                 - SECURITY = stdio spawns bounded+explicit ({...process.env,...config.env,PATH:enhanced},
                   parsed cmd+args, stderr:'ignore', NO shell-eval); user explicitly adds every server (no
                   auto-discover); config is inert data, never eval-ed, no plaintext secret duplicated by P8;
                   an MCP tool call is GATED by the P7 ApprovalManager (setApprovalCallback seam) — not
                   auto-trusted; a malformed/unreachable server degrades gracefully (never crashes chat).
                 ADDITIVITY: with NO MCP server configured, P1-P7 BYTE-IDENTICAL (REQ-MC-082, NFR-MC-001) —
                 the P6 selector keeps its visible-empty seam; the query emits no enabledMcpServers.
                 CONFIG-SOURCE RECOMMENDATION (CLAR-MC-001 → McpConfigStorePort ADR): VAULT FILE, not
                 device-local. Diverges from ADR-PSR-002 (device-local SettingsPort) + P7 device-local
                 ApprovalRuleStorePort BECAUSE the MCP list is project/vault config the Claude CLI must READ
                 from a known path, not a personal device pref. Tension flagged (vault file = git-shared) —
                 acceptable for non-secret server config; the auth/secret tension → CLAR-MC-004 (no plaintext
                 secret managed by P8; SecretStorePort follow-up ≈P10).
                 CLAR-MC-001..005 resolved-by-recommendation (autonomous; architect ADRs ratify):
                 001 config source = vault `.claude/mcp.json` · 002 keep the `.claude/mcp.json` path
                 (Claude-CLI-readable, not Specorator-branded) · 003 bundle @modelcontextprotocol/sdk +
                 record rationale (AGENTS.md §8) · 004 server auth stays in the user-authored config, no new
                 plaintext secret store, SecretStorePort deferred · 005 additive enabledMcpServers? =
                 getActiveServers(mentionedNames) with an empty mention set for P8 (composer @mention MCP
                 cross-link = NG3, deferred).
                 NON-GOALS: non-Claude MCP (NG1, charter §6b L258) · author/bundle MCP servers (NG2) ·
                 composer @mention-MCP cross-link (NG3) · bespoke running-tool UI (NG4) · secret editor (NG5)
                 · settings-shell/i18n/a11y polish P10-12 (NG6) · legacy migration (NG7, CHARTER-REQ-FRESH).
                 HAND-OFF → /spec:design (architect): file the McpConfigStorePort ADR (vault `.claude/mcp.json`
                 + `_claudian` sidecar round-trip + 3-bridge backing — ratify CLAR-MC-001/002) FIRST, plus the
                 McpClientPort ADR (the narrow transport contract testServer/listTools over stdio/SSE/HTTP —
                 stdio = subprocess security surface like ShellExecPort; real transports coverage-excluded
                 infra, Mock scriptable canned, LS inert — ratify CLAR-MC-003/004) and the additive
                 enabledMcpServers? runtime-seam shape (CLAR-MC-005). Design the pure-domain config parse/
                 validate (parseClipboardConfig→Result, getMcpServerType, isValidMcpServerConfig), the
                 McpServerManager application logic (add/edit/remove/enable/disable, getActiveServers +
                 disallowed-tools), the settings UI (McpServerModal add/edit + McpSettingsManager list +
                 McpTestModal result, no v-html/window.confirm, --sp-* mcp-modal/mcp-settings/mcp-selector
                 slice), the P6-selector list+toggle, and the P7 approval-gating wiring for MCP tools. Part A
                 UX + Part B visual parity per charter §5. CLAR-MC-001..005 do not block the architect.

2026-05-26 (architect): Stage 4 COMPLETE. Wrote DESIGN-MC-001 (specs/mcp-client/design.md, Parts A
                 UX / B UI / C Architecture) + filed ADR-MC-001..003 (docs/adr/, status ACCEPTED, README
                 index rows added). All five CLARs ratified.
                 ADR-MC-001 (CLAR-MC-001/002): McpConfigStorePort (load/save/exists, Result-typed) over
                   the VAULT file `.claude/mcp.json` (the Claude-CLI-readable path + `_claudian` metadata
                   sidecar) + a PURE McpConfigParser (the 4 paste formats → Result, throws→Result.err) +
                   a pure config codec (non-default `_claudian` pruning on save). DIVERGES from the
                   device-local ADR-PSR-002/ADR-AS-001 precedent BECAUSE the Claude CLI must read the
                   config from a known vault path — justified in the ADR. No migration; no plaintext-
                   secret duplication (SecretStorePort editor deferred, CLAR-MC-004).
                 ADR-MC-002 (CLAR-MC-003): McpClientPort (isAvailable/test/connect/listTools/callTool/
                   disconnect; test returns a structured McpTestResult and NEVER throws — success/partial/
                   timeout(10s)/error/unavailable; live methods Result-typed). The real stdio (bounded
                   explicit spawn = ShellExecPort posture, parsed cmd+args, merged env, stderr:'ignore',
                   no shell-eval) / SSE / HTTP (Node http/https fetch, no TLS weakening) transports live
                   in COVERAGE-EXCLUDED src/infrastructure/obsidian/** over @modelcontextprotocol/sdk.
                   EXTERNALS/DEP DECISION: the SDK is a NEW runtime dep — bundled into the plugin main.js
                   + covered by the existing vite.config ALL_EXTERNALS (builtinModules + node: forms, same
                   as @codemirror/* + the agent-sdk); the standalone build:web NEVER sees it because the
                   real port lives only in obsidian/** which src/ui/main.ts (MockBridge) never imports.
                   Rationale recorded per AGENTS.md §8 (only sanctioned MCP client, MIT, Anthropic-
                   maintained). Mock scriptable (canned test/listTools/callTool + failure/timeout/partial
                   injection) + LS inert (isAvailable→false) carry the automated weight.
                 ADR-MC-003 (CLAR-MC-005): the EXCLUDED ChatRuntimeQueryOptions.enabledMcpServers?
                   (ChatTurn.ts:51) introduced ADDITIVELY = { servers: Record<name,config>; disallowedTools }
                   computed by a McpServerManager APPLICATION use case (lifecycle add/edit/remove/setEnabled/
                   setToolDisabled over the two ports + a PURE getActiveServers/disallowed-tools fold, empty
                   mention-set default per NG3) and folded by a guarded foldEnabledMcpServers (written ONLY
                   when non-empty → no-servers turn byte-identical to P7, REQ-MC-082/NFR-MC-001). The P6
                   McpSelector expands to list + toggle the managed servers + count badge (buildMcpViewModel),
                   keeping the P6 empty seam at 0. An MCP tool call routes through the UNCHANGED tool-agnostic
                   P7 ApprovalManager.decide ({toolName:'mcp__<server>__<tool>', actionPattern}, mode) — NOT
                   auto-trusted, NO MCP special-case in the gate, NO providerId branch. Disabled tools are in
                   the disallowed list so they never reach the runtime callable.
                 COMPONENT+MODAL INVENTORY (all new except McpSelector changed): McpSettingsManager.vue +
                   McpServerRow.vue (list surface, capability-gated on supportsMcpTools), McpServerModal.vue
                   (add/edit — name required/unique, config JSON/paste, parse-error) + McpTestModal.vue
                   (running→success+per-tool toggles/partial/timeout/error/unavailable) via the modal SEAM
                   (Obsidian Modal hosts in the plugin layer, Vue never imports obsidian, no v-html/
                   window.confirm), McpSelector.vue expanded. Co-located data-testid POs; mcp-* → --sp-*
                   token slice; en+de microcopy.
                 NEW PORTS: McpConfigStorePort + McpClientPort, own InjectionKeys (MCP_CONFIG_STORE_PORT /
                   MCP_CLIENT_PORT) + composables, one consumer each, no aggregate (ADR-008). New domain:
                   McpTypes/McpConfigParser/McpConfigCodec/parseCommand/getActiveServers (all pure) +
                   ChatRuntimeQueryOptions.enabledMcpServers? (additive). New application: McpServerManager,
                   foldEnabledMcpServers, buildMcpViewModel. fake-ports grows mcpConfigStore + mcpClient.
                 REQUIREMENTS NOTE: two items flagged slightly OVER-specified (non-blocking) — (1) the
                   McpClientPort 5-verb scope vs the SDK performing the turn-time tool call from the
                   advertised mcpServers set (the design keeps all 5 verbs but marks callTool off the P8
                   turn-time critical path — pin in spec.md so the dev does not double-build a call path);
                   (2) REQ-MC-053 context-saving pre-registration detail while the @mention trigger is NG3
                   (the design wires the gating with mentionedNames always = ∅ in P8 — pin in spec.md).
                 HAND-OFF → /spec:specify (architect→spec author): turn DESIGN-MC-001 Parts C + the three
                   ADRs into SPEC-MC-* contracts — the McpConfigStorePort/McpClientPort method contracts
                   (signatures, pre/post, errors, Result), the EnabledMcpServers DTO + the guarded fold
                   byte-identical proof, the parser's 4-format + Result.err contract, the McpServerManager
                   lifecycle + getActiveServers(∅) contract, the McpTestResult state semantics (10s/partial/
                   unavailable), the modal-seam fn signatures (OpenMcpServerModalFn/OpenMcpTestModalFn), the
                   P7-approval composition (no new gate surface), the mcp-* token map, en+de keys, the
                   coverage-exclusion + manual real-transport leg TEST-MC-M1, and the open spec-level items
                   (concurrency/ordering, the _claudian codec round-trip fidelity preserving CLI-written
                   keys, the callTool turn-time-vs-tester split, mentionedNames=∅). CLAR-MC-001..005 do not
                   block the spec author.

2026-05-26 (architect): Stage 5 COMPLETE. Wrote SPEC-MC-001 (specs/mcp-client/spec.md) — 30
                 implementation-ready spec items SPEC-MC-001..030 across six layer groups:
                 - DOMAIN (001-008): McpTypes (McpServerConfig stdio|sse|http union / ManagedMcpServer /
                   McpTool / McpTestResult / ParsedMcpConfig / EnabledMcpServers / DEFAULT_MCP_SERVER), the
                   additive ChatRuntimeQueryOptions.enabledMcpServers? (after permissionMode; P0-P7 byte-
                   identical, byte-identical-proof = TEST-MC-082), the PURE McpConfigCodec (deserialize/
                   serialize .claude/mcp.json, load-or-default, non-default _claudian pruning + CLI-key
                   preservation), the PURE McpConfigParser (parseClipboardConfig→Result<ParsedMcpConfig> 4
                   formats + needsName, getMcpServerType, isValidMcpServerConfig), the PURE parseCommand
                   (no-shell split), the PURE getActiveServers + collectDisallowedMcpTools, the
                   McpConfigStorePort (load/save/exists Result-typed) + McpClientPort (isAvailable/test/
                   connect/listTools/callTool/disconnect; test→structured McpTestResult never throws) + the
                   MCP_CONFIG_STORE_PORT/MCP_CLIENT_PORT keys.
                 - INFRA (009-011): 3-bridge — Obsidian (VaultPort .claude/mcp.json + real SDK stdio/SSE/HTTP,
                   coverage-excluded → manual leg) / Mock (scriptable in-memory store + scriptable client with
                   success/partial/timeout/error/unavailable + fault switches) / LS (browser-localStorage store
                   + inert client isAvailable→false). fake-ports grows mcpConfigStore + mcpClient.
                 - APP (012-014): McpServerManager use case (load/add/edit/remove/setEnabled/setToolDisabled →
                   Result over McpConfigStorePort, getEnabledCount, getActiveServers(∅), getEnabledMcpServers),
                   the PURE foldEnabledMcpServers (writes the field ONLY when the active set is non-empty), the
                   PURE buildMcpViewModel (empty-seam vs live + enabledCount).
                 - UI (015-020): McpSettingsManager + McpServerRow, McpServerModal (paste/parse/add/edit, name
                   required/unique), McpTestModal (the 5-state machine), the expanded McpSelector (list+toggle+
                   badge, keeps the P6 empty seam at 0), useMcpConfigStorePort + useMcpClientPort, the wiring +
                   the UNCHANGED P7 ApprovalManager gating for mcp__<server>__<tool>.
                 - STYLES (021): the mcp-settings/mcp-modal/mcp-selector --sp-* slice (reuse-first).
                 - CROSS-CUTTING (022-030): additivity, the modal-seam signatures (OpenMcpServerModalFn(input?)
                   →Promise<McpServerDraft|null> / OpenMcpTestModalFn(server)→Promise<void>), i18n (P6 mcp.empty
                   kept), security (bounded explicit stdio spawn / no eval / no plaintext-secret dup / Node fetch
                   no-TLS-weaken / explicit-add-only), the P7-gating invariant (no new gate surface / no
                   providerId branch), Result/graceful-degrade/observability, the McpTestResult state model, the
                   paste-format truth table, coverage-exclusion + SDK externalization + never-build:web.
                 EDGE CASES EC-MC-1..20 (no-server byte-identical, malformed paste→err, the 4 formats, unreachable/
                   timeout, partial-success, stdio spawn bounded, disabled-tool, MCP-tool→P7 gate, config-absent→
                   empty, codec CLI-key fidelity, concurrent test+edit, save-fail notice). TESTS TEST-MC-001..082
                   + 020a, U/A/M split (U≈26 / A≈9 / M≈5). MANUAL LEGS: TEST-MC-021/022 (real SSE/HTTP), 061
                   (stdio spawn args), 064 (Node fetch/TLS), M1 (real stdio/SSE/HTTP + real vault round-trip +
                   real Claude MCP turn through the SDK + P7 gate), M2 (parity screenshots 320/520/720 light+dark).
                 FIVE DESIGN OPEN ITEMS RESOLVED in §0: (1) mentionedNames ALWAYS ∅ in P8 (NG3, no mention
                   extractor built); (2) McpClientPort.callTool OFF the turn-time critical path (the Claude SDK
                   calls it from the advertised enabledMcpServers.servers set; connect/callTool/disconnect are the
                   tester + future-non-SDK seam, not double-built at turn time); (3) the codec preserves CLI-written
                   top-level + non-`servers` _claudian keys (round-trip fidelity); (4) manager mutations await
                   store.save before resolving, a test owns its own immutable config snapshot (concurrency); (5)
                   the modal-seam fn signatures pinned (mirror the P5 OpenInlineEditFn/OpenImagePreviewFn).
                 COVERAGE: all 45 REQ-MC + 12 NFR-MC chained REQ↔SPEC↔TEST (§9); no TBD.
                 HAND-OFF → /spec:tasks (planner): decompose SPEC-MC-001..030 into T-MC-NNN. SEQUENCING (per
                   DESIGN-MC-001 open clarifications): (a) the PURE DOMAIN first — McpTypes + McpConfigParser +
                   McpConfigCodec + parseCommand + getActiveServers + the additive enabledMcpServers? — so the
                   manager + UI build on frozen types; (b) the two ports + the 3 bridges (Mock+LS first for the
                   automated weight, Obsidian real-transport last as a coverage-excluded manual-leg task); (c) the
                   McpServerManager use case + foldEnabledMcpServers + buildMcpViewModel; (d) the UI (settings/
                   modals/selector) + the modal-seam launchers + the P7-gating wiring; (e) the --sp-* slice +
                   en/de i18n. The real SDK transport (coverage-excluded obsidian/**) + the parity screenshots are
                   the FINAL manual-leg tasks accumulating for the single final epic gate. @modelcontextprotocol/
                   sdk is the one new runtime dep (rationale per AGENTS.md §8). No open clarifications block tasks.

2026-05-26 (planner): Stage 6 COMPLETE. Wrote TASKS-MC-001 (specs/mcp-client/tasks.md) — 42 tasks
                 T-MC-001..043 decomposing SPEC-MC-001..030, mirroring the TASKS-AS-001 (P7) + TASKS-TC-001
                 (P6) shape: 📐 baseline/guard-verify FIRST (T-MC-001); strict RED(qa,🧪)-before-impl(dev,🔨),
                 every dev task's first DoD = "prior RED passes" + whole-project lint 0 + typecheck 0 + test
                 green + impl-log entry; 7 layer batches —
                 - DOMAIN (T-MC-002..011): McpTypes + additive enabledMcpServers? (RED additivity/serialisation,
                   types frozen first), the PURE McpConfigParser (own truth-table RED→green) + McpConfigCodec +
                   parseCommand + getActiveServers, the two ports + MCP_CONFIG_STORE_PORT/MCP_CLIENT_PORT keys +
                   barrels.
                 - INFRA (T-MC-012..017): the dependency-add task T-MC-012 (@modelcontextprotocol/sdk →
                   package.json + confirm vite.config.ts ALL_EXTERNALS like @codemirror/* + bundle into main.js
                   not build:web + AGENTS.md §8 rationale); 3-bridge — Obsidian vault store + real SDK transports
                   (coverage-excluded → manual, file-naming directive) / Mock scriptable (seedMcpServers +
                   setMcpStoreFailMode + scriptTestResult + setClientMode + fake-ports.mcpConfigStore/mcpClient) /
                   LS browser-localStorage + inert client.
                 - APP (T-MC-018..021): McpServerManager lifecycle (await-save, dup-reject, Result,
                   getActiveServers/getEnabledMcpServers(∅)) + the PURE foldEnabledMcpServers + buildMcpViewModel.
                 - UI (T-MC-022..033): useMcp*Port composables, the modal-seam launchers
                   (OpenMcpServerModalFn/OpenMcpTestModalFn + fallbacks), McpSettingsManager+McpServerRow,
                   McpServerModal (paste/parse/add/edit), McpTestModal (5-state machine), the expanded McpSelector
                   (keeps the P6 empty seam at 0) — each + co-located data-testid PO.
                 - STYLES (T-MC-034): the mcp-settings/mcp-modal/mcp-selector --sp-* slice + tokens-contract
                   (ASCII-only comments — the lightningcss lesson; DoD runs build:web).
                 - WIRE-IN (T-MC-035..037): provide the two ports + the modal-seam launchers in AgentSidebarView +
                   ui/main.ts, mount the settings surface, the per-surface McpServerManager + the enabled-servers
                   fold + the UNCHANGED P7 ApprovalManager gating; npm run dev smoke.
                 - GATE (T-MC-038..043): cross-cutting invariants RED→green (no-secret/no-eval/explicit-add-only/
                   no-provider-branch) + the additivity byte-identical gate + the --sp-* token guard + the manual
                   legs T-MC-041 (real stdio/SSE/HTTP + real vault round-trip + real Claude MCP turn = TEST-MC-M1
                   incl. sub-legs 021/022/061/064, 👤 human-run) + T-MC-042 (parity screenshots = TEST-MC-M2,
                   👤) + the Feature DoD T-MC-043 (full verify + grep gate + dep-rationale + draft PR into next).
                 GUARD-RELAX VERDICT: NONE needed (verified vs eslint.config.js). The OLD pre-reboot MCP was
                 P0-deleted, but the NEW P8 names are clean — MCP_CONFIG_STORE_PORT/MCP_CLIENT_PORT not in
                 DELETED_INJECTION_KEYS; @/domain/chat/mcp/** + @/application/chat/mcp/** + @/ui/chat/mcp/** +
                 @/domain/ports/McpConfigStorePort + @/domain/ports/McpClientPort match NO DELETED_SUBSYSTEM_BAN
                 glob (@/domain/chat + @/application/chat regrew in P1; no @/ui/chat ban; only @/domain/feature +
                 the old ObsidianMcpServerPort banned). The ONE @/…/mcp collision: the still-active Obsidian-layer
                 globs @/infrastructure/obsidian/ObsidianMcp* + @/infrastructure/obsidian/mcp/** — NO ban edit
                 needed; handled by a FILE-NAMING DIRECTIVE (T-MC-001/013: name the new infra VaultMcpConfigStore.ts
                 / SdkMcpClient.ts, never ObsidianMcp…, never under obsidian/mcp/). Unlike P1's scoped chat-ban
                 relax, nothing further is needed here.
                 BUILD-GREEN: the additive enabledMcpServers? is interface-additive (no implements-break, no
                 companion stub — T-MC-003 notes this); the two new ports are new interfaces (impl + fake-ports
                 member land in the same bridge task). No stability-loop NFR in scope (no "0 flakes across N runs").
                 HAND-OFF → /spec:implement (dev + qa): first ready task is T-MC-001 📐 (baseline-capture +
                 guard-verify + the file-naming directive, dev, no deps) — runs in parallel with T-MC-002 🧪 (the
                 first domain RED, qa) and T-MC-012 🔨 (the SDK dep-add, dev, no deps). The critical path runs
                 T-MC-002→003→004→005→006→007→010→011→014→015→018→019→035→036→041→043 (17 tasks); see the dep
                 graph + parallel batches + coverage table in tasks.md. CLAR-MC-001..005 resolved; no open
                 clarifications block implementation.

2026-05-26 (dev): DOMAIN batch (T-MC-001..011) COMPLETE on feature/mcp-client. Eleven tasks, strict
                 TDD (RED qa → green dev), one commit each:
                 - T-MC-001 docs(mc) bcff6d77 — parity-screenshots.md + test-plan.md (guard-verify +
                   Obsidian-infra file-naming directive VaultMcpConfigStore/SdkMcpClient) + implementation-log.md.
                 - T-MC-002 RED ea5c1c71 / T-MC-003 green db5226d6 — McpTypes + barrel + the additive
                   ChatRuntimeQueryOptions.enabledMcpServers? (after permissionMode; P0-P7 byte-identical;
                   externalContextPaths? EXCLUDED; mcpMentions empty Set). NO implements break (additive-only).
                 - T-MC-004 RED 12e68ec1 / T-MC-005 green 1ff81b07 — pure McpConfigParser (4 formats +
                   getMcpServerType + isValidMcpServerConfig, throws→Result.err, total).
                 - T-MC-006 RED e4790abe / T-MC-007 green 1747e432 — pure McpConfigCodec (load-or-default +
                   non-default _claudian pruning + CLI-key preservation + 2-space indent, total).
                 - T-MC-008 RED 13d00eec / T-MC-009 green bf78a92a — pure parseCommand/splitCommandString
                   (no-shell tokeniser) + getActiveServers/collectDisallowedMcpTools.
                 - T-MC-010 RED 7f59e830 / T-MC-011 green e31d929f — McpConfigStorePort + McpClientPort +
                   McpConnection + MCP_CONFIG_STORE_PORT/MCP_CLIENT_PORT keys + barrel re-exports.
                 VERIFICATION (whole-project): vue-tsc -p tsconfig.lint.json 0 errors; npm run lint 0 errors
                 (12 pre-existing warnings); vitest tests/domain/{chat,ports} 196/196. Additivity proven
                 (TEST-MC-082: a P7-shaped query byte-identical to P7). No obsidian/node:*/Vue in
                 src/domain/chat/mcp/** or src/domain/ports/Mcp*; all pure transforms total (never throw);
                 McpClientPort.test contract documented never-throw. Deleted-symbol guard green (no relax).
                 styles.css untouched. THREE small spec-faithful deviations (logged): getMcpServerType
                 totalised with an isRecord guard (NFR-MC-004 never-throw); JSON.parse via trySync + delete
                 replaced by rest-spread (domain Result-discipline / codec bans); normalizeDisabledTools
                 trims on load too (load/save symmetry per SPEC-MC-003 + TEST-MC-001).
                 REMAINING (owner dev/qa, NOT in this batch): INFRA T-MC-012..017 (the @modelcontextprotocol/
                 sdk dep-add + the three-bridge store/client — Obsidian real transports coverage-excluded with
                 the file-naming directive VaultMcpConfigStore.ts/SdkMcpClient.ts, Mock scriptable, LS inert),
                 APP T-MC-018..021, UI T-MC-022..033, STYLES T-MC-034, WIRE-IN T-MC-035..037, GATE
                 T-MC-038..043 (incl. the human manual legs T-MC-041/042). NEXT agent: the INFRA-batch dev/qa
                 (T-MC-012 SDK dep-add is ready, no deps; T-MC-013 carries the file-naming directive).
```
