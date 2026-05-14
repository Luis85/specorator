---
id: ADR-0028
title: Store the Anthropic API key in the top-level plugin settings blob, not in a module settings sub-key
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, settings, security, api-key]
---

# ADR-0028 — Store the Anthropic API key in the top-level plugin settings blob, not in a module settings sub-key

## Status

Accepted

## Context

Specorator stores plugin configuration in a nested data blob written by Obsidian's
`this.saveData()`. The blob structure is:

```
{
  specorator: { ...PluginSettings },    // top-level plugin settings
  <moduleKey>: { ...ModuleSettings },   // per-module sub-keys (iterated by PluginCore)
  _moduleVersions: { ... }
}
```

The `ClaudeCliAdapter` is instantiated in `main.ts` before `PluginCore` loads its
modules. It receives a `getSettings: () => PluginSettings` getter and reads
`settings.anthropicApiKey` at call time.

Two placement options were evaluated for `anthropicApiKey`:

1. **Inside a module settings sub-key** (e.g., `_storedData['chat'].anthropicApiKey`).
2. **Inside the top-level `specorator` blob** (i.e., `PluginSettings.anthropicApiKey`).

## Decision

`anthropicApiKey` is a field of `PluginSettings` stored in the `specorator` sub-key of
the plugin data blob. It is not placed under any module's settings sub-key.

The settings tab field writes the trimmed value via `plugin.updateSettings({ anthropicApiKey })`,
which persists to `_storedData.specorator`. The adapter reads the key through the
`getSettings()` closure that returns `plugin.settings` (the merged, validated value).

## Considered options

### Option A — Top-level PluginSettings (chosen)

- Pros: accessible to `ClaudeCliAdapter` before modules load; consistent with how
  `specsFolder`, `logLevel`, and other plugin-wide fields are stored; the settings tab
  naturally groups all top-level fields together; no coupling between module lifecycle
  and the adapter.
- Cons: `PluginSettings` grows by one field (`anthropicApiKey`); the security notice
  about Obsidian Sync applies to any key in the blob (Obsidian Sync syncs the entire
  plugin data blob).

### Option B — Module settings sub-key

- Pros: logically groups chat-related settings.
- Cons: requires `ClaudeCliAdapter` to depend on the module registry being fully loaded,
  creating a startup-ordering risk; `PluginCore.notifySettingsChanged` would need to be
  called to persist the key, adding indirection; settings-version bumping (`bumpSettingsVersion`)
  would need to observe module settings changes, not just top-level plugin settings.

## Consequences

### Positive

- `ClaudeCliAdapter` can be instantiated and its `getSettings()` getter called at any
  point in the plugin lifecycle without ordering dependencies on `PluginCore`.
- The settings tab uses the same `plugin.updateSettings(partial)` path used for all
  other top-level fields, requiring no special-case code.
- `bumpSettingsVersion()` in `SpecoratorView` is called from the settings tab's
  `onChange` handler for the API key field only, keeping the reactivity surface narrow.

### Negative

- `PluginSettings` now carries a security-sensitive field. The interface comment and
  settings-tab description must both note the Obsidian Sync disclosure (REQ-CCS-028).
- The field ships with a default of `''` in `DEFAULT_SETTINGS`, so any consumer that
  reads `settings.anthropicApiKey` without checking for empty string will silently
  receive the empty value (acceptable — adapters already guard for empty key).

### Neutral

- A future per-device key store (RISK-CCS-006 mitigation) would supersede this ADR and
  move the key out of the synced blob entirely.

## Compliance

- `PluginSettings.ts` must include the `anthropicApiKey` field with a comment referencing
  REQ-CCS-001, REQ-CCS-002, NFR-CCS-005, NFR-CCS-006.
- The settings tab input must use `type = 'password'` and `autocomplete = 'off'`
  (NFR-CCS-006).
- `LoggerPort` calls in `ClaudeCliAdapter` must never include the key value
  (NFR-CCS-005).
- The settings tab description must mention Obsidian Sync (REQ-CCS-028).

## References

- PRD-CCS-001 REQ-CCS-001, REQ-CCS-002, REQ-CCS-028, NFR-CCS-005, NFR-CCS-006
- `src/domain/settings/PluginSettings.ts`
- `src/infrastructure/obsidian/ClaudeCliAdapter.ts`
- `src/plugin/main.ts` (adapter instantiation and settings getter)
- `src/plugin/SpecoratorView.ts` (`bumpSettingsVersion`)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
