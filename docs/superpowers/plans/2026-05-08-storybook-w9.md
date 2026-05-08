# W9 Storybook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Storybook 10 + addon-vitest + addon-a11y inside the Specorator plugin repo with an Obsidian-themed (light/dark) preview, three seeded stories (`AppButton`, `AppBadge`, `AppToast`), and one `play` interaction block discovered by Vitest.

**Architecture:** Storybook 10.3 with `@storybook/vue3-vite` framework. Single `vitest.config.ts` using inline `test.projects` to keep existing jsdom unit tests separate from browser-based story interaction tests (Playwright provider). Theme tokens live in `.storybook/obsidian-theme.css` with `body.theme-light` / `body.theme-dark` variants; a globalTypes toolbar dropdown toggles them via decorator. Pinia + vue-i18n registered in `preview.ts` because seeded components depend on them.

**Tech Stack:** Storybook 10.3, Vue 3, Vite 8, Vitest 4 (inline projects), `@vitest/browser` + Playwright (Chromium), vue-i18n 11, Pinia 3.

**Spec:** `docs/superpowers/specs/2026-05-08-storybook-design.md`

**Branch:** `claude/storybook-w9-107` (already checked out, spec already committed).

---

## File structure

**Files to create:**
- `.storybook/main.ts` — ESM StorybookConfig, addons wired, alias re-declared.
- `.storybook/preview.ts` — imports theme CSS, registers Pinia + i18n, theme toolbar + decorator.
- `.storybook/obsidian-theme.css` — light/dark token sets.
- `stories/common/AppButton.stories.ts` — `Default`, `Primary`, `Loading`, `ClickInteraction` (with `play`).
- `stories/common/AppBadge.stories.ts` — variants for each `FeatureStatus`.
- `stories/common/AppToast.stories.ts` — story that pushes a notice via the store and renders the toast.

**Files to modify:**
- `package.json` — add devDependencies + `storybook` / `build-storybook` scripts.
- `vitest.config.ts` — inline `test.projects` (jsdom for `tests/**`, browser+storybookTest for `stories/**`).
- `eslint.config.js` — add stories/.storybook layer block + storybook-static ignore.
- `tsconfig.lint.json` — extend `include` with `stories/**` and `.storybook/**`.
- `.gitignore` — add `storybook-static/`.

---

## Task 1: Install Storybook + browser test deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Storybook + addon-vitest + a11y + browser provider**

Run from repo root:

```bash
npm install --save-dev \
  storybook@^10.3 \
  @storybook/vue3-vite@^10.3 \
  @storybook/addon-vitest@^10.3 \
  @storybook/addon-a11y@^10.3 \
  @vitest/browser@^4.1.5 \
  playwright@^1.49.0
```

Expected: packages installed; `package.json` and `package-lock.json` updated.

If npm reports peer-dep conflicts on Storybook 10.3 against Vite 8 / Vitest 4, retry with the latest published Storybook 10 minor (`storybook@10` etc.) — do not introduce `--legacy-peer-deps`.

- [ ] **Step 2: Install Playwright browser binaries**

```bash
npx playwright install chromium
```

Expected: Chromium downloaded to user-local Playwright cache.

- [ ] **Step 3: Add scripts**

Edit `package.json` `scripts` block — add `storybook` and `build-storybook`. Place between `build:web` and `test:coverage`:

```json
"build:web": "vue-tsc --noEmit && vite build",
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build",
"test:coverage": "vitest run --configLoader runner --coverage",
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add Storybook 10 + addon-vitest + addon-a11y (#107)"
```

---

## Task 2: `.storybook/main.ts` config

**Files:**
- Create: `.storybook/main.ts`

- [ ] **Step 1: Write `main.ts`**

```ts
import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  framework: '@storybook/vue3-vite',
  stories: ['../stories/**/*.stories.@(ts|mdx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-vitest'],
  viteFinal: async (cfg) => {
    cfg.resolve = cfg.resolve ?? {}
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      '@': new URL('../src', import.meta.url).pathname,
    }
    return cfg
  },
}

export default config
```

- [ ] **Step 2: Commit (held — combined with Task 3 in step 4 of Task 3)**

---

## Task 3: `.storybook/obsidian-theme.css` + `preview.ts`

**Files:**
- Create: `.storybook/obsidian-theme.css`
- Create: `.storybook/preview.ts`

- [ ] **Step 1: Write `obsidian-theme.css`**

```css
body.theme-light {
  --background-primary: #ffffff;
  --background-primary-alt: #f5f6f8;
  --background-secondary: #f2f3f5;
  --background-modifier-border: #e0e0e0;
  --background-modifier-hover: rgba(0, 0, 0, 0.05);
  --text-normal: #2e3338;
  --text-muted: #6e6e6e;
  --text-faint: #999999;
  --text-on-accent: #ffffff;
  --text-error: #e03131;
  --text-success: #197300;
  --interactive-accent: #7f6df2;
  --interactive-accent-hover: #8875ff;
  --radius-s: 4px;
  --radius-m: 8px;
  --radius-l: 12px;
  --font-ui-small: 12px;
  --font-ui-medium: 14px;
}

body.theme-dark {
  --background-primary: #1e1e1e;
  --background-primary-alt: #1a1a1a;
  --background-secondary: #161616;
  --background-modifier-border: #333333;
  --background-modifier-hover: rgba(255, 255, 255, 0.075);
  --text-normal: #dcddde;
  --text-muted: #999999;
  --text-faint: #666666;
  --text-on-accent: #ffffff;
  --text-error: #fb464c;
  --text-success: #44cf6e;
  --interactive-accent: #7f6df2;
  --interactive-accent-hover: #8875ff;
  --radius-s: 4px;
  --radius-m: 8px;
  --radius-l: 12px;
  --font-ui-small: 12px;
  --font-ui-medium: 14px;
}

body {
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 2: Write `preview.ts`**

```ts
import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3-vite'
import { createPinia } from 'pinia'
import { i18n } from '../src/ui/i18n'
import './obsidian-theme.css'

setup((app) => {
  app.use(createPinia())
  app.use(i18n)
})

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Obsidian theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light', right: '☀️' },
          { value: 'dark', title: 'Dark', right: '🌙' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (story, ctx) => {
      const theme = (ctx.globals as { theme?: 'light' | 'dark' }).theme ?? 'dark'
      document.body.classList.remove('theme-light', 'theme-dark')
      document.body.classList.add(`theme-${theme}`)
      return story()
    },
  ],
  parameters: {
    backgrounds: { disable: true },
    a11y: { test: 'todo' },
  },
}

export default preview
```

- [ ] **Step 3: Verify Storybook boots**

```bash
npm run storybook
```

Expected: Storybook dev server starts on `http://localhost:6006`. Open browser → empty story tree (no stories yet) is fine. Theme toolbar dropdown visible. a11y tab visible. Stop server with Ctrl+C.

If `setup` import path differs in installed Storybook version, replace with `import { setup } from '@storybook/vue3'` (10.x runtime export). Do not silently ignore — log the actual export path.

- [ ] **Step 4: Commit**

```bash
git add .storybook/
git commit -m "feat(storybook): add main, preview and Obsidian theme tokens (#107)"
```

---

## Task 4: Update lint, tsconfig, gitignore

**Files:**
- Modify: `eslint.config.js`
- Modify: `tsconfig.lint.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add stories/.storybook ignore exclusions to global ignores**

Edit `eslint.config.js` — add `'storybook-static/'` to the `ignores` array of the global ignore block:

```js
{
  ignores: [
    'node_modules/',
    'main.js',
    'dist-plugin/',
    'dist-standalone/',
    'coverage/',
    'storybook-static/',
    '.worktrees/',
    'docs/',
    '**/__fixtures__/**',
    '**/*.json',
    '**/*.md',
    'scripts/**',
    'version-bump.js',
  ],
},
```

- [ ] **Step 2: Add stories/.storybook layer rule block**

Append before the final closing `);` of `defineConfig(...)` in `eslint.config.js`:

```js
// Stories + Storybook config — relax architectural-boundary rules so
// stories can freely import @/ui/components and @/domain types.
{
  files: ['stories/**/*.ts', '.storybook/**/*.ts'],
  rules: {
    'no-restricted-imports': 'off',
    'max-lines': 'off',
    complexity: 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
  },
},
```

- [ ] **Step 3: Extend `tsconfig.lint.json` include**

```json
{
  "extends": "./tsconfig.json",
  "include": [
    "src/**/*.ts",
    "src/**/*.d.ts",
    "src/**/*.vue",
    "tests/**/*.ts",
    "stories/**/*.ts",
    ".storybook/**/*.ts",
    "vite.config.ts",
    "vitest.config.ts",
    "eslint.config.js"
  ],
  "exclude": []
}
```

- [ ] **Step 4: Add storybook-static to `.gitignore`**

Append after the `coverage/` line:

```
# Storybook static build output (run `npm run build-storybook` to regenerate)
storybook-static/
```

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js tsconfig.lint.json .gitignore
git commit -m "chore(lint): allow stories + .storybook layer (#107)"
```

---

## Task 5: Switch `vitest.config.ts` to inline projects

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: Rewrite `vitest.config.ts`**

Replace the entire file with:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { fileURLToPath } from 'node:url'
import { resolve } from 'path'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const alias = { '@': resolve(projectRoot, 'src') }

export default defineConfig({
  resolve: { alias },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/**',
        'src/modules/**',
        'src/core/**',
      ],
      exclude: [
        'src/infrastructure/obsidian/**',
        '**/__fixtures__/**',
        'src/infrastructure/mock/fixtures.ts',
        'src/modules/**/*.vue',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      {
        plugins: [vue()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        plugins: [vue(), storybookTest({ configDir: '.storybook' })],
        resolve: { alias },
        test: {
          name: 'storybook',
          include: ['stories/**/*.stories.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
```

- [ ] **Step 2: Run existing tests to confirm `unit` project still passes**

```bash
npm run test
```

Expected: existing unit suite passes (the new `storybook` project has no stories yet so it runs zero tests). If the runner reports the storybook project has zero collected files, that is acceptable for this step.

If Vitest 4 errors on the inline `projects` field name (some versions use `workspace` instead), check `node_modules/vitest/dist/types-*.d.ts` for the supported field name and use whichever matches the installed version. Field semantics are identical.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(vitest): split into unit + storybook inline projects (#107)"
```

---

## Task 6: Seed `AppButton.stories.ts` (TDD: `play` block first)

**Files:**
- Create: `stories/common/AppButton.stories.ts`

- [ ] **Step 1: Write the file with the failing `play` interaction first**

```ts
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'
import AppButton from '@/ui/components/common/AppButton.vue'

const meta: Meta<typeof AppButton> = {
  title: 'Common/AppButton',
  component: AppButton,
  args: { variant: 'secondary', size: 'md', disabled: false, loading: false },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
  render: (args) => ({
    components: { AppButton },
    setup: () => ({ args }),
    template: `<AppButton v-bind="args">{{ args.label ?? 'Button' }}</AppButton>`,
  }),
}
export default meta
type Story = StoryObj<typeof AppButton>

export const Default: Story = {}

export const Primary: Story = { args: { variant: 'primary' } }

export const Loading: Story = { args: { loading: true, variant: 'primary' } }

export const ClickInteraction: Story = {
  args: { variant: 'primary' },
  render: (args) => ({
    components: { AppButton },
    setup: () => ({ args }),
    template: `<AppButton v-bind="args">Press</AppButton>`,
  }),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const btn = await c.findByRole('button', { name: 'Press' })
    await expect(btn).toBeVisible()
    await userEvent.click(btn)
  },
}
```

- [ ] **Step 2: Run the storybook project to confirm `play` block is discovered**

```bash
npx vitest run --configLoader runner --project storybook
```

Expected: 1 test executed under `stories/common/AppButton.stories.ts` (the `ClickInteraction.play` block), passing.

If the project reports no tests discovered, verify `storybookTest({ configDir: '.storybook' })` plugin is present in the storybook project's `plugins` array (Task 5 step 1) and that `.storybook/main.ts` `stories` glob resolves to this file.

- [ ] **Step 3: Boot Storybook to confirm visual rendering**

```bash
npm run storybook
```

Expected: navigate to `Common / AppButton`. All four stories render. Switch theme toolbar light↔dark and confirm tokens flip. a11y panel shows axe results. Stop with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add stories/common/AppButton.stories.ts
git commit -m "feat(stories): AppButton with play interaction block (#107)"
```

---

## Task 7: Seed `AppBadge.stories.ts`

**Files:**
- Create: `stories/common/AppBadge.stories.ts`

- [ ] **Step 1: Write the stories file**

```ts
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AppBadge from '@/ui/components/common/AppBadge.vue'

const meta: Meta<typeof AppBadge> = {
  title: 'Common/AppBadge',
  component: AppBadge,
  args: { status: 'draft' },
  argTypes: {
    status: { control: 'select', options: ['draft', 'active', 'archived', 'abandoned'] },
  },
}
export default meta
type Story = StoryObj<typeof AppBadge>

export const Draft: Story = { args: { status: 'draft' } }
export const Active: Story = { args: { status: 'active' } }
export const Archived: Story = { args: { status: 'archived' } }
export const Abandoned: Story = { args: { status: 'abandoned' } }
```

- [ ] **Step 2: Verify renders in Storybook**

```bash
npm run storybook
```

Navigate to `Common / AppBadge`. Each variant shows the localised status label (`feature.status.<status>`). Stop server.

- [ ] **Step 3: Commit**

```bash
git add stories/common/AppBadge.stories.ts
git commit -m "feat(stories): AppBadge variants for FeatureStatus (#107)"
```

---

## Task 8: Seed `AppToast.stories.ts`

**Files:**
- Create: `stories/common/AppToast.stories.ts`

- [ ] **Step 1: Write the stories file**

`AppToast` reads its notice list from the Pinia store. Each story seeds the store via `setup` so the toast renders without manual DOM wiring.

```ts
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import AppToast from '@/ui/components/common/AppToast.vue'
import { useNotificationStore } from '@/ui/stores/notificationStore'

const meta: Meta<typeof AppToast> = {
  title: 'Common/AppToast',
  component: AppToast,
}
export default meta
type Story = StoryObj<typeof AppToast>

export const SingleNotice: Story = {
  render: () => ({
    components: { AppToast },
    setup() {
      const store = useNotificationStore()
      store.clearAll()
      store.addNotice('Feature created successfully', 0)
      return {}
    },
    template: `<AppToast />`,
  }),
}

export const MultipleNotices: Story = {
  render: () => ({
    components: { AppToast },
    setup() {
      const store = useNotificationStore()
      store.clearAll()
      store.addNotice('Workflow advanced to research', 0)
      store.addNotice('Saved settings', 0)
      store.addNotice('Failed to load feature', 0)
      return {}
    },
    template: `<AppToast />`,
  }),
}
```

`durationMs: 0` keeps notices sticky (matches the production sticky-error convention from `notificationStore.ts:21-26`) so the toast stays on screen during story preview.

- [ ] **Step 2: Verify renders + Pinia wiring**

```bash
npm run storybook
```

Navigate to `Common / AppToast`. Toasts render at bottom-right of preview frame. Stop server.

- [ ] **Step 3: Commit**

```bash
git add stories/common/AppToast.stories.ts
git commit -m "feat(stories): AppToast with seeded notices (#107)"
```

---

## Task 9: Verify the full gate

**Files:** none modified

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: clean. New stories/.storybook files type-check.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 3: Run test (both projects)**

```bash
npm run test
```

Expected:
- `unit` project — all existing tests pass.
- `storybook` project — 1 interaction test (`AppButton > ClickInteraction`) passes.

- [ ] **Step 4: Run coverage gate**

```bash
npm run test:coverage
```

Expected: thresholds 80/70/80/80 still pass; coverage reporter does not include `stories/**` or `.storybook/**`.

- [ ] **Step 5: Run full verify**

```bash
npm run verify
```

Expected: green end-to-end.

- [ ] **Step 6: Smoke `build-storybook` once**

```bash
npm run build-storybook
```

Expected: produces `storybook-static/` (gitignored). Confirms the production Storybook build path also works. Delete the directory after — `rm -rf storybook-static` (or `Remove-Item -Recurse storybook-static`) — to keep workspace clean.

- [ ] **Step 7: Push branch + open PR targeting develop**

```bash
git push -u origin claude/storybook-w9-107
gh pr create --base develop --title "feat(storybook): W9 Storybook 10 + addon-vitest + addon-a11y (closes #107)" --body "$(cat <<'EOF'
## Summary
- Adds Storybook 10.3 + `@storybook/vue3-vite` + `@storybook/addon-vitest` + `@storybook/addon-a11y`.
- Seeds three common stories (`AppButton`, `AppBadge`, `AppToast`); `AppButton.ClickInteraction.play` runs as a Vitest browser test.
- Splits `vitest.config.ts` into inline `unit` (jsdom) and `storybook` (Playwright) projects so existing tests keep running on jsdom.
- Adds `.storybook/obsidian-theme.css` with light + dark token sets and a theme toolbar dropdown.

## Test plan
- [ ] `npm run storybook` — boots on `:6006`, theme toolbar toggles light/dark, a11y panel populated.
- [ ] `npm run test` — both projects green.
- [ ] `npm run verify` — green.
- [ ] `npm run build-storybook` — produces static build.

Closes #107.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened against `develop`. Capture the URL and report it back.

---

## Acceptance criteria mapping

| AC (#107) | Delivered by |
|---|---|
| 1. `storybook` ^10.3 + `@storybook/vue3-vite` + `@storybook/addon-vitest` + `@storybook/addon-a11y` installed | Task 1 |
| 2. `.storybook/main.ts` ESM-only config; addons wired | Task 2 |
| 3. `.storybook/obsidian-theme.css` mirrors Obsidian token variables | Task 3 step 1 |
| 4. ≥1 story authored with a `.test` interaction block | Task 6 (`ClickInteraction.play`) |
| 5. `vitest.config.ts` does not exclude `stories/**`; addon-discovered tests run alongside `tests/**` | Task 5 |
| 6. `npm run storybook` boots on `:6006`; a11y panel active | Task 1 step 3 + Task 3 step 3 + Task 9 step 1 |
