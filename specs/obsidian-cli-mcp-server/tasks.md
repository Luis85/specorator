---
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: tasks
status: accepted
date: 2026-05-23
spec: SPEC-OCM-001
---

# Tasks — Obsidian CLI-backed MCP server

Single PR (vertical slice) on `claude/affectionate-ramanujan-SJHOH`. Order respects the
inward-only import direction (domain → infrastructure → plugin).

| ID | Task | Implements | Done when |
|---|---|---|---|
| T-OCM-001 | Add `ObsidianCliPort` + `ObsidianCliError` + types | REQ-OCM-001..007 | Port file compiles; exported from `ports/index.ts` |
| T-OCM-002 | `ObsidianCliAdapter` (spawn, timeout, JSON parse, error mapping) | REQ-OCM-001..007 | Adapter implements port; shell-free spawn |
| T-OCM-003 | `ObsidianCliBinaryResolver` | REQ-OCM-008..009 | POSIX + win32 discovery; null on failure |
| T-OCM-004 | `MockObsidianCliPort` (scriptable, records calls) | REQ-OCM-001..006 | Used by tool-group + dev |
| T-OCM-005 | `registerObsidianCliTools` (5 reads + 1 proposal write + allow-list) | REQ-OCM-010..014 | Tools registered; allow-list enforced |
| T-OCM-006 | Export tool group from `mcp/index.ts`; wire optional `cli` into `ObsidianMcpServerAdapter` | REQ-OCM-015 | Group registered iff `cli.available` |
| T-OCM-007 | `PluginSettings.obsidianCliPath` + default | REQ-OCM-016 | Field present; `''` default |
| T-OCM-008 | `core-settings.validateSettings` coerces `obsidianCliPath` (no version bump) | REQ-OCM-016 | Missing/non-string ⇒ `''` |
| T-OCM-009 | `PluginCore.getMcpConnectionConfig()` | REQ-OCM-018 | Returns config when running, else null |
| T-OCM-010 | `main.ts` constructs + injects `ObsidianCliAdapter` | REQ-OCM-015 | 7th arg wired |
| T-OCM-011 | `settings.ts` Obsidian CLI path field + enhanced status | REQ-OCM-017..018 | Field + status render |
| T-OCM-012 | Tests: `MockObsidianCliPort` | REQ-OCM-001..006 | Coverage-counted |
| T-OCM-013 | Tests: `ObsidianCliAdapter` + `ObsidianCliBinaryResolver` | REQ-OCM-001..009 | Behaviour covered |
| T-OCM-014 | Tests: `registerObsidianCliTools` via adapter (HTTP) incl. allow-list + proposal | REQ-OCM-010..014 | Reads, run allow-list, append-as-proposal |
| T-OCM-015 | Tests: `core-settings` `obsidianCliPath` coercion | REQ-OCM-016 | Default/missing/non-string |
| T-OCM-016 | ADR-018; run verify gate (typecheck, lint, test, build, build:web, docs:api) | all | Gate green |

## Risks

- CLI JSON shape is an unstable contract → parse defensively (`invalid-json`).
- Coverage: adapter/resolver/tool-group live under `src/infrastructure/obsidian/**`
  (excluded), so coverage rides on `MockObsidianCliPort` + domain port + existing
  thresholds. Keep the mock and any domain logic test-covered.
