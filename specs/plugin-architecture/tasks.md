# Obsidian Plugin Baseline Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a new Obsidian plugin with the full pre-feature baseline harness — governance files, ports, bridges, error/logger system, test factory, and quality gates — so feature development can begin immediately with `npm run verify` green and zero business logic.

**Architecture:** DDD layered imports (`domain ← application ← infrastructure ← ui ← plugin`). All Obsidian API calls flow through five narrow port interfaces declared in `src/domain/ports/`. Three runtime adapters (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) each implement all five ports. `npm run verify` is the single authoritative pass/fail signal for agents and CI.

**Spec:** `specs/plugin-architecture/design.md`

**Tech Stack:** TypeScript strict · Vue 3 `<script setup>` · Vite · Vitest (v8 coverage) · ESLint flat config · Prettier · TypeDoc · size-limit · `obsidian` API types

---

## Task 1: Repository governance files (C1)

**Files:**
- Create: `.gitignore`
- Create: `CONSTITUTION.md`
- Create: `CLAUDE.md`
- Create: `AGENTS.md`
- Create: `SECURITY.md`
- Create: `manifest.json`

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
dist-plugin/
dist-standalone/
main.js
*.log
.env
.env.local
.DS_Store
.idea/
.vscode/
coverage/
docs/api/
```

- [ ] **Step 2: Create `CONSTITUTION.md`**

Replace `<PluginName>` and `<org>/<repo>` with actual values.

```markdown
# <PluginName> — Repository Constitution

## 1. User control is inviolable

- The user's vault is their property. The plugin must never silently overwrite, delete, or rename vault files.
- Every vault write goes through `VaultPort`. Never bypass the port layer.
- Overwrite protection is a hard constraint, not a preference.

## 2. Architecture is intentional

- **DDD layered imports:** `domain ← application ← infrastructure ← ui`. Never import upward.
- **Port boundary:** All Obsidian API access goes through the five narrow ports in `src/domain/ports/`. Vue components never import `obsidian` directly. ESLint enforces this.
- **Result type:** Domain mutations return `Result<T,E>`, never throw. Check `.ok` before accessing `.value`.
- **Pinia stores hold DTOs only.** Domain class instances must not cross the store boundary.

## 3. Branching model

| Branch | Purpose |
|--------|---------|
| `develop` | Integration branch. All feature branches cut from and merged back here. Default branch. |
| `demo` | Preview. GitHub Pages deploys from here. |
| `main` | Stable release gate. Only merges from `develop`. Tags trigger plugin release. |

Cut feature branches from `develop`. Open PRs targeting `develop`. Never push directly to `main`.

## 4. Quality gate is non-negotiable

```sh
npm run verify
```

All steps must pass. CI enforces this. No PR merges with a failing gate.

## 5. Spec-first development

No feature implementation begins without an accepted idea doc and requirements. See `docs/process/` for intake workflow.

## 6. Decisions are documented

Architectural decisions → `docs/adr/`. Day-to-day decisions → `decisions/`. A decision that lives only in a PR comment is not durable.

## 7. This document evolves

Amendments are proposed as PRs. Significant changes need a supporting decision note.
```

- [ ] **Step 3: Create `CLAUDE.md`**

```markdown
# CLAUDE.md

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
npm run build              # type-check + build plugin bundle → project root
npm run dev:plugin         # plugin build in watch mode
npm run build:web          # build standalone browser UI → dist-standalone/
npm run dev                # Vite dev server for standalone browser UI
npm run size               # size-limit check on main.js
npm run docs:api           # TypeDoc API docs → docs/api/
npm run verify             # full gate: typecheck → lint → test:coverage → build → size → build:web → docs:api
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

DDD layered architecture — strict inward-only imports:

```
domain ← application ← infrastructure ← ui
                                      ↑
                        plugin (owns Obsidian lifecycle)
```

| Layer | Path | Role |
|-------|------|------|
| Domain | `src/domain/` | Aggregates, value objects, `Result<T,E>`, port interfaces |
| Application | `src/application/` | Use cases, `FeedbackService`, `errorMessages` |
| Infrastructure | `src/infrastructure/` | Bridge adapters, `FeatureRepository` |
| UI | `src/ui/` | Vue 3 components, Pinia stores, Vue Router, composables |
| Plugin | `src/plugin/` | Obsidian `Plugin` subclass, plugin entry point |

### Narrow ports (five)

All Obsidian API calls go through ports declared in `src/domain/ports/`:

| Port | Surface |
|------|---------|
| `SettingsPort` | `getSettings`, `saveSettings` |
| `VaultPort` | `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder` |
| `WorkspacePort` | `openFile`, `getActiveFilePath`, `onActiveFileChanged` |
| `NotificationPort` | `showError`, `showWarning`, `showSuccess`, `showInfo` |
| `LoggerPort` | `debug`, `info`, `warn`, `error` |

Each port has its own `InjectionKey` in `src/infrastructure/bridge/ports.ts` and its own composable in `src/ui/composables/`. Never use an aggregate `usePorts()`.

### Branching model

| Branch | Purpose |
|--------|---------|
| `develop` | Integration branch. Default branch. |
| `demo` | GitHub Pages preview. |
| `main` | Release gate. Tag triggers plugin release. |

### Testing conventions

- Tests mirror `src/` path-for-path under `tests/`. File `src/x/y.ts` → `tests/x/y.test.ts`.
- Shared fake factory: `tests/__fakes__/fake-ports.ts` exports `fakeModulePorts()`.
- Vue component tests require a co-located PageObject (`.po.ts`). Elements queried by `data-testid` only.
- Coverage thresholds: statements 80 / branches 70 / functions 80 / lines 80.
```

- [ ] **Step 4: Create `AGENTS.md`**

```markdown
# AGENTS.md — Contributor and Agent Workflow

## Branch rules

- Cut all branches from `develop`, never from `main`.
- Branch naming: `feat/<description>`, `fix/<description>`, `docs/<description>`.
- One concern per branch. Do not mix feature work with unrelated refactors.

## Before every commit

Run the verification gate:

```sh
npm run verify
```

All steps must pass. Do not commit with a failing gate.

## Opening a PR

- Target `develop`.
- Link the tracking issue in the PR description.
- All CI checks must be green before requesting review.
- Do not force-push a branch that has an open PR.

## Issue hygiene

- Update the linked issue with progress notes when finishing a task.
- Close the issue only when the PR is merged and CI is green on `develop`.

## Vault safety

- Never write vault files outside the configured `specsFolder`.
- Never silently overwrite existing user files. Show a notice and skip.
- All vault writes go through `VaultPort`. Never use `app.vault` directly.

## Agent-specific rules

- `npm run verify` is the authoritative pass/fail signal. Do not skip steps.
- Do not merge to `main`. Do not tag from any branch other than `main`.
- If `npm run verify` fails, diagnose the root cause. Do not bypass hooks.
```

- [ ] **Step 5: Create `SECURITY.md`**

```markdown
# Security Policy

## Reporting a Vulnerability

Report security vulnerabilities privately via GitHub's Security Advisory feature
(Security → Report a vulnerability). Do not open a public issue.

We will respond within 5 business days.

## Policy

- No telemetry. The plugin does not phone home.
- No credential storage. Plugin data is stored only in `plugin.loadData()` / `plugin.saveData()`.
- No hidden vault writes. All writes go through `VaultPort` and are user-visible.
```

- [ ] **Step 6: Create `manifest.json`**

Replace `<id>`, `<name>`, `<version>`, `<author>`, `<description>` with project values. `version` must exactly match `package.json` `version` (no `v` prefix — Obsidian marketplace requirement).

```json
{
  "id": "<plugin-id>",
  "name": "<Plugin Name>",
  "version": "0.0.1",
  "minAppVersion": "1.4.0",
  "description": "<One-sentence description>",
  "author": "<Author Name>",
  "authorUrl": "https://github.com/<org>",
  "isDesktopOnly": false
}
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore CONSTITUTION.md CLAUDE.md AGENTS.md SECURITY.md manifest.json
git commit -m "chore: add repository governance files and manifest"
```

---

## Task 2: npm project init and dependency install (C2)

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize npm project**

```bash
npm init -y
```

- [ ] **Step 2: Install runtime peer dependency**

```bash
npm install --save-peer obsidian
```

- [ ] **Step 3: Install all dev dependencies**

```bash
npm install --save-dev \
  typescript \
  vue \
  @vue/compiler-sfc \
  vue-router \
  pinia \
  vite \
  @vitejs/plugin-vue \
  vitest \
  @vitest/coverage-v8 \
  @vue/test-utils \
  jsdom \
  eslint \
  @eslint/js \
  typescript-eslint \
  eslint-plugin-vue \
  prettier \
  typedoc \
  size-limit \
  @size-limit/file \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser
```

- [ ] **Step 4: Add scripts to `package.json`**

Open `package.json` and replace the `scripts` field:

```json
{
  "scripts": {
    "typecheck":     "vue-tsc --noEmit",
    "lint":          "eslint .",
    "lint:fix":      "eslint . --fix",
    "format":        "prettier --write .",
    "format:check":  "prettier --check .",
    "test":          "vitest run",
    "test:watch":    "vitest",
    "test:coverage": "vitest run --coverage",
    "build":         "npm run typecheck && vite build",
    "dev:plugin":    "vite build --watch",
    "build:web":     "vite build --config vite.web.config.ts",
    "dev":           "vite --config vite.web.config.ts",
    "size":          "size-limit",
    "docs:api":      "typedoc src/",
    "verify":        "npm run typecheck && npm run lint && npm run test:coverage && npm run build && npm run size && npm run build:web && npm run docs:api"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize npm project and install dependencies"
```

---

## Task 3: TypeScript and Vite build configs (C2)

**Files:**
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vite.web.config.ts`
- Create: `typedoc.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "lib": ["ES2020", "DOM"],
    "paths": {
      "@/*": ["src/*"]
    },
    "types": ["vite/client"],
    "skipLibCheck": true
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist*"]
}
```

- [ ] **Step 2: Create `vite.config.ts`** (plugin build → `main.js` at project root)

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/plugin/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    outDir: '.',
    emptyOutDir: false,
    rollupOptions: {
      external: ['obsidian', 'electron', 'codemirror', '@codemirror/state', '@codemirror/view'],
      output: {
        exports: 'named',
        sourcemap: false,
      },
    },
  },
})
```

- [ ] **Step 3: Create `vite.web.config.ts`** (standalone browser build)

```ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 4: Create `typedoc.json`**

```json
{
  "entryPoints": ["src/"],
  "entryPointStrategy": "expand",
  "out": "docs/api",
  "exclude": ["**/*.test.ts", "tests/**/*"],
  "excludePrivate": true,
  "skipErrorChecking": true
}
```

- [ ] **Step 5: Verify typecheck passes on empty `src/`**

Create `src/.gitkeep` so the directory exists, then run:

```bash
mkdir -p src/domain src/application src/infrastructure src/ui src/plugin
mkdir -p tests/__fakes__
npm run typecheck
```

Expected: exits 0 (no files to check yet).

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json vite.config.ts vite.web.config.ts typedoc.json src/
git commit -m "chore: add TypeScript and Vite build configs"
```

---

## Task 4: Vitest config (C2 + C6)

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/application/**', 'src/infrastructure/**'],
      exclude: ['src/infrastructure/obsidian/**'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
      reporter: ['text', 'lcov'],
    },
  },
})
```

- [ ] **Step 2: Verify test runner starts**

Create a placeholder test to confirm configuration works:

```bash
mkdir -p tests
```

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('test runner is configured correctly', () => {
    expect(true).toBe(true)
  })
})
```

Run:

```bash
npm run test
```

Expected output includes: `1 passed`.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts tests/smoke.test.ts
git commit -m "chore: add Vitest config with coverage thresholds"
```

---

## Task 5: ESLint and Prettier config (C2)

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`
- Create: `.eslintignore` (if needed)

- [ ] **Step 1: Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],

  // Source files
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // No console in source code — use LoggerPort
      'no-console': 'error',

      // No implicit any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // Complexity gates
      'complexity': ['error', { max: 10 }],
      'max-depth': ['error', { max: 4 }],
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }],

      // Vue: script-setup only (no Options API)
      'vue/component-api-style': ['error', ['script-setup']],
    },
  },

  // Forbid obsidian import in domain, application, ui layers
  {
    files: ['src/domain/**/*.ts', 'src/application/**/*.ts', 'src/ui/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['obsidian'], message: 'Obsidian API is forbidden in domain/application/ui. Use a port interface.' },
          { group: ['**/IBridge*', '**/BridgeKey*', '**/useBridge*'], message: 'IBridge is deleted. Use narrow port composables (useVaultPort, useSettingsPort, etc.).' },
        ],
      }],
    },
  },

  // Test files: forbid CSS/id selectors, allow console
  {
    files: ['tests/**/*.{ts,vue}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^\\./]',
          message: 'Use data-testid selectors in tests, not CSS class selectors.',
        },
        {
          selector: 'Literal[value=/^#/]',
          message: 'Use data-testid selectors in tests, not id selectors.',
        },
      ],
    },
  },

  // Ignore build output and docs
  {
    ignores: ['dist*/', 'docs/api/', 'node_modules/', 'main.js', 'coverage/'],
  },
)
```

- [ ] **Step 3: Verify lint passes on current files**

```bash
npm run lint
```

Expected: zero errors (warnings acceptable at this stage).

- [ ] **Step 4: Run Prettier on all files**

```bash
npm run format
```

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js .prettierrc
git commit -m "chore: add ESLint flat config and Prettier"
```

---

## Task 6: PluginSettings domain type (prerequisite)

**Files:**
- Create: `src/domain/settings/PluginSettings.ts`

This type is referenced by `SettingsPort`, `ObsidianBridge`, and the plugin entry. Define it before the ports.

- [ ] **Step 1: Write the failing test**

Create `tests/domain/settings/PluginSettings.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

describe('DEFAULT_SETTINGS', () => {
  it('has specsFolder set to specs', () => {
    expect(DEFAULT_SETTINGS.specsFolder).toBe('specs')
  })

  it('has logLevel set to warn', () => {
    expect(DEFAULT_SETTINGS.logLevel).toBe('warn')
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/domain/settings/PluginSettings.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/domain/settings/PluginSettings.ts`**

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface PluginSettings {
  specsFolder: string
  logLevel: LogLevel
}

export const DEFAULT_SETTINGS: PluginSettings = {
  specsFolder: 'specs',
  logLevel: 'warn',
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run tests/domain/settings/PluginSettings.test.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/domain/settings/PluginSettings.ts tests/domain/settings/PluginSettings.test.ts
git commit -m "feat(domain): add PluginSettings type and defaults"
```

---

## Task 7: Port interfaces (C3)

**Files:**
- Create: `src/domain/ports/SettingsPort.ts`
- Create: `src/domain/ports/VaultPort.ts`
- Create: `src/domain/ports/WorkspacePort.ts`
- Create: `src/domain/ports/NotificationPort.ts`
- Create: `src/domain/ports/LoggerPort.ts`
- Create: `src/domain/ports/index.ts`

Port interfaces are pure TypeScript types — no runtime behaviour, no tests required. ESLint verifies correctness.

- [ ] **Step 1: Create `src/domain/ports/SettingsPort.ts`**

```ts
import type { PluginSettings } from '@/domain/settings/PluginSettings'

export interface SettingsPort {
  getSettings(): PluginSettings
  saveSettings(settings: PluginSettings): Promise<void>
}
```

- [ ] **Step 2: Create `src/domain/ports/VaultPort.ts`**

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

- [ ] **Step 3: Create `src/domain/ports/WorkspacePort.ts`**

```ts
export interface WorkspacePort {
  openFile(path: string): Promise<void>
  getActiveFilePath(): string | null
  onActiveFileChanged(callback: (path: string | null) => void): () => void
}
```

- [ ] **Step 4: Create `src/domain/ports/NotificationPort.ts`**

```ts
export interface NotificationPort {
  /** durationMs = 0 → sticky notice (default for errors) */
  showError(message: string, durationMs?: number): void
  showWarning(message: string, durationMs?: number): void
  showSuccess(message: string, durationMs?: number): void
  showInfo(message: string, durationMs?: number): void
}
```

- [ ] **Step 5: Create `src/domain/ports/LoggerPort.ts`**

```ts
export interface LoggerPort {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}
```

- [ ] **Step 6: Create `src/domain/ports/index.ts`**

```ts
// No aggregate interface composing two or more ports.
// Each consumer declares exactly the port(s) it needs.
export type { SettingsPort } from './SettingsPort'
export type { VaultPort } from './VaultPort'
export type { WorkspacePort } from './WorkspacePort'
export type { NotificationPort } from './NotificationPort'
export type { LoggerPort } from './LoggerPort'
```

- [ ] **Step 7: Verify typecheck and lint pass**

```bash
npm run typecheck && npm run lint
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/domain/ports/
git commit -m "feat(ports): add five narrow port interfaces"
```

---

## Task 8: Injection keys and port composables (C3)

**Files:**
- Create: `src/infrastructure/bridge/ports.ts`
- Create: `src/ui/composables/useSettingsPort.ts`
- Create: `src/ui/composables/useVaultPort.ts`
- Create: `src/ui/composables/useWorkspacePort.ts`
- Create: `src/ui/composables/useNotificationPort.ts`
- Create: `src/ui/composables/useLoggerPort.ts`
- Test: `tests/ui/composables/usePorts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/composables/usePorts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount, defineComponent } from '@vue/test-utils'
import { useVaultPort } from '@/ui/composables/useVaultPort'
import { useSettingsPort } from '@/ui/composables/useSettingsPort'
import { useWorkspacePort } from '@/ui/composables/useWorkspacePort'
import { useNotificationPort } from '@/ui/composables/useNotificationPort'
import { useLoggerPort } from '@/ui/composables/useLoggerPort'

function mountWithout(composable: () => unknown) {
  return () =>
    mount(
      defineComponent({
        setup() {
          composable()
          return {}
        },
        template: '<div/>',
      }),
    )
}

describe('port composables', () => {
  it('useVaultPort throws when VaultPort not provided', () => {
    expect(mountWithout(useVaultPort)).toThrow('VaultPort not provided')
  })

  it('useSettingsPort throws when SettingsPort not provided', () => {
    expect(mountWithout(useSettingsPort)).toThrow('SettingsPort not provided')
  })

  it('useWorkspacePort throws when WorkspacePort not provided', () => {
    expect(mountWithout(useWorkspacePort)).toThrow('WorkspacePort not provided')
  })

  it('useNotificationPort throws when NotificationPort not provided', () => {
    expect(mountWithout(useNotificationPort)).toThrow('NotificationPort not provided')
  })

  it('useLoggerPort throws when LoggerPort not provided', () => {
    expect(mountWithout(useLoggerPort)).toThrow('LoggerPort not provided')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/ui/composables/usePorts.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/infrastructure/bridge/ports.ts`**

```ts
import type { InjectionKey } from 'vue'
import type { SettingsPort } from '@/domain/ports/SettingsPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'
import type { NotificationPort } from '@/domain/ports/NotificationPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'

export const SETTINGS_PORT: InjectionKey<SettingsPort> = Symbol('SettingsPort')
export const VAULT_PORT: InjectionKey<VaultPort> = Symbol('VaultPort')
export const WORKSPACE_PORT: InjectionKey<WorkspacePort> = Symbol('WorkspacePort')
export const NOTIFICATION_PORT: InjectionKey<NotificationPort> = Symbol('NotificationPort')
export const LOGGER_PORT: InjectionKey<LoggerPort> = Symbol('LoggerPort')
```

- [ ] **Step 4: Create all five composables**

`src/ui/composables/useVaultPort.ts`:
```ts
import { inject } from 'vue'
import { VAULT_PORT } from '@/infrastructure/bridge/ports'
import type { VaultPort } from '@/domain/ports/VaultPort'

export function useVaultPort(): VaultPort {
  const port = inject(VAULT_PORT)
  if (!port) throw new Error('VaultPort not provided')
  return port
}
```

`src/ui/composables/useSettingsPort.ts`:
```ts
import { inject } from 'vue'
import { SETTINGS_PORT } from '@/infrastructure/bridge/ports'
import type { SettingsPort } from '@/domain/ports/SettingsPort'

export function useSettingsPort(): SettingsPort {
  const port = inject(SETTINGS_PORT)
  if (!port) throw new Error('SettingsPort not provided')
  return port
}
```

`src/ui/composables/useWorkspacePort.ts`:
```ts
import { inject } from 'vue'
import { WORKSPACE_PORT } from '@/infrastructure/bridge/ports'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'

export function useWorkspacePort(): WorkspacePort {
  const port = inject(WORKSPACE_PORT)
  if (!port) throw new Error('WorkspacePort not provided')
  return port
}
```

`src/ui/composables/useNotificationPort.ts`:
```ts
import { inject } from 'vue'
import { NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import type { NotificationPort } from '@/domain/ports/NotificationPort'

export function useNotificationPort(): NotificationPort {
  const port = inject(NOTIFICATION_PORT)
  if (!port) throw new Error('NotificationPort not provided')
  return port
}
```

`src/ui/composables/useLoggerPort.ts`:
```ts
import { inject } from 'vue'
import { LOGGER_PORT } from '@/infrastructure/bridge/ports'
import type { LoggerPort } from '@/domain/ports/LoggerPort'

export function useLoggerPort(): LoggerPort {
  const port = inject(LOGGER_PORT)
  if (!port) throw new Error('LoggerPort not provided')
  return port
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/ui/composables/usePorts.test.ts
```

Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/infrastructure/bridge/ports.ts src/ui/composables/ tests/ui/composables/usePorts.test.ts
git commit -m "feat(ports): add injection keys and per-port composables"
```

---

## Task 9: MockBridge (C4)

**Files:**
- Create: `src/infrastructure/mock/MockBridge.ts`
- Test: `tests/infrastructure/mock/MockBridge.test.ts`

MockBridge is the test double used by all unit tests and `npm run dev`. All five ports share one internal state object.

- [ ] **Step 1: Write the failing tests**

Create `tests/infrastructure/mock/MockBridge.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

describe('MockBridge', () => {
  let bridge: MockBridge

  beforeEach(() => {
    bridge = new MockBridge()
  })

  // VaultPort
  it('writeFile stores content; readFile retrieves it', async () => {
    await bridge.writeFile('notes/test.md', '# Hello')
    expect(await bridge.readFile('notes/test.md')).toBe('# Hello')
  })

  it('writeFile mutation visible via bridge.files', async () => {
    await bridge.writeFile('x.md', 'content')
    expect(bridge.files.get('x.md')).toBe('content')
  })

  it('fileExists returns false before write', async () => {
    expect(await bridge.fileExists('missing.md')).toBe(false)
  })

  it('fileExists returns true after write', async () => {
    await bridge.writeFile('exists.md', '')
    expect(await bridge.fileExists('exists.md')).toBe(true)
  })

  it('deleteFile removes the file', async () => {
    await bridge.writeFile('del.md', 'bye')
    await bridge.deleteFile('del.md')
    expect(await bridge.fileExists('del.md')).toBe(false)
  })

  it('listFiles returns files in folder', async () => {
    await bridge.writeFile('folder/a.md', '')
    await bridge.writeFile('folder/b.md', '')
    await bridge.writeFile('other/c.md', '')
    const files = await bridge.listFiles('folder')
    expect(files).toContain('folder/a.md')
    expect(files).toContain('folder/b.md')
    expect(files).not.toContain('other/c.md')
  })

  // SettingsPort
  it('getSettings returns DEFAULT_SETTINGS initially', () => {
    expect(bridge.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saveSettings persists and getSettings returns updated value', async () => {
    await bridge.saveSettings({ ...DEFAULT_SETTINGS, logLevel: 'debug' })
    expect(bridge.getSettings().logLevel).toBe('debug')
  })

  // NotificationPort
  it('showError appends sticky notice to bridge.notices', () => {
    bridge.showError('Something failed')
    expect(bridge.notices).toHaveLength(1)
    expect(bridge.notices[0]).toMatchObject({ message: 'Something failed', sticky: true })
  })

  it('showInfo appends non-sticky notice', () => {
    bridge.showInfo('FYI', 3000)
    expect(bridge.notices[0]).toMatchObject({ message: 'FYI', sticky: false })
  })

  // LoggerPort
  it('error call appended to bridge.logs', () => {
    bridge.error('crash happened', new Error('oops'))
    expect(bridge.logs.some((l) => l.level === 'error' && l.message === 'crash happened')).toBe(
      true,
    )
  })

  it('debug call appended to bridge.logs', () => {
    bridge.debug('trace point')
    expect(bridge.logs.some((l) => l.level === 'debug')).toBe(true)
  })

  // WorkspacePort
  it('getActiveFilePath returns null initially', () => {
    expect(bridge.getActiveFilePath()).toBeNull()
  })

  it('onActiveFileChanged fires callback when active file set', () => {
    const paths: (string | null)[] = []
    bridge.onActiveFileChanged((p) => paths.push(p))
    bridge.setActiveFilePath('new-active.md')
    expect(paths).toEqual(['new-active.md'])
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/infrastructure/mock/MockBridge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/infrastructure/mock/MockBridge.ts`**

```ts
import type { SettingsPort } from '@/domain/ports/SettingsPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'
import type { NotificationPort } from '@/domain/ports/NotificationPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

export interface MockNotice {
  message: string
  sticky: boolean
  durationMs: number
}

export interface MockLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  args: unknown[]
}

export class MockBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
{
  readonly files = new Map<string, string>()
  readonly notices: MockNotice[] = []
  readonly logs: MockLogEntry[] = []

  private settings: PluginSettings = { ...DEFAULT_SETTINGS }
  private activeFilePath: string | null = null
  private activeFileListeners: Array<(path: string | null) => void> = []

  // SettingsPort
  getSettings(): PluginSettings {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
  }

  // VaultPort
  async readFile(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) throw new Error(`File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content)
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path)
  }

  async listFiles(folder: string): Promise<string[]> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    return [...this.files.keys()].filter((k) => k.startsWith(prefix))
  }

  async listFolders(folder: string): Promise<string[]> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    const subdirs = new Set<string>()
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash !== -1) subdirs.add(prefix + rest.slice(0, slash))
      }
    }
    return [...subdirs]
  }

  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async createFolder(path: string): Promise<void> {
    // No-op in mock — folders are implicit from file paths
  }

  // WorkspacePort
  async openFile(path: string): Promise<void> {
    this.setActiveFilePath(path)
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath
  }

  onActiveFileChanged(callback: (path: string | null) => void): () => void {
    this.activeFileListeners.push(callback)
    return () => {
      this.activeFileListeners = this.activeFileListeners.filter((l) => l !== callback)
    }
  }

  /** Test helper: programmatically set active file and fire listeners */
  setActiveFilePath(path: string | null): void {
    this.activeFilePath = path
    this.activeFileListeners.forEach((l) => l(path))
  }

  // NotificationPort
  showError(message: string, durationMs = 0): void {
    this.notices.push({ message, sticky: durationMs === 0, durationMs })
  }

  showWarning(message: string, durationMs = 4000): void {
    this.notices.push({ message, sticky: false, durationMs })
  }

  showSuccess(message: string, durationMs = 4000): void {
    this.notices.push({ message, sticky: false, durationMs })
  }

  showInfo(message: string, durationMs = 4000): void {
    this.notices.push({ message, sticky: false, durationMs })
  }

  // LoggerPort
  debug(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'debug', message, args })
  }

  info(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'info', message, args })
  }

  warn(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'warn', message, args })
  }

  error(message: string, ...args: unknown[]): void {
    this.logs.push({ level: 'error', message, args })
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/infrastructure/mock/MockBridge.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/mock/MockBridge.ts tests/infrastructure/mock/MockBridge.test.ts
git commit -m "feat(mock): implement MockBridge for all five ports"
```

---

## Task 10: fakeModulePorts factory (C6)

**Files:**
- Create: `tests/__fakes__/fake-ports.ts`
- Test: `tests/__fakes__/fake-ports.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/__fakes__/fake-ports.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fakeModulePorts } from './fake-ports'

describe('fakeModulePorts', () => {
  it('all ports share the same MockBridge instance', async () => {
    const { vaultPort, bridge } = fakeModulePorts()
    await vaultPort.writeFile('shared.md', 'hello')
    expect(bridge.files.get('shared.md')).toBe('hello')
  })

  it('notification through notificationPort visible on bridge.notices', () => {
    const { notificationPort, bridge } = fakeModulePorts()
    notificationPort.showError('test error')
    expect(bridge.notices).toHaveLength(1)
    expect(bridge.notices[0].message).toBe('test error')
  })

  it('log through loggerPort visible on bridge.logs', () => {
    const { loggerPort, bridge } = fakeModulePorts()
    loggerPort.warn('test warning')
    expect(bridge.logs.some((l) => l.level === 'warn' && l.message === 'test warning')).toBe(true)
  })

  it('accepts settings overrides', () => {
    const { settingsPort } = fakeModulePorts({ logLevel: 'debug' })
    expect(settingsPort.getSettings().logLevel).toBe('debug')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/__fakes__/fake-ports.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `tests/__fakes__/fake-ports.ts`**

```ts
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type { SettingsPort } from '@/domain/ports/SettingsPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'
import type { NotificationPort } from '@/domain/ports/NotificationPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

export interface FakePorts {
  settingsPort: SettingsPort
  vaultPort: VaultPort
  workspacePort: WorkspacePort
  notificationPort: NotificationPort
  loggerPort: LoggerPort
  bridge: MockBridge
}

export function fakeModulePorts(settingsOverrides?: Partial<PluginSettings>): FakePorts {
  const bridge = new MockBridge()
  if (settingsOverrides) {
    void bridge.saveSettings({ ...DEFAULT_SETTINGS, ...settingsOverrides })
  }
  return {
    settingsPort: bridge,
    vaultPort: bridge,
    workspacePort: bridge,
    notificationPort: bridge,
    loggerPort: bridge,
    bridge,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/__fakes__/fake-ports.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/__fakes__/fake-ports.ts tests/__fakes__/fake-ports.test.ts
git commit -m "feat(test): add fakeModulePorts factory and smoke tests"
```

---

## Task 11: LocalStorageBridge (C4)

**Files:**
- Create: `src/infrastructure/localstorage/LocalStorageBridge.ts`
- Test: `tests/infrastructure/localstorage/LocalStorageBridge.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/infrastructure/localstorage/LocalStorageBridge.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

describe('LocalStorageBridge', () => {
  let bridge: LocalStorageBridge

  beforeEach(() => {
    localStorage.clear()
    bridge = new LocalStorageBridge('test-ns')
  })

  it('writeFile and readFile round-trip via localStorage', async () => {
    await bridge.writeFile('notes/a.md', '# A')
    const content = await bridge.readFile('notes/a.md')
    expect(content).toBe('# A')
  })

  it('fileExists returns false for unknown file', async () => {
    expect(await bridge.fileExists('ghost.md')).toBe(false)
  })

  it('deleteFile removes stored entry', async () => {
    await bridge.writeFile('rm.md', 'bye')
    await bridge.deleteFile('rm.md')
    expect(await bridge.fileExists('rm.md')).toBe(false)
  })

  it('getSettings returns DEFAULT_SETTINGS when nothing saved', () => {
    expect(bridge.getSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('saveSettings persists across bridge instances sharing same namespace', async () => {
    await bridge.saveSettings({ ...DEFAULT_SETTINGS, logLevel: 'debug' })
    const bridge2 = new LocalStorageBridge('test-ns')
    expect(bridge2.getSettings().logLevel).toBe('debug')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/infrastructure/localstorage/LocalStorageBridge.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/infrastructure/localstorage/LocalStorageBridge.ts`**

```ts
import type { SettingsPort } from '@/domain/ports/SettingsPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'
import type { NotificationPort } from '@/domain/ports/NotificationPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'

export class LocalStorageBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
{
  private readonly ns: string
  private activeFilePath: string | null = null
  private activeFileListeners: Array<(path: string | null) => void> = []

  constructor(namespace = 'specorator') {
    this.ns = namespace
  }

  private key(path: string): string {
    return `${this.ns}:file:${path}`
  }

  // SettingsPort
  getSettings(): PluginSettings {
    const raw = localStorage.getItem(`${this.ns}:settings`)
    return raw ? (JSON.parse(raw) as PluginSettings) : { ...DEFAULT_SETTINGS }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    localStorage.setItem(`${this.ns}:settings`, JSON.stringify(settings))
  }

  // VaultPort
  async readFile(path: string): Promise<string> {
    const content = localStorage.getItem(this.key(path))
    if (content === null) throw new Error(`File not found: ${path}`)
    return content
  }

  async writeFile(path: string, content: string): Promise<void> {
    localStorage.setItem(this.key(path), content)
  }

  async deleteFile(path: string): Promise<void> {
    localStorage.removeItem(this.key(path))
  }

  async listFiles(folder: string): Promise<string[]> {
    const prefix = `${this.ns}:file:${folder.endsWith('/') ? folder : `${folder}/`}`
    const results: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) results.push(k.slice(`${this.ns}:file:`.length))
    }
    return results
  }

  async listFolders(folder: string): Promise<string[]> {
    const files = await this.listFiles(folder)
    const prefix = folder.endsWith('/') ? folder : `${folder}/`
    const subdirs = new Set<string>()
    for (const f of files) {
      const rest = f.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash !== -1) subdirs.add(prefix + rest.slice(0, slash))
    }
    return [...subdirs]
  }

  async fileExists(path: string): Promise<boolean> {
    return localStorage.getItem(this.key(path)) !== null
  }

  async createFolder(_path: string): Promise<void> {
    // No-op — folders are implicit from file paths
  }

  // WorkspacePort
  async openFile(path: string): Promise<void> {
    this.activeFilePath = path
    this.activeFileListeners.forEach((l) => l(path))
  }

  getActiveFilePath(): string | null {
    return this.activeFilePath
  }

  onActiveFileChanged(callback: (path: string | null) => void): () => void {
    this.activeFileListeners.push(callback)
    return () => {
      this.activeFileListeners = this.activeFileListeners.filter((l) => l !== callback)
    }
  }

  // NotificationPort — no-op in localStorage runtime (used in browser demo)
  showError(message: string, _durationMs = 0): void {
    console.warn('[LocalStorageBridge] Error:', message)
  }

  showWarning(message: string, _durationMs?: number): void {
    console.warn('[LocalStorageBridge] Warning:', message)
  }

  showSuccess(message: string, _durationMs?: number): void {
    console.info('[LocalStorageBridge] Success:', message)
  }

  showInfo(message: string, _durationMs?: number): void {
    console.info('[LocalStorageBridge] Info:', message)
  }

  // LoggerPort
  debug(message: string, ...args: unknown[]): void {
    console.debug(message, ...args)
  }

  info(message: string, ...args: unknown[]): void {
    console.info(message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    console.error(message, ...args)
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/infrastructure/localstorage/LocalStorageBridge.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/localstorage/LocalStorageBridge.ts tests/infrastructure/localstorage/LocalStorageBridge.test.ts
git commit -m "feat(localstorage): implement LocalStorageBridge for all five ports"
```

---

## Task 12: Result\<T,E\> and DomainError (C5)

**Files:**
- Create: `src/domain/shared/Result.ts`
- Create: `src/domain/shared/DomainError.ts`
- Test: `tests/domain/shared/Result.test.ts`
- Test: `tests/domain/shared/DomainError.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/domain/shared/Result.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ok, err } from '@/domain/shared/Result'

describe('Result', () => {
  it('ok wraps a value', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(42)
  })

  it('err wraps an error', () => {
    const e = new Error('fail')
    const r = err(e)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(e)
  })

  it('ok result has no error property', () => {
    const r = ok('hello')
    expect(r.ok).toBe(true)
    // TypeScript narrows: r.error does not exist when r.ok is true
  })
})
```

Create `tests/domain/shared/DomainError.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DomainError } from '@/domain/shared/DomainError'

describe('DomainError', () => {
  it('sets name to the subclass constructor name', () => {
    class SlugAlreadyExistsError extends DomainError {}
    const e = new SlugAlreadyExistsError('slug taken')
    expect(e.name).toBe('SlugAlreadyExistsError')
  })

  it('preserves message', () => {
    const e = new DomainError('something went wrong')
    expect(e.message).toBe('something went wrong')
  })

  it('stores optional cause', () => {
    const cause = new Error('root cause')
    const e = new DomainError('wrapper', cause)
    expect(e.cause).toBe(cause)
  })

  it('is an instance of Error', () => {
    const e = new DomainError('test')
    expect(e).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/domain/shared/
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/domain/shared/Result.ts`**

```ts
export type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E extends Error>(error: E): Result<never, E> => ({ ok: false, error })
```

- [ ] **Step 4: Create `src/domain/shared/DomainError.ts`**

```ts
export class DomainError extends Error {
  constructor(
    message: string,
    readonly cause?: Error,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/domain/shared/
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/shared/Result.ts src/domain/shared/DomainError.ts tests/domain/shared/
git commit -m "feat(domain): add Result discriminated union and DomainError base class"
```

---

## Task 13: errorMessages and FeedbackService (C5)

**Files:**
- Create: `src/application/shared/errorMessages.ts`
- Create: `src/application/shared/FeedbackService.ts`
- Test: `tests/application/shared/FeedbackService.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/application/shared/FeedbackService.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { useFeedbackService } from '@/application/shared/FeedbackService'
import { DomainError } from '@/domain/shared/DomainError'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

function mountFeedbackService(bridge: ReturnType<typeof fakeModulePorts>['bridge']) {
  return mount(
    defineComponent({
      setup() {
        return useFeedbackService()
      },
      template: '<div/>',
    }),
    {
      global: {
        provide: {
          [LOGGER_PORT as symbol]: bridge,
          [NOTIFICATION_PORT as symbol]: bridge,
        },
      },
    },
  )
}

describe('FeedbackService', () => {
  it('reportError logs at error level and shows error notification', () => {
    const { bridge } = fakeModulePorts()
    const wrapper = mountFeedbackService(bridge)
    wrapper.vm.reportError(new Error('boom'))
    expect(bridge.logs.some((l) => l.level === 'error')).toBe(true)
    expect(bridge.notices.some((n) => n.sticky)).toBe(true)
  })

  it('reportWarning logs at warn level and shows warning notification', () => {
    const { bridge } = fakeModulePorts()
    const wrapper = mountFeedbackService(bridge)
    wrapper.vm.reportWarning('heads up')
    expect(bridge.logs.some((l) => l.level === 'warn' && l.message === 'heads up')).toBe(true)
    expect(bridge.notices.some((n) => n.message === 'heads up')).toBe(true)
  })

  it('reportInfo logs at info level and shows info notification', () => {
    const { bridge } = fakeModulePorts()
    const wrapper = mountFeedbackService(bridge)
    wrapper.vm.reportInfo('done')
    expect(bridge.logs.some((l) => l.level === 'info' && l.message === 'done')).toBe(true)
    expect(bridge.notices.some((n) => n.message === 'done')).toBe(true)
  })

  it('reportError uses toUserMessage for DomainError subtypes', () => {
    class FeatureNotFoundError extends DomainError {}
    const { bridge } = fakeModulePorts()
    const wrapper = mountFeedbackService(bridge)
    wrapper.vm.reportError(new FeatureNotFoundError('slug: abc'))
    // Should show a user-friendly message, not the raw error message
    expect(bridge.notices[0].message).not.toBe('slug: abc')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/application/shared/FeedbackService.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/application/shared/errorMessages.ts`**

Add one branch per `DomainError` subtype your project defines. The fallback handles unknown errors.

```ts
import { DomainError } from '@/domain/shared/DomainError'

export function toUserMessage(error: Error): string {
  if (error instanceof DomainError) {
    return `${error.name}: ${error.message}`
  }
  return 'An unexpected error occurred. Check the developer console for details.'
}
```

> **Note for feature development:** As you add `DomainError` subclasses (e.g. `SlugAlreadyExistsError`, `FileNotFoundError`), add explicit branches to `toUserMessage` with user-friendly strings. Replace the generic `DomainError` branch with specific ones.

- [ ] **Step 4: Create `src/application/shared/FeedbackService.ts`**

```ts
import { useLoggerPort } from '@/ui/composables/useLoggerPort'
import { useNotificationPort } from '@/ui/composables/useNotificationPort'
import { toUserMessage } from './errorMessages'

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

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/application/shared/FeedbackService.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/application/shared/errorMessages.ts src/application/shared/FeedbackService.ts tests/application/shared/FeedbackService.test.ts
git commit -m "feat(application): add FeedbackService, errorMessages, and tests"
```

---

## Task 14: ObsidianBridge (C4)

**Files:**
- Create: `src/infrastructure/obsidian/ObsidianBridge.ts`

ObsidianBridge wraps the Obsidian `App` and `Plugin` objects. It cannot be unit-tested (no Obsidian runtime in Vitest). Acceptance is: `npm run typecheck` passes and `npm run build` produces `main.js`.

- [ ] **Step 1: Create `src/infrastructure/obsidian/ObsidianBridge.ts`**

```ts
import type { App, Plugin } from 'obsidian'
import { Notice, normalizePath } from 'obsidian'
import type { SettingsPort } from '@/domain/ports/SettingsPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import type { WorkspacePort } from '@/domain/ports/WorkspacePort'
import type { NotificationPort } from '@/domain/ports/NotificationPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { DEFAULT_SETTINGS, type LogLevel, type PluginSettings } from '@/domain/settings/PluginSettings'

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

function isAtOrAbove(level: LogLevel, threshold: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(threshold)
}

export class ObsidianBridge
  implements SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort
{
  private settings: PluginSettings = { ...DEFAULT_SETTINGS }
  private activeFileListeners: Array<(path: string | null) => void> = []

  constructor(
    private readonly plugin: Plugin,
    private readonly app: App,
  ) {
    plugin.registerEvent(
      app.workspace.on('file-open', (file) => {
        const path = file?.path ?? null
        this.activeFileListeners.forEach((l) => l(path))
      }),
    )
  }

  // SettingsPort
  getSettings(): PluginSettings {
    return { ...this.settings }
  }

  async saveSettings(settings: PluginSettings): Promise<void> {
    this.settings = { ...settings }
    await this.plugin.saveData(this.settings)
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.plugin.loadData()) as Partial<PluginSettings> | null
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  }

  // VaultPort
  async readFile(path: string): Promise<string> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (!file) throw new Error(`File not found: ${path}`)
    return this.app.vault.read(file)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const normalPath = normalizePath(path)
    const existing = this.app.vault.getFileByPath(normalPath)
    if (existing) {
      await this.app.vault.modify(existing, content)
    } else {
      await this.app.vault.create(normalPath, content)
    }
  }

  async deleteFile(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (file) await this.app.vault.delete(file)
  }

  async listFiles(folder: string): Promise<string[]> {
    const abstractFolder = this.app.vault.getFolderByPath(normalizePath(folder))
    if (!abstractFolder) return []
    return abstractFolder.children
      .filter((c) => 'extension' in c)
      .map((c) => c.path)
  }

  async listFolders(folder: string): Promise<string[]> {
    const abstractFolder = this.app.vault.getFolderByPath(normalizePath(folder))
    if (!abstractFolder) return []
    return abstractFolder.children
      .filter((c) => !('extension' in c))
      .map((c) => c.path)
  }

  async fileExists(path: string): Promise<boolean> {
    return this.app.vault.getFileByPath(normalizePath(path)) !== null
  }

  async createFolder(path: string): Promise<void> {
    const normalPath = normalizePath(path)
    const existing = this.app.vault.getFolderByPath(normalPath)
    if (!existing) await this.app.vault.createFolder(normalPath)
  }

  // WorkspacePort
  async openFile(path: string): Promise<void> {
    const file = this.app.vault.getFileByPath(normalizePath(path))
    if (file) await this.app.workspace.getLeaf(false).openFile(file)
  }

  getActiveFilePath(): string | null {
    return this.app.workspace.getActiveFile()?.path ?? null
  }

  onActiveFileChanged(callback: (path: string | null) => void): () => void {
    this.activeFileListeners.push(callback)
    return () => {
      this.activeFileListeners = this.activeFileListeners.filter((l) => l !== callback)
    }
  }

  // NotificationPort
  showError(message: string, durationMs = 0): void {
    new Notice(message, durationMs)
  }

  showWarning(message: string, durationMs = 4000): void {
    new Notice(message, durationMs)
  }

  showSuccess(message: string, durationMs = 4000): void {
    new Notice(message, durationMs)
  }

  showInfo(message: string, durationMs = 4000): void {
    new Notice(message, durationMs)
  }

  // LoggerPort
  private log(level: LogLevel, message: string, args: unknown[]): void {
    if (!isAtOrAbove(level, this.settings.logLevel)) return
    const prefix = `[plugin] [${level}]`
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${message}`, ...args)
  }

  debug(message: string, ...args: unknown[]): void { this.log('debug', message, args) }
  info(message: string, ...args: unknown[]): void { this.log('info', message, args) }
  warn(message: string, ...args: unknown[]): void { this.log('warn', message, args) }
  error(message: string, ...args: unknown[]): void { this.log('error', message, args) }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: exits 0. If Obsidian typings are missing, install: `npm install --save-dev @types/node`.

- [ ] **Step 3: Commit**

```bash
git add src/infrastructure/obsidian/ObsidianBridge.ts
git commit -m "feat(obsidian): implement ObsidianBridge for all five ports"
```

---

## Task 15: Plugin and standalone entries + App.vue skeleton (C4)

**Files:**
- Create: `src/plugin/main.ts`
- Create: `src/ui/main.ts`
- Create: `src/ui/App.vue`
- Create: `src/ui/router.ts`

- [ ] **Step 1: Create `src/ui/router.ts`**

```ts
import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./views/HomeView.vue'),
    },
  ],
})
```

- [ ] **Step 2: Create a placeholder `src/ui/views/HomeView.vue`**

```vue
<script setup lang="ts">
// Placeholder home view — replace with real content in feature branches
</script>

<template>
  <div data-testid="home-view">
    <p>Plugin loaded.</p>
  </div>
</template>
```

- [ ] **Step 3: Create `src/ui/App.vue`**

```vue
<script setup lang="ts">
import ErrorBoundary from './components/ErrorBoundary.vue'
</script>

<template>
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
</template>
```

> `ErrorBoundary` is created in Task 16. Create a stub now so `App.vue` compiles.

- [ ] **Step 4: Create a stub `src/ui/components/ErrorBoundary.vue`** (temporary)

```vue
<script setup lang="ts">
// Stub — full implementation in Task 16
</script>

<template>
  <slot />
</template>
```

- [ ] **Step 5: Create `src/ui/main.ts`** (standalone entry)

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'

const bridge = new LocalStorageBridge('specorator-demo')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.provide(SETTINGS_PORT, bridge)
app.provide(VAULT_PORT, bridge)
app.provide(WORKSPACE_PORT, bridge)
app.provide(NOTIFICATION_PORT, bridge)
app.provide(LOGGER_PORT, bridge)
app.mount('#app')
```

- [ ] **Step 6: Create `src/plugin/main.ts`** (Obsidian plugin entry)

```ts
import { Plugin } from 'obsidian'
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/ui/App.vue'
import { router } from '@/ui/router'
import { ObsidianBridge } from '@/infrastructure/obsidian/ObsidianBridge'
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'

export default class SpecoratorPlugin extends Plugin {
  private vueApp: VueApp | null = null

  async onload(): Promise<void> {
    const bridge = new ObsidianBridge(this, this.app)
    await bridge.loadSettings()

    const containerEl = this.addRibbonIcon('layout', 'Open Specorator', () => {
      this.activateView()
    })

    const app = createApp(App)
    app.use(createPinia())
    app.use(router)
    app.provide(SETTINGS_PORT, bridge)
    app.provide(VAULT_PORT, bridge)
    app.provide(WORKSPACE_PORT, bridge)
    app.provide(NOTIFICATION_PORT, bridge)
    app.provide(LOGGER_PORT, bridge)
    this.vueApp = app
  }

  onunload(): void {
    this.vueApp?.unmount()
    this.vueApp = null
  }

  private activateView(): void {
    // Mount point wired in SpecoratorView — add in feature branch
  }
}
```

- [ ] **Step 7: Create `index.html`** (required for `npm run dev`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Plugin — Dev</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/ui/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: Verify plugin build compiles**

```bash
npm run build
```

Expected: `main.js` appears at project root. No errors (warnings acceptable).

- [ ] **Step 9: Commit**

```bash
git add src/plugin/main.ts src/ui/main.ts src/ui/App.vue src/ui/router.ts src/ui/views/HomeView.vue src/ui/components/ErrorBoundary.vue index.html
git commit -m "feat(plugin): wire plugin entry, standalone entry, and App.vue skeleton"
```

---

## Task 16: ErrorBoundary with PageObject TDD (C5)

**Files:**
- Modify: `src/ui/components/ErrorBoundary.vue` (replace stub from Task 15)
- Create: `tests/ui/components/ErrorBoundary.test.ts`
- Create: `tests/ui/components/ErrorBoundary.po.ts`

- [ ] **Step 1: Create the PageObject**

Create `tests/ui/components/ErrorBoundary.po.ts`:

```ts
import type { VueWrapper } from '@vue/test-utils'

export class ErrorBoundaryPO {
  constructor(private readonly wrapper: VueWrapper) {}

  get fallback() {
    return this.wrapper.find('[data-testid="error-boundary-fallback"]')
  }

  get hasError(): boolean {
    return this.fallback.exists()
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/ui/components/ErrorBoundary.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount, defineComponent } from '@vue/test-utils'
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue'
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports'
import { fakeModulePorts } from '../../__fakes__/fake-ports'
import { ErrorBoundaryPO } from './ErrorBoundary.po'

const ThrowingChild = defineComponent({
  setup() {
    throw new Error('child exploded')
  },
  template: '<div/>',
})

const SafeChild = defineComponent({
  template: '<div data-testid="safe-child">OK</div>',
})

function mountBoundary(child: ReturnType<typeof defineComponent>, bridge = fakeModulePorts().bridge) {
  const wrapper = mount(ErrorBoundary, {
    slots: { default: child },
    global: {
      provide: {
        [LOGGER_PORT as symbol]: bridge,
        [NOTIFICATION_PORT as symbol]: bridge,
      },
    },
  })
  return { wrapper, po: new ErrorBoundaryPO(wrapper), bridge }
}

describe('ErrorBoundary', () => {
  it('renders slot content when no error', () => {
    const { wrapper } = mountBoundary(SafeChild)
    expect(wrapper.find('[data-testid="safe-child"]').exists()).toBe(true)
  })

  it('renders fallback when child throws', () => {
    // Suppress Vue's console.error for the expected throw
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { po } = mountBoundary(ThrowingChild)
    expect(po.hasError).toBe(true)
    vi.restoreAllMocks()
  })

  it('calls LoggerPort.error when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bridge } = mountBoundary(ThrowingChild)
    expect(bridge.logs.some((l) => l.level === 'error')).toBe(true)
    vi.restoreAllMocks()
  })

  it('shows sticky notification when child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bridge } = mountBoundary(ThrowingChild)
    expect(bridge.notices.some((n) => n.sticky)).toBe(true)
    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npx vitest run tests/ui/components/ErrorBoundary.test.ts
```

Expected: FAIL — stub ErrorBoundary doesn't log, notify, or show fallback.

- [ ] **Step 4: Replace stub with full `src/ui/components/ErrorBoundary.vue`**

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

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run tests/ui/components/ErrorBoundary.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/ErrorBoundary.vue tests/ui/components/ErrorBoundary.test.ts tests/ui/components/ErrorBoundary.po.ts
git commit -m "feat(ui): implement ErrorBoundary with logging, notification, and fallback"
```

---

## Task 17: size-limit config (C8)

**Files:**
- Create: `.size-limit.json`

- [ ] **Step 1: Create `.size-limit.json`**

```json
[
  {
    "name": "Obsidian plugin (main.js)",
    "path": "main.js",
    "limit": "500 KB"
  }
]
```

- [ ] **Step 2: Build the plugin and run size check**

```bash
npm run build && npm run size
```

Expected: size-limit reports the current bundle size and confirms it is under 500 KB.

If the build hasn't run yet or `main.js` doesn't exist, `npm run size` will fail — always run `build` first.

- [ ] **Step 3: Commit**

```bash
git add .size-limit.json
git commit -m "chore: add size-limit budget for plugin bundle"
```

---

## Task 18: CI workflow (C7)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

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
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
      - uses: actions/setup-node@cdca7365b2dadb8aad0a33bc7601856ffabcc48e  # v4.3.0
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run verification gate
        run: npm run verify

  workflow-lint:
    name: Workflow lint and pin check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
      - name: Run actionlint
        uses: rhysd/actionlint@7fdc5630a3a1b2ab5ffa1fad17c12cdb6be9cc9a  # v1.7.7
```

> **Pin SHAs:** The SHA hashes above are examples. Before using in production, pin to the actual commit SHAs for the versions you want. Run `actionlint` locally to verify the file is valid: `brew install actionlint && actionlint`.

- [ ] **Step 2: Verify actionlint passes locally** (if installed)

```bash
actionlint .github/workflows/ci.yml
```

Expected: zero warnings or errors.

- [ ] **Step 3: Commit and push to `develop`**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add verify and workflow-lint jobs"
git push -u origin develop
```

Expected: CI runs on push to `develop`. Both jobs pass.

---

## Task 19: Final verify + acceptance checklist (C7 + C8)

Run the full gate and tick every acceptance criterion.

- [ ] **Step 1: Remove the smoke test** (it was a placeholder)

```bash
rm tests/smoke.test.ts
```

- [ ] **Step 2: Run the full verification gate**

```bash
npm run verify
```

Expected: exits 0. All steps pass in order: typecheck → lint → test:coverage → build → size → build:web → docs:api.

- [ ] **Step 3: Check coverage output**

```bash
npm run test:coverage
```

Confirm the coverage table shows thresholds met for statements ≥80, branches ≥70, functions ≥80, lines ≥80.

- [ ] **Step 4: Tick each acceptance criterion**

From the spec (`specs/plugin-architecture/design.md`):

- [ ] `npm run build` → `main.js` at project root
- [ ] `npm run build:web` → `dist-standalone/` exists
- [ ] `npm run test:coverage` → all four thresholds pass
- [ ] `npm run lint` → zero errors (including no `any`, no import violations)
- [ ] `npm run docs:api` → TypeDoc output generated
- [ ] `npm run size` → bundle within 500 KB budget
- [ ] CI green on a PR targeting `develop`
- [ ] `main` branch protection confirmed (both CI jobs required)
- [ ] `fakeModulePorts()` smoke test passes
- [ ] Zero raw `console.log` in `src/` (ESLint enforces)
- [ ] Zero `obsidian` imports in `src/domain/`, `src/application/`, `src/ui/`
- [ ] `ErrorBoundary` renders fallback on component error
- [ ] All five port composables throw on missing provider

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: baseline harness complete — all acceptance criteria met"
```

- [ ] **Step 6: Open a PR targeting `develop`**

```bash
gh pr create \
  --title "chore: pre-feature baseline harness" \
  --body "Implements all 8 capabilities from specs/plugin-architecture/design.md. npm run verify is green. All acceptance criteria met." \
  --base develop
```

---

## Self-review notes

**Spec coverage:**
- C1 ✓ Task 1
- C2 ✓ Tasks 2–5
- C3 ✓ Tasks 7–8
- C4 ✓ Tasks 9, 11, 14–15
- C5 ✓ Tasks 12–13, 16
- C6 ✓ Tasks 4, 10 (factory), 8 (composable tests), 16 (PageObject)
- C7 ✓ Tasks 18–19
- C8 ✓ Tasks 5 (ESLint complexity/type), 17 (bundle), 19 (thresholds)

**LocalStorageBridge console calls:** `LocalStorageBridge` uses `console.warn/info/error` in its `NotificationPort` and `LoggerPort` implementations. ESLint `no-console` applies to `src/**`. These calls need `// eslint-disable-next-line no-console` comments or the ESLint rule should scope to `src/` excluding `src/infrastructure/localstorage/`. Prefer the eslint-disable approach — the browser demo has no Obsidian `Notice` available, so console is intentional.

**Action required:** After Task 11 (LocalStorageBridge), add `// eslint-disable-next-line no-console` above each `console.*` call in `LocalStorageBridge.ts`, or add a targeted `eslint.config.js` override for `src/infrastructure/localstorage/**` relaxing `no-console` to `warn`.
