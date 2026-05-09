# W12 Scaffold & Deploy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix seven code issues in PR #180's scaffold/deploy tooling and add a three-layer automated feedback loop (pre-commit lint, `verify:scaffold` CI gate, `HelloView.po.ts` hello-module stub).

**Architecture:** All changes live in `scripts/`, `.githooks/`, `tests/scripts/`, and `tests/modules/hello/`. No `src/` changes. Each task is independently committable and leaves the test suite green.

**Tech Stack:** Node ESM (`.mjs`), Vitest, TypeScript JSDoc (`// @ts-check` + `allowJs`), ESLint, git hooks.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/_utils.mjs` | Shared `pathExists` used by both scripts |
| Modify | `scripts/scaffold-module.mjs` | JSDoc, import `pathExists` from `_utils`, `-module` guard, `renderViewPoFile`, `init` signature, `wiringInstructions` |
| Modify | `scripts/deploy-to-test-vault.mjs` | JSDoc, import `pathExists` from `_utils` |
| Delete | `scripts/scaffold-module.d.mts` | Replaced by JSDoc |
| Delete | `scripts/deploy-to-test-vault.d.mts` | Replaced by JSDoc |
| Create | `scripts/verify-scaffold.mjs` | CI gate: checks every module dir has 5 required files |
| Modify | `tsconfig.lint.json` | Add `allowJs: true` + `scripts/**/*.mjs` so JSDoc types resolve |
| Modify | `package.json` | Add `verify:scaffold` script; insert into `verify` pipeline |
| Create | `.githooks/pre-commit` | Runs `npm run lint --silent` before every commit |
| Modify | `tests/scripts/scaffold-module.test.ts` | 5-file plan, PO render, `-module` rejection, `init` assertion |
| Modify | `tests/scripts/deploy-to-test-vault.test.ts` | Negative `readPluginId` cases |
| Create | `tests/scripts/verify-scaffold.test.ts` | Three cases for the new CI gate script |
| Create | `tests/modules/hello/HelloView.po.ts` | Missing PO stub so `hello` passes `verify:scaffold` |

---

## Task 1 — Extract `pathExists` to `scripts/_utils.mjs`

**Files:**
- Create: `scripts/_utils.mjs`
- Modify: `scripts/deploy-to-test-vault.mjs` (replace local function with import)
- Modify: `scripts/scaffold-module.mjs` (replace local function with import)

- [ ] **Step 1: Create `scripts/_utils.mjs`**

```js
// @ts-check
import { access } from 'node:fs/promises';

/**
 * @param {string} p
 * @returns {Promise<boolean>}
 */
export async function pathExists(p) {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}
```

- [ ] **Step 2: Update `scripts/deploy-to-test-vault.mjs`**

Remove the local `pathExists` function (lines ~27–34) and add the import at the top:

```js
import { pathExists } from './_utils.mjs';
```

The rest of the file is unchanged. The `pathExists` calls throughout the function body remain identical.

- [ ] **Step 3: Update `scripts/scaffold-module.mjs`**

Same change: remove the local `pathExists` function and add:

```js
import { pathExists } from './_utils.mjs';
```

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```
npx vitest run tests/scripts/
```

Expected: all existing deploy and scaffold tests pass.

- [ ] **Step 5: Commit**

```
git add scripts/_utils.mjs scripts/deploy-to-test-vault.mjs scripts/scaffold-module.mjs
git commit -m "refactor(scripts): extract shared pathExists to _utils.mjs"
```

---

## Task 2 — JSDoc + `allowJs` + delete `.d.mts` files

**Files:**
- Modify: `tsconfig.lint.json`
- Modify: `scripts/deploy-to-test-vault.mjs`
- Modify: `scripts/scaffold-module.mjs`
- Delete: `scripts/deploy-to-test-vault.d.mts`
- Delete: `scripts/scaffold-module.d.mts`

- [ ] **Step 1: Update `tsconfig.lint.json`**

Add `"allowJs": true` under `compilerOptions` and add `"scripts/**/*.mjs"` to the `include` array:

```json
{
	"extends": "./tsconfig.json",
	"compilerOptions": {
		"allowJs": true
	},
	"include": [
		"src/**/*.ts",
		"src/**/*.d.ts",
		"src/**/*.vue",
		"tests/**/*.ts",
		"stories/**/*.ts",
		".storybook/**/*.ts",
		"vite.config.ts",
		"vitest.config.ts",
		"eslint.config.js",
		"scripts/**/*.mjs"
	],
	"exclude": []
}
```

- [ ] **Step 2: Add JSDoc to `scripts/deploy-to-test-vault.mjs`**

The edit is purely additive — insert lines before export declarations. Function bodies are not touched.

**Insert at line 1** (before the existing `// W12 —` comment):
```js
// @ts-check
```

**Insert before `export const VAULT_ENV_VAR`:**
```js
/** @type {'SPECORATOR_TEST_VAULT'} */
```

**Insert before `export async function readPluginId`:**
```js
/**
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
```

**Insert before `export function resolveTargetDir`:**
```js
/**
 * @param {string} vaultPath
 * @param {string} pluginId
 * @returns {string}
 */
```

**Insert before `export async function deployToVault`:**
```js
/**
 * @typedef {{ repoRoot: string, vaultPath: string | undefined, log?: (message: string) => void }} DeployOptions
 * @typedef {{ pluginId: string, targetDir: string, copied: ReadonlyArray<string>, missing: ReadonlyArray<string> }} DeployResult
 */
/**
 * @param {DeployOptions} options
 * @returns {Promise<DeployResult>}
 */
```

- [ ] **Step 3: Add JSDoc to `scripts/scaffold-module.mjs`**

Same pattern — insert lines only, no body changes.

**Insert at line 1** (before the existing `// W12 —` comment):
```js
// @ts-check
```

**Insert after the `NAME_REGEX` const and before `export function isValidModuleName`:**
```js
/**
 * @typedef {{ role: 'module' | 'events' | 'view' | 'test' | 'view-po', path: string, contents: string }} ScaffoldFile
 * @typedef {{ created: ReadonlyArray<ScaffoldFile>, skipped: ReadonlyArray<ScaffoldFile> }} ScaffoldResult
 * @typedef {{ repoRoot: string, name: string, log?: (message: string) => void }} ScaffoldOptions
 */
```

**Insert before each of the six named exports:**

| Before | JSDoc line |
|--------|-----------|
| `export function isValidModuleName` | `/** @param {unknown} name @returns {boolean} */` |
| `export function toPascalCase` | `/** @param {string} name @returns {string} */` |
| `export function toCamelCase` | `/** @param {string} name @returns {string} */` |
| `export function renderModuleFile` | `/** @param {string} name @returns {string} */` |
| `export function renderEventsFile` | `/** @param {string} name @returns {string} */` |
| `export function renderViewFile` | `/** @param {string} name @returns {string} */` |
| `export function renderTestFile` | `/** @param {string} name @returns {string} */` |
| `export function plannedFiles` | `/** @param {string} repoRoot @param {string} name @returns {ReadonlyArray<ScaffoldFile>} */` |
| `export async function scaffoldModule` | `/** @param {ScaffoldOptions} options @returns {Promise<ScaffoldResult>} */` |
| `export function wiringInstructions` | `/** @param {string} name @returns {string} */` |

`renderViewPoFile` will be added in Task 5 — skip it here.

- [ ] **Step 4: Delete the `.d.mts` files**

```
git rm scripts/scaffold-module.d.mts
git rm scripts/deploy-to-test-vault.d.mts
```

- [ ] **Step 5: Run typecheck**

```
npm run typecheck
```

Expected: exits 0. The `allowJs: true` + JSDoc now supplies the types that `.d.mts` previously provided.

- [ ] **Step 6: Run tests**

```
npx vitest run tests/scripts/
```

Expected: all pass.

- [ ] **Step 7: Commit**

```
git add tsconfig.lint.json scripts/deploy-to-test-vault.mjs scripts/scaffold-module.mjs
git commit -m "refactor(scripts): replace .d.mts declarations with JSDoc + allowJs"
```

---

## Task 3 — Negative `readPluginId` tests

**Files:**
- Modify: `tests/scripts/deploy-to-test-vault.test.ts`

- [ ] **Step 1: Add new describe block to `tests/scripts/deploy-to-test-vault.test.ts`**

Add this after the existing `'deploy-to-test-vault — manifest plumbing'` describe block:

```ts
describe('deploy-to-test-vault — manifest error cases', () => {
	it('throws when manifest id is an empty string', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(
				path.join(repoRoot, 'manifest.json'),
				JSON.stringify({ id: '', name: 'Test', version: '0.0.1' }),
				'utf8',
			);
			await expect(readPluginId(repoRoot)).rejects.toThrow(/missing required string "id"/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('throws when manifest id is not a string', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(
				path.join(repoRoot, 'manifest.json'),
				JSON.stringify({ id: 42, name: 'Test', version: '0.0.1' }),
				'utf8',
			);
			await expect(readPluginId(repoRoot)).rejects.toThrow(/missing required string "id"/);
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});

	it('throws when manifest.json contains invalid JSON', async () => {
		const repoRoot = await makeTempDir('specorator-deploy-repo-');
		try {
			await writeFile(path.join(repoRoot, 'manifest.json'), '{ broken json', 'utf8');
			await expect(readPluginId(repoRoot)).rejects.toThrow();
		} finally {
			await rm(repoRoot, { recursive: true, force: true });
		}
	});
});
```

- [ ] **Step 2: Run tests**

```
npx vitest run tests/scripts/deploy-to-test-vault.test.ts
```

Expected: all 3 new tests pass immediately (the existing code already handles these cases).

- [ ] **Step 3: Commit**

```
git add tests/scripts/deploy-to-test-vault.test.ts
git commit -m "test(scripts): add negative readPluginId cases for empty/non-string/malformed id"
```

---

## Task 4 — `-module` suffix guard (TDD)

**Files:**
- Modify: `tests/scripts/scaffold-module.test.ts`
- Modify: `scripts/scaffold-module.mjs`

- [ ] **Step 1: Write the failing test**

Add this inside the `'scaffold-module — write behavior'` describe block in `tests/scripts/scaffold-module.test.ts`:

```ts
it('rejects a name ending in -module and suggests the corrected name', async () => {
	const root = await makeTempRoot();
	try {
		await expect(
			scaffoldModule({ repoRoot: root, name: 'template-module' }),
		).rejects.toThrow(/must not end with '-module'/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
```

- [ ] **Step 2: Run to confirm the test fails**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: the new test FAILs with something like "received function did not throw".

- [ ] **Step 3: Implement the guard in `scaffoldModule`**

In `scripts/scaffold-module.mjs`, add this check at the top of `scaffoldModule`, before the `isValidModuleName` check:

```js
export async function scaffoldModule({ repoRoot, name, log = () => {} }) {
	if (typeof name === 'string' && name.endsWith('-module')) {
		const suggestion = name.slice(0, -7);
		throw new Error(
			`Module name must not end with '-module' (the suffix is added automatically). Use '${suggestion}' instead: npm run scaffold:module -- ${suggestion}`,
		);
	}
	if (!isValidModuleName(name)) {
		// ... existing error unchanged
	}
	// ... rest unchanged
}
```

- [ ] **Step 4: Run the test again**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: all tests pass including the new one.

- [ ] **Step 5: Commit**

```
git add scripts/scaffold-module.mjs tests/scripts/scaffold-module.test.ts
git commit -m "feat(scaffold): reject module names ending in -module"
```

---

## Task 5 — `renderViewPoFile` + 5th scaffold file (TDD)

**Files:**
- Modify: `tests/scripts/scaffold-module.test.ts`
- Modify: `scripts/scaffold-module.mjs`

- [ ] **Step 1: Write failing tests**

Add inside `'scaffold-module — render output'`:

```ts
it('view PO file carries class name, TID const, and data-testid root', () => {
	const out = renderViewPoFile('template-installer');
	expect(out).toContain('TemplateInstallerViewPageObject');
	expect(out).toContain("root: 'template-installer-view'");
	expect(out).toContain('data-testid=');
});
```

Update the existing `'scaffold-module — file plan'` test to expect 5 files:

```ts
it('plans five files at the expected paths', () => {
	const plan = plannedFiles('/repo', 'template-installer');
	const paths = plan.map((f) => f.path.replace(/\\/g, '/'));
	expect(paths).toEqual([
		'/repo/src/modules/template-installer/template-installer-module.ts',
		'/repo/src/modules/template-installer/template-installer-events.ts',
		'/repo/src/modules/template-installer/TemplateInstallerView.vue',
		'/repo/tests/modules/template-installer/template-installer-module.test.ts',
		'/repo/tests/modules/template-installer/TemplateInstallerView.po.ts',
	]);
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: `renderViewPoFile` fails (not defined), file plan fails (4 !== 5).

- [ ] **Step 3: Implement `renderViewPoFile` in `scripts/scaffold-module.mjs`**

Add this function after `renderTestFile`:

```js
/** @param {string} name @returns {string} */
export function renderViewPoFile(name) {
	const pascal = toPascalCase(name);
	return `import type { VueWrapper } from '@vue/test-utils'

const TID = {
\troot: '${name}-view',
} as const

export class ${pascal}ViewPageObject {
\tconstructor(private readonly wrapper: VueWrapper) {}

\tprivate byTid(tid: string) {
\t\treturn \`[data-testid="\${tid}"]\`
\t}

\tget root() {
\t\treturn this.wrapper.get(this.byTid(TID.root))
\t}
}
`;
}
```

- [ ] **Step 4: Update `plannedFiles` to include the 5th entry**

Add the `view-po` entry as the last element of the returned array:

```js
{
	role: 'view-po',
	path: path.join(repoRoot, 'tests', 'modules', name, `${toPascalCase(name)}View.po.ts`),
	contents: renderViewPoFile(name),
},
```

- [ ] **Step 5: Update `wiringInstructions`**

Replace the current `wiringInstructions` body with:

```js
export function wiringInstructions(name) {
	const camel = toCamelCase(name);
	const pascal = toPascalCase(name);
	return [
		'',
		'Next steps — wire the module into the registry:',
		'',
		'  1. Edit src/modules/index.ts:',
		`     import { ${camel}Module } from './${name}/${name}-module';`,
		`     export { ${camel}Module };`,
		`     // add ${camel}Module to ALL_MODULES`,
		'',
		'  2. Run the generated test:',
		`     npx vitest run tests/modules/${name}/${name}-module.test.ts`,
		'',
		`  3. If you add a view test, the co-located ${pascal}View.po.ts stub is ready.`,
		'     Elements must be queried by data-testid only — no CSS class or id selectors.',
		'',
		'  4. Document the module in docs/module-authoring.md if it adds new patterns.',
		'',
	].join('\n');
}
```

- [ ] **Step 6: Run tests**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit**

```
git add scripts/scaffold-module.mjs tests/scripts/scaffold-module.test.ts
git commit -m "feat(scaffold): generate ViewPageObject stub as 5th scaffold file"
```

---

## Task 6 — Fix `init` signature in `renderModuleFile`

**Files:**
- Modify: `tests/scripts/scaffold-module.test.ts`
- Modify: `scripts/scaffold-module.mjs`

- [ ] **Step 1: Add assertion to the existing `renderModuleFile` test**

In the `'scaffold-module — render output'` describe, the test `'module file references the events module and module factory'` already exists. Add one more expect inside it:

```ts
expect(out).toContain('init(ports, _settings)');
```

- [ ] **Step 2: Run to confirm the new assertion fails**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: the `renderModuleFile` test fails because the template still has `init(ports)`.

- [ ] **Step 3: Update `renderModuleFile` in `scripts/scaffold-module.mjs`**

Change the `init` line inside the template string from:

```js
\tinit(ports) {
```

to:

```js
\tinit(ports, _settings) {
```

- [ ] **Step 4: Run tests**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```
git add scripts/scaffold-module.mjs tests/scripts/scaffold-module.test.ts
git commit -m "fix(scaffold): generate init(ports, _settings) matching ModuleDescriptor interface"
```

---

## Task 7 — Update remaining scaffold write-behavior tests

**Files:**
- Modify: `tests/scripts/scaffold-module.test.ts`

The `'creates all four files on first run'` and `'returns no created files when every target already exists'` tests need to reflect the 5-file count.

- [ ] **Step 1: Update count assertions in the write-behavior tests**

Find and update these two tests in `'scaffold-module — write behavior'`:

```ts
// "creates all four files on first run" → update to:
it('creates all five files on first run', async () => {
	const root = await makeTempRoot();
	try {
		const result = await scaffoldModule({ repoRoot: root, name: 'demo-module' });
		expect(result.created).toHaveLength(5);
		expect(result.skipped).toHaveLength(0);
		const moduleFile = await readFile(
			path.join(root, 'src', 'modules', 'demo-module', 'demo-module-module.ts'),
			'utf8',
		);
		expect(moduleFile).toContain('demoModuleModule');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

// "returns no created files when every target already exists" → update skipped count:
it('returns no created files when every target already exists', async () => {
	const root = await makeTempRoot();
	try {
		await scaffoldModule({ repoRoot: root, name: 'demo-module' });
		const second = await scaffoldModule({ repoRoot: root, name: 'demo-module' });
		expect(second.created).toHaveLength(0);
		expect(second.skipped).toHaveLength(5);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
```

- [ ] **Step 2: Run all scaffold tests**

```
npx vitest run tests/scripts/scaffold-module.test.ts
```

Expected: all pass.

- [ ] **Step 3: Commit**

```
git add tests/scripts/scaffold-module.test.ts
git commit -m "test(scaffold): update write-behavior counts for 5-file scaffold"
```

---

## Task 8 — Pre-commit hook

**Files:**
- Create: `.githooks/pre-commit`

- [ ] **Step 1: Create `.githooks/pre-commit`**

```sh
#!/bin/sh
set -e
npm run lint --silent
```

- [ ] **Step 2: Make it executable**

```
git add .githooks/pre-commit
```

On Unix the file needs execute permission. On Windows, git tracks the executable bit. Set it:

```
git update-index --chmod=+x .githooks/pre-commit
```

- [ ] **Step 3: Verify hook runs on commit attempt**

Re-run `npm run hooks:install` (or it's already active if core.hooksPath was already set):

```
npm run hooks:install
```

Then run lint manually to confirm it passes before committing:

```
npm run lint
```

- [ ] **Step 4: Commit**

```
git commit -m "ci(hooks): add pre-commit lint gate to catch no-warning-comments violations early"
```

---

## Task 9 — `verify-scaffold.mjs` (TDD)

**Files:**
- Create: `tests/scripts/verify-scaffold.test.ts`
- Create: `scripts/verify-scaffold.mjs`

- [ ] **Step 1: Write failing tests — `tests/scripts/verify-scaffold.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyScaffold } from '../../scripts/verify-scaffold.mjs';

async function makeTempRoot(): Promise<string> {
	return await mkdtemp(path.join(tmpdir(), 'specorator-verify-'));
}

function toPascal(name: string): string {
	return name
		.split('-')
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');
}

async function makeCompleteModule(repoRoot: string, name: string): Promise<void> {
	const pascal = toPascal(name);
	await mkdir(path.join(repoRoot, 'src', 'modules', name), { recursive: true });
	await mkdir(path.join(repoRoot, 'tests', 'modules', name), { recursive: true });
	const files = [
		path.join(repoRoot, 'src', 'modules', name, `${name}-module.ts`),
		path.join(repoRoot, 'src', 'modules', name, `${name}-events.ts`),
		path.join(repoRoot, 'src', 'modules', name, `${pascal}View.vue`),
		path.join(repoRoot, 'tests', 'modules', name, `${name}-module.test.ts`),
		path.join(repoRoot, 'tests', 'modules', name, `${pascal}View.po.ts`),
	];
	for (const f of files) {
		await writeFile(f, '// stub', 'utf8');
	}
}

describe('verify-scaffold', () => {
	it('returns empty array when all required files are present', async () => {
		const root = await makeTempRoot();
		try {
			await makeCompleteModule(root, 'demo-widget');
			const missing = await verifyScaffold(root);
			expect(missing).toHaveLength(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports a missing view-po file', async () => {
		const root = await makeTempRoot();
		try {
			await makeCompleteModule(root, 'demo-widget');
			await rm(path.join(root, 'tests', 'modules', 'demo-widget', 'DemoWidgetView.po.ts'));
			const missing = await verifyScaffold(root);
			expect(missing.map((f) => f.replace(/\\/g, '/'))).toContain(
				'tests/modules/demo-widget/DemoWidgetView.po.ts',
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports all five missing files for an empty module directory', async () => {
		const root = await makeTempRoot();
		try {
			await mkdir(path.join(root, 'src', 'modules', 'bare-widget'), { recursive: true });
			const missing = await verifyScaffold(root);
			expect(missing).toHaveLength(5);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
```

- [ ] **Step 2: Run to confirm the tests fail**

```
npx vitest run tests/scripts/verify-scaffold.test.ts
```

Expected: fails with `Cannot find module '../../scripts/verify-scaffold.mjs'`.

- [ ] **Step 3: Implement `scripts/verify-scaffold.mjs`**

```js
#!/usr/bin/env node
// @ts-check
// W12 — verify every module directory under src/modules/ has the required scaffold files.
// Usage: npm run verify:scaffold
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from './_utils.mjs';

/**
 * @param {string} name
 * @returns {string}
 */
function toPascalCase(name) {
	return name
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join('');
}

/**
 * Returns a list of required scaffold file paths (relative to repoRoot) that are missing.
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export async function verifyScaffold(repoRoot) {
	const modulesDir = path.join(repoRoot, 'src', 'modules');
	const entries = await readdir(modulesDir, { withFileTypes: true });
	const moduleDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

	/** @type {string[]} */
	const missing = [];

	for (const name of moduleDirs) {
		const pascal = toPascalCase(name);
		const required = [
			path.join('src', 'modules', name, `${name}-module.ts`),
			path.join('src', 'modules', name, `${name}-events.ts`),
			path.join('src', 'modules', name, `${pascal}View.vue`),
			path.join('tests', 'modules', name, `${name}-module.test.ts`),
			path.join('tests', 'modules', name, `${pascal}View.po.ts`),
		];
		for (const rel of required) {
			if (!(await pathExists(path.join(repoRoot, rel)))) {
				missing.push(rel);
			}
		}
	}

	return missing;
}

async function main() {
	const here = path.dirname(fileURLToPath(import.meta.url));
	const repoRoot = path.resolve(here, '..');
	const missing = await verifyScaffold(repoRoot);
	if (missing.length === 0) {
		console.log('verify:scaffold — all module scaffold files present.');
		return;
	}
	console.error('verify:scaffold — missing required scaffold files:');
	for (const f of missing) {
		console.error(`  missing: ${f}`);
	}
	process.exit(1);
}

const entry = process.argv[1];
if (entry && path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) {
	await main();
}
```

- [ ] **Step 4: Run tests**

```
npx vitest run tests/scripts/verify-scaffold.test.ts
```

Expected: all three tests pass.

- [ ] **Step 5: Commit**

```
git add scripts/verify-scaffold.mjs tests/scripts/verify-scaffold.test.ts
git commit -m "feat(tooling): add verify:scaffold CI gate for module file completeness"
```

---

## Task 10 — Wire `verify:scaffold` into `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script and update the verify pipeline**

In `package.json`, add to `"scripts"`:

```json
"verify:scaffold": "node scripts/verify-scaffold.mjs",
```

Find the `"verify"` script. It currently contains:

```
... && npm run validate:manifest && npm run verify:workflows && ...
```

Change it to:

```
... && npm run validate:manifest && npm run verify:scaffold && npm run verify:workflows && ...
```

- [ ] **Step 2: Run `verify:scaffold` standalone**

```
npm run verify:scaffold
```

Expected: exits non-zero because `hello` module is missing `HelloView.po.ts`. Output:

```
verify:scaffold — missing required scaffold files:
  missing: tests/modules/hello/HelloView.po.ts
```

This is expected — Task 11 will fix it.

- [ ] **Step 3: Commit**

```
git add package.json
git commit -m "ci: add verify:scaffold to npm run verify pipeline"
```

---

## Task 11 — Add `HelloView.po.ts` for the hello module

**Files:**
- Create: `tests/modules/hello/HelloView.po.ts`

- [ ] **Step 1: Create `tests/modules/hello/HelloView.po.ts`**

```ts
import type { VueWrapper } from '@vue/test-utils'

const TID = {
	root: 'hello-view',
} as const

export class HelloViewPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string) {
		return `[data-testid="${tid}"]`
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root))
	}
}
```

- [ ] **Step 2: Run `verify:scaffold`**

```
npm run verify:scaffold
```

Expected: exits 0 with `verify:scaffold — all module scaffold files present.`

- [ ] **Step 3: Commit**

```
git add tests/modules/hello/HelloView.po.ts
git commit -m "test(hello): add HelloView.po.ts PageObject stub to satisfy verify:scaffold"
```

---

## Task 12 — Final verification gate

- [ ] **Step 1: Run the full verify suite**

```
npm run verify
```

Expected: exits 0. All steps — audit, typecheck, lint, coverage, build, build:web, docs:api, validate:manifest, verify:scaffold, verify:workflows, git diff check — pass.

- [ ] **Step 2: If coverage fails**

The new `tests/scripts/verify-scaffold.test.ts` tests live under `tests/scripts/`, which is not in the Vitest coverage `include` list (`src/domain/**`, `src/application/**`, `src/infrastructure/**`, `src/modules/**`, `src/core/**`). Scripts are Node utilities, not application code — they are correctly excluded. No action needed.

- [ ] **Step 3: Run the scripts tests one final time to confirm the full suite**

```
npx vitest run tests/scripts/
```

Expected: all scaffold, deploy, and verify-scaffold tests pass.

- [ ] **Done** — push the branch.
