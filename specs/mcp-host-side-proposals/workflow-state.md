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
```

## Open clarifications

- [x] CLAR-MHP-001 — Bearer-token policy. *(resolved 2026-05-24: no token for this feature; loopback + proposal-gating + read allow-list. Revisit if multi-user.)*
- [ ] CLAR-MHP-002 — Tier-policy thresholds. Research answered (`research.md` Q1) with defaults; user signoff still required (only auto-accept default that ships here is REQ-MHP-009 active-feature-append rule — other Tier-B thresholds deferred to follow-up).
- [x] CLAR-MHP-003 — Webviewer scope. *(resolved 2026-05-24: carve out into separate spec; this feature emits `kind` discriminator only for forward compatibility — `research.md` Q2.)*
- [x] CLAR-MHP-004 — DevTools opt-in surface. *(resolved 2026-05-24: per-tool threat model drafted in `research.md` Q3 and will be embedded verbatim in ADR-019.)*
- [x] CLAR-MHP-005 — Proposal-queue persistence across plugin restarts. *(resolved 2026-05-24 by REQ-MHP-038: ephemeral v1, log discarded proposals on shutdown, persistence deferred to follow-up.)*
- [ ] CLAR-MHP-006 — Client identification mechanism. REQ-MHP-034 specifies `x-mcp-client-name` header but MCP-native path is parsing `clientInfo.name` from the `initialize` request. Resolve at /spec:design; testable intent (capture identity, fall back to `unknown`) is wire-mechanism-agnostic.
- [ ] CLAR-MHP-007 — Active-feature slug resolution rule. REQ-MHP-009 auto-accept depends on "the active feature slug `<slug>` is resolvable from `specs/<slug>/workflow-state.md`" but the vault may contain many feature folders with their own `workflow-state.md`. Specify the disambiguation rule: e.g. "the single feature whose frontmatter `status: active` is true" (and behaviour when zero or two-plus features carry `status: active`). A satisfactory answer would name the YAML field consulted, the expected single-match invariant, and the fallback when the invariant is violated (no auto-accept? error? notice?).
- [ ] CLAR-MHP-008 — Concurrency window for the dual-accept race. REQ-MHP-006 phrases the trigger as "within the same scheduler tick" — a JS-runtime artefact that is not testable from outside the process. NFR-MHP-012 demands "0 dual-execution events across 1000 dual-accept fuzz runs" but does not define what the fuzz runs simulate. A satisfactory answer would replace "scheduler tick" with an observable invariant (e.g. "two `workflow_proposal_accept` calls whose request-receipt timestamps fall within 1 ms of each other on the same proposal id MUST execute the underlying mutation exactly once") and name the locking primitive's contract (per-id mutex held across the entire accept critical section).
- [ ] CLAR-MHP-009 — Behaviour of in-scope writes outside the auto-accept carve-out. REQ-MHP-008 routes all 6 existing write tools through the proposal pipeline; REQ-MHP-009 only auto-accepts two append tools when the path matches the active-feature pattern. What is the explicit status returned to the calling MCP client for the non-auto-accept cases (`vault_write_note`, `canvas_*`, appends outside the active feature)? Are they `pending` synchronously with the proposal id in the response payload so the agent can reference it? A satisfactory answer is one new REQ stating the synchronous response shape for queued writes (status string, proposal id field name, error policy when queue capacity is exceeded).
- [ ] CLAR-MHP-010 — DevTools auto-accept setting is unnamed. REQ-MHP-019 acceptance assumes "auto-accept on the low-risk three is true" and REQ-MHP-020 references "any auto-accept setting" but no requirement defines the setting key, default value, or scope (master vs per-tool). A satisfactory answer would add a REQ in the form "the user setting `devtools.autoAcceptLowRisk` defaults to false and, when true, auto-accepts proposals for the three low-risk DevTools tools" and explicitly forbid the same setting from affecting any high-risk tool (intersection with REQ-MHP-020 already-always-prompt rule).
- [ ] CLAR-MHP-011 — Vault-mutation failure after accept. REQ-MHP-025 covers the audit-log-write failure path but the inverse — vault mutation fails after `workflow_proposal_accept` is called — is unspecified. What is the proposal's final status (`accepted`? `error`?), what `decision.outcome` is logged, and what does the MCP response look like (error code, payload)? A satisfactory answer is one REQ stating: on vault-write failure post-accept, the proposal status becomes `error`, an audit row with `decision.outcome: "error"` and a populated `result.error` is written, and the MCP response is an error result with code `write_failed`.
- [ ] CLAR-MHP-012 — Escape-hatch path-traversal and command-allow-list source. REQ-MHP-013 regex blocks shell metacharacters but does NOT block `..` path traversal or absolute paths in argument strings; and the "configured read-only allow-list" is referenced without naming its source (settings field? hard-coded constant? subset of the 12 Tier-A tool names?). A satisfactory answer would clarify (a) whether the regex must additionally reject arguments containing `..` segments or absolute path prefixes, and (b) the canonical source-of-truth for the allow-list (e.g. "a hard-coded server-side constant identical to the 12 Tier-A CLI command names in REQ-MHP-011, not user-editable").
- [ ] CLAR-MHP-013 — Audit-row `error` outcome trigger inventory. REQ-MHP-022 enumerates decision outcomes "(auto-accept, user-accept, client-accept, reject, or error)" but no REQ defines what conditions emit an `error` row. Candidates: vault mutation fails (see CLAR-MHP-011), tool body throws, proposal-id collision, schema-validation failure on inbound payload. A satisfactory answer would enumerate the exhaustive list of trigger conditions that produce a `decision.outcome: "error"` row vs surfacing only via LoggerPort.
- [ ] CLAR-MHP-014 — `.gitignore` line idempotence and encoding. REQ-MHP-031 says the plugin "shall ensure" the `.gitignore` contains a line matching `.obsidian/mcp.local.json` but does not specify (a) whether an existing matching line (with trailing whitespace, comment suffix, glob like `.obsidian/*`) is treated as already covering it, (b) whether the appended line uses LF or platform-native line endings, (c) whether the plugin re-runs the check on every start or only at migration time. A satisfactory answer names: the substring match rule (exact-line vs glob-aware), the line-ending policy (always LF), and the trigger frequency (once at migration only).
- [ ] CLAR-MHP-015 — Migration byte-equality on JSON files. REQ-MHP-027 demands the destination file "byte-match the source" — but if the migration re-serialises via `JSON.parse`/`stringify` (key order, whitespace, BOM) the bytes will differ even when semantically identical. REQ-MHP-030 strengthens this to "byte-equal value" of nested fields. A satisfactory answer would clarify whether the migration must copy raw bytes verbatim (preserving original formatting, BOM, line endings) or whether semantic equality (deep object equality) is the acceptance criterion — and which path is verified by the read-back check.
- [ ] CLAR-MHP-016 — Shutdown audit-write durability. REQ-MHP-038 requires the plugin to write one `discarded` audit row per pending proposal on shutdown, but Obsidian's `onunload` path may complete before async filesystem writes flush, and forced-quit / OS-kill cannot be intercepted. A satisfactory answer would state: (a) whether the shutdown write is synchronous (blocking onunload) or best-effort, (b) the upper-bound time budget before the plugin gives up, and (c) whether non-graceful exits are explicitly out-of-scope (with the consequence — proposals silently lost, audit log inconsistent — accepted).
- [ ] CLAR-MHP-017 — User-facing surfacing of pending DevTools / non-auto-accept proposals issued by external clients. REQ-MHP-020 forces `dev:cdp` to remain pending regardless of settings; with the sidepanel possibly closed (the whole feature's premise is terminal-driveable), how does the user learn a proposal needs attention? Notification? Status-bar badge? Only the calling client knows? A satisfactory answer would name the in-Obsidian surface (or explicitly say "no Obsidian-side notification — discovery is the calling MCP client's responsibility") so the architect knows whether a NotificationPort path is in scope.
- [ ] CLAR-MHP-018 — NFR-MHP-003 baseline ambiguity for Tier-A read latency. The Tier-A read tools are themselves CLI invocations, so "vs direct CLI invocation" measures only the MCP-server wrapping overhead — but the NFR phrasing suggests a comparison against an externally-spawned CLI. A satisfactory answer would re-anchor the baseline as "the time to spawn the underlying `obsidian-cli` subprocess from within the plugin process, excluding MCP framing", and confirm whether the 20 ms budget covers JSON serialisation of the result or only the spawn dispatch.


