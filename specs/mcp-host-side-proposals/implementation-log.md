---
id: IMPL-LOG-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion — Implementation log
stage: implementation
feature: mcp-host-side-proposals
status: in-progress
owner: dev
inputs:
  - SPECDOC-MHP-001
  - TASKS-MHP-001
created: 2026-05-24
updated: 2026-05-24
---

# Implementation log — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

A running record of *what* was implemented, *why* a deviation was taken, and *what* was learned. Append-only during implementation; no rewriting history.

## Entries

### 2026-05-24 — T-MHP-001 — Baseline capture (qa)
- **Files changed:**
  - `tests/__bench__/mhp-baseline.bench.ts` (new)
  - `specs/mcp-host-side-proposals/test-plan.md` (new — drafted from `templates/test-plan-template.md`, §Baselines populated)
  - `specs/mcp-host-side-proposals/implementation-log.md` (this entry)
- **Commit:** pending (orchestrator owns commit)
- **Spec reference:** NFR-MHP-001, NFR-MHP-002, NFR-MHP-003 (baselines), CLAR-MHP-018
- **Outcome:** done (partial — B3 deferred to manual user run)
- **Deviation from spec:**
  - Vitest's `bench()` reporter does not emit p95; p99 was recorded as a strict upper bound on p95 (with p75 for context). Documented in `test-plan.md` §Baselines.
  - Run-to-run variance exceeded the ±15% reproducibility threshold for B1 (+22.7%) and B2 (+19.0%). Escalation deferred because absolute numbers (sub-millisecond) sit 2–4 orders of magnitude below the NFR budgets; documented under §Variance flag.
- **Notes:**
  - Bench script: `tests/__bench__/mhp-baseline.bench.ts`. Run via `npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run --project unit`. The `--project unit` filter is required because the storybook chromium project tries to import `node:crypto` and fails.
  - B1 (`ProposalStore.getAll()` with 100 pending entries) baseline p99 ≈ 0.46 ms. NFR-MHP-001 budget is 50 ms — two orders of magnitude of headroom.
  - B2 (`ProposalStore.queue()` averaged across the 8 existing write-tool callback shapes, no-op mutate, no logger) baseline p99 ≈ 0.0025 ms. NFR-MHP-002 budget is +10 ms — the audit-log append is expected to dominate.
  - B3 (`obsidian-cli` bare subprocess spawn latency) deferred: no `obsidian-cli` on CI runner or dev workstation. Registered as `bench.skip` unless `OBSIDIAN_CLI_PATH` env var is set, with `console.log` instructions for the user to run it manually in TestVault.
  - LoggerPort intentionally not wired in B2: the queue path does not log; only the mutate callback would, and that is mocked as `Promise.resolve()`.
  - Bench is not added to `npm run test` (separate command per project convention for non-deterministic benches).
- **DoD:** ✓ script committed, ✓ numbers in test-plan.md, [partial] reproducibility verified for B1/B2 only — see §Variance flag in test-plan.md.

---

## Deviations summary

> Any deviation from spec must be listed here, with link to ADR if material.

| Date       | Task      | Deviation                                                                                                               | Reason                                                                                          | ADR |
|------------|-----------|-------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|-----|
| 2026-05-24 | T-MHP-001 | Recorded p99 instead of p95                                                                                             | vitest `bench()` reporter does not emit p95; p99 is a strict upper bound                        | —   |
| 2026-05-24 | T-MHP-001 | B1/B2 variance exceeded ±15%                                                                                            | Sub-millisecond absolute values, 2–4 orders of magnitude under the NFR budgets                  | —   |
| 2026-05-24 | T-MHP-001 | B3 not captured at baseline time                                                                                        | `obsidian-cli` unavailable on CI / dev box; deferred to user-run in TestVault per task contract | —   |

## Quality gate

- [ ] All tasks accounted for (done, partial, blocked, or dropped).
- [ ] Implementation matches the spec; any deviation is logged with rationale (and ADR if material).
- [ ] No unrelated changes ("scope creep") in any task entry.
- [ ] Lint, type checks, unit tests green for the changed surface.
- [ ] Commits reference task IDs.
- [ ] `workflow-state.md` Stage 7 close-out complete: `implementation-log.md` is `complete` when all tasks are executed, or `in-progress` when human-owned tasks, deferred implementation tasks, or blockers remain; `## Hand-off notes` records the date, verification, remaining owner if any, and next agent.
