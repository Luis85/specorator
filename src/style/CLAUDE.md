# CSS Style Guide

## Structure

```
src/style/
├── base/           # container, animations (@keyframes), variables
├── components/     # header, history, messages, code, thinking, toolcalls, status-panel, subagent, input, context-footer, tabs, nav-sidebar
├── toolbar/        # model-selector, thinking-selector, permission-toggle, service-tier-toggle, external-context, mcp-selector
├── features/       # file-context, image-context, image-modal, inline-edit, diff, slash-commands, file-link, image-embed, plan-mode, ask-user-question, resume-session, runtime-error-card
├── modals/         # instruction, mcp-modal, fork-target
├── settings/       # base (shared .specorator-sp-* panel layout), env-snippets, slash-settings, mcp-settings, plugin-settings, agent-settings
├── vue/            # Vue island baseline: tokens (--sp-*), reset, library-host, atoms — see "Vue surfaces" below
├── accessibility.css
└── index.css       # Build order (@import list)
```

## Build

CSS is built into root `styles.css` via `npm run build:css`. It is invoked by both `npm run dev` and `npm run build`.

**Adding new modules**: Register in `index.css` via `@import` or the CSS build will fail.

## Conventions

- **Prefix**: Specorator-owned classes should use the `.specorator-` prefix; shared Obsidian host selectors and generic state classes may remain unprefixed
- **BEM-lite**: Prefer `.specorator-{block}`, `.specorator-{block}-{element}`, `.specorator-{block}--{modifier}` for Specorator-owned selectors
- **No `!important`**: Avoid unless overriding Obsidian defaults
- **CSS variables**: Use Obsidian's `--background-*`, `--text-*`, `--interactive-*` tokens

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

Conventions from docs/research/2026-07-03-obsidian-css-reset-for-vue-islands.md:
selects always carry the Obsidian `dropdown` class (the arrow icon only ships
on it); avoid `radio`/`date`/`file` inputs (Obsidian leaves them as raw
Chromium widgets); never include `.markdown-rendered` subtrees in island
resets; custom focusable widgets rely on the reset's `:focus-visible` ring
(Obsidian globally removes the UA outline); text content opts into selection
per region via `user-select: text` (Obsidian sets `user-select: none` on
body) — never blanket the island.

## Naming Patterns

| Pattern | Examples |
|---------|----------|
| Layout | `-container`, `-header`, `-messages`, `-input` |
| Messages | `-message`, `-message-user`, `-message-assistant` |
| Tool calls | `-tool-call`, `-tool-header`, `-tool-content`, `-tool-status` |
| Thinking | `-thinking-block`, `-thinking-header`, `-thinking-content` |
| Panels | `-todo-list`, `-todo-item`, `-subagent-list`, `-subagent-header` |
| Context | `-file-chip`, `-image-chip`, `-mention-dropdown` |
| Plan mode | `-plan-approval-inline`, `-plan-content-preview`, `-plan-permissions`, plus shared `-ask-*` classes for approval/revision controls |
| Ask user | `-ask-list`, `-ask-item`, `-ask-cursor`, `-ask-hints` |
| Command panel | `-status-panel-bash`, `-status-panel-bash-header`, `-status-panel-bash-entry`, `-status-panel-bash-actions` |
| Modals | `-instruction-modal`, `-mcp-modal`, `-fork-target-*` |

## Gotchas

- Obsidian uses `body.theme-dark` / `body.theme-light` for theme detection
- Modal z-index must be > 1000 to overlay Obsidian UI
- Use `var(--font-monospace)` for code blocks, not hardcoded fonts
