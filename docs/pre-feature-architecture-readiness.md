---
title: Pre-feature architecture readiness review
doc_type: architecture-review
status: draft
owner: engineering
last_updated: 2026-05-02
references:
  - https://github.com/Luis85/specorator/issues/86
  - docs/adr/ADR-001-ddd-layered-architecture.md
  - docs/adr/ADR-002-ibridge-abstraction.md
  - docs/adr/ADR-003-vue3-composition-hash-router.md
  - docs/adr/ADR-004-result-discriminated-union.md
  - docs/adr/ADR-005-agentic-workflow-vault-structure.md
  - docs/marketplace-readiness.md
  - https://docs.obsidian.md/oo/plugin
  - https://docs.obsidian.md/Reference/Versions
  - https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
  - https://github.com/obsidianmd/obsidian-sample-plugin
  - https://obsidian.md/blog/less-is-safer/
  - https://docs.github.com/actions/learn-github-actions/security-hardening-for-github-actions
  - https://pinia.vuejs.org/cookbook/testing.html
  - https://vuejs.org/guide/extras/composition-api-faq
  - https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/stable-en/02-checklist/05-checklist
---

# Pre-feature Architecture Readiness Review

This review captures the architecture, infrastructure, and process work that should be codified before v1 feature delivery accelerates. The current shell already has a strong foundation: DDD layers, an explicit Obsidian bridge, Result-based use cases, Vue 3 Composition API, Pinia, Vitest, TypeDoc, CI, ADRs, and an agentic-workflow-aligned vault structure.

The remaining work should be split into distinct implementation plans instead of handled as one large catch-all change. Most items are safety rails around vault writes, release correctness, maintainability, and future agent integration.

**Tracking issue:** [#86](https://github.com/Luis85/specorator/issues/86)

## Recommendation

Open one tracking issue for pre-feature readiness, then split it into focused implementation issues:

1. Contributor and agent workflow codification.
2. Obsidian API and vault-write safety guardrails.
3. Versioned workflow-state schema and migration boundary.
4. Release, marketplace, and compatibility model.
5. Test architecture and verification expansion.
6. Supply-chain and CI hardening.
7. v2 agent runtime boundary.

Each plan should produce one narrow PR with its own ADR, tests, and verification notes where applicable.

## Findings

### 1. Contributor and agent workflow rules are not checked in

The repository currently has no committed `AGENTS.md` or `.codex/` workflow instructions. Worktree/topic-branch discipline, branch base selection, PR expectations, and issue-update expectations are therefore only available outside the repository.

Codify:

- `AGENTS.md` as the primary contributor and agent instruction file.
- `.codex/instructions.md` for Codex-specific execution rules.
- `.codex/workflows/` entries for research, implementation, PR review feedback, and post-merge cleanup.

Acceptance:

- Contributors can discover the autonomous topic-branch workflow from a clean checkout.
- The instructions identify `develop` as the integration branch unless that policy changes.
- The instructions explicitly protect unrelated user changes and require verification before PRs.

### 2. Obsidian API safety rules need an ADR and lintable conventions

Obsidian's plugin guidance emphasizes lifecycle cleanup, path normalization, native vault APIs, frontmatter handling, plugin data APIs, dependency restraint, and startup performance. The current architecture points in the right direction but should make these rules explicit before more feature code is added.

Codify:

- Use `registerEvent()` and `registerInterval()` for cleanup.
- Use `workspace.onLayoutReady()` for startup UI work when behavior can be deferred.
- Use `normalizePath()` for user-defined vault paths.
- Prefer `Vault` and `FileManager` APIs over low-level adapter access where practical.
- Use `FileManager.processFrontMatter()` for frontmatter mutation when editing existing notes.
- Avoid direct `.obsidian` folder assumptions.
- Avoid global `app`, module-level mutable state, production `console.log`, and `as any`.
- Keep Obsidian imports out of UI, application, and domain layers.

Acceptance:

- Add an ADR for Obsidian API safety and lifecycle conventions.
- Add or strengthen ESLint rules where static enforcement is practical.
- Document exceptions where adapter access is intentionally retained.

### 3. Workflow-state parsing should become a versioned schema boundary

`FeatureRepository` currently owns path construction, YAML serialization, frontmatter parsing, feature reconstitution, and stage-file creation. That is manageable now, but it will become a fragile center of gravity once template installation, diagnostics, migrations, open questions, decisions, gates, and v2 agent output are introduced.

Codify:

- `WorkflowStateSchema` with `schemaVersion`.
- Parser and writer modules separate from repository persistence.
- Round-trip tests for canonical markdown.
- Backward-compatibility tests for legacy fields such as `title`.
- Malformed-file behavior that reports diagnostics without silent overwrite.
- Migration policy for future schema changes.

Acceptance:

- Repository code delegates workflow-state parsing/writing to a schema module.
- Tests cover valid, malformed, legacy, and hand-edited workflow-state files.
- Unknown frontmatter fields are preserved or explicitly documented as not preserved.

### 4. Vault path and overwrite safety should be centralized

Feature work will create and modify user vault files. Path handling and overwrite behavior should be centralized before more write paths appear.

Codify:

- A shared vault path utility that normalizes configured folders.
- Rejection of absolute paths, parent traversal, empty paths, and reserved plugin paths.
- A single overwrite policy used by template installation and artifact creation.
- A no-silent-overwrite invariant for user-authored files.
- Clear Result errors for unsafe paths and skipped writes.

Acceptance:

- All bridge/repository write paths use the shared validator.
- Tests cover path traversal, Windows separators, duplicate slashes, empty folders, and existing files.
- UI notices distinguish success, skipped files, and blocked unsafe paths.

### 5. Release and marketplace model needs reconciliation before public release

The release workflow currently builds plugin artifacts, but repository docs and Obsidian guidance need to be aligned. Obsidian release guidance expects the GitHub release tag to match `manifest.json` exactly, while the current workflow listens for `vX.Y.Z` tags. Obsidian also uses `versions.json` for compatibility fallback when `minAppVersion` changes.

Codify:

- Exact tag convention: use `0.1.0`, not `v0.1.0`, unless intentionally documented and tested against Obsidian review expectations.
- Add `versions.json`.
- Add a version-bump process that updates `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` together.
- Split development plugin builds from release builds.
- Minify release `main.js`.
- Avoid inline sourcemaps in release artifacts unless explicitly chosen.
- Keep `manifest.json`, `main.js`, and `styles.css` attached to every release.

Acceptance:

- Release workflow accepts the documented tag format.
- CI verifies `manifest.json`, `package.json`, and release tag alignment.
- Marketplace readiness no longer lists completed release automation as a blocker once validated.

### 6. Test architecture should expand before feature complexity

The project has Vitest and focused domain/infrastructure tests. The next feature increment needs broader confidence across bridge contracts, Markdown persistence, Pinia stores, and UI interactions.

Codify:

- Shared `IBridge` contract tests for mock/localStorage implementations and a documented strategy for Obsidian runtime behavior.
- Workflow-state parser/writer fixture tests.
- Pinia store tests using Pinia's testing harness.
- Vue component tests for core workflows.
- A standalone UI smoke test for browser runtime.
- A manual Obsidian runtime checklist for behavior that cannot be automated cheaply.

Acceptance:

- Each acceptance-critical v1 workflow has an automated unit or component test where practical.
- Manual test scenarios are limited to actual Obsidian runtime behavior.
- CI reports typecheck, lint, test, plugin build, standalone build, docs, and security checks.

### 7. Supply-chain and CI hardening should become explicit policy

Obsidian recommends fewer dependencies, shallow dependency graphs, exact pins, lock files, and review-heavy upgrades. The repository already commits `package-lock.json`; the remaining work is to make dependency and workflow risk visible.

Codify:

- Dependency update automation with human review.
- `npm audit` policy for high and critical issues.
- GitHub dependency review on PRs.
- Consider pinning third-party GitHub Actions to full commit SHAs, especially release workflows.
- Document criteria for adding runtime dependencies.
- Track bundle size for plugin load performance.

Acceptance:

- CI or scheduled automation reports dependency and workflow risks.
- Runtime dependencies require explicit justification in PRs.
- Release workflows use least permissions and documented action-pinning policy.

### 8. v2 agent integration boundary should be decided before it is needed

The current bridge ADR reserves room for `agentonomous`, but the actual agent boundary should be defined before v1 feature code accidentally couples UI, vault context, and agent execution.

Codify:

- No agent runtime imports in Vue components.
- A separate `IAgentBridge` or application service port.
- User-controlled vault context permissions.
- No hidden telemetry.
- No credential storage before a credential policy exists.
- Agent output must be reviewable before becoming durable vault artifacts.
- Agent runs need observable status, cancellation, diagnostics, and provenance.

Acceptance:

- Add an ADR describing the v2 agent runtime boundary.
- Define placeholder DTOs or ports only where they guide v1 extension points.
- Document deferred decisions for credentials, network access, and provider-specific behavior.

## Suggested Implementation Breakdown

| Plan | Title | Primary output | Suggested scope |
|---|---|---|---|
| P1 | Contributor workflow codification | `AGENTS.md`, `.codex/` workflows | Docs only |
| P2 | Obsidian API safety ADR | ADR, ESLint updates, local-development notes | Docs and lint |
| P3 | Workflow-state schema boundary | Schema module, parser/writer, fixtures | Code and tests |
| P4 | Vault path and overwrite guardrails | Path utility, repository integration, tests | Code and tests |
| P5 | Release and compatibility model | `versions.json`, workflow updates, docs | CI and docs |
| P6 | Test architecture expansion | Bridge/store/component/smoke tests | Tests |
| P7 | Supply-chain hardening | Audit/dependency review/Scorecard policy | CI and docs |
| P8 | Agent boundary ADR | v2 integration ADR and deferred decisions | Docs and interfaces |

## Immediate Next Step

Create a tracking issue from this review and use it to spawn the implementation issues above. The tracking issue should not be the implementation vehicle; it should hold the decision context, ordering, and cross-links.
