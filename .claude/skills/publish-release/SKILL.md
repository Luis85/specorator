---
name: publish-release
description: Use when releasing a new Specorator plugin version. Walks through pre-flight checks, version bump, develop→main merge, tag push, release-workflow verification, and post-release sanity checks. Triggers - "publish a release", "cut a release", "ship a new version", "release 0.1.0", "release patch/minor/major", or `/publish-release`.
---

# Publish Release — Specorator Plugin

This skill walks through cutting and publishing a Specorator plugin release that satisfies BRAT and the Obsidian community plugin marketplace.

The release pipeline is documented in `docs/marketplace-readiness.md`. The release workflow lives at `.github/workflows/release.yml`. The branching model that gates this work is documented in `docs/contributing.md` §5 and `CLAUDE.md` "Branching model".

## When to use

Trigger when the user says any of:

- "publish a release", "cut a release", "ship a new version"
- "release X.Y.Z", "release patch", "release minor", "release major"
- `/publish-release` (slash command)
- Any sentence whose intent is to bundle the current `develop` HEAD into a tagged plugin release

Do **not** use this skill for: dependency bumps that ship without a release, README-only changes, hotfixes that need to bypass `develop` (those need their own conversation).

## Hard preconditions

Refuse to start if any of these are false. Verify with the listed command and report the result back to the user before proceeding.

| # | Precondition | Verification |
|---|---|---|
| 1 | Working tree is clean | `git status --porcelain` (must be empty) |
| 2 | On `develop` (or about to switch) | `git rev-parse --abbrev-ref HEAD` |
| 3 | `develop` is up to date with `origin/develop` | `git fetch origin && git status -uno` |
| 4 | CI is green on `develop` HEAD | `gh run list --branch develop --workflow=ci.yml --limit 1 --json conclusion --jq '.[0].conclusion'` must be `success` |
| 5 | No open PRs against `develop` are intended to ship in this release | `gh pr list --base develop --state open` — confirm with user that none are blockers |
| 6 | The user has decided the bump type | ask `patch` / `minor` / `major` if not provided |

If any precondition fails, stop and report what is missing — do not auto-fix.

## Architecture of the flow

The release is a **two-PR + tag** process. Tag is created **after** the bump commit lands on `main` HEAD, never before — this avoids the tag-SHA-vs-main-HEAD mismatch that the release workflow guards against.

```
develop                      main
   │
   │  [Step 2] bump on release branch
   │  [Step 3] PR → develop, merge (squash)
   │
   ├─────────────────────────►  [Step 4] PR develop → main, merge (--merge)
                                          │
                                          │  [Step 5] git tag <version> <main HEAD>
                                          │  [Step 5] git push origin <version>
                                          │
                                          ▼
                                  release.yml runs
                                  [Step 6] verify
```

## Step-by-step process

### Step 1 — Decide and announce the bump

Read the current version from `manifest.json`:

```sh
node -p "require('./manifest.json').version"
```

Compute the new version from the bump type. Confirm with the user before proceeding:

> Bumping from `<old>` to `<new>` (`<patch|minor|major>`). Proceed?

### Step 2 — Bump on a release branch (no tag yet)

From an up-to-date `develop`:

```sh
git checkout -b release/<new-version>
npm version <patch|minor|major> --no-git-tag-version
```

`--no-git-tag-version` skips both the auto-commit and the auto-tag, but still:

1. Bumps `package.json` → `version`.
2. Runs the `version` lifecycle script (`node version-bump.js && git add manifest.json versions.json`), which updates `manifest.json` and `versions.json` and stages them.

Now stage `package.json` and commit:

```sh
git add package.json
git commit -m "release: <new-version>"
```

**Verify before pushing:**

- `git show HEAD --stat` — should touch only `manifest.json`, `package.json`, `versions.json`.
- `cat manifest.json | grep version`, `cat package.json | grep '"version"'`, `cat versions.json` — all three must agree on the new version.
- `git tag -l <new-version>` — must be empty (no local tag yet).

If anything looks wrong: `git reset --hard HEAD~1` and stop. Tell the user what went wrong.

### Step 3 — Merge the bump into `develop`

Push and open the bump PR:

```sh
git push -u origin release/<new-version>
gh pr create --base develop --head release/<new-version> \
  --title "release: <new-version>" \
  --body "Mechanical version bump produced by \`npm version <bump> --no-git-tag-version\`. Bumps manifest.json, package.json, and versions.json to <new-version>. Merging this is the prerequisite for the develop → main release PR (next step)."
```

Wait for CI green, then squash-merge:

```sh
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
git checkout develop && git pull origin develop
```

Squash is fine here because no tag exists yet — only `main`-HEAD reachability matters for the tag, and we have not created one.

### Step 4 — Promote `develop` to `main`

The `main` ruleset requires the source branch to be `develop` (enforced by both the `Verify PR source is develop` job in `ci.yml` and the `main` branch ruleset).

```sh
gh pr create --base main --head develop \
  --title "release: <new-version>" \
  --body "Promote develop to main for the <new-version> release. After merge, the next step pushes the <new-version> tag to origin to trigger release.yml."
```

Wait for CI green (must include both `Install, typecheck, lint, test, and build` AND `Verify PR source is develop`):

```sh
gh pr checks <pr-number> --watch
```

Merge with `--merge` (creates a merge commit; main history grows by one merge commit per release):

```sh
gh pr merge <pr-number> --merge
git checkout main && git pull origin main
```

Verify the bump version is the latest on `main`:

```sh
node -p "require('./manifest.json').version"
# Must print <new-version>
```

### Step 5 — Tag `main` HEAD and push

The release workflow checks that the tag points at `main` HEAD exactly. Tag now, after the merge:

```sh
git tag <new-version>
git rev-parse <new-version> && git rev-parse origin/main
# Both must print the same SHA — re-tag if not
git push origin <new-version>
```

This triggers `release.yml`. Watch it:

```sh
RUN_ID=$(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

The workflow runs in this order:

1. Checkout (with `fetch-depth: 0`)
2. **Verify tag is on main HEAD** — must succeed; else go to Failure recovery.
3. Set up Node, install deps
4. Typecheck, Lint, Test
5. Build plugin
6. **Verify manifest, package, and versions.json all match tag** — refuses to publish on any mismatch.
7. Create GitHub release with three assets: `manifest.json`, `main.js`, `styles.css`. `prerelease: true` if the tag contains a `-` (e.g. `0.1.0-rc1`).

If any step fails: stop, report which step, do not retry blindly.

### Step 6 — Post-release verification

```sh
gh release view <new-version> --json tagName,name,assets,isPrerelease,publishedAt \
  --jq '{tagName, name, isPrerelease, publishedAt, assets: [.assets[] | {name, size}]}'
```

Required asset list:

- `manifest.json`
- `main.js`
- `styles.css`

If any asset is missing or zero bytes: the release is broken for BRAT and the marketplace. Investigate immediately.

Also verify the release page at `https://github.com/Luis85/specorator/releases/tag/<new-version>`.

### Step 7 — Announce

Post a short note to the user:

- Released version `<new-version>`
- BRAT users: auto-update on next BRAT poll (no action needed)
- Manual install: download `manifest.json`, `main.js`, `styles.css` from the release page into `<vault>/.obsidian/plugins/specorator/`
- If marketplace submission is in scope, link to `docs/marketplace-readiness.md` for the submission checklist

## Failure recovery

| Symptom | Recovery |
|---|---|
| `npm version` failed mid-way | `git reset --hard HEAD` if any partial files are staged. Re-run after fixing the cause. |
| Develop bump PR (Step 3) CI red | Do not merge. Fix on the release branch and push. |
| Main PR (Step 4) `Verify PR source is develop` fails | The PR base or head is wrong. Open a new PR with `--base main --head develop`. |
| `release.yml` fails at "tag is on main HEAD" | Run `git rev-parse <version>` and `git rev-parse origin/main` — they must match. Delete and re-create the tag at correct SHA: `git push origin --delete <version> && git tag -d <version> && git tag <version> origin/main && git push origin <version>`. |
| `release.yml` fails at "manifest/package/versions.json all match tag" | One of the three was not updated. Delete the tag (`git push origin --delete <version> && git tag -d <version>`), fix the missing file on develop via a new release branch, repeat from Step 2 (or amend if no commits have shipped to main yet). |
| Release was created but with wrong assets | `gh release delete <version> --yes` (keeps the tag), then re-trigger by deleting+re-pushing the tag. |
| Need to abandon the release entirely | `git push origin --delete <version>`, `git tag -d <version>`, `gh release delete <version> --yes` if it was created. Open revert PRs for the bump commit on `main` and `develop` if the version number must not be reused. |

## Dry-run option (no real release)

If the user wants to verify the pipeline without creating a release:

```sh
git tag 0.0.0-test
git push origin 0.0.0-test
```

This triggers `release.yml`. The "tag on main HEAD" check fails (tag is on develop), all downstream steps skip, no release is created. Cleanup:

```sh
git push origin --delete 0.0.0-test
git tag -d 0.0.0-test
```

Use this dry-run after any change to `release.yml` or the version automation files.

## Reference checklist (mirror of `docs/marketplace-readiness.md` Pre-release)

Before tagging, the user has typically already done these. Confirm during Step 1:

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm run test` clean
- [ ] `npm run build` produces `main.js` + `styles.css`
- [ ] `npm audit` no high/critical
- [ ] README + docs reflect the shipped feature set
- [ ] Manual tests in `docs/marketplace-readiness.md` §"Manual test expectations" pass on `minAppVersion` and the latest Obsidian release

For marketplace submission (separate from release): see blocker list in `docs/marketplace-readiness.md` §"Known marketplace blockers".
