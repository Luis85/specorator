# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run typecheck          # type-check all TypeScript and Vue files
npm run lint               # ESLint
npm run lint:fix           # ESLint with auto-fix
npm run format             # Prettier (write)
npm run format:check       # Prettier (check only)
npm run test               # Vitest once
npm run test:watch         # Vitest watch mode
npm run test:coverage      # Vitest + lcov coverage report
npm run build              # type-check + build Obsidian plugin bundle → project root
npm run dev:plugin         # plugin build in watch mode
npm run build:web          # build standalone browser UI → dist-standalone/
npm run dev                # Vite dev server for standalone browser UI (uses MockBridge)
npm run docs:api           # TypeDoc API docs → docs/api/
```

**Run a single test file:**
```sh
npx vitest run src/domain/feature/__tests__/Feature.spec.ts
```

**Pre-PR verification gate:**
```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api
```

## Architecture

The codebase follows **DDD layered architecture** (ADR-001) with a strict inward-only import direction:

```
domain ← application ← infrastructure ← ui
                                      ↑
                        plugin (owns Obsidian lifecycle, imports all layers)
```

| Layer | Path | Role |
|---|---|---|
| Domain | `src/domain/` | `Feature` aggregate, value objects (`Slug`), `Result<T,E>`, repository interfaces |
| Application | `src/application/` | Use cases (`CreateFeatureUseCase`, `AdvanceFeatureStageUseCase`, etc.) |
| Infrastructure | `src/infrastructure/` | `FeatureRepository`, bridge implementations |
| UI | `src/ui/` | Vue 3 components, Pinia stores, Vue Router, composables |
| Plugin | `src/plugin/` | Obsidian `Plugin` subclass, `SpecoratorView`, settings tab |

### IBridge abstraction (ADR-002)

All Obsidian API calls go through `IBridge` (`src/infrastructure/bridge/IBridge.ts`). Three implementations:

- **`ObsidianBridge`** (`src/infrastructure/obsidian/`) — production, wraps `App` + `Vault`
- **`MockBridge`** (`src/infrastructure/mock/`) — unit tests and `npm run dev`
- **`LocalStorageBridge`** (`src/infrastructure/localstorage/`) — GitHub Pages demo

The bridge is injected via `app.provide(BRIDGE_KEY, bridge)` and consumed in components/stores via `useBridge()`. Vue components must **never** import `obsidian` directly (ESLint `no-restricted-imports` enforces this).

### Result type (ADR-004)

Domain methods and use cases return `Result<T, E>` (`src/domain/shared/Result.ts`) instead of throwing:

```ts
type Result<T, E extends Error = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E }
```

Domain aggregate mutations (`activate`, `advanceStep`, `archive`, `abandon`) all return `Result`. Use case `execute` methods return `Result`. Always check `result.ok` before accessing `result.value`.

### Vault structure (ADR-005)

Features are stored under `specs/{slug}/` (configurable via `specsFolder` setting, default `specs`):

- `workflow-state.md` — YAML frontmatter tracking file, created on feature creation
- `idea.md` — created on feature creation (stage 1)
- `{stage-slug}.md` — created lazily when the user advances to that stage

The 12 stage slugs (from `src/domain/feature/FeatureStep.ts`): `idea`, `research`, `requirements`, `design`, `spec`, `tasks`, `implementation-log`, `test-plan`, `test-report`, `review`, `release-notes`, `retrospective`.

**Overwrite protection (REQ-AVS-005):** if a stage file already exists, the plugin shows a notice and skips creation without overwriting.

### Vue conventions (ADR-003)

- All components use `<script setup>` (Composition API). Options API is not used; ESLint enforces this.
- Vue Router uses `createWebHashHistory` (hash-mode) so routing works inside Obsidian's embedded view and on GitHub Pages.
- Pinia stores hold plain DTOs only — domain class instances must not cross the store boundary.
- UI imports use cases for business logic; UI must not import domain or infrastructure directly except for `BridgeKey` types.

### Key files

- `src/infrastructure/bridge/IBridge.ts` — bridge interface + `PluginSettings` type + `DEFAULT_SETTINGS`
- `src/infrastructure/bridge/FeatureRepository.ts` — serialises/deserialises `workflow-state.md`, creates stage stubs
- `src/domain/feature/Feature.ts` — `Feature` aggregate
- `src/domain/feature/FeatureStep.ts` — `FEATURE_STEPS` array and step metadata helpers
- `src/plugin/main.ts` — Obsidian plugin entry point
- `src/plugin/settings.ts` — settings type (mirrors `IBridge.PluginSettings`) and settings tab
- `src/ui/main.ts` — browser (standalone) entry point, mounts Vue with `MockBridge`

## Development notes

- `npm run dev` opens the full UI in a browser with no Obsidian runtime needed — the recommended environment for UI-focused work.
- Test coverage is collected for `src/domain/**`, `src/application/**`, and `src/infrastructure/**` (excluding `src/infrastructure/obsidian/**`).
- `@` path alias resolves to `src/` in both Vite and Vitest configs.
- The plugin build writes `main.js` to the project root (gitignored). `manifest.json` and `styles.css` are committed.
- New requirements and design decisions follow an intake-first workflow: open a **Requirement intake** or **Design intake** issue, add a draft under `requirements/intake/`, and follow `docs/process/requirements-intake.md` before implementing.
