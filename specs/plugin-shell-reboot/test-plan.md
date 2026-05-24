---
id: TESTPLAN-PSR-001
title: Plugin shell reboot (P0) — test plan
stage: test-plan
feature: plugin-shell-reboot
status: in-progress
owner: qa
epic: claudian-reboot
phase: P0
created: 2026-05-24
updated: 2026-05-24
---

# Test plan — plugin shell reboot (P0)

Maps the 24 `TEST-PSR-*` scenarios (spec §13) to their automation. **U** = unit
(Vitest + fake-ports / PageObject), **A** = automated architecture/guard,
**M** = manual Obsidian verification (NFR-PSR-003, not CI-automatable).

## Automation harness decisions (T-PSR-024 recon, OC-PSR-6)

- **Programmatic-ESLint guard (TEST-PSR-016, T-PSR-027):** reuse the ESLint Node
  API pattern from `tests/eslint-boundaries.test.ts`; author
  `tests/architecture/no-deleted-subsystem-refs.test.ts` (new `tests/architecture/`
  directory). Runs in the `unit` project — no new gate step (CL-2).
- **Positive-control fixture (TEST-PSR-017, T-PSR-025):** lives under a
  `__fixtures__/` path; `eslint.config.js` ignores `**/__fixtures__/**` so daily
  `npm run lint` skips it while the harness lints it on demand.

## Unit + guard scenarios

| TEST-PSR | Type | Task | File | State |
|---|---|---|---|---|
| 001–004 | U | T-PSR-001 | `tests/core/core-settings.test.ts` | RED |
| 005–007 | U | T-PSR-002 | `tests/core/core-settings.test.ts` | RED |
| 008 | U | T-PSR-005 | `tests/ui/agent/AgentPanelRoot.test.ts` | RED |
| 009–010 | U | T-PSR-006 | `tests/ui/i18n/index.test.ts` | RED |
| 011 | U | T-PSR-012 | `tests/domain/ports/WorkspacePort.test.ts` | RED (typecheck) |
| 012–013 | U | T-PSR-010 | `tests/plugin/activateAgentSidebar.test.ts` | pending |
| 014 | U | T-PSR-014 | `tests/plugin/settings.test.ts` | pending |
| 015 | U | T-PSR-011 | `tests/ui/components/ErrorBoundary.test.ts` | GREEN (reuse) |
| 016 | A | T-PSR-027 | `tests/architecture/no-deleted-subsystem-refs.test.ts` | pending |
| 017 | U | T-PSR-025 | `__fixtures__` positive control | pending |
| 022 | U | T-PSR-016 | `tests/ui/main.test.ts` | pending |
| 023 | A | T-PSR-028 | `tests/workflows/ci-next-trigger.test.ts` | RED |
| 024 | U | T-PSR-021 | bridge data.json-hygiene round-trip | pending |

## Manual Obsidian checks (NFR-PSR-003 — T-PSR-033, human-run)

| TEST-PSR | Scenario |
|---|---|
| 018 | `onload` completes, zero console errors / unhandled rejections |
| 019 | "Open agent sidebar" opens the empty view in the right sidebar |
| 020 | Exactly one command (`open-agent-sidebar`), no ribbon, no deleted-subsystem affordance |
| 021 | Disable plugin → leaf detaches; re-enable boots clean |

> Manual checks are surfaced to the human at the P0 PR — never self-claimed pass.
