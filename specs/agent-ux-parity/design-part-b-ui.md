# Design — Part B (UI) — Agent Sidepanel UX Parity

**Feature slug:** `agent-ux-parity`
**Area:** AUX
**Status:** Draft (UI-Designer)
**Inputs:** `specs/agent-ux-parity/idea.md` (A — current MPS audit, B — Claudian reference, delta table), `specs/agent-ux-parity/design.md` Part A (UX flows, once produced).
**Hands off to:** `architect` for Part C (Architecture). Pending escalations live in §B.8.

> Convention. Every visual decision in this document resolves to a `--sp-*` design-token name introduced in §B.1. No component in §B.2..§B.5 reads an Obsidian custom property directly; the token layer is the single seam between Obsidian's theme and Specorator's surfaces. Every hex literal that appears below is a token *definition*, not a usage site.

---

## B.1 — Design token layer (`--sp-*`)

### B.1.1 File location and mount

- New file: `src/ui/styles/tokens.css`.
- Imported exactly once, from `src/ui/main.ts` (browser entry) and `src/ui/agent/AgentSidepanelRoot.vue`'s `<style>` block via a global `@import` in `App.vue`. The plugin entry (`src/plugin/main.ts`) already serves `styles.css` to Obsidian; the build copies `tokens.css` into the final `styles.css` bundle (Vite handles this via `cssCodeSplit: false`).
- Scope. All tokens are declared on the `.specorator-root` selector (already present at the app shell). Sub-scoping by `[data-provider="claude|codex|opencode"]` overrides brand-flavour tokens only.

### B.1.2 Mapping rule

Every `--sp-*` token has a *default value* that **resolves to an Obsidian custom property** so user themes continue to drive the palette. Where Claudian uses a literal (e.g. brand orange), we keep the literal — but only inside the token-definition file, never at the usage site.

```css
/* src/ui/styles/tokens.css (excerpt — see full set below) */
.specorator-root {
  /* Color — Obsidian-mapped */
  --sp-text-normal:        var(--text-normal);
  --sp-text-muted:         var(--text-muted);
  --sp-text-faint:         var(--text-faint);
  --sp-bg-primary:         var(--background-primary);
  --sp-bg-primary-alt:     var(--background-primary-alt);
  --sp-bg-secondary:       var(--background-secondary);
  --sp-bg-secondary-alt:   var(--background-secondary-alt);
  --sp-border:             var(--background-modifier-border);
  --sp-border-strong:      var(--background-modifier-border-hover);
  --sp-interactive-accent: var(--interactive-accent);
  --sp-interactive-hover:  var(--background-modifier-hover);
  --sp-error:              var(--text-error, #dc3545);
  --sp-error-rgb:          220, 53, 69;
  --sp-warning:            var(--color-orange, #d97706);
  --sp-success:            var(--color-green, #16a34a);
  --sp-compact:            #5bc0de;

  /* Brand — provider-flavour overrides live below */
  --sp-brand:              var(--sp-brand-claude);
  --sp-brand-rgb:          var(--sp-brand-claude-rgb);
  --sp-brand-claude:       #D97757;
  --sp-brand-claude-rgb:   217, 119, 87;
  --sp-brand-codex:        #d0d0d0;
  --sp-brand-codex-rgb:    208, 208, 208;
  --sp-brand-opencode:     #B8B8B8;
  --sp-brand-opencode-rgb: 184, 184, 184;
  --sp-brand-cursor:       #6b7280;       /* TBD — see §B.8 Q1 */
  --sp-brand-cursor-rgb:   107, 114, 128;
  --sp-brand-translucent:  rgba(var(--sp-brand-rgb), 0.15);
  --sp-accent:             var(--sp-brand);
}

body.theme-light .specorator-root {
  --sp-brand-codex:        #000000;
  --sp-brand-codex-rgb:    0, 0, 0;
  --sp-brand-opencode:     #707070;
  --sp-brand-opencode-rgb: 112, 112, 112;
}

.specorator-root[data-provider="claude"]   { --sp-brand: var(--sp-brand-claude);   --sp-brand-rgb: var(--sp-brand-claude-rgb); }
.specorator-root[data-provider="codex"]    { --sp-brand: var(--sp-brand-codex);    --sp-brand-rgb: var(--sp-brand-codex-rgb); }
.specorator-root[data-provider="opencode"] { --sp-brand: var(--sp-brand-opencode); --sp-brand-rgb: var(--sp-brand-opencode-rgb); }
.specorator-root[data-provider="cursor"]   { --sp-brand: var(--sp-brand-cursor);   --sp-brand-rgb: var(--sp-brand-cursor-rgb); }
```

### B.1.3 Full token catalogue

**Color**

| Token | Default | Purpose |
|---|---|---|
| `--sp-text-normal` | `var(--text-normal)` | Body text, assistant text, button labels |
| `--sp-text-muted` | `var(--text-muted)` | Secondary text, timestamps, hint copy |
| `--sp-text-faint` | `var(--text-faint)` | Tertiary, disabled, idle-action icons |
| `--sp-bg-primary` | `var(--background-primary)` | Composer background, dropdown surface |
| `--sp-bg-primary-alt` | `var(--background-primary-alt)` | Approval-card body, code chip |
| `--sp-bg-secondary` | `var(--background-secondary)` | Dropdown panel, history menu, header tooltip |
| `--sp-bg-secondary-alt` | `var(--background-secondary-alt)` | Table-row hover, model option highlight |
| `--sp-border` | `var(--background-modifier-border)` | Composer outline, tab badge idle |
| `--sp-border-strong` | `var(--background-modifier-border-hover)` | Tab badge hover, scrollbar thumb hover |
| `--sp-interactive-accent` | `var(--interactive-accent)` | Active tab badge, focus rings |
| `--sp-interactive-hover` | `var(--background-modifier-hover)` | Generic hover wash |
| `--sp-brand` | provider override | Brand accent (icons, send button, streaming border) |
| `--sp-brand-translucent` | `rgba(--sp-brand-rgb, 0.15)` | Selected model row, brand wash |
| `--sp-accent` | `var(--sp-brand)` | Per-message action icon hover, mode label |
| `--sp-error` | `var(--text-error)` | Error icons, approval-deny, attention badge |
| `--sp-warning` | `var(--color-orange)` | Context meter > 80%, blocked tool status |
| `--sp-success` | `var(--color-green)` | Approval-allow, completed todo, copied confirm |
| `--sp-compact` | `#5bc0de` | Compact-boundary divider |

**Typography**

| Token | Default | Purpose |
|---|---|---|
| `--sp-font-text` | `var(--font-text)` | Default UI font |
| `--sp-font-mono` | `var(--font-monospace)` | Tool calls, code, approval body, bash mode |
| `--sp-font-serif` | `Copernicus, 'Tiempos Headline', Tiempos, Georgia, 'Times New Roman', serif` | Welcome greeting |
| `--sp-font-size-xs` | `11px` | Timestamps, tooltips, percent labels, copy-confirm |
| `--sp-font-size-sm` | `12px` | Tool-name, mode-label, slash hint, file chip, status panel todo |
| `--sp-font-size-md` | `13px` | Tool-summary, status panel label, thinking content, history title |
| `--sp-font-size-base` | `14px` | Body text, composer, title, button label |
| `--sp-font-size-lg` | `15px` | Reserved (selection indicator long-text) |
| `--sp-font-size-xl` | `16px` | Header logo icon, message bubble heading |
| `--sp-font-size-display` | `28px` | Welcome greeting |
| `--sp-font-weight-light` | `300` | Welcome greeting |
| `--sp-font-weight-medium` | `500` | Mode-label-active, model-label, tab badge digit, history title |
| `--sp-font-weight-semibold` | `600` | Title text, table header, approval tool name, mode-active |
| `--sp-line-height-tight` | `1.4` | Code, bash output |
| `--sp-line-height-normal` | `1.5` | Message body, thinking content |

**Spacing rhythm** (used across padding, gap, margin)

| Token | Default |
|---|---|
| `--sp-space-1` | `2px` |
| `--sp-space-2` | `4px` |
| `--sp-space-3` | `6px` |
| `--sp-space-4` | `8px` |
| `--sp-space-5` | `12px` |
| `--sp-space-6` | `16px` |
| `--sp-space-7` | `24px` |

**Radii**

| Token | Default | Purpose |
|---|---|---|
| `--sp-radius-xs` | `3px` | Slash item, mode tab, code lang label |
| `--sp-radius-sm` | `4px` | Tab badge, action button, header tooltip |
| `--sp-radius-md` | `6px` | Composer wrapper, dropdown menu, code block, approval tool row |
| `--sp-radius-lg` | `8px` | Message bubble, status panel container |
| `--sp-radius-pill` | `9px` | Toggle switch (half of 18px height) |
| `--sp-radius-pill-lg` | `12px` | File chip |
| `--sp-radius-pill-xl` | `16px` | Nav-sidebar circular button (32 / 2) |
| `--sp-radius-full` | `999px` | File-chip remove circle, badges |
| `--sp-radius-bubble-tail-user` | `4px` | `border-end-end-radius` for user bubble |
| `--sp-radius-bubble-tail-assistant` | `4px` | `border-end-start-radius` for assistant bubble |

**Shadows**

| Token | Default | Purpose |
|---|---|---|
| `--sp-shadow-subtle` | `var(--shadow-s, 0 2px 4px rgba(0,0,0,0.1))` | Nav-sidebar button, header tooltip |
| `--sp-shadow-dropup` | `0 -4px 16px rgba(0,0,0,0.2)` | Slash dropdown, model dropdown, history menu (above input) |
| `--sp-shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.25)` | History menu in header mode |
| `--sp-shadow-focus-ring` | `0 0 0 2px var(--sp-interactive-accent)` | Composer focus, rename input focus |

**Z-index scale**

| Token | Default | Purpose |
|---|---|---|
| `--sp-z-base` | `1` | Per-message actions tray |
| `--sp-z-floating` | `2` | Code lang label, copy button |
| `--sp-z-tooltip` | `100` | Header tooltip, context-meter tooltip |
| `--sp-z-nav` | `100` | Floating nav-sidebar |
| `--sp-z-dropdown` | `1000` | Slash, history, model, mode dropdowns |
| `--sp-z-dropdown-fixed` | `10001` | Inline-editor fixed dropdown (rare) |

**Motion**

| Token | Default | Purpose |
|---|---|---|
| `--sp-duration-fast` | `0.15s` | Hover, opacity, color transitions |
| `--sp-duration-medium` | `0.2s` | Toggle slide, nav-sidebar reveal |
| `--sp-duration-slow` | `0.3s` | Context-meter gauge fill |
| `--sp-ease` | `ease` | Default easing |
| `--sp-ease-in-out` | `ease-in-out` | Pulse animations |
| `--sp-ease-linear` | `linear` | Spinner |

Reduced-motion fallback in `tokens.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .specorator-root {
    --sp-duration-fast: 0s;
    --sp-duration-medium: 0s;
    --sp-duration-slow: 0s;
  }
}
```

### B.1.4 Provider-flavour override matrix

| Provider | Brand token resolution | Light-mode override |
|---|---|---|
| Claude | `#D97757` (orange) | — |
| Codex | `#d0d0d0` | `#000000` |
| OpenCode | `#B8B8B8` | `#707070` |
| Cursor | `#6b7280` placeholder | TBD (escalation §B.8 Q1) |

Override is selected by `[data-provider]` attribute on `.specorator-root`. The attribute is written by `AgentSidepanelRoot.vue` from the active thread's provider id.

---

## B.2 — Component catalogue

Components are grouped by surface. For each: **(a)** the parity treatment in 1–3 lines, **(b)** the tokens it consumes, **(c)** any new sub-component to introduce.

### B.2.1 — Header (`AgentHeader.vue`)

(a) Collapse the four stacked bands into a **single 36 px band**: `[logo · title]` start, `[icon buttons]` end. Provider/model/feature scope move to the composer toolbar (model selector) and to the title-as-thread-name. Tab strip lives on its own row directly under the header, not inside it.
(b) `--sp-space-5` (padding-inline), `--sp-space-4` (gap), `--sp-text-normal`, `--sp-text-faint`, `--sp-font-size-base`, `--sp-font-weight-semibold`, `--sp-brand` (logo), `--sp-duration-fast`.
(c) New sub-component `AgentHeaderTooltip.vue` — hover tooltip wrapper for the header icon buttons (consumes `--sp-shadow-subtle`, `--sp-bg-secondary`).

### B.2.2 — Tabs (`ThreadTabStrip.vue` — refresh existing)

(a) Replace the current text tab list with **24×24 rounded-square badges** carrying a digit; states `active` (border = accent), `streaming` (border = brand), `attention` (border = error), `idle` (border = border). The `+` new-tab button uses the Lucide `square-plus` icon.
(b) `--sp-radius-sm`, `--sp-border`, `--sp-interactive-accent`, `--sp-brand`, `--sp-error`, `--sp-font-size-sm`, `--sp-font-weight-medium`, `--sp-duration-fast`.
(c) Sub-component `ThreadTabBadge.vue` (extracted from current inline render so we can story it).

### B.2.3 — MessageList & bubbles (`MessageList.vue`, `MessageItem.vue`)

(a) Asymmetric two-role layout: **user** = right-aligned bubble (`max-width: 95%`, `bg: rgba(0,0,0,0.3)`, asymmetric `--sp-radius-bubble-tail-user` on `border-end-end-radius`); **assistant** = transparent, full-width, no bubble, asymmetric `border-end-start-radius`. Padding `10px 14px` from `--sp-space-4` + `--sp-space-5` analogues (see Layout §B.5).
(b) `--sp-radius-lg`, `--sp-radius-bubble-tail-*`, `--sp-bg-primary` (assistant code blocks via code wrapper), `--sp-line-height-normal`.
(c) None — keep current Vue file but rewrite scoped styles to consume tokens. Add `unicode-bidi: plaintext` to the content node so RTL text renders correctly (currently absent — accessibility win).

### B.2.4 — Per-message actions (`MessageActions.vue`)

(a) Hover/focus-reveal toolbar at `bottom: -20px; inset-inline-end: 0` (user bubble) and inline-start of assistant. `opacity 0 → 1` on parent hover or focus-within. Icons: copy (toggles to "Copied" mono label on tap), edit, regenerate, fork. Icon size 16×16, gap `--sp-space-5`.
(b) `--sp-text-faint`, `--sp-text-normal` (hover), `--sp-accent` (copied state), `--sp-font-size-xs`, `--sp-font-mono`, `--sp-duration-fast`.
(c) Sub-component `MessageActionIcon.vue` — wraps `<SpIcon>` (see B.3) with an `aria-label` + tooltip, handles the copied-state swap.

### B.2.5 — Thinking / ToolCall / Subagent nested blocks (`ThinkingBlock.vue`, `ToolCallBlock.vue`, `SubagentBlock.vue`)

(a) Unify the three under a **2 px inline-start border** indent: `padding-inline-start: 16–24px; margin-inline-start: 7px; border-inline-start: 2px solid --sp-border`. Header row: icon · name · summary · status badge (12-px right). Pulse animation on the thinking label uses `--sp-brand` text colour and `thinking-pulse 1.5s ease-in-out infinite`.
(b) `--sp-border`, `--sp-brand`, `--sp-text-muted`, `--sp-font-mono`, `--sp-font-size-md`, `--sp-line-height-normal`, animation token (see B.6).
(c) Sub-component `NestedDetailFrame.vue` — pure layout wrapper that owns the 2 px-border-indent idiom, consumed by all three blocks. This is a *new component*; flag in §B.8 for design-system review.

### B.2.6 — Status panel (`StatusPanel.vue` — refresh existing)

(a) Persistent compact panel directly **above the composer**, inside the same flex column as the composer wrapper so it visually groups. Two collapsible sections: Todos (icon + label + current + status) and Bash output (`max-height: min(40vh, 320px)`, own scroll, `overscroll-behavior: contain`).
(b) `--sp-space-5` (padding), `--sp-bg-primary`, `--sp-border`, `--sp-accent` (icon), `--sp-success` (completed), `--sp-text-muted`, `--sp-font-mono`, `--sp-font-size-md`.
(c) Existing `StatusPanel.vue` reskin. The todo-item renderer becomes `StatusTodoItem.vue` (extracted for Storybook).

### B.2.7 — Composer & InputToolbar (`ChatInput.vue` + new `InputToolbar.vue`)

(a) **Composer wrapper:** flex column, `min-height: 140px`, `border: 1px solid --sp-border`, `border-radius: --sp-radius-md`, `background: --sp-bg-primary`. Optional context row (file chip start, selection indicator end) at top, shown only when `has-content`. Textarea fills middle; `font-size: --sp-font-size-base`, transparent. **InputToolbar** sits inside the wrapper at the bottom, `padding: 4px 6px 6px 6px`. Mode-tinted borders: instruction mode `#60a5fa` (blue), bang-bash `#f472b6` (pink), plan mode `--sp-brand`; each adds a `box-shadow: 0 0 0 1px <colour>` ring.
(b) `--sp-radius-md`, `--sp-border`, `--sp-bg-primary`, `--sp-font-size-base`, `--sp-text-normal`, `--sp-text-muted` (placeholder), brand for plan-mode ring.
(c) **New component** `InputToolbar.vue` — child of `ChatInput.vue`; hosts model · mode · permission · thinking · mcp · context-meter · send. Flag in §B.8 for design-system review.

### B.2.8 — Mode / permission / thinking toggles (`ModeSelector.vue`, `PermissionToggle.vue`, `ThinkingToggle.vue`)

(a) Inline **label + pill toggle** trio inside the InputToolbar. The toggle pill is `32×18px`, `border-radius: --sp-radius-pill`, animated thumb. Active state tints background `rgba(--sp-brand-rgb, 0.3)` and thumb `--sp-brand`. Plan-mode label uses `rgb(92, 148, 140)` (calm teal — define as `--sp-plan` if reused elsewhere; see §B.8).
(b) `--sp-radius-pill`, `--sp-border`, `--sp-brand-translucent`, `--sp-brand`, `--sp-text-muted`, `--sp-font-size-xs`, `--sp-duration-medium`.
(c) New `SpToggleSwitch.vue` primitive (under `src/ui/components/primitives/`) — shared across all three toggles so we maintain a single animation.

### B.2.9 — Model selector (`ModelSelector.vue`)

(a) Button shows brand-coloured model label + chevron (Lucide `chevron-down`, 12×12). Dropdown opens **upward** (above the toolbar), groups by provider, group header in 8-px uppercase faint label, selected row tinted `--sp-brand-translucent`. Hover-open + click-to-pin behaviour.
(b) `--sp-radius-sm` (button), `--sp-radius-md` (dropdown), `--sp-shadow-dropup`, `--sp-bg-secondary`, `--sp-border`, `--sp-brand`, `--sp-brand-translucent`, `--sp-font-size-sm`, `--sp-z-dropdown`.
(c) Reuses `SpDropdownPanel.vue` (new — see §B.2.13).

### B.2.10 — Provider badge & menu (`ProviderBadge.vue` — refresh existing)

(a) Stop rendering the raw machine string. Display **"<Provider> · <Mode>"** (e.g. "Claude · CLI", "Codex · API") sourced from the copy table (§B.4). Provider icon is the brand SVG (`assets/provider-icons/*.svg`, light/dark variants via `data-theme` selector). Click opens a menu (provider switch) — uses `SpDropdownPanel`.
(b) `--sp-font-size-sm`, `--sp-text-normal`, `--sp-brand` (icon tint), `--sp-radius-sm`.
(c) None.

### B.2.11 — Slash & mention dropdowns (`SlashCommandPopover.vue` — refresh, new `MentionPopover.vue`)

(a) Replace plain absolute `<div>` with **backdrop-blurred dropdown** (`backdrop-filter: blur(20px)`), anchored above input, `max-height: 300px`. Item rows: name (mono 12 px) + hint (muted 12 px) + description (faint 11 px, ellipsised). Add keyboard navigation (↑/↓/Enter/Esc) and search-narrowing.
(b) `--sp-radius-md`, `--sp-shadow-dropup`, `--sp-bg-secondary`, `--sp-border`, `--sp-font-mono`, `--sp-text-normal`, `--sp-text-muted`, `--sp-z-dropdown`.
(c) New `MentionPopover.vue` for `@`-mentions of files/threads; mirrors slash structure.

### B.2.12 — Thread history menu (`ThreadHistoryMenu.vue` — new)

(a) Dropup from a `history` icon in the header. Sticky header "RECENT THREADS", list of `claudian-history-item`-style rows: icon · title · date · hover-reveal actions (rename, delete). Active thread gets a 2 px inline-start `--sp-interactive-accent` bar.
(b) `--sp-radius-md`, `--sp-shadow-dropup`, `--sp-bg-secondary`, `--sp-border`, `--sp-interactive-accent`, `--sp-text-normal`, `--sp-text-muted`, `--sp-text-faint`, `--sp-error` (delete hover).
(c) Reuses `SpDropdownPanel`; uses `SpIcon` for `history`, `pencil`, `trash-2`.

### B.2.13 — Shared dropdown primitive (`SpDropdownPanel.vue` — new)

(a) Reusable panel with two anchor modes (`dropup` | `dropdown`), backdrop blur, blur fallback for unsupported browsers (solid `--sp-bg-secondary`), trap-focus, Esc-to-close. Used by slash, mention, history, model, mode, provider menus.
(b) `--sp-radius-md`, `--sp-border`, `--sp-bg-secondary`, `--sp-shadow-dropup`, `--sp-shadow-dropdown`, `--sp-z-dropdown`.
(c) This is the meta-primitive for all dropdowns; flag in §B.8 for design-system review.

### B.2.14 — Welcome state (`WelcomeGreeting.vue` — new)

(a) Replace the dashed 2×2 prototype tiles with a **centred serif greeting** (`28px / 300 / --sp-font-serif`). Greeting copy varies by time-of-day (see §B.4). Below the greeting, three single-row suggestion chips (NOT dashed boxes) for "Start a feature", "Review tasks", "Explain this file".
(b) `--sp-font-serif`, `--sp-font-size-display`, `--sp-font-weight-light`, `--sp-text-muted`, `--sp-space-7` (padding).
(c) Sub-component `WelcomeSuggestionChip.vue`.

### B.2.15 — Approval card (`InlineApprovalCard.vue` — new)

(a) Inline in transcript, monospace, tabbed at top ("Question" | "Review"). Body: tool name badge (brand icon + name), blocked-path mono chip, reason copy. Items: `▌` cursor (accent) on hover, `[ ]` / `[✓]` brackets for multi-select. Submit triggers confirmation in the "Review" tab.
(b) `--sp-font-mono`, `--sp-font-size-sm`, `--sp-bg-secondary`, `--sp-bg-primary-alt`, `--sp-brand`, `--sp-success`, `--sp-text-muted`, `--sp-radius-md`.
(c) Sub-components: `ApprovalTabBar.vue`, `ApprovalItem.vue`, `ApprovalReviewBody.vue`.

### B.2.16 — Floating nav-sidebar (`FloatingNavSidebar.vue` — new)

(a) Absolute, right-edge, vertically centred, 32-px circular buttons (`scroll-to-top`, `scroll-to-bottom`, `regenerate-last`, `new-thread`). Resting `opacity: 0.15`, hover `opacity: 1` with `scale(1.05)`. Z-index `--sp-z-nav`.
(b) `--sp-radius-pill-xl`, `--sp-bg-primary`, `--sp-border`, `--sp-text-muted`, `--sp-shadow-subtle`, `--sp-duration-medium`.
(c) Sub-component `NavSidebarButton.vue`.

### B.2.17 — Compact boundary divider (`CompactBoundary.vue`)

(a) Centred label with a horizontal rule on each side; the label uses `--sp-compact` colour instead of muted italic. Layout: `display: flex; align-items: center; gap: 10px;` with `::before` and `::after` pseudo-elements as the rules.
(b) `--sp-border`, `--sp-compact`, `--sp-font-size-xs`, `--sp-space-5` (vertical margin).
(c) None.

### B.2.18 — Streaming cursor (`StreamingCursor.vue` — new)

(a) Replace the literal `▍` character with a 2 px × 1em block element, `background: currentColor`, animated `streaming-cursor-blink 1s steps(2, end) infinite`. Inherits text colour from context.
(b) Animation token (see B.6); no colour token — uses `currentColor` to inherit.
(c) None.

### B.2.19 — Transport status pill (`TransportStatusPill.vue` — new, surfaces `ChatDegradedState`)

(a) Pill rendered at the **top of the MessageList** (above the first message) when the bridge / transport is degraded. States: `connecting` (faint), `degraded` (warning), `offline` (error). Click expands to a one-line diagnostic and a `Retry` button.
(b) `--sp-radius-full`, `--sp-warning`, `--sp-error`, `--sp-text-muted`, `--sp-font-size-sm`, `--sp-space-3` (padding).
(c) None — this finally surfaces the dormant `ChatDegradedState` flagged in idea.md gap #15.

---

## B.3 — Icon set

### B.3.1 `<SpIcon>` Vue wrapper

New file `src/ui/components/primitives/SpIcon.vue`. The wrapper exists so (i) every icon usage goes through one component (one seam to swap implementations later), (ii) accessibility props are enforced, (iii) tests can stub by name.

```ts
// SpIcon.vue — script setup
defineProps<{
  name: string;          // Lucide icon name, e.g. 'send', 'copy'
  size?: number;         // CSS px, default 16
  ariaLabel?: string;    // sr-only label; if omitted, icon is aria-hidden
}>();
```

**Implementation:** template renders a `<span ref="el" class="sp-icon" :aria-label aria-hidden="!ariaLabel">`. `onMounted` calls `setIcon(el.value, name)` from `obsidian`. **Note for architect:** because Vue components are forbidden from importing `obsidian` directly (CLAUDE.md), `SpIcon` lives in `src/ui/components/primitives/` and receives the setter via a `useIconPort()` composable. Flag in §B.8 for confirmation.

If `setIcon` resolves to no SVG (icon name missing in Obsidian's bundled Lucide), `SpIcon` falls back to rendering the `ariaLabel` text inside the span — never an empty box.

### B.3.2 Icon inventory

| Lucide name | Used by | Affordance |
|---|---|---|
| `bot` | Header logo | Specorator brand mark |
| `square-plus` | Tab strip new-tab button | Create a new thread |
| `square-pen` | Header / nav-sidebar | Edit current thread title |
| `history` | Header | Open thread history menu |
| `panel-left` | Header | Toggle nav-sidebar |
| `copy` | MessageActions, code wrapper | Copy text/code to clipboard |
| `check` | After copy, completed todo, approval-allow | Confirmation |
| `x` | File-chip remove, approval-deny | Close / remove / deny |
| `rotate-ccw` | MessageActions | Regenerate the last response |
| `git-fork` | MessageActions | Fork thread from this message |
| `pencil` | MessageActions, history menu | Edit message / rename thread |
| `trash-2` | History menu | Delete thread |
| `send` | InputToolbar | Send composer message |
| `square` | InputToolbar (when streaming) | Stop generation |
| `chevron-down` | Model selector, dropdown buttons | Open dropdown |
| `chevron-up` | Scroll-to-top nav button | Scroll up |
| `chevron-double-down` | Scroll-to-bottom nav button | Jump to latest |
| `paperclip` | InputToolbar | Attach file |
| `at-sign` | InputToolbar | Insert mention |
| `slash` | InputToolbar | Insert slash command |
| `brain` | ThinkingBlock header | Reasoning content |
| `wrench` | ToolCallBlock generic | Tool call |
| `terminal` | Bash tool call, bang-bash mode | Shell |
| `file-search` | Read/Grep/Glob tool calls | File search |
| `globe` | WebFetch tool call | Web |
| `users` | SubagentBlock | Subagent activity |
| `list-todo` | StatusPanel todos | Task list |
| `loader-2` | Streaming indicator, action loading | Busy spinner (via `animation: spin`) |
| `alert-circle` | Transport pill error, tab badge attention | Error / attention |
| `wifi-off` | Transport pill offline | Offline |
| `circle-dot` | Mode toggle resting | Inactive state |
| `shield-check` | Permission toggle | Permission mode |
| `lightbulb` | Plan mode label | Plan mode |
| `settings-2` | Header | Settings entry |
| `info` | Tooltip trigger | Info |
| `arrow-up` | Scroll-to-top | Scroll up |
| `arrow-down` | Scroll-to-bottom | Scroll down |

Total: 36 icons. All names verified against the Lucide set bundled with Obsidian (1.5+). Where Claudian uses the same name (per `messages.css`/`toolcalls.css`/`thinking.css`), Specorator uses the same name — no remapping.

---

## B.4 — Microcopy table

Keys mirror the existing `src/ui/i18n/en.ts` shape. Sentences end with a period (per UX steering); button labels do not.

### B.4.1 Provider labels

| Key | English |
|---|---|
| `provider.label.claude` | `Claude` |
| `provider.label.codex` | `Codex` |
| `provider.label.opencode` | `OpenCode` |
| `provider.label.cursor` | `Cursor` |
| `provider.mode.cli` | `CLI` |
| `provider.mode.api` | `API` |
| `provider.mode.web` | `Web` |
| `provider.combined` | `{provider} · {mode}` |

Renderer uses `t('provider.combined', { provider: t(`provider.label.${id}`), mode: t(`provider.mode.${mode}`) })` → "Claude · CLI".

### B.4.2 Header

| Key | English |
|---|---|
| `header.title` | `Specorator` |
| `header.action.newThread.tooltip` | `New thread` |
| `header.action.history.tooltip` | `Thread history` |
| `header.action.rename.tooltip` | `Rename thread` |
| `header.action.settings.tooltip` | `Settings` |
| `header.action.toggleNav.tooltip` | `Toggle navigation` |

### B.4.3 Composer / InputToolbar

| Key | English |
|---|---|
| `composer.placeholder` | `Ask Specorator, or type / for commands.` |
| `composer.placeholder.bashMode` | `Run a shell command (bang-bash mode).` |
| `composer.placeholder.instructionMode` | `Add an instruction for the next turn.` |
| `composer.send.tooltip` | `Send` |
| `composer.send.streamingTooltip` | `Stop generation` |
| `composer.attach.tooltip` | `Attach a file` |
| `composer.mention.tooltip` | `Mention a file or thread` |
| `composer.slash.tooltip` | `Insert a slash command` |
| `composer.mode.normal` | `Normal` |
| `composer.mode.instruction` | `Instruction` |
| `composer.mode.bash` | `Bash` |
| `composer.mode.plan` | `Plan` |
| `composer.permission.label` | `Allow` |
| `composer.permission.plan.label` | `Plan` |
| `composer.thinking.label` | `Thinking` |
| `composer.mcp.label` | `MCP` |
| `composer.contextMeter.tooltip` | `{used} of {total} tokens used.` |
| `composer.queue.indicator` | `Queued: {preview}` |
| `composer.queue.steer` | `Steer` |
| `composer.queue.cancel` | `Cancel` |

### B.4.4 Message actions

| Key | English |
|---|---|
| `message.action.copy.tooltip` | `Copy message` |
| `message.action.copy.confirm` | `Copied` |
| `message.action.edit.tooltip` | `Edit message` |
| `message.action.regenerate.tooltip` | `Regenerate response` |
| `message.action.fork.tooltip` | `Fork thread from here` |
| `message.action.delete.tooltip` | `Delete message` |

### B.4.5 Welcome state

| Key | English |
|---|---|
| `welcome.greeting.morning` | `Good morning.` |
| `welcome.greeting.afternoon` | `Good afternoon.` |
| `welcome.greeting.evening` | `Good evening.` |
| `welcome.greeting.night` | `Working late.` |
| `welcome.suggestion.feature` | `Start a feature` |
| `welcome.suggestion.tasks` | `Review the task plan` |
| `welcome.suggestion.file` | `Explain the active file` |

### B.4.6 Approval card

| Key | English |
|---|---|
| `approval.title` | `Permission needed.` |
| `approval.tab.question` | `Question` |
| `approval.tab.review` | `Review` |
| `approval.action.allowOnce` | `Allow once` |
| `approval.action.allowAlways` | `Allow always` |
| `approval.action.deny` | `Deny` |
| `approval.hint.shortcut` | `Enter to submit, Esc to deny.` |

### B.4.7 Transport status pill

| Key | English |
|---|---|
| `transport.connecting` | `Connecting to {provider}.` |
| `transport.degraded` | `{provider} is slow to respond.` |
| `transport.offline` | `{provider} is unreachable.` |
| `transport.retry` | `Retry` |

### B.4.8 Thread history

| Key | English |
|---|---|
| `history.sectionTitle` | `RECENT THREADS` |
| `history.empty` | `No previous threads yet.` |
| `history.action.rename.tooltip` | `Rename thread` |
| `history.action.delete.tooltip` | `Delete thread` |
| `history.confirmDelete` | `Delete this thread? This cannot be undone.` |

### B.4.9 Compact boundary

| Key | English |
|---|---|
| `compact.boundary.label` | `Conversation compacted at {time}.` |

---

## B.5 — Layout grids

Density rules per surface. Where a value differs from the corresponding spacing token, the deviation is intentional and called out.

| Surface | Padding | Gap | Min/max | Notes |
|---|---|---|---|---|
| Header band | `0 12px 12px 12px` | `8px` between logo/title; `12px` between header buttons | min-height 36 px | Single row only. |
| Tab strip row | `0 12px 4px 12px` | `4px` between badges | tab badge 24×24 fixed | Lives directly under header. |
| MessageList scroll area | `12px 0` block; `0 14px` inline (from composer wrapper) | `12px` between messages | min-height 0 (flex) | Vertical scroll only. |
| User message bubble | `10px 14px` | n/a | `max-width: 95%`; `align-self: flex-end` | Asymmetric `border-end-end-radius`. |
| Assistant message | `10px 14px` (block padding 0 to allow nested blocks to bleed) | `8px` between blocks | full-width, `align-self: stretch` | No background. |
| Per-message actions | `0` | `12px` between icons | absolute `bottom: -20px; inset-inline-end: 0` | Hover/focus reveal. |
| Nested block (thinking/tool/subagent) | `4px 0` block; `padding-inline-start: 16-24px`; `margin-inline-start: 7px` | `8px` between header rows | `max-height: 400px` for thinking content (own scroll) | 2-px inline-start border. |
| StatusPanel container | `0 14px` inline; `12px 0 0 0` block | n/a | `max-height: min(40vh, 320px)` for bash content | Inside composer's outer flex column. |
| Composer wrapper | n/a (border-only) | `0` (flex column) | **`min-height: 140px`** | Mode-tinted border. |
| Composer context row | `6px 10px 0 10px` | `8px` | display none when empty | `.has-content` reveals. |
| Composer textarea | `8px 10px 10px 10px` | n/a | `min-height: 60px`; `max-height: var(--sp-textarea-max-height)` (none by default) | Transparent. |
| InputToolbar | `4px 6px 6px 6px` | `6px` between toggle groups; `4px` within toggle | flex row, wraps on narrow | model · mode · permission · thinking · mcp · meter · send. |
| File chip | `3px 6px 3px 8px` | `4px` (icon-name); `6px` between chips | `max-width: 200px`; `border-radius: 12px` | Mono name ellipsised. |
| Dropdown panel (slash / history / model) | `0` outer; rows `8px 12px` | `0` between rows | `max-height: 300px` (slash), `400px` (history) | Backdrop-blur. |
| Welcome state | `20px` | `12px` (greeting-to-chips) | `min-height: 200px` | Centred. |
| Floating nav-sidebar | n/a | `4px` between buttons | `right: 2px; top: 50%` | 32×32 circular. |
| Approval card | `8px 10px` | `8px` between sections | full bubble width | Mono. |
| Compact boundary | `12px 0` block | `10px` between label and rule | n/a | Centred label. |
| Code block | `8px 12px` | n/a | `overflow-x: auto` | Lang label top-end. |
| Tab badge | `0` (digit centred) | n/a | **24×24 fixed, `border-radius: 4px`, 2 px border** | Four state borders. |

Narrow-pane (sidepanel <= 360 px) rules:
- InputToolbar wraps to two rows (model + send stay on row 1; toggles drop to row 2).
- Per-message actions move to `bottom: -22px` and gap reduces to `8px`.
- Header collapses thread title to `…` with full title in tooltip when truncated.

---

## B.6 — Animations

| Name | Definition | Used by | Reduced-motion |
|---|---|---|---|
| `thinking-pulse` | `1.5s var(--sp-ease-in-out) infinite` — opacity 0.5 → 1 → 0.5 | ThinkingBlock label | Disable via duration token = 0; element shows at full opacity. |
| `streaming-cursor-blink` | `1s steps(2, end) infinite` — visibility/opacity flip | StreamingCursor | Show cursor at full opacity, no blink. |
| `spin` | `1s var(--sp-ease-linear) infinite` — rotate 0 → 360° | `loader-2` icon, generation indicator, history rename loading | Disable; show static icon. |
| `mcp-glow` | `2s var(--sp-ease-in-out) infinite` — drop-shadow 2 px → 8 px purple | MCP toggle when active | Disable; show flat icon. |
| `external-context-glow` | `2s var(--sp-ease-in-out) infinite` — drop-shadow with `--sp-brand-rgb` | External-context indicator | Disable. |
| Hover-reveal fade | `opacity 0 → 1` over `var(--sp-duration-fast)` `var(--sp-ease)` | Per-message actions, history actions, code copy button | Snap (duration 0). |
| Toggle slide | `transform / background` over `var(--sp-duration-medium)` | SpToggleSwitch | Snap. |
| Context-meter fill | `stroke-dashoffset / stroke` over `var(--sp-duration-slow)` | Context meter | Snap. |
| Nav-sidebar reveal | `opacity` over `var(--sp-duration-medium)`; `transform: scale(1.05)` on hover | FloatingNavSidebar | Snap; no scale on hover. |

All animations defined once in `src/ui/styles/animations.css`, imported by `tokens.css`. Reduced-motion handling is automatic via the `--sp-duration-*` overrides in §B.1.3, **except** for `spin` (which needs an explicit `animation: none` in the media query because its duration drives the entire effect).

---

## B.7 — RTL / logical-property migration

Every scoped style under `src/ui/agent/`, `src/ui/components/agent/`, `src/ui/components/chat/` must migrate physical properties to logical equivalents. Inventory:

| Physical | Logical | Found in (representative — full sweep in implementation) |
|---|---|---|
| `padding-left` | `padding-inline-start` | `ChatInput.vue`, `MessageItem.vue`, `ThreadTabStrip.vue` |
| `padding-right` | `padding-inline-end` | same |
| `margin-left` | `margin-inline-start` | per-message actions, history-item actions |
| `margin-right` | `margin-inline-end` | provider badge |
| `left:` | `inset-inline-start:` | dropdown anchors, selection indicator |
| `right:` | `inset-inline-end:` | per-message actions, code copy button, lang label |
| `border-left` | `border-inline-start` | nested-block border indent, active history item |
| `border-right` | `border-inline-end` | none introduced |
| `border-bottom-left-radius` | `border-end-start-radius` | assistant bubble tail |
| `border-bottom-right-radius` | `border-end-end-radius` | user bubble tail |
| `text-align: left` | `text-align: start` | message content, table cells |
| `text-align: right` | `text-align: end` | context-meter percent label |
| `transform: translateX(14px)` | unchanged | acceptable — applies symmetrically to thumb position |
| `float: left/right` | (delete; use flex) | none expected; flag if found |

Two content-level rules to add globally:
- `unicode-bidi: plaintext` on `.sp-message-content` and `.sp-input` so mixed RTL/LTR text segments orient correctly.
- `dir="auto"` on user-authored text containers (message content, file-chip name, history title).

Lint guard. Add a Stylelint rule (or grep-based CI check) that flags `padding-left|padding-right|margin-left|margin-right|left:|right:|text-align:\s*(left|right)` in the migrated paths after the workstream lands. Flag the rule's introduction to the architect (§B.8).

---

## B.8 — Open UI questions

1. **Cursor provider brand colour.** No upstream reference. Placeholder `#6b7280` (slate-500). Needs design call before Cursor adapter ships (Q-AUX-UI-01 — UX/PM).
2. **`NestedDetailFrame.vue` is a new shared component** spanning thinking, tool calls, and subagent. The constitution / steering treats new design-system components as items requiring UX-design-system sign-off. Confirm acceptance (Q-AUX-UI-02 — UX).
3. **`InputToolbar.vue` is a new composite component** with seven children (model, mode, permission, thinking, mcp, meter, send). Confirm naming, slot order, and whether it should be promoted to a design-system primitive (Q-AUX-UI-03 — UX).
4. **`SpDropdownPanel.vue` becomes the canonical dropdown primitive.** Specorator currently has no such primitive; introducing one affects Settings tab pickers and the existing model-selector. Confirm scope and any cross-feature impact (Q-AUX-UI-04 — Architect + UX).
5. **`SpIcon.vue` calls Obsidian's `setIcon`** but Vue components are forbidden from importing `obsidian` directly (CLAUDE.md). Proposal: add an `IconPort` (seventh narrow port) with `setIcon(el, name)` implemented by `ObsidianBridge`, `MockBridge`, and `LocalStorageBridge`. The mock and localstorage implementations can render an `<svg>` with the icon name as a `<title>` so tests and the GitHub Pages demo do not need the Obsidian runtime. Confirm with architect — this is the cleanest place to draw the seam (Q-AUX-UI-05 — Architect).
6. **Plan-mode label colour `rgb(92, 148, 140)`** (teal) is currently a one-off in Claudian. Should it become a first-class token `--sp-plan`? If yes, what other surfaces consume it? (Q-AUX-UI-06 — UX).
7. **Reduced-motion handling of `spin`** needs an explicit `animation: none` rule rather than relying on the duration override, because a 0 s spin is still visible as a stuck icon. Confirm this is acceptable from an accessibility standpoint (Q-AUX-UI-07 — UX).
8. **Welcome-greeting time-of-day variation** (morning/afternoon/evening/night) — needs PM sign-off on tone and on whether the strings should localise differently per provider (Q-AUX-UI-08 — PM).
9. **Stylelint / lint-guard for physical CSS properties** — introducing this hardens the RTL migration but adds a CI rule. Confirm with architect that the rule lands in this workstream rather than a follow-up (Q-AUX-UI-09 — Architect).
10. **Storybook coverage** is named as success criterion #7 in `idea.md`. Confirm whether Storybook stories are produced inside this design or deferred to the planner's `tasks.md` (Q-AUX-UI-10 — Planner).
11. **`AttachmentStrip` visual grouping** — should it live inside the composer wrapper (between context row and textarea) or above it as a sibling? Claudian uses an inline chip strip inside the context row; this design follows that, but the current Specorator MPS keeps them as outside siblings — confirm the move (Q-AUX-UI-11 — UX).

---

## Hand-off

This document is Part B (UI). Inputs consumed: `idea.md` (audits + delta), Claudian reference styles (paths cited in idea.md §B). Outputs:

- **For `architect` (Part C — Architecture):** the new ports (`IconPort`, §B.8 Q5), the new primitive components (`SpIcon`, `SpToggleSwitch`, `SpDropdownPanel`, `NestedDetailFrame`, `InputToolbar`), and the token-layer mount (§B.1.1) all need architectural placement. Component graph and store-boundary changes are for Part C.
- **For `planner`:** the eleven escalations in §B.8 must be answered before task decomposition begins. Token-layer task should land first; component refresh tasks branch from it.
- **For `ux-designer`:** §B.8 Q1, Q2, Q3, Q6, Q7, Q8, Q11 are UX-scoped escalations.

Workflow-state update to be appended by the agent (not yet written): set `design.part_b.status: drafted; author: ui-designer; date: 2026-05-22`.
