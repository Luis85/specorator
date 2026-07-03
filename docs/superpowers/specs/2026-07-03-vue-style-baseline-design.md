---
title: Vue style baseline — reset, semantic tokens, and dedicated Library styles
date: 2026-07-03
status: approved
scope: features/library (Vue island), src/style, build guards
---

# Vue Style Baseline — Reset, Semantic Tokens, and Dedicated Library Styles

## Problem

The Vue Library island ships with zero styles of its own. It mounts with
`.specorator-library specorator-library-vue-root` on `contentEl` and rides on
the same global CSS the three legacy views consume
(`src/style/features/library.css`, 355 lines, plus
`src/style/features/agent-roster.css`, 285 lines). Beyond those classes it
inherits whatever Obsidian's app CSS does to raw elements (`button`, `input`,
`select`, headings), which varies by theme.

Two problems follow:

1. **No baseline for future Vue views.** The next Vue surface (chat, Agent
   Board) would again inherit an unpredictable element baseline and would have
   no token vocabulary to build on.
2. **The Library's styles are entangled with legacy.** The v4.0.0 legacy
   deletion pass cannot simply delete `library.css` / `agent-roster.css`
   because the Vue island depends on them. "Dedicated" Vue styles make the
   deletion a pure file removal.

A concrete gap found during design: the Vue view type
(`data-type="specorator-library"`) does **not** hide Obsidian's view header,
while all three legacy view types do — flag-on currently shows a redundant
header above the in-view nav strip.

## Decisions (user-approved)

| Question | Decision |
|----------|----------|
| CSS ownership during the flag transition | **Fork into SFCs now.** Vue styles are copied under a new namespace; legacy CSS stays byte-identical — except one deletion: the `.specorator-library-vue-root .specorator-roster-detail` neutralization rule that only the Vue host consumed (see Scope classes) — and dies wholesale in the v4.0.0 deletion pass. Accepted cost: ~300 lines duplicated for one release. |
| Token strategy | **Semantic `--sp-*` layer.** Components consume only `--sp-*` custom properties; a single tokens sheet maps them 1:1 from Obsidian vars. One theming seam. |
| Reset depth | **Normalize + primitives.** Predictable baseline for the elements we render, standard focus ring, zeroed structural margins. Obsidian typography still inherits — Vue surfaces should look native. *Amended during adversarial self-review:* control primitives (button/input/select/textarea restyling) were found to fight Obsidian core rules at equal specificity and are dropped — Obsidian's native control styling is the baseline (see Reset sheet). |
| Authoring model | **Scoped SFC styles + central baseline.** Component-private rules live in `<style scoped>`; island-generic and cross-component rules live in `src/style/vue/`. |

## Architecture: three tiers

### Tier 1 — Baseline (island-generic, `src/style/vue/`)

Plain CSS registered in `src/style/index.css`, applied to every Vue island via
a shared scope class. These rules must also reach imperatively-created DOM
(`setIcon`, `MarkdownRenderer`, embedded legacy widgets), so they cannot be
scoped SFC styles.

- **`src/style/vue/tokens.css`** — defines the semantic token set on
  `.specorator-vue`. The **only** file where Obsidian variables appear for Vue
  surfaces (host-rule files aside, which style host chrome, not island
  content).
- **`src/style/vue/reset.css`** — normalize (box-sizing, structural margins),
  the standard focus ring, and the img guard under `.specorator-vue`.
- **`src/style/vue/library-host.css`** — host-level rules for the unified
  Library view that cannot live inside the island (they target workspace
  chrome outside `contentEl`), plus the island padding hook.

### Tier 2 — Shared vocabulary (`src/style/vue/atoms.css`)

Classes rendered by more than one component — chiefly slot content. Vue
compiles slot content in the *parent's* scope (the panel's `data-v`
attribute), so a `.specorator-vue-card-desc` rendered by a panel inside
`LibraryCard`'s slot is not covered by `LibraryCard`'s plain scoped rules.
Vue's `::v-slotted()` could reach it (verified supported by both
`unplugin-vue` and the Vitest lane's `@vitejs/plugin-vue`), but it is
deliberately **not used**: the same classes are also rendered by panels
outside any slot (see the fork map's multi-owner rows), where `::v-slotted`
cannot reach, and splitting one class's rules between a slotted block and
per-panel blocks would duplicate exactly the vocabulary this tier exists to
centralize. Placement rule:

> A class rendered by exactly one component → that component's
> `<style scoped>`. A class rendered by two or more components (including via
> slots) → `atoms.css`.

`atoms.css` rules use only `--sp-*` tokens and only bare `.specorator-vue-*`
class selectors — deliberately NOT nested under `.specorator-vue`: the name
prefix is the namespace, and the flat (0,1,0) specificity floor guarantees
scoped SFC rules (0,2,0) win by specificity rather than by merge order.

### Tier 3 — Component-private styles (`<style scoped>` per SFC)

Everything else. Scoped blocks are extracted at build time by the existing
`scripts/mergeVueSfcStyles.mjs` pipeline (dormant until now) and appended to
`styles.css` after `VUE_STYLES_MARKER` — i.e. after all `index.css` modules,
so SFC rules win ties by source order. Imperatively-rendered subtrees inside a
component are styled via `:deep()` from the component's scoped block.

`:deep()` caveat: it compiles to `[data-v-x] .target`, which requires an
*ancestor* carrying the component's scope attribute — it reaches descendants
of scoped elements but never a multi-root component's own root nodes. A
template root element does, however, carry the component's own `data-v`
attribute, so a plain scoped rule on the root's class works where `:deep()`
cannot (this is exactly the `AgentsPanel` detail-host case below).

## Scope classes

`LibraryView.onOpen` (flag-on branch) changes `contentEl` classes:

| Class | Before | After | Purpose |
|-------|--------|-------|---------|
| `specorator-library` | ✓ | ✗ | Legacy coupling (padding). Removed; padding moves to `library-host.css`. |
| `specorator-library-vue-root` | ✓ | ✓ | Island-specific hook; also the `check:artifacts` marker in `main.js`. Kept. |
| `specorator-vue` | ✗ | ✓ | Generic island scope. Every future Vue view adds this class to its mount root. Tokens + reset key off it. |

`onClose` removes what `onOpen` added. The `.specorator-library-vue-root
.specorator-roster-detail { padding: 0 }` neutralization rule moves out of
`library.css` into `AgentsPanel.vue` as a **plain scoped rule**
`.specorator-roster-detail { padding: 0 }` (it is Vue-host-specific;
`library.css` loses those lines — the one deliberate edit to legacy CSS, a
deletion of a rule only the Vue host consumed). `:deep()` would silently fail
here: the detail host is a root node of the multi-root `AgentsPanel`, so no
ancestor carries the panel's scope attribute. The plain scoped rule works
because root nodes receive the component's own `data-v` attribute, and the
compiled `.specorator-roster-detail[data-v-x]` (0,2,0) beats
`agent-roster.css`'s `.specorator-roster-detail` (0,1,0).

## Token sheet (`tokens.css`)

All tokens defined on `.specorator-vue`, each mapped 1:1 from an Obsidian
variable. Components never reference Obsidian vars directly; adding a new
Obsidian var means adding a mapping here first.

| Token | Maps from | Role |
|-------|-----------|------|
| `--sp-surface` | `--background-primary` | Page/panel background |
| `--sp-surface-raised` | `--background-secondary` | Cards, raised blocks |
| `--sp-surface-hover` | `--background-modifier-hover` | Hover fill |
| `--sp-border` | `--background-modifier-border` | Default border |
| `--sp-border-focus` | `--background-modifier-border-focus` | Focused-field border |
| `--sp-text` | `--text-normal` | Body text |
| `--sp-text-muted` | `--text-muted` | Secondary text |
| `--sp-text-faint` | `--text-faint` | Tertiary/decorative |
| `--sp-text-error` | `--text-error` | Error text |
| `--sp-text-on-accent` | `--text-on-accent` | Text on accent fills |
| `--sp-accent` | `--interactive-accent` | Accent fill / focus ring |
| `--sp-accent-hover` | `--interactive-accent-hover` | Accent hover |
| `--sp-success` | `--color-green` | Ready/success chips |
| `--sp-danger` | `--color-red` | Error chips, destructive |
| `--sp-radius-s` | `--radius-s` | Chips, small controls |
| `--sp-radius-m` | `--radius-m` | Cards, modals |
| `--sp-space-3xs` | `--size-2-1` | 2px |
| `--sp-space-2xs` | `--size-2-2` | 4px — forks BOTH `var(--size-2-2)` and `var(--size-4-1)` (same 4px scale point) |
| `--sp-space-xs` | `--size-2-3` | 6px |
| `--sp-space-s` | `--size-4-2` | 8px |
| `--sp-space-m` | `--size-4-3` | 12px |
| `--sp-space-l` | `--size-4-4` | 16px |
| `--sp-space-xl` | `--size-4-8` | 32px |
| `--sp-font-small` | `--font-ui-small` | Secondary text size |
| `--sp-font-smaller` | `--font-ui-smaller` | Chips, labels |
| `--sp-weight-medium` | `--font-medium` | Nav items |
| `--sp-weight-semibold` | `--font-semibold` | Card names |
| `--sp-mono` | `--font-monospace` | Code/error output |
| `--sp-line-tight` | `--line-height-tight` | Compact copy |

The forked Library styles are expressible entirely in this set: given the
`--size-4-1` → `--sp-space-2xs` alias, the forked rules in `library.css` and
`agent-roster.css` use no Obsidian var outside it. Literal values that are
intrinsic to a component (e.g. the 36px empty-state icon, `36ch` text
measure, 2-line clamp) stay literal in the component — the token set covers
theme-derived values, not every number. Not every token has a consumer in the
Library fork (e.g. the status colors): the table is the baseline vocabulary
future Vue views build on, deliberately complete across the semantic roles so
they don't grow ad-hoc mappings.

## Reset sheet (`reset.css`)

Under `.specorator-vue` (and `.specorator-vue *` where noted):

1. `box-sizing: border-box` for the island subtree (defensive; Obsidian sets
   it globally today, the island should not depend on that).
2. Zeroed default margins on `h1–h6`, `p`, `ul`, `ol`, `pre` inside the
   island. Components opt into spacing via gap/margin tokens.
3. One standard focus ring:
   `.specorator-vue :focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 2px; }`
   replacing the per-class focus rules the legacy CSS repeats. Obsidian's own
   `button:focus-visible` box-shadow still applies to native buttons alongside
   it — both indicators showing on buttons is the legacy status quo (the
   filterchip rules already layer an outline over Obsidian's box-shadow), so
   this is parity, not a regression; we do not suppress the box-shadow.
4. `img { max-width: 100%; }`.

**No control primitives.** An earlier draft restyled `button` / `input` /
`select` / `textarea` from tokens. That is unsound in Obsidian: the app's own
control rules (`button:not(.clickable-icon)`, `button.mod-cta`,
`button:hover`, `input[type='text']` + its `:hover`/`:focus` border rules)
sit at equal specificity, so a later-loaded `.specorator-vue button`
primitive wins by source order and silently kills the CTA accent fill, hover
feedback, and form-field backgrounds — for every `mod-cta` button the island
renders and for the embedded detail editor's controls. Obsidian's native
control styling **is** the baseline: it is already token-driven, theme-aware,
and state-complete. Components that need a non-native control look style it
via their own classes, never via element selectors.

Explicitly **not** reset: control backgrounds/borders/cursor (see above),
font family/size/color inheritance from the theme, scrollbars, selection
color — Vue surfaces should look native to the vault.

## Host rules (`library-host.css`)

1. Hide Obsidian's view header for the unified Library view (parity with the
   three legacy view types, closing the redundant-header gap):
   `.workspace-leaf-content[data-type="specorator-library"] .view-header { display: none; }`
2. Island padding:
   `.specorator-library-vue-root { padding: var(--sp-space-l); }`
   (replaces the padding previously inherited from `.specorator-library`).
   Since `contentEl` carries `.specorator-vue`, `--sp-*` tokens resolve here.

## Fork map

New namespace: **`.specorator-vue-*`** for cross-view vocabulary; feature
qualifiers only where a class is genuinely Library- or Agents-specific
(`.specorator-vue-lib-*`, `.specorator-vue-agent-*`). State modifiers keep the
existing `is-*` convention (`is-active`, `is-on`, `is-hidden`).

| Legacy class (stays for legacy views) | New class | Owner (tier) |
|---|---|---|
| `specorator-library-nav`, `-nav-item` | `specorator-vue-lib-nav`, `-nav-item` | `LibraryRoot.vue` (scoped) |
| `specorator-library-toolbar`, `-search`, `-sort`, `-filterchips`, `-filterchip`, `-filterreset` | `specorator-vue-toolbar`, `-toolbar-search`, `-toolbar-sort`, `-toolbar-filterchips`, `-toolbar-filterchip`, `-toolbar-filterreset` | `LibraryToolbar.vue` (scoped) |
| `specorator-library-toolbar-slot` | `specorator-vue-toolbar-slot` | all three panels — class-only hook: no CSS rule exists for it anywhere in `src/style`, so this is a template rename, not a CSS migration |
| `specorator-library-card`, `-card-leading`, `-card-body`, `-card-name`, `-card-actions` | `specorator-vue-card`, `-card-leading`, `-card-body`, `-card-name`, `-card-actions` | `LibraryCard.vue` (scoped) |
| `specorator-library-card-caps` | `specorator-vue-card-caps` | atoms (card + panels via slot) |
| `specorator-library-card-desc` | `specorator-vue-card-desc` | atoms (SkillsPanel + LoopsPanel; Agents uses the roster variant) |
| `specorator-library-card-icon` | `specorator-vue-card-icon` | atoms (all three panels) |
| `specorator-library-card-delete` | `specorator-vue-card-delete` | atoms (AgentsPanel + LoopsPanel) |
| `specorator-library-chip`, `-chip-muted`, `-chip-outline` | `specorator-vue-chip`, `-chip-muted`, `-chip-outline` | atoms — chip modifiers co-locate with the chip family even when single-consumer (`-chip-muted`/`-chip-outline` are SkillsPanel-only today); a deliberate exception to the placement rule so one family lives in one place |
| `specorator-library-header`, `-header-actions`, `-list`, `-loading` | `specorator-vue-panel-header`, `-panel-actions`, `-panel-list`, `-panel-loading` | atoms (all three panels) |
| `specorator-library-empty`, `-empty-icon`, `-empty-action` | `specorator-vue-empty`, `-empty-icon`, `-empty-action` | `LibraryEmptyState.vue` (scoped) |
| `specorator-library-empty-text` | `specorator-vue-empty-text` | atoms (LibraryEmptyState + all three panels' loading/hint copy) |
| `specorator-roster-card` (modifier), `-roster-card-desc` | `specorator-vue-agent-card`, `-agent-card-desc` | `AgentsPanel.vue` — `-agent-card-desc` scoped; the bare `-agent-card` modifier is a class-only hook (no CSS rule exists for `specorator-roster-card` in `src/style`), so it is a template rename only |
| `specorator-roster-chip`, `-chip-role` | `specorator-vue-agent-chip`, `-agent-chip-role` | `AgentsPanel.vue` (scoped) |
| `specorator-roster-chip-model` | `specorator-vue-agent-chip-model` | `AgentsPanel.vue` — class-only hook: no CSS rule exists for it anywhere in `src/style`, so this is a template rename, not a CSS migration |
| `specorator-roster-card-avatar` | `specorator-vue-avatar` | `AvatarSlot.vue` (scoped) |

**Not forked (dead rules):** `.specorator-library-card-error`,
`.specorator-library-chip-ready`, and `.specorator-library-chip-error` have
zero consumers anywhere in `src/` — they exist only as rule definitions in
`library.css`. They are not forked; if the Vue island later gains error/ready
chips, the classes are added then. `.specorator-library-header h2 { margin: 0 }`
is also not forked — it is redundant under the reset's heading-margin
zeroing.

Rules are forked with values translated to `--sp-*` tokens (e.g.
`var(--size-4-2)` → `var(--sp-space-s)`, `var(--background-secondary)` →
`var(--sp-surface-raised)`, `var(--size-4-1)` **and** `var(--size-2-2)` (both
4px) → `var(--sp-space-2xs)`, hardcoded `2px` margins →
`var(--sp-space-3xs)`).
Per-class focus-ring rules are dropped where the reset's `:focus-visible`
covers them; the card's whole-row focus affordance keeps an explicit rule if
the generic ring proves insufficient for `role="button"` divs (decided at
implementation by an axe/manual check — accessibility parity is the
requirement, not a specific rule count).

## Boundaries (what does NOT fork)

- **Embedded `AgentDetailEditor`** (imperative, mounted inside the island by
  `AgentsPanel`): keeps `.specorator-roster-*` classes and
  `agent-roster.css`. It is shared with the legacy roster view and migrates
  only when the editor itself goes Vue. The island's only touch is the
  scoped-rule padding neutralization on the detail host (see Scope classes).
- **Skill/loop editor modals and the roster's confirm dialogs**: imperative
  Obsidian modals rendering into `document.body` — outside `.specorator-vue`,
  untouched by reset and tokens, keep legacy classes.
- **Legacy CSS files**: byte-identical except deleting the single
  `.specorator-library-vue-root .specorator-roster-detail` rule that only the
  Vue host consumed.

## Guardrails

1. **Token guard** (`tests/vue/styleBaseline.test.ts`): parses every
   `src/features/library/**/*.vue` `<style>` block **and**
   `src/style/vue/atoms.css` + `reset.css`; asserts every `var(--…)`
   reference is `--sp-*`. Asserts `tokens.css` maps `--sp-*` only from
   Obsidian vars (no raw colors/sizes). Future Vue features extend the glob.
2. **Namespace guard** (same spec): static `class` attributes in SFC
   templates must match `specorator-vue-*` or `is-*` state modifiers, or
   appear in an exported allowlist constant in the guard spec. The allowlist
   is initially exactly: `specorator-roster-detail` (the legacy detail-editor
   mount) and the Obsidian host utility classes `mod-cta` and `dropdown`
   (verified as the only non-namespace static classes in today's templates).
   Any new exception requires editing the allowlist in the same PR.
   Best-effort on static classes; dynamic `:class` bindings are covered by
   review, not the guard.
3. **`check:css` extension** (`scripts/check-css-important.mjs`): scan
   `<style>` blocks in `src/**/*.vue` in addition to `src/style/**/*.css`, so
   the `!important` ratchet cannot be bypassed via SFC styles.
4. **`check:artifacts` extension**: now that SFC styles exist, assert the
   content after `VUE_STYLES_MARKER` in `styles.css` contains at least one
   `[data-v-` attribute selector (proof the SFC extraction actually merged
   scoped rules — whitespace or a stray comment must not pass), and
   separately assert `.specorator-vue` appears **before** the marker (proof
   tokens/reset shipped via `index.css`). The two assertions catch a dead
   merge pipeline and a dropped `index.css` registration independently.

## Testing impact

- The three panel snapshots regenerate (new class names + `data-v` scope
  attributes). Any test querying `.specorator-library-*` /
  `.specorator-roster-*` selectors inside Vue DOM updates to the new
  namespace.
- New `styleBaseline.test.ts` guard spec (Vitest lane, no DOM needed — file
  parsing).
- Vitest coverage floors are unaffected (CSS is not instrumented); `.vue`
  files gaining `<style>` blocks does not change statement counts.
- LOC ratchet: `.vue` files grow by their style blocks; `src/style/vue/*.css`
  is CSS (not counted by `check:loc`, which counts `.ts`/`.vue` — style-block
  growth inside `.vue` files is counted and acceptable within the ratchet).

## Docs

- `src/style/CLAUDE.md`: new "Vue surfaces" section — the three tiers, token
  table pointer, namespace rule, scoped-styles/slot rule, `:deep()` for
  imperative subtrees, "Obsidian vars only in `tokens.css`".
- `docs/build-ci/quality-gates.md`: token guard, namespace guard, extended
  `check:css` / `check:artifacts` scope.
- Root `CLAUDE.md` library row: mention the Vue style baseline.

## Risks / manual QA additions

1. **Reset bleeding into the embedded detail editor** (it sits under
   `.specorator-vue`): with control primitives dropped from the design, the
   bleed surface shrinks to the reset's margin zeroing and the generic focus
   ring. The margin zeroing is deterministic where the editor relies on
   default heading/paragraph/list margins; the generic ring adds an outline
   to its focusable elements (parity with the legacy filterchip pattern).
   Visual QA of the editor inside the island vs the legacy roster view is
   added to the PR's manual QA checklist.
2. **Theme variance**: with no element primitives fighting control styling,
   the island's exposure to community themes equals legacy's. Exotic themes
   can still restyle our classes — same as today.
3. **Visual parity**: intended visual changes are exactly (a) the
   redundant-header fix, (b) the generic `:focus-visible` ring appearing on
   focusables the legacy CSS didn't cover (e.g. the card's `role="button"`
   row keeps its ring; toolbar controls gain one), (c) zeroed structural
   margins where legacy relied on theme defaults, and (d) possible
   embedded-editor shifts per Risk 1. Everything else must be
   pixel-equivalent in the default theme; manual QA signs off deltas (a)–(d)
   explicitly when comparing flag-on before/after.

## Addendum (2026-07-03, post-research)

Web research (docs/research/2026-07-03-obsidian-css-reset-for-vue-islands.md)
validated the reset depth and "No control primitives" decisions against
Obsidian's actual `app.css`, ecosystem practice, and cascade mechanics. One
gap it surfaced ships with this spec: Obsidian sets `user-select: none` on
`body`, which inherits into islands — text-bearing atom classes
(`-card-desc`, `-empty-text`, `-panel-loading`, `-agent-card-desc`) opt back
in with `user-select: text`, per region, never island-wide. Deferred paths it
established: a curated per-control neutralization recipe (only if a surface
needs non-native controls) and Shadow DOM islands (major version,
post-v4.0.0, gated on a markdown-rendering strategy).

## Out of scope

- Restyling or migrating the detail editor, modals, chat, or Agent Board.
- Dark/light-specific tokens (Obsidian vars already resolve per theme).
- A Chip/Panel-scaffold component extraction (revisit when a second feature
  consumes the atoms).
- Deleting legacy CSS (v4.0.0 pass).
