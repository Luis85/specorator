---
feature: mcp-client
area: MC
current_stage: design
status: active
last_updated: 2026-05-26
last_agent: pm (requirements — PRD-MC-001 accepted)
epic: claudian-reboot
phase: P8
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.7/§4 P8 + audits + claudian-main stand in, mirrors P1-P7)
  research.md: skipped
  requirements.md: accepted (PRD-MC-001; CLAR-MC-001..005 resolved-by-recommendation → P8 architect ADRs, notably McpConfigStorePort vault-file + McpClientPort transport contract)
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
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
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
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
```
