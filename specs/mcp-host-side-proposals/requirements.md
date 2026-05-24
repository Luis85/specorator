---
id: PRD-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX
stage: requirements
feature: mcp-host-side-proposals
status: draft
owner: pm
inputs:
  - IDEA-MHP-001
  - RESEARCH-MHP-001
created: 2026-05-24
updated: 2026-05-24
---

# PRD — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

## Summary

Specorator's in-process MCP server queues every vault write into an `ObsidianMcpServerAdapter.proposalStore` (per `docs/adr/ADR-013-obsidian-mcp-server.md`, `docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md`), but no caller invokes `acceptProposal` / `rejectProposal` / `getProposals`. The store is orphaned: every MCP client — Specorator's sidepanel agent, Claude Desktop, terminal `claude`, Cursor — sees a `pending` response, narrates success, and the vault never changes. This feature makes the proposal queue host-agnostic and terminal-driveable by exposing it as MCP tools, wires the existing 6 write tools to actually commit on accept, adds 12 Tier-A safe-read tools plus one regex-validated read-only escape hatch, ships an append-only JSONL audit log, migrates `.mcp.json` out of the vault root, gates a DevTools surface behind a tiered opt-in matrix, and authors ADR-019 to codify the tier policy and permanent deny-list. Scope is bounded per `specs/mcp-host-side-proposals/idea.md` §"Out of scope" — bearer-token auth, webviewer, Tier-B writes, and batch-card UX are explicit follow-ups.

## Goals

- **G1 — Host-agnostic approval.** Any MCP client can list, inspect, accept, or reject pending proposals via MCP tools without opening the Obsidian UI (`specs/mcp-host-side-proposals/idea.md` §"Desired outcome").
- **G2 — Confabulation eliminated.** The Specorator sidepanel agent stops claiming success on `pending` responses (`specs/mcp-host-side-proposals/research.md` §Q6).
- **G3 — Useful read surface.** Agents can navigate links, outlines, history, templates, and daily notes through 12 Tier-A read tools plus one regex-validated escape hatch (`discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 1").
- **G4 — Auditable.** Every accept / reject / error leaves a structured row in `.specorator/mcp-audit.log` (`specs/mcp-host-side-proposals/research.md` §Q4).
- **G5 — Config no longer leaks.** `.mcp.json` is migrated out of the vault root and into `.obsidian/mcp.local.json`; the plugin ships a `.gitignore` entry for the new path (`discovery/obsidian-cli-mcp-expansion/critique.md` §7).
- **G6 — DevTools surface explicitly user-consented.** Eight DevTools tools are reachable only behind the tiered opt-in matrix in `specs/mcp-host-side-proposals/research.md` §Q3, with the threat model embedded verbatim in ADR-019.
- **G7 — Permanent deny-list enforced at the server layer.** The dangerous-CLI surface from `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Permanently denied" cannot be reached through any tool, including the read-only escape hatch.

## Non-goals

- **NG1 — No bearer-token authentication.** Single-user threat model accepted under CLAR-MHP-001; loopback + proposal-gating + read allow-list is the boundary. Specorator shall not ship bearer-token issuance, rotation, or validation in this feature.
- **NG2 — No webviewer surface.** Carved out per `specs/mcp-host-side-proposals/research.md` §Q2; Specorator shall not register `web_*` tools, a webviewer Electron partition, or a domain allowlist in this feature.
- **NG3 — No Tier-B vault writes.** Specorator shall not register `file_create`, `file_rename`, `property_set`, `property_remove`, `daily_append`, `daily_prepend`, `history_restore`, `template_insert`, or `task_toggle` MCP tools in this feature (`specs/mcp-host-side-proposals/idea.md` §"Out of scope").
- **NG4 — No new Obsidian view for proposals.** Specorator shall not build a dedicated proposals pane; accept/reject reach the user only through the existing sidepanel proposal-card pattern and the new MCP tools (`specs/mcp-host-side-proposals/idea.md` §"Out of scope").
- **NG5 — No batch-proposal Plan card.** Specorator shall not collapse ≥3 proposals into a single Plan card in this feature; the proposal payload remains format-extensible so a future feature can.
- **NG6 — No 10-second undo window.** Specorator shall not delay auto-accepted writes behind an undo timer in this feature.
- **NG7 — No telemetry beyond the audit log.** Specorator shall not write any other JSONL file under `.specorator/` in this feature.
- **NG8 — No agent-side `intent` enforcement.** Specorator shall not refuse to render Accept when the agent omits `intent` in this feature; the schema carries the field, enforcement is Tier-B.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Focused Builder (primary) | Accept / reject vault writes from wherever they are working — sidepanel, terminal `claude`, Cursor — without context-switching into Obsidian | Spec-driven dev loop runs end-to-end with an agent at the wheel; UI-only approval breaks the loop (`discovery/obsidian-cli-mcp-expansion/user-research.md` §1) |
| PKM Tinkerer (secondary) | Auditable record of which client wrote what across multiple MCP clients sharing a vault | High write volume across Claude Desktop + Cursor + scripts collapses without per-client visibility (`discovery/obsidian-cli-mcp-expansion/critique.md` §5) |
| Solo Consultant (secondary) | No silent confabulation on client vaults; config files do not leak into client Git repos | Reputational and legal exposure if `.mcp.json` ships in a client commit or the agent reports a write that never happened (`discovery/obsidian-cli-mcp-expansion/user-research.md` §2 H3) |
| Specorator sidepanel agent (system actor) | A system-prompt addendum that prevents narrating success on `pending` responses | The agent is the most-used MCP client; without the addendum, this feature solves the queue but not the confabulation |
| Future Tier-B PM (downstream stakeholder) | Proposal schema with a `kind` discriminator and `intent` field already in place | Tier-B follow-up spec inherits the pipeline without a schema migration |

## Jobs to be done

- When **a terminal `claude` session has issued a vault write**, I want to **list the pending proposal, read its diff, and accept or reject it from the same terminal**, so I can **complete the workflow without opening Obsidian**.
- When **the sidepanel agent has called `vault_append_to_note`**, I want **the agent to tell me the change is queued and stop**, so I can **review and accept before the agent continues planning on assumed success**.
- When **two MCP clients accept the same proposal simultaneously**, I want **only one write to commit and both clients to see a consistent decision**, so I can **trust the audit log to reflect what actually happened**.
- When **an external MCP client invokes a vault write**, I want **the audit log to record which client did it**, so I can **answer "which agent wrote this" weeks later**.
- When **I clone a vault that previously contained `.mcp.json` at root**, I want **the file to migrate into `.obsidian/mcp.local.json` on first start and the root copy to be safely removed**, so I can **stop leaking the MCP config through Git or iCloud sync**.
- When **I enable agent-driven DevTools tools**, I want **a settings surface that names the specific risk each tool carries before I flip the toggle**, so I can **make a consent decision I will not regret**.

## Functional requirements (EARS)

> Notation per `docs/ears-notation.md`. One requirement per entry. Stable IDs.

### REQ-MHP-001 — Register `workflow_proposal_list` tool

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall register an MCP tool named `workflow_proposal_list` that returns every proposal whose status is `pending`.*
- **Acceptance:**
  - Given the proposal store contains two `pending` proposals and one already-decided proposal,
  - When an MCP client calls `tools/call` with name `workflow_proposal_list`,
  - Then the server returns a result containing exactly the two `pending` proposals, each with id, kind, intent, paths, and submitting `client.id`, and the already-decided proposal is excluded.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome" bullet 1; RESEARCH-MHP-001 §Q5; issue 430 acceptance criterion 1.

### REQ-MHP-002 — Register `workflow_proposal_get` tool

- **Pattern:** event-driven
- **Statement:** *When an MCP client calls `workflow_proposal_get` with a known proposal id, the Specorator MCP server shall return the full proposal record including kind, intent, paths, submitting client identifier, current status, and the rendered diff payload.*
- **Acceptance:**
  - Given a proposal with id `prop_abc` exists in the store with status `pending`,
  - When an MCP client calls `workflow_proposal_get` with `{ "id": "prop_abc" }`,
  - Then the response contains the full proposal record with the diff payload populated.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; RESEARCH-MHP-001 §Q5.

### REQ-MHP-003 — `workflow_proposal_get` on unknown id

- **Pattern:** unwanted-behaviour
- **Statement:** *If an MCP client calls `workflow_proposal_get` with an id that does not exist in the proposal store, then the Specorator MCP server shall return an MCP error result with code `not_found` and shall not mutate the store.*
- **Acceptance:**
  - Given no proposal with id `prop_missing` exists,
  - When an MCP client calls `workflow_proposal_get` with `{ "id": "prop_missing" }`,
  - Then the response is an MCP error result with code `not_found` and the store contents are unchanged.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q5.

### REQ-MHP-004 — Register `workflow_proposal_accept` tool

- **Pattern:** event-driven
- **Statement:** *When an MCP client calls `workflow_proposal_accept` with a proposal id whose status is `pending`, the Specorator MCP server shall execute the queued mutation against the vault, mark the proposal `accepted`, write the result back to the proposal record, and return the execution outcome.*
- **Acceptance:**
  - Given a `pending` proposal of kind `vault_append` targets `specs/x/idea.md`,
  - When an MCP client calls `workflow_proposal_accept` with that proposal's id,
  - Then the append is committed to disk, the proposal status becomes `accepted`, and the response contains `{ ok: true }` with no error.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; issue 430 acceptance criteria 2 and 3.

### REQ-MHP-005 — Register `workflow_proposal_reject` tool

- **Pattern:** event-driven
- **Statement:** *When an MCP client calls `workflow_proposal_reject` with a proposal id whose status is `pending`, the Specorator MCP server shall mark the proposal `rejected`, discard the queued mutation without writing to the vault, and return success.*
- **Acceptance:**
  - Given a `pending` proposal of kind `vault_append` targets `specs/x/idea.md`,
  - When an MCP client calls `workflow_proposal_reject` with that proposal's id,
  - Then the proposal status becomes `rejected`, no vault file is modified, and the response contains `{ ok: true }`.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; issue 430 acceptance criterion 2.

### REQ-MHP-006 — Single-accept guarantee against dual-accept race

- **Pattern:** unwanted-behaviour
- **Statement:** *If `workflow_proposal_accept` is invoked twice concurrently against the same proposal id, then the Specorator MCP server shall execute the queued mutation exactly once and shall return the same execution result to both callers, with the second call's result tagged `decision.outcome: "already-decided"` in the audit log.*
- **Acceptance:**
  - Given a `pending` proposal exists,
  - When two MCP clients call `workflow_proposal_accept` for that proposal within the same scheduler tick,
  - Then the vault mutation runs exactly once, both calls return identical `{ ok: true }` payloads, and the audit log contains two rows for the proposal — the first with `decision.outcome: "accepted"` and the second with `decision.outcome: "already-decided"`.
- **Priority:** must
- **Satisfies:** RISK-MHP-001 in `specs/mcp-host-side-proposals/research.md`; IDEA-MHP-001 §"Constraints" (host-agnostic).

### REQ-MHP-007 — Accept on non-pending proposal

- **Pattern:** unwanted-behaviour
- **Statement:** *If an MCP client calls `workflow_proposal_accept` or `workflow_proposal_reject` against a proposal whose status is not `pending`, then the Specorator MCP server shall return an MCP error result with code `already_decided` carrying the prior decision and shall not re-execute the mutation.*
- **Acceptance:**
  - Given a proposal exists with status `accepted`,
  - When an MCP client calls `workflow_proposal_accept` with that proposal's id,
  - Then the response is an MCP error result with code `already_decided`, and no additional vault write occurs.
- **Priority:** must
- **Satisfies:** RISK-MHP-001; RESEARCH-MHP-001 §Q5.

### REQ-MHP-008 — Existing 6 write tools commit on accept

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall route the existing write tools `canvas_create_node`, `canvas_link`, `canvas_update_node`, `vault_write_note`, `vault_append_to_note`, and `obsidian_cli_append_note` through the proposal pipeline, and on accept the queued mutation shall execute against the vault.*
- **Acceptance:**
  - Given an MCP client calls `vault_write_note` with payload `{ path: "x.md", content: "hi" }`,
  - When the resulting proposal is accepted via `workflow_proposal_accept`,
  - Then the file `x.md` exists in the vault with content `hi`.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Problem statement"; issue 430 acceptance criterion 3.

### REQ-MHP-009 — Auto-accept rule for active-feature appends

- **Pattern:** state-driven
- **Statement:** *While the active feature slug `<slug>` is resolvable from `specs/<slug>/workflow-state.md` and the user setting `requireExplicitAcceptForAllWrites` is `false`, the Specorator MCP server shall auto-accept any newly queued proposal whose tool is `vault_append_to_note` or `obsidian_cli_append_note` and whose target path matches `^specs/<slug>/.*\.md$`.*
- **Acceptance:**
  - Given workflow-state lists `mcp-host-side-proposals` as active and `requireExplicitAcceptForAllWrites` is false,
  - When the sidepanel agent calls `vault_append_to_note` with path `specs/mcp-host-side-proposals/research.md`,
  - Then the proposal is auto-accepted, the append commits, and the audit log row carries `decision.by: "auto"` and `decision.rule: "active-feature-append"`.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q1; `discovery/obsidian-cli-mcp-expansion/critique.md` §5.

### REQ-MHP-010 — Auto-accept disabled by user opt-in

- **Pattern:** state-driven
- **Statement:** *While the user setting `requireExplicitAcceptForAllWrites` is `true`, the Specorator MCP server shall queue every proposal as `pending` and shall not auto-accept any tool invocation regardless of path.*
- **Acceptance:**
  - Given `requireExplicitAcceptForAllWrites` is true and `mcp-host-side-proposals` is active,
  - When the sidepanel agent calls `vault_append_to_note` with path `specs/mcp-host-side-proposals/idea.md`,
  - Then the proposal status is `pending` and the file is unchanged until a `workflow_proposal_accept` call.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q1.

### REQ-MHP-011 — Register 12 Tier-A read tools

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall register the following MCP read tools, each backed by the corresponding Obsidian CLI command and reachable without proposal gating: `obsidian_cli_backlinks`, `obsidian_cli_links`, `obsidian_cli_unresolved`, `obsidian_cli_orphans`, `obsidian_cli_deadends`, `obsidian_cli_outline`, `obsidian_cli_diff`, `obsidian_cli_history`, `obsidian_cli_templates`, `obsidian_cli_template_read`, `obsidian_cli_property_read`, `obsidian_cli_daily_read`.*
- **Acceptance:**
  - Given the MCP server is running,
  - When an MCP client calls `tools/list`,
  - Then all 12 tool names appear in the response.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 1"; issue 430 acceptance criterion 5.

### REQ-MHP-012 — Tier-A reads do not generate proposals

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall execute every Tier-A read tool synchronously and shall not enqueue any proposal record for read operations.*
- **Acceptance:**
  - Given the proposal store is empty,
  - When an MCP client calls `obsidian_cli_backlinks` with `{ path: "x.md" }`,
  - Then the call returns the backlink list and the proposal store remains empty.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q1 ("Read class always-allow").

### REQ-MHP-013 — Read-only escape hatch with regex-validated args

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall register an MCP tool `obsidian_cli_read_command` that accepts a CLI command name and an argument list, validates each argument against the regex `^[^;|&$`\\n\\r\\\\]+$`, rejects any argument that fails validation with MCP error code `invalid_argument`, and dispatches only to CLI commands present in the configured read-only allow-list.*
- **Acceptance:**
  - Given the allow-list contains `outline` but not `delete`,
  - When an MCP client calls `obsidian_cli_read_command` with `{ command: "outline", args: ["x.md"] }`,
  - Then the call succeeds and returns the outline output;
  - And when an MCP client calls `obsidian_cli_read_command` with `{ command: "outline", args: ["x.md; rm -rf /"] }`,
  - Then the call returns MCP error `invalid_argument`;
  - And when an MCP client calls `obsidian_cli_read_command` with `{ command: "delete", args: ["x.md"] }`,
  - Then the call returns MCP error `not_allowed`.
- **Priority:** must
- **Satisfies:** `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 1" (escape hatch); RESEARCH-MHP-001 §"Technical considerations" (Tier-A reads).

### REQ-MHP-014 — Permanent deny-list at server registration

- **Pattern:** unwanted-behaviour
- **Statement:** *If the Specorator MCP server is initialised, then it shall not register any MCP tool that exposes any of the following CLI commands: `eval`, `plugin:install`, `plugin:uninstall`, `plugin:enable`, `plugin:disable`, `plugin:reload`, `plugins:restrict`, `theme:install`, `theme:uninstall`, `theme:set`, `snippet:enable`, `snippet:disable`, `sync` (on/off), `publish:add`, `publish:remove`, `publish:open`, `command` (palette executor), `restart`, `reload`, `vault:open`, `workspace:load`, `tab:open`, `delete` (file).*
- **Acceptance:**
  - Given the MCP server has started,
  - When an MCP client calls `tools/list`,
  - Then no returned tool name maps to any of the listed CLI commands;
  - And a unit test asserts each name from the deny-list is absent from the registered tool set.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints" ("Permanently denied … enforced at the server layer"); `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Permanently denied"; ADR-019.

### REQ-MHP-015 — Deny-list enforcement through escape hatch

- **Pattern:** unwanted-behaviour
- **Statement:** *If an MCP client calls `obsidian_cli_read_command` with a command name present in the permanent deny-list defined in REQ-MHP-014, then the Specorator MCP server shall return MCP error `not_allowed` and shall not invoke the CLI.*
- **Acceptance:**
  - Given the deny-list includes `eval`,
  - When an MCP client calls `obsidian_cli_read_command` with `{ command: "eval", args: ["1+1"] }`,
  - Then the response is MCP error `not_allowed` and the CLI process is not spawned.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints"; `discovery/obsidian-cli-mcp-expansion/critique.md` Risk R1.

### REQ-MHP-016 — DevTools master toggle gates the low-risk three

- **Pattern:** state-driven
- **Statement:** *While the user setting `devtools.masterEnabled` is `false`, the Specorator MCP server shall not register the tools `dev:screenshot`, `dev:errors`, or `dev:console`.*
- **Acceptance:**
  - Given `devtools.masterEnabled` is false,
  - When an MCP client calls `tools/list`,
  - Then none of `dev:screenshot`, `dev:errors`, `dev:console` appears in the response.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome" (DevTools opt-in); RESEARCH-MHP-001 §Q3.

### REQ-MHP-017 — Per-tool toggles gate the high-risk five

- **Pattern:** state-driven
- **Statement:** *While the user setting `devtools.masterEnabled` is `true` and the per-tool setting `devtools.tools.<tool>.enabled` is `true`, the Specorator MCP server shall register the corresponding tool for each of `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, and `devtools`; otherwise it shall not register that tool.*
- **Acceptance:**
  - Given `devtools.masterEnabled` is true, `devtools.tools.dev:dom.enabled` is true, and all other per-tool toggles are false,
  - When an MCP client calls `tools/list`,
  - Then `dev:dom` is present and none of `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools` is present.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome" (high-risk per-tool opt-in); RESEARCH-MHP-001 §Q3 summary table.

### REQ-MHP-018 — DevTools master toggle is a precondition for the high-risk five

- **Pattern:** unwanted-behaviour
- **Statement:** *If `devtools.masterEnabled` is `false`, then the Specorator MCP server shall not register `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, or `devtools`, regardless of the per-tool toggle values.*
- **Acceptance:**
  - Given `devtools.masterEnabled` is false and every per-tool toggle is true,
  - When an MCP client calls `tools/list`,
  - Then none of the high-risk five appears in the response.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q3 ("master toggle off → none of the high-risk five reachable").

### REQ-MHP-019 — DevTools tools always proposal-gated

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall enqueue a proposal record for every invocation of any DevTools tool (`dev:screenshot`, `dev:errors`, `dev:console`, `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools`), and shall write a corresponding audit-log row whether the proposal is auto-accepted or user-accepted.*
- **Acceptance:**
  - Given all DevTools tools are enabled and auto-accept on the low-risk three is true,
  - When an MCP client calls `dev:screenshot`,
  - Then the proposal store records the invocation and the audit log contains one row with `tool: "dev:screenshot"`.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints" ("the audit log records every invocation"); issue 430 acceptance criterion 9.

### REQ-MHP-020 — `dev:cdp` always prompts

- **Pattern:** unwanted-behaviour
- **Statement:** *If an MCP client invokes the `dev:cdp` tool, then the Specorator MCP server shall enqueue the proposal with status `pending` and shall not auto-accept it, regardless of any auto-accept setting.*
- **Acceptance:**
  - Given `devtools.tools.dev:cdp.enabled` is true and any auto-accept setting is true,
  - When an MCP client calls `dev:cdp`,
  - Then the proposal status is `pending` and the underlying CDP command is not invoked until `workflow_proposal_accept` runs.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q3 (`dev:cdp` always-prompt); RISK-MHP-007.

### REQ-MHP-021 — DevTools result payload not persisted to audit log

- **Pattern:** unwanted-behaviour
- **Statement:** *If a DevTools tool invocation returns binary or text content (e.g. screenshot bytes, console output, DOM text), then the Specorator MCP server shall write only the proposal id, tool name, decision, and target reference into the audit log, and shall not write the returned content into the audit log.*
- **Acceptance:**
  - Given `dev:screenshot` is invoked and returns base64 PNG bytes,
  - When the audit-log row is written,
  - Then the row contains the proposal metadata fields but does not contain the base64 payload or any pixel data.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q3 (mitigation: "screenshot result payload is not itself written to the audit log").

### REQ-MHP-022 — Audit log at `.specorator/mcp-audit.log` per JSONL schema v1

- **Pattern:** event-driven
- **Statement:** *When the Specorator MCP server processes any proposal decision (auto-accept, user-accept, client-accept, reject, or error), it shall append one JSON object as a single line to `.specorator/mcp-audit.log` with the fields `ts`, `schema`, `client`, `tool`, `proposal`, `decision`, and `result` defined in `specs/mcp-host-side-proposals/research.md` §Q4.*
- **Acceptance:**
  - Given the audit log is empty,
  - When a `vault_append_to_note` proposal is auto-accepted,
  - Then `.specorator/mcp-audit.log` contains exactly one line that parses as JSON and includes all seven top-level fields with `schema: 1`, `tool: "vault_append_to_note"`, `decision.outcome: "accepted"`, `decision.by: "auto"`, `decision.rule: "active-feature-append"`, and `result.ok: true`.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; RESEARCH-MHP-001 §Q4; issue 430 acceptance criterion 7.

### REQ-MHP-023 — Audit log uses vault-relative POSIX paths

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall record every `proposal.paths` entry in the audit log as a vault-relative POSIX path with forward-slash separators, and shall not record absolute paths or backslash-separated paths.*
- **Acceptance:**
  - Given the plugin runs on Windows,
  - When a proposal targeting `specs\x\idea.md` is accepted,
  - Then the audit-log row contains the path `specs/x/idea.md`.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q4 ("Path conventions").

### REQ-MHP-024 — Audit-log size-based rotation

- **Pattern:** event-driven
- **Statement:** *When `.specorator/mcp-audit.log` exceeds 2 MiB after an append, the Specorator MCP server shall rotate the file by renaming it to `.specorator/mcp-audit.log.1`, shifting any existing rotated files to the next numbered slot, and deleting the rotation at slot 6 if it exists.*
- **Acceptance:**
  - Given `.specorator/mcp-audit.log` is at 2.05 MiB and rotations `.1`–`.5` already exist,
  - When the next append occurs,
  - Then `.5` is deleted, `.4`→`.5`, `.3`→`.4`, `.2`→`.3`, `.1`→`.2`, the current log is renamed to `.1`, and a new empty `.specorator/mcp-audit.log` is created;
  - And after the append the active log file size is below 2 MiB.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q4 ("Alternative A — Size-based rotation (recommended)").

### REQ-MHP-025 — Audit-log unwritable surfaces error

- **Pattern:** unwanted-behaviour
- **Statement:** *If the Specorator MCP server fails to append to `.specorator/mcp-audit.log` (filesystem error, permission denied, disk full), then it shall surface the error via the LoggerPort at error severity, notify the user via the NotificationPort with a sticky notice, and complete the proposal-decision MCP response with `result.ok: true` only when the underlying vault mutation itself succeeded.*
- **Acceptance:**
  - Given the audit-log file is read-only,
  - When a `vault_append_to_note` proposal is auto-accepted and the vault append succeeds,
  - Then the LoggerPort receives an error-level entry naming the audit failure, the NotificationPort shows a sticky error notice, the MCP response indicates the vault mutation succeeded, and the proposal status is `accepted`.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q4; `CLAUDE.md` §"Narrow ports (ADR-008)" (LoggerPort + NotificationPort separation).

### REQ-MHP-026 — `.specorator/` folder created on first audit write

- **Pattern:** event-driven
- **Statement:** *When the Specorator MCP server attempts its first audit-log append in a vault that has no `.specorator/` folder, it shall create the folder via the VaultPort before writing the log line.*
- **Acceptance:**
  - Given the vault has no `.specorator/` folder,
  - When the first proposal decision is recorded,
  - Then `.specorator/` exists and `.specorator/mcp-audit.log` contains the decision row.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §"Technical considerations" ("the plugin must create it"); IDEA-MHP-001 §"Constraints" (no other files under `.specorator/`).

### REQ-MHP-027 — Migrate `.mcp.json` to `.obsidian/mcp.local.json`

- **Pattern:** event-driven
- **Statement:** *When the Specorator plugin starts and detects a `.mcp.json` file at the vault root, it shall read the file, write its contents to `.obsidian/mcp.local.json`, verify the new file's contents byte-match the source, delete the root `.mcp.json` only after verification succeeds, and show a one-time user notice describing the migration.*
- **Acceptance:**
  - Given `.mcp.json` exists at vault root with payload `P`,
  - When the plugin starts,
  - Then `.obsidian/mcp.local.json` exists with payload byte-equal to `P`, `.mcp.json` is absent from the vault root, and the user has seen a one-time notice.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints" (`.mcp.json` cannot remain at vault root); RESEARCH-MHP-001 §"Technical considerations"; issue 430 acceptance criterion 6.

### REQ-MHP-028 — Migration verify-before-delete

- **Pattern:** unwanted-behaviour
- **Statement:** *If the write to `.obsidian/mcp.local.json` fails or the post-write verification does not byte-match the source `.mcp.json`, then the Specorator plugin shall leave `.mcp.json` in place at the vault root, surface a sticky error notice, and abort the migration without retrying within the same plugin session.*
- **Acceptance:**
  - Given the `.obsidian/` folder is read-only,
  - When the plugin starts with a root `.mcp.json` present,
  - Then the root `.mcp.json` is unchanged, no `.obsidian/mcp.local.json` is created, and a sticky error notice is shown.
- **Priority:** must
- **Satisfies:** RISK-MHP-004 in `specs/mcp-host-side-proposals/research.md`.

### REQ-MHP-029 — Migration is idempotent

- **Pattern:** ubiquitous
- **Statement:** *The Specorator plugin shall treat the migration as a no-op when `.mcp.json` is absent from the vault root, regardless of whether `.obsidian/mcp.local.json` exists.*
- **Acceptance:**
  - Given the vault root has no `.mcp.json` and `.obsidian/mcp.local.json` exists,
  - When the plugin starts,
  - Then no migration notice is shown and `.obsidian/mcp.local.json` is unchanged.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §"Technical considerations" ("The migration must be idempotent"); RISK-MHP-005.

### REQ-MHP-030 — Migration preserves all configured fields

- **Pattern:** ubiquitous
- **Statement:** *The Specorator plugin shall write `.obsidian/mcp.local.json` such that every top-level and nested field present in the source `.mcp.json` is preserved with byte-equal value.*
- **Acceptance:**
  - Given `.mcp.json` contains `{ "servers": { "a": { "command": "x", "args": ["y"], "env": { "K": "v" } } } }`,
  - When migration completes,
  - Then `.obsidian/mcp.local.json` parses to the identical object.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints" ("without losing user-configured fields"); RISK-MHP-004.

### REQ-MHP-031 — `.gitignore` shipped for `.obsidian/mcp.local.json`

- **Pattern:** event-driven
- **Statement:** *When the Specorator plugin creates or migrates `.obsidian/mcp.local.json`, it shall ensure the vault's `.gitignore` (creating it if absent) contains a line matching `.obsidian/mcp.local.json`.*
- **Acceptance:**
  - Given the vault has no `.gitignore`,
  - When migration runs,
  - Then `.gitignore` exists at the vault root and contains the line `.obsidian/mcp.local.json`.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Constraints" ("ship a `.gitignore` entry").

### REQ-MHP-032 — Sidepanel-agent system-prompt addendum present

- **Pattern:** ubiquitous
- **Statement:** *The Specorator plugin shall include the following addendum verbatim in the sidepanel agent's assembled system prompt: "When a write tool returns `\"status\": \"pending\"`, the change has not been committed — it is queued for the user. Say so explicitly. Do not claim, summarise, or hint that the change took effect. Do not call `workflow_proposal_accept` on the user's behalf. The user will accept or reject the proposal; resume only when they tell you the outcome or you observe a follow-up tool call."*
- **Acceptance:**
  - Given the sidepanel agent's system prompt is assembled,
  - When a unit test inspects the assembled prompt,
  - Then the addendum string is found as a contiguous substring with no edits, and the test fails if the substring is absent or modified.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome" (sidepanel stops confabulating); RESEARCH-MHP-001 §Q6 (Alternative B); RISK-MHP-008; issue 430 acceptance criterion 4.

### REQ-MHP-033 — Addendum lives in a plugin-owned versioned file

- **Pattern:** ubiquitous
- **Statement:** *The Specorator plugin shall store the system-prompt addendum in a versioned file owned by the plugin's source tree, and shall not source the addendum from a user-editable settings field, user template, or runtime-mutable configuration.*
- **Acceptance:**
  - Given the addendum file is committed under `src/` (exact path determined at /spec:design),
  - When the user changes any setting in the Specorator settings tab,
  - Then the assembled system prompt still contains the addendum verbatim and the file on disk is unchanged.
- **Priority:** must
- **Satisfies:** RISK-MHP-008 (addendum drift-guard).

### REQ-MHP-034 — Proposal records carry submitting client identifier

- **Pattern:** event-driven
- **Statement:** *When the Specorator MCP server enqueues a proposal, it shall populate `client.id` from the request header `x-mcp-client-name` if present, otherwise from `User-Agent` if present, otherwise the literal string `unknown`, and shall populate `client.transport` as `in-process` for sidepanel-originated proposals and `loopback` for HTTP-originated proposals.*
- **Acceptance:**
  - Given an MCP client sends header `x-mcp-client-name: cursor`,
  - When that client triggers a proposal,
  - Then the proposal record's `client.id` is `cursor` and `client.transport` is `loopback`.
- **Priority:** must
- **Satisfies:** RISK-MHP-002; RESEARCH-MHP-001 §Q4 ("`client` — Identifies who invoked the proposal"); RESEARCH-MHP-001 §"Technical considerations" (client identity).

### REQ-MHP-035 — Unknown clients are not refused

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall accept proposal-submitting requests from clients whose identifier cannot be determined and shall record them with `client.id: "unknown"` rather than reject the request.*
- **Acceptance:**
  - Given an MCP client sends no `x-mcp-client-name` and no `User-Agent`,
  - When the client invokes `vault_write_note`,
  - Then a proposal is enqueued with `client.id: "unknown"` and the call returns a `pending` status; the request is not refused.
- **Priority:** must
- **Satisfies:** RISK-MHP-002 ("fall back to `unknown` rather than refuse"); RESEARCH-MHP-001 §"Assumptions" A1.

### REQ-MHP-036 — Proposal payload uses `kind` discriminator

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall structure every proposal record such that its `kind` field carries a string discriminator (e.g. `vault_append`, `vault_write`, `canvas_create_node`, `canvas_link`, `canvas_update_node`, `obsidian_cli_append`, `dev_screenshot`, `dev_errors`, `dev_console`, `dev_dom`, `dev_cdp`, `dev_debug`, `dev_mobile`, `devtools`) and the audit-log reader shall be able to ignore unknown kinds without error.*
- **Acceptance:**
  - Given a proposal of kind `vault_append` is in the store,
  - When an MCP client calls `workflow_proposal_get`,
  - Then the response includes `kind: "vault_append"`;
  - And a unit test feeding an audit-log line with `kind: "future_unknown"` to the reader does not throw.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q2 ("the only forward-compatibility obligation webviewer imposes").

### REQ-MHP-037 — Proposal payload carries `intent` field

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall accept and store an optional `intent` string field on every inbound write tool call and shall include it in the proposal record and in the audit-log row, treating the field as empty string when absent.*
- **Acceptance:**
  - Given an MCP client calls `vault_write_note` with `{ path: "x.md", content: "hi", intent: "draft outline" }`,
  - When the resulting proposal is fetched via `workflow_proposal_get`,
  - Then the response includes `intent: "draft outline"`;
  - And when the same call omits `intent`, the stored value is the empty string.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q1, §Q4; NG8 (schema carries field; enforcement is Tier-B).

### REQ-MHP-038 — Proposal queue is ephemeral; discards logged on shutdown

- **Pattern:** event-driven
- **Statement:** *When the Specorator plugin shuts down (Obsidian close, plugin disable, plugin reload), it shall write one audit-log row per remaining `pending` proposal with `decision.outcome: "discarded"` and `decision.by: "shutdown"`, and shall not persist the proposal store across the restart.*
- **Acceptance:**
  - Given three `pending` proposals exist in the store,
  - When the plugin is disabled in Obsidian settings,
  - Then the audit log contains three new rows with `decision.outcome: "discarded"` and `decision.by: "shutdown"`, and on re-enable the proposal store is empty.
- **Priority:** must
- **Satisfies:** CLAR-MHP-005 in `specs/mcp-host-side-proposals/workflow-state.md` (PM confirms ephemeral v1 with shutdown logging); RESEARCH-MHP-001 §"Recommendation" item CLAR-MHP-005.

### REQ-MHP-039 — Audit-log row on every accept and reject

- **Pattern:** event-driven
- **Statement:** *When `workflow_proposal_accept` or `workflow_proposal_reject` resolves a proposal, the Specorator MCP server shall append exactly one audit-log row for that decision before returning the MCP response.*
- **Acceptance:**
  - Given a `pending` proposal exists,
  - When `workflow_proposal_reject` is called,
  - Then `.specorator/mcp-audit.log` contains one new row with `decision.outcome: "rejected"` and `decision.by: "client"` (or `"user"` when triggered from the sidepanel card), and the MCP response is returned only after the row is appended.
- **Priority:** must
- **Satisfies:** IDEA-MHP-001 §"Desired outcome"; issue 430 acceptance criterion 7.

### REQ-MHP-040 — Decision provenance recorded

- **Pattern:** ubiquitous
- **Statement:** *The Specorator MCP server shall record `decision.by` as `auto` for rule-based auto-acceptance, `user` for in-product sidepanel-card acceptance, `client` for external MCP `workflow_proposal_accept`/`_reject` invocations, and `shutdown` for proposals discarded on plugin shutdown.*
- **Acceptance:**
  - Given proposals are accepted via all four paths in sequence,
  - When the audit log is inspected,
  - Then the four corresponding rows carry `decision.by` values `auto`, `user`, `client`, `shutdown` respectively.
- **Priority:** must
- **Satisfies:** RESEARCH-MHP-001 §Q4 ("`decision.by` — `auto` | `user` | `client`"); REQ-MHP-038.

## Non-functional requirements

> Baseline-relative targets in this table are anchored to the integration branch HEAD at the start of /spec:implement. Capture baselines as a `tasks.md` task before introducing the new code paths.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-MHP-001 | performance | `workflow_proposal_list` response latency from request receipt to MCP response | p95 ≤ 50 ms with 100 `pending` proposals in store (measured via unit-level benchmark; no I/O beyond in-memory list) |
| NFR-MHP-002 | performance | Audit-log append latency added to the write-tool path | ≤ baseline + 10 ms p95 per accepted proposal (baseline = pre-change write path) |
| NFR-MHP-003 | performance | Tier-A read tools added round-trip latency vs direct CLI invocation | ≤ baseline + 20 ms p95 per call (baseline = direct CLI process spawn) |
| NFR-MHP-004 | security | Permanent deny-list enforcement | 100% of deny-list entries unreachable via `tools/list` AND via `obsidian_cli_read_command`; asserted by unit test (see REQ-MHP-014, REQ-MHP-015) |
| NFR-MHP-005 | security | Escape-hatch argument validation | 100% of arguments containing `;`, `|`, `&`, `$`, backtick, newline, carriage return, or backslash are rejected with MCP error `invalid_argument`; asserted by unit test |
| NFR-MHP-006 | security | Audit-log payload privacy | DevTools tool result bytes never appear in `.specorator/mcp-audit.log`; asserted by REQ-MHP-021 unit test |
| NFR-MHP-007 | observability | Audit-log schema stability | `schema: 1` consumed without error by the reader; any future field addition either keeps `schema: 1` (additive) or bumps to `schema: 2` with deprecation notice in release notes |
| NFR-MHP-008 | observability | Audit-log file budget | Worst-case disk use ≤ 12 MiB (1 active + 5 rotated × 2 MiB) per vault |
| NFR-MHP-009 | compatibility | Backwards-compat with ADR-013 and ADR-018 | `npm run typecheck`, `npm run lint`, and existing test suite pass without modification to any unrelated module; asserted by CI on PR |
| NFR-MHP-010 | compatibility | `.mcp.json` field preservation across migration | 100% of nested fields byte-equal in `.obsidian/mcp.local.json` vs source `.mcp.json`; asserted by unit test (see REQ-MHP-030) |
| NFR-MHP-011 | accessibility | DevTools settings warning copy | Each high-risk toggle's warning text reachable via screen reader, conforms to WCAG 2.2 AA contrast for the warning-bordered container; asserted in design-stage Storybook test |
| NFR-MHP-012 | reliability | Single-accept guarantee under concurrency | 0 dual-execution events across 1000 dual-accept fuzz runs; asserted by REQ-MHP-006 stress test |
| NFR-MHP-013 | reliability | Migration safety | 0 cases of root `.mcp.json` deletion without verified new-file write across 100 fault-injection runs (fs read-only, partial write, disk-full); asserted by REQ-MHP-028 test |
| NFR-MHP-014 | privacy | Audit-log path scoping | All recorded paths are vault-relative POSIX strings; 0 absolute paths, 0 backslash separators, 0 home-directory leaks; asserted by REQ-MHP-023 test |

## Success metrics

- **North star** — Approved write-tool invocations per active vault per week (per `discovery/obsidian-cli-mcp-expansion/strategy.md`). Counted from audit-log rows with `decision.outcome: "accepted"` across `vault_*`, `canvas_*`, `obsidian_cli_append_note` tools.
- **Supporting** — (a) Tier-A read-tool invocations per active vault per week (signals agents are actually using the read surface). (b) Share of pending proposals resolved within 5 minutes of enqueue (signals the agent-to-user loop is healthy).
- **Counter-metric** — Reject-rate: share of total proposal decisions with `decision.outcome: "rejected"`. A sustained reject-rate > 30% in week 1 indicates the auto-accept rule is mis-scoped or the agent is mis-targeting and should trigger a tier-policy review. (Pairs with `discovery/obsidian-cli-mcp-expansion/user-research.md` §2 H2 "bypass-request rate".)
- **Counter-metric** — Audit-log error rate: count of REQ-MHP-025 notifications per active vault per week. Non-zero indicates filesystem or permission issues degrading observability; sustained > 0 blocks the next release.
- **Counter-metric** — `client.id: "unknown"` share among non-sidepanel proposals: signals RISK-MHP-002 fallback frequency; sustained > 50% triggers a follow-up to teach known clients how to advertise.

## Release criteria

What must be true to ship.

- [ ] All `must` requirements pass acceptance.
- [ ] All NFRs met or explicitly waived with an ADR amendment.
- [ ] **ADR-019 authored and accepted** documenting tier policy, permanent deny-list (REQ-MHP-014), DevTools opt-in matrix (REQ-MHP-016/-017/-018), and the per-tool threat paragraphs from `specs/mcp-host-side-proposals/research.md` §Q3.
- [ ] **Audit log covered by unit tests** — REQ-MHP-022, REQ-MHP-023, REQ-MHP-024, REQ-MHP-025, REQ-MHP-026, REQ-MHP-039, REQ-MHP-040 each have at least one passing test.
- [ ] **Deny-list enforced via unit test** — REQ-MHP-014 and REQ-MHP-015 each have an assertion-by-name test that fails if any deny-list entry leaks into `tools/list` or through `obsidian_cli_read_command`.
- [ ] **`.mcp.json` migration covered by unit and fault-injection tests** — REQ-MHP-027, REQ-MHP-028, REQ-MHP-029, REQ-MHP-030, REQ-MHP-031 each have at least one passing test; the fault-injection suite covers read-only `.obsidian/`, partial-write, and disk-full cases.
- [ ] **System-prompt addendum asserted by unit test** — REQ-MHP-032 and REQ-MHP-033 each have at least one passing test; the test fails if the addendum string is absent, modified, or sourced from a user-mutable field.
- [ ] Single-accept-race stress test (REQ-MHP-006, NFR-MHP-012) green over 1000 runs in CI.
- [ ] Test plan executed; no critical bugs open.
- [ ] Documentation updated: `docs/adr/ADR-019` published; release notes summarise the migration, the DevTools opt-in surface, and the deny-list; user-facing settings copy reviewed by ux-designer.
- [ ] CLAR-MHP-002 user signoff captured (required to land alongside this feature only insofar as the active-feature-append auto-accept default is the one threshold that ships; full Tier-B thresholds remain deferred).

## Open questions / clarifications

- **CLAR-MHP-002 — Tier-policy thresholds.** *owner: pm.* Carried from `specs/mcp-host-side-proposals/workflow-state.md`. Research drafted defaults (`specs/mcp-host-side-proposals/research.md` §Q1). Only the active-feature-append rule (REQ-MHP-009) lands in this feature; the Tier-B thresholds in the same research section remain input to the follow-up spec. **Required action:** user signoff on the active-feature-append default before /spec:design freezes wording. Other thresholds do not block this feature.
- **CLAR-MHP-005 — Proposal-queue ephemerality.** *owner: pm.* Closed by REQ-MHP-038: ephemeral v1, shutdown emits one `discarded` audit row per remaining `pending` proposal. Persistence is deferred to a follow-up if pilot users report drops (see `specs/mcp-host-side-proposals/research.md` §"Recommendation").
- **CLAR-MHP-006 (new).** *owner: pm.* Header name for client identification — REQ-MHP-034 specifies `x-mcp-client-name` as the primary header, but the MCP transport spec does not formally define a client-name header. **Required action:** during /spec:design, confirm whether to (a) ship `x-mcp-client-name` as a Specorator convention, (b) parse the `clientInfo.name` field from the MCP `initialize` request and stash it server-side per connection, or (c) both. Recommendation: option (b) — parse from `initialize` — because that is the MCP-native path; (a) becomes a fallback. Does not block /spec:requirements acceptance because the requirement's intent (capture identity) is testable independent of the wire mechanism.

`/spec:clarify` recommended: yes (one open clarification: CLAR-MHP-002 user signoff; one new: CLAR-MHP-006 header mechanism).

## Out of scope

What we explicitly will not do this cycle (mirrors `## Non-goals` for the read-once reader; non-goals carry the verbatim "Specorator shall not …" phrasing).

- Bearer-token authentication.
- Webviewer surface (`web_*` tools, fresh Electron partition, domain allowlist).
- Tier-B vault writes (`file_create`, `file_rename`, `property_set`, `property_remove`, `daily_append`, `daily_prepend`, `history_restore`, `template_insert`, `task_toggle`).
- A new Obsidian view for proposals.
- Batch-proposal Plan card collapsing ≥3 proposals.
- 10-second undo window on auto-accepted writes.
- Telemetry beyond the audit log (no other JSONL under `.specorator/`).
- Agent-side `intent` enforcement (refusing to render Accept when `intent` is empty).
- Proposal-queue persistence across plugin restarts (deferred; see REQ-MHP-038).

---

## Quality gate

- [x] Goals and non-goals explicit. (7 goals, 8 non-goals.)
- [x] Personas / stakeholders named. (3 user personas + sidepanel agent + downstream PM.)
- [x] Jobs to be done captured. (6 JTBD entries.)
- [x] Every functional requirement uses EARS and has an ID. (REQ-MHP-001..040, each tagged with one of the five EARS patterns.)
- [x] Acceptance criteria testable. (Each REQ carries a Given/When/Then with concrete observable outcomes.)
- [x] NFRs listed with targets. (14 NFRs across performance, security, observability, accessibility, compatibility, reliability, privacy.)
- [x] Success metrics defined (including a counter-metric). (North star + 2 supporting + 3 counter-metrics.)
- [x] Release criteria stated. (10 criteria including ADR-019, unit-tested audit log, unit-tested deny-list, fault-injection-tested migration, unit-tested addendum.)
- [ ] `/spec:clarify` returned no open questions. (2 open clarifications remain: CLAR-MHP-002 user signoff; CLAR-MHP-006 new — header mechanism for client identification. Recommend `/spec:clarify` before /spec:design.)

**Gate status: FAIL** — one quality-gate checkbox unchecked because of open clarifications. Resolve CLAR-MHP-002 (user signoff on active-feature-append default) and CLAR-MHP-006 (client-identification mechanism) via `/spec:clarify`, then re-run the gate.
