---
feature: chat-core
area: CC
current_stage: idea
status: active
last_updated: 2026-05-24
last_agent: orchestrator (P1 bootstrap)
epic: claudian-reboot
phase: P1
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: pending
  research.md: pending
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

# Workflow state — chat-core (P1)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | pending |
| 2. Research | `research.md` | pending |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P1 (chat core)

P0 (plugin-shell-reboot) merged to `next` (#432). P1 is the first vertical chat
slice on the gutted shell. Scope (charter §4, P1 row): provider-agnostic
`ChatRuntime` port + Claude provider (CLI) + single-thread chat + streaming +
basic message render + minimal toolbar (send). Surfaces: core/runtime,
providers/claude, messages.css, input.css, container, variables, header.

Mandatory inputs (charter §6 + READ FIRST): `specs/claudian-reboot/parity-charter.md`
(§3 inventory, §4 phase map, §5 parity acceptance), the per-surface audits
`specs/claudian-reboot/claudian-audit-{frontend,backend}.md`, and `D:\Projects\claudian-main`
as the visual/parity truth. Reuse the discarded AUX/MPS chat design + `--sp-*` tokens
(on `develop`/history) as reference, not copy.

## Open clarifications — charter §6 decisions to bless BEFORE design/impl

- [ ] CLAR-CC-001 — **`ChatRuntime` port shape.** Charter §6: the runtime port uses
  injected callback setters (stream/tool/lifecycle), which bends ADR-008's
  "narrow method-only port" style. File an ADR blessing the shape before P1 design
  proper. Human/architect decision.
- [ ] CLAR-CC-002 — **Secrets surface (SecretStorePort + `app.secretStorage`).**
  Epic constraint: secrets → `app.secretStorage` behind a `SecretStorePort`, never
  `data.json`. **API CONFIRMED PRESENT (2026-05-24):** `App.secretStorage: SecretStorage`
  exists in the obsidian typings (`obsidian.d.ts:458`; `class SecretStorage:5463`) at
  obsidian 1.12.3 ≥ `minAppVersion 1.12.7` — **no NG6 escalation needed**. Remaining
  (scope): does P1's Claude **CLI** path even need a stored secret? The deleted
  `ClaudeSubprocessAdapter` used the user's own `claude` login (no key). If so, the
  `SecretStorePort` + its ADR **defers** to the first API-key transport (later phase);
  P1 stays secret-vacuous. Confirm at requirements.
- [ ] CLAR-CC-003 — **Provider/runtime scope for P1.** Charter: Claude COMPLETE
  first; Codex/Opencode capability-gated (P9). Confirm P1 = Claude CLI single
  provider, single thread (threads = P3), no rich rendering (P2).

## Hand-off notes

```
2026-05-24 (orchestrator): P1 bootstrapped on feature/chat-core (off next, P0
                          merged via #432). workflow-state scaffolded. CHECKPOINT
                          pending with the human on the two charter §6 ADR
                          decisions (CLAR-CC-001 ChatRuntime port shape; CLAR-CC-002
                          SecretStorePort + app.secretStorage @ 1.12.7 verification)
                          before requirements/design. Next: /spec:idea (analyst)
                          reading the charter §3/§4/§5 + the frontend/backend audits
                          + claudian-main; then /spec:research → requirements → design
                          (A/B/C, file the P1 ADRs, add the audit-named ports).
```
