# W10 — Test Conventions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt mirror test layout under `tests/`, a shared fake-ports factory, the PageObject pattern with `data-testid`-only queries, and enforced coverage thresholds — atomic single PR.

**Architecture:** Tests move from `src/**/__tests__/*.spec.ts` to `tests/**/*.test.ts` via `git mv` (history preserved). A new `tests/__fakes__/fake-ports.ts` exposes `fakeModulePorts()` returning the four ADR-008 ports backed by one `MockBridge`. All 3 Vue component tests get a co-located PageObject with `data-testid`-only queries; ESLint enforces the ban. Coverage thresholds 80/70/80/80 run in `npm run verify` via `test:coverage`.

**Tech Stack:** Vitest 4, Vue 3 + `@vue/test-utils`, ESLint 10 flat config, TypeScript 6.

**Spec:** `specs/w10-test-conventions/design.md` and `docs/adr/ADR-009-test-conventions.md` (already written in this worktree).

**Worktree:** Already on `develop`-derived `w10-test-conventions` branch. Do not create another. If the worktree state differs from clean, surface and stop.

---

## File map

### Created

| Path | Purpose |
|---|---|
| `tests/__fakes__/fake-ports.ts` | `fakeModulePorts()` factory returning 4 ports + bridge ref |
| `tests/ui/views/Home.po.ts` | PageObject for `HomeView` |
| `tests/ui/views/Home.test.ts` | Net-new component test for `HomeView` |
| `tests/ui/components/feature/FeatureCard.po.ts` | PageObject for `FeatureCard` |
| `tests/ui/components/feature/CreateFeatureForm.po.ts` | PageObject for `CreateFeatureForm` |

### Moved (`git mv`, content preserved)

17 files: every `src/**/__tests__/*.spec.ts` → `tests/**/<name>.test.ts`. Full table in `specs/w10-test-conventions/design.md` § Layout.

### Modified

| Path | Change |
|---|---|
| `vitest.config.ts` | `include` glob → `tests/`; coverage `exclude` adds fixtures; coverage `thresholds` added |
| `eslint.config.js` | Add `files: ['tests/**/*.ts']` block with `no-restricted-syntax` CSS-selector ban; update existing test-files block pattern from `**/__tests__/**`/`**/*.spec.ts` to `tests/**/*.ts` |
| `package.json` | `verify` script: `npm run test` → `npm run test:coverage` |
| `CLAUDE.md` | Add `### Testing conventions (ADR-009)` section after `### Vue conventions`; update single-test-file example path |
| `src/ui/views/HomeView.vue` | Add `data-testid` attrs (`home-title`, `home-create-feature`, `home-active-features`) |
| `src/ui/components/feature/FeatureCard.vue` | Add `data-testid` attrs (root + interactive elements) |
| `src/ui/components/feature/CreateFeatureForm.vue` | Add `data-testid` attrs (root + inputs + buttons) |
| `tests/ui/components/feature/FeatureCard.test.ts` | Rewrite end-to-end against `FeatureCard.po` |
| `tests/ui/components/feature/CreateFeatureForm.test.ts` | Rewrite end-to-end against `CreateFeatureForm.po` |

### Deleted

All `src/**/__tests__/` directories (none should remain after the move).

---

## Order rationale

1. **Foundation first** — fake-ports factory exists (no behavioural change) before tests reference it.
2. **Vitest include glob is widened transitionally** to `['src/**/*.spec.ts', 'tests/**/*.test.ts']` so the move can happen without a window where 0 tests run. After the move, the `src/**/*.spec.ts` half is dropped.
3. **Moves happen in one task** as a single `git mv` batch. History is preserved per file. Coverage thresholds are NOT yet enforced at this point — they're added once we know the post-exclude baseline.
4. **PageObjects + data-testid attrs** land per component, each with its own test rewrite. Each component's PO + test rewrite is one atomic task.
5. **ESLint CSS-selector ban** lands AFTER all test rewrites so the lint pass is green from the moment the rule activates.
6. **`package.json verify` switch** lands after coverage thresholds are in vitest.config.ts so the gate has teeth.
7. **Docs** (CLAUDE.md, ADR + design commit) land last. Final `npm run verify` is the gate.

---

## Chunk 1: Foundation — factory, config, moves

### Task 1: Add fake-ports factory

**Files:**
- Create: `tests/__fakes__/fake-ports.ts`
- Test: deferred to Task 1b smoke test below (kept inline; the factory itself is tiny)

**Why:** Single test seam for module-loader and use-case tests. Backs all 4 ADR-008 ports with one `MockBridge` so mutations through one port are visible through the others. `bridge` reference exposed for spy assertions.

- [ ] **Step 1: Read MockBridge to confirm it implements all 4 ports**

```sh
# Confirm: src/infrastructure/mock/MockBridge.ts:13-15 declares
#   `implements SettingsPort, VaultPort, WorkspacePort, NotificationPort`
```
Expected: confirmed (already verified during planning).

- [ ] **Step 2: Create the factory file**

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
 * instance. `bridge` is exposed so tests can read recorded notices and
 * opened-file paths via MockBridge's spy methods.
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

- [ ] **Step 3: Write a smoke test next to the factory**

`tests/__fakes__/fake-ports.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fakeModulePorts } from './fake-ports'

describe('fakeModulePorts', () => {
	it('returns the four narrow ports backed by one MockBridge', () => {
		const ports = fakeModulePorts()
		expect(ports.bridge).toBe(ports.settings)
		expect(ports.bridge).toBe(ports.vault)
		expect(ports.bridge).toBe(ports.workspace)
		expect(ports.bridge).toBe(ports.notifications)
	})

	it('mutations via one port are visible through the bridge ref', async () => {
		const ports = fakeModulePorts()
		await ports.vault.writeFile('specs/x/idea.md', '# x')
		// MockBridge.readFile returns Promise<string> directly (throws on miss);
		// it does NOT return a Result. See src/infrastructure/mock/MockBridge.ts.
		expect(await ports.bridge.readFile('specs/x/idea.md')).toBe('# x')
	})

	it('records notices via the notifications port', () => {
		const ports = fakeModulePorts()
		ports.notifications.showNotice('hi')
		expect(ports.bridge.getNotices()).toHaveLength(1)
	})
})
```

> `MockBridge.readFile` returns `Promise<string>` (raw) and throws on missing path — verified at `src/infrastructure/mock/MockBridge.ts:33-37`. `getNotices()` is a spy method exposed for tests. No `Result` wrapping in this seam.

- [ ] **Step 4: Run the smoke test (will fail — vitest still globs `src/`)**

Run: `npx vitest run --configLoader runner tests/__fakes__/fake-ports.test.ts`
Expected: 0 tests collected (Vitest's current `include` glob is `src/**/*.spec.ts`). That confirms our config change in Task 2 is necessary. Move on.

- [ ] **Step 5: Commit**

```bash
git add tests/__fakes__/fake-ports.ts tests/__fakes__/fake-ports.test.ts
git commit -m "test: add tests/__fakes__/fake-ports factory"
```

---

### Task 2: Widen Vitest include glob (transitional)

**Files:**
- Modify: `vitest.config.ts`

**Why:** The 17 existing tests still live at `src/**/__tests__/*.spec.ts`. We widen `include` to also collect `tests/**/*.test.ts` so the new factory smoke test runs and so we never have a commit window where no tests run.

- [ ] **Step 1: Read current `vitest.config.ts`**

Confirm shape matches what we expect (verified during planning):
- `include: ['src/**/*.spec.ts']`
- `coverage.include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**']`
- `coverage.exclude: ['src/infrastructure/obsidian/**']`
- No `coverage.thresholds`.

- [ ] **Step 2: Update `vitest.config.ts`**

Replace the `test:` block with:

```ts
test: {
	environment: 'jsdom',
	globals: true,
	// Transitional: both globs while the migration in progress.
	// Tightened to tests/**/*.test.ts only after the move (Task 4).
	include: ['src/**/*.spec.ts', 'tests/**/*.test.ts'],
	coverage: {
		provider: 'v8',
		reporter: ['text', 'lcov'],
		include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
		exclude: [
			'src/infrastructure/obsidian/**',
			'**/__fixtures__/**',
			'src/infrastructure/mock/fixtures.ts',
		],
	},
},
```

> Note: `coverage.thresholds` deliberately not added yet — we add them in Task 11 once the post-exclude baseline is captured.

- [ ] **Step 3: Run all tests**

Run: `npm run test`
Expected: 135 existing + 3 new factory smoke tests = 138 total, all PASS. (Report the actual count Vitest prints; should be > 135 and green.)

- [ ] **Step 4: Run coverage to capture pre-migration / post-fixture-exclude baseline**

Run: `npm run test:coverage`
Expected: PASS. Capture the four numbers (statements / branches / functions / lines) from the v8 text reporter — paste them in the PR description as "post-fixture-exclude baseline before tightening include glob." This is the number the threshold floor in Task 11 must respect with margin.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "test: widen vitest include glob and exclude fixture artefacts"
```

---

### Task 3: Move all 17 tests via `git mv`

**Files:**
- 17 moves under `src/**/__tests__/*.spec.ts` → `tests/**/*.test.ts`

**Why:** Mirror layout (ADR-009 §1). `git mv` preserves history per file.

- [ ] **Step 1: Create destination parent directories**

```sh
mkdir -p tests/application/feature
mkdir -p tests/domain/feature
mkdir -p tests/domain/shared
mkdir -p tests/infrastructure/bridge
mkdir -p tests/infrastructure/localstorage
mkdir -p tests/infrastructure/mock
mkdir -p tests/infrastructure/vault
mkdir -p tests/infrastructure/workflow-state
mkdir -p tests/ui/components/feature
mkdir -p tests/ui/composables
mkdir -p tests/ui/router
```

> `tests/` and `tests/__fakes__/` already exist from Task 1. `tests/ui/views/` is created in Task 10.

- [ ] **Step 2: Move all 17 files via `git mv`**

```sh
git mv src/__tests__/eslint-boundaries.spec.ts                                  tests/eslint-boundaries.test.ts
git mv src/application/feature/__tests__/CreateFeatureUseCase.spec.ts           tests/application/feature/CreateFeatureUseCase.test.ts
git mv src/domain/feature/__tests__/Feature.spec.ts                             tests/domain/feature/Feature.test.ts
git mv src/domain/shared/__tests__/Slug.spec.ts                                 tests/domain/shared/Slug.test.ts
git mv src/domain/shared/__tests__/tryAsync.spec.ts                             tests/domain/shared/tryAsync.test.ts
git mv src/infrastructure/bridge/__tests__/NotificationPortContract.spec.ts     tests/infrastructure/bridge/NotificationPortContract.test.ts
git mv src/infrastructure/bridge/__tests__/SettingsPortContract.spec.ts         tests/infrastructure/bridge/SettingsPortContract.test.ts
git mv src/infrastructure/bridge/__tests__/VaultPortContract.spec.ts            tests/infrastructure/bridge/VaultPortContract.test.ts
git mv src/infrastructure/bridge/__tests__/WorkspacePortContract.spec.ts        tests/infrastructure/bridge/WorkspacePortContract.test.ts
git mv src/infrastructure/localstorage/__tests__/LocalStorageBridge.spec.ts     tests/infrastructure/localstorage/LocalStorageBridge.test.ts
git mv src/infrastructure/mock/__tests__/MockBridge.spec.ts                     tests/infrastructure/mock/MockBridge.test.ts
git mv src/infrastructure/vault/__tests__/VaultPath.spec.ts                     tests/infrastructure/vault/VaultPath.test.ts
git mv src/infrastructure/workflow-state/__tests__/WorkflowStateDocument.spec.ts tests/infrastructure/workflow-state/WorkflowStateDocument.test.ts
git mv src/ui/components/feature/__tests__/CreateFeatureForm.spec.ts            tests/ui/components/feature/CreateFeatureForm.test.ts
git mv src/ui/components/feature/__tests__/FeatureCard.spec.ts                  tests/ui/components/feature/FeatureCard.test.ts
git mv src/ui/composables/__tests__/useFeatures.spec.ts                         tests/ui/composables/useFeatures.test.ts
git mv src/ui/router/__tests__/fileRoute.spec.ts                                tests/ui/router/fileRoute.test.ts
```

> Each `git mv` does both rename + extension change in one shot. PowerShell will execute these one per line via the Bash tool — that's expected.

- [ ] **Step 3: Verify no `src/**/__tests__/` directories remain**

Use Glob to confirm `src/**/__tests__/**/*` returns nothing. If any directory still exists empty (Windows can leave them), remove with `Remove-Item -Recurse`.

- [ ] **Step 4: Verify intra-test relative imports survive**

Use Grep to find relative imports starting with `from './` or `from '../'` inside `tests/**/*.test.ts`:

```sh
# All 17 tests should use '@/' alias for source imports — verified during planning.
# Any '../FeatureCard' style import must be updated.
```

If you find any non-aliased relative imports targeting source code, rewrite to `@/` style. Production-code imports survive untouched because they all use `@/`.

- [ ] **Step 5: Run all tests after the move**

Run: `npm run test`
Expected: same total test count as before the move, all PASS. (Vitest now collects the moved files via the `tests/**/*.test.ts` half of the include glob; the `src/**/*.spec.ts` half collects nothing.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: migrate 17 tests to tests/**/*.test.ts mirror layout"
```

---

### Task 4: Tighten Vitest include glob

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Drop the `src/**/*.spec.ts` half**

Change `include` from:

```ts
include: ['src/**/*.spec.ts', 'tests/**/*.test.ts'],
```

to:

```ts
include: ['tests/**/*.test.ts'],
```

Remove the transitional comment.

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: same count as Task 3 step 5, all PASS.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: tighten vitest include glob to tests/**/*.test.ts"
```

---

## Chunk 2: PageObjects + data-testid attrs + test rewrites

### Task 5: Add `data-testid` attrs to `FeatureCard.vue`

**Files:**
- Modify: `src/ui/components/feature/FeatureCard.vue`

**Why:** PageObject queries by `data-testid` only.

- [ ] **Step 1: Add the attributes**

Edit `src/ui/components/feature/FeatureCard.vue`:

- `<article class="sp-feature-card">` → add `data-testid="feature-card"`
- `<div class="sp-progress-bar__fill" :style="...">` → add `data-testid="progress-fill"`
- The 4 `<AppButton>` elements (activate / advance / open / archive) → add `data-testid="activate-button"`, `"advance-step-button"`, `"open-button"`, `"archive-button"` respectively
- Each `<span class="sp-feature-card__step-label">` (4 v-if branches: archived / abandoned / complete / step-progress) → add `data-testid="step-label"`

> `AppButton` is a Vue component, not a native `<button>`. Vue forwards extraneous attributes to the root element by default — confirm by running the test rewrite. If `data-testid` doesn't reach the DOM, fall back to wrapping the AppButton or passing `:data-testid` and updating AppButton to forward it. (AppButton is small and predictable in this codebase; this should Just Work.)

- [ ] **Step 2: Run the existing FeatureCard test (still uses `.sp-progress-bar__fill`)**

Run: `npx vitest run --configLoader runner tests/ui/components/feature/FeatureCard.test.ts`
Expected: PASS (we haven't broken anything; the test queries by class which still works).

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/feature/FeatureCard.vue
git commit -m "feat(ui): add data-testid attrs to FeatureCard"
```

---

### Task 6: Add `FeatureCard.po.ts` and rewrite `FeatureCard.test.ts`

**Files:**
- Create: `tests/ui/components/feature/FeatureCard.po.ts`
- Modify: `tests/ui/components/feature/FeatureCard.test.ts`

**Why:** Lock the convention end-to-end. No selector strings in the test body.

- [ ] **Step 1: Create the PageObject**

`tests/ui/components/feature/FeatureCard.po.ts`:

```ts
import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'feature-card',
	progressFill: 'progress-fill',
	stepLabel: 'step-label',
	activate: 'activate-button',
	advanceStep: 'advance-step-button',
	open: 'open-button',
	archive: 'archive-button',
} as const

export class FeatureCardPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}

	get progressFill() {
		return this.wrapper.find(this.byTid(TID.progressFill))
	}

	get stepLabelText(): string {
		const el = this.wrapper.find(this.byTid(TID.stepLabel))
		return el.exists() ? el.text() : ''
	}

	get advanceStepButton() {
		return this.wrapper.find(this.byTid(TID.advanceStep))
	}

	hasAdvanceStepButton(): boolean {
		return this.advanceStepButton.exists()
	}

	async clickAdvanceStep(): Promise<void> {
		await this.advanceStepButton.trigger('click')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
```

- [ ] **Step 2: Rewrite the test against the PO**

Replace `tests/ui/components/feature/FeatureCard.test.ts` with:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/ui/i18n'
import type { FeatureDto } from '@/ui/types/FeatureDto'
import FeatureCard from '@/ui/components/feature/FeatureCard.vue'
import { FeatureCardPageObject } from './FeatureCard.po'

function makeFeature(overrides: Partial<FeatureDto> = {}): FeatureDto {
	return {
		id: 'feature-1',
		slug: 'feature-1',
		title: 'Feature 1',
		status: 'active',
		currentStep: 1,
		createdAt: '2026-05-02T00:00:00.000Z',
		updatedAt: '2026-05-02T00:00:00.000Z',
		...overrides,
	}
}

function mountCard(feature: FeatureDto) {
	const wrapper = mount(FeatureCard, {
		props: { feature },
		global: { plugins: [i18n] },
	})
	return new FeatureCardPageObject(wrapper)
}

describe('FeatureCard', () => {
	it('renders idea-stage progress', () => {
		const po = mountCard(makeFeature({ currentStep: 1 }))
		expect(po.stepLabelText).toContain('Step 1 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 0%;')
	})

	it('renders mid-stage progress', () => {
		const po = mountCard(makeFeature({ currentStep: 7 }))
		expect(po.stepLabelText).toContain('Step 7 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 50%;')
	})

	it('renders final-stage progress without exceeding the total', () => {
		const po = mountCard(makeFeature({ currentStep: 12 }))
		expect(po.stepLabelText).toContain('Step 12 of 12')
		expect(po.progressFill.attributes('style')).toContain(
			'width: 91.66666666666666%;',
		)
	})

	it('renders complete instead of an out-of-range step', () => {
		const po = mountCard(makeFeature({ currentStep: 13 }))
		expect(po.stepLabelText).toContain('Complete')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 100%;')
	})

	it('renders archived terminal state without step progress text', () => {
		const po = mountCard(makeFeature({ status: 'archived', currentStep: 13 }))
		expect(po.stepLabelText).toContain('Archived')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
	})

	it('renders abandoned terminal state without step progress text', () => {
		const po = mountCard(makeFeature({ status: 'abandoned', currentStep: 13 }))
		expect(po.stepLabelText).toContain('Abandoned')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
	})

	describe('advance step button', () => {
		it('renders for active features that have not completed all stages', () => {
			const po = mountCard(makeFeature({ status: 'active', currentStep: 3 }))
			expect(po.hasAdvanceStepButton()).toBe(true)
		})

		it('does not render for draft features', () => {
			const po = mountCard(makeFeature({ status: 'draft', currentStep: 1 }))
			expect(po.hasAdvanceStepButton()).toBe(false)
		})

		it('does not render once the feature is complete', () => {
			const po = mountCard(makeFeature({ status: 'active', currentStep: 13 }))
			expect(po.hasAdvanceStepButton()).toBe(false)
		})

		it('does not render for archived or abandoned features', () => {
			const archived = mountCard(makeFeature({ status: 'archived', currentStep: 4 }))
			const abandoned = mountCard(makeFeature({ status: 'abandoned', currentStep: 4 }))
			expect(archived.hasAdvanceStepButton()).toBe(false)
			expect(abandoned.hasAdvanceStepButton()).toBe(false)
		})

		it('emits advance-step with the feature id when clicked', async () => {
			const po = mountCard(makeFeature({ id: 'feat-42', status: 'active', currentStep: 2 }))
			await po.clickAdvanceStep()
			expect(po.emitted('advance-step')).toEqual([['feat-42']])
		})
	})
})
```

- [ ] **Step 3: Run the FeatureCard test**

Run: `npx vitest run --configLoader runner tests/ui/components/feature/FeatureCard.test.ts`
Expected: All 11 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/components/feature/FeatureCard.po.ts tests/ui/components/feature/FeatureCard.test.ts
git commit -m "test(ui): rewrite FeatureCard test against PageObject"
```

---

### Task 7: Add `data-testid` attrs to `CreateFeatureForm.vue`

**Files:**
- Modify: `src/ui/components/feature/CreateFeatureForm.vue`

- [ ] **Step 1: Add the attributes**

- `<form class="sp-create-form">` → add `data-testid="create-form"`
- `<input id="feature-title" ...>` → add `data-testid="feature-title-input"`
- `<input id="feature-area" ...>` → add `data-testid="feature-area-input"`
- The two `<AppButton>` elements (submit / cancel) → add `data-testid="create-submit"` and `data-testid="create-cancel"` respectively
- Keep the existing `id="feature-title"` / `id="feature-area"` and label `for=` bindings — they're accessibility wiring, not test selectors.

- [ ] **Step 2: Run the existing CreateFeatureForm test (still uses `#feature-title`)**

Run: `npx vitest run --configLoader runner tests/ui/components/feature/CreateFeatureForm.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/feature/CreateFeatureForm.vue
git commit -m "feat(ui): add data-testid attrs to CreateFeatureForm"
```

---

### Task 8: Add `CreateFeatureForm.po.ts` and rewrite the test

**Files:**
- Create: `tests/ui/components/feature/CreateFeatureForm.po.ts`
- Modify: `tests/ui/components/feature/CreateFeatureForm.test.ts`

- [ ] **Step 1: Create the PageObject**

`tests/ui/components/feature/CreateFeatureForm.po.ts`:

```ts
import type { VueWrapper } from '@vue/test-utils'

const TID = {
	form: 'create-form',
	titleInput: 'feature-title-input',
	areaInput: 'feature-area-input',
	submit: 'create-submit',
	cancel: 'create-cancel',
} as const

export class CreateFeatureFormPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get form() {
		return this.wrapper.get(this.byTid(TID.form))
	}

	get titleInput() {
		return this.wrapper.get(this.byTid(TID.titleInput))
	}

	get titleValue(): string {
		return (this.titleInput.element as HTMLInputElement).value
	}

	get cancelButton() {
		return this.wrapper.get(this.byTid(TID.cancel))
	}

	async setTitle(value: string): Promise<void> {
		await this.titleInput.setValue(value)
	}

	async submit(): Promise<void> {
		await this.form.trigger('submit')
	}

	async clickCancel(): Promise<void> {
		await this.cancelButton.trigger('click')
	}

	emitted(name: string): unknown {
		return this.wrapper.emitted(name)
	}
}
```

- [ ] **Step 2: Rewrite the test**

Replace `tests/ui/components/feature/CreateFeatureForm.test.ts` with:

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/ui/i18n'
import CreateFeatureForm from '@/ui/components/feature/CreateFeatureForm.vue'
import { CreateFeatureFormPageObject } from './CreateFeatureForm.po'

function mountForm(
	submitHandler: (payload: { title: string; area?: string }) => Promise<boolean>,
) {
	const wrapper = mount(CreateFeatureForm, {
		props: { submitHandler },
		global: { plugins: [i18n] },
	})
	return new CreateFeatureFormPageObject(wrapper)
}

describe('CreateFeatureForm', () => {
	it('clears inputs after a successful submit', async () => {
		const handler = vi.fn().mockResolvedValue(true)
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await flushPromises()

		expect(handler).toHaveBeenCalledWith({ title: 'My Feature', area: undefined })
		expect(po.titleValue).toBe('')
	})

	it('retains inputs after a failed submit', async () => {
		const handler = vi.fn().mockResolvedValue(false)
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await flushPromises()

		expect(po.titleValue).toBe('My Feature')
	})

	it('ignores re-entrant submits while a submit is in flight', async () => {
		let resolve!: (v: boolean) => void
		const handler = vi.fn(() => new Promise<boolean>((r) => { resolve = r }))
		const po = mountForm(handler)

		await po.setTitle('My Feature')
		await po.submit()
		await po.submit()
		resolve(true)
		await flushPromises()

		expect(handler).toHaveBeenCalledTimes(1)
	})

	it('emits cancel when the cancel button is clicked', async () => {
		const po = mountForm(vi.fn())
		await po.clickCancel()
		expect(po.emitted('cancel')).toBeTruthy()
	})
})
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run --configLoader runner tests/ui/components/feature/CreateFeatureForm.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/ui/components/feature/CreateFeatureForm.po.ts tests/ui/components/feature/CreateFeatureForm.test.ts
git commit -m "test(ui): rewrite CreateFeatureForm test against PageObject"
```

---

### Task 9: Add `data-testid` attrs to `HomeView.vue`

**Files:**
- Modify: `src/ui/views/HomeView.vue`

- [ ] **Step 1: Add the attributes**

- `<h1 class="sp-home__title">` → add `data-testid="home-title"`
- The `+ {{ t('feature.create') }}` `<AppButton>` → add `data-testid="home-create-feature"`
- `<div v-else class="sp-home__cards">` → add `data-testid="home-active-features"`

- [ ] **Step 2: Sanity-check the build still type-checks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/ui/views/HomeView.vue
git commit -m "feat(ui): add data-testid attrs to HomeView"
```

---

### Task 10: Add `Home.po.ts` and net-new `Home.test.ts`

**Files:**
- Create: `tests/ui/views/Home.po.ts`
- Create: `tests/ui/views/Home.test.ts`

**Why:** Net-new component test that demonstrates the full convention from day one (PO + `data-testid` + `fakeModulePorts` for any port consumers HomeView needs).

- [ ] **Step 1: Create the PageObject**

`tests/ui/views/Home.po.ts`:

```ts
import type { VueWrapper } from '@vue/test-utils'

const TID = {
	title: 'home-title',
	createButton: 'home-create-feature',
	activeList: 'home-active-features',
	createForm: 'create-form',
} as const

export class HomePageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get title() {
		return this.wrapper.get(this.byTid(TID.title))
	}

	get createButton() {
		return this.wrapper.get(this.byTid(TID.createButton))
	}

	get activeList() {
		return this.wrapper.find(this.byTid(TID.activeList))
	}

	isCreateFormVisible(): boolean {
		return this.wrapper.find(this.byTid(TID.createForm)).exists()
	}

	async clickCreate(): Promise<void> {
		await this.createButton.trigger('click')
	}
}
```

> The `createForm` testid is added in Task 7 to `CreateFeatureForm.vue`. Once `HomeView` toggles `showCreateForm = true`, the form mounts and the testid becomes findable.

- [ ] **Step 2: Read `HomeView.vue` to see what it provides/injects**

Confirmed during planning: `HomeView` calls `useSettingsPort()`, `useWorkspacePort()`, `useFeatures()`, `useI18n()`, `useRouter()`. The test must `provide` the four port InjectionKeys backed by `fakeModulePorts()` and install `i18n` + a router.

> The composables look up port injection keys defined in `src/infrastructure/bridge/ports.ts` (`SETTINGS_PORT`, `VAULT_PORT`, `WORKSPACE_PORT`, `NOTIFICATION_PORT`). Verify exact symbol names by reading that file.

- [ ] **Step 3: Write the test**

`tests/ui/views/Home.test.ts`:

```ts
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import HomeView from '@/ui/views/HomeView.vue'
import { i18n } from '@/ui/i18n'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
} from '@/infrastructure/bridge/ports'
import { HomePageObject } from './Home.po'

function mountHome() {
	const ports = fakeModulePorts()
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'home', component: { template: '<div />' } },
			{ path: '/features', name: 'features', component: { template: '<div />' } },
		],
	})
	const wrapper = mount(HomeView, {
		global: {
			plugins: [i18n, router, createPinia()],
			provide: {
				[SETTINGS_PORT as symbol]: ports.settings,
				[VAULT_PORT as symbol]: ports.vault,
				[WORKSPACE_PORT as symbol]: ports.workspace,
				[NOTIFICATION_PORT as symbol]: ports.notifications,
			},
		},
	})
	return { po: new HomePageObject(wrapper), ports }
}

describe('HomeView', () => {
	it('renders the title and create button', async () => {
		const { po } = mountHome()
		await flushPromises()
		expect(po.title.text().length).toBeGreaterThan(0)
		expect(po.createButton.exists()).toBe(true)
	})

	it('toggles the create form when the create button is clicked', async () => {
		const { po } = mountHome()
		await flushPromises()
		expect(po.isCreateFormVisible()).toBe(false)
		await po.clickCreate()
		await flushPromises()
		expect(po.isCreateFormVisible()).toBe(true)
	})
})
```

> Keep this test minimal. It exists to demonstrate the convention end-to-end (PO + `data-testid` + `fakeModulePorts`); deeper behavioural coverage of `HomeView` is W11 territory. Two passing assertions are enough. If `useFeatures` needs additional setup (it might call `vault.listFiles` on mount), the empty `MockBridge` returns an empty list, which the `loading` / `noActiveFeatures` paths handle cleanly — verify by running the test and adjusting if a missing piece surfaces.

- [ ] **Step 4: Run the Home test**

Run: `npx vitest run --configLoader runner tests/ui/views/Home.test.ts`
Expected: PASS. If it doesn't, the most likely culprits are (a) missing Pinia, (b) wrong InjectionKey symbol names, (c) `useFeatures` requiring something the empty MockBridge doesn't provide. Read the failure, fix at the smallest surface (test-side first), and re-run.

- [ ] **Step 5: Run all tests to confirm no regressions**

Run: `npm run test`
Expected: PASS. Test count should be 135 (pre-migration) + 3 (factory smoke) + N (Home) where N is whatever you actually wrote.

- [ ] **Step 6: Commit**

```bash
git add tests/ui/views/Home.po.ts tests/ui/views/Home.test.ts
git commit -m "test(ui): add HomeView test with PageObject + fakeModulePorts"
```

---

## Chunk 3: ESLint ban, coverage gate, docs

### Task 11: Add coverage thresholds and capture final baseline

**Files:**
- Modify: `vitest.config.ts`

**Why:** Now that all tests are in place and the post-exclude baseline is known, lock the floor.

- [ ] **Step 1: Run `npm run test:coverage` and record the four numbers**

Run: `npm run test:coverage`
Capture statements / branches / functions / lines. Expected to be ≥ 88/80/89/91 (pre-migration baseline) — with the new HomeView coverage and the fixture excludes, likely higher.

- [ ] **Step 2: Add the thresholds**

Update `vitest.config.ts` `coverage:` block to add:

```ts
thresholds: {
	statements: 80,
	branches: 70,
	functions: 80,
	lines: 80,
},
```

Final shape:

```ts
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
```

- [ ] **Step 3: Run coverage with thresholds**

Run: `npm run test:coverage`
Expected: PASS — actual numbers must exceed each threshold. If anything fails, do NOT lower the threshold; investigate which file regressed.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "test: enforce coverage thresholds 80/70/80/80"
```

---

### Task 12: Update existing ESLint test-files block to new path

**Files:**
- Modify: `eslint.config.js` (the existing test-relax block at lines ~373–390)

**Why:** The existing block uses `**/__tests__/**/*.ts` and `**/*.spec.ts` patterns — those no longer match anything. Update before adding the new ban so we know lint is clean against the new path.

- [ ] **Step 1: Edit the test-files block files glob**

Find the block beginning with:

```js
// Test files — relax strict rules that get noisy in fixtures/mocks
{
	files: ['**/__tests__/**/*.ts', '**/*.spec.ts'],
```

Change `files` to:

```js
	files: ['tests/**/*.ts'],
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS. (No CSS-selector ban yet; rewritten tests use `[data-testid="..."]` which is allowed.)

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): retarget test-files relax block to tests/**/*.ts"
```

---

### Task 13: Add CSS-selector ban for `tests/**`

**Files:**
- Modify: `eslint.config.js`

**Why:** Enforce `data-testid`-only queries.

- [ ] **Step 1: Append the ban block**

Add a new block at the end of the `defineConfig(...)` call (before the closing `)`):

```js
	// Tests must query exclusively via data-testid (ADR-009).
	// CSS class and id selector literals passed to wrapper.find / findAll /
	// get / getAll are forbidden — add a data-testid attribute and route
	// through a PageObject getter instead.
	{
		files: ['tests/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						"CallExpression[callee.property.name=/^(find|findAll|get|getAll)$/] > Literal[value=/^[\\.#]/]",
					message:
						'Tests must query via data-testid only. CSS class and id selectors are forbidden — add a data-testid attribute and route through a PageObject getter instead.',
				},
			],
		},
	},
```

> Note: this block defines a `no-restricted-syntax` rule for `tests/**/*.ts`. Earlier blocks may also configure `no-restricted-syntax` for the same file glob (see the project-wide block that bans `TryStatement` and `delete`). ESLint flat config merges: the LAST `no-restricted-syntax` definition for a matching file fully replaces earlier ones — it is not additive. Verify by looking at lint output: if the `TryStatement` ban no longer fires in tests, that's expected (the existing test-files relax block at Task 12 already overrides it). The `delete`-operator ban is separately scoped via the result-discipline allowlist block and does not touch `tests/**`. So replacing the rule for `tests/**` only affects the in-tests CSS-selector check.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS. All test files use `[data-testid="..."]` queries; no `.foo` / `#bar` literals remain.

- [ ] **Step 3: Sanity-check the rule fires**

Temporarily edit any test file to add `wrapper.find('.fake-class')`, run `npm run lint`, expect ERROR with the configured message. Revert.

```sh
# Example: add a stray line to tests/ui/views/Home.test.ts then revert
```

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore(eslint): ban CSS-class/id selectors in tests/**"
```

---

### Task 14: Switch `verify` script to `test:coverage`

**Files:**
- Modify: `package.json`

**Why:** Make the threshold gate run in `npm run verify` (which CI invokes).

- [ ] **Step 1: Edit `package.json`**

In the `verify` script, replace `npm run test` with `npm run test:coverage`. Final form:

```json
"verify": "npm audit --audit-level=high --omit=dev && npm run typecheck && npm run lint && npm run test:coverage && npm run build && npm run build:web && npm run docs:api && npm run validate:manifest && npm run verify:workflows && git diff --check --ignore-cr-at-eol",
```

- [ ] **Step 2: Run verify**

Run: `npm run verify`
Expected: PASS, including the threshold check.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: route verify through test:coverage to enforce thresholds"
```

---

### Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Why:** Documents conventions for future contributors and updates the stale single-test-file example.

- [ ] **Step 1: Update the single-test-file example**

Find:

```sh
npx vitest run src/domain/feature/__tests__/Feature.spec.ts
```

Replace with:

```sh
npx vitest run tests/domain/feature/Feature.test.ts
```

- [ ] **Step 2: Insert the testing-conventions section**

After the `### Vue conventions (ADR-003)` section and before `### Key files`, add:

```markdown
### Testing conventions (ADR-009)

- Tests live under `tests/`, mirroring `src/` path-for-path. The test for `src/x/y.ts` is `tests/x/y.test.ts`. The `.test.ts` extension is canonical; `.spec.ts` is no longer used. `__tests__/` folders inside `src/` are forbidden.
- The shared fake-ports factory `tests/__fakes__/fake-ports.ts` exposes `fakeModulePorts()` returning the four ADR-008 ports plus the underlying `MockBridge` reference. Mutations through one port are visible through the others. Use it for any test that needs more than one port.
- Vue component tests that mount a component MUST have a co-located class-based PageObject (e.g. `Home.po.ts` next to `Home.test.ts`). Elements are queried exclusively by `data-testid`. CSS-class and id selectors (`.foo`, `#bar`) are forbidden in `tests/**`; ESLint enforces this.
- `npm run test:coverage` enforces hard thresholds 80/70/80/80 (statements/branches/functions/lines). The threshold gate runs as part of `npm run verify`, so CI inherits it automatically.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): add testing conventions section per ADR-009"
```

---

### Task 16: Commit the spec + ADR if not yet committed

**Files:**
- `specs/w10-test-conventions/design.md` (already written; commit if not yet)
- `docs/adr/ADR-009-test-conventions.md` (already written; commit if not yet)

- [ ] **Step 1: Check git status**

```sh
git status specs/w10-test-conventions docs/adr/ADR-009-test-conventions.md
```

- [ ] **Step 2: Commit if needed**

If either file is untracked or modified:

```bash
git add specs/w10-test-conventions/design.md docs/adr/ADR-009-test-conventions.md
git commit -m "docs(adr): add ADR-009 test conventions and W10 design spec"
```

If both are already committed (e.g., from the brainstorming flow), skip this task.

---

### Task 17: Final verify gate

- [ ] **Step 1: Run the full verify gate**

Run: `npm run verify`
Expected: PASS at every step (audit, typecheck, lint, coverage with thresholds, build, build:web, docs:api, validate:manifest, verify:workflows, git diff --check).

- [ ] **Step 2: If any step fails, stop and surface**

Do not soften thresholds, disable rules, or `--no-verify` past hook failures. Investigate root cause. The most likely failure modes:

- `lint` fires the new CSS-selector ban: a `wrapper.find('.foo')` slipped in. Find and rewrite via PO.
- Coverage threshold drift: a file regressed below floor. Check the v8 text report for the offender.
- `docs:api` fails: TypeDoc dislikes a JSDoc comment in a moved file or in `fake-ports.ts`. Fix the doc comment.

- [ ] **Step 3: Confirm the migration acceptance criteria**

Manual check, no commit needed:

- [x] `tests/__fakes__/fake-ports.ts` covers all 4 ADR-008 ports.
- [x] PageObjects exist for `Home`, `FeatureCard`, `CreateFeatureForm`.
- [x] All 17 prior tests now live under `tests/**/*.test.ts`. Run `Glob` over `src/**/__tests__/**` and confirm zero hits.
- [x] Coverage gate at 80/70/80/80; CI inherits via `npm run verify`.
- [x] CSS-selector ban active in `tests/**`.

- [ ] **Step 4: Report ready for PR**

No further commits. The branch is now ready for the user to open the PR.

---

## Risks during execution

- **`AppButton` doesn't forward `data-testid`.** Vue 3 `<script setup>` components forward extraneous attrs to the root element by default. Confirm with the FeatureCard test run (Task 6 step 3). If broken, the cleanest fix is a one-line `inheritAttrs` change in `AppButton.vue` (already true by default) or a deliberate `:data-testid` binding pattern. Do NOT wrap AppButton in another element.
- **Pinia / router not provided to HomeView test.** The mountHome helper installs both. If `useFeatures` reaches into a store that requires Pinia, the test will fail with a clear "no active Pinia" error — Pinia is provided.
- **InjectionKey symbols.** The 4 InjectionKey constants live in `src/infrastructure/bridge/ports.ts`. Read that file to confirm exact symbol names before writing the Home test (`SETTINGS_PORT`, `VAULT_PORT`, `WORKSPACE_PORT`, `NOTIFICATION_PORT` per CLAUDE.md).
- **Vitest coverage `include` paths.** Coverage `include` continues to point at `src/**` because production code does not move. Only the test `include` glob changes.
- **Windows + git mv.** `git mv` works on Windows but case-only renames can be flaky; none of the 17 moves are case-only, so this is not a concern here.
- **`--configLoader runner` flag on direct CLI invocations.** Every `npx vitest run` in this plan passes `--configLoader runner` to match the npm scripts (`test`, `test:watch`, `test:coverage`). Vitest 4 needs this; bare `npx vitest run tests/foo.test.ts` may behave differently (no plugins applied, etc.). If you invoke vitest directly outside this plan, mirror the flag.
- **Cross-task data-testid dependency.** Task 10's HomeView test queries `data-testid="create-form"` to assert the form-toggle behaviour. That testid is added in Task 7. Tasks 5/6 → 7/8 → 9/10 are ordered to satisfy this — do NOT reorder.

---

## Rollback

If anything goes catastrophically wrong mid-migration and the branch is unsalvageable:

```bash
git reset --hard <commit-before-Task-1>
```

Each task is its own commit, so partial rollback to any earlier point is straightforward.
