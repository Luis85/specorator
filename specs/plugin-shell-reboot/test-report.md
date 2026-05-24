---
id: TESTREPORT-PSR-001
title: Plugin shell reboot (P0) — test report
stage: test-report
feature: plugin-shell-reboot
status: complete
owner: qa
epic: claudian-reboot
phase: P0
created: 2026-05-24
updated: 2026-05-24
---

# Test report — plugin shell reboot (P0)

## Automated (`npm run test:coverage`)

- **38 test files, 308 tests — PASS.**
- Coverage over the `vitest.config.ts` include set
  (`domain`/`application`/`infrastructure`/`modules`/`core`):

  | Metric | Result | Threshold (NFR-PSR-002) |
  |---|---|---|
  | Statements | 94.53% | 80% |
  | Branches | 85.01% | 70% |
  | Functions | 87.17% | 80% |
  | Lines | 94.66% | 80% |

  All four thresholds clear on the gutted tree. **No coverage `include` change
  needed** — the R-PSR-5 contingency was not triggered (T-PSR-032).

- **Deleted-symbol guard:** TEST-PSR-016 (zero `DELETED_SUBSYSTEM_BAN` hits over
  `src/**`) + TEST-PSR-017 (positive-control fixture trips the ban) — GREEN.

## Manual Obsidian verification (NFR-PSR-003 — T-PSR-033) — PENDING HUMAN RUN

TEST-PSR-018..021 require a real Obsidian vault and are **not CI-automatable**.
Build with `npm run build` and load `main.js` in the test vault. These are
**never self-claimed** — a human must run them and record pass/fail here.

**Human-confirmed 2026-05-24** in `D:/TestVault` — maintainer reported "P0 is
clean in the testvault" after loading the deployed build.

| TEST-PSR | Scenario | Status |
|---|---|---|
| 018 | `onload` completes, zero console errors / unhandled rejections | ✅ PASS (human, D:/TestVault) |
| 019 | "Open agent sidebar" opens the empty view in the right sidebar; placeholder visible | ✅ PASS (human) |
| 020 | Exactly one command (`open-agent-sidebar`), no ribbon, no deleted-subsystem affordance | ✅ PASS (human) |
| 021 | Disable plugin → leaf detaches; re-enable boots clean | ✅ PASS (human) |

**Static corroboration (build artifact, supporting only — not a substitute for the
live checks above):** the deployed `main.js` contains the `open-agent-sidebar`
command once, zero `addRibbonIcon`, the `specorator-agent` view, and zero
deleted-subsystem markers (`SpecoratorView`/`AgentSidepanelView`/`chatThreads`/
`ProviderSelection`/`ObsidianMcpServer`/`FeatureRepository`/`createWebHashHistory`);
`manifest.json` id/version/minAppVersion 1.12.7 unchanged.
