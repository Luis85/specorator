# W1 — Narrow Ports Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the aggregate `IBridge` interface with four narrow ports (`SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`) consumed via per-port composables and injected via per-port `InjectionKey`s.

**Architecture:** Domain-owned port interfaces in `src/domain/ports/`. One adapter class per runtime (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) implements all four port interfaces. UI consumers depend on one port at a time via `useSettingsPort()`, `useVaultPort()`, `useWorkspacePort()`, `useNotificationPort()`. `IBridge`, `BridgeKey`, and `useBridge` are deleted.

**Tech Stack:** TypeScript 5, Vue 3 (Composition API + `provide`/`inject`), Vitest, ESLint flat config, Obsidian Plugin API.

**Spec:** `specs/w1-port-granularity/design.md`. Read it before starting.

**Branch:** `feature/w1-port-granularity` (cut from `develop`). Foundation commit `fc62a1b` already on branch (spec + ADR-008 + ADR-002 supersession).

---

## Chunk 1: Foundation — PluginSettings extraction, port interfaces, DI keys, composables

This chunk introduces the new types and DI primitives without removing any existing code. After this chunk, `IBridge`, `BridgeKey`, and `useBridge` still exist and are still used by every caller; the new ports and composables are simply available alongside them. The build remains green throughout.

### Task 1: Extract `PluginSettings` and `DEFAULT_SETTINGS` to the domain layer

**Files:**
- Create: `src/domain/settings/PluginSettings.ts`

**Why:** `PluginSettings` describes domain-level configuration (folders, locale, gate strictness), not bridge mechanics. Living in `IBridge.ts` is incidental. Moving it to `src/domain/settings/` makes it importable without dragging in the bridge surface.

- [ ] **Step 1: Create `src/domain/settings/PluginSettings.ts`**

```ts
/**
 * Domain-level plugin configuration. Persisted via SettingsPort and
 * read by use cases that need to resolve vault paths or behaviour flags.
 */
export interface PluginSettings {
	readonly locale: string
	readonly specsFolder: string
	readonly archiveFolder: string
	readonly decisionsFolder: string
	readonly constitutionFile: string
	readonly gateStrictness: 'strict' | 'lenient'
	readonly teamMode: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
	locale: 'en',
	specsFolder: 'specs',
	archiveFolder: 'archive',
	decisionsFolder: 'decisions',
	constitutionFile: 'CONSTITUTION.md',
	gateStrictness: 'strict',
	teamMode: false,
}
```

- [ ] **Step 2: Verify file compiles in isolation**

Run: `npx tsc --noEmit src/domain/settings/PluginSettings.ts`
Expected: PASS (no diagnostics).

- [ ] **Step 3: Re-export from old `IBridge.ts` location for now**

Modify `src/infrastructure/bridge/IBridge.ts`. Replace the in-file `PluginSettings` interface and `DEFAULT_SETTINGS` constant with a re-export from the new domain location. This keeps the build green while callers migrate over the next tasks.

```ts
export { type PluginSettings, DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

/**
 * Abstracts all Obsidian API calls so the UI and domain logic
 * remain testable without an Obsidian instance.
 *
 * @deprecated Use the narrow ports in @/domain/ports instead. This
 * interface is removed in Task 16.
 */
export interface IBridge {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	deleteFile(path: string): Promise<void>
	listFiles(folder: string): Promise<string[]>
	listFolders(parent: string): Promise<string[]>
	fileExists(path: string): Promise<boolean>
	createFolder(path: string): Promise<void>
	openFile(path: string): Promise<void>
	showNotice(message: string, durationMs?: number): void
	getSettings(): Promise<PluginSettings>
	saveSettings(settings: PluginSettings): Promise<void>
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run tests**

Run: `npm test -- --run`
Expected: PASS, 116 tests still passing.

- [ ] **Step 6: Commit**

```bash
git add src/domain/settings/PluginSettings.ts src/infrastructure/bridge/IBridge.ts
git commit -m "refactor(w1): extract PluginSettings to domain/settings (#99)

PluginSettings + DEFAULT_SETTINGS are domain configuration, not bridge
mechanics. Move to src/domain/settings/PluginSettings.ts and re-export
from the old IBridge location to keep callers green during migration."
```

### Task 2: Define the four port interfaces

**Files:**
- Create: `src/domain/ports/SettingsPort.ts`
- Create: `src/domain/ports/VaultPort.ts`
- Create: `src/domain/ports/WorkspacePort.ts`
- Create: `src/domain/ports/NotificationPort.ts`
- Create: `src/domain/ports/index.ts`

- [ ] **Step 1: Write `SettingsPort.ts`**

```ts
import type { PluginSettings } from '@/domain/settings/PluginSettings'

/**
 * Reads and persists plugin configuration. Returns defensive copies so
 * callers cannot mutate the canonical store.
 */
export interface SettingsPort {
	getSettings(): Promise<PluginSettings>
	saveSettings(settings: PluginSettings): Promise<void>
}
```

- [ ] **Step 2: Write `VaultPort.ts`**

```ts
/**
 * Reads, writes, lists, and removes vault-relative file and folder paths.
 * All paths are vault-relative (no leading slash). Implementations are
 * responsible for normalising path separators.
 */
export interface VaultPort {
	readFile(path: string): Promise<string>
	writeFile(path: string, content: string): Promise<void>
	deleteFile(path: string): Promise<void>
	listFiles(folder: string): Promise<string[]>
	listFolders(parent: string): Promise<string[]>
	fileExists(path: string): Promise<boolean>
	createFolder(path: string): Promise<void>
}
```

- [ ] **Step 3: Write `WorkspacePort.ts`**

```ts
/**
 * Opens a vault-relative file in the host workspace (Obsidian tab,
 * standalone harness route, etc.). Implementations decide how the open
 * action manifests in their environment.
 */
export interface WorkspacePort {
	openFile(path: string): Promise<void>
}
```

- [ ] **Step 4: Write `NotificationPort.ts`**

```ts
/**
 * Surfaces a transient user-visible notice. Default duration is 4000ms
 * when not specified by the caller; implementations honour that default.
 */
export interface NotificationPort {
	showNotice(message: string, durationMs?: number): void
}
```

- [ ] **Step 5: Write `index.ts`**

```ts
/**
 * Narrow ports replacing the IBridge aggregate (ADR-008).
 *
 * Consumers depend on one port at a time. Do NOT introduce a new
 * interface that composes two or more of these ports — interface
 * segregation is the whole point of this directory. If a consumer
 * appears to need a "VaultAndNotificationPort", it needs two
 * dependencies, not a new aggregate type.
 */
export type { SettingsPort } from './SettingsPort'
export type { VaultPort } from './VaultPort'
export type { WorkspacePort } from './WorkspacePort'
export type { NotificationPort } from './NotificationPort'
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/ports/
git commit -m "feat(w1): add narrow port interfaces in domain/ports (#99)

Adds SettingsPort, VaultPort, WorkspacePort, NotificationPort. Each is a
single-responsibility interface. index.ts carries the explanatory ban on
aggregate composition (no port should compose another)."
```

### Task 3: Define the four `InjectionKey`s

**Files:**
- Create: `src/infrastructure/bridge/ports.ts`

**Why:** Vue's `provide`/`inject` needs symbol keys. One key per port keeps narrowing honest at the consumer site.

- [ ] **Step 1: Write `ports.ts`**

```ts
import type { InjectionKey } from 'vue'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
} from '@/domain/ports'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/bridge/ports.ts
git commit -m "feat(w1): add per-port InjectionKey symbols (#99)

SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT, NOTIFICATION_PORT live in
src/infrastructure/bridge/ports.ts. They replace the single BRIDGE_KEY
in subsequent tasks."
```

### Task 4: Add the four port composables

**Files:**
- Create: `src/ui/composables/useSettingsPort.ts`
- Create: `src/ui/composables/useVaultPort.ts`
- Create: `src/ui/composables/useWorkspacePort.ts`
- Create: `src/ui/composables/useNotificationPort.ts`

- [ ] **Step 1: Write `useSettingsPort.ts`**

```ts
import { inject } from 'vue'
import type { SettingsPort } from '@/domain/ports'
import { SETTINGS_PORT } from '@/infrastructure/bridge/ports'

export function useSettingsPort(): SettingsPort {
	const port = inject(SETTINGS_PORT)
	if (!port) {
		throw new Error(
			'SettingsPort was not provided. Call app.provide(SETTINGS_PORT, port) before mounting the app.',
		)
	}
	return port
}
```

- [ ] **Step 2: Write `useVaultPort.ts`**

```ts
import { inject } from 'vue'
import type { VaultPort } from '@/domain/ports'
import { VAULT_PORT } from '@/infrastructure/bridge/ports'

export function useVaultPort(): VaultPort {
	const port = inject(VAULT_PORT)
	if (!port) {
		throw new Error(
			'VaultPort was not provided. Call app.provide(VAULT_PORT, port) before mounting the app.',
		)
	}
	return port
}
```

- [ ] **Step 3: Write `useWorkspacePort.ts`**

```ts
import { inject } from 'vue'
import type { WorkspacePort } from '@/domain/ports'
import { WORKSPACE_PORT } from '@/infrastructure/bridge/ports'

export function useWorkspacePort(): WorkspacePort {
	const port = inject(WORKSPACE_PORT)
	if (!port) {
		throw new Error(
			'WorkspacePort was not provided. Call app.provide(WORKSPACE_PORT, port) before mounting the app.',
		)
	}
	return port
}
```

- [ ] **Step 4: Write `useNotificationPort.ts`**

```ts
import { inject } from 'vue'
import type { NotificationPort } from '@/domain/ports'
import { NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'

export function useNotificationPort(): NotificationPort {
	const port = inject(NOTIFICATION_PORT)
	if (!port) {
		throw new Error(
			'NotificationPort was not provided. Call app.provide(NOTIFICATION_PORT, port) before mounting the app.',
		)
	}
	return port
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/composables/useSettingsPort.ts src/ui/composables/useVaultPort.ts src/ui/composables/useWorkspacePort.ts src/ui/composables/useNotificationPort.ts
git commit -m "feat(w1): add per-port composables for inject(...) (#99)

useSettingsPort, useVaultPort, useWorkspacePort, useNotificationPort.
Each throws a port-specific error message if the corresponding
InjectionKey is missing, making misconfigured bootstraps obvious."
```

### Task 5: Migrate the 11 surviving `PluginSettings` importers

**Files:**
- Modify: `src/infrastructure/localstorage/LocalStorageBridge.ts`
- Modify: `src/infrastructure/mock/MockBridge.ts`
- Modify: `src/infrastructure/obsidian/ObsidianBridge.ts`
- Modify: `src/plugin/settings.ts`
- Modify: `src/ui/composables/useSettings.ts`
- Modify: `src/ui/stores/settingsStore.ts`
- Modify: `src/ui/views/SettingsView.vue`
- Modify: `src/ui/composables/__tests__/useFeatures.spec.ts`
- Modify: `src/infrastructure/localstorage/__tests__/LocalStorageBridge.spec.ts`
- Modify: `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts`
- Modify: `src/infrastructure/bridge/FeatureRepository.ts`

**Why:** `IBridge.ts` re-exports `PluginSettings` and `DEFAULT_SETTINGS` for now (Task 1 step 3), but every importer should point directly at the new domain location. This task is mechanical sed-style replacement — no API change.

- [ ] **Step 1: Find every importer**

Run: `grep -rn "from ['\"]\(\@/infrastructure/bridge/IBridge\|\.\./IBridge\|\./IBridge\)['\"]" src/`

Confirm the 11 files plus `IBridge.ts` itself plus `IBridgeContract.spec.ts` (which is deleted in Task 11).

- [ ] **Step 2: Update each importer**

For each file, replace:

```ts
import type { PluginSettings } from '@/infrastructure/bridge/IBridge'
import { DEFAULT_SETTINGS } from '@/infrastructure/bridge/IBridge'
```

(or relative variants — `'./IBridge'`, `'../IBridge'`, `'../bridge/IBridge'`) with:

```ts
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
```

For files that import only `PluginSettings` (not `DEFAULT_SETTINGS`) or only `DEFAULT_SETTINGS`, keep the import minimal.

For files that ALSO import `IBridge` (e.g. `FeatureRepository.ts`), keep the `IBridge` import on a separate line pointing at the existing location. `IBridge` itself is removed in Chunk 4.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: PASS, 116 tests still passing.

- [ ] **Step 5: Verify no remaining importers point at IBridge.ts for `PluginSettings` / `DEFAULT_SETTINGS`**

Run: `grep -rn "from ['\"]\(\@/infrastructure/bridge/IBridge\|\.\./IBridge\|\./IBridge\)['\"]" src/ | grep -E "PluginSettings|DEFAULT_SETTINGS"`
Expected: zero matches outside `IBridge.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(w1): point PluginSettings importers at domain/settings (#99)

11 files now import PluginSettings/DEFAULT_SETTINGS from the new
canonical location. IBridge.ts re-export remains for one more chunk
while IBridge itself is migrated, then both are deleted together."
```

---

## Chunk 2: Adapter conformance and contract test split

After this chunk, all three runtime classes formally declare `implements` on the four port interfaces (no behaviour change — methods already present), and the single `IBridgeContract` test file is split into four port-shaped contract specs that exercise each port surface independently. `IBridge` still exists but now sits unused alongside the ports it spawned.

### Task 6: Declare `implements` on `MockBridge`

**Files:**
- Modify: `src/infrastructure/mock/MockBridge.ts`

**Why:** Adds compile-time proof that `MockBridge` satisfies all four port interfaces. Forces the type checker to flag any future port additions that the class fails to implement.

- [ ] **Step 1: Add port type imports**

Replace the existing `IBridge` import block at the top of `MockBridge.ts` with:

```ts
import type { IBridge } from '@/infrastructure/bridge/IBridge'
import type {
	SettingsPort,
	VaultPort,
	WorkspacePort,
	NotificationPort,
} from '@/domain/ports'
```

(Keep the `IBridge` import for now — it is used in the `implements` clause until Task 16 removes it.)

- [ ] **Step 2: Update the class declaration**

Change:

```ts
export class MockBridge implements IBridge {
```

to:

```ts
export class MockBridge
	implements IBridge, SettingsPort, VaultPort, WorkspacePort, NotificationPort
{
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no diagnostics, since every method on the four ports already exists on `MockBridge`.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: PASS, 116 tests.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/mock/MockBridge.ts
git commit -m "refactor(w1): MockBridge implements four narrow ports (#99)

Adds compile-time proof of port conformance alongside the existing
IBridge declaration. Behaviour unchanged."
```

### Task 7: Declare `implements` on `LocalStorageBridge`

**Files:**
- Modify: `src/infrastructure/localstorage/LocalStorageBridge.ts`

- [ ] **Step 1: Add port type imports** (same pattern as Task 6 step 1).

- [ ] **Step 2: Update class declaration to `implements IBridge, SettingsPort, VaultPort, WorkspacePort, NotificationPort`**.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run tests**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/localstorage/LocalStorageBridge.ts
git commit -m "refactor(w1): LocalStorageBridge implements four narrow ports (#99)"
```

### Task 8: Declare `implements` on `ObsidianBridge`

**Files:**
- Modify: `src/infrastructure/obsidian/ObsidianBridge.ts`

- [ ] **Step 1: Add port type imports** (same pattern).

- [ ] **Step 2: Update class declaration to `implements IBridge, SettingsPort, VaultPort, WorkspacePort, NotificationPort`**.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Build the plugin bundle (validates Obsidian-side typing)**

Run: `npm run build`
Expected: PASS — `main.js` written to project root.

- [ ] **Step 5: Run tests**

Run: `npm test -- --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/obsidian/ObsidianBridge.ts
git commit -m "refactor(w1): ObsidianBridge implements four narrow ports (#99)"
```

### Task 9: Split `IBridgeContract.spec.ts` into four port contract specs — write the new specs first

**Files:**
- Create: `src/infrastructure/bridge/__tests__/SettingsPortContract.spec.ts`
- Create: `src/infrastructure/bridge/__tests__/VaultPortContract.spec.ts`
- Create: `src/infrastructure/bridge/__tests__/WorkspacePortContract.spec.ts`
- Create: `src/infrastructure/bridge/__tests__/NotificationPortContract.spec.ts`

**Why:** Each port should have a contract spec that exercises only its surface. Test failures then point at one port instead of "the bridge". The original `IBridgeContract.spec.ts` is left in place during this task and removed in Task 11 once the new specs cover all behaviour.

The new specs use the same `BridgeScenario` / `BridgeHarness` pattern but parameterised over the relevant port interface.

- [ ] **Step 1: Write `SettingsPortContract.spec.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { SettingsPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Harness {
	readonly name: string
	readonly makePort: () => SettingsPort
}

function registerSettingsContract(harness: Harness): void {
	describe(`${harness.name} SettingsPort contract`, () => {
		let port: SettingsPort

		beforeEach(() => {
			port = harness.makePort()
		})

		it('returns defensive settings copies and persists saved settings', async () => {
			const initial = await port.getSettings()
			const mutableInitial = initial as { locale: string }
			mutableInitial.locale = 'de'

			expect((await port.getSettings()).locale).toBe(DEFAULT_SETTINGS.locale)

			await port.saveSettings({ ...DEFAULT_SETTINGS, locale: 'de', specsFolder: 'plans' })
			const saved = await port.getSettings()

			expect(saved.locale).toBe('de')
			expect(saved.specsFolder).toBe('plans')

			const mutableSaved = saved as { specsFolder: string }
			mutableSaved.specsFolder = 'mutated'
			expect((await port.getSettings()).specsFolder).toBe('plans')
		})
	})
}

registerSettingsContract({
	name: 'MockBridge',
	makePort: () => new MockBridge(),
})

registerSettingsContract({
	name: 'LocalStorageBridge',
	makePort: () => {
		localStorage.clear()
		return new LocalStorageBridge()
	},
})
```

- [ ] **Step 2: Write `VaultPortContract.spec.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { VaultPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Harness {
	readonly name: string
	readonly makePort: () => VaultPort
}

function registerVaultContract(harness: Harness): void {
	describe(`${harness.name} VaultPort contract`, () => {
		let port: VaultPort

		beforeEach(() => {
			port = harness.makePort()
		})

		it('reads content after writeFile and reports existence', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')

			expect(await port.fileExists('specs/search/workflow-state.md')).toBe(true)
			expect(await port.readFile('specs/search/workflow-state.md')).toBe('state')
		})

		it('rejects readFile for a missing file', async () => {
			await expect(port.readFile('specs/missing/workflow-state.md')).rejects.toThrow(
				'File not found',
			)
		})

		it('removes files idempotently', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')

			await port.deleteFile('specs/search/workflow-state.md')
			await port.deleteFile('specs/search/workflow-state.md')

			expect(await port.fileExists('specs/search/workflow-state.md')).toBe(false)
		})

		it('lists direct child files under a folder', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')
			await port.writeFile('specs/search/idea.md', 'idea')
			await port.writeFile('specs/search/nested/deep.md', 'deep')
			await port.writeFile('specs/other/workflow-state.md', 'other')

			const files = await port.listFiles('specs/search')

			expect(files.sort()).toEqual(['specs/search/idea.md', 'specs/search/workflow-state.md'])
		})

		it('lists immediate child folders under a parent', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')
			await port.writeFile('specs/dark-mode/workflow-state.md', 'state')
			await port.writeFile('notes/today.md', 'note')

			const folders = await port.listFolders('specs')

			expect(folders.sort()).toEqual(['dark-mode', 'search'])
		})

		it('allows createFolder to be called before writing files', async () => {
			await expect(port.createFolder('specs/new-feature')).resolves.toBeUndefined()
			await port.writeFile('specs/new-feature/workflow-state.md', 'state')

			expect(await port.readFile('specs/new-feature/workflow-state.md')).toBe('state')
		})
	})
}

registerVaultContract({
	name: 'MockBridge',
	makePort: () => new MockBridge(),
})

registerVaultContract({
	name: 'LocalStorageBridge',
	makePort: () => {
		localStorage.clear()
		return new LocalStorageBridge()
	},
})
```

- [ ] **Step 3: Write `WorkspacePortContract.spec.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkspacePort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Scenario {
	readonly port: WorkspacePort
	readonly readOpenedFile: () => string | null
}

interface Harness {
	readonly name: string
	readonly makeScenario: () => Scenario
}

function registerWorkspaceContract(harness: Harness): void {
	describe(`${harness.name} WorkspacePort contract`, () => {
		let scenario: Scenario

		beforeEach(() => {
			scenario = harness.makeScenario()
		})

		it('records the path passed to openFile', async () => {
			await scenario.port.openFile('specs/search/workflow-state.md')
			expect(scenario.readOpenedFile()).toBe('specs/search/workflow-state.md')
		})
	})
}

registerWorkspaceContract({
	name: 'MockBridge',
	makeScenario: () => {
		const bridge = new MockBridge()
		return { port: bridge, readOpenedFile: () => bridge.getOpenedFile() }
	},
})

registerWorkspaceContract({
	name: 'LocalStorageBridge',
	makeScenario: () => {
		localStorage.clear()
		let openedFile: string | null = null
		const abort = new AbortController()
		window.addEventListener(
			'sp:open-file',
			(event) => {
				openedFile = (event as CustomEvent<{ path: string }>).detail.path
			},
			{ signal: abort.signal },
		)
		return {
			port: new LocalStorageBridge(),
			readOpenedFile: () => {
				abort.abort()
				return openedFile
			},
		}
	},
})
```

- [ ] **Step 4: Write `NotificationPortContract.spec.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { NotificationPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Scenario {
	readonly port: NotificationPort
	readonly readNotices: () => Array<{ message: string; durationMs: number }>
}

interface Harness {
	readonly name: string
	readonly makeScenario: () => Scenario
}

function registerNotificationContract(harness: Harness): void {
	describe(`${harness.name} NotificationPort contract`, () => {
		let scenario: Scenario

		beforeEach(() => {
			scenario = harness.makeScenario()
		})

		it('records messages with the default 4000ms duration', () => {
			scenario.port.showNotice('hello')
			expect(scenario.readNotices()).toEqual([{ message: 'hello', durationMs: 4000 }])
		})
	})
}

registerNotificationContract({
	name: 'MockBridge',
	makeScenario: () => {
		const bridge = new MockBridge()
		return { port: bridge, readNotices: () => bridge.getNotices() }
	},
})

registerNotificationContract({
	name: 'LocalStorageBridge',
	makeScenario: () => {
		localStorage.clear()
		const notices: Array<{ message: string; durationMs: number }> = []
		const abort = new AbortController()
		window.addEventListener(
			'sp:notice',
			(event) => {
				notices.push((event as CustomEvent<{ message: string; durationMs: number }>).detail)
			},
			{ signal: abort.signal },
		)
		return {
			port: new LocalStorageBridge(),
			readNotices: () => {
				abort.abort()
				return notices
			},
		}
	},
})
```

- [ ] **Step 5: Run the new specs**

Run: `npx vitest run src/infrastructure/bridge/__tests__/SettingsPortContract.spec.ts src/infrastructure/bridge/__tests__/VaultPortContract.spec.ts src/infrastructure/bridge/__tests__/WorkspacePortContract.spec.ts src/infrastructure/bridge/__tests__/NotificationPortContract.spec.ts`
Expected: PASS — every assertion green.

- [ ] **Step 6: Run the full test suite (old contract still passing alongside new ones)**

Run: `npm test -- --run`
Expected: PASS, 116 + new tests, all green.

- [ ] **Step 7: Commit**

```bash
git add src/infrastructure/bridge/__tests__/SettingsPortContract.spec.ts src/infrastructure/bridge/__tests__/VaultPortContract.spec.ts src/infrastructure/bridge/__tests__/WorkspacePortContract.spec.ts src/infrastructure/bridge/__tests__/NotificationPortContract.spec.ts
git commit -m "test(w1): add per-port contract specs (#99)

Splits IBridgeContract behavioural assertions into four port-shaped
specs. Old contract spec stays in place until callers migrate; both
suites pass against MockBridge and LocalStorageBridge."
```

---

## Chunk 3: Caller migration

After this chunk, every consumer holds a narrow port instead of `IBridge`. `useBridge` and `BridgeKey` are still defined but no longer imported anywhere outside `IBridge.ts` itself.

### Task 10: Migrate `FeatureRepository`

**Files:**
- Modify: `src/infrastructure/bridge/FeatureRepository.ts`

**Why:** `FeatureRepository` is the largest consumer of bridge methods (file/folder + notifications). Converting it to narrow ports makes the rest of the migration easier — once the repo takes ports, `useFeatures.ts` can wire them in directly.

- [ ] **Step 1: Update imports**

Replace:

```ts
import type { IBridge, PluginSettings } from './IBridge'
```

with:

```ts
import type { VaultPort, NotificationPort } from '@/domain/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
```

(Note: `PluginSettings` import was already moved in Task 5 — verify and merge if a duplicate appears.)

- [ ] **Step 2: Update constructor signature**

Change:

```ts
constructor(
	private readonly bridge: IBridge,
	private readonly settings: PluginSettings,
) {}
```

to:

```ts
constructor(
	private readonly vault: VaultPort,
	private readonly notifications: NotificationPort,
	private readonly settings: PluginSettings,
) {}
```

- [ ] **Step 3: Update method bodies**

Replace every `this.bridge.<vault-method>` (`readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder`) with `this.vault.<method>`.

Replace every `this.bridge.showNotice(...)` with `this.notifications.showNotice(...)`.

(Use a global find-and-replace within the file: `this.bridge.` to nothing where it precedes a vault method name, then prefix with `this.vault.` or `this.notifications.` as appropriate. Verify each replacement individually — there are roughly a dozen call sites.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: FAIL — `useFeatures.ts` still constructs `FeatureRepository(bridge, settings)` with the old signature. That is fixed in Task 11. Diagnostics should be limited to that one file plus any test files instantiating the repository.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/bridge/FeatureRepository.ts
git commit -m "refactor(w1): FeatureRepository takes VaultPort + NotificationPort (#99)

Constructor now accepts narrow ports instead of the IBridge aggregate.
Bodies dispatch vault methods through the vault port and showNotice
through the notification port. useFeatures.ts and the repo's tests are
updated in the next two commits and rebuild green by Task 12."
```

### Task 11: Migrate `useFeatures` composable and its test

**Files:**
- Modify: `src/ui/composables/useFeatures.ts`
- Modify: `src/ui/composables/__tests__/useFeatures.spec.ts`

- [ ] **Step 1: Update `useFeatures.ts` imports**

Replace:

```ts
import { useBridge } from './useBridge'
```

with:

```ts
import { useSettingsPort } from './useSettingsPort'
import { useVaultPort } from './useVaultPort'
import { useNotificationPort } from './useNotificationPort'
```

- [ ] **Step 2: Update `useFeatures.ts` body**

Inside the `useFeatures` function:

Change:

```ts
const bridge = useBridge()
```

to:

```ts
const settingsPort = useSettingsPort()
const vault = useVaultPort()
const notifications = useNotificationPort()
```

In every closure (`loadFeatures`, `createFeature`, `activateFeature`, `archiveFeature`, `advanceFeatureStage`):

Change:

```ts
const settings = await bridge.getSettings()
const repo = new FeatureRepository(bridge, settings)
```

to:

```ts
const settings = await settingsPort.getSettings()
const repo = new FeatureRepository(vault, notifications, settings)
```

- [ ] **Step 3: Update `useFeatures.spec.ts`**

The spec uses object-literal `provide:` form inside `mount(... { global: { provide: { ... } } })` (line 24), not the function-call `provide(...)` form. Replace:

```ts
import { BRIDGE_KEY } from '@/infrastructure/bridge/BridgeKey'
// ...
provide: { [BRIDGE_KEY as unknown as symbol]: bridge },
```

with:

```ts
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
} from '@/infrastructure/bridge/ports'
// ...
provide: {
	[SETTINGS_PORT as unknown as symbol]: bridge,
	[VAULT_PORT as unknown as symbol]: bridge,
	[WORKSPACE_PORT as unknown as symbol]: bridge,
	[NOTIFICATION_PORT as unknown as symbol]: bridge,
},
```

The same `MockBridge` instance satisfies all four port interfaces.

The spec's `seedActiveFeature` helper (line 31) directly constructs `new FeatureRepository(bridge, DEFAULT_SETTINGS)` — this is a mandatory edit, not conditional. Update to:

```ts
const repo = new FeatureRepository(bridge, bridge, DEFAULT_SETTINGS)
```

(`MockBridge` is passed twice — once as `vault`, once as `notifications`.)

Verify `DEFAULT_SETTINGS` import on line 11 already points at `@/domain/settings/PluginSettings` (Task 5 should have moved it). If not, fix it now.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS for these two files. Other consumers (views, FeatureRepository tests) may still fail; that is expected and addressed in Tasks 12–14.

- [ ] **Step 5: Run the targeted spec**

Run: `npx vitest run src/ui/composables/__tests__/useFeatures.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/composables/useFeatures.ts src/ui/composables/__tests__/useFeatures.spec.ts
git commit -m "refactor(w1): useFeatures wires three narrow ports into FeatureRepository (#99)

Composable now injects SettingsPort, VaultPort, NotificationPort and
constructs FeatureRepository with the latter two. Spec provides all
four ports against the same MockBridge instance."
```

### Task 12: Migrate `CreateFeatureUseCase` test

**Files:**
- Modify: `src/application/feature/__tests__/CreateFeatureUseCase.spec.ts`

- [ ] **Step 1: Update `FeatureRepository` construction**

Find every `new FeatureRepository(bridge, settings)` and change to `new FeatureRepository(bridge, bridge, settings)` (`MockBridge` satisfies both port interfaces, pass it twice). Currently a single call site inside `makeRepo` (line 10).

- [ ] **Step 2: Verify imports point at canonical locations**

- The line-7 `import { DEFAULT_SETTINGS, type PluginSettings } from '@/infrastructure/bridge/IBridge'` should already have been moved by Task 5 to `@/domain/settings/PluginSettings`. Confirm it has — if not, fix it now.
- Drop any leftover `IBridge` type import if present.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS for this file.

- [ ] **Step 4: Run the spec**

Run: `npx vitest run src/application/feature/__tests__/CreateFeatureUseCase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/feature/__tests__/CreateFeatureUseCase.spec.ts
git commit -m "test(w1): CreateFeatureUseCase passes MockBridge as VaultPort + NotificationPort (#99)"
```

### Task 13: Migrate UI views (`HomeView`, `FeaturesView`, `FileView`, `SettingsView`)

**Files:**
- Modify: `src/ui/views/HomeView.vue`
- Modify: `src/ui/views/FeaturesView.vue`
- Modify: `src/ui/views/FileView.vue`
- Modify: `src/ui/views/SettingsView.vue`

**Why:** Three views currently grab the whole bridge via `useBridge()`. Each uses only one or two methods. Replace with narrow composables. The fourth view (`SettingsView.vue`) does not use `useBridge` at all (it goes through `useSettings()`); its only Chunk-3 change is verifying the `PluginSettings` type import was relocated by Task 5.

- [ ] **Step 1: Confirm port mapping per view**

Verified against actual call sites:
- `HomeView.vue` — uses `bridge.getSettings()` and `bridge.openFile()` → `SettingsPort` + `WorkspacePort`
- `FeaturesView.vue` — uses `bridge.getSettings()` and `bridge.openFile()` → `SettingsPort` + `WorkspacePort`
- `FileView.vue` — uses `bridge.readFile(...)` only (the `router.back()` is Vue Router, not the bridge) → `VaultPort` only
- `SettingsView.vue` — does NOT call `useBridge()` (uses the `useSettings()` composable). Only the `PluginSettings` type import on line 8 needs to point at the new domain location.

- [ ] **Step 2: Migrate `HomeView.vue` and `FeaturesView.vue` (Settings + Workspace)**

In each file, replace:

```ts
import { useBridge } from '@/ui/composables/useBridge'
const bridge = useBridge()
// ... bridge.getSettings(), bridge.openFile(...)
```

with:

```ts
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort'
const settingsPort = useSettingsPort()
const workspace = useWorkspacePort()
// ... settingsPort.getSettings(), workspace.openFile(...)
```

Update every call site in the file accordingly.

- [ ] **Step 3: Migrate `FileView.vue` (VaultPort only)**

Replace:

```ts
import { useBridge } from '../composables/useBridge'
const bridge = useBridge()
// ... bridge.readFile(filePath)
```

with:

```ts
import { useVaultPort } from '../composables/useVaultPort'
const vault = useVaultPort()
// ... vault.readFile(filePath)
```

Do NOT add a `useWorkspacePort` call — `router.back()` is Vue Router, unrelated to the workspace port.

- [ ] **Step 4: Verify `SettingsView.vue` `PluginSettings` import was migrated by Task 5**

Open `src/ui/views/SettingsView.vue`. Line 8 should read:

```ts
import type { PluginSettings } from '@/domain/settings/PluginSettings'
```

If it still reads `@/infrastructure/bridge/IBridge`, fix it now (Task 5 likely missed it). No `useBridge` migration is needed in this file.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS for these four files (entry-point providers are fixed in Task 14).

> **Note on the Task 13 → Task 14 window:** Typecheck passes after this commit because `BRIDGE_KEY` is still importable, but the running app would throw "VaultPort not provided" / "SettingsPort not provided" if launched between commits — the views inject ports the bootstraps don't yet provide. This is intentional: Task 14 closes the gap, and the smoke test in Task 14 step 7 is the runtime-green gate. Do not run `npm run dev` between Task 13 and Task 14.

- [ ] **Step 6: Run the test suite**

Run: `npm test -- --run`
Expected: PASS for everything except possibly the entry-point bootstrap (which doesn't have unit tests today).

- [ ] **Step 7: Commit**

```bash
git add src/ui/views/HomeView.vue src/ui/views/FeaturesView.vue src/ui/views/FileView.vue src/ui/views/SettingsView.vue
git commit -m "refactor(w1): views inject narrow ports instead of IBridge (#99)

HomeView and FeaturesView take SettingsPort + WorkspacePort. FileView
takes VaultPort. SettingsView did not use useBridge — only its
PluginSettings type import was relocated. See spec caller migration
table."
```

### Task 14: Migrate plugin bootstrap (`SpecoratorView`) and standalone bootstrap (`ui/main.ts`)

**Files:**
- Modify: `src/plugin/SpecoratorView.ts`
- Modify: `src/ui/main.ts`

**Why:** The two Vue app construction sites are where injection happens. Each must provide all four ports against the same bridge instance.

- [ ] **Step 1: Update `SpecoratorView.ts`**

Replace:

```ts
import { BRIDGE_KEY } from '@/infrastructure/bridge/BridgeKey'
```

with:

```ts
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
} from '@/infrastructure/bridge/ports'
```

In `onOpen()`, replace:

```ts
this.vueApp.provide(BRIDGE_KEY, bridge)
```

with:

```ts
this.vueApp.provide(SETTINGS_PORT, bridge)
this.vueApp.provide(VAULT_PORT, bridge)
this.vueApp.provide(WORKSPACE_PORT, bridge)
this.vueApp.provide(NOTIFICATION_PORT, bridge)
```

- [ ] **Step 2: Update `src/ui/main.ts`**

Apply the analogous change. Replace the `BRIDGE_KEY` import with the four port-key imports, and the single `app.provide(BRIDGE_KEY, bridge)` line with four `app.provide(<key>, bridge)` lines.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS — the only remaining `IBridge` references should be `IBridge.ts` itself, `BridgeKey.ts`, and `useBridge.ts` (all deleted in Chunk 4).

- [ ] **Step 4: Build the plugin bundle**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Build the standalone bundle**

Run: `npm run build:web`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS, every test green.

- [ ] **Step 7: Manual smoke test (standalone)**

Run: `npm run dev` in a separate terminal. Open the URL it prints. Verify:
- Settings view loads (SettingsPort works)
- Features list loads, "Create feature" creates a feature (Vault + Notification ports work)
- Clicking a file row opens the file view (Workspace port works)

If any of those fail, investigate which port wiring is missing before continuing. Open the browser DevTools console while clicking through each route and watch for `"... was not provided"` errors — a silent injection failure that happens to not be exercised by the click-through would otherwise slip past. (The Bash tool's UI verification is limited — see CLAUDE.md guidance: report explicitly if a manual smoke test was performed or skipped.)

- [ ] **Step 8: Commit**

```bash
git add src/plugin/SpecoratorView.ts src/ui/main.ts
git commit -m "refactor(w1): bootstrap providers register four narrow ports (#99)

Plugin (SpecoratorView) and standalone (ui/main.ts) Vue apps now
register the same bridge instance under four InjectionKeys. Consumers
inject one port at a time via the per-port composables."
```

---

## Chunk 4: Cleanup — delete `IBridge`, ESLint, CLAUDE.md, verify

After this chunk, `IBridge` / `BridgeKey` / `useBridge` no longer exist; ESLint forbids re-introducing them by name; CLAUDE.md describes the new architecture; the pre-PR gate is green.

### Task 15: Delete `IBridge.ts`, `BridgeKey.ts`, `useBridge.ts`, and the old contract spec

**Files:**
- Delete: `src/infrastructure/bridge/IBridge.ts`
- Delete: `src/infrastructure/bridge/BridgeKey.ts`
- Delete: `src/ui/composables/useBridge.ts`
- Delete: `src/infrastructure/bridge/__tests__/IBridgeContract.spec.ts`

**Why:** No remaining importers — all migrated in Chunks 2 and 3.

- [ ] **Step 1: Verify no remaining importers**

Run: `grep -rn "from ['\"]\(.*IBridge\|.*BridgeKey\|.*useBridge\)['\"]" src/`
Expected: zero matches (other than possibly the files about to be deleted).

If any matches appear, stop and migrate that consumer per the spec's caller migration table before deleting.

- [ ] **Step 2: Remove the `implements IBridge` clause from the three runtime classes**

Edit `MockBridge.ts`, `LocalStorageBridge.ts`, and `ObsidianBridge.ts`. In each file:
- Remove the `IBridge` type import.
- Remove `IBridge` from the `implements` clause (leave the four port interfaces).

- [ ] **Step 3: Delete the four files**

```bash
rm src/infrastructure/bridge/IBridge.ts
rm src/infrastructure/bridge/BridgeKey.ts
rm src/ui/composables/useBridge.ts
rm src/infrastructure/bridge/__tests__/IBridgeContract.spec.ts
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS — every consumer already uses ports.

- [ ] **Step 5: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS, all four port contract specs cover the surface previously held by `IBridgeContract.spec.ts`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(w1): delete IBridge, BridgeKey, useBridge, IBridgeContract spec (#99)

All consumers migrated to narrow ports. The aggregate types and the
single composable are no longer needed. Per-port contract specs cover
the same behavioural surface."
```

### Task 16: ESLint name ban

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Update `no-restricted-imports`**

In the project-wide rules block (around line 49), extend the `paths` array to include the deleted symbols. Final rule:

```js
'no-restricted-imports': [
	'error',
	{
		paths: [
			{
				name: 'obsidian',
				message:
					'Import from obsidian only in the plugin adapter layer (src/plugin/**).',
			},
		],
		patterns: [
			{
				group: [
					'**/IBridge',
					'**/BridgeKey',
					'**/useBridge',
					'./IBridge',
					'./BridgeKey',
					'./useBridge',
					'../IBridge',
					'../BridgeKey',
					'../useBridge',
					'../bridge/IBridge',
					'../bridge/BridgeKey',
					'../composables/useBridge',
				],
				message:
					'IBridge / BridgeKey / useBridge were superseded by the narrow ports in src/domain/ports (ADR-008). Import a specific port (SettingsPort, VaultPort, WorkspacePort, NotificationPort) and the matching composable instead.',
			},
		],
	},
],
```

The pattern list covers both alias-style imports (`@/infrastructure/bridge/IBridge`) and the relative-path forms historically used inside `src/infrastructure/bridge/` and `src/ui/composables/`. ESLint's `patterns` uses minimatch — `**/IBridge` matches `@/...` and bare-name forms but not relative-dot prefixes, so the relative variants must be listed explicitly.

The adapter-layer override block (around line 81) already disables `no-restricted-imports` for `src/plugin/**` and `src/infrastructure/obsidian/**` — this means the new pattern ban also does not apply there. That is acceptable: those layers have no reason to re-introduce `IBridge`, and the override exists primarily for the `obsidian` import.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Sanity check the rule fires for both alias and relative imports**

Test the alias form: create `src/domain/ports/sanity-check-alias.ts` containing:

```ts
import type { IBridge } from '@/infrastructure/bridge/IBridge'
const _x: IBridge | null = null
```

Test the relative form (where the patterns list includes `./IBridge`): create `src/infrastructure/bridge/sanity-check-relative.ts` containing:

```ts
import type { IBridge } from './IBridge'
const _y: IBridge | null = null
```

(Note: by Task 15, `IBridge.ts` no longer exists — TypeScript will also error on this file. The lint check still fires on the import declaration regardless of whether the module resolves.)

Run: `npm run lint`
Expected: at least TWO errors — `IBridge / BridgeKey / useBridge were superseded...` once for each sanity-check file. If only the alias error fires, the `patterns` list is missing the relative variant — broaden it before deleting the sanity files.

Delete both sanity-check files when done.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js
git commit -m "chore(w1): forbid IBridge/BridgeKey/useBridge re-introduction (#99)

no-restricted-imports patterns flag any future attempt to import the
deleted aggregate types. Error message points at ADR-008 and the
narrow-port replacements."
```

### Task 17: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the `### IBridge abstraction (ADR-002)` section**

Locate the section header `### IBridge abstraction (ADR-002)` (currently around the architecture description). Replace the entire section (header through the `Vue components must never import obsidian directly...` paragraph) with:

```markdown
### Narrow ports (ADR-008)

All Obsidian API calls go through four narrow ports declared in `src/domain/ports/`:

- **`SettingsPort`** — `getSettings`, `saveSettings`
- **`VaultPort`** — `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder`
- **`WorkspacePort`** — `openFile`
- **`NotificationPort`** — `showNotice`

Three runtime classes implement all four ports:

- **`ObsidianBridge`** (`src/infrastructure/obsidian/`) — production, wraps `App` + `Vault`
- **`MockBridge`** (`src/infrastructure/mock/`) — unit tests and `npm run dev`
- **`LocalStorageBridge`** (`src/infrastructure/localstorage/`) — GitHub Pages demo

Each port has its own `InjectionKey` (`SETTINGS_PORT`, `VAULT_PORT`, `WORKSPACE_PORT`, `NOTIFICATION_PORT` in `src/infrastructure/bridge/ports.ts`) and its own composable (`useSettingsPort`, `useVaultPort`, `useWorkspacePort`, `useNotificationPort` in `src/ui/composables/`). Consumers depend on **one port per dependency** — there is no aggregate `usePorts()`. ESLint forbids re-introducing the deleted `IBridge` / `BridgeKey` / `useBridge` symbols.

Vue components must **never** import `obsidian` directly (ESLint `no-restricted-imports` enforces this).
```

- [ ] **Step 2: Update the `### Key files` section**

Locate the `### Key files` block. Replace:

```
- `src/infrastructure/bridge/IBridge.ts` — bridge interface + `PluginSettings` type + `DEFAULT_SETTINGS`
```

with:

```
- `src/domain/ports/` — narrow port interfaces (SettingsPort, VaultPort, WorkspacePort, NotificationPort)
- `src/domain/settings/PluginSettings.ts` — `PluginSettings` type + `DEFAULT_SETTINGS`
- `src/infrastructure/bridge/ports.ts` — per-port InjectionKey symbols
```

- [ ] **Step 3: Update the stale `BridgeKey` reference in the Vue conventions section**

Locate the line in the `### Vue conventions (ADR-003)` block (around line 90) reading:

```
- UI imports use cases for business logic; UI must not import domain or infrastructure directly except for `BridgeKey` types.
```

Replace with:

```
- UI imports use cases for business logic; UI must not import domain or infrastructure directly except for port types from `@/domain/ports` and the matching InjectionKey symbols from `@/infrastructure/bridge/ports`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(w1): CLAUDE.md describes narrow ports instead of IBridge (#99)

Architecture section + Key files block updated. ADR-002 is referenced
as superseded; ADR-008 is the canonical pointer."
```

### Task 18: Final verification gate

- [ ] **Step 1: Run the full pre-PR gate**

Run: `npm run verify`
Expected: PASS — typecheck, lint, format check, tests, build all green.

- [ ] **Step 2: Confirm no `IBridge` references remain in source**

Run: `grep -rwn "IBridge\|BridgeKey\|useBridge" src/`
Expected: zero matches. The `-w` flag enforces whole-word match so substrings inside other identifiers (e.g. `BridgeScenario`, `BridgeHarness`, `useBridgePort`) do not produce false positives.

Run: `grep -rwn "IBridge\|BridgeKey\|useBridge" docs/ specs/ CLAUDE.md`
Expected: matches only in `docs/adr/ADR-002-*.md` (intentional — historical record), `docs/adr/ADR-008-*.md` (intentional), and `specs/w1-port-granularity/*.md` (intentional spec/plan record). Matches in this plan file itself (`plan.md`) are also expected.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feature/w1-port-granularity
gh pr create --base develop --title "feat(w1): replace IBridge with four narrow ports (#99)" --body "$(cat <<'EOF'
## Summary
- Replaces the aggregate `IBridge` interface (ADR-002) with four narrow ports: `SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort` (ADR-008).
- One adapter class per runtime continues to satisfy all ports — no per-port file fan-out.
- 21 callers migrated to per-port composables. `IBridge`, `BridgeKey`, `useBridge` deleted; ESLint forbids re-introduction by name.
- Out of scope: 9 additional ports listed in #99 (Logger, Command, ViewRegistry, Dialog, Platform, Storage, Scheduler, Translation, FileExtension) — none have current consumers; they will be introduced alongside their first consumer.

## Diff size
~30–40 files. Mostly mechanical (4 new port files, 4 new composables, 1 ports.ts, 1 extracted PluginSettings module, 3 modified runtime classes, ~21 caller import/wire-up swaps, 4 new contract specs replacing 1, 1 ESLint entry, 1 new ADR + 1 superseded ADR + CLAUDE.md update).

## Test plan
- [ ] `npm run verify` green locally
- [ ] Manual smoke test in standalone (`npm run dev`): settings load, feature create/list, file open
- [ ] Manual smoke test in Obsidian: enable plugin from `main.js`, repeat the three flows
- [ ] CI green on PR

Closes #99 (with the scope-reduction documented in `specs/w1-port-granularity/design.md`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Update task tracker**

Mark task #3 (Implementation plan via writing-plans skill) as completed in the session task list. Confirm PR URL with the user.

---

## Notes for the implementer

- **DRY guard:** every port composable looks nearly identical (inject + null check + return). Resist the urge to factor a generic `useInjectedPort<T>(key, name)` helper — the four files together are 36 lines, and the per-port error message ("SettingsPort was not provided...") is the only thing a future debugger has to tell them which provide call is missing. Keep them flat.
- **YAGNI guard:** if you find yourself wanting to add a `LoggerPort` or `PlatformPort` because "it might be useful later", stop and re-read the deferred-ports section of `specs/w1-port-granularity/design.md`. Add a port only when a real consumer needs it.
- **Branch hygiene:** stay on `feature/w1-port-granularity`. Do not merge into `develop` until the PR is approved.
- **No version bump:** this is internal refactor — `manifest.json`, `package.json`, `versions.json` are untouched. Releases are cut from `main` (per CLAUDE.md branching model), not from feature branches.
