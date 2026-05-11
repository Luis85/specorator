# AGENTS.md

Operating manual for automated and AI agents (Codex, Claude Code, dependabot operators, scripted tools) contributing to Specorator. Human contributors should read [`docs/contributing.md`](./docs/contributing.md) instead — that document is authoritative for triage, labels, milestones, and merge policy. This file is the agent-facing surface: short, mechanical, optimised for non-human readers.

If a rule here disagrees with `docs/contributing.md`, the human guide wins; open a PR to reconcile the two rather than acting on the divergence.

---

## 0. Read these first

1. **`memory/constitution.md`** — governing principles. Override only with explicit human approval.
2. **`.claude/memory/MEMORY.md`** — operational memory: workflow rules + project state, indexed.
3. **`docs/specorator.md`** — full Specorator workflow definition (Stages 1–11 + opt-in tracks).
4. **Current feature's `specs/<feature>/workflow-state.md`** — active stage + what's already produced.

## 0a. Operating rules

- **Stay in scope.** Each agent role has a defined responsibility (see `.claude/agents/`). No code in research; no requirement changes during implementation.
- **Specs = source of truth.** Implementation reveals a missing requirement → escalate, don't silently invent. Update spec first, then code.
- **Respect quality gates.** Acceptance criteria in `docs/quality-framework.md` are non-negotiable.
- **Trace everything.** `REQ-<AREA>-NNN`, `T-<AREA>-NNN`, `TEST-<AREA>-NNN`, `ADR-NNNN`. Reference IDs in commits, PRs, artifacts. See [`docs/traceability.md`](docs/traceability.md).
- **EARS for requirements.** Functional requirements use EARS notation — map 1:1 to tests. See [`docs/ears-notation.md`](docs/ears-notation.md).
- **ADRs for irreversible decisions.** Architecturally load-bearing → ADR in `docs/adr/`. Use `templates/adr-template.md`. ADR bodies are immutable; supersede to change.
- **Update workflow state.** Finishing a stage → update `specs/<feature>/workflow-state.md`.
- **Consult `inputs/` at intake.** Every conductor's scope phase lists `inputs/` and asks the user which items are relevant. Never auto-extract zips or archives. See [`docs/inputs-ingestion.md`](docs/inputs-ingestion.md).
- **Escalate ambiguity.** No guessing. Ask the human or open a `clarifications` block.
- **Template-self changes use `/specorator:update` first.** Keywords: new track, skill, workflow, update template.
- **Memory edits are docs-only.** Updates to `.claude/memory/` ride their own PR with no changeset.

## 0b. Agent classes

Track taxonomy frozen in ADR-0026. Agent classes per track:

| Class | Purpose |
|---|---|
| **Lifecycle (Stage 1–11 specialists)** | analyst, pm, ux/ui-designer, architect, planner, dev, qa, reviewer, release-manager, sre, retrospective |
| **Discovery specialists** *(opt-in)* | facilitator + product-strategist, user-researcher, game-designer, divergent-thinker, critic, prototyper. Produces `chosen-brief.md`. |
| **Stock-taking** *(opt-in, brownfield)* | `legacy-auditor`. Inventory existing systems before new work. |
| **Sales** *(opt-in, service provider)* | `sales-qualifier`, `scoping-facilitator`, `estimator`, `proposal-writer`. Produces `order.md`. |
| **Project manager** *(opt-in)* | Client-engagement governance (P3.Express). State under `projects/<slug>/`. Never edits `specs/`. |
| **Roadmap manager** *(opt-in)* | Outcome roadmaps + stakeholder maps under `roadmaps/<slug>/`. Read-only on `specs/`. |
| **Portfolio** *(opt-in)* | P5 Express X/Y/Z cycles. Reads `specs/*/workflow-state.md`; never modifies spec artifacts. |
| **Project scaffolder** *(opt-in)* | Source-led onboarding from collected docs/folders. State under `scaffolding/<slug>/`. |
| **Quality assurance** *(opt-in)* | ISO 9001-aligned readiness review. State under `quality/<slug>/`. |
| **Project review** *(opt-in)* | Evidence-backed history review; captures learnings, proposes improvements, opens draft PR. |
| **Issue-breakdown** *(opt-in)* | Post-tasks. Issue → draft PRs. |
| **Issue-draft** *(opt-in)* | Post-Stage-1. Early draft PR from `idea.md`; living-PRD issue body. |
| **Issue-tackle** *(opt-in)* | Triage-first conductor. Scans issue/PR for open tasks, proposes path, creates worktree, opens PR. |
| **Design** *(opt-in)* | Brand-aware surface creation. State under `designs/<slug>/`. |
| **Specorator improvement** *(companion)* | Improve this template's scripts, tooling, workflows, docs, agents, skills, templates. |

Skills (`.claude/skills/`) = reusable how-tos any agent invokes. Conductors are the conversational entry points.

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
gh api --paginate repos/<owner>/<repo>/pulls/<n>/comments
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
| [`memory/constitution.md`](./memory/constitution.md) | Non-negotiable governing principles. |
| [`docs/specorator.md`](./docs/specorator.md) | Full Specorator workflow definition (Stages 1–11 + all tracks). |
| [`docs/sink.md`](./docs/sink.md) | Canonical list of where every artifact lands. Don't invent new locations. |
| [`docs/verify-gate.md`](./docs/verify-gate.md) | What `npm run verify` checks and when to run it. |
| [`docs/worktrees.md`](./docs/worktrees.md) | Topic branch worktree conventions. |
| [`docs/contributing.md`](./docs/contributing.md) | Human-oriented contribution guide. Authoritative for triage, labels, milestones, merge policy. |
| [`CONSTITUTION.md`](./CONSTITUTION.md) | Non-negotiable working agreement (legacy location — see `memory/constitution.md`). |
| [`docs/security/supply-chain.md`](./docs/security/supply-chain.md) | Supply-chain hardening policy (audit, dep-review, Scorecard, SHA-pinning). |
| [`docs/local-development.md`](./docs/local-development.md) | Local dev environment setup. |
| [`decisions/`](./decisions/) | Architectural decision records. |

---

## 10. agentic-workflow Claude plugin

The upstream agentic-workflow methodology that governs delivery in this repo ships as a Claude Code plugin from [`Luis85/agentic-workflow`](https://github.com/Luis85/agentic-workflow) (current release: v0.8.0). When activated it adds spec-first commands (`/spec`, `/adr`, `/issue`, `/roadmap`, …), agent personas, and skills aligned with the Specorator workflow.

**Install (one-time, per Claude Code session):**

```
/plugin marketplace add https://github.com/Luis85/agentic-workflow.git
/plugin install specorator@specorator-marketplace
```

The marketplace manifest lives at [`Luis85/agentic-workflow:.claude-plugin/marketplace.json`](https://github.com/Luis85/agentic-workflow/blob/develop/.claude-plugin/marketplace.json); the plugin contents live on the `dist/claude-plugin` branch under `claude-plugin/specorator/`.

**Coexistence with project-local skills:** the repo ships a local skill at `.claude/skills/publish-release` that the plugin does not override. If both are present, the local skill wins (project-level skills take precedence). Document any further project-specific deviations in this section.

The activation step is intentionally not declared in `.claude/settings.json`'s `enabledPlugins` — marketplaces from external git URLs must be registered at runtime via the slash command above before the plugin can be enabled. Closes the open work tracked in upstream #181 / consumer #97.
