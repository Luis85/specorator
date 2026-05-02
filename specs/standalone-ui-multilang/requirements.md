---
id: PRD-SUI-001
title: Standalone UI, multilang support, and DDD plugin architecture
stage: requirements
feature: standalone-ui-multilang
status: accepted
owner: pm
inputs:
  - IDEA-SUI-001
created: 2026-05-01
updated: 2026-05-01
---

## Summary

The Specorator plugin UI must be runnable without an Obsidian runtime for local development and automated testing. The plugin must support multiple languages via runtime locale switching. The codebase must follow Domain-Driven Design with clean layer separation, Obsidian plugin best practices, and Vue 3 composition API patterns.

## Goals

- Eliminate Obsidian as a hard dependency for UI development and testing.
- Ship English and German localisations for all user-visible strings.
- Establish a sustainable, layered architecture that scales to v2.0 agent features.

## Non-goals

- Automatic locale detection from the OS or browser.
- Languages beyond EN and DE in v1.
- SSR or server-side rendering of any kind.
- Replacing Obsidian's native settings tab for core plugin preferences.

---

## Functional requirements (EARS)

### REQ-SUI-001

**Pattern:** ubiquitous
**Statement:** The plugin UI shall be mountable as a standalone Vite application in a regular browser without importing any Obsidian API modules.
**Acceptance:**
- Running `npm run dev` starts a Vite dev server that renders the full UI in a browser.
- The standalone entry point (`src/ui/main.ts`) has zero static imports from the `obsidian` package.
- The browser console shows no "obsidian is not defined" or equivalent errors.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-002

**Pattern:** ubiquitous
**Statement:** The plugin shall isolate all Obsidian API calls behind a typed `IBridge` interface so that UI components and domain logic have no direct Obsidian dependencies.
**Acceptance:**
- `IBridge` declares all vault read/write, file listing, navigation, notice, and settings operations.
- No file under `src/domain/`, `src/application/`, or `src/ui/` imports from the `obsidian` package.
- `ObsidianBridge` implements `IBridge` and is the sole file that imports from `obsidian` in production code.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-003

**Pattern:** ubiquitous
**Statement:** The plugin shall provide a `MockBridge` implementation that fulfils `IBridge` using in-memory storage so that tests and the standalone dev server operate without a vault.
**Acceptance:**
- `MockBridge` stores files in a `Map<string, string>` and folders in a `Set<string>`.
- `MockBridge` exposes `getNotices()` and `getAllFiles()` test-helper methods.
- Dev fixtures (`DEV_FIXTURES`) seed three representative feature states (active, draft, archived).
- All 24 Vitest unit tests pass using `MockBridge` without an Obsidian process.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-004

**Pattern:** ubiquitous
**Statement:** The plugin UI shall support runtime locale switching via `vue-i18n` with English (`en`) and German (`de`) as the initial supported locales.
**Acceptance:**
- All user-visible strings are sourced from locale files under `src/ui/i18n/locales/`.
- Switching locale in the Settings view immediately re-renders all visible labels without a page reload.
- The fallback locale is `en`; untranslated DE keys fall back to EN silently.
- No hardcoded English strings appear in `.vue` files or composables (excluding HTML attributes like `type`).
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-005

**Pattern:** event-driven
**Statement:** When the user changes the locale in Settings and saves, the plugin shall persist the chosen locale to plugin settings and apply it on the next panel open.
**Acceptance:**
- `saveSettings` is called with the updated `locale` field when the user saves Settings.
- On subsequent panel open, the stored locale is loaded and passed to `setLocale()` before the Vue app mounts.
- A round-trip test (save DE, reload bridge settings, assert locale is `de`) passes.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-006

**Pattern:** ubiquitous
**Statement:** The codebase shall follow a four-layer Domain-Driven Design structure with enforced import direction: domain ← application ← infrastructure ← UI.
**Acceptance:**
- `src/domain/` contains only pure TypeScript with no framework or Obsidian imports.
- `src/application/` imports only from `src/domain/` and framework-agnostic utilities.
- `src/infrastructure/` imports from `src/domain/` and `src/application/` only; never from `src/ui/`.
- `src/ui/` may import from any inner layer but not vice versa.
- A linting rule or architecture test documents and enforces this boundary.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-007

**Pattern:** ubiquitous
**Statement:** The plugin UI shall use Vue 3 Composition API (`<script setup>`), Pinia for global state, and Vue Router for panel navigation.
**Acceptance:**
- All `.vue` files use `<script setup lang="ts">` syntax; no Options API components.
- Pinia stores hold only plain DTO objects (no domain class instances).
- Vue Router uses hash history (`createWebHashHistory`) to remain compatible with Obsidian's iframe renderer.
- Composables inject `IBridge` via Vue's `provide/inject` mechanism, not via direct import.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

### REQ-SUI-008

**Pattern:** ubiquitous
**Statement:** The plugin shall include a `Result<T, E>` type for all operations that can fail, so that error handling is explicit and exceptions are never swallowed silently.
**Acceptance:**
- `Result<T, E>` is a discriminated union with `ok: true` and `ok: false` branches.
- All use case `execute()` methods return `Promise<Result<T>>`.
- No use case throws an unhandled exception; all error paths return `err(...)`.
**Priority:** must
**Satisfies:** IDEA-SUI-001

---

## Non-functional requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-SUI-001 | Performance | UI initial render after `npm run dev` | < 500 ms (Vite HMR) |
| NFR-SUI-002 | Test coverage | Domain + application layer unit test coverage | ≥ 80 % lines |
| NFR-SUI-003 | Type safety | `vue-tsc --noEmit` reports zero errors | 0 errors |
| NFR-SUI-004 | Build size | Plugin CJS bundle (`dist/main.js`) | < 2 MB |
| NFR-SUI-005 | Compatibility | Standalone UI runs in Chromium 120+ | No polyfills required |

---

## Quality gate

- [ ] `npm run dev` opens a working UI in a browser without Obsidian
- [ ] `npm test` — all tests pass, zero skipped
- [ ] `npm run type-check` — zero TypeScript errors
- [ ] `npm run build:plugin` — produces `dist/main.js` without build errors
- [ ] No `.vue` file or composable imports from `obsidian`
- [ ] EN and DE locales cover all user-visible strings
- [ ] All use cases return `Result<T>` and have at least one unit test
