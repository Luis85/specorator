# AGENTS.md

Operating manual for automated and AI agents (Codex, Claude Code, dependabot operators, scripted tools) contributing to Specorator. Human contributors should read [`docs/contributing.md`](./docs/contributing.md) instead — that document is authoritative for triage, labels, milestones, and merge policy. This file is the agent-facing surface: short, mechanical, optimised for non-human readers.

If a rule here disagrees with `docs/contributing.md`, the human guide wins; open a PR to reconcile the two rather than acting on the divergence.

---

## 1. Environment

- **Runtime:** Node.js LTS (matches `lts/*` in `.github/workflows/ci.yml`).
- **Package manager:** `npm` only. Do not invoke `yarn`, `pnpm`, or `bun`.
- **Working directory:** project root unless a recipe says otherwise.
- **Git remote:** `origin` is the canonical Specorator repository.

If a tool needs Node version pinning, read `lts/*` from CI rather than hardcoding a number — the CI workflow is the source of truth.

---

## 2. Commands you will use

| Purpose | Command |
|---|---|
| Type-check TS + Vue | `npm run typecheck` |
| Lint | `npm run lint` |
| Format check | `npm run format:check` |
| Tests (single pass) | `npm run test` |
| Plugin build | `npm run build` |
| Standalone UI build | `npm run build:web` |
| API docs | `npm run docs:api` |
| Single test file | `npx vitest run <path>` |

---

## 3. Pre-PR verification gate

Run all of the following before opening or updating a PR. CI re-runs them, but failing locally first wastes a slower cycle.

```sh
npm audit --audit-level=high --omit=dev \
  && npm run typecheck \
  && npm run lint \
  && npm run test \
  && npm run build \
  && npm run build:web \
  && npm run docs:api
```

`npm audit` is part of the standard chain because the CI `verify` job runs it unconditionally on every PR. Matching that locally catches advisories that were published since your last install.

Additional gates depending on what changed:

- **Workflow file changed** (`.github/workflows/*.{yml,yaml}`): run `actionlint` locally and confirm every `uses:` reference is pinned to a 40-character commit SHA. CI enforces both, but the local pass shortens the loop. See [`docs/security/supply-chain.md`](./docs/security/supply-chain.md).
- **Vue/UI changed**: build the standalone UI (`npm run build:web`) and load it in a browser. Type-checks alone do not validate runtime behaviour.

If any gate fails, fix the underlying issue. Do not bypass with `--no-verify`, `--ignore-scripts`, `if: false`, or by deleting the failing step. If the gate itself is wrong, file an issue and propose the fix in a separate PR before merging the work that needs the bypass.

The full recipe lives in [`.codex/pre-pr-gate.md`](./.codex/pre-pr-gate.md).

---

## 4. Branching model

| Branch | Role | Direct pushes |
|---|---|---|
| `develop` | Integration branch. All feature branches cut from here and merge back here. | Never (PR-only) |
| `demo` | Preview branch. GitHub Pages deploys from here. | PR from `develop` only |
| `main` | Stable release gate. Tagging `main` HEAD triggers the Obsidian release. | PR from `develop` only |

Rules:

- **Cut every branch from `develop`**, never from `main` or `demo`.
- **Open every PR against `develop`** unless explicitly publishing a preview or cutting a release.
- **Branch name**: `<type>/<short-kebab>` where `<type>` is one of `feature`, `fix`, `docs`, `chore`, `refactor`. Three to five words; do not embed issue numbers.
- **Squash-merge only.** No merge commits, no rebase-and-merge, unless explicitly requested by a maintainer.
- **Delete the branch after merge** (remote and any local worktree). See [`.codex/branch-hygiene.md`](./.codex/branch-hygiene.md).

The full branching reference is [`docs/contributing.md`](./docs/contributing.md) §5.

---

## 5. Spec-first gate (Phase 4 features)

A Phase 4 feature implementation branch may not be opened until the feature has:

1. `specs/{slug}/idea.md` accepted by the PM role.
2. `specs/{slug}/workflow-state.md` at the correct stage using the ADR-005 schema.
3. Requirements accepted (or an explicit PM sign-off to proceed from idea directly).

If any of those three are missing, stop and prompt the human maintainer rather than proceeding. See [`CONSTITUTION.md`](./CONSTITUTION.md) §3 and [`decisions/DEC-001-adopt-agentic-workflow-for-repo.md`](./decisions/DEC-001-adopt-agentic-workflow-for-repo.md).

This gate does not apply to chore, docs, refactor, or infrastructure work.

---

## 6. The end-to-end loop

```
┌──────────────────────────┐
│ 1. Read the issue        │
│    accept the scope      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 2. Cut a worktree off    │
│    origin/develop        │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 3. Implement the change  │
│    keep commits focused  │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 4. Run pre-PR gate (§3)  │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 5. Push branch           │
│    open PR → develop     │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 6. Watch CI + reviews    │
│    address feedback      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│ 7. Squash-merge          │
│    delete branch         │
└──────────────────────────┘
```

Step-by-step recipes:

- Open a PR: [`.codex/open-pr.md`](./.codex/open-pr.md)
- Run the pre-PR gate: [`.codex/pre-pr-gate.md`](./.codex/pre-pr-gate.md)
- Address review feedback: [`.codex/address-review.md`](./.codex/address-review.md)
- Branch hygiene after merge: [`.codex/branch-hygiene.md`](./.codex/branch-hygiene.md)

---

## 7. Handling review feedback

Reviews on this repository can include both a top-level summary body and inline file-line comments. **Both must be inspected before merge.**

A common failure mode is to query only the review summary (e.g. `gh pr view <n> --json reviews`) and miss inline comments that contain the substantive feedback. Inline comments live on a different endpoint:

```sh
gh api repos/<owner>/<repo>/pulls/<n>/comments
```

Rules:

- Do not squash-merge while any inline comment is unaddressed.
- An inline comment is "addressed" only if (a) the underlying issue is fixed in code, (b) it is responded to with a justification that the human maintainer accepts, or (c) the maintainer explicitly waives it.
- Cross-reference each comment's `commit_id` against the PR's current head SHA. A comment on a stale commit may still apply if the line content survives unchanged.
- After force-pushes or rebases, GitHub may reposition stale inline comments to the latest commit. Do not interpret that as a re-review — check the `pulls/.../reviews` endpoint for the actual review timestamps.

Full recipe: [`.codex/address-review.md`](./.codex/address-review.md).

---

## 8. What you must not do

- Push directly to `develop`, `demo`, or `main`.
- Tag a release from any branch other than `main`.
- Force-push to a shared branch.
- Skip hooks or signing (`--no-verify`, `--no-gpg-sign`) unless a human explicitly asks for it.
- Amend or rebase commits that have been pushed to a shared branch.
- Add a runtime dependency without recording the rationale in the PR description (license, maintenance, why-not-existing).
- Add a `uses:` line to a workflow without a 40-character commit SHA.
- Re-export, rename, or leave dead code "for backwards compatibility" inside this repo. Delete it.

---

## 9. Where else to look

| Document | What it covers |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Claude-Code-specific repository guide (architecture, paths, conventions). Read first. |
| [`docs/contributing.md`](./docs/contributing.md) | Human-oriented contribution guide. Authoritative for triage, labels, milestones, merge policy. |
| [`CONSTITUTION.md`](./CONSTITUTION.md) | Non-negotiable working agreement. |
| [`docs/security/supply-chain.md`](./docs/security/supply-chain.md) | Supply-chain hardening policy (audit, dep-review, Scorecard, SHA-pinning). |
| [`docs/local-development.md`](./docs/local-development.md) | Local dev environment setup. |
| [`decisions/`](./decisions/) | Architectural decision records. |
