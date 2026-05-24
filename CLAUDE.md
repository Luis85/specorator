# CLAUDE.md

@AGENTS.md
@memory/constitution.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm run typecheck          # type-check all TypeScript and Vue files
npm run lint               # ESLint
npm run lint:fix           # ESLint with auto-fix
npm run format             # Prettier (write)
npm run format:check       # Prettier (check only)
npm run test               # Vitest unit tests (fast, no browser)
npm run test:storybook     # Storybook/Playwright tests (requires Chromium)
npm run test:all           # unit + storybook combined
npm run test:watch         # Vitest unit watch mode
npm run test:coverage      # unit tests + lcov coverage report
npm run build              # type-check + build Obsidian plugin bundle → project root
npm run dev:plugin         # plugin build in watch mode
npm run build:web          # build standalone browser UI → dist-standalone/
npm run dev                # Vite dev server for standalone browser UI (uses MockBridge)
npm run docs:api           # TypeDoc API docs → docs/api/
```

**Run a single test file:**
```sh
npx vitest run tests/domain/feature/Feature.test.ts
```

**Pre-PR verification gate:**
```sh
npm run verify
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
| Domain | `src/domain/` | Narrow port interfaces, `Result<T,E>`, `PluginSettings`, typed `EventBus`. (The `Feature` aggregate / workflow value objects were removed in the P0 reboot — ADR-PSR-001 — and regrow per phase.) |
| Application | `src/application/` | `FeedbackService`. (Chat/feature use cases removed in P0; regrow per phase.) |
| Infrastructure | `src/infrastructure/` | Three bridges (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) + per-port `InjectionKey`s |
| UI | `src/ui/` | Vue 3 `<script setup>` components (`AgentPanelRoot`, `ErrorBoundary`), the six port composables, i18n. (Router / Pinia chat-feature stores / chat UI removed in P0; regrow per phase.) |
| Plugin | `src/plugin/` | Obsidian `Plugin` subclass (`main.ts`), `AgentSidebarView`, settings tab |

### Narrow ports (ADR-008)

All Obsidian API calls go through six narrow ports declared in `src/domain/ports/`:

- **`SettingsPort`** — `getSettings`, `saveSettings`
- **`VaultPort`** — `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder`
- **`WorkspacePort`** — `openFile`
- **`NotificationPort`** — `showError`, `showWarning`, `showSuccess`, `showInfo` (severity-typed; `showError` defaults to a sticky notice — `durationMs = 0`)
- **`LoggerPort`** — `debug`, `info`, `warn`, `error`. Console-only; never calls `NotificationPort`. Filtered by `PluginSettings.logLevel` (default `warn`) in `ObsidianBridge`. User-facing error notifications go through `NotificationPort`/`FeedbackService`.
- **`CommunityPluginPort`** — `isPluginEnabled(id)`, `listEnabledPluginIds()`. Used by `FeatureAvailabilityService` (REQ-0003) to detect missing community-plugin dependencies.

Three runtime classes implement all six ports:

- **`ObsidianBridge`** (`src/infrastructure/obsidian/`) — production, wraps `App` + `Vault`
- **`MockBridge`** (`src/infrastructure/mock/`) — unit tests and `npm run dev`
- **`LocalStorageBridge`** (`src/infrastructure/localstorage/`) — GitHub Pages demo

Each port has its own `InjectionKey` (`SETTINGS_PORT`, `VAULT_PORT`, `WORKSPACE_PORT`, `NOTIFICATION_PORT`, `LOGGER_PORT`, `COMMUNITY_PLUGIN_PORT` in `src/infrastructure/bridge/ports.ts`) and its own composable (`useSettingsPort`, `useVaultPort`, `useWorkspacePort`, `useNotificationPort`, `useLoggerPort`, `useCommunityPluginPort` in `src/ui/composables/`). Consumers depend on **one port per dependency** — there is no aggregate `usePorts()`. ESLint forbids re-introducing the deleted `IBridge` / `BridgeKey` / `useBridge` symbols.

Vue components must **never** import `obsidian` directly (ESLint `no-restricted-imports` enforces this).

### Result type (ADR-004)

Domain methods and use cases return `Result<T, E>` (`src/domain/shared/Result.ts`) instead of throwing:

```ts
type Result<T, E extends Error = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E }
```

Domain aggregate mutations (`activate`, `advanceStep`, `archive`, `abandon`) all return `Result`. Use case `execute` methods return `Result`. Always check `result.ok` before accessing `result.value`.

### Vault structure (ADR-005)

> **Removed in the P0 reboot (ADR-PSR-001):** the 12-stage workflow engine and
> the `Feature` aggregate were deleted; they regrow per phase. The description
> below is the pre-reboot / future shape, retained for reference.

Features are stored under `specs/{slug}/` (configurable via `specsFolder` setting, default `specs`):

- `workflow-state.md` — YAML frontmatter tracking file, created on feature creation
- `idea.md` — created on feature creation (stage 1)
- `{stage-slug}.md` — created lazily when the user advances to that stage

The 12 stage slugs (from `src/domain/feature/FeatureStep.ts`): `idea`, `research`, `requirements`, `design`, `spec`, `tasks`, `implementation-log`, `test-plan`, `test-report`, `review`, `release-notes`, `retrospective`.

**Overwrite protection (REQ-AVS-005):** if a stage file already exists, the plugin shows a notice and skips creation without overwriting.

### Vue conventions (ADR-003)

- All components use `<script setup>` (Composition API). Options API is not used; ESLint enforces this.
- Vue Router was removed in the P0 reboot (no routed views yet); it regrows with `createWebHashHistory` if a later phase needs multi-surface in-app navigation.
- Pinia stores hold plain DTOs only — domain class instances must not cross the store boundary.
- UI imports use cases for business logic; UI must not import domain or infrastructure directly except for port types from `@/domain/ports` and the matching InjectionKey symbols from `@/infrastructure/bridge/ports`.

### DOM construction

Plugin code must not call `window.confirm` / `window.alert` / `window.prompt`. These block Obsidian's event loop and look out of place in the plugin UI. Use an Obsidian `Modal` subclass (`new (class extends Modal { onOpen() { /* … */ } })(app).open()`) for confirmation and input flows, and use `NotificationPort` for non-blocking feedback. Enforced project-wide by `no-restricted-globals`; tests, `LocalStorageBridge` (GitHub Pages demo), and Storybook are scoped out via overrides.

Plugin code must not assign `innerHTML` / `outerHTML` / `insertAdjacentHTML`, and Vue templates must not use `v-html`. Build DOM with Obsidian helpers `createEl` / `createDiv` / `setText` (or `textContent` for raw DOM), which are XSS-safe by construction. Enforced by `no-restricted-properties` (TS/JS) and `vue/no-v-html` (templates), both at error severity.

### Testing conventions (ADR-009)

- Tests live under `tests/`, mirroring `src/` path-for-path. The test for `src/x/y.ts` is `tests/x/y.test.ts`. The `.test.ts` extension is canonical; `.spec.ts` is no longer used. `__tests__/` folders inside `src/` are forbidden.
- The shared fake-ports factory `tests/__fakes__/fake-ports.ts` exposes `fakeModulePorts()` returning the five ADR-008 ports plus a fresh `EventBus`, a `TranslationPort` stub, and the underlying `MockBridge` reference (and `metadataCache` / `canvas` mocks for W13 ports). Mutations through one port are visible through the others. Use it for any test that needs more than one port.
- Vue component tests that mount a component MUST have a co-located class-based PageObject (e.g. `Home.po.ts` next to `Home.test.ts`). Elements are queried exclusively by `data-testid`. CSS-class and id selectors (`.foo`, `#bar`) are forbidden in `tests/**`; ESLint enforces this.
- `npm run test:coverage` enforces hard thresholds 80/70/80/80 (statements/branches/functions/lines). The threshold gate runs as part of `npm run verify`, so CI inherits it automatically.

### Key files

- `src/domain/ports/` — the six narrow port interfaces (SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, CommunityPluginPort) + TranslationPort
- `src/application/shared/FeedbackService.ts` — composable-layer side-effect emitter wrapping LoggerPort + NotificationPort
- `src/ui/components/ErrorBoundary.vue` — wraps the mounted root; logs + notifies before swallowing component errors
- `src/domain/settings/PluginSettings.ts` — `PluginSettings` (`{ locale, logLevel }`) + `DEFAULT_SETTINGS`
- `src/infrastructure/bridge/ports.ts` — per-port InjectionKey symbols (six core)
- `src/plugin/main.ts` — Obsidian plugin entry point (boots one empty agent sidebar)
- `src/plugin/AgentSidebarView.ts` — `ItemView` (`VIEW_TYPE_AGENT`) mounting `AgentPanelRoot` in `ErrorBoundary`
- `src/ui/agent/AgentPanelRoot.vue` — the empty P0 agent panel
- `src/plugin/settings.ts` — settings tab (module-schema loop over the two `coreSettingsModule` dropdowns)
- `src/ui/main.ts` — browser (standalone) entry point, mounts `AgentPanelRoot` with `MockBridge`

> **P0 reboot (ADR-PSR-001):** the feature/workflow/chat/MCP/onboarding surface
> was removed and regrows per phase on the `next` integration branch. Settings
> persist to the device-local store (ADR-PSR-002), never `data.json`.

## Branching model

| Branch | Purpose |
|---|---|
| `develop` | Integration branch. All feature branches cut from and merged back here. Default branch. |
| `demo` | Preview branch. GitHub Pages deploys from here (not from `main`). |
| `main` | Stable release gate. Only merges from `develop`; triggers plugin release on tag. |

- **Cut all feature branches from `develop`**, not from `main`.
- **Open PRs targeting `develop`**.
- To publish a preview: PR `develop` → `demo`.
- To cut a release: PR `develop` → `main`, merge, then tag `main` HEAD with the plain semver version `X.Y.Z` (no `v` prefix — Obsidian marketplace requires tag to equal `manifest.json` version exactly). Use `npm version <bump>` to keep `manifest.json`, `package.json`, `versions.json`, and the tag in sync.
- Never push directly to `main` or tag from any branch other than `main`.

CI runs on push/PR to `develop`, `demo`, `main`, and `next` (the P0 reboot integration branch). GitHub Pages deploys only on push to `demo`.

## Spec-first gate (Phase 4)

**No Phase 4 feature implementation branch may be opened** until the feature has:

1. `specs/{slug}/idea.md` — accepted by the PM role
2. `specs/{slug}/workflow-state.md` — canonical ADR-005 schema, correct stage
3. Requirements accepted (or explicit PM sign-off to proceed from idea directly)

Current Phase 4 spec entries in `specs/`:
- `template-installation-service` — idea stage
- `workflow-navigation-ui` — idea stage
- `artifact-creation-scaffolding` — idea stage
- `agent-interaction-placeholder` — idea stage
- `update-model-placeholder` — idea stage
- `claude-cli-chat-sidebar` — idea stage
- `specorator-agent-orchestrator` — idea stage

See `CONSTITUTION.md` §3 and `decisions/DEC-001` for rationale.

## Development notes

- `npm run dev` opens the full UI in a browser with no Obsidian runtime needed — the recommended environment for UI-focused work.
- Test coverage is collected for `src/domain/**`, `src/application/**`, and `src/infrastructure/**` (excluding `src/infrastructure/obsidian/**`).
- `@` path alias resolves to `src/` in both Vite and Vitest configs.
- The plugin build writes `main.js` to the project root (gitignored). `manifest.json` and `styles.css` are committed.
- New requirements and design decisions follow an intake-first workflow: open a **Requirement intake** or **Design intake** issue, add a draft under `requirements/intake/`, and follow `docs/process/requirements-intake.md` before implementing.

## Specorator workflow

Two entry points for the lifecycle (Stages 1–11):

- **Conversational (recommended):** say "let's start a feature" or "drive this end-to-end" — the `orchestrate` skill gates with `AskUserQuestion` and dispatches the right `/spec:*` command per stage.
- **Manual:** `/spec:start` → `/spec:idea` → `/spec:research` → `/spec:requirements` → `/spec:design` → `/spec:specify` → `/spec:tasks` → `/spec:implement` → `/spec:test` → `/spec:review` → `/spec:release` → `/spec:retro`. Optional gates: `/spec:clarify`, `/spec:analyze`.

State lives in `specs/<feature-slug>/workflow-state.md`. Slash commands update it on stage completion — don't edit by hand mid-workflow.

Opt-in tracks: Discovery (`/discovery:start`), Stock-taking (`/stock-taking:start`), Sales (`/sales:start`), Project Manager (`/project:start`), Roadmap (`/roadmap:start`), Portfolio (`/portfolio:start`), Quality Assurance (`/quality:start`), Project Scaffolding (`/scaffold:start`), Design (`/design:start`), Issue-breakdown (`/issue:breakdown`), Issue-draft (`/issue:draft`), Issue-tackle (`/issue:tackle`), Specorator Improvement (`/specorator:update`).

### Claude Code conventions

- Subagents are project-scoped (`.claude/agents/`) with intentionally narrow tool lists. Missing tool = feature, not bug.
- Skills live in `.claude/skills/` — auto-trigger from natural language; explicit invoke via `/<skill-name>`.
- Topic branches live in worktrees under `.worktrees/<slug>/`. See [`docs/worktrees.md`](docs/worktrees.md).
- Where every artifact lands is documented in [`docs/sink.md`](docs/sink.md). Don't invent new sink locations.
- New work packages (briefs, RFPs, zips, reference material) land in [`inputs/`](inputs/). Every conductor consults `inputs/` at the start of its scope phase. No auto-extract — see [`docs/inputs-ingestion.md`](docs/inputs-ingestion.md).
- For irreversible architectural decisions, use `/adr:new` (wraps `record-decision` skill).
- For glossary terms, use `/glossary:new "<term>"`. Entries live one-per-file under `docs/glossary/`.

### What not to do

- Don't expand the workflow with new stages or roles without an ADR.
- Don't write code from a vague brief — run the upstream stages first or explicitly mark them skipped.
- Don't merge feature work directly into workflow template files (`docs/`, `templates/`, `.claude/`) unless improving the template itself — use `/specorator:update`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
