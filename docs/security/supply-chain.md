---
title: Supply-chain hardening policy
doc_type: policy
status: active
owner: maintainers
last_reviewed: 2026-05-02
---

# Supply-chain hardening policy

This document records the controls Specorator applies to its dependency graph and CI/CD surface, plus the manual review expectations that sit on top of those controls.

## Goals

- Detect known-vulnerable dependencies before they reach `develop`.
- Prevent silent introduction of copyleft (GPL/AGPL) licenses incompatible with this project's MIT license.
- Make every third-party CI step auditable to a specific commit.
- Surface project-level supply-chain hygiene metrics (Scorecard) over time.

## Automated controls

### `npm audit` on every CI run

`.github/workflows/ci.yml` runs `npm audit --audit-level=high --omit=dev` after `npm ci` in the verify job.

- **Threshold:** `high`. CI fails on any `high` or `critical` advisory in production dependencies.
- **Scope:** `--omit=dev` limits the gate to runtime dependencies. Dev-dependency advisories are surfaced by Dependabot but do not block CI on their own.
- **Rationale:** Treating every moderate dev-tool advisory as a release blocker leads to rubber-stamping. The high-severity production threshold is the point at which a release should not ship without a deliberate decision.

### `actions/dependency-review-action` on pull requests

`.github/workflows/dependency-review.yml` runs on every pull request targeting `develop`, `demo`, or `main`.

- Fails the PR check if the diff introduces any dependency with a `high` or `critical` advisory.
- Fails the PR check if the diff introduces any GPL-family license (`GPL-2.0`, `GPL-3.0`, `AGPL-1.0`, `AGPL-3.0`, in `-only` and `-or-later` variants).
- Posts a summary comment on the PR when it fails so the author can see the offending package without digging through logs.

### OpenSSF Scorecard

`.github/workflows/scorecard.yml` runs weekly (Mondays 04:23 UTC), on push to `main`, and on branch-protection-rule changes.

- Publishes results to the OpenSSF public Scorecard registry (`publish_results: true`).
- Uploads SARIF to GitHub code-scanning so findings appear in the Security tab.
- Treated as observability, not a merge gate. Use Scorecard output to drive policy changes; do not block ordinary feature work on Scorecard regressions.

### Action pinning

All third-party actions are pinned to a 40-character commit SHA with the human-readable tag preserved as a comment, for example:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

`actionlint` (run in CI) catches malformed workflow files. PRs that introduce a `uses:` line without a SHA must be revised before merge.

## Manual review expectations

### Dependency bumps

- Dependabot opens PRs for npm and GitHub Actions updates. The `dependabot-auto-merge` workflow auto-merges patch updates and minor dev-dependency updates after CI passes.
- Major-version bumps and any production-dependency minor bump require a human review before merge.
- Reviewer responsibilities, in order:
  1. Confirm the upstream changelog and release notes are visible from the PR.
  2. Confirm the action SHA in the diff matches the upstream tag's commit.
  3. Confirm CI is green, including the dependency-review job.
  4. Apply the same `develop → main` flow as any other change — never merge dependency PRs directly to `main`.

### New runtime dependencies

When a PR adds a new runtime dependency (`dependencies` in `package.json`, not `devDependencies`):

- The PR description must state why the dependency is preferred over a hand-rolled implementation or an existing dependency in the tree.
- The reviewer confirms the package's license is MIT, Apache-2.0, BSD-2/3, ISC, or another permissive license. GPL-family licenses are blocked at CI; the reviewer is the second line for ambiguous licenses (e.g. dual-licensed packages).
- The reviewer checks the package's age, weekly downloads, and last-release recency on npm. New, low-traffic packages get extra scrutiny, especially if they have transitive dependencies.

### Workflow / action changes

- Any new `uses:` line must be pinned to a SHA in the same PR that introduces it. CI does not enforce this directly today; reviewers do.
- Granting a workflow `write` permission requires an explicit comment in the PR explaining what is written and why a `read` token is insufficient.

## Threat model assumptions

- The project trusts GitHub-hosted runners and GitHub's identity layer. Compromise of GitHub itself is out of scope.
- The project does not assume Dependabot's auto-merge path is sufficient for security patches alone — the `npm audit` gate exists so that a production-severity advisory cannot slip through a Dependabot PR that races ahead of advisory publication.
- The project assumes contributors are honest but fallible. Controls focus on accidental introduction of vulnerable or unsafely-licensed code rather than on resisting a determined insider.

## Review cadence

This policy is reviewed at every `main` release tag. Update `last_reviewed` in the front matter and commit the change as part of the release PR.
