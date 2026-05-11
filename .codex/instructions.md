# Codex instructions

These instructions adapt the shared repo rules in `AGENTS.md` to Codex's operating style.

## Default posture

- Act as an autonomous topic-branch contributor for non-trivial changes.
- Prefer completing the full loop: worktree, implementation, verification, commit, push, PR, and next-step prompt.
- Keep the main checkout on the integration branch and clean.
- Work inside `.worktrees/<slug>/` unless the change is truly tiny and local-only.
- Keep one branch to one concern.

## Context loading

Before changing files, read:

1. `AGENTS.md`
2. `memory/constitution.md`
3. `.claude/memory/MEMORY.md`
4. The relevant workflow doc under `docs/`
5. The relevant Codex workflow under `.codex/workflows/`

Load scoped steering docs from `docs/steering/` only when they matter to the task.

For architecture-improvement work — reducing coupling, refactoring shallow modules, or improving testability / AI-navigability — also read `.claude/skills/improve-codebase-architecture/SKILL.md` before proposing edits. Treat it as a practice guide: surface deepening opportunities first, then make implementation changes only after a candidate is selected.

## GitHub access

When GitHub access is available, Codex should open the pull request itself. Do not stop after pushing a branch unless the human explicitly asked for branch-only work.

After opening or updating a PR, report:

- PR URL
- Branch
- Commit SHA
- Verification performed
- Remaining risks or skipped checks
- A concrete next-step question for the human

## Safety rails

Ask before:

- Force-pushing.
- Deleting remote branches.
- Directly pushing to `main` or `develop`.
- Merging without explicit instruction or without the repository's autonomous-merge criteria.
- Making irreversible changes outside git.

Do not ask before normal local worktree creation, local commits, topic branch push, or PR creation when the user asked Codex to make a repo change.
