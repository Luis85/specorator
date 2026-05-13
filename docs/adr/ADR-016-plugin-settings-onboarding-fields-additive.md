---
id: ADR-016
title: Add userPersona and onboardingComplete to PluginSettings as additive fields
status: accepted
date: 2026-05-12
deciders:
  - architect
consulted:
  - pm
informed:
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [settings, onboarding, compatibility]
---

# ADR-016 — Add userPersona and onboardingComplete to PluginSettings as additive fields

## Status

Accepted

## Context

The onboarding wizard needs two new values persisted across plugin restarts: `userPersona` (a free-text string the user enters) and `onboardingComplete` (a boolean flag preventing the wizard from auto-opening on subsequent loads). Both must be persisted via the existing `SettingsPort.saveSettings()` mechanism, which writes to the `specorator` sub-key of Obsidian's plugin data.

The `PluginSettings` interface is the canonical domain type for all plugin configuration. Adding to it has two risks: (1) breaking existing consumers that depend on the type shape, and (2) presenting a default that causes the wizard to auto-open for users who already have a functioning installation.

## Decision

We add two fields to the `PluginSettings` interface in `src/domain/settings/PluginSettings.ts`:

```ts
readonly userPersona: string       // default: ''
readonly onboardingComplete: boolean  // default: false
```

We add matching entries to `DEFAULT_SETTINGS`:

```ts
userPersona: '',
onboardingComplete: false,
```

No existing field is altered. The `readonly` modifier is preserved on both new fields, consistent with the rest of the interface.

The `loadSettings` path in `main.ts` already merges `DEFAULT_SETTINGS` with the stored blob (`{ ...DEFAULT_SETTINGS, ...storedData.specorator }`). This means:
- Users upgrading from a version without these fields will get `userPersona: ''` and `onboardingComplete: false` as defaults on first load after upgrade.
- `onboardingComplete: false` causes the wizard to auto-open once for existing users on upgrade. This is intentional: it gives existing users a one-time walk-through of new onboarding features, after which they can complete the wizard or close it (the wizard remains non-destructive at every step).

## Considered options

### Option A — Additive fields on PluginSettings (chosen)
- Pros: Consistent with existing settings shape; SettingsPort handles persistence transparently; no migration script needed; TypeScript enforces the contract at every call site.
- Cons: Existing users will see the wizard once on upgrade (accepted: one-time, non-destructive).

### Option B — Separate settings namespace (e.g. `onboarding` sub-key in stored data)
- Pros: Isolates onboarding state from core plugin settings; does not affect existing `PluginSettings` consumers.
- Cons: Requires a new port or a new sub-key read path that bypasses `SettingsPort`; the wizard would need a different save mechanism from all other settings, creating two divergent data paths; adds complexity for no gain given the small number of fields.

### Option C — Store onboarding state in a vault file (`specs/.onboarding-state.md`)
- Pros: Onboarding state lives with the vault it pertains to.
- Cons: Reading vault files at plugin startup (before `onLayoutReady`) is unsafe; vault operations require `VaultPort` which is an async dependency; introduces a new file format for a boolean flag where settings already serve this purpose; complicates testing.

## Consequences

### Positive
- `SettingsPort.saveSettings()` and `SettingsPort.getSettings()` work without modification.
- The `fakeModulePorts()` test factory returns a `MockBridge` that already merges `DEFAULT_SETTINGS`, so tests get the new defaults for free.
- `npm run typecheck` enforces that every `PluginSettings` consumer either sets the new fields or uses the default (which TypeScript satisfies via the spread in `loadSettings`).

### Negative
- Existing users see the wizard once on upgrade (accepted; see Decision rationale above).
- `DEFAULT_SETTINGS` now has two additional fields; any code that constructs a `PluginSettings` object manually (e.g. in tests) must supply values or use the spread pattern.

### Neutral
- The fields are `readonly` — mutation goes through `updateSettings()` as with all other settings, producing an immutable merged object.

## Compliance

- `npm run typecheck` must pass with the new interface fields.
- `npm run test` must pass; no existing test that depends on `DEFAULT_SETTINGS` may fail. Tests that assert the full shape of `DEFAULT_SETTINGS` must be updated to include the new fields.
- REQ-POB-025 acceptance criteria (additive only, no existing field type or default changed) must be verified by the QA agent.

## References

- REQ-POB-025 (PluginSettings additions are additive only)
- REQ-POB-006 (persona saved via SettingsPort)
- REQ-POB-014 (onboardingComplete set to true on Step 5)
- REQ-POB-023, REQ-POB-024 (re-run setup resets onboardingComplete to false)
- DESIGN-POB-001 Part C

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
