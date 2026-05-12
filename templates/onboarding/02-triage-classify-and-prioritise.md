## Goal

Take the issue you created in step 1 and apply the full triage process: correct labels, a milestone, and an in/out-of-scope decision. This is what the team does every time a new issue lands.

## What you will learn

- How the label taxonomy works.
- How to set priority and assign to a milestone.
- How to decide what is in scope vs. out of scope before any work starts.

## Steps

1. **Open the issue** you created in Issue 1.

2. **Verify the type label.** Confirm it is one of:
   - `enhancement` — new behaviour.
   - `bug` — unintended behaviour.
   - `chore` — maintenance with no user-visible change.

3. **Set the priority label** using this guide:
   - `P1` — blocks the current release or a live system.
   - `P2` — important for the next release but not blocking.
   - `P3` — nice to have; can wait.

4. **Assign to a milestone.** If no relevant milestone exists, create one with a target date.

5. **Add or update the Proposed solution section** to be explicit about what is _not_ included. Mark it as **Out of scope** with a short list.

6. **Advance the status label** once scope is agreed: remove `status:draft` and apply the canonical ready-for-spec label `status:ready-for-spec`. If your repository uses a different ready-state label, substitute it — the point is that the issue is no longer a draft.

## Acceptance criteria

- [ ] One type label (`enhancement`, `bug`, or `chore`) is applied.
- [ ] One priority label (`P1`, `P2`, or `P3`) is applied.
- [ ] Issue is assigned to a milestone.
- [ ] Issue body contains an Out of scope section.
- [ ] `status:draft` label is removed and a ready-state label is applied.

## Next step

Move to [Issue 3 — Break the issue down](03-break-the-issue-down.md) to decompose this issue into vertical slices.
