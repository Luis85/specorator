# PR delivery workflow

This repo treats Codex as an autonomous topic-branch contributor. When a human asks Codex to make a non-trivial repo change, Codex should complete the full PR loop unless the human explicitly asks for local-only work.

## Default delivery loop

1. Read the required project context from `AGENTS.md` and `.codex/instructions.md`.
2. Check the main checkout is clean enough to start and identify the integration branch (`main` for Shape A, `develop` for Shape B).
3. Create a fresh worktree under `.worktrees/<slug>/` from the integration branch:

   ```bash
   git fetch origin
   git worktree add .worktrees/<slug> -b <prefix>/<slug> origin/<integration-branch>
   ```

4. Install the project inside the new worktree before running verification:

   ```bash
   npm ci
   ```

   Fresh worktrees do not share `node_modules` with the main checkout. Skipping this step can make first-run verify actions fail before they reach the actual project checks.
5. Work only inside that worktree.
6. Keep the change to one concern and update the corresponding docs, state files, or issue records in the same branch.
7. Run the relevant verification gate before pushing. Use `npm run verify` as the final gate. During iteration, use the narrower scripts defined in `package.json`: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run verify:scaffold`, `npm run verify:workflows`. Run targeted checks and state exactly what passed.
8. Commit with an imperative message that references relevant IDs or issue paths.
9. Push the topic branch to `origin`.
10. Open a pull request against the integration branch with a Conventional Commits title that matches the CI allowlist. Allowed title types are `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, and `revert`; scopes are optional. Do not invent descriptive types such as `plan:` or `release:`. For planning artifacts and documentation-only specs, use `docs: ...`.
11. After opening the PR, re-check PR mergeability and CI status. If the PR-title check fails, update the PR title immediately instead of pushing a code-only retry.
12. Final response must include the PR URL, branch, commit, verification result, and any remaining risk.
13. Ask the human what they want next: review, merge, follow-up changes, or cleanup after merge.

## When Codex should pause

Pause and ask before continuing when:

- The change would require direct push to `main` or `develop`.
- Verification fails and the fix is unclear or out of scope.
- The work requires an irreversible action: deploy, delete, force-push, publish externally, or merge without the repository's autonomous-merge criteria.
- The requested change conflicts with the constitution, active spec state, or branch-per-concern rule.

## PR body checklist

Every Codex-opened PR should include:

- Summary of the user-visible changes.
- Verification commands or checks run.
- Linked requirement, task, ADR, issue, or local issue file when one exists.
- Known limitations or skipped checks.

The PR title is part of the delivery contract, not cosmetic metadata. Use Conventional Commits format. Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`. Scopes are optional. Do not invent types such as `plan:` or `release:`.

Codex should not stop at "pushed a branch" when GitHub access is available. The expected endpoint is an open PR and an explicit next-step prompt for the human.
