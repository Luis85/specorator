---
type: quick-action
name: Implement plan with subagents
description: Execute a superpowers implementation plan task-by-task using dispatched subagents
icon: list-checks
tags:
  - superpowers
  - implementation
  - subagents
favorite: true
favoriteRank: 1
---
The attached note is a superpowers implementation plan. Implement it end to end.

Use the `subagent-driven-development` skill to drive execution. Before touching code:

1. Read the attached plan fully. Restate the goal and list every task in order.
2. Confirm prerequisites named in the plan (branch/worktree, baseline `npm run typecheck && npm run lint && npm run test && npm run build` green).

Then execute the plan task by task:

- Dispatch ONE subagent per independent task. Give each subagent the exact task scope, the relevant files, the acceptance criteria from the plan, and the project conventions (TDD: failing test first; no `console.*`; no `innerHTML`/`outerHTML`; build DOM with Obsidian `createEl`/`createDiv`/`setText`).
- Each subagent returns a report: what changed, files touched, tests added, verification output.
- Review each subagent report before starting the next dependent task. Do NOT mark a task done on the subagent's word alone — verify with real command output (`verification-before-completion`).
- If a task depends on a prior task, run it only after the prior task is verified green.

After all tasks:

- Run the full gate: `npm run typecheck && npm run lint && npm run test && npm run build`.
- Summarize per-task status, remaining gaps, and any plan deviations with rationale.

Stop and ask me before any destructive action (force push, history rewrite, deleting files not named in the plan). If the plan is ambiguous or a task fails twice, surface it to me instead of guessing.
