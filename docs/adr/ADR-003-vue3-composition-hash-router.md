---
id: ADR-003
title: Vue 3 Composition API (script setup) and hash-mode router
status: accepted
date: 2026-05-01
---

# ADR-003 — Vue 3 Composition API (`<script setup>`) and hash-mode router

## Decision

All Vue components use `<script setup>` (Composition API). Options API is not used.

Vue Router is configured with `createWebHashHistory` (hash-based URLs).

## Rationale

**`<script setup>`:**
- Better TypeScript inference than Options API.
- Smaller compiled output; no `defineComponent` wrapper needed.
- ESLint rule `vue/component-api-style: ['error', ['script-setup']]` enforces this across the codebase.

**Hash-mode router:**
- Obsidian renders the plugin UI in an `<iframe>` or a custom `ItemView` container that does not expose a real browser navigation stack.
- Hash-based routing (`/#/features`, `/#/settings`) works in any embedded context without requiring server-side routing support.
- The standalone dev server and GitHub Pages deployment both work with hash routing out of the box.

## Consequences

- All new components must use `<script setup>`. PRs with Options API will fail the ESLint check.
- Deep-linking in the standalone browser dev mode uses hash fragments; this is expected and not a defect.
- If Obsidian ever exposes a proper navigation API, the router history strategy can be swapped in `src/ui/router/index.ts` without touching any component.
