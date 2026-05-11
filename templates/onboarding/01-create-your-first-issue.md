## Goal

Write a well-formed GitHub issue that the Specorator workflow can pick up. This is the first step of the onboarding series — completing it gives you a real artifact that the next issue will use.

## What you will learn

- What a well-formed issue looks like in this workflow.
- How to apply the label taxonomy.
- What acceptance criteria look like when they are testable.

## Steps

1. **Open a new issue** in this repository.

2. **Fill in the title** using the Conventional Commits pattern:
   ```
   feat(<scope>): <what it does>
   ```
   Example: `feat(auth): add magic-link login`

3. **Write the body** with at least:
   - **Problem** — one paragraph explaining what is missing or broken and why it matters.
   - **Proposed solution** — a brief description of the intended change.
   - **Acceptance criteria** — a checklist of things that must be true for the issue to be closed. Each item should be independently verifiable.

4. **Apply labels**:
   - One type label: `enhancement`, `bug`, or `chore`.
   - One priority label: `P1`, `P2`, or `P3`.
   - `status:draft` while the issue is still being shaped.

5. **Submit** the issue.

## Acceptance criteria

- [ ] Issue title follows the `type(scope): description` format.
- [ ] Issue body contains a Problem section, a Proposed solution section, and a checklist of acceptance criteria.
- [ ] At least one type label and one priority label are applied.
- [ ] `status:draft` label is applied.

## Next step

Once your issue is created, move to [Issue 2 — Triage: classify and prioritise](02-triage-classify-and-prioritise.md).
