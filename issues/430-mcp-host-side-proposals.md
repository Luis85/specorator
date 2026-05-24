---
issue_number: 430
title: "Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX"
feature_slug: mcp-host-side-proposals
type: feature
roadmap_status: planned
stage: implementation
github_url: https://github.com/Luis85/specorator/issues/430
labels: []
milestone: null
assignees: []
created_at: 2026-05-24
updated_at: 2026-05-24
---

# Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

> Issue for `specs/mcp-host-side-proposals/`. Created by `/spec:start`.

## Summary

The plugin's in-process MCP server (ADR-013 / ADR-018) queues writes via an `ObsidianMcpServerAdapter.proposalStore`, but no UI calls `acceptProposal` / `rejectProposal` / `getProposals`. The store is orphaned: writes from any MCP client (Specorator sidepanel, Claude Desktop, terminal `claude`, Cursor) silently never commit, and the agent confabulates success.

This feature makes the MCP server **host-agnostic and terminal-driveable end-to-end** by:

1. Surfacing pending proposals as MCP tools (`proposal_list`, `proposal_get`, `proposal_accept`, `proposal_reject`) so any client can list and decide proposals — no new Obsidian view required.
2. Wiring the existing `acceptProposal` / `rejectProposal` methods to actually run.
3. Expanding Tier-A read tools per the cross-perspective synthesis in `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md`.
4. Adding proposal tiering (auto-accept / batch / always-prompt / forbid), 10-second undo window, and an `intent` field — gated on RAT-2.
5. Hardening: move `.mcp.json` to `.obsidian/mcp.local.json` so it stops syncing via Git/iCloud/Syncthing; add an audit log under `.specorator/mcp-audit.log`.
6. Authoring ADR-019: tiered CLI surface policy and permanent deny-list.

Also in scope — opt-in DevTools surface (per user request, overrides critic's blanket deny):
- **Low-risk read tools** (default on once setting toggled): `dev:screenshot`, `dev:errors`, `dev:console`. Useful for agent-driven debugging, screenshot-to-doc loops, error triage.
- **High-risk tools behind explicit opt-in** (off by default, separate per-tool toggle, loud warning in settings UI): `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools`. Threat model documented in ADR-019.
- These tools always go through the proposal pipeline so the audit log captures every invocation, even if the user has elected to auto-accept.

Out of scope (deferred to follow-up specs):
- Bearer-token authentication (loopback + proposal-gate considered sufficient for single-user threat model — see CLAR-MHP-001).
- Sandboxed webviewer (own spec — fresh Electron partition + domain allowlist required; see CLAR-MHP-003).
- Tier-B vault-write expansion that depends on the proposal infrastructure landing here.

## Acceptance criteria

- [ ] Any MCP client (Specorator sidepanel, Claude Desktop, terminal `claude`, Cursor) can call `proposal_list` and see all pending writes.
- [ ] `proposal_accept` invokes the queued mutation; `proposal_reject` discards it; both update audit log.
- [ ] The existing 6 MCP write tools (`canvas_*`, `vault_write_note`, `vault_append_to_note`, `obsidian_cli_append_note`) actually commit on accept (vault changes on disk).
- [ ] Specorator's own sidepanel agent gets a system-prompt addendum that prevents confabulating success on `pending` responses.
- [ ] 12 Tier-A read tools added per SYNTHESIS.md Phase 1 list.
- [ ] `.mcp.json` is written to `.obsidian/mcp.local.json` (not vault root). Existing root file is migrated on first start.
- [ ] Audit log appended at `.specorator/mcp-audit.log` on every accept/reject.
- [ ] ADR-019 filed and accepted documenting tier policy, permanent deny-list, and per-DevTools-tool opt-in matrix.
- [ ] `dev:screenshot`, `dev:errors`, `dev:console` exposed as MCP tools when DevTools setting enabled; `dev:dom`, `dev:cdp`, `dev:debug`, `dev:mobile`, `devtools` exposed only when their per-tool setting is also enabled.
- [ ] All work is terminal-driveable — no UI-only flows; every host-side action is reachable from CLI.

## Links

- Spec folder: `specs/mcp-host-side-proposals/`
- Workflow state: `specs/mcp-host-side-proposals/workflow-state.md`
- Discovery synthesis (upstream evidence): `discovery/obsidian-cli-mcp-expansion/SYNTHESIS.md`
- Related ADRs: ADR-013 (MCP server), ADR-018 (CLI-backed tools)
- GitHub: https://github.com/Luis85/specorator/issues/430

## Changelog

| Date | Stage | Event |
|---|---|---|
| 2026-05-24 | idea | Issue created by `/spec:start` |
| 2026-05-24 | research | `idea.md` complete (gate PASS); handed off to analyst for `/spec:research` |
| 2026-05-24 | requirements | `research.md` complete (gate PASS); CLARs -003/-004 closed, -005 surfaced; handed off to pm for `/spec:requirements` |
| 2026-05-24 | design | `requirements.md` complete (gate FAIL — 2 open CLARs); 40 REQs + 14 NFRs; CLAR -005 closed by REQ-MHP-038, -006 new; user should run `/spec:clarify` before `/spec:design` |
| 2026-05-24 | specification | `design.md` complete (gate PASS, all 7 boxes ticked); Parts A/B/C drafted by ux-designer/ui-designer/architect; ADR-019 authored (Proposed); requirements.md amended (7 rewords + 6 new REQs MHP-041..046); 60-row coverage table closed; 5 new architecture-level risks RISK-MHP-011..015 |
| 2026-05-24 | tasks | `spec.md` complete (gate PASS); SPEC-MHP-NNN sections + 56 test scenarios + 40 edge cases + 5 new settings keys; 60/60 REQ trace coverage; user may run `/spec:analyze` (optional) before `/spec:tasks` |
| 2026-05-24 | implementation | `tasks.md` complete (56 tasks across 10 packages); 46/46 REQ + 14/14 NFR coverage; longest dep chain depth 8; baseline-capture T-MHP-001 gates all other work; ready for `/spec:implement T-MHP-001` |
