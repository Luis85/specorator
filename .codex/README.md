# `.codex/` recipes

Short, mechanical step-by-step recipes for automated and AI agents working in this repository. Each recipe is self-contained, idempotent where possible, and assumes the agent has already read [`AGENTS.md`](../AGENTS.md).

| Recipe | When to use |
|---|---|
| [`pre-pr-gate.md`](./pre-pr-gate.md) | Before opening or updating any PR. |
| [`open-pr.md`](./open-pr.md) | Opening a fresh PR against `develop`. |
| [`address-review.md`](./address-review.md) | After a reviewer (human or bot) has submitted feedback. |
| [`branch-hygiene.md`](./branch-hygiene.md) | After a PR has been merged or abandoned. |

Recipes are intentionally narrow. If the situation does not match the preconditions in a recipe, fall back to the general workflow described in [`AGENTS.md`](../AGENTS.md) and ask the human maintainer rather than improvising a destructive action.

Conventions used inside recipes:

- Shell snippets are POSIX `sh`-compatible unless explicitly marked `bash` or `pwsh`.
- `<owner>` and `<repo>` are the GitHub coordinates for the active repository (`Luis85/specorator` for the canonical Specorator project). `<n>` is a PR number.
- Long-running steps that can be safely backgrounded are noted as such; otherwise treat each step as blocking.
