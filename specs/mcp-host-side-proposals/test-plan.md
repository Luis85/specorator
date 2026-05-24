---
id: TESTPLAN-MHP-001
title: Host-side MCP proposal queue + Tier-A read expansion — Test plan
stage: testing
feature: mcp-host-side-proposals
status: draft
owner: qa
inputs:
  - PRD-MHP-001
  - SPECDOC-MHP-001
created: 2026-05-24
updated: 2026-05-24
---

# Test plan — Host-side MCP proposal queue + Tier-A read expansion + tier-policy UX

## Scope

Validates the behaviours specified in `specs/mcp-host-side-proposals/spec.md` and the EARS requirements in `specs/mcp-host-side-proposals/requirements.md`. Covers the host-side proposal queue, the new `workflow_proposal_*` MCP tools, the wired-up accept/reject path for the existing 8 write tools, the 12 Tier-A read tools plus regex-validated escape hatch, the JSONL audit log, the `.mcp.json` migration, the DevTools opt-in matrix, and the permanent deny-list. Out of scope: bearer-token auth, webviewer, Tier-B writes, batch-card UX (see PRD §Non-goals).

## Test types in scope

- [x] Unit
- [x] Integration
- [x] End-to-end
- [x] Contract
- [x] Performance
- [x] Security
- [ ] Accessibility
- [ ] Localisation
- [x] Manual exploratory

## Entry criteria

- [x] Spec accepted.
- [x] Baselines captured (this document, §Baselines).
- [ ] Implementation complete for the scope under test.
- [ ] Test environment provisioned and seeded.

## Exit criteria

- [ ] Every EARS clause has ≥ 1 test referencing its REQ ID.
- [ ] Critical paths covered.
- [ ] Coverage threshold met.
- [ ] No critical defects open.
- [ ] Failures reproducible from the report.

## Baselines

Captured per T-MHP-001 on integration-branch HEAD **before** any new code in WP-MHP-A..I lands. NFR-MHP-001/-002/-003 budgets are baseline-relative; these numbers anchor the budgets.

- **Integration-branch HEAD SHA:** `9124b36f64a73f728e4f6dfa7e778772e02a69fd`
- **Branch:** `feature/agents-sidebar-chat-panel`
- **Date captured:** 2026-05-24
- **Tool:** `vitest bench` (vitest v4.1.5), 1000 iterations per bench, `--project unit` to avoid the storybook chromium project. Vitest's bench reporter does not emit p95 directly; **p99 is used as a strict upper bound on p95**, p75 is recorded for context.
- **Bench script:** `tests/__bench__/mhp-baseline.bench.ts`
- **Reproduce:** `npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run --project unit`
- **Hardware:** Windows 11, Node.js LTS (developer workstation); numbers are dev-box baselines, not CI.

### B1 — `ProposalStore.getAll()` with 100 pending entries (NFR-MHP-001 baseline)

`workflow_proposal_list` does not exist yet; `ProposalStore.getAll()` is the closest pre-existing surface and is what the new tool will wrap.

| Run | mean   | p75    | p99    | samples | hz       |
|----:|-------:|-------:|-------:|--------:|---------:|
| 1   | 0.1608 ms | 0.1593 ms | 0.3743 ms | 3110 | 6,218.45 |
| 2   | 0.1999 ms | 0.2466 ms | 0.4594 ms | 2503 | 5,002.36 |

**Baseline used for NFR-MHP-001 budget arithmetic:** p99 ≈ **0.46 ms** (worst of two runs). Well under the 50 ms budget in NFR-MHP-001; the new tool's MCP framing + JSON serialisation overhead has ≈49 ms of slack.

### B2 — `ProposalStore.queue()` averaged across the 8 existing write-tool callback shapes (NFR-MHP-002 baseline)

Pre-`AuditLogWriter` overhead. Callback (`mutate`) is a no-op `Promise.resolve()`; we measure only the in-process queue path because that is what `AuditLogWriter` will add overhead to. LoggerPort is not wired (the queue path itself does not log; only `mutate` would, and that is mocked).

| Run | mean    | p75     | p99     | samples | hz          |
|----:|--------:|--------:|--------:|--------:|------------:|
| 1   | 0.0005 ms | 0.0005 ms | 0.0021 ms | 965,181 | 1,930,362.00 |
| 2   | 0.0006 ms | 0.0007 ms | 0.0025 ms | 775,154 | 1,550,307.07 |

**Baseline used for NFR-MHP-002 budget arithmetic:** p99 ≈ **0.0025 ms** (worst of two runs). The +10 ms p95 budget in NFR-MHP-002 dwarfs the queue cost; the audit-log append is expected to dominate.

### B3 — `obsidian-cli` bare subprocess spawn latency (NFR-MHP-003 baseline) — DEFERRED

**Status:** deferred — requires the `obsidian-cli` binary on `PATH` (or `OBSIDIAN_CLI_PATH` env var). The CI runner and the dev workstation used for B1/B2 do not have it installed. The user runs this manually via:

```sh
OBSIDIAN_CLI_PATH=/abs/path/to/obsidian-cli \
  npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run --project unit
```

against a real TestVault install. The bench is registered as `bench.skip` on machines without the binary so the bench run does not fail.

Per CLAR-MHP-018, this baseline excludes MCP framing; the bench measures `spawn(obsidian-cli, ['--version'])` → `'close'` event only.

### Variance flag

Both B1 and B2 exceeded the ±15% variance threshold across the two runs:

- **B1 p99:** run-1 0.3743 ms → run-2 0.4594 ms → **+22.7%** variance.
- **B2 p99:** run-1 0.0021 ms → run-2 0.0025 ms → **+19.0%** variance.

**Assessment:** absolute values are sub-millisecond and well below the NFR budgets (50 ms and +10 ms). The variance is dominated by sub-microsecond GC / OS-scheduler jitter typical of micro-benchmarks on Windows 11 dev hardware. **Escalation deferred** — the budget headroom is two-to-four orders of magnitude. If a future bench shows the absolute number approaching the NFR budget, re-baseline on a controlled CI runner with `--isolate` and a longer warmup.

## Test inventory

<!--
TEST-* IDs MUST go in a NON-LEADING column. spec.md is the canonical source of TEST-* definitions.
This file references them; placing TEST IDs in the first column collides with spec.md.
-->

| REQ ID | Test ID | Type | Description | Owner |
|---|---|---|---|---|
| (to be populated from spec.md §Test scenarios as WP-MHP-A..I tasks are picked up) | | | | qa |

## Non-functional checks

| Check | Tool | Threshold | Baseline |
|---|---|---|---|
| `workflow_proposal_list` p95 latency (NFR-MHP-001) | `vitest bench` | ≤ 50 ms with 100 pending | B1 p99 ≈ 0.46 ms |
| Write-tool path p95 latency added by audit log (NFR-MHP-002) | `vitest bench` | ≤ baseline + 10 ms | B2 p99 ≈ 0.0025 ms |
| Tier-A read tools p95 added latency (NFR-MHP-003, CLAR-MHP-018) | `vitest bench` | ≤ baseline + 20 ms vs `obsidian-cli` bare spawn | B3 deferred (manual, requires obsidian-cli) |
| Deny-list reachability (NFR-MHP-004) | unit test | 0 reachable | — |
| Escape-hatch arg validation (NFR-MHP-005) | unit test | 100% rejected | — |
| Audit-log payload privacy (NFR-MHP-006) | unit test | 0 DevTools result bytes in log | — |

## Test data

- B1 / B2 use synthetic in-process data — no vault I/O, no Obsidian runtime, no MCP framing.
- B3 requires a real `obsidian-cli` install and a TestVault (see `SPECORATOR_TEST_VAULT` env var convention).
- Implementation-stage tests use `fakeModulePorts()` (`tests/__fakes__/fake-ports.ts`) for port-backed fixtures.

## Risks to test coverage

- **B3 not on CI.** The Tier-A read baseline depends on a binary that is not installable inside the CI runner. The runtime number can only be captured by the user on their TestVault. The NFR-MHP-003 budget will be validated at acceptance, not at PR-time.
- **Bench variance on Windows dev hardware.** Sub-millisecond benches show > 15% variance run-to-run. Budget headroom absorbs this for B1/B2; flag and re-baseline on CI if a future implementation closes the gap.

---

## Quality gate

- [x] Baselines captured before implementation (T-MHP-001 DoD).
- [ ] Every EARS clause has ≥ 1 planned test referencing its REQ ID.
- [ ] Edge cases from spec have planned tests.
- [x] Non-functional checks listed with tools and thresholds.
- [x] Entry and exit criteria stated.
