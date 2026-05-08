# W9 — Storybook 10 + addon-vitest + addon-a11y

**Issue:** #107 (parent epic #85)
**Date:** 2026-05-08
**Status:** Draft — pending user review

## Goal

Stand up Storybook 10 inside the Specorator plugin repo with `@storybook/addon-vitest` (interaction tests run inside Vitest) and `@storybook/addon-a11y` (axe panel). Provide an Obsidian-themed preview with light/dark variants. Seed three stories from the existing common UI surface (`AppButton`, `AppBadge`, `AppToast`) including one interaction `.test` block.

W9 is a tooling enabler — no product behavior changes. Downstream W11 (UI layout) and W12 (developer ergonomics) consume this surface.

## Acceptance criteria (verbatim from #107)

1. `storybook` (^10.3) + `@storybook/vue3-vite` + `@storybook/addon-vitest` + `@storybook/addon-a11y` installed.
2. `.storybook/main.ts` ESM-only config; addons wired.
3. `.storybook/obsidian-theme.css` mirrors Obsidian token variables.
4. At least one story authored with a `.test` interaction block.
5. `vitest.config.ts` does not exclude `stories/**`; addon-discovered tests run alongside `tests/**`.
6. `npm run storybook` boots on `:6006`; a11y panel active.

## Decisions (settled during brainstorming)

| Topic | Choice |
|---|---|
| Story scope | `AppButton`, `AppBadge`, `AppToast` |
| Vitest wiring | Single `vitest.config.ts`, inline `test.projects` split (jsdom for `tests/**`, browser+storybookTest for `stories/**`) |
| Theme | Light + dark variants, decorator toggles `body.theme-light` / `body.theme-dark` |
| CI | Local-only initially. `verify` unchanged. |

## Architecture

### Packages

devDependencies added:

- `storybook` (^10.3)
- `@storybook/vue3-vite`
- `@storybook/addon-vitest`
- `@storybook/addon-a11y`
- `@vitest/browser`
- `playwright`

Browser provider + Playwright are required because `addon-vitest` runs `play` interaction blocks in a real browser context.

### Scripts

`package.json` gains:

```json
"storybook": "storybook dev -p 6006",
"build-storybook": "storybook build"
```

`verify` script unchanged.

### File layout

```
.storybook/
  main.ts              # ESM StorybookConfig, addons wired
  preview.ts           # imports obsidian-theme.css, registers theme decorator + globalTypes
  obsidian-theme.css   # body.theme-light + body.theme-dark token sets

stories/
  common/
    AppButton.stories.ts
    AppBadge.stories.ts
    AppToast.stories.ts
```

`stories/` directory is top-level (per issue). No subfolders for non-common components yet.

### `.storybook/main.ts`

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

The `@` alias is re-declared because Storybook does not inherit `vite.config.ts` aliases for the Storybook entry.

### `.storybook/preview.ts`

- Imports `./obsidian-theme.css`.
- Declares `globalTypes.theme` toolbar dropdown (`light` | `dark`, default `dark`).
- Decorator toggles the body class to `theme-light` or `theme-dark`.
- Storybook backgrounds toolbar disabled (theme controls bg).
- a11y addon uses default config (axe ruleset).

### `.storybook/obsidian-theme.css`

Defines two token sets under `body.theme-light` and `body.theme-dark`. Token list covers the variables that current components reach for plus near-term needs:

- `--background-primary`, `--background-primary-alt`, `--background-secondary`, `--background-modifier-border`, `--background-modifier-hover`
- `--text-normal`, `--text-muted`, `--text-faint`, `--text-on-accent`, `--text-error`, `--text-success`
- `--interactive-accent`, `--interactive-accent-hover`
- `--radius-s`, `--radius-m`, `--radius-l`
- `--font-ui-small`, `--font-ui-medium`

Body element uses `var(--background-primary)` and `var(--text-normal)` so untouched components inherit theme background.

### Story authoring pattern

```ts
import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { expect, userEvent, within } from 'storybook/test'
import AppButton from '@/ui/components/common/AppButton.vue'

const meta: Meta<typeof AppButton> = {
  title: 'Common/AppButton',
  component: AppButton,
  args: { label: 'Click me' },
}
export default meta
type Story = StoryObj<typeof AppButton>

export const Default: Story = {}
export const Primary: Story = { args: { variant: 'primary' } }

export const ClickInteraction: Story = {
  args: { label: 'Press' },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    const btn = await c.findByRole('button', { name: 'Press' })
    await userEvent.click(btn)
    await expect(btn).toBeVisible()
  },
}
```

`AppButton.stories.ts` is the only file with a `play` block (satisfies AC#4). `AppBadge.stories.ts` and `AppToast.stories.ts` ship variants only.

### Vitest wiring (single config, inline projects)

`vitest.config.ts` switches to inline `test.projects` to keep jsdom-based unit tests separate from browser-based story tests in one file:

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
      thresholds: { statements: 80, branches: 70, functions: 80, lines: 80 },
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

`stories/**` is **not** excluded — it is included in the `storybook` project's pattern. Coverage `include` deliberately omits `stories/**` and `src/ui/**` so the 80/70/80/80 gate is not pulled by story files. Coverage is collected at the top-level config and merges across projects.

### ESLint

New layer block in `eslint.config.js`:

```js
{
  files: ['stories/**/*.ts', '.storybook/**/*.ts'],
  rules: {
    'no-restricted-imports': 'off',
    'max-lines': 'off',
    complexity: 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
  },
}
```

Global `ignores` additions: `storybook-static/`.

`tsconfig.lint.json` `include` extended with `stories/**` and `.storybook/**` so type-aware lint covers them.

### `.gitignore`

Add `storybook-static/`.

## Mapping to acceptance criteria

| AC | Where |
|---|---|
| 1. Packages installed | `package.json` devDependencies update |
| 2. `.storybook/main.ts` ESM, addons wired | `.storybook/main.ts` (above) |
| 3. `obsidian-theme.css` mirrors Obsidian tokens | `.storybook/obsidian-theme.css` (above) |
| 4. ≥1 story with `.test` interaction | `stories/common/AppButton.stories.ts` `ClickInteraction.play` |
| 5. `vitest.config.ts` does not exclude `stories/**`; addon-discovered tests run alongside `tests/**` | Inline `test.projects` config (above) |
| 6. `npm run storybook` boots on `:6006`; a11y panel active | `package.json` script + `addon-a11y` in `main.ts` |

## Risks / unknowns

- **Storybook 10.3 + Vite 8 + Vitest 4 compat.** Versions are recent; possible peer-dep churn. Mitigation: pin versions explicitly during install; if peer-dep blockers arise, narrow to closest compatible Storybook minor.
- **Playwright footprint.** Adds ~150MB to `node_modules`. Acceptable per local-only CI choice.
- **`obsidianmd` ESLint plugin** rules are scoped to `src/plugin/**` and `src/ui/**` files in the existing config, so `stories/**` is naturally outside their reach. Verify during implementation; add explicit disables if any rule turns out to be globally scoped.
- **`addon-vitest` API surface.** Single-config usage with inline projects is documented in Storybook 10 but the canonical recipe uses `vitest.workspace.ts`. If `storybookTest` requires workspace, fall back to `vitest.workspace.ts` while keeping the same two-project shape — does not change the developer-facing experience (`npm run test` still works).
- **`npm audit` in `verify`** runs with `--omit=dev`, so new devDependencies do not affect the gate.

## Out of scope

- W11 layout component stories (UI layout system not yet built).
- Chromatic / visual regression test integration.
- Storybook static build in CI / `verify` script.
- Stories for `FeatureCard`, `CreateFeatureForm`, `ErrorBoundary`, `HelloView` — deferred to W11/W12 or follow-up.

## Verification (pre-merge)

1. `npm run storybook` — Storybook boots on `:6006`, all three stories render, theme toolbar toggles light/dark, a11y panel populates with axe results.
2. `npm run test` — both projects (`unit`, `storybook`) report passing; `ClickInteraction.play` discovered and executed.
3. `npm run test:coverage` — thresholds 80/70/80/80 still pass; coverage report does not include `stories/**` or `.storybook/**`.
4. `npm run typecheck` — clean, including new files.
5. `npm run lint` — clean.
6. `npm run build` + `npm run build:web` — unchanged plugin and standalone bundles.
7. `npm run verify` — green end-to-end.

## Open question (deferred to implementation)

- Should `Introduction.mdx` landing page be authored? Skipped in this design — adds churn for negligible value at this stage. Add later if helpful.
