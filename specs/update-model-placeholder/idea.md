---
id: IDEA-UMP-001
title: "Update model placeholder — installed version tracking"
stage: idea
feature: update-model-placeholder
status: accepted
owner: pm
created: 2026-05-02
updated: 2026-05-02
---

## Problem statement

Specorator installs agentic-workflow template content into the user's vault. As the template evolves, users need a way to know which version they installed and whether a newer version is available. Without recording the installed version at install time, there is no baseline for any future update or migration logic. v1 must at least record the version; the full update flow is deferred to a later release.

## Primary users

- **Existing users** who want to know if their installed workflow is outdated.
- **Plugin developers** who need a stable version field to target when building the future update service.
- **Support conversations** where knowing the installed template version is the first diagnostic question.

## Success criteria

- After a successful template installation, the plugin records the installed template version in `workflow-state.md` or plugin settings.
- The plugin settings panel displays the installed template version.
- A clear "update available" indicator or message is shown if the installed version differs from the latest known version (detection mechanism deferred — placeholder UI only in v1).
- The version record format is documented so future migration code can rely on it.

## Constraints

- The version record must use the plugin settings (`PluginSettings`) or a dedicated metadata field; must not require parsing all vault files.
- Must not implement automatic download or file replacement in v1.
- The "update available" check in v1 can be a static comparison or a simple stub — no live network call required.

## Research questions

- Where should the installed template version be stored: `PluginSettings`, a dedicated `specorator-meta.md` file, or a frontmatter field in a root-level manifest?
- What versioning scheme does the agentic-workflow template use (semver, date-based, commit hash)?
- Should the update check be a network call (GitHub releases API) or a bundled latest-version constant?

## Preliminary scope

**In scope:** Installed-version recording in `PluginSettings`; settings panel display; placeholder "check for updates" UI element (disabled or stubbed in v1); version format documentation.

**Out of scope:** Automatic update download; file diff and merge; rollback support; network calls to GitHub releases API (deferred to post-v1-alpha per #1).
