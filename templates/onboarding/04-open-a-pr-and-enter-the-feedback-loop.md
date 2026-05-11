## Goal

Push a real branch, open a draft PR, request a Codex review, respond to the feedback, and re-request review. This is the inner loop you will repeat on every piece of work.

## What you will learn

- The branch naming convention.
- How to open a draft PR with a proper description.
- How to request a Codex review and respond to findings.
- The re-request cycle.

## Steps

1. **Create a topic branch** from your integration branch. Detect it (defaults to `develop` if `origin/HEAD` is not set):
   ```bash
   INTEGRATION=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
   INTEGRATION=${INTEGRATION:-develop}
   git switch "$INTEGRATION"
   git pull --ff-only
   git switch -c feature/<short-kebab>
   ```

   Branch prefix must be one of `feature`, `fix`, `docs`, `chore`, `refactor` (see `AGENTS.md` §4).

2. **Make a small, real change.** For example: fix a typo in a docs file, add a placeholder test, or update a template. The change does not need to be complete — it just needs to exist.

3. **Commit** using the imperative format:
   ```bash
   git add <file>
   git commit -m "feat(<scope>): <what it does>"
   ```

4. **Push and open a draft PR**:
   ```bash
   git push -u origin feature/<short-kebab>
   gh pr create --draft --title "feat(<scope>): <what it does>" --body "Closes #<issue-number>"
   ```

5. **Request a Codex review** by commenting `@codex review` on the PR or using the GitHub UI to request a review from Codex.

6. **Read the feedback.** For each finding:
   - If valid: make the change, commit, push.
   - If not valid: reply with your reasoning and mark the comment as resolved.

7. **Re-request review** after addressing all open findings.

## Acceptance criteria

- [ ] Branch follows the `feat/<scope>/<description>` naming convention.
- [ ] Draft PR exists and references the parent issue.
- [ ] At least one Codex review was requested.
- [ ] At least one review finding was addressed (either with a code change or a reasoned reply).
- [ ] Review was re-requested after addressing findings.

## Next step

Move to [Issue 5 — Accept and merge the PR]() to close the loop.
