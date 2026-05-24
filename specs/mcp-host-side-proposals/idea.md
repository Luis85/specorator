---
id: IDEA-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX
stage: idea
feature: mcp-host-side-proposals
status: accepted
owner: analyst
created: 2026-05-24
updated: 2026-05-24
---

# Idea — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

## Problem statement

The plugin's in-process MCP server (per `docs/adr/ADR-013-obsidian-mcp-server.md` and `docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md`) already queues every write into an `ObsidianMcpServerAdapter.proposalStore`, but nothing in the plugin actually calls `acceptProposal` / `rejectProposal` / `getProposals`. The store is orphaned: any MCP client — the Specorator sidepanel agent, Claude Desktop, terminal `claude`, Cursor — can issue a write, see a `pending` response, and the agent then confabulates success while the vault never changes. The same surface is also too narrow (no Tier-A read tools), too leaky (`.mcp.json` lives at vault root and syncs through Git/iCloud/Syncthing per `discovery/obsidian-cli-mcp-expansion/critique.md` §7), and gives the user no auditable record of what an agent attempted. This blocks every downstream "agent drives my vault" use case the user has asked for, and it disproportionately hurts power users who run agents from the terminal and never open the Obsidian UI during a session.

## Target users

- **Primary — Focused Builder.** Spec-driven developer running Specorator end-to-end with an agent at the wheel (see persona in `discovery/obsidian-cli-mcp-expansion/user-research.md` §1). Needs to accept/reject writes from wherever they're working — sidepanel, terminal `claude`, Cursor — without context-switching into Obsidian.
- **Secondary — PKM Tinkerer.** Power user wiring multiple MCP clients (Claude Desktop, Cursor, custom scripts) into a shared vault. Needs the audit log and tier policy because they touch volume of writes that linear queueing collapses under (`discovery/obsidian-cli-mcp-expansion/critique.md` §5).
- **Secondary — Solo Consultant.** Operates on client vaults; cannot tolerate silent confabulation or vault-root config leakage when the vault is synced to a client repo (`discovery/obsidian-cli-mcp-expansion/user-research.md` §2 H3).

## Desired outcome

When this lands and is adopted, an MCP client of any flavour — including the terminal `claude` with zero Obsidian UI visible — can list pending proposals, read their diffs, accept or reject them, and trust that accepted writes commit to disk. Every accept/reject leaves an append-only audit trail under `.specorator/mcp-audit.log`. The plugin ships 12 Tier-A read tools (per `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 1 — Tier A safe reads") so agents can usefully navigate the link graph, outlines, templates, daily notes, and history without ever entering the write path. The Specorator sidepanel agent stops confabulating success on `pending` responses. The configuration file moves out of the vault root and stops syncing accidentally. An opt-in DevTools surface lets users who want agent-driven screenshot/error/console workflows enable them on a single toggle, with the riskier `dev:dom` / `dev:cdp` / `dev:debug` / `dev:mobile` / `devtools` tools each behind their own per-tool opt-in with a loud warning. `docs/adr/ADR-019` codifies the tier policy and the permanent deny-list so future contributors cannot quietly re-expose the dangerous surface.

## Constraints

- **Time.** Tier-B writes that depend on tier-policy thresholds (CLAR-MHP-002) and webviewer scope (CLAR-MHP-003) are explicit follow-up specs, not slip-ins. Keep this feature scoped to the proposal pipeline + Tier-A reads + DevTools opt-in + ADR-019.
- **Technical — host-agnostic.** Every host-side action (list, get, accept, reject) must be reachable as an MCP tool. No Obsidian-only UI flow may be the sole path, per user direction recorded against CLAR-MHP-001 / CLAR-MHP-004.
- **Technical — single-user threat model.** No bearer-token authentication in this feature (CLAR-MHP-001 resolved by the user); rely on loopback binding + proposal-gating + read allow-list. Revisit when multi-user enters scope.
- **Policy.** Permanently denied CLI surface from `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Permanently denied" must be enforced at the server layer, not behind a setting toggle (`discovery/obsidian-cli-mcp-expansion/critique.md` Risk R1).
- **Compliance.** `.mcp.json` cannot remain at vault root; it must move to `.obsidian/mcp.local.json` and ship a `.gitignore` entry so synced vaults stop leaking the config (`discovery/obsidian-cli-mcp-expansion/critique.md` §7).
- **Backwards compatibility.** Existing `.mcp.json` at vault root must migrate on first start without losing user-configured fields.
- **Architectural.** Builds on ADR-013 (in-process MCP server) and ADR-018 (CLI-backed tools); must not regress either ADR.

## Open questions

> These become the research agenda in stage 2. The first three are tracked verbatim under `Open clarifications` in `specs/mcp-host-side-proposals/workflow-state.md`.

- **Q1 (CLAR-MHP-002).** Tier-policy thresholds — which writes auto-accept vs prompt? Need user signoff before `/spec:design` fixes them. Inputs: `discovery/obsidian-cli-mcp-expansion/ux.md` §1 (per-class + per-tool toggles, `task toggle` ON, `property:set` ON when value ≤ 80 chars, `append_note` OFF) and `discovery/obsidian-cli-mcp-expansion/critique.md` §5 (auto-accept only for appends inside `specs/{slug}/` of the active feature).
- **Q2 (CLAR-MHP-003).** Webviewer scope — ship in this feature or carve out as separate spec? Critic recommends own ADR + fresh Electron partition POC (`discovery/obsidian-cli-mcp-expansion/critique.md` §4). Current intent: carve out, but confirm during research.
- **Q3 (CLAR-MHP-004 — already decided, document the threat model).** DevTools opt-in matrix. Decision is fixed (`dev:screenshot` + `dev:errors` + `dev:console` on a single DevTools toggle; `dev:dom` / `dev:cdp` / `dev:debug` / `dev:mobile` / `devtools` behind per-tool opt-in with warning). The research deliverable is the **threat model the user is accepting** by enabling each tool, to be embedded in ADR-019 so the decision is recorded irreversibly.
- **Q4.** Audit-log format and rotation — JSONL append-only at `.specorator/mcp-audit.log` is the directional intent; need to confirm fields (timestamp, client identifier, tool name, proposal id, decision, intent string, vault-relative path(s) affected) and a rotation policy that doesn't grow unbounded.
- **Q5.** MCP-tool naming for proposal operations — `proposal_list` / `proposal_get` / `proposal_accept` / `proposal_reject` is the issue-#430 proposal; confirm against MCP idiomatic conventions and existing Specorator tool naming (`obsidian_cli_*`, `vault_*`, `canvas_*`).
- **Q6.** Sidepanel-agent system-prompt addendum — what is the minimum-viable wording that prevents confabulating success on `pending` responses without confusing the agent into refusing legitimate writes?
- **Q7.** How to surface the DevTools settings in the plugin settings tab so the user-accepted threat model is unmissable (placement, warning copy, per-tool toggle ergonomics). Light input for `ux-designer` later; the idea-stage question is whether existing settings-tab patterns suffice.

## Out of scope (preliminary)

- **Bearer-token authentication.** Loopback + proposal gate + read allow-list is sufficient for the single-user threat model the user has accepted (CLAR-MHP-001). Will be reopened if multi-user scope appears.
- **Sandboxed webviewer.** Needs its own spec, ADR, and fresh-partition POC (`discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 4"). Permanently denied here.
- **Tier-B vault-write expansion.** `obsidian_cli_file_create`, `file_rename`, `property_set/remove`, `daily_append/prepend`, `history_restore`, `template_insert`, `task_toggle` — all depend on the proposal infrastructure landing here and on RAT-2 results. Own follow-up spec.
- **Top-10 dangerous deny-list.** `eval`, `dev:cdp` (as a write), `plugin:install/uninstall/enable/disable/reload`, `theme:install/uninstall/set`, `snippet:enable/disable`, `sync` on/off, `publish:*`, `command` palette executor, `restart`, `reload`, `vault:open`, `workspace:load`, `tab:open`, `file delete`. These are **permanently denied**, not deferred — codified in ADR-019.
- **New Obsidian view for proposals.** User has explicitly decided not to build one; accept/reject is achieved via MCP tools so terminal/external clients can drive the workflow without the Obsidian UI being open.
- **Telemetry beyond the audit log.** No JSONL telemetry under `.specorator/telemetry/` in this feature; audit log is the only file written.
- **Batch-proposal card UX.** `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` §"Phase 2" mentions a Plan card that collapses ≥3 proposals — this is a UI refinement that belongs with the Tier-B follow-up spec, not here. The proposal pipeline must be data-model-compatible with it, but no card UI ships here.
- **10-second undo window on auto-accepted writes.** Same reasoning as batch card — Phase-2/Tier-B concern.
- **`intent` field enforcement on the agent side.** The proposal schema can carry `intent` from day one (Q4), but enforcement (refusing to render Accept without it) is a Tier-B feature.

## References

- Issue PRD shadow — `issues/430-mcp-host-side-proposals.md`
- Discovery synthesis — `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md` (especially §"Recommended phased path" Phases 0–1 and §"Permanently denied")
- Discovery critique — `discovery/obsidian-cli-mcp-expansion/critique.md` §§1, 4, 5, 6, 7 (deny-list rationale, exfil chain, proposal-store load, loopback boundary, `.mcp.json` leakage)
- Discovery UX brief — `discovery/obsidian-cli-mcp-expansion/ux.md` §§1, 3 (tool classes, webviewer-pane-never-inline)
- Discovery strategy — `discovery/obsidian-cli-mcp-expansion/strategy.md` (North Star: approved invocations + approval-rate guardrail)
- Discovery engagement — `discovery/obsidian-cli-mcp-expansion/engagement.md` (core loop, fatigue model)
- Discovery user-research — `discovery/obsidian-cli-mcp-expansion/user-research.md` §§1–3 (personas, hypotheses, RATs — RAT-1 directly informs the loopback-vs-bearer decision in CLAR-MHP-001)
- Discovery divergence — `discovery/obsidian-cli-mcp-expansion/divergence.md` (14 use-case catalogue informing Tier-A read selection)
- Discovery research — `discovery/obsidian-cli-mcp-expansion/research.md` (analyst inventory)
- Workflow state — `specs/mcp-host-side-proposals/workflow-state.md` (CLAR-MHP-001..004)
- Architectural precedents — `docs/adr/ADR-013-obsidian-mcp-server.md`, `docs/adr/ADR-018-mcp-tools-backed-by-obsidian-cli.md`
- ADR to be authored as part of this feature — `docs/adr/ADR-019` (tier policy + permanent deny-list + DevTools opt-in matrix)

---

## Quality gate

- [x] Problem statement is one paragraph and understandable to a non-expert.
- [x] Target users named.
- [x] Desired outcome stated.
- [x] Constraints listed.
- [x] Open questions captured.
- [x] Scope is bounded — no "boil the ocean" framing.
