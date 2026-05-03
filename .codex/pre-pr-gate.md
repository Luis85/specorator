# Recipe: Pre-PR verification gate

Run this before pushing a branch you intend to open or update a PR with. CI re-runs the same checks; failing locally first shortens the loop.

## Preconditions

- You are on the feature branch (`git status` shows the branch you expect).
- `npm ci` has been run in this checkout at least once since the last `package-lock.json` change.
- You have not bypassed any prior gate with `--no-verify` or similar.

## Steps

### 1. Run the standard verification chain

```sh
npm audit --audit-level=high --omit=dev \
  && npm run typecheck \
  && npm run lint \
  && npm run test \
  && npm run build \
  && npm run build:web \
  && npm run docs:api
```

All seven steps must succeed in order. `npm audit` runs first because the `verify` job in `.github/workflows/ci.yml` runs it unconditionally on every CI run; matching that locally avoids a slow round-trip if a `high`/`critical` advisory was published since the last install. If any step fails, fix the underlying issue and re-run from the start — do not skip steps that previously passed; later changes may regress them.

### 2. Run the conditional gates

| Condition | Additional gate |
|---|---|
| You changed any file under `.github/workflows/` | Run `actionlint` against the changed file(s) and confirm every `uses:` reference is pinned to a 40-character commit SHA. |
| You changed Vue or browser-side code under `src/ui/` | `npm run dev` and exercise the affected feature in a browser. Type-checks alone do not validate runtime behaviour. |
| You changed plugin-side code under `src/plugin/` or `src/infrastructure/obsidian/` | Build with `npm run build` and load the resulting `main.js` in an Obsidian test vault if the change is non-trivial. |

### 3. Confirm the working tree is clean

```sh
git status --short
git diff --check
```

`git diff --check` rejects whitespace errors that ESLint and Prettier may not catch (e.g. trailing whitespace inside code fences in markdown).

### 4. Confirm the branch is rooted in `develop`

```sh
git fetch origin develop
git log --oneline origin/develop ^HEAD | head -5
```

If commits from `origin/develop` are missing from your branch, merge or rebase before pushing — the repository's required-status-checks rule blocks merge of branches that are behind `develop`.

## Failure handling

- **A check fails consistently in one environment but passes in another.** Treat the failing environment as authoritative — that is what CI will see. Do not "fix" by suppressing in the failing environment.
- **A check fails for a reason that looks unrelated to your change** (e.g. a TypeDoc warning surfaced by a dependency update). Fix it in the same PR if it's small. If the fix is large enough to deserve its own PR, stop here, open a separate PR for the prerequisite fix, get it merged, then come back to your work. Never bypass the gate or push a PR with a known-failing pre-PR check — `AGENTS.md` §3 forbids it without exception.
- **You believe the gate itself is wrong.** Same approach as above: file an issue, propose the fix in a separate PR, and merge that PR before merging the work that needs the change.

## Output

When all gates pass you should see exit-zero from every command and a clean `git status`. Only then proceed to [`open-pr.md`](./open-pr.md) (for a new PR) or push the update (for an existing PR).
