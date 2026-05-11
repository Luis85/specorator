## Goal

Decompose your triaged issue into independent vertical slices, each deliverable as its own draft PR. This is how the workflow avoids monolithic branches and keeps review cycles short.

## What you will learn

- How to run `/issue:breakdown` to generate draft PRs.
- What a vertical slice looks like vs. a horizontal layer.
- How to review and adjust auto-generated draft PRs.

## Steps

1. **Open Claude Code** in this repository.

2. **Run the breakdown command** for your issue number:
   ```
   /issue:breakdown <your-issue-number>
   ```
   Claude will read your issue body, decompose it into slices, and open one draft PR per independent batch.

3. **Review the draft PRs.** For each one, verify:
   - The title and description clearly describe a single, deployable change.
   - The PR does not depend on another open draft PR (except its direct parent slice, if any).
   - The PR references your parent issue number.

4. **Adjust if needed.** Close any draft PR that represents a horizontal layer rather than a vertical slice, and note the reason in a comment.

5. **Confirm the sequence.** Add a comment to the parent issue linking to each draft PR in the order they should be merged.

## Acceptance criteria

- [ ] `/issue:breakdown` was run and produced at least one draft PR.
- [ ] Each draft PR references the parent issue.
- [ ] At least one draft PR has been reviewed and confirmed as a vertical slice.
- [ ] Parent issue body is updated with a link to the draft PR list.

## Next step

Move to [Issue 4 — Open a PR and enter the feedback loop](04-open-a-pr-and-enter-the-feedback-loop.md) to push a branch and request a review.
