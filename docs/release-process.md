---
title: Specorator release process
doc_type: runbook
status: active
owner: engineering
last_updated: 2026-05-03
references:
  - docs/marketplace-readiness.md
  - docs/contributing.md
  - .github/workflows/release.yml
  - .github/workflows/ci.yml
  - manifest.json
  - versions.json
  - scripts/validate-manifest.js
---

# Release process

This is the canonical end-to-end runbook for cutting a Specorator release. It complements [`docs/marketplace-readiness.md`](./marketplace-readiness.md) (the pre-submission checklist) and [`docs/contributing.md`](./contributing.md) §5 (the branching model). When in doubt, this document wins.

> Marketplace submission to the Obsidian community plugins registry is a **separate** step, gated on the criteria in `marketplace-readiness.md`. This runbook covers the path from `develop` to a published GitHub release.

---

## 1. Versioning policy

### Semver discipline

| Bump | When |
|---|---|
| `patch` (`X.Y.Z+1`) | Bug fix, doc-only change, CI-only change, dependency patch with no behavioural impact. |
| `minor` (`X.Y+1.0`) | New user-visible feature, additive API surface, new setting, new bridge port. No removed/renamed surface. |
| `major` (`X+1.0.0`) | Removed setting, renamed setting key, breaking workflow-state schema change, raised `minAppVersion`. |

A `pre-1.0` major bump is rare and reserved for the first public alpha. Until 1.0, the minor digit carries breaking changes provided they are clearly noted in the release notes.

### `minAppVersion` policy

`minAppVersion` is bumped **only** when the plugin uses an Obsidian API or behaviour that is not present in older Obsidian versions. Bumping `minAppVersion` is itself a breaking change for end users on older Obsidian builds and triggers a `major` plugin-version bump.

The current `minAppVersion` lives in `manifest.json`. The active mapping of `plugin-version → minAppVersion` lives in `versions.json` and is consulted by Obsidian when deciding which plugin version to install for a user's Obsidian version.

### `versions.json` contract

`versions.json` maps every released plugin version to the minimum Obsidian version it requires:

```json
{
  "0.0.1": "1.4.0",
  "0.1.0": "1.4.0",
  "1.0.0": "1.5.0"
}
```

Rules enforced by `scripts/validate-manifest.js` (run in CI):

- Every key is a valid semver string.
- Every value is a valid semver string (the `minAppVersion` for that plugin version).
- The current `manifest.json` → `version` exists as a key.
- `versions.json[<current version>]` equals `manifest.json` → `minAppVersion`.

Never hand-edit `versions.json` to retroactively change a published plugin version's `minAppVersion`. Old entries are immutable; only new entries are appended.

---

## 2. Pre-release checks

Before opening the release PR:

1. Run the marketplace-readiness checklist in [`docs/marketplace-readiness.md`](./marketplace-readiness.md). Manual items (Obsidian smoke test, README/CHANGELOG content) are still required.
2. Run the local pre-PR gate (see [`AGENTS.md`](../AGENTS.md) §3 / [`.codex/pre-pr-gate.md`](../.codex/pre-pr-gate.md)).
3. Confirm `develop` is in a releasable state: every PR you intend to ship is merged, no in-flight branches that must land in this release.

---

## 3. Bump versions

From a clean checkout on `develop`:

```sh
git checkout develop
git pull --ff-only origin develop

npm version <patch|minor|major>
```

`npm version <bump>` runs the project's `version` lifecycle hook, which:

1. Bumps `package.json` → `version`.
2. Runs `version-bump.js`, which updates `manifest.json` → `version` and appends an entry to `versions.json` mapping the new version to the current `minAppVersion`.
3. Runs `scripts/validate-manifest.js` to assert all three files are consistent.
4. Stages `manifest.json` + `versions.json` and creates a commit named `vX.Y.Z` *(npm default)*. The tag uses plain semver per `.npmrc` `tag-version-prefix=""`, so the tag is `X.Y.Z` (no `v`).

**Do not push the tag yet.** The tag must point at `main` HEAD, not `develop` HEAD.

---

## 4. Promote `develop` → `main`

```sh
git push origin develop
gh pr create --base main --head develop \
  --title "release: X.Y.Z" \
  --body "Release notes draft. Closes #<release-tracking-issue> if any."
```

CI runs the standard verify + workflow-lint + dependency-review + manifest-validation jobs. The PR is also gated by the `Verify PR source is develop` check (rejects PRs to `main` from any branch other than `develop`).

After CI is green and the PR is reviewed:

```sh
gh pr merge <pr-number> --merge          # NOT --squash. Use a merge commit.
```

> Use a merge commit (not squash) for `develop → main` PRs. The release tag must point at the merge commit on `main`, and squash-merging would replace it with a fresh commit whose history does not show the released `develop` work.

After merge:

```sh
git fetch origin main
git checkout main
git pull --ff-only origin main
```

---

## 5. Push the release tag

The version-bump commit produced a local tag (`X.Y.Z`) that currently points at the *develop* commit. Re-tag the merge commit on `main`:

```sh
git tag -d X.Y.Z                  # remove the develop-pointing tag
git tag X.Y.Z                     # re-create on the current main HEAD
git push origin X.Y.Z
```

`.github/workflows/release.yml` triggers on the tag push and:

1. Verifies the tag points at `main` HEAD (refuses to publish otherwise).
2. Re-installs dependencies, typechecks, lints, tests, and builds.
3. Re-checks `manifest.json`, `package.json`, and `versions.json` against the tag (defence in depth — `manifest-validation` already ran on the develop→main PR).
4. Creates the GitHub release with `main.js`, `manifest.json`, and `styles.css` attached. Auto-generated release notes are produced from PR titles since the previous tag.
5. Marks the release as a prerelease iff the tag contains a `-` (e.g. `0.1.0-rc1`).

Watch the workflow run in GitHub Actions until it completes. If it fails, see "Failure recovery" below.

---

## 6. Post-release verification

After the release workflow finishes:

- [ ] The GitHub release page lists `main.js`, `manifest.json`, and `styles.css` as assets.
- [ ] Each asset is non-empty.
- [ ] The release page's body contains the auto-generated changelog.
- [ ] The "latest release" badge on the README points to the new tag (badges update within ~5 min).
- [ ] If this is a planned marketplace submission, proceed with `docs/marketplace-readiness.md` §"Pre-release checklist" → submission PR to `obsidianmd/obsidian-releases`.

---

## 7. Failure recovery

| Failure | Recovery |
|---|---|
| Pre-PR gate fails locally | Fix the underlying issue and re-run. Do not push a known-broken release PR. |
| `manifest-validation` fails on the develop→main PR | The bump produced an invalid state. Inspect the validator output, fix `manifest.json` / `versions.json` / `package.json`, force-push the develop branch *only if no one else has pulled it*; otherwise revert the bump commit on develop and start over. |
| Release workflow fails on `Verify tag is on main HEAD` | The tag does not point at `main` HEAD. Delete the remote tag (`git push origin :X.Y.Z`), re-tag locally on `main` HEAD, push. |
| Release workflow fails on `Verify manifest, package, and versions.json all match tag` | The bump created a mismatch that slipped past the develop→main PR. Most likely cause: a follow-up commit on `develop` between bump and merge altered one of the three files. Open a fix PR to reconcile, merge, then delete and re-create the tag on the new `main` HEAD. |
| GitHub release was created but a wrong file is attached | Edit the release on GitHub and re-upload the missing asset. Do *not* delete and re-create the release — direct download links break. |
| The release was published but should not have been | Treat as immutable. Open a `release: X.Y.Z+1` follow-up that reverts or supersedes the bad change rather than retracting the published artifact. |

Never delete a published tag from `origin`. Even if the release is broken, the tag is part of the audit trail and may be cached by Obsidian or BRAT.

---

## 8. Automation summary

| Step | Automated by |
|---|---|
| Version bump in three files | `npm version <bump>` → `version-bump.js` |
| Manifest / versions.json schema check | `scripts/validate-manifest.js`, run in CI (`manifest-validation` job) and via the `version` lifecycle hook |
| Tag points at `main` HEAD | `release.yml` |
| Tag matches manifest + package + versions.json | `release.yml` |
| GitHub release creation with correct assets | `release.yml` (`softprops/action-gh-release`) |
| Prerelease flagging for tags containing `-` | `release.yml` |
| Marketplace submission | **Manual** — see `marketplace-readiness.md` |

If you find a release activity that is still manual but should not be, file an issue tagged `release` so it can be added to the automation list.
