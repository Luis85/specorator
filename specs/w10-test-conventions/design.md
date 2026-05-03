---
slug: w10-test-conventions
title: W10 — Test conventions (mirror layout, fake-ports factory, PageObject pattern)
status: accepted
issue: 108
epic: 85
date: 2026-05-03
introduces_adr: ADR-009
---

# W10 — Test conventions

## Context

Tests today live in `__tests__/` directories colocated with source (`src/x/__tests__/y.spec.ts`). 17 spec files, 135 tests, all passing. Vitest globs `src/**/*.spec.ts`. There are no shared test fakes (each test constructs `MockBridge` ad hoc), no PageObject convention for Vue component tests, no `data-testid` attributes anywhere in `src/`, and no enforced coverage thresholds (current coverage: statements 88%, branches 80%, functions 89%, lines 91%).

Issue #108 (W10 of Epic #85) standardises test conventions ahead of W2 (module system) and W11 (UI layout system) so that downstream work has a stable test seam from day one. The spec narrows the issue's literal scope in two places (see "Out of scope (deferred)") to keep the change atomic and YAGNI-aligned.

## Decision

Adopt four conventions in a single PR:

1. **Mirror layout.** Tests live under `tests/`, exact path mirror of `src/`. File extension `.test.ts` (not `.spec.ts`). All 17 existing tests migrate. `__tests__/` directories deleted.
2. **Shared fake-ports factory.** `tests/__fakes__/fake-ports.ts` exports `fakeModulePorts()` returning `{ bridge, settings, vault, workspace, notifications }` — a single `MockBridge` instance exposed under each port interface plus the `bridge` reference itself for spy assertions.
3. **PageObject convention.** Vue component tests use class-based PageObjects co-located with their test file (`tests/ui/views/Home.po.ts` next to `tests/ui/views/Home.test.ts`). Elements queried exclusively via `data-testid`. CSS-class queries forbidden by ESLint.
4. **Coverage thresholds.** `npm run test:coverage` enforces statements 80 / branches 70 / functions 80 / lines 80. CI runs the gate; baseline already exceeds every threshold.

ADR-009 records the conventions; ADR-008 is unchanged.

### Layout

| Before | After |
|---|---|
| `src/__tests__/eslint-boundaries.spec.ts` | `tests/eslint-boundaries.test.ts` |
| `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts` | `tests/application/feature/CreateFeatureUseCase.test.ts` |
| `src/domain/feature/__tests__/Feature.spec.ts` | `tests/domain/feature/Feature.test.ts` |
| `src/domain/shared/__tests__/Slug.spec.ts` | `tests/domain/shared/Slug.test.ts` |
| `src/domain/shared/__tests__/tryAsync.spec.ts` | `tests/domain/shared/tryAsync.test.ts` |
| `src/infrastructure/bridge/__tests__/NotificationPortContract.spec.ts` | `tests/infrastructure/bridge/NotificationPortContract.test.ts` |
| `src/infrastructure/bridge/__tests__/SettingsPortContract.spec.ts` | `tests/infrastructure/bridge/SettingsPortContract.test.ts` |
| `src/infrastructure/bridge/__tests__/VaultPortContract.spec.ts` | `tests/infrastructure/bridge/VaultPortContract.test.ts` |
| `src/infrastructure/bridge/__tests__/WorkspacePortContract.spec.ts` | `tests/infrastructure/bridge/WorkspacePortContract.test.ts` |
| `src/infrastructure/localstorage/__tests__/LocalStorageBridge.spec.ts` | `tests/infrastructure/localstorage/LocalStorageBridge.test.ts` |
| `src/infrastructure/mock/__tests__/MockBridge.spec.ts` | `tests/infrastructure/mock/MockBridge.test.ts` |
| `src/infrastructure/vault/__tests__/VaultPath.spec.ts` | `tests/infrastructure/vault/VaultPath.test.ts` |
| `src/infrastructure/workflow-state/__tests__/WorkflowStateDocument.spec.ts` | `tests/infrastructure/workflow-state/WorkflowStateDocument.test.ts` |
| `src/ui/components/feature/__tests__/CreateFeatureForm.spec.ts` | `tests/ui/components/feature/CreateFeatureForm.test.ts` |
| `src/ui/components/feature/__tests__/FeatureCard.spec.ts` | `tests/ui/components/feature/FeatureCard.test.ts` |
| `src/ui/composables/__tests__/useFeatures.spec.ts` | `tests/ui/composables/useFeatures.test.ts` |
| `src/ui/router/__tests__/fileRoute.spec.ts` | `tests/ui/router/fileRoute.test.ts` |

After move:
- All `src/**/__tests__/` directories deleted (none should remain).
- `tests/__fakes__/fake-ports.ts` added.
- A PageObject is added next to **every** Vue component test that exists at the end of this PR. There are 2 component tests today (`FeatureCard`, `CreateFeatureForm`) plus 1 net-new test introduced by this PR (`HomeView`) = 3 PageObjects in total. PageObjects are MUST for any test that mounts a component.

Imports inside moved files: every `from './Foo'` (relative within an `__tests__/` dir) resolves differently after the move. The test files all use the `@/` alias for source imports already, so production-side imports survive untouched. Only intra-test relative imports (between fixtures/helpers) need rewriting — none exist today.

### PageObjects for all Vue component tests

The repository has 2 Vue component tests today (`FeatureCard`, `CreateFeatureForm`). Both are migrated and rewritten end-to-end against PageObjects. A 3rd net-new test for `HomeView` is introduced in this PR alongside its PageObject so the convention has a fresh-from-day-one example. No grandfathering; new tests inherit the convention without exception.

| Test | Status | PageObject file | Component getting `data-testid`s |
|---|---|---|---|
| `tests/ui/views/Home.test.ts` | net-new in this PR | `tests/ui/views/Home.po.ts` | `HomeView.vue` |
| `tests/ui/components/feature/FeatureCard.test.ts` | migrated + rewritten | `tests/ui/components/feature/FeatureCard.po.ts` | `FeatureCard.vue` |
| `tests/ui/components/feature/CreateFeatureForm.test.ts` | migrated + rewritten | `tests/ui/components/feature/CreateFeatureForm.po.ts` | `CreateFeatureForm.vue` |

`data-testid` attributes added to each component:

- **`HomeView.vue`** — `home-title`, `home-create-feature`, `home-active-features`
- **`FeatureCard.vue`** — `feature-card` (root), `progress-fill`, `step-label`, `activate-button`, `advance-step-button`, `open-button`, `archive-button`
- **`CreateFeatureForm.vue`** — `create-form` (root), `feature-title-input`, `feature-area-input`, `create-submit`, `create-cancel`

The two existing tests that currently query CSS classes and ids (`wrapper.find('.sp-progress-bar__fill')`, `wrapper.find('#feature-title')`) are rewritten end-to-end against their new PageObjects. Tag selectors (`wrapper.find('form')`, `wrapper.findAll('button')`) move into PO getters as well so the bodies hold no selector strings at all.

### Vitest configuration

```ts
// vitest.config.ts
test: {
  environment: 'jsdom',
  globals: true,
  include: ['tests/**/*.test.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
    exclude: [
      'src/infrastructure/obsidian/**',
      '**/__fixtures__/**',
      'src/infrastructure/mock/fixtures.ts',
    ],
    thresholds: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },
}
```

The `__fixtures__/` and `mock/fixtures.ts` excludes correct a pre-existing artefact: those files are dev-mode demo data and W5 ESLint-boundary fixtures, both 0% covered today, dragging averages down. The baseline 88/80/89/91 cited below is **pre-exclude** — measured against the current `vitest.config.ts` that does not exclude either fixture set. Post-exclude figures will be slightly higher; either way the baseline sits well above the 80/70/80/80 floor. The migration plan captures the fresh post-exclude run as the PR's baseline of record.

Coverage `include` continues to point at `src/domain/**`, `src/application/**`, `src/infrastructure/**` because production code does not move; only the test `include` glob changes.

### Fake-ports factory

`tests/__fakes__/fake-ports.ts`:

```ts
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type {
  SettingsPort,
  VaultPort,
  WorkspacePort,
  NotificationPort,
} from '@/domain/ports'

/**
 * Standard test seam: all four narrow ports backed by a single MockBridge
 * instance. The `bridge` reference is exposed so tests can read recorded
 * notices and opened-file paths via MockBridge's spy methods.
 *
 * Per-method overrides are not parameterised (YAGNI). Callers that need to
 * override one method should construct their own scenario inline; if the
 * pattern recurs, add an `overrides` parameter then.
 */
export interface FakePorts {
  readonly bridge: MockBridge
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
}

export function fakeModulePorts(): FakePorts {
  const bridge = new MockBridge()
  return {
    bridge,
    settings: bridge,
    vault: bridge,
    workspace: bridge,
    notifications: bridge,
  }
}
```

Usage in a test:

```ts
const ports = fakeModulePorts()
await ports.vault.writeFile('specs/x/idea.md', '...')
ports.notifications.showNotice('hi')
expect(ports.bridge.getNotices()).toHaveLength(1)
```

Existing tests that currently call `new MockBridge()` directly migrate to `fakeModulePorts()` opportunistically (not mandatory in this PR — the factory is the new preferred pattern, ad-hoc construction is not banned). Tests already passing the bridge into `FeatureRepository(vault, notifications, settings)` simply destructure the factory result.

### PageObject convention

Every Vue component test that mounts a component MUST have a PageObject. The PageObject is a class with getters returning `DOMWrapper`s and async action methods. Elements are addressed exclusively by `data-testid`; CSS-class selectors are forbidden in `tests/`.

```ts
// tests/ui/views/Home.po.ts
import type { VueWrapper } from '@vue/test-utils'

const TID = {
  title: 'home-title',
  createButton: 'home-create-feature',
  activeList: 'home-active-features',
} as const

export class HomePageObject {
  constructor(private readonly wrapper: VueWrapper) {}

  get title() {
    return this.wrapper.get(`[data-testid="${TID.title}"]`)
  }

  get createButton() {
    return this.wrapper.get(`[data-testid="${TID.createButton}"]`)
  }

  async clickCreate(): Promise<void> {
    await this.createButton.trigger('click')
  }
}
```

`Home.test.ts` mounts `HomeView`, instantiates `new HomePageObject(wrapper)`, and asserts via the PO interface. To support the PO, `HomeView.vue` gains `data-testid` attributes on the title, the create button, and the active-features list root.

### CSS-selector ban

ESLint flat config gains a rule for `tests/**`:

```js
// eslint.config.js — additional block
{
  files: ['tests/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.property.name=/^(find|findAll|get|getAll)$/] > Literal[value=/^[\\.#]/]",
        message: 'Tests must query via data-testid only. CSS class and id selectors are forbidden — add a data-testid attribute and route through a PageObject getter instead.',
      },
    ],
  },
},
```

The selector matches `wrapper.find('.foo')` / `wrapper.find('#foo')` etc. on string literals. Bracket-quoted attribute selectors (`[data-testid="..."]`) pass.

### Coverage gate in CI

`npm run test:coverage` already exists. The `package.json` `verify` script currently invokes `npm run test`; this PR edits it to invoke `npm run test:coverage` instead, so the threshold check runs both locally (via `npm run verify`) and in CI (which already runs `verify`). CI workflow `.github/workflows/ci.yml` needs no extra step — it inherits the gate from `verify`.

### ADR-009

`docs/adr/ADR-009-test-conventions.md`. Status: accepted. Records:
- Mirror layout (`tests/x/y.test.ts`)
- `.test.ts` extension
- `tests/__fakes__/fake-ports.ts` factory shape
- Class-based PageObject convention with `data-testid`-only queries
- Coverage thresholds 80/70/80/80

ADR is informational, supersedes nothing.

### CLAUDE.md

Add a "### Testing conventions (ADR-009)" section after "### Vue conventions". Update the "Run a single test file" example to use the new `tests/` path.

## Out of scope (deferred)

- **`fakeScheduler.fire(id)`.** Issue acceptance #2 mandates it, but `SchedulerPort` does not exist (deferred from W1 — no current consumer). Adding a fake for a non-existent port creates dead surface. The fake is introduced when `SchedulerPort` lands alongside its first consumer (likely W2 module loader or W4 `PluginCore`).
- **`fakeModulePorts({ overrides })`.** YAGNI until a test needs to override one port method. Add when first consumer asks.

## Acceptance (issue #108, revised)

- [x] `tests/__fakes__/fake-ports.ts` covers every port from W1 (4 ports).
- [x] ~~`fakeScheduler.fire(id)`~~ → **deferred**, not part of this PR. Documented above; will land with `SchedulerPort`. Issue closed with this scope reduction noted in the PR description.
- [x] PageObjects committed for **every** Vue component test in the repo at end of PR: `Home.po.ts` (net-new test + PO), `FeatureCard.po.ts` (PO for migrated test), `CreateFeatureForm.po.ts` (PO for migrated test). Issue asks for "at least one example"; this PR exceeds it deliberately for clean stable state.
- [x] All 17 existing tests migrated to mirror layout (`__tests__/` folders deleted).
- [x] Coverage gate at 80/70/80/80; CI enforces via `npm run verify`.
- [x] CSS-selector ban enforced by ESLint in `tests/**`.

## Migration plan

Single PR, atomic. Order of work:

1. Add `tests/__fakes__/fake-ports.ts`.
2. Move all 17 existing tests from `src/**/__tests__/*.spec.ts` to `tests/**/<name>.test.ts`. Use `git mv` so history follows.
3. Delete every now-empty `src/**/__tests__/` directory.
4. Update `vitest.config.ts`: `include` glob, coverage `exclude` additions, coverage `thresholds`.
5. Capture the fresh post-exclude `npm run test:coverage` output as the baseline of record (paste in PR description).
6. Add `data-testid` attributes to `HomeView.vue`, `FeatureCard.vue`, `CreateFeatureForm.vue` (full list under "PageObjects for all Vue component tests").
7. Write `tests/ui/views/Home.po.ts` + `Home.test.ts` (net-new test; no `Home.spec.ts` exists today).
8. Write `tests/ui/components/feature/FeatureCard.po.ts`; rewrite the moved `FeatureCard.test.ts` end-to-end against the PO (no selector strings in test body).
9. Write `tests/ui/components/feature/CreateFeatureForm.po.ts`; rewrite the moved `CreateFeatureForm.test.ts` end-to-end against the PO.
10. Add the CSS-selector ban to `eslint.config.js` under a `files: ['tests/**/*.ts']` block. Confirm lint is clean.
11. Edit `package.json`: change `verify` script to invoke `npm run test:coverage` instead of `npm run test`.
12. Confirm `npm run test:coverage` passes thresholds.
13. Update CLAUDE.md with the new conventions section + single-test-file command.
14. Write `docs/adr/ADR-009-test-conventions.md`.
15. Run `npm run verify`. PR.

## Risks

- **Path-resolution breakage in moved tests.** All current spec files use the `@/` alias for source imports — survives the move. No intra-test relative imports exist today (no shared helpers under `__tests__/`). Mitigated by running `npm run test:coverage` after every commit during migration.
- **Coverage gate regression.** Baseline 88/80/89/91 against thresholds 80/70/80/80 leaves margin. The `__fixtures__/` and `mock/fixtures.ts` excludes recover ~3 percentage points artificially depressed today. Net: well above threshold.
- **ESLint CSS-ban false positives.** The selector matches `wrapper.find('.foo')` literal arguments. Dynamic strings (`wrapper.find(selectorVar)`) pass — acceptable; if a test needed to bypass, the variable form is a clear deliberate signal. The selector also fires on any `.find/.findAll/.get/.getAll` chain receiving a literal that begins with `.` or `#`, regardless of caller (e.g. lodash `_.find('.foo', xs)`). No such call exists in the test corpus today; if one is added it can be rewritten or use a per-line disable.
- **Mixed-attribute selectors.** A literal like `.sp-foo[data-testid="x"]` would still trip the ban because it starts with `.`. The convention is bracket-attribute first; mixed forms are not used today and are not needed.
- **PR diff size.** ~30 files moved + new factory + 3 PageObjects + 2 end-to-end test rewrites + 1 net-new HomeView test + data-testid attrs added to 3 Vue components + config changes. Mostly mechanical. PR description should call out the `git mv` history-preservation so reviewers don't waste time line-by-line on moved files.
- **Fake-ports lint boundary.** `tests/__fakes__/fake-ports.ts` imports `MockBridge` from `@/infrastructure/mock/MockBridge`. The UI-layer rule that bans this import is scoped to `src/ui/**`; `tests/**` is outside that scope. The factory therefore deliberately lives outside `src/` so UI lint boundaries do not apply to it.
