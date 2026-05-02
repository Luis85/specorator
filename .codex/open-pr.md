# Recipe: Open a pull request

Use after [`pre-pr-gate.md`](./pre-pr-gate.md) has passed and the branch is rooted in `origin/develop`.

## Preconditions

- All pre-PR gates pass.
- The working tree is clean (`git status --short` empty).
- The branch follows the `<type>/<short-kebab>` naming convention (`feature/...`, `fix/...`, `chore/...`, `docs/...`, `refactor/...`).
- An issue exists that this PR will close, or the change is trivial enough that a standalone PR is acceptable per [`docs/contributing.md`](../docs/contributing.md).

## Steps

### 1. Push the branch

```sh
git push -u origin <branch-name>
```

If the branch already tracks `origin`, `git push` alone is sufficient.

### 2. Open the PR with `gh`

```sh
gh pr create \
  --base develop \
  --head <branch-name> \
  --title "<type>(<scope>): <imperative summary>" \
  --body "$(cat <<'EOF'
## Summary

<one short paragraph: what changed, why>

Closes #<issue-number>

## Verification

<bulleted list of what you ran locally — typecheck, lint, test, build, build:web, docs:api, plus any conditional gates>

## Test plan

- [ ] CI passes
- [ ] <feature-specific manual check, if applicable>
EOF
)"
```

`$(...)` and here-documents are POSIX; the previous draft used `<(...)` process substitution, which is a bash-only feature and would fail under `dash` or another strict POSIX shell.

Title rules:

- Imperative present tense (`add`, not `added` / `adds`).
- ≤72 characters total.
- Optional `<type>(<scope>):` prefix matching the branch type (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`).

Body rules:

- Always include `Closes #<n>` if an issue exists. GitHub auto-closes the issue when the PR merges.
- The verification section lists the *commands you actually ran*, not the commands you intended to run. If you skipped a step, say so and why.
- The test plan is checked off by reviewers as they validate the PR; leave it actionable.

### 3. Wait for CI

CI status:

```sh
gh pr view <n> --json statusCheckRollup,mergeStateStatus
```

The repository ruleset on `develop` enforces exactly one required status check by name:

- `Install, typecheck, lint, test, and build` — the `verify` job in `.github/workflows/ci.yml`

Several other checks must also pass for the merge UI to allow a squash. They are not enforced by the ruleset, so a failure is reported as `UNSTABLE` rather than `BLOCKED`, but the PR should not be merged while any of them is failing:

- `Lint workflow files (actionlint)` — runs `actionlint` and the SHA-pin enforcement step
- `Review pull-request dependency changes` — `actions/dependency-review-action`
- `GitGuardian Security Checks`

If any of these fails, fetch the failing log:

```sh
gh run view --log-failed --job=<job-id>
```

Fix the underlying issue; do not retry without changes.

### 4. Wait for review

Automated review (Codex) typically posts within 3–5 minutes of the latest push. Check both endpoints:

```sh
gh pr view <n> --json reviews
gh api repos/<owner>/<repo>/pulls/<n>/comments
```

Inline comments live on the second endpoint and are easy to miss if you only query the first. Address every inline comment before merging — see [`address-review.md`](./address-review.md).

### 5. Merge

After all required checks are SUCCESS, all inline comments are addressed, and the maintainer (human or auto-merge policy) has signaled approval:

```sh
gh pr merge <n> --squash --delete-branch
```

`--delete-branch` removes the remote branch after merge. Local cleanup is described in [`branch-hygiene.md`](./branch-hygiene.md).

## Failure handling

- **`gh pr create` reports an existing PR.** A previous attempt opened one. Update the existing PR (`gh pr view`) instead of opening a duplicate.
- **CI reports `BLOCKED`.** Inspect `mergeStateStatus`. Common causes: a required check is missing or queued, the branch is `BEHIND` `develop`, or branch protection requires conversation resolution. Address each cause specifically; do not retry blindly.
- **Auto-merge fails to delete the branch** because a worktree still references it. Run [`branch-hygiene.md`](./branch-hygiene.md) and retry the delete.
