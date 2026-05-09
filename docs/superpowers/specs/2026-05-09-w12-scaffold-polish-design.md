# W12 Scaffold & Deploy Tooling — Polish Pass Design

**Date:** 2026-05-09  
**Branch:** feat/w12-dev-ergonomics-110  
**Closes:** polishing pass on PR #180

---

## Problem

PR #180 introduced scaffold/deploy tooling for AI-augmented development. Code review identified seven correctness and maintainability issues, plus an opportunity to close the AI agent feedback loop earlier (pre-commit, CI gate) so regressions surface during development rather than at review time.

---

## Scope

### 1. Code Fixes

#### 1a. `init` signature in `renderModuleFile`

**Current:** `init(ports) { ... }`  
**Fixed:** `init(ports, _settings) { ... }`

`ModuleDescriptor.init` is typed `(ports: ModulePorts, settings: S): void`. The scaffold is a teaching artifact — the generated body doesn't use settings, but the param must be present and discoverable. Underscore prefix signals "intentionally unused" to both TypeScript and human readers.

The existing `hello-module.ts` has the same one-param form. It is left as-is (it's a hand-authored module and the test already calls the correct two-param form). Only the scaffold template changes.

#### 1b. `.po.ts` PageObject scaffold (5th generated file)

New `renderViewPoFile(name)` function. Generates `tests/modules/<name>/${pascal}View.po.ts` with:
- `const TID = { root: '${name}-view' } as const`
- `${pascal}ViewPageObject` class wrapping `VueWrapper`
- `private byTid(tid)` helper
- `get root()` getter

Pattern matches `tests/ui/views/Home.po.ts` exactly. `plannedFiles` grows from 4 to 5 entries. Wiring instructions updated to mention the PO convention.

#### 1c. `-module` suffix guard

`scaffoldModule` checks `name.endsWith('-module')` before the regex and throws:

```
Module name must not end with '-module' (added automatically).
Use '<stripped-name>' instead: npm run scaffold:module -- <stripped-name>
```

`isValidModuleName` is not changed — it validates format, not semantics. The guard lives in `scaffoldModule` so the pure validator stays pure.

#### 1d. JSDoc + `// @ts-check` → delete `.d.mts` files

Both `.mjs` scripts get `// @ts-check` at the top. Each exported function gets `@param` and `@returns` JSDoc. The manually maintained `scripts/scaffold-module.d.mts` and `scripts/deploy-to-test-vault.d.mts` are deleted. Type information is co-located with the implementation; no sync burden.

#### 1e. `pathExists` extraction

New `scripts/_utils.mjs` with `// @ts-check`. Exports one function: `pathExists(p: string): Promise<boolean>`. Both scripts import from `'./_utils.mjs'` and delete their local copies.

#### 1f. Negative `readPluginId` tests

Three new cases in `tests/scripts/deploy-to-test-vault.test.ts` under a new `describe('deploy-to-test-vault — manifest error cases')` block:

- `id: ""` — throws on empty string
- `id: 42` — throws on non-string type
- Malformed JSON — throws with parse error message

#### 1g. Scaffold test updates

- Planned-files test: assert 5 files (add `view-po` role)
- New `renderViewPoFile` assertions: contains class name, `TID.root`, `data-testid` string
- New name rejection test: `'template-module'` → throws with corrected name suggestion
- Idempotent-second-run test: already passes for 5 files after change

#### 1h. `hello` module — add missing `HelloView.po.ts`

`tests/modules/hello/HelloView.po.ts` — the only file the hello module is missing to pass `verify:scaffold`. Written by hand matching the scaffold pattern (`TID.root = 'hello-view'`, `HelloViewPageObject`).

---

### 2. Pre-commit Hook

New `.githooks/pre-commit`:

```sh
#!/bin/sh
set -e
npm run lint --silent
```

- Lint runs in ~2s. Catches `no-warning-comments`, architecture violations, and all other ESLint errors before the commit lands in history.
- TypeScript check stays on pre-push (slow; 10-15s).
- `hooks:install` script unchanged — `git config core.hooksPath .githooks` picks up the new file automatically.

---

### 3. `verify:scaffold` Script + CI Gate

New `scripts/verify-scaffold.mjs` (`// @ts-check`):

**Algorithm:**
1. Read all immediate subdirectories of `src/modules/` that are not named `index.ts` or `module.ts` (those are files, not dirs — `readdir` with `withFileTypes` handles this naturally).
2. For each module dir named `<name>`:
   - Derive `pascal` via `toPascalCase` (imported from `_utils.mjs` — move helper there too, or duplicate — see note below).
   - Check existence of 5 files; collect any missing.
3. Exit 0 if no missing files; exit 1 with a summary table if any are missing.

**Note on `toPascalCase`:** Rather than importing from `scaffold-module.mjs` (coupling two independent scripts), duplicate the three-line helper in `verify-scaffold.mjs`. It is trivial and stable.

**package.json:**
```json
"verify:scaffold": "node scripts/verify-scaffold.mjs"
```

Added to `npm run verify` pipeline between `validate:manifest` and `verify:workflows`:
```
... && npm run validate:manifest && npm run verify:scaffold && npm run verify:workflows && ...
```

**Tests:** `tests/scripts/verify-scaffold.test.ts` — three cases using `tmp` dirs:
- Complete module dir → exits clean
- Module dir missing `*View.po.ts` → reports missing file
- Module dir missing multiple files → reports all missing

---

## File Inventory

| Action | File |
|--------|------|
| Edit | `scripts/scaffold-module.mjs` |
| Delete | `scripts/scaffold-module.d.mts` |
| Edit | `scripts/deploy-to-test-vault.mjs` |
| Delete | `scripts/deploy-to-test-vault.d.mts` |
| Create | `scripts/_utils.mjs` |
| Create | `scripts/verify-scaffold.mjs` |
| Edit | `package.json` |
| Create | `.githooks/pre-commit` |
| Edit | `tests/scripts/scaffold-module.test.ts` |
| Edit | `tests/scripts/deploy-to-test-vault.test.ts` |
| Create | `tests/scripts/verify-scaffold.test.ts` |
| Create | `tests/modules/hello/HelloView.po.ts` |

---

## What Does Not Change

- `hello-module.ts` `init(ports)` body — hand-authored; test already calls correct two-param form
- `hello-module.test.ts` — already correct
- `HelloView.vue` — already has `data-testid="hello-view"`
- `isValidModuleName` regex — format validator stays pure; semantic guard added in caller
- Pre-push hook — unchanged
