# Verification Gate Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden local pre-push/pre-PR verification so contributors catch CI and release-surface failures before pushing, with no Windows-hostile shell constructs.

**Architecture:** Six files change: two new Node.js scripts (`scripts/verify-workflows.js`, `scripts/build-pages.js`), one new git hook (`.githooks/pre-push`), plus updates to `package.json`, `ci.yml`, and `docs/local-development.md`. No new runtime dependencies.

**Tech Stack:** Node 22 LTS (ESM, built-in `node:fs`/`node:path`/`node:child_process`), npm scripts, GitHub Actions, Git hooks (POSIX sh).

---

## Chunk 1: Node scripts and package.json

### Task 1: Create `scripts/verify-workflows.js`

**Files:**
- Create: `scripts/verify-workflows.js`

This script reimplements the inline bash/awk SHA-pin check from `ci.yml` as portable Node.js. It reads all `.github/workflows/*.yml|.yaml` files, finds every `uses:` line, strips comments and quotes, skips local (`./`), Docker (`docker://`), and internal reusable workflow (`.github/workflows/`) refs, then fails with exit 1 if any remaining ref does not end with `@<40-char-SHA>`.

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = '.github/workflows'
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

if (files.length === 0) {
  console.log('No workflow files found under .github/workflows.')
  process.exit(0)
}

const SHA_RE = /^.+@[0-9a-f]{40}$/
const violations = []

for (const file of files) {
  const path = join(dir, file)
  const lines = readFileSync(path, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^\s*-?\s*uses:\s*(.+)$/)
    if (!match) continue
    let ref = match[1].trim()
    ref = ref.replace(/#.*$/, '').trim()
    ref = ref.replace(/^["']|["']$/g, '').trim()
    if (
      ref.startsWith('./') ||
      ref.startsWith('docker://') ||
      ref.startsWith('.github/workflows/')
    )
      continue
    if (!SHA_RE.test(ref)) {
      violations.push(`${path}:${i + 1}: ${line.trimEnd()}`)
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Unpinned actions found — every 'uses:' must reference a 40-character commit SHA (see docs/security/supply-chain.md).",
  )
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log(
  `All third-party actions are SHA-pinned. (${files.length} workflow file${files.length === 1 ? '' : 's'} checked)`,
)
```

- [ ] **Step 2: Run the script to verify it passes on the existing workflows**

```sh
node scripts/verify-workflows.js
```

Expected output (exactly):
```
All third-party actions are SHA-pinned. (6 workflow files checked)
```

If it reports violations, the existing workflow files have unpinned actions — fix those before continuing.

- [ ] **Step 3: Commit**

```sh
git add scripts/verify-workflows.js
git commit -m "feat(tooling): add verify-workflows Node script (SHA-pin check)"
```

---

### Task 2: Create `scripts/build-pages.js`

**Files:**
- Create: `scripts/build-pages.js`

Cross-platform equivalent of the Unix shell commands in `docs/local-development.md` and the CI `pages.yml` assembly block. Sets `VITE_BASE_URL`, runs `npm run build:web` as a child process, then assembles `_site/` using Node's `cpSync`.

`cpSync` requires Node 16.7+. This project requires Node 22 LTS — safe to use.

- [ ] **Step 1: Create the script**

```js
#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { mkdirSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const siteIndex = join('site', 'index.html')
if (!existsSync(siteIndex)) {
  console.error(`Missing ${siteIndex}. Run from the project root.`)
  process.exit(1)
}

execSync('npm run build:web', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_URL: '/specorator/app/' },
})

mkdirSync(join('_site', 'app'), { recursive: true })
cpSync(siteIndex, join('_site', 'index.html'))
cpSync('dist-standalone', join('_site', 'app'), { recursive: true })

console.log('Pages site assembled at _site/. Open _site/index.html in a browser to preview.')
```

- [ ] **Step 2: Run the script to verify it works**

```sh
node scripts/build-pages.js
```

Expected: Vite build output ending in `dist-standalone/`, then "Pages site assembled at _site/." Check that `_site/index.html` and `_site/app/index.html` both exist.

- [ ] **Step 3: Add `_site/` to `.gitignore`**

`build-pages.js` writes to `_site/` at the project root. Add it to `.gitignore` to prevent accidental staging. After the "Standalone UI build" block add:

```
# Local Pages preview build
_site/
```

- [ ] **Step 4: Commit**

```sh
git add scripts/build-pages.js .gitignore
git commit -m "feat(tooling): add build-pages Node script (cross-platform Pages build)"
```

---

### Task 3: Update `package.json` scripts

**Files:**
- Modify: `package.json`

Add three new scripts and extend `verify` with manifest validation, workflow check, and whitespace check.

- [ ] **Step 1: Add `verify:workflows`, `build:pages`, `hooks:install` to `package.json`**

In the `"scripts"` block, add after `"validate:manifest"`:

```json
"verify:workflows": "node scripts/verify-workflows.js",
"build:pages": "node scripts/build-pages.js",
"hooks:install": "git config core.hooksPath .githooks",
```

- [ ] **Step 2: Extend the `verify` script**

Replace the existing `"verify"` value:

Old:
```json
"verify": "npm audit --audit-level=high --omit=dev && npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api",
```

New:
```json
"verify": "npm audit --audit-level=high --omit=dev && npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api && npm run validate:manifest && npm run verify:workflows && git diff --check --ignore-cr-at-eol",
```

- [ ] **Step 3: Smoke-test the three new scripts**

```sh
npm run verify:workflows
npm run hooks:install
```

Expected: both exit 0. (`build:pages` was already validated in Task 2.)

- [ ] **Step 4: Commit**

```sh
git add package.json
git commit -m "feat(tooling): add verify:workflows, build:pages, hooks:install npm scripts; extend verify gate"
```

---

## Chunk 2: Git hook, CI updates, docs

### Task 4: Create `.githooks/pre-push`

**Files:**
- Create: `.githooks/pre-push`

The hook runs typecheck + lint + manifest validation — fast enough not to block pushes. Must be committed with the executable bit set so contributors on Linux/macOS can use it without extra setup.

- [ ] **Step 1: Create `.githooks/` directory and the hook file**

Create `.githooks/pre-push` with this content:

```sh
#!/bin/sh
set -e
npm run typecheck && npm run lint && npm run validate:manifest
```

- [ ] **Step 2: Set the executable bit (required for Linux/macOS contributors)**

```sh
git add .githooks/pre-push
git update-index --chmod=+x .githooks/pre-push
```

- [ ] **Step 3: Verify the hook runs correctly**

```sh
sh .githooks/pre-push
```

Expected: typecheck, lint, and manifest validation all pass with exit 0.

- [ ] **Step 4: Commit**

```sh
git commit -m "feat(tooling): add .githooks/pre-push (typecheck + lint + validate:manifest)"
```

---

### Task 5: Update `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

Two changes:
1. `workflow-lint` job — add `setup-node` step, replace inline bash SHA-pin block with `node scripts/verify-workflows.js`.
2. `pages` — wait, `pages.yml` is a separate file. Update `pages.yml` to call `npm run build:pages` instead of duplicating the assembly logic.

**File:** `.github/workflows/ci.yml` — `workflow-lint` job only.
**File:** `.github/workflows/pages.yml` — `build` job.

- [ ] **Step 1: Update `workflow-lint` job in `ci.yml`**

After the "Install actionlint" step and "Run actionlint" step, replace the entire "Verify third-party actions are SHA-pinned" step with two new steps:

```yaml
      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: lts/*
      - name: Verify third-party actions are SHA-pinned
        run: node scripts/verify-workflows.js
```

The old "Verify third-party actions are SHA-pinned" step with the `shell: bash` block and the inline `awk` script is deleted entirely.

Full updated `workflow-lint` job:

```yaml
  workflow-lint:
    name: Lint workflow files (actionlint)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
      - name: Install actionlint
        run: |
          bash <(curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/v1.7.12/scripts/download-actionlint.bash) 1.7.12
      - name: Run actionlint
        run: ./actionlint -color
      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
        with:
          node-version: lts/*
      - name: Verify third-party actions are SHA-pinned
        run: node scripts/verify-workflows.js
```

- [ ] **Step 2: Update `pages.yml` build job**

Replace the two separate steps:

```yaml
      - name: Build standalone SPA
        run: npm run build:web
        env:
          VITE_BASE_URL: /specorator/app/

      - name: Assemble Pages site
        run: |
          mkdir -p _site/app
          cp site/index.html _site/index.html
          cp -r dist-standalone/. _site/app/
```

With a single step:

```yaml
      - name: Build and assemble Pages site
        run: npm run build:pages
```

- [ ] **Step 3: Validate both workflow files with the script**

```sh
node scripts/verify-workflows.js
```

Expected: still passes (we didn't add any new unpinned actions).

- [ ] **Step 4: Commit**

```sh
git add .github/workflows/ci.yml .github/workflows/pages.yml
git commit -m "feat(tooling): use verify-workflows.js and build-pages.js from CI"
```

---

### Task 6: Fix `docs/local-development.md`

**Files:**
- Modify: `docs/local-development.md`

Six targeted fixes:
1. Verification command in "Development commands" section — replace long piped command with `npm run verify`.
2. Verification command in "Verifying plugin behavior" section — same replacement.
3. Pages trigger branch — `main` → `demo`.
4. Local Pages build — replace Unix shell commands with `npm run build:pages`.
5. Add a note about `hooks:install` and Husky.
6. Fix `CLAUDE.md` "Pre-PR verification gate" — same long command drift as in `local-development.md`.

- [ ] **Step 1: Fix verification command in "Development commands" section (around line 57)**

Replace:
```
Run the full verification gate before opening a pull request:

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api
```
```

With:
```
Run the full verification gate before opening a pull request:

```sh
npm run verify
```
```

- [ ] **Step 2: Fix verification command in "Verifying plugin behavior" section (around line 133)**

Replace:
```
1. Run the full verification gate: `npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api`
```

With:
```
1. Run the full verification gate: `npm run verify`
```

- [ ] **Step 3: Fix Pages trigger branch (around line 162)**

Replace:
```
The `.github/workflows/pages.yml` workflow runs on every push to `main`:
```

With:
```
The `.github/workflows/pages.yml` workflow runs on every push to `demo`:
```

- [ ] **Step 4: Replace Unix-only local Pages build with `npm run build:pages` (around line 176)**

Replace the entire "Building the Pages site locally" code block:

```sh
VITE_BASE_URL=/specorator/app/ npm run build:web
mkdir -p _site/app
cp site/index.html _site/index.html
cp -r dist-standalone/. _site/app/
# Open _site/index.html in a browser to preview
```

With:

```sh
npm run build:pages
# Open _site/index.html in a browser to preview
```

- [ ] **Step 5: Add pre-push hook setup section and Husky note**

After the "Development commands" table (before "Build output"), add:

```markdown
## Git hooks

Install the pre-push hook with:

```sh
npm run hooks:install
```

The hook runs `typecheck`, `lint`, and `validate:manifest` before each push. It is intentionally fast — use `npm run verify` for the full gate.

**Husky:** Native Git hooks (`core.hooksPath`) are sufficient for this project. Husky would add cross-platform convenience (auto-install on `npm ci`) but introduces a dev dependency. It remains a follow-up candidate if onboarding friction becomes a problem.
```

- [ ] **Step 6: Fix `CLAUDE.md` "Pre-PR verification gate" section**

In `CLAUDE.md`, find:

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api
```

Replace with:

```sh
npm run verify
```

- [ ] **Step 7: Commit**

```sh
git add docs/local-development.md CLAUDE.md
git commit -m "docs: fix local-development drift (verify command, Pages branch, build:pages)"
```

---

## Final verification

- [ ] **Run the full verify gate**

```sh
npm run verify
```

Expected: all steps pass, final output includes "All third-party actions are SHA-pinned."

- [ ] **Check for any remaining drift**

Search the repo for the old long verify command in case it appears in other docs:

```sh
grep -r "npm run typecheck && npm run lint && npm run test" docs/
```

Expected: no matches.
