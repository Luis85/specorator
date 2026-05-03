---
id: ADR-009
title: Test conventions — mirror layout, fake-ports factory, PageObject pattern
status: accepted
date: 2026-05-03
---

# ADR-009 — Test conventions

## Decision

Adopt the following test conventions across the repository:

1. **Mirror layout.** Tests live under a top-level `tests/` directory, mirroring the `src/` tree path-for-path. The test for `src/x/y.ts` is `tests/x/y.test.ts`. The `.test.ts` extension is canonical; `.spec.ts` is no longer used. `__tests__/` directories are forbidden inside `src/`.

2. **Shared fake-ports factory.** `tests/__fakes__/fake-ports.ts` exports a single function `fakeModulePorts()` that returns the four narrow ports from ADR-008 (`SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`) plus the underlying `MockBridge` reference. All ports are backed by the same `MockBridge` instance; mutations through one port are visible through the others. Tests opt-in to the factory; ad-hoc `new MockBridge()` is not banned but is the older pattern.

3. **PageObject convention.** Every Vue component test that mounts a component MUST have a class-based PageObject co-located with the test file (`Home.po.ts` next to `Home.test.ts`). PageObjects expose getters returning `DOMWrapper`s and async action methods. Elements are queried exclusively by `data-testid`. CSS-class and id selectors (`.foo`, `#bar`) are forbidden inside `tests/**` and the ESLint config enforces this. Every Vue component test in the repo at the end of the introducing PR has a PageObject — no grandfathering.

4. **Coverage thresholds.** `npm run test:coverage` enforces hard thresholds of statements 80 / branches 70 / functions 80 / lines 80. The thresholds run as part of `npm run verify`, so CI inherits them automatically.

## Rationale

- **Mirror layout** makes the test for any file findable by predictable path translation. It removes the `__tests__/` directory clutter from source folders and lets editor file-trees show source organisation cleanly.
- **`.test.ts` extension** is the more common convention in the wider Vitest/Jest ecosystem. Aligning makes onboarding cheaper and matches the issue body literal.
- **Shared fake-ports factory** centralises the test seam. When a port surface changes, one factory update propagates to every consuming test instead of dozens of ad-hoc constructions.
- **PageObject pattern** keeps selector strings out of test bodies — when markup changes, only the PO updates, not every test that touches the component. Class form is IDE-discoverable and supports `await po.clickCreate()` ergonomics that functional helpers cannot match without losing `this` binding clarity.
- **`data-testid`-only queries** decouple tests from styling churn. CSS classes change with redesigns; `data-testid` attributes are part of the contract between component and test.
- **Coverage thresholds at 80/70/80/80** match the levels recommended in the repository's CONSTITUTION discussion and are achievable today (current baseline: 88/80/89/91). Hard floors stop slow drift toward untested code.

## Consequences

- All 17 existing test files are moved from `src/**/__tests__/*.spec.ts` to `tests/**/*.test.ts` in the same PR that introduces this ADR. The `__tests__/` directories are deleted.
- `vitest.config.ts` `include` glob changes to `['tests/**/*.test.ts']`. Coverage `exclude` adds `**/__fixtures__/**` and `src/infrastructure/mock/fixtures.ts` (artefacts of W5 lint fixtures and dev-mode demo data, both 0% covered).
- A new ESLint block under `files: ['tests/**/*.ts']` restricts query selector literals beginning with `.` or `#` via `no-restricted-syntax` with a message pointing at `data-testid`.
- All Vue component tests in the repo at end of PR get a co-located PageObject and `data-testid` attributes added to their components — the 2 existing migrated tests (`FeatureCard`, `CreateFeatureForm`) and 1 net-new test (`HomeView`) introduced alongside its PageObject. No grandfathering, no per-test exemptions.
- `package.json` `verify` script changes from `npm run test` to `npm run test:coverage` so the threshold gate runs locally and in CI.
- `CLAUDE.md` gains a "Testing conventions (ADR-009)" section and the "Run a single test file" command updates to the new path shape.
- New tests written from this ADR forward MUST follow the conventions. The ESLint and threshold gates make accidental regression visible.

## Out of scope

- **`fakeScheduler.fire(id)`** mentioned in issue #108 — `SchedulerPort` does not exist yet (deferred from W1 per ADR-008's scope-reduction rationale). The scheduler fake will be added alongside the port and its first consumer (likely W2 module loader or W4 `PluginCore`).
- **Per-method override parameter on `fakeModulePorts`.** YAGNI until a test needs to override one port method.

## Notes for downstream work

- W2 (#100): module loader tests use `fakeModulePorts()` to satisfy module dependencies.
- W4 (#102): `PluginCore` lifecycle tests use the same factory; the `bridge` reference makes asserting on `Notice` calls trivial.
- When `SchedulerPort` is introduced, `FakePorts` is expected to gain a `scheduler` field and `fakeModulePorts()` to construct a deterministic `FakeScheduler` with `fire(id)` for tests to advance time without `vi.useFakeTimers`. Final shape will be decided alongside the port itself.
