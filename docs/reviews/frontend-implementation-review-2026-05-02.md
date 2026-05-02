---
title: Frontend implementation review
doc_type: review
status: draft
owner: codex
reviewed_at: 2026-05-02
scope:
  - src/ui
  - src/infrastructure
  - src/application/feature
---

# Frontend implementation review

This review covers the current Vue frontend, standalone browser bridge behavior,
and the Obsidian bridge integration points.

## Findings

### 1. Standalone development cannot exercise file opening

`src/ui/main.ts` uses `MockBridge` in development, but
`src/infrastructure/mock/MockBridge.ts` implements `openFile()` as a no-op. The
browser development UI therefore cannot navigate to the file viewer when a user
clicks **Open** on an active feature.

Impact: the standalone development path misses a core workflow required by the
GitHub Pages UI spec, and regressions in `FileView` are easy to miss locally.

Suggested fix: make `MockBridge.openFile()` dispatch the same `sp:open-file`
event as `LocalStorageBridge.openFile()`, or use `LocalStorageBridge` for a
manual persistence/dev mode.

### 2. File-view routing path encoding (verified — not an issue)

Initial review flagged `src/ui/App.vue` passing `encodeURIComponent(path)` to a
named Vue Router param (`/file/:encodedPath`) as a potential double-encoding
bug. Re-verification against Vue Router 4 behavior: `route.params.encodedPath`
returns the value as `specs%2F...`, and `src/ui/views/FileView.vue` calls
`decodeURIComponent` exactly once before `bridge.readFile(filePath)`, yielding
`specs/...`. Slash-containing paths resolve correctly.

Status: false positive. No fix required. Retained here so the audit trail shows
the claim was investigated and dismissed.

### 3. The frontend does not expose stage advancement

The application layer has `AdvanceFeatureStageUseCase`, but `useFeatures()`
returns only load, create, activate, and archive operations. `FeatureCard.vue`
renders activate, open, and archive actions, but no next-stage action.

Impact: active features cannot progress through the 12-stage lifecycle from the
frontend, even though workflow navigation requires next actions and stage
artifact creation.

Suggested fix: add an `advanceFeatureStage` composable action, render it for
active non-complete features, and update the card/detail UI with the current
stage and next expected artifact.

### 4. Failed feature creation clears user input and closes the form

`CreateFeatureForm.vue` emits `submit` synchronously, then immediately clears
`title` and `area`. The parent views close the form unconditionally after
`createFeature()` returns, even when the use case returns an error such as a
duplicate slug or a vault write failure.

Impact: on recoverable failures, the user loses their typed input and has to
reopen the form before correcting it.

Suggested fix: have the submit event contract return or receive the async result,
or move submit state into the parent so the form is only cleared and closed after
a successful create.

### 5. Progress display is misleading at lifecycle boundaries

`FeatureCard.vue` computes progress width as `(currentStep - 1) / stepCount`.
That shows step 1 as 0% and step 12 as about 92%. The domain model also allows a
feature to advance from step 12 to step 13 before `isComplete` becomes true.

Impact: the visual state under-reports progress, and a completed active feature
can render as "Step 13 of 12".

Suggested fix: clamp the display range and review whether completion should be
represented as step 12 complete, step 13 complete, or a distinct completed
status.

### 6. Global reset leaks into Obsidian

`App.vue` contains a non-scoped global style block with `* { box-sizing:
border-box; }`. In an Obsidian plugin build, emitted CSS is global to the host
document.

Impact: the plugin can affect Obsidian core UI or other plugins. Even if
`box-sizing` is usually benign, this violates the isolation principle already
used for standalone CSS variables.

Suggested fix: scope the reset under `.sp-app` or a dedicated root selector,
for example `.sp-app, .sp-app * { box-sizing: border-box; }`.

### 7. Settings surfaces are incomplete and inconsistent

The shared `PluginSettings` model includes `decisionsFolder` and
`constitutionFile`, but the Vue settings view only exposes locale, specs folder,
archive folder, gate strictness, and team mode. The native Obsidian settings tab
omits locale, decisions folder, and constitution file.

Impact: settings can exist in the model without a complete editing surface,
making behavior harder to reason about as decision and constitution workflows are
implemented.

Suggested fix: decide which settings belong in the Obsidian-native tab versus
the Vue panel, then make the model and visible surfaces match.

## Verification attempted

The following checks were attempted in the main checkout before this report was
written:

- `npm run typecheck`
- `npm run lint`
- `npm test`

They could not run because dependencies are not installed in the checkout:
`vue-tsc`, `vitest`, and `@eslint/js` were missing from `node_modules`.
