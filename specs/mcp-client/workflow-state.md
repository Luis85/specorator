---
feature: mcp-client
area: MC
current_stage: requirements
status: active
last_updated: 2026-05-26
last_agent: orchestrator (bootstrap)
epic: claudian-reboot
phase: P8
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (parity-charter §3.7/§4 P8 + audits + claudian-main stand in, mirrors P1-P7)
  research.md: skipped
  requirements.md: pending
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
| 3. Requirements | `requirements.md` | pending |
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
```
