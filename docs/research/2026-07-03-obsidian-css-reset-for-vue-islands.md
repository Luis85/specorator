---
title: Obsidian CSS and the Vue island "blank slate" — inventory, ecosystem practice, techniques
date: 2026-07-03
status: complete
scope: src/style/vue baseline evolution; future Vue views (chat, Agent Board)
---

# Obsidian CSS and the Vue Island "Blank Slate"

Three-agent web research answering: **which Obsidian styles must we reset to
get a predictable (blank-slate-like) base inside Vue components, and by what
mechanism?** Agent A inventoried Obsidian's `app.css` element styling line by
line; Agent B surveyed how UI-heavy plugins isolate (or don't) their panels;
Agent C evaluated isolation techniques with worked cascade math. Full agent
reports are summarized here; sources inline.

## Headline

**A true blank slate is neither achievable cheaply nor desirable in this
ecosystem.** Every cheap technique either loses to `app.css` or wins so hard
it destroys Obsidian's own state/modifier styling and our embedded legacy
widget. The ecosystem contract — confirmed by marketplace review practice —
is the opposite of isolation: stable namespaced classes + Obsidian variables,
with themes *expected* to restyle plugin UI. Our shipped baseline (minimal
reset + `--sp-*` tokens + specificity-floor tiers) is the correct "now"; the
research yields a short list of concrete improvements and a staged path if a
future surface genuinely needs owned rendering.

## 1. What Obsidian actually styles (Agent A)

Source: full `app.css` dump (11,727 lines, Obsidian ~1.1.x — the only public
dump; variable names cross-checked against 2026 docs; re-verify against a
live install before freezing any neutralization list). Plugin `styles.css`
loads after `app.css`, so equal specificity ⇒ plugin wins by source order.

| Category | Obsidian's rules | Verdict |
|---|---|---|
| `* { box-sizing: border-box }`, body font/color/line-height via vars | (0,0,0)/(0,0,1) | **INHERIT** — native look + theme awareness for free |
| `body { user-select: none }` (inherited into islands) | (0,0,1) | **NEUTRALIZE selectively** — opt content regions in with `user-select: text`; never blanket the island (toolbars would become selectable) |
| `:focus { outline: none }` (global UA-outline kill) | (0,1,0) | INHERIT + own `:focus-visible` ring on custom focusables (our reset already does exactly this; it beats the kill at (0,2,0)) |
| Bare `h1–h6` (em sizes, theme vars; **no margins** — margins are UA defaults) | (0,0,1) | INHERIT; zero margins via `:where()` (shipped) |
| `button` + `:hover`/`:focus-visible`/`.mod-cta`/`.mod-warning`/`.mod-muted`/`.clickable-icon` | (0,0,1)–(0,2,1) | **INHERIT — the design system.** The epicenter of the "unconditional override kills state styling" trap |
| Text inputs, checkbox (fully custom `appearance:none`), range, color, `::placeholder` | (0,1,1)–(0,3,2) | INHERIT; any override ≥(0,2,1) silently kills hover/focus feedback |
| `input[type=radio\|date\|file]` | **unstyled** | **AVOID these element types** — raw Chromium widgets, never native-looking |
| `select`/`.dropdown` — arrow icon ships **only on `.dropdown`** | (0,1,0)+ | INHERIT + convention: selects always carry `dropdown` (we do) |
| `textarea` | (0,0,1) — weakest | INHERIT; set `resize` yourself |
| `a`, `kbd`, `svg.svg-icon`, `::selection`, scrollbars (respect user's native-scrollbars toggle) | various | INHERIT |
| bare `code`/`pre`/`table`/`img`/`label` | **none** (only `.markdown-rendered`-scoped) | Already a blank slate — style per component |
| `.markdown-rendered` subtrees (from `MarkdownRenderer`) | hundreds of rules | INHERIT; **exclude from any island reset** (our (0,1,0) margin zeroing already loses to its (0,1,1) rules — correct by accident of design) |
| Mobile: `.is-mobile` retunes the *variables* (`--input-height` 40px etc.); `.is-phone button { width:100% }` | (0,1,1)+ | Consume vars ⇒ mobile adaptation free; note the phone full-width button rule for future mobile work |

No `@layer`, no `:where()`/`:is()` in `app.css`; precedence is pure
specificity + source order.

## 2. Ecosystem practice (Agent B)

- **Nobody isolates.** Kanban, Excalidraw, Dataview, Projects, Tasks all use
  namespaced classes under a scope root + Obsidian vars. Zero shadow roots in
  any mainstream leaf view; the one plugin that tried Shadow DOM for real
  content (HTML Reader) abandoned it for an iframe.
- **Theme override-ability is a marketplace requirement, not a bug**: an
  official plugin review flagged `!important` precisely because it blocks
  theme/snippet restyling (dustinkeeton/obsidian-synapse#300). Minimal (the
  flagship theme) ships per-plugin support CSS that reaches into plugin roots
  and *remaps plugin-local custom properties* — our `--sp-*` layer is exactly
  the sanctioned theming API this pattern wants.
- **Kanban is the precedent for our embedded-legacy-widget situation**: it
  renders Obsidian's own markdown preview inside cards in the light DOM and
  neutralizes only the handful of properties that distort it (`width/height/
  position/overflow/color/user-select: unset`) — targeted neutralization, not
  a reset. It also puts `contain: content` on its root (layout/paint
  containment — not style isolation).
- Style Settings (`/* @settings */` YAML in CSS) is the community's standard
  channel for users to resolve theme-vs-plugin conflicts.

## 3. Techniques evaluated (Agent C — worked cascade math)

| Technique | Verdict | Why |
|---|---|---|
| `all: revert`/`unset` on `.specorator-vue *` | **NEVER** | At (0,1,0) it loses to the control rules it targets ((0,1,1)/(0,2,1)); where it wins it resurrects UA defaults (40px list padding); ties with legacy-widget rules become import-order landmines; `!important` form kills our own tiers |
| `@layer` as neutralization | **NEVER** | `app.css` (and themes/snippets) are unlayered; unlayered author styles beat layered ones by definition — layering our rules makes us strictly weaker. Internal-only layering is legal but not worth the theme-robustness tax |
| `contain` / `isolation` / `@scope` | **NEVER** (for cascade) | None affect selector matching or cascade origin. `contain: content` is still useful as *layout/paint* containment (Kanban precedent) — evaluate separately, beware absolutely-positioned children |
| Curated neutralization (per control category) | **LATER, conditionally** | Correct recipe: element compound OUTSIDE `:where()` — `.specorator-vue button:where(:not(.mod-cta):not(.mod-warning):not(.clickable-icon))` = (0,1,1), ties app.css, wins by order; exemptions work by *non-matching* (mod-cta stays fully native); every state Obsidian styles must be forked ((0,2,1)); legacy subtree carved out via `:not(:where(.specorator-roster-detail *))` at zero cost; needs a pinned-app.css characterization test. **Collision**: the (0,1,1) base beats our atoms' (0,1,0) floor — resolve via second-order tokens (`background: var(--sp-btn-bg, var(--sp-surface-raised))`). Themes still win — this buys predictability vs stock Obsidian only |
| Shadow DOM per island | **LATER (major version)** | The only true blank slate. `--sp-*` tokens pierce (custom properties inherit); author rules don't — so `MarkdownRenderer` output arrives unstyled (the practical blocker), `setIcon` needs a forked `.svg-icon` rule, focus/event retargeting degrades global handlers, themes are locked out (a product decision). Sequence after the v4.0.0 legacy deletion, decide the markdown strategy first |

## 4. Consequences for the shipped baseline

The research **validates the current design** (minimal reset, no control
primitives, tokens as the theming API, specificity-floor tiers) and the
spec's adversarial-review amendment. Concrete follow-ups:

1. **NOW (this PR)** — `user-select` opt-in for content regions: add
   `user-select: text` to the text-bearing atoms (`-card-desc`,
   `-empty-text`, `-panel-loading`) and the Agents panel's `-agent-card-desc`,
   plus a documented convention ("opt content in per region; never blanket").
   Closes a real UX gap: Obsidian's `body { user-select: none }` currently
   makes all island text unselectable.
2. **NOW (docs, Task 7)** — codify the conventions the inventory surfaced in
   `src/style/CLAUDE.md`: selects carry `.dropdown`; avoid
   `radio`/`date`/`file` inputs; exclude `.markdown-rendered` subtrees from
   island resets; custom focusables need the reset's `:focus-visible` ring
   (Obsidian killed the UA outline); consume `--sp-*`→Obsidian vars so mobile
   var-retuning works for free.
3. **EVALUATE** — `contain: content` on the island root (Kanban precedent):
   cheap layout/paint containment, but verify no absolutely-positioned child
   ever needs to escape the island before adopting.
4. **LATER (when a surface needs owned controls)** — the curated
   neutralization recipe from §3, per control category, never wholesale.
5. **LATER (major version, post-v4.0.0)** — Shadow DOM islands, gated on a
   markdown-rendering strategy and an explicit theme-lockout product
   decision.
6. **OPTIONAL** — a Style Settings `/* @settings */` block exposing key
   `--sp-*` tokens as the public theming API.

## Sources

Agent A: app.css dump `raw.githubusercontent.com/aidenlx/zotlit/3edae49/lib/components/public/app.css`; docs.obsidian.md CSS-variable references (Button, Typography). Agent B: Kanban `src/styles.less`; Excalidraw, Dataview, Projects, Tasks repos; `nuthrash/obsidian-html-plugin` CSS-Isolation wiki; `dustinkeeton/obsidian-synapse#300`; Minimal theme `src/scss/plugins/kanban.scss`; obsidian-style-settings; docs.obsidian.md Plugin guidelines / About styling; obsidian.md changelog through 1.13. Agent C: MDN (`all`, `revert-layer`, `@layer`, `contain`), web.dev Shadow DOM v1, Obsidian forum precedence threads, tailwindcss#13188.
