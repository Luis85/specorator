---
id: ADR-015
title: Implement the onboarding wizard as a Vue Router route inside SpecoratorView
status: accepted
date: 2026-05-12
deciders:
  - architect
consulted:
  - ux-designer
  - ui-designer
  - pm
informed:
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [routing, onboarding, vue, ux]
---

# ADR-015 — Implement the onboarding wizard as a Vue Router route inside SpecoratorView

## Status

Accepted

## Context

The onboarding wizard must auto-open on first load without any user action (REQ-POB-001). The plugin already renders all UI inside a single `SpecoratorView` Obsidian leaf panel using Vue Router in hash mode (ADR-003). The question is how to host the five-step wizard: as a dedicated panel route, as a full-screen modal overlay, or as a separate Obsidian leaf.

Research (RESEARCH-POB-001 §Q2) recommends against a blocking modal because Obsidian's event loop can be disrupted by `window.confirm` / `window.alert` (already forbidden by `no-restricted-globals`), and a custom modal that covers the entire workspace creates a jarring first impression. A separate leaf would require additional view type registration and lifecycle management.

## Decision

We add `/onboarding` as a sibling route of `/home` inside the existing Vue Router configuration. The wizard renders inside `SpecoratorView` using `<RouterView>` — the same rendering path used by every other view in the plugin.

The auto-open sequence is:
1. `onLayoutReady` in `main.ts` calls `this.activateView()` when `onboardingComplete` is absent or `false`.
2. `activateView()` opens the `SpecoratorView` panel (existing code path, no change to signature).
3. `OnboardingWizard.vue` at the `/onboarding` route runs an `onMounted` guard that pushes `/onboarding` if the current route is not already `/onboarding` and `onboardingComplete` is `false` (REQ-POB-002).

The wizard occupies the full SpecoratorView content area while active. Navigation back to `/home` is triggered programmatically when the user completes or closes the wizard.

## Considered options

### Option A — Router route at `/onboarding` inside SpecoratorView (chosen)
- Pros: Reuses existing router, view registration, and Vue app lifecycle; no new Obsidian modal class; navigation is programmatic and fully controlled; compatible with MockBridge and LocalStorageBridge; keyboard-accessible without additional work.
- Cons: The wizard shares the panel with other routes; a back-navigation button must be intentionally omitted to prevent the user escaping to an unconfigured home view (mitigated: wizard has no back affordance per UX spec).

### Option B — Obsidian Modal subclass
- Pros: Visually distinct from the main panel; familiar Obsidian pattern for confirmation dialogs.
- Cons: Modals are blocking and cover Obsidian's workspace, creating anxiety on first install; does not reuse Vue Router or existing component infrastructure; requires custom DOM construction with `createEl` (no `<script setup>` components inside a modal unless the Vue app is remounted); REQ-POB-027 (MockBridge compatibility) is harder to satisfy.

### Option C — Separate Obsidian leaf (second panel)
- Pros: Visually isolated.
- Cons: Two leaf registrations add complexity; teardown coordination between wizard leaf and main panel is error-prone; no precedent in the plugin's existing codebase.

## Consequences

### Positive
- Zero new Obsidian API calls beyond the existing `activateView()`.
- The wizard is testable with the existing Vue test mount utilities and `fakeModulePorts()`.
- Hash-mode routing means `/onboarding` survives Obsidian's embedded iframe context and the GitHub Pages demo without server-side routing.

### Negative
- The `/onboarding` route is always present in the router; guarding against direct navigation (e.g. from a stored hash URL) requires the `onMounted` guard in `OnboardingWizard.vue` and a complementary guard that redirects `/onboarding` to `/home` when `onboardingComplete` is `true`.

### Neutral
- The `onLayoutReady` callback in `main.ts` is extended with a conditional check. This is the established pattern for deferred plugin logic (the callback already contains `detectLegacyVaultLayout()`).

## Compliance

- Vue Router configuration file must export a route with `path: '/onboarding'` and `component: OnboardingWizard`.
- `main.ts` `onLayoutReady` must gate the `activateView()` call on `!this.settings.onboardingComplete`.
- The `onMounted` guard in `OnboardingWizard.vue` must use `useRouter().push('/onboarding')` and must not use `window.location` or `history.pushState` directly.
- ESLint `vue/component-api-style` must report zero violations on `OnboardingWizard.vue`.

## References

- ADR-003 (Vue conventions — hash-mode router)
- RESEARCH-POB-001 §Q2 (auto-open mechanism)
- REQ-POB-001 (auto-open wizard on first load)
- REQ-POB-002 (wizard self-routes on mount)
- REQ-POB-027 (wizard works in MockBridge)
- DESIGN-POB-001 Part A §A2

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
