# Vue Style Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Vue island a dedicated style baseline — a `.specorator-vue` reset, a semantic `--sp-*` token layer mapped 1:1 from Obsidian vars, and Library styles forked out of the legacy CSS into SFC-owned blocks — locked in by guards.

**Architecture:** Three CSS tiers per the approved spec (`docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`): (1) island-generic baseline in `src/style/vue/` (tokens, reset, host rules) registered in `index.css`; (2) shared cross-component vocabulary in `src/style/vue/atoms.css`; (3) component-private `<style scoped>` blocks extracted at build time by the existing `scripts/mergeVueSfcStyles.mjs` pipeline (dormant until now). Legacy CSS stays untouched except deleting one Vue-host-only rule.

**Tech Stack:** Vue 3.5 scoped SFC styles via unplugin-vue/esbuild, Vitest guard specs (`tests/vue/`), existing ratchet scripts (`check-css-important.mjs`, `check-artifacts.mjs`).

**Branch:** `claude/frontend-vue3-pinia-refactor-2ptqlt` (PR #478). Commit messages end with the session's `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq` trailer.

**Verification commands (used throughout):**
```bash
npx vitest run tests/vue          # Vue lane
npm run test:vue:coverage         # what the component CI job runs
npm run typecheck:vue             # vue-tsc
npm run typecheck                 # tsc (LibraryView.ts change)
npx eslint <changed files>
npm run build && node scripts/check-artifacts.mjs
npm run check:css && npm run check:loc && npm run check:quality
```

**Load-bearing facts for implementers (verified against the codebase):**
- The Vue island is behind the default-off `useVueLibrary` flag; transient visual states between tasks are not user-facing. Tests must stay green per task.
- `scripts/mergeVueSfcStyles.mjs` appends extracted SFC CSS to `styles.css` after its exported `VUE_STYLES_MARKER`, i.e. AFTER all `index.css` modules — SFC rules win ties by source order.
- Scoped rules compile to `.cls[data-v-x]` = specificity (0,2,0); they beat every single-class legacy rule (0,1,0). Slot content carries the PARENT's `data-v` attribute. `:deep()` requires a scoped ANCESTOR — it can never match a multi-root component's own root nodes. Imperatively created DOM (e.g. `setIcon`'s `<svg>`) carries no `data-v` — style it via `:deep()` from its host element.
- The reset uses `:where()` for margin zeroing so it stays at (0,1,0) and, being imported EARLY in `index.css`, loses ties to later legacy rules like `.specorator-roster-section` (explicit margins in the embedded detail editor survive; only true default-margin reliance is zeroed).
- `specorator-library-toolbar-slot` and bare `specorator-roster-card` have NO CSS rules anywhere — template renames only.
- Dead legacy rules NOT forked: `.specorator-library-card-error`, `-chip-ready`, `-chip-error`, `.specorator-library-header h2 { margin: 0 }` (redundant under the reset).

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/style/vue/tokens.css` | Create | `--sp-*` semantic tokens on `.specorator-vue`; ONLY place Obsidian vars appear for Vue content |
| `src/style/vue/reset.css` | Create | box-sizing, `:where()` margin zeroing, focus ring, img guard |
| `src/style/vue/library-host.css` | Create | view-header hide for `data-type="specorator-library"`, island padding |
| `src/style/vue/atoms.css` | Create | Cross-component vocabulary (panel scaffold, card slot classes, chips, empty-text) |
| `src/style/index.css` | Modify | Register the three baseline sheets + atoms early (after Base) |
| `src/style/features/library.css` | Modify | Delete ONLY the `.specorator-library-vue-root .specorator-roster-detail` rule (lines 7–11) |
| `src/features/library/LibraryView.ts` | Modify | `contentEl` class swap: `specorator-library` → `specorator-vue` |
| 8 SFCs under `src/features/library/vue/` | Modify | Class renames + `<style scoped>` blocks |
| `tests/vue/styleBaseline.test.ts` | Create | Token guard (Task 1) + namespace guard (Task 6) |
| `tests/vue/*` (5 test files) | Modify | Selector updates + snapshot regen |
| `scripts/check-css-important.mjs` | Modify | Also scan `<style>` blocks in `src/**/*.vue` |
| `scripts/check-artifacts.mjs` | Modify | Marker-aware styles.css assertions |
| `src/style/CLAUDE.md`, `docs/build-ci/quality-gates.md`, `CLAUDE.md` | Modify | Docs (Task 7) |

## Class rename map (single source of truth)

Apply with replace-all per file; where one name is a prefix of another (marked ⚠), replace the LONGER name first.

| Old | New |
|-----|-----|
| `specorator-library-nav-item` ⚠ before `-nav` | `specorator-vue-lib-nav-item` |
| `specorator-library-nav` | `specorator-vue-lib-nav` |
| `specorator-library-toolbar-slot` ⚠ before `-toolbar` | `specorator-vue-toolbar-slot` |
| `specorator-library-toolbar` | `specorator-vue-toolbar` |
| `specorator-library-search` | `specorator-vue-toolbar-search` |
| `specorator-library-sort` | `specorator-vue-toolbar-sort` |
| `specorator-library-filterchips` ⚠ before `-filterchip` | `specorator-vue-toolbar-filterchips` |
| `specorator-library-filterchip` | `specorator-vue-toolbar-filterchip` |
| `specorator-library-filterreset` | `specorator-vue-toolbar-filterreset` |
| `specorator-library-card-leading` / `-card-body` / `-card-name` / `-card-actions` / `-card-caps` / `-card-desc` / `-card-icon` / `-card-delete` ⚠ before `-card` | same suffix on `specorator-vue-card-*` |
| `specorator-library-card` | `specorator-vue-card` |
| `specorator-library-chip-muted` / `-chip-outline` ⚠ before `-chip` | `specorator-vue-chip-muted` / `-chip-outline` |
| `specorator-library-chip` | `specorator-vue-chip` |
| `specorator-library-empty-icon` / `-empty-text` / `-empty-action` ⚠ before `-empty` | `specorator-vue-empty-icon` / `-empty-text` / `-empty-action` |
| `specorator-library-empty` | `specorator-vue-empty` |
| `specorator-library-header-actions` ⚠ before `-header` | `specorator-vue-panel-actions` |
| `specorator-library-header` | `specorator-vue-panel-header` |
| `specorator-library-list` | `specorator-vue-panel-list` |
| `specorator-library-loading` | `specorator-vue-panel-loading` |
| `specorator-roster-card-avatar` ⚠ before `-roster-card` | `specorator-vue-avatar` |
| `specorator-roster-card-desc` ⚠ before `-roster-card` | `specorator-vue-agent-card-desc` |
| `specorator-roster-card` | `specorator-vue-agent-card` |
| `specorator-roster-chip-role` / `-chip-model` ⚠ before `-chip` | `specorator-vue-agent-chip-role` / `-model` |
| `specorator-roster-chip` | `specorator-vue-agent-chip` |
| `specorator-roster-detail` | **KEEP** (legacy embed boundary, allowlisted) |

---

### Task 1: Baseline live — tokens, reset, host rules, class swap, token guard

**Files:**
- Create: `src/style/vue/tokens.css`, `src/style/vue/reset.css`, `src/style/vue/library-host.css`
- Create: `tests/vue/styleBaseline.test.ts`
- Modify: `src/style/index.css` (after line 8, the Base block)
- Modify: `src/features/library/LibraryView.ts:97-98` and `:115-116`

- [ ] **Step 1: Write the failing token-guard spec**

Create `tests/vue/styleBaseline.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest.config.mts lives at the repo root, so cwd IS the repo root.
const ROOT = process.cwd();
const VUE_STYLE_DIR = join(ROOT, 'src', 'style', 'vue');
const LIBRARY_DIR = join(ROOT, 'src', 'features', 'library');

/** Recursively collect files below dir with one of the given extensions. */
function collect(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collect(abs, exts, acc);
    else if (exts.some((e) => entry.name.endsWith(e))) acc.push(abs);
  }
  return acc;
}

/** Extract the CSS of every <style> block in an SFC. */
function sfcStyleBlocks(vuePath: string): string[] {
  const source = readFileSync(vuePath, 'utf8');
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** Strip CSS comments so a mention in prose can't trip the guard. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Vue style baseline: token guard', () => {
  it('tokens.css defines only --sp-* properties, each mapped from exactly one Obsidian var', () => {
    const css = stripComments(readFileSync(join(VUE_STYLE_DIR, 'tokens.css'), 'utf8'));
    const declarations = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const [, prop, value] of declarations) {
      expect(prop, `custom property ${prop}`).toMatch(/^--sp-[\w-]+$/);
      // Exactly `var(--<obsidian-var>)` — no raw colors, sizes, or fallbacks.
      expect(value.trim(), `${prop} value`).toMatch(/^var\(--(?!sp-)[\w-]+\)$/);
    }
  });

  it('every non-token Vue stylesheet and SFC style block references only --sp-* vars', () => {
    const sheets = collect(VUE_STYLE_DIR, ['.css'])
      .filter((p) => !p.endsWith('tokens.css'))
      .map((p) => ({ id: p, css: readFileSync(p, 'utf8') }));
    const blocks = collect(LIBRARY_DIR, ['.vue']).flatMap((p) =>
      sfcStyleBlocks(p).map((css, i) => ({ id: `${p}#style[${i}]`, css })),
    );
    for (const { id, css } of [...sheets, ...blocks]) {
      const refs = [...stripComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      const offenders = refs.filter((r) => !r.startsWith('--sp-'));
      expect(offenders, `${id} must consume only --sp-* tokens`).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/vue/styleBaseline.test.ts`
Expected: FAIL — `ENOENT ... src/style/vue/tokens.css`.

- [ ] **Step 3: Create `src/style/vue/tokens.css`**

```css
/* Semantic design tokens for Vue surfaces (the `--sp-*` layer).
   THE ONLY PLACE Obsidian variables may appear for Vue-rendered island
   content — components consume `--sp-*` exclusively (enforced by
   tests/vue/styleBaseline.test.ts). Add a mapping here BEFORE using a new
   Obsidian variable in any Vue surface. Not every token has a consumer in
   the Library fork: the set is the baseline vocabulary future Vue views
   build on. */

.specorator-vue {
  /* Surfaces */
  --sp-surface: var(--background-primary);
  --sp-surface-raised: var(--background-secondary);
  --sp-surface-hover: var(--background-modifier-hover);
  /* Borders */
  --sp-border: var(--background-modifier-border);
  --sp-border-focus: var(--background-modifier-border-focus);
  /* Text */
  --sp-text: var(--text-normal);
  --sp-text-muted: var(--text-muted);
  --sp-text-faint: var(--text-faint);
  --sp-text-error: var(--text-error);
  --sp-text-on-accent: var(--text-on-accent);
  /* Accent + status */
  --sp-accent: var(--interactive-accent);
  --sp-accent-hover: var(--interactive-accent-hover);
  --sp-success: var(--color-green);
  --sp-danger: var(--color-red);
  /* Radii */
  --sp-radius-s: var(--radius-s);
  --sp-radius-m: var(--radius-m);
  /* Spacing — t-shirt scale over Obsidian's size grid.
     Forks translate var(--size-4-1) AND var(--size-2-2) (both 4px) to 2xs. */
  --sp-space-3xs: var(--size-2-1);
  --sp-space-2xs: var(--size-2-2);
  --sp-space-xs: var(--size-2-3);
  --sp-space-s: var(--size-4-2);
  --sp-space-m: var(--size-4-3);
  --sp-space-l: var(--size-4-4);
  --sp-space-xl: var(--size-4-8);
  /* Typography */
  --sp-font-small: var(--font-ui-small);
  --sp-font-smaller: var(--font-ui-smaller);
  --sp-weight-medium: var(--font-medium);
  --sp-weight-semibold: var(--font-semibold);
  --sp-mono: var(--font-monospace);
  --sp-line-tight: var(--line-height-tight);
}
```

- [ ] **Step 4: Create `src/style/vue/reset.css`**

```css
/* Baseline reset for Vue islands, scoped to `.specorator-vue` (added to the
   island mount root by LibraryView.onOpen; every future Vue view does the
   same). Deliberately minimal: Obsidian's native control styling IS the
   baseline — element primitives here would beat Obsidian's
   equal-specificity mod-cta/hover/form-field rules by source order (see the
   2026-07-03 spec, "No control primitives"). */

.specorator-vue,
.specorator-vue *,
.specorator-vue *::before,
.specorator-vue *::after {
  box-sizing: border-box;
}

/* Zero structural margins; spacing is opt-in via tokens. `:where()` keeps
   this at (0,1,0) so later-imported legacy rules with explicit margins
   (e.g. the embedded detail editor's .specorator-roster-section) win ties —
   only true default-margin reliance is zeroed. */
.specorator-vue :where(h1, h2, h3, h4, h5, h6, p, ul, ol, pre) {
  margin: 0;
}

/* One standard focus ring. Native buttons additionally keep Obsidian's
   button:focus-visible box-shadow — parity with the legacy filterchips,
   which already layer an outline over it. */
.specorator-vue :focus-visible {
  outline: 2px solid var(--sp-accent);
  outline-offset: 2px;
}

.specorator-vue img {
  max-width: 100%;
}
```

- [ ] **Step 5: Create `src/style/vue/library-host.css`**

```css
/* Host-level rules for the unified Library view. These target workspace
   chrome OUTSIDE the island's contentEl, so they cannot be scoped SFC
   styles. */

/* The in-view nav strip identifies and navigates the Library — hide the
   redundant per-view title bar, matching the three legacy library views
   (features/library.css does the same for their data-types). */
.workspace-leaf-content[data-type="specorator-library"] .view-header {
  display: none;
}

/* Island padding — replaces the legacy `.specorator-library` scaffold class
   the Vue host no longer adds. contentEl carries `.specorator-vue`, so
   `--sp-*` resolves here. */
.specorator-library-vue-root {
  padding: var(--sp-space-l);
}
```

- [ ] **Step 6: Register the sheets in `src/style/index.css`**

After the Base block (line 8, `@import "./base/modal.css";`), insert:

```css

/* Vue baseline (islands) — imported EARLY so legacy feature rules win
   specificity ties against the reset by source order. */
@import "./vue/tokens.css";
@import "./vue/reset.css";
@import "./vue/library-host.css";
```

- [ ] **Step 7: Swap the island scope class in `src/features/library/LibraryView.ts`**

In `onOpen` (currently lines 97–98) replace:
```ts
    this.contentEl.addClass('specorator-library');
    this.contentEl.addClass('specorator-library-vue-root');
```
with:
```ts
    this.contentEl.addClass('specorator-vue');
    this.contentEl.addClass('specorator-library-vue-root');
```
In `onClose` (currently lines 115–116) replace:
```ts
    this.contentEl.removeClass('specorator-library');
    this.contentEl.removeClass('specorator-library-vue-root');
```
with:
```ts
    this.contentEl.removeClass('specorator-vue');
    this.contentEl.removeClass('specorator-library-vue-root');
```
Keep the two-call shape and its comment (the shared obsidian mock's `addClass` is single-arg).

- [ ] **Step 8: Verify**

Run: `npx vitest run tests/vue && npm run typecheck && npm run typecheck:vue && npm run build:css`
Expected: styleBaseline tests PASS (second test passes vacuously — no non-token sheets reference non-sp vars; reset/host use `--sp-accent`/`--sp-space-l` which pass), all existing Vue tests PASS, CSS build succeeds.
Run: `npx eslint tests/vue/styleBaseline.test.ts src/features/library/LibraryView.ts`

- [ ] **Step 9: Commit**

```bash
git add src/style/vue/ src/style/index.css src/features/library/LibraryView.ts tests/vue/styleBaseline.test.ts
git commit -m "feat(style): Vue island baseline — --sp-* tokens, reset, library host rules"
```

---

### Task 2: Shared vocabulary — atoms.css

**Files:**
- Create: `src/style/vue/atoms.css`
- Modify: `src/style/index.css` (add one import)

The rules are forked from `src/style/features/library.css` (which stays untouched) with names from the rename map and values from the token sheet. No template uses these classes yet — they go live in Tasks 4–5.

- [ ] **Step 1: Create `src/style/vue/atoms.css`**

```css
/* Shared visual vocabulary for Vue islands — classes rendered by MORE THAN
   ONE component (including slot content, which compiles in the PARENT's
   scope, so a child's scoped block can't own it; ::v-slotted is deliberately
   not used — see the 2026-07-03 spec, Tier 2). Single-component classes live
   in that component's <style scoped> block. Only `.specorator-vue-*`
   selectors and `--sp-*` tokens are allowed here. */

/* ── Panel scaffold (all three Library panels) ── */
.specorator-vue-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  margin-bottom: var(--sp-space-l);
}

.specorator-vue-panel-actions {
  display: flex;
  gap: var(--sp-space-s);
}

.specorator-vue-panel-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}

.specorator-vue-panel-loading {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  text-align: center;
  padding: var(--sp-space-l);
}

/* ── Card slot vocabulary (rendered by panels inside LibraryCard's slots) ── */
.specorator-vue-card-caps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  margin-top: var(--sp-space-2xs);
}

.specorator-vue-card-desc {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  margin-top: var(--sp-space-3xs);
  /* Clamp long descriptions so a verbose entry can't stretch the card. */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.specorator-vue-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.specorator-vue-card-delete {
  color: var(--sp-text-error);
}

/* ── Chips ── */
/* Chip modifiers co-locate with the family even when single-consumer today
   (spec exception): one family, one place. */
.specorator-vue-chip {
  font-size: var(--sp-font-smaller);
  border-radius: var(--sp-radius-s);
  padding: 0 5px;
  line-height: 1.5;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.specorator-vue-chip-muted {
  color: var(--sp-text-muted);
  background: var(--sp-border);
}

/* Outline variant: distinguishes the read-only marker from filled chips. */
.specorator-vue-chip-outline {
  color: var(--sp-text-muted);
  background: transparent;
  border: 1px solid var(--sp-border);
}

/* ── Empty/hint copy (LibraryEmptyState + panels' loading/hint copy) ── */
.specorator-vue-empty-text {
  max-width: 36ch;
  font-size: var(--sp-font-small);
  line-height: var(--sp-line-tight);
}
```

- [ ] **Step 2: Register it in `src/style/index.css`** — extend the Vue baseline block from Task 1:

```css
@import "./vue/atoms.css";
```
(after the `library-host.css` import)

- [ ] **Step 3: Verify**

Run: `npx vitest run tests/vue/styleBaseline.test.ts && npm run build:css`
Expected: PASS — the token guard now really exercises atoms.css (it references only `--sp-*`).

- [ ] **Step 4: Commit**

```bash
git add src/style/vue/atoms.css src/style/index.css
git commit -m "feat(style): shared Vue atoms vocabulary (panel scaffold, card slots, chips)"
```

---

### Task 3: Shell fork — LibraryRoot + LibraryToolbar

**Files:**
- Modify: `src/features/library/vue/LibraryRoot.vue`
- Modify: `src/features/library/vue/components/LibraryToolbar.vue`
- Modify: `tests/vue/libraryView.test.ts`, `tests/vue/components/libraryToolbar.test.ts`

- [ ] **Step 1: Update test selectors first (failing)**

In `tests/vue/libraryView.test.ts`: replace every `.specorator-library-nav-item` with `.specorator-vue-lib-nav-item` (lines 41, 59, 72). Do NOT touch the `.specorator-library-header h2` selectors — the panel header renames land in Task 5.
In `tests/vue/components/libraryToolbar.test.ts`: replace `.specorator-library-filterchips` with `.specorator-vue-toolbar-filterchips` (line 47).

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/vue/libraryView.test.ts tests/vue/components/libraryToolbar.test.ts`
Expected: FAIL — nav-item and filterchips selectors match nothing.

- [ ] **Step 3: Rename classes in `LibraryRoot.vue` template and add its scoped block**

Template: `specorator-library-nav-item` → `specorator-vue-lib-nav-item` (line 44), then `specorator-library-nav` → `specorator-vue-lib-nav` (line 36).

Append after the `</template>`:

```vue
<style scoped>
.specorator-vue-lib-nav {
  display: flex;
  gap: var(--sp-space-2xs);
  padding-bottom: var(--sp-space-m);
  margin-bottom: var(--sp-space-m);
  border-bottom: 1px solid var(--sp-border);
}

.specorator-vue-lib-nav-item {
  flex: 1 1 0;
  font-weight: var(--sp-weight-medium);
  color: var(--sp-text-muted);
  background: var(--sp-surface-raised);
  border: 1px solid var(--sp-border);
  box-shadow: none;
  cursor: pointer;
}

.specorator-vue-lib-nav-item:hover {
  color: var(--sp-text);
}

.specorator-vue-lib-nav-item.is-active {
  color: var(--sp-text-on-accent);
  background: var(--sp-accent);
  border-color: var(--sp-accent);
  cursor: default;
}
</style>
```

- [ ] **Step 4: Rename classes in `LibraryToolbar.vue` template and add its scoped block**

Template renames (longest first): `specorator-library-filterchips` → `specorator-vue-toolbar-filterchips` (line 59), `specorator-library-filterchip` → `specorator-vue-toolbar-filterchip` (line 75), `specorator-library-filterreset` → `specorator-vue-toolbar-filterreset` (line 65), `specorator-library-search` → `specorator-vue-toolbar-search` (line 37), `specorator-library-sort` → `specorator-vue-toolbar-sort` (line 45; the adjacent `dropdown` class STAYS — it is what gives the select Obsidian's native look), `specorator-library-toolbar` → `specorator-vue-toolbar` (line 35).

Append:

```vue
<style scoped>
.specorator-vue-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-s);
  align-items: center;
  margin-bottom: var(--sp-space-s);
}

.specorator-vue-toolbar-search {
  flex: 1 1 12rem;
  min-width: 8rem;
}

.specorator-vue-toolbar-sort {
  flex: 0 0 auto;
}

.specorator-vue-toolbar-filterchips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  flex-basis: 100%;
}

.specorator-vue-toolbar-filterchip,
.specorator-vue-toolbar-filterreset {
  font-size: var(--sp-font-smaller);
  padding: var(--sp-space-3xs) var(--sp-space-xs);
  border-radius: var(--sp-radius-s);
  background: var(--sp-surface-hover);
  border: 1px solid transparent;
  cursor: pointer;
}

.specorator-vue-toolbar-filterchip.is-on {
  background: var(--sp-accent);
  color: var(--sp-text-on-accent);
}

.specorator-vue-toolbar-filterreset.is-hidden {
  display: none;
}
</style>
```
(The legacy per-class `:focus-visible` rules are NOT forked — the reset's generic ring covers them; spec "focus-ring consolidation".)

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/vue && npm run typecheck:vue && npx eslint src/features/library/vue/LibraryRoot.vue src/features/library/vue/components/LibraryToolbar.vue`
Expected: ALL PASS. If panel snapshots complain about `data-v` attrs on toolbar content, regenerate: `npx vitest run tests/vue -u` and eyeball the diff (class renames + `data-v` only).

- [ ] **Step 6: Commit**

```bash
git add src/features/library/vue/LibraryRoot.vue src/features/library/vue/components/LibraryToolbar.vue tests/vue
git commit -m "feat(library): fork nav + toolbar styles into scoped SFC blocks"
```

---

### Task 4: Card family fork — LibraryCard + AvatarSlot + LibraryEmptyState

**Files:**
- Modify: `src/features/library/vue/components/LibraryCard.vue`, `AvatarSlot.vue`, `LibraryEmptyState.vue`
- Modify: `tests/vue/components/libraryCard.test.ts:52`, `tests/vue/components/avatarSlot.test.ts:26`
- Snapshots: `tests/vue/panels/__snapshots__/*.snap`

- [ ] **Step 1: Update test selectors first (failing)**

`libraryCard.test.ts:52`: `.specorator-library-chip` → `.specorator-vue-chip`.
`avatarSlot.test.ts:26`: `'specorator-roster-card-avatar'` → `'specorator-vue-avatar'`.
Panel tests query the card family too — they break in THIS task when the components rename, so update them now:
- `.specorator-library-empty-action` → `.specorator-vue-empty-action` in `tests/vue/panels/skillsPanel.test.ts:195`, `loopsPanel.test.ts:166`, `agentsPanel.test.ts:232`.
- `.specorator-library-card` → `.specorator-vue-card` in `tests/vue/panels/skillsPanel.test.ts:227`, `loopsPanel.test.ts:203`, `agentsPanel.test.ts:381`.

Run: `npx vitest run tests/vue/components tests/vue/panels` — expected FAIL on all updated selectors.

- [ ] **Step 2: `LibraryCard.vue` — renames + scoped block**

Template renames (longest first): `-card-leading` (line 34), `-card-body` (38), `-card-name` (39), `-card-caps` (46), `-card-actions` (56) each `specorator-library-` → `specorator-vue-`; `specorator-library-chip` → `specorator-vue-chip` (51); `specorator-library-card` → `specorator-vue-card` (25).

Append:

```vue
<style scoped>
.specorator-vue-card {
  display: flex;
  align-items: center;
  gap: var(--sp-space-m);
  padding: var(--sp-space-m);
  border: 1px solid var(--sp-border);
  border-radius: var(--sp-radius-m);
  background: var(--sp-surface-raised);
}

/* The whole row is the open affordance. The reset's generic :focus-visible
   ring covers the keyboard affordance the legacy CSS declared per-class. */
.specorator-vue-card[role="button"] {
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.specorator-vue-card[role="button"]:hover {
  border-color: var(--sp-accent);
  background: var(--sp-surface-hover);
}

.specorator-vue-card-leading {
  flex: 0 0 auto;
  display: flex;
}

.specorator-vue-card-body {
  flex: 1 1 auto;
  min-width: 0;
}

.specorator-vue-card-name {
  font-weight: var(--sp-weight-semibold);
  display: flex;
  align-items: center;
  gap: var(--sp-space-s);
}

.specorator-vue-card-actions {
  flex: 0 0 auto;
  display: flex;
  gap: var(--sp-space-2xs);
}
</style>
```
(`-card-caps` and `-chip` rules live in atoms.css — this template renders them but their DOM is also slot-fed by panels.)

- [ ] **Step 3: `AvatarSlot.vue` — rename + scoped block**

Template: `specorator-roster-card-avatar` → `specorator-vue-avatar` (line 24). Append:

```vue
<style scoped>
.specorator-vue-avatar {
  flex: 0 0 auto;
  display: flex;
}
</style>
```

- [ ] **Step 4: `LibraryEmptyState.vue` — renames + scoped block**

Template renames (longest first): `specorator-library-empty-icon` (23) → `specorator-vue-empty-icon`, `specorator-library-empty-text` (25) → `specorator-vue-empty-text`, `specorator-library-empty-action` (31) → `specorator-vue-empty-action` (keep `mod-cta`), `specorator-library-empty` (20) → `specorator-vue-empty`. Append:

```vue
<style scoped>
.specorator-vue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-space-s);
  color: var(--sp-text-muted);
  text-align: center;
  padding: var(--sp-space-xl) var(--sp-space-l);
}

.specorator-vue-empty-icon {
  display: flex;
  color: var(--sp-text-faint);
}

/* setIcon() creates the <svg> imperatively — it carries no data-v attribute,
   so it MUST be reached via :deep() from its scoped host. */
.specorator-vue-empty-icon :deep(svg) {
  width: 36px;
  height: 36px;
}

.specorator-vue-empty-action {
  margin-top: var(--sp-space-2xs);
}
</style>
```
(`-empty-text` layout lives in atoms.css.)

- [ ] **Step 5: Verify + regenerate snapshots**

Run: `npx vitest run tests/vue`
Expected: component tests PASS; the three panel snapshots FAIL (renamed card/avatar/chip classes + `data-v` attrs).
Run: `npx vitest run tests/vue -u`, then `git diff tests/vue/panels/__snapshots__/` and confirm the diff is ONLY class renames + `data-v` attributes.
Run: `npm run typecheck:vue && npx eslint src/features/library/vue/components/*.vue`

- [ ] **Step 6: Commit**

```bash
git add src/features/library/vue/components tests/vue
git commit -m "feat(library): fork card, avatar, and empty-state styles into scoped SFC blocks"
```

---

### Task 5: Panels fork — renames, AgentsPanel scoped block, legacy rule deletion

**Files:**
- Modify: `src/features/library/vue/panels/LoopsPanel.vue`, `SkillsPanel.vue`, `AgentsPanel.vue`
- Modify: `src/style/features/library.css` (delete lines 7–11 ONLY)
- Modify: `tests/vue/libraryView.test.ts`, `tests/vue/panels/*.test.ts`
- Snapshots: `tests/vue/panels/__snapshots__/*.snap`

- [ ] **Step 1: Update test selectors first (failing)**

- `tests/vue/libraryView.test.ts`: `.specorator-library-header h2` → `.specorator-vue-panel-header h2` (lines 44, 61, 64, 75).
- `agentsPanel.test.ts` `.specorator-roster-detail` queries (lines 328, 331, 343): KEEP — the embed boundary does not rename. (The card/empty-action selectors were already updated in Task 4.)

Run: `npx vitest run tests/vue/libraryView.test.ts` — expected FAIL on the header selectors.

- [ ] **Step 2: Rename classes in all three panel templates**

Apply the rename map with replace-all per file, longest-first within each family:

- **All three panels:** `specorator-library-toolbar-slot` → `specorator-vue-toolbar-slot`; `specorator-library-header-actions` → `specorator-vue-panel-actions`; `specorator-library-header` → `specorator-vue-panel-header`; `specorator-library-list` → `specorator-vue-panel-list`; `specorator-library-loading` → `specorator-vue-panel-loading`; `specorator-library-empty-text` → `specorator-vue-empty-text`; `specorator-library-card-icon` → `specorator-vue-card-icon`.
- **LoopsPanel + AgentsPanel:** `specorator-library-card-delete` → `specorator-vue-card-delete`.
- **LoopsPanel + SkillsPanel:** `specorator-library-card-desc` → `specorator-vue-card-desc`.
- **SkillsPanel:** `specorator-library-chip-muted` → `specorator-vue-chip-muted`, `specorator-library-chip-outline` → `specorator-vue-chip-outline`, then `specorator-library-chip` → `specorator-vue-chip`.
- **AgentsPanel:** `specorator-library-card-caps` → `specorator-vue-card-caps`; `specorator-library-chip` → `specorator-vue-chip`; `specorator-roster-card-desc` → `specorator-vue-agent-card-desc` (line 273); `specorator-roster-card` → `specorator-vue-agent-card` (line 262); `specorator-roster-chip-role` → `specorator-vue-agent-chip-role`; `specorator-roster-chip-model` → `specorator-vue-agent-chip-model`; `specorator-roster-chip` → `specorator-vue-agent-chip`. **`specorator-roster-detail` stays.**

- [ ] **Step 3: Add AgentsPanel's scoped block**

Append to `AgentsPanel.vue`:

```vue
<style scoped>
/* Roster-specific card deltas (forked from features/agent-roster.css; the
   legacy rules stay for the legacy roster view until the v4.0.0 deletion). */
.specorator-vue-agent-card-desc {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.specorator-vue-agent-chip {
  font-size: var(--sp-font-smaller);
  color: var(--sp-text-muted);
  background: var(--sp-border);
  border-radius: var(--sp-radius-s);
  padding: 0 var(--sp-space-2xs);
}

.specorator-vue-agent-chip-role {
  color: var(--sp-text-on-accent);
  background: var(--sp-accent);
}

/* Embedded legacy detail editor: neutralize its own padding — the island
   already pads contentEl. Plain scoped rule, NOT :deep(): the host is a
   root node of this multi-root component, so no ancestor carries our scope
   attribute. Root nodes DO get our data-v attribute, and
   .specorator-roster-detail[data-v-x] (0,2,0) beats agent-roster.css's
   single-class rule (0,1,0). */
.specorator-roster-detail {
  padding: 0;
}
</style>
```
(`specorator-vue-agent-card` and `-agent-chip-model` get no rules — class-only hooks, no legacy CSS exists for them.)

- [ ] **Step 4: Delete the Vue-host rule from `src/style/features/library.css`**

Delete lines 7–11 exactly (the comment + rule):
```css
/* Vue host keeps the library padding on contentEl; neutralize the nested
   detail-editor layer so it isn't padded twice — legacy swaps classes instead. */
.specorator-library-vue-root .specorator-roster-detail {
  padding: 0;
}
```
This is the ONLY legacy CSS change in the whole plan.

- [ ] **Step 5: Verify + regenerate snapshots**

Run: `npx vitest run tests/vue`
Expected: selector tests PASS; panel snapshots FAIL on renamed classes.
Run: `npx vitest run tests/vue -u`; `git diff tests/vue/panels/__snapshots__/` must show ONLY class renames + `data-v` attrs.
Run: `npm run test:vue:coverage` — floors (88/75/90/93) must hold.
Run: `npm run typecheck:vue && npx eslint src/features/library/vue/panels/*.vue && npm run build:css`

- [ ] **Step 6: Commit**

```bash
git add src/features/library/vue/panels src/style/features/library.css tests/vue
git commit -m "feat(library): fork panel styles to the Vue namespace; drop the legacy vue-root rule"
```

---

### Task 6: Guards lock-in — namespace guard, check:css .vue scan, check:artifacts markers

**Files:**
- Modify: `tests/vue/styleBaseline.test.ts` (append namespace guard)
- Modify: `scripts/check-css-important.mjs`
- Modify: `scripts/check-artifacts.mjs`

- [ ] **Step 1: Append the namespace guard to `tests/vue/styleBaseline.test.ts`**

```ts
/** Obsidian host classes the island legitimately renders, plus the legacy
 *  detail-editor mount. Extending this list is a reviewed decision — do it
 *  in the same PR as the class that needs it. */
const NAMESPACE_ALLOWLIST = new Set(['mod-cta', 'dropdown', 'specorator-roster-detail']);

describe('Vue style baseline: namespace guard', () => {
  it('static template classes are specorator-vue-*, is-* state modifiers, or allowlisted', () => {
    for (const vuePath of collect(LIBRARY_DIR, ['.vue'])) {
      const source = readFileSync(vuePath, 'utf8');
      const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? '';
      // Static class attributes only; dynamic :class bindings are reviewed,
      // not guarded (see the 2026-07-03 spec, Guardrails).
      const classAttrs = [...template.matchAll(/(?<![:\w])class="([^"]*)"/g)].map((m) => m[1]);
      const offenders = classAttrs
        .flatMap((attr) => attr.split(/\s+/).filter(Boolean))
        .filter(
          (cls) =>
            !/^specorator-vue(-[a-z0-9]+)+$/.test(cls) &&
            !/^is-[a-z0-9-]+$/.test(cls) &&
            !NAMESPACE_ALLOWLIST.has(cls),
        );
      expect(offenders, `${vuePath}: non-namespace static classes`).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/vue/styleBaseline.test.ts`
Expected: PASS (Tasks 3–5 completed all renames). If it fails, a rename was missed — fix the template, not the guard.

- [ ] **Step 3: Extend `scripts/check-css-important.mjs` to scan SFC style blocks**

Replace the `countImportant` function (lines 53–57) and the `files` assignment (lines 81–84) with:

```js
/** Count `!important` occurrences in CSS text, ignoring CSS comments. */
function countImportantIn(text) {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return (stripped.match(/!important/g) ?? []).length;
}

function countImportant(absPath) {
  return countImportantIn(readFileSync(absPath, 'utf8'));
}

function collectVueFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectVueFiles(abs, acc);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      acc.push(abs);
    }
  }
  return acc;
}

/** `!important` in SFC <style> blocks counts too — the ratchet must not be
 *  bypassable by moving CSS into a component. */
function countVueImportant(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
  return blocks.reduce((sum, m) => sum + countImportantIn(m[1]), 0);
}
```

and (`SRC_DIR` added next to `STYLE_DIR` at the top: `const SRC_DIR = join(ROOT, 'src');`):

```js
const files = [
  ...collectCssFiles(STYLE_DIR).map((abs) => ({
    path: toPosix(relative(ROOT, abs)),
    count: countImportant(abs),
  })),
  ...collectVueFiles(SRC_DIR).map((abs) => ({
    path: toPosix(relative(ROOT, abs)),
    count: countVueImportant(abs),
  })),
]
  .filter((f) => f.count > 0)
  .sort((a, b) => b.count - a.count);
```

- [ ] **Step 4: Extend `scripts/check-artifacts.mjs` with the marker assertions**

Add at the top (after the existing imports):
```js
import { VUE_STYLES_MARKER } from './mergeVueSfcStyles.mjs';
```
Insert after the `main.js` marker block (after line 82):

```js
// SFC styles must actually reach styles.css: scoped rules carry a [data-v-
// attribute selector AFTER the merge marker, and the .specorator-vue
// baseline (tokens/reset via index.css) must sit BEFORE it. The two checks
// catch a dead merge pipeline and a dropped index.css registration
// independently.
if (existsSync(join(ROOT, 'styles.css'))) {
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const markerIdx = css.indexOf(VUE_STYLES_MARKER);
  if (markerIdx === -1) {
    errors.push('styles.css is missing the Vue SFC styles marker (mergeVueSfcStyles did not run).');
  } else {
    if (!css.slice(markerIdx + VUE_STYLES_MARKER.length).includes('[data-v-')) {
      errors.push('styles.css has no scoped SFC rules after the Vue marker (SFC style extraction is dead).');
    }
    if (!css.slice(0, markerIdx).includes('.specorator-vue')) {
      errors.push('styles.css lacks the .specorator-vue baseline before the marker (index.css registration dropped).');
    }
  }
}
```

- [ ] **Step 5: Verify the guards end-to-end**

Run: `npm run check:css`
Expected: `CSS !important guard OK` (no SFC uses `!important`; baseline untouched).
Run: `npm run build && node scripts/check-artifacts.mjs`
Expected: `Artifact check OK` — and to prove the new assertions bite, temporarily rename `VUE_STYLES_MARKER` in a scratch copy is NOT required; instead run `node -e "const c=require('fs').readFileSync('styles.css','utf8'); console.log(c.includes('[data-v-'))"` → `true`.
Run: `npx vitest run tests/vue && npx eslint tests/vue/styleBaseline.test.ts`

- [ ] **Step 6: Commit**

```bash
git add tests/vue/styleBaseline.test.ts scripts/check-css-important.mjs scripts/check-artifacts.mjs
git commit -m "quality: namespace guard + .vue-aware !important ratchet + Vue marker artifact checks"
```

---

### Task 7: Docs + full verification + PR update

**Files:**
- Modify: `src/style/CLAUDE.md`, `docs/build-ci/quality-gates.md`, `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md` frontmatter `status: approved` → `status: implemented`

- [ ] **Step 1: `src/style/CLAUDE.md`** — add to Structure the `vue/` line and a new section after Conventions:

```markdown
## Vue surfaces (`src/style/vue/` + SFC `<style scoped>`)

Three tiers (spec: docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md):

1. **Baseline** — `vue/tokens.css` (semantic `--sp-*` tokens on `.specorator-vue`,
   the ONLY place Obsidian vars appear for Vue island content), `vue/reset.css`
   (box-sizing, `:where()` margin zeroing, focus ring), `vue/library-host.css`
   (host chrome rules). Every Vue island adds `.specorator-vue` to its mount root.
2. **Shared vocabulary** — `vue/atoms.css`: classes rendered by 2+ components
   (slot content compiles in the PARENT's scope; `::v-slotted` is not used).
3. **Component-private** — `<style scoped>` per SFC, merged into `styles.css`
   after `VUE_STYLES_MARKER` by `scripts/mergeVueSfcStyles.mjs`.

Rules: Vue templates use `.specorator-vue-*` classes + `is-*` state modifiers
(allowlist for Obsidian host classes lives in `tests/vue/styleBaseline.test.ts`);
components consume `--sp-*` tokens only; NO element primitives for controls
(Obsidian's native button/input styling is the baseline — element selectors
would beat its equal-specificity mod-cta/hover rules by source order);
imperatively created DOM needs `:deep()` from its scoped host, but `:deep()`
never reaches a multi-root component's own root nodes (use a plain scoped
rule there — root nodes carry the component's own `data-v` attribute).
```

- [ ] **Step 2: `docs/build-ci/quality-gates.md`** — in the Vue component lane section, add a short "Vue style guards" paragraph naming: token guard + namespace guard (`tests/vue/styleBaseline.test.ts`, blocking via the component job), the `.vue`-aware `check:css` scan, and the two `check:artifacts` marker assertions.

- [ ] **Step 3: Root `CLAUDE.md`** — in the `features/library` row, append one sentence: "Vue surfaces style through the `.specorator-vue` baseline + `--sp-*` tokens (`src/style/vue/`, spec `docs/superpowers/specs/2026-07-03-vue-style-baseline-design.md`); legacy views keep the untouched `.specorator-library-*` CSS until the v4.0.0 deletion pass."

- [ ] **Step 4: Flip the spec status** to `status: implemented`.

- [ ] **Step 5: Full gate sweep**

```bash
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npx vitest run tests/vue && npm run test:vue:coverage && npm run build && node scripts/check-artifacts.mjs && npm run check:css && npm run check:loc && npm run check:quality
```
Expected: ALL GREEN. `check:loc`: no `.vue` file crosses the 500-line cap (largest, AgentsPanel.vue, lands ≈ 380). `check:quality`: at baseline (CSS is not analyzed by fallow).

- [ ] **Step 6: Commit, push, update PR #478**

```bash
git add -A && git commit -m "docs: Vue style baseline — style guide, quality gates, architecture notes"
git push -u origin claude/frontend-vue3-pinia-refactor-2ptqlt
```
Update the PR body (mcp github `update_pull_request`): add a "Vue style baseline" section (tokens/reset/atoms/scoped forks/guards) and extend the Manual QA checklist with the spec's Risk items: default-theme before/after comparison of the flag-on Library across all three tabs (intended deltas: view-header gone, focus-ring consolidation, zeroed structural margins), and the embedded detail editor inside the island vs the legacy roster view.

---

## Self-review notes (spec → plan)

- Every spec section maps to a task: Tier 1 → Task 1, Tier 2 → Task 2, Tier 3 + fork map → Tasks 3–5, boundaries (detail editor / library.css single deletion) → Task 5, guardrails 1–4 → Tasks 1 & 6, docs → Task 7, risks → Task 7 QA handoff.
- The reset's `:where()` + early-import placement implements the spec's "explicit legacy editor styles survive" intent (Risk 1) — spec text already matches.
- Class-only hooks (`toolbar-slot`, bare `roster-card`, `roster-chip-model`) get template renames and no CSS — per the amended fork map.
- Type/name consistency: guard helpers (`collect`, `sfcStyleBlocks`, `stripComments`) are defined in Task 1 and reused (not redefined) by Task 6's appended block; `NAMESPACE_ALLOWLIST` matches the spec's exact initial list.
