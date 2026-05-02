---
title: Obsidian marketplace readiness
doc_type: checklist
status: draft
owner: engineering
last_updated: 2026-05-02
references:
  - manifest.json
  - docs/roadmap-v1.md
  - docs/pre-feature-architecture-readiness.md
  - https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md
---

# Obsidian Marketplace Readiness

This document captures the constraints, requirements, and pre-submission checklist for submitting Specorator to the [Obsidian community plugins](https://obsidian.md/plugins) marketplace. It must be reviewed before every release candidate.

---

## Release artifacts

The plugin build produces three files that must be included in every GitHub release:

| File | Source | Notes |
|---|---|---|
| `main.js` | `npm run build` | CommonJS bundle; Vue, Pinia, Vue Router, Vue I18n all inlined |
| `manifest.json` | committed | Must match the release tag version exactly |
| `styles.css` | `npm run build` | Obsidian requires CSS output to use this exact filename |

The `.gitignore` correctly excludes `main.js` and `main.js.map` from source control. Both files are regenerated on each build.

### Version alignment rule

`manifest.json` → `version` **must** match `package.json` → `version` at release time. The GitHub release tag **must** match both. Mismatches are rejected by the marketplace submission bot.

---

## `manifest.json` requirements

The current `manifest.json` satisfies the mandatory fields. Review each field before submission:

| Field | Current value | Requirement |
|---|---|---|
| `id` | `specorator` | Unique across all community plugins; lowercase, no spaces |
| `name` | `Specorator` | Human-readable display name |
| `version` | `0.0.1` | Semver; must match `package.json` and release tag |
| `minAppVersion` | `1.4.0` | Minimum Obsidian desktop version tested against |
| `description` | `"Spec-driven workflow cockpit…"` | ≤250 characters; plain text only; no marketing language |
| `author` | `Luis85` | Real name or consistent handle |
| `authorUrl` | `https://github.com/Luis85` | Must be a reachable URL |
| `isDesktopOnly` | `true` | Correct: the plugin writes vault files via Node.js APIs unavailable in Obsidian mobile |

**Before submission, also add:**

- `fundingUrl` (optional) — link to sponsorship or donation page if desired.

---

## Privacy and network behavior

The marketplace review checks for undisclosed network access. Document all network behavior here before submission.

### v1 state

| Category | Behavior |
|---|---|
| Network requests | **None.** All operations are local vault reads and writes via `IBridge`. |
| External APIs | None in v1. |
| Telemetry / analytics | None. No usage data is collected or transmitted. |
| Credentials / API keys | None stored in v1. Future `agentonomous` integration (v2.0) will require a credential storage strategy — document at that time. |
| Vault access | Read/write limited to paths under the configured `specsFolder`, `archiveFolder`, and `decisionsFolder`. No broad vault scanning. |

If any network behavior is added before submission, it must be disclosed in the plugin's README and in the marketplace submission PR description.

---

## Dependency hygiene

The Obsidian marketplace review flags plugins with problematic bundled dependencies. Verify the following before submission:

- [ ] `npm audit` reports no high or critical vulnerabilities.
- [ ] No native Node.js add-ons (`*.node` files) are bundled.
- [ ] All Obsidian and CodeMirror modules are correctly externalized in `vite.config.ts` (currently handled by `ALL_EXTERNALS`).
- [ ] The bundled `main.js` does not import `electron` or any Electron-only API at runtime.
- [ ] Vue, Pinia, Vue Router, and Vue I18n are acceptable for bundling — none of these are on Obsidian's restricted list.
- [ ] Bundle size is reasonable. Run `npm run build` and check `main.js` size. Obsidian does not enforce a hard limit, but very large bundles slow plugin load.

---

## Desktop and mobile scope

`isDesktopOnly: true` is set correctly. The plugin uses the Obsidian `vault.adapter` filesystem API through `ObsidianBridge`, which is not available on Obsidian mobile.

**Mobile support is out of scope for v1.** If mobile support is added later:

- Replace direct filesystem calls with `vault.read` / `vault.modify` / `vault.create` (cross-platform Obsidian API).
- Re-test `IBridge` against the mobile adapter.
- Set `isDesktopOnly: false` only after passing manual tests on iOS or Android.

---

## Manual test expectations

Run the following before opening a release candidate. No automated test covers the Obsidian runtime; these must be done manually.

### Required (desktop)

- [ ] Plugin loads without errors on the minimum supported Obsidian version (`minAppVersion` in `manifest.json`).
- [ ] Plugin loads without errors on the latest stable Obsidian release.
- [ ] Ribbon icon appears and opens the Specorator panel.
- [ ] Command palette entry `Open Specorator panel` works.
- [ ] Settings tab opens and saves settings correctly (specs folder, archive folder, gate strictness, team mode).
- [ ] Creating a feature writes `specs/{slug}/workflow-state.md` with correct frontmatter.
- [ ] Advancing a stage creates the correct stage artifact file.
- [ ] Existing files are not overwritten silently — a notice is shown.
- [ ] Plugin unloads cleanly (no leaked views, intervals, or event listeners).
- [ ] No `console.error` output during normal operation.

### Recommended (desktop)

- [ ] Test in a vault with an existing `specs/` folder from a previous session — no data loss.
- [ ] Test with a custom `specsFolder` setting — artifacts appear in the configured path.
- [ ] Test with `gateStrictness: strict` — advancement is blocked when required artifacts are missing.
- [ ] Verify `styles.css` loads and the UI renders correctly after a cold install (no prior CSS cache).

---

## Pre-release checklist

Run this checklist before tagging any release candidate.

### Versioning

Versioning is automated via `npm version <patch|minor|major>`, which:

1. Bumps `package.json` → `version`.
2. Runs `version-bump.js` (via the `version` npm hook) — bumps `manifest.json` → `version` and adds an entry to `versions.json` for the new version → its `minAppVersion`.
3. Stages `manifest.json` and `versions.json`.
4. Commits the bump and creates a tag with the plain semver string (e.g. `0.1.0`, **never** `v0.1.0` — `.npmrc` sets `tag-version-prefix=""`).

Manual checklist before pushing the tag to `main`:

- [ ] `manifest.json` → `version` matches `package.json` → `version`.
- [ ] `versions.json` contains an entry for the new version mapping it to the current `minAppVersion`.
- [ ] Local tag is plain semver, no `v` prefix (e.g. `0.1.0`).
- [ ] Tag points at the `main` HEAD commit (the release workflow rejects tags not on `main` HEAD).

The release workflow re-checks all three files at run time and refuses to publish on any mismatch.

### Automated checks

- [ ] `npm run typecheck` — zero errors.
- [ ] `npm run lint` — zero errors.
- [ ] `npm run test` — all tests pass.
- [ ] `npm run build` — plugin bundle builds without warnings.
- [ ] `npm run docs:api` — TypeDoc generates without errors.
- [ ] `npm audit` — no high/critical vulnerabilities.

### Release artifacts

- [ ] `main.js` present and reflects the current build.
- [ ] `manifest.json` present with correct version.
- [ ] `styles.css` present and not empty.
- [ ] No development-only files included in the release (e.g. `*.map` if sourcemaps should be excluded, `node_modules/`).

### Manual tests

- [ ] All required manual tests above pass on `minAppVersion`.
- [ ] All required manual tests above pass on the latest Obsidian release.

### Documentation

- [ ] README describes the current feature set accurately — no overpromised features.
- [ ] README includes installation or sideload instructions.
- [ ] CHANGELOG or release notes describe changes since the last release.

---

## Known marketplace blockers (v1 alpha)

The following items must be resolved before a marketplace submission PR can be opened:

| # | Blocker | Tracking |
|---|---|---|
| 1 | Plugin is not yet feature-complete (v1 alpha scope not finished) | #1 |
| 2 | README does not yet include installation or sideload instructions | #3, #10 |
| 3 | No CHANGELOG exists yet | #8 |
| 4 | ~~Release tag convention, `versions.json`, and release-build settings still need reconciliation before public submission~~ — resolved: tag pattern is plain semver, `versions.json` is committed, `npm version <bump>` automates the bump via `version-bump.mjs`, release workflow validates manifest + package + versions.json against tag | #8 |
| 5 | Pre-feature architecture readiness work should be broken into focused implementation plans before v1 feature delivery accelerates | docs/pre-feature-architecture-readiness.md |

Marketplace submission is planned after the v1 alpha milestone is reached. Track submission readiness in #20.

---

## Reuse

This checklist should be reviewed and updated before each release candidate. Add new items as the plugin grows — particularly when network access, credential storage, or mobile support is introduced.
