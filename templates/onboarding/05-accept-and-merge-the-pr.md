## Goal

Complete the inner loop: confirm CI is green, approve the PR, merge using the correct strategy, close the parent issue, and verify that the traceability chain is intact.

## What you will learn

- What CI green means in this workflow.
- The merge strategy and when to use it.
- How to close the parent issue and verify traceability.

## Steps

1. **Confirm CI is green.** All required status checks must pass before merging:
   ```bash
   gh pr checks <pr-number>
   ```
   If any check is red, investigate and fix the root cause — do not bypass.

2. **Approve the PR.** If you have reviewer access, approve it yourself for this exercise. In real work, approval comes from a peer or the automated reviewer.

3. **Merge using the squash-and-merge strategy** (default for topic branches in this workflow):
   ```bash
   gh pr merge <pr-number> --squash --delete-branch
   ```
   The squash message should reference the issue: `feat(<scope>): <description> (closes #<issue-number>)`.

4. **Verify the parent issue is closed.** GitHub should close it automatically if your PR body contains `Closes #<issue-number>`. Check with:
   ```bash
   gh issue view <issue-number> --json state
   ```

5. **Check traceability** (optional but recommended): confirm that the squashed commit message on your integration branch references the issue number and that the PR is linked to the issue in GitHub. The integration branch is whichever branch is configured as `origin/HEAD` in your repository — typically `main` or `develop`.

## Acceptance criteria

- [ ] All CI checks passed before merge.
- [ ] PR was merged using squash-and-merge.
- [ ] Topic branch was deleted after merge.
- [ ] Parent issue was closed automatically or manually.
- [ ] Merged commit message references the parent issue number.

## You are done

You have completed the Specorator onboarding series. You now know how to:

- Write and triage a well-formed issue.
- Decompose it into vertical slices with `/issue:breakdown`.
- Open a draft PR, request a review, respond to feedback, and re-request.
- Merge cleanly and close the issue.

Next steps:
- Start a real feature with `/spec:start <feature-slug>`.
- Explore the full workflow at `docs/specorator.md`.
- Ask Claude: "let's start a feature" to drive the full 11-stage lifecycle.
