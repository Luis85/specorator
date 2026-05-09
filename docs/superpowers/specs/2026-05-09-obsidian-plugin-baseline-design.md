---
title: Obsidian Plugin Baseline — Pre-feature Harness Spec
doc_type: design
status: approved
date: 2026-05-09
owner: engineering
stack: Vue 3 · Vite · Vitest · TypeScript strict · DDD · narrow ports
---

# Obsidian Plugin Baseline — Pre-feature Harness

## Purpose

This spec defines the **capability-first baseline** that must be fully implemented before any business logic or product feature is added to a new Obsidian plugin on this stack. When all eight capabilities are in place and `npm run verify` is green, the project is feature-ready.

**What this spec is not:** a project kickoff guide (see `docs/project-kickoff-guide.md`). It assumes the repository exists, `develop` is the default branch, and the GitHub environment (labels, milestones, templates) is configured. It covers "empty scaffold → runnable harness, CI green, zero business logic."

**Single pass/fail signal:** `npm run verify`. Every capability contributes to it. Any future PR that breaks the gate is rejected by CI before reaching a reviewer.

---

## Capability map

| ID | Capability | What it delivers |
|----|------------|-----------------|
| C1 | Repository baseline | Governance docs, `.gitignore`, `manifest.json`, branch protection |
| C2 | Toolchain & build | `package.json` scripts, Vite, TypeScript strict, path alias, both build targets |
| C3 | Port layer | Domain port interfaces, injection keys, per-port composables |
| C4 | Bridge adapters | `ObsidianBridge`, `MockBridge`, `LocalStorageBridge`, DI wired in both entries |
| C5 | Error & logger system | `Result<T,E>`, `DomainError`, `FeedbackService`, `errorMessages`, `ErrorBoundary` |
| C6 | Test harness | Vitest config, `fakeModulePorts()`, PageObject convention, coverage thresholds |
| C7 | Quality gate | `npm run verify`, CI workflow, branch protection tied to gate |
| C8 | Quality metrics | Type safety, bundle size, complexity, coverage — all CI-enforced |

---

## C1 — Repository baseline

### What it is

Governance and convention documents discoverable from a clean checkout. An agent or human contributor must be able to understand every working rule without out-of-band context.

### Files to create

| File | Content |
|------|---------|
| `.gitignore` | `node_modules/`, `dist*/`, `main.js`, `*.log`, `.env*`, `.DS_Store` |
| `CONSTITUTION.md` | Non-negotiables: vault immutability, DDD import direction, port boundary, Result type, quality gate, branching model. Amendments via PR only. |
| `CLAUDE.md` | Claude Code guide: all `npm run` commands, architecture layer table, port table, branching model, spec-first gate, testing conventions (ADR-009 summary) |
| `AGENTS.md` | Agent contributor rules: cut from `develop`, open PRs to `develop`, run `npm run verify` before every commit, never push to `main` directly, update linked issue on completion |
| `SECURITY.md` | Responsible disclosure via GitHub Security Advisory. No telemetry. No credential storage before a credential policy exists. |
| `manifest.json` | Obsidian plugin manifest. `minAppVersion` set. `version` field must equal `package.json` `version` exactly (no `v` prefix — marketplace requirement). |

### Branch protection (manual GitHub step)

- `main`: no direct push, no force push, CI jobs required (`verify` + `workflow-lint`)
- `develop`: default branch
- Auto-delete merged branches enabled
- Squash merge as only merge strategy

### Acceptance criteria

- `git clone` → contributor finds all working rules from docs, no out-of-band context needed
- `manifest.json` version == `package.json` version
- `main` branch protection confirmed in repo settings

---

## C2 — Toolchain & build

### What it is

All scripts, configs, and build pipelines wired up. Both build targets (Obsidian plugin + standalone web) produce correct output from a clean `npm ci`.

### `package.json` scripts

```json
{
  "scripts": {
    "typecheck":      "vue-tsc --noEmit",
    "lint":           "eslint .",
    "lint:fix":       "eslint . --fix",
    "format":         "prettier --write .",
    "format:check":   "prettier --check .",
    "test":           "vitest run",
    "test:watch":     "vitest",
    "test:coverage":  "vitest run --coverage",
    "build":          "npm run typecheck && vite build",
    "dev:plugin":     "vite build --watch",
    "build:web":      "vite build --config vite.web.config.ts",
    "dev":            "vite --config vite.web.config.ts",
    "docs:api":       "typedoc src/",
    "size":           "size-limit",
    "verify":         "npm run typecheck && npm run lint && npm run test:coverage && npm run build && npm run size && npm run build:web && npm run docs:api"
  }
}
```

### Config files

**`tsconfig.json`**
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "paths": { "@/*": ["src/*"] },
    "types": ["vite/client"]
  }
}
```

**`vite.config.ts`** — plugin build
- Entry: `src/plugin/main.ts`
- Library mode, format `cjs`
- Output: `main.js` at project root (gitignored)
- External: `obsidian`, `electron`, Node built-ins
- No inline sourcemaps in release builds

**`vite.web.config.ts`** — standalone web build
- Entry: `src/ui/main.ts`
- Output: `dist-standalone/`
- Path alias `@/` → `src/`

**`vitest.config.ts`**
- `include: ['tests/**/*.test.ts']`
- Coverage provider: `v8`
- Coverage thresholds: see C6

**`eslint.config.js`** — enforced rules
- `no-restricted-imports`: forbid `obsidian` in `src/domain/**`, `src/application/**`, `src/ui/**`
- `no-restricted-imports`: forbid `IBridge`, `BridgeKey`, `useBridge` symbols anywhere
- Vue files: `vue/component-api-style: ['script-setup']` (Options API forbidden)
- `tests/**/*.ts`: `no-restricted-syntax` forbidding selector literals starting with `.` or `#`
- `no-console: error` across all `src/**`

**`.prettierrc`**
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### Acceptance criteria

- `npm run build` → `main.js` at project root, no errors
- `npm run build:web` → `dist-standalone/index.html` exists
- `npm run typecheck` exits 0 on empty scaffold
- `@/` path alias resolves in both Vite and Vitest configs
- ESLint reports zero violations on scaffold files

---

## C3 — Port layer

### What it is

Domain port interfaces declare the capabilities the plugin needs from the Obsidian runtime. No `obsidian` import crosses into `domain/`, `application/`, or `ui/`. ESLint enforces this statically.

Each port has one `InjectionKey` and one composable. Consumers call one composable per dependency. There is no aggregate port type.

### Port interfaces (`src/domain/ports/`)

**`SettingsPort.ts`**
```ts
export interface SettingsPort {
  getSettings(): PluginSettings
  saveSettings(settings: PluginSettings): Promise<void>
}
```

**`VaultPort.ts`**
```ts
export interface VaultPort {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  listFiles(folder: string): Promise<string[]>
  listFolders(folder: string): Promise<string[]>
  fileExists(path: string): Promise<boolean>
  createFolder(path: string): Promise<void>
}
```

**`WorkspacePort.ts`**
```ts
export interface WorkspacePort {
  openFile(path: string): Promise<void>
  getActiveFilePath(): string | null
  onActiveFileChanged(callback: (path: string | null) => void): () => void
}
```

**`NotificationPort.ts`**
```ts
export interface NotificationPort {
  showError(message: string, durationMs?: number): void   // durationMs=0 → sticky
  showWarning(message: string, durationMs?: number): void
  showSuccess(message: string, durationMs?: number): void
  showInfo(message: string, durationMs?: number): void
}
```

**`LoggerPort.ts`**
```ts
export interface LoggerPort {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
```

**`index.ts`**
```ts
// No aggregate interface composing two or more ports.
// Each consumer declares exactly the port(s) it needs.
export * from './SettingsPort'
export * from './VaultPort'
export * from './WorkspacePort'
export * from './NotificationPort'
export * from './LoggerPort'
```

### Injection keys (`src/infrastructure/bridge/ports.ts`)

```ts
import type { InjectionKey } from 'vue'
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort } from '@/domain/ports'

export const SETTINGS_PORT:      InjectionKey<SettingsPort>      = Symbol('SettingsPort')
export const VAULT_PORT:         InjectionKey<VaultPort>         = Symbol('VaultPort')
export const WORKSPACE_PORT:     InjectionKey<WorkspacePort>     = Symbol('WorkspacePort')
export const NOTIFICATION_PORT:  InjectionKey<NotificationPort>  = Symbol('NotificationPort')
export const LOGGER_PORT:        InjectionKey<LoggerPort>        = Symbol('LoggerPort')
```

### Composables (`src/ui/composables/`)

One file per port, pattern identical for all five:

```ts
// useVaultPort.ts
import { inject } from 'vue'
import { VAULT_PORT } from '@/infrastructure/bridge/ports'
import type { VaultPort } from '@/domain/ports'

export function useVaultPort(): VaultPort {
  const port = inject(VAULT_PORT)
  if (!port) throw new Error('VaultPort not provided')
  return port
}
```

### Acceptance criteria

- ESLint passes on all port files
- No composable calls `inject` for more than one port
- No `obsidian` import in `src/domain/**`, `src/application/**`, `src/ui/**`
- Each composable throws a clear error if the key is missing (not a silent `undefined`)

---

## C4 — Bridge adapters

### What it is

Three runtime classes each implement all five ports. A single class instance is registered under all five injection keys — no state duplication. Plugin entry and standalone entry each provide the correct runtime.

### `ObsidianBridge` (`src/infrastructure/obsidian/ObsidianBridge.ts`)

- Implements: `SettingsPort`, `VaultPort`, `WorkspacePort`, `NotificationPort`, `LoggerPort`
- Constructor args: `Plugin`, `App`
- `LoggerPort` methods: check `PluginSettings.logLevel` before writing to `console`; default level `warn` silences `debug` and `info`
- `NotificationPort.showError`: default `durationMs = 0` (sticky Obsidian `Notice`)
- All vault paths pass through `normalizePath()` before use
- Event subscriptions use `plugin.registerEvent()` for automatic lifecycle cleanup
- Intervals use `plugin.registerInterval()`
- No direct `.obsidian/` folder access

### `MockBridge` (`src/infrastructure/mock/MockBridge.ts`)

- Implements all five ports
- Single in-memory state object: `{ files: Map<string, string>, settings: PluginSettings, notices: Notice[], logs: LogEntry[] }`
- Mutations through any port are visible through the same state object
- Used in: unit tests, `npm run dev` (standalone browser mode)

### `LocalStorageBridge` (`src/infrastructure/localstorage/LocalStorageBridge.ts`)

- Implements all five ports
- Persists vault files and settings to `localStorage` under a namespaced key
- Used in: GitHub Pages demo (`npm run build:web`)

### Plugin entry (`src/plugin/main.ts`)

```ts
class SpecoratorPlugin extends Plugin {
  async onload() {
    const bridge = new ObsidianBridge(this, this.app)
    const app = createApp(App)
    app.provide(SETTINGS_PORT, bridge)
    app.provide(VAULT_PORT, bridge)
    app.provide(WORKSPACE_PORT, bridge)
    app.provide(NOTIFICATION_PORT, bridge)
    app.provide(LOGGER_PORT, bridge)
    app.mount(containerEl)
  }
}
```

### Standalone entry (`src/ui/main.ts`)

```ts
const bridge = new MockBridge()
const app = createApp(App)
app.provide(SETTINGS_PORT, bridge)
app.provide(VAULT_PORT, bridge)
app.provide(WORKSPACE_PORT, bridge)
app.provide(NOTIFICATION_PORT, bridge)
app.provide(LOGGER_PORT, bridge)
app.mount('#app')
```

### Acceptance criteria

- `ObsidianBridge` compiles against current Obsidian API typings without errors
- `MockBridge`: writing a file via `VaultPort.writeFile` → readable via `bridge.files.get(path)`
- `MockBridge`: `NotificationPort.showError` appends to `bridge.notices`
- Plugin entry provides all five keys; standalone entry provides all five keys
- `LoggerPort` on `ObsidianBridge` respects `logLevel`; debug-level message not written to console when level is `warn`

---

## C5 — Error & logger system

### What it is

A layered error model: `Result<T,E>` at the domain boundary, `DomainError` as the base class, `FeedbackService` as the application-layer bridge between errors and user-visible notifications, and `ErrorBoundary` as the Vue-level safety net.

### `Result<T, E>` (`src/domain/shared/Result.ts`)

```ts
export type Result<T, E extends Error = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E }

export const ok  = <T>(value: T): Result<T, never>      => ({ ok: true, value })
export const err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error })
```

All domain aggregate mutations and use case `execute()` methods return `Result`. Never throw from domain code.

### `DomainError` (`src/domain/shared/DomainError.ts`)

```ts
export class DomainError extends Error {
  constructor(message: string, readonly cause?: Error) {
    super(message)
    this.name = this.constructor.name
  }
}
```

Feature-specific errors extend `DomainError` (e.g. `SlugAlreadyExistsError`, `FileNotFoundError`).

### `errorMessages.ts` (`src/application/shared/errorMessages.ts`)

```ts
export function toUserMessage(error: Error): string {
  if (error instanceof SlugAlreadyExistsError) return 'A feature with that name already exists.'
  if (error instanceof FileNotFoundError) return 'The requested file could not be found.'
  // ... one branch per defined error subtype
  return 'An unexpected error occurred. Check the developer console for details.'
}
```

Every defined `DomainError` subtype must have an explicit branch. The fallback is the safety net.

### `FeedbackService` (`src/application/shared/FeedbackService.ts`)

```ts
export function useFeedbackService() {
  const logger = useLoggerPort()
  const notifier = useNotificationPort()

  return {
    reportError(error: Error): void {
      logger.error(error.message, error)
      notifier.showError(toUserMessage(error))
    },
    reportWarning(message: string): void {
      logger.warn(message)
      notifier.showWarning(message)
    },
    reportInfo(message: string): void {
      logger.info(message)
      notifier.showInfo(message)
    },
  }
}
```

### `ErrorBoundary.vue` (`src/ui/components/ErrorBoundary.vue`)

```vue
<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import { useFeedbackService } from '@/application/shared/FeedbackService'

const { reportError } = useFeedbackService()
const hasError = ref(false)

onErrorCaptured((err) => {
  reportError(err instanceof Error ? err : new Error(String(err)))
  hasError.value = true
  return false
})
</script>

<template>
  <slot v-if="!hasError" />
  <div v-else data-testid="error-boundary-fallback">
    Something went wrong. Check the developer console for details.
  </div>
</template>
```

`App.vue` wraps `<RouterView />` inside `<ErrorBoundary>`.

### Acceptance criteria

- `ErrorBoundary` catches a thrown child error, renders fallback slot, calls `FeedbackService.reportError`
- `FeedbackService.reportError` calls both `LoggerPort.error` and `NotificationPort.showError`
- `toUserMessage` has an explicit branch for every defined `DomainError` subtype; TypeScript exhaustiveness check preferred
- Zero raw `console.log`/`console.error` calls in `src/**` (ESLint `no-console: error`)
- Domain code never `throw`s; only returns `Result`

---

## C6 — Test harness

### What it is

The test infrastructure that makes every domain, application, and infrastructure unit independently testable from day one. Shared fakes eliminate repetitive setup. PageObjects decouple component tests from markup. Coverage thresholds prevent silent drift.

### `vitest.config.ts` — coverage config

```ts
coverage: {
  provider: 'v8',
  include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
  exclude: ['src/infrastructure/obsidian/**'],   // runtime-only; tested manually
  thresholds: {
    statements: 80,
    branches:   70,
    functions:  80,
    lines:      80,
  },
}
```

### Fake ports factory (`tests/__fakes__/fake-ports.ts`)

```ts
export interface FakePorts {
  settingsPort:      SettingsPort
  vaultPort:         VaultPort
  workspacePort:     WorkspacePort
  notificationPort:  NotificationPort
  loggerPort:        LoggerPort
  bridge:            MockBridge        // direct access for state assertions
}

export function fakeModulePorts(overrides?: Partial<PluginSettings>): FakePorts {
  const bridge = new MockBridge(overrides)
  return {
    settingsPort:     bridge,
    vaultPort:        bridge,
    workspacePort:    bridge,
    notificationPort: bridge,
    loggerPort:       bridge,
    bridge,
  }
}
```

### Factory smoke test (`tests/__fakes__/fake-ports.test.ts`)

```ts
it('all ports share the same bridge instance', async () => {
  const { vaultPort, bridge } = fakeModulePorts()
  await vaultPort.writeFile('test.md', 'content')
  expect(bridge.files.get('test.md')).toBe('content')
})
```

### PageObject convention

Every Vue component test that mounts a component must have a co-located class-based PageObject:

```
tests/ui/components/
  Home.test.ts
  Home.po.ts        ← required
```

PageObject shape:
```ts
export class HomePO {
  constructor(private wrapper: VueWrapper) {}

  get createButton() {
    return this.wrapper.find('[data-testid="create-feature-btn"]')
  }

  async clickCreate() {
    await this.createButton.trigger('click')
  }
}
```

Rules:
- Elements queried exclusively by `data-testid`
- CSS-class (`.foo`) and id (`#bar`) selectors forbidden in `tests/**` (ESLint `no-restricted-syntax`)
- No test mounts a component without a PageObject

### Acceptance criteria

- `npm run test` passes on empty scaffold
- `npm run test:coverage` passes all four thresholds
- Factory smoke test passes
- No `.spec.ts` files exist; `.test.ts` is canonical
- No `__tests__/` directories inside `src/`
- Every component test that mounts a component has a co-located `.po.ts`

---

## C7 — Quality gate

### What it is

`npm run verify` is the single authoritative pass/fail signal for agents, developers, and CI. Every step must pass; no flags exist to skip any step. CI runs the exact same command.

### Verify script

```json
"verify": "npm run typecheck && npm run lint && npm run test:coverage && npm run build && npm run size && npm run build:web && npm run docs:api"
```

Step order and why:
1. `typecheck` — fastest feedback on type errors before running anything
2. `lint` — static analysis; catches import violations before tests run
3. `test:coverage` — runs tests and enforces coverage floors
4. `build` — confirms the plugin bundle compiles and links
5. `size` — `size-limit` checks `main.js` against budget; runs after build while artifact is fresh
6. `build:web` — confirms the standalone build compiles
7. `docs:api` — confirms TypeDoc can parse all exported types

### CI workflow (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [develop, demo, main]
  pull_request:
    branches: [develop, demo, main]

jobs:
  verify:
    name: Install, typecheck, lint, test, and build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4           # pin to SHA before public release
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run verify

  workflow-lint:
    name: Workflow lint and pin check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: rhysd/actionlint@v1           # pin to SHA before public release
```

### Branch protection requirement

`main` branch protection must list both job names (`Install, typecheck, lint, test, and build` and `Workflow lint and pin check`) as required status checks. These names must match the `name:` field in the workflow exactly.

### Acceptance criteria

- `npm run verify` runs end-to-end locally with no flags to skip steps
- CI workflow passes on a clean branch off `develop`
- `main` branch protection requires both CI jobs
- `actionlint` passes on all workflow files with zero warnings
- PRs with any failing step cannot be merged

---

## C8 — Quality metrics pipeline

### What it is

Four measurable quality signals enforced in CI from the first commit. Every PR surfaces a metrics diff. No signal requires manual interpretation to determine pass/fail.

### Signal 1 — Test coverage

Enforced in C6 via Vitest thresholds (statements 80 / branches 70 / functions 80 / lines 80). `npm run test:coverage` fails with non-zero exit if any threshold is missed.

### Signal 2 — Type safety (no implicit `any`)

`tsconfig.json`: `"strict": true` (implies `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, etc.)

ESLint rules:
```js
'@typescript-eslint/no-explicit-any':      'error',
'@typescript-eslint/no-unsafe-assignment': 'warn',
'@typescript-eslint/no-unsafe-call':       'warn',
'@typescript-eslint/no-unsafe-return':     'warn',
```

`no-explicit-any` at `error` blocks the lint step in `verify`. The three `no-unsafe-*` rules at `warn` surface in CI output without blocking, until the codebase is stable enough to promote to `error`.

### Signal 3 — Bundle size

Add `size-limit` to devDependencies.

**`.size-limit.json`**
```json
[
  {
    "name": "Obsidian plugin (main.js)",
    "path": "main.js",
    "limit": "500 KB"
  }
]
```

Add to `package.json`:
```json
"size": "size-limit"
```

`npm run size` runs inside `npm run verify` after `build` (see C7).

Adjust the `500 KB` budget as the project grows. The initial budget must be documented and reviewed before raising it.

### Signal 4 — Code complexity

ESLint rules applied to `src/**`:
```js
'complexity':              ['error', { max: 10 }],
'max-depth':               ['error', { max: 4 }],
'max-lines-per-function':  ['warn',  { max: 50, skipBlankLines: true, skipComments: true }],
```

`complexity` and `max-depth` at `error` block the lint step. `max-lines-per-function` at `warn` surfaces without blocking — many Vue `<script setup>` blocks legitimately exceed 50 lines.

### Metrics visibility in CI

- Coverage: Vitest prints a summary table; threshold failures include the exact delta
- Bundle size: `size-limit` prints exact bytes vs budget on every run
- Complexity/type: ESLint output in CI log, grouped by file
- All four signals appear in the `verify` job log visible on every PR

### Acceptance criteria

- `npm run verify` fails if any threshold or `error`-level rule is violated
- `size-limit` reports bundle size on every build; exceeding budget fails CI
- ESLint `no-explicit-any` blocks merge on any new `any` introduction
- Complexity violations fail lint before tests run

---

## Full acceptance: the baseline is done when

```sh
npm run verify   # exits 0
```

And all of the following hold:

- [ ] `npm run build` → `main.js` at project root
- [ ] `npm run build:web` → `dist-standalone/` exists
- [ ] `npm run test:coverage` → all four thresholds pass
- [ ] `npm run lint` → zero violations (including no `any`, no import violations)
- [ ] `npm run docs:api` → TypeDoc output generated without error
- [ ] `size-limit` → bundle within budget
- [ ] CI green on a PR targeting `develop`
- [ ] `main` branch protection confirmed (both CI jobs required)
- [ ] `fakeModulePorts()` smoke test passes
- [ ] Zero raw `console.log` in `src/`
- [ ] Zero `obsidian` imports in `src/domain/`, `src/application/`, `src/ui/`
- [ ] `ErrorBoundary` renders fallback on component error
- [ ] All five port composables throw on missing provider

**No feature implementation begins until every item above is checked.**
