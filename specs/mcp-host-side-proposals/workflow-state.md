---
feature: mcp-host-side-proposals
area: MHP
current_stage: design
status: active
last_updated: 2026-05-24
last_agent: pm
artifacts:
  idea.md: complete
  research.md: complete
  requirements.md: complete
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

# Workflow state — mcp-host-side-proposals

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | complete |
| 3. Requirements | `requirements.md` | complete |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Section semantics + status enums: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

_None yet._

## Blocks

_None._

## Hand-off notes

```
2026-05-24 (orchestrator): Feature bootstrapped. Existing discovery artifacts
                           live under discovery/obsidian-cli-mcp-expansion/
                           (SYNTHESIS.md is the entry point) — analyst should
                           cite them as upstream evidence during /spec:research.
2026-05-24 (analyst):      idea.md complete; gate PASS. Open CLARs MHP-002/
                           003/004 carried forward to research with current
                           resolution status noted. Researcher should converge
                           on tier-policy thresholds (CLAR-MHP-002) and
                           confirm webviewer carve-out (CLAR-MHP-003) before
                           handoff to PM. Q4–Q7 added in idea.md surface
                           audit-log format, tool naming, system-prompt
                           addendum, DevTools settings ergonomics as new
                           research-stage gaps.
2026-05-24 (analyst):      research.md complete; gate PASS. All 7 research
                           questions answered. Webviewer carve-out confirmed
                           (CLAR-MHP-003 closed). DevTools threat-model text
                           ready for ADR-019 (CLAR-MHP-004 closed). New
                           CLAR-MHP-005 surfaced: proposal-queue ephemerality
                           on plugin restart — recommend ephemeral v1 with
                           shutdown logging; PM to confirm. New risks
                           RISK-MHP-001..008 documented; PM should map to
                           requirements (esp. RISK-MHP-001 dual-accept race,
                           RISK-MHP-008 system-prompt-addendum drift). Tool
                           naming verdict: `workflow_proposal_*` namespace.
2026-05-24 (pm):           requirements.md complete; 40 REQs + 14 NFRs + 6
                           JTBDs. Gate FAIL on 2 open CLARs. CLAR-MHP-005
                           closed by REQ-MHP-038 (ephemeral v1 + shutdown
                           audit rows). New CLAR-MHP-006 surfaced: client
                           identification mechanism (`x-mcp-client-name`
                           header vs MCP-native `clientInfo.name` from
                           initialize). REQ-MHP-014 deny-list explicitly
                           EXCLUDES the 8 DevTools commands (CLAR-MHP-004
                           user override over SYNTHESIS deny-list).
                           Recommend `/spec:clarify` to resolve CLAR-MHP-002
                           (user signoff on REQ-MHP-009) and CLAR-MHP-006
                           before `/spec:design`.
2026-05-24 (pm-clarify):   12 new CLARs surfaced (CLAR-MHP-007..018) against
                           the PRD. Ambiguity profile: 3 missing-quantifier,
                           3 missing-error-path, 2 missing-settings-defn, 2
                           file-system semantics, 1 active-slug rule, 1
                           UX surfacing. No PRD rewrite recommended.
2026-05-24 (orchestrator): All 14 open CLARs resolved (user signoff on
                           judgment calls -002/-006/-017; defaults accepted
                           on the remaining 11). Architect MUST apply the
                           resolution wording into requirements.md during
                           /spec:design: (a) reword REQ-MHP-013, -027, -030,
                           -031, -034, -038 and NFR-MHP-003 per resolutions;
                           (b) add new REQs for CLAR-MHP-007 (active-slug
                           rule), -009 (write-tool response shape), -010
                           (devtoolsAutoAcceptLowRisk setting), -011
                           (post-accept failure path), -013 (error-row
                           triggers), -017 (NotificationPort + status-bar).
                           Stage 3 gate now PASS.
```

## Open clarifications

- [x] CLAR-MHP-001 — Bearer-token policy. *(resolved 2026-05-24: no token for this feature; loopback + proposal-gating + read allow-list. Revisit if multi-user.)*
- [x] CLAR-MHP-002 — Tier-policy thresholds. *(resolved 2026-05-24: yes, auto-accept appends inside `specs/<active>/*.md` per REQ-MHP-009; both `vault_append_to_note` and `obsidian_cli_append_note`; audit row written; 10-second undo window deferred to Tier-B follow-up.)*
- [x] CLAR-MHP-003 — Webviewer scope. *(resolved 2026-05-24: carve out into separate spec; this feature emits `kind` discriminator only for forward compatibility — `research.md` Q2.)*
- [x] CLAR-MHP-004 — DevTools opt-in surface. *(resolved 2026-05-24: per-tool threat model drafted in `research.md` Q3 and will be embedded verbatim in ADR-019.)*
- [x] CLAR-MHP-005 — Proposal-queue persistence across plugin restarts. *(resolved 2026-05-24 by REQ-MHP-038: ephemeral v1, log discarded proposals on shutdown, persistence deferred to follow-up.)*
- [x] CLAR-MHP-006 — Client identification mechanism. *(resolved 2026-05-24: parse `clientInfo.name` from the MCP `initialize` request; fall back to `unknown` when absent or malformed. Standard MCP handshake field; works with any compliant client. Architect to reword REQ-MHP-034 accordingly.)*
- [x] CLAR-MHP-007 — Active-feature slug resolution rule. *(resolved 2026-05-24: scan `specs/*/workflow-state.md`; the active slug is the single feature whose YAML frontmatter `status: active`. Zero matches → no auto-accept (queue as pending). Multiple matches → no auto-accept + `LoggerPort.warn` with the matching slugs. Architect to add explicit REQ.)*
- [x] CLAR-MHP-008 — Concurrency window for the dual-accept race. *(resolved 2026-05-24: replace "scheduler tick" wording with "per-proposal-id mutex held across the entire accept critical section". Observable invariant: two concurrent `workflow_proposal_accept` calls on the same proposal id MUST result in exactly one mutation execution; the second call returns `proposal_not_pending` error. NFR-MHP-012 fuzz: 1000 concurrent-pair runs, asserts mutate-callback invocation count === 1.)*
- [x] CLAR-MHP-009 — Behaviour of in-scope writes outside the auto-accept carve-out. *(resolved 2026-05-24: synchronous response shape for every write tool: `{ proposalId: string, status: 'pending' | 'accepted', tool: string }`. Auto-accept path returns `accepted` immediately; all others return `pending`. Queue capacity 1000; on overflow return MCP error code `queue_full`. Architect to add explicit REQ.)*
- [x] CLAR-MHP-010 — DevTools auto-accept setting. *(resolved 2026-05-24: setting key `devtoolsAutoAcceptLowRisk: boolean`, default `false`. When `true`, auto-accepts proposals for the three low-risk DevTools tools only (`dev:screenshot`, `dev:errors`, `dev:console`). Has NO effect on high-risk DevTools tools (REQ-MHP-020 always-prompt invariant). Architect to add explicit REQ.)*
- [x] CLAR-MHP-011 — Vault-mutation failure after accept. *(resolved 2026-05-24: proposal status transitions to `error` (terminal); audit row written with `decision.outcome: error` and populated `result.error`; MCP response is error with code `write_failed` and a `proposalId` reference. Proposal stays in store for inspection until plugin shutdown. Architect to add explicit REQ.)*
- [x] CLAR-MHP-012 — Escape-hatch path-traversal and command-allow-list source. *(resolved 2026-05-24: (a) argument values must additionally reject `..` path segments and absolute path prefixes (`/`, `C:\`, `\\?\`); (b) the allow-list is a hard-coded server-side constant equal to the 12 Tier-A CLI command names in REQ-MHP-011 — not user-editable. Architect to reword REQ-MHP-013.)*
- [x] CLAR-MHP-013 — Audit-row `error` outcome triggers. *(resolved 2026-05-24: exhaustive list — vault-write failure post-accept (CLAR-MHP-011), tool body throws inside `mutate` callback, schema-validation failure on inbound payload, proposal-id-not-found on accept/reject. All four emit `decision.outcome: error` row AND `LoggerPort.warn`. Architect to add explicit REQ.)*
- [x] CLAR-MHP-014 — `.gitignore` line idempotence and encoding. *(resolved 2026-05-24: (a) match rule — exact-line match for `.obsidian/mcp.local.json` (no glob detection; idempotent if line already present); (b) appended line uses LF (no platform branching); (c) check runs once at migration time only, not on every start. Architect to reword REQ-MHP-031.)*
- [x] CLAR-MHP-015 — Migration byte-equality on JSON files. *(resolved 2026-05-24: semantic equality (deep object equality) is the acceptance criterion. Migration re-serialises via `JSON.stringify(value, null, 2)`; read-back verifies deep equality (not byte equality). Architect to reword REQ-MHP-027 and REQ-MHP-030.)*
- [x] CLAR-MHP-016 — Shutdown audit-write durability. *(resolved 2026-05-24: (a) best-effort, non-blocking from Obsidian's perspective; (b) 500 ms upper-bound time budget — proposals not flushed within window are silently dropped; (c) non-graceful exits (forced quit, OS kill, crash) are explicitly out of scope. Consequence: proposals silently lost, audit log inconsistent — accepted as a v1 trade-off. Architect to reword REQ-MHP-038.)*
- [x] CLAR-MHP-017 — User-facing surfacing of pending proposals when sidepanel is closed. *(resolved 2026-05-24: dual surface — (a) `NotificationPort` non-blocking notice on every new pending proposal (severity: info; clickable when feasible); (b) Obsidian status-bar badge showing pending-proposal count (`Plugin.addStatusBarItem`). Both surfaces in scope for this feature. Architect to add explicit REQ.)*
- [x] CLAR-MHP-018 — NFR-MHP-003 baseline. *(resolved 2026-05-24: baseline is "time to spawn the underlying `obsidian-cli` subprocess from within the plugin process, excluding MCP framing". The 20 ms budget covers JSON serialisation of the result. Measured at the MCP server boundary. Architect to reword NFR-MHP-003.)*


