---
feature: agent-ux-parity
area: AUX
stage: release
status: draft
owner: qa
last_updated: 2026-05-22
task: T-AUX-359
---

# Release notes — Agent Sidepanel UX Parity (vNext)

Visual + interaction parity between the Specorator agent sidepanel and the
Claudian reference plugin. Additive only — no migration steps, no API
changes for end users.

## Highlights (user-facing)

- **Lucide icons everywhere.** Every icon on the agent surface now resolves
  through Obsidian's `setIcon` pipeline. Missing icon names fall back to the
  button's aria-label rather than rendering a broken glyph.
- **Hover-revealed message actions.** Copy / regenerate / edit / fork buttons
  fade in only when you point at or focus a message bubble, matching Claudian.
  The "Copied" confirmation lasts 1.5 s with an aria-label swap for screen
  readers.
- **Branded provider colors.** Switching between Claude, Codex, OpenCode, or
  Cursor re-themes the surface via a `[data-provider]` attribute on the
  sidepanel root. No remount — the brand token updates live.
- **Refreshed composer toolbar.** Single row in the normative order:
  model · mode · permission · thinking · mcp · context-meter · send. A new
  SVG donut context meter goes from brand → error red above 80% usage.
- **Inline approval card.** Tabbed approval surface (Question / Review) with
  default focus on Deny per the existing approval safety spec; items prefixed
  with the `▌` marker.
- **Searchable help popover.** Replaces the static `/help` drawer. Type to
  filter, ArrowUp/Down to walk the list, Enter to pick, Escape to close.
  Screen-reader live region announces the filtered result count.
- **Floating nav sidebar.** Right-edge column with circular buttons for
  scroll-to-top, scroll-to-bottom, clear-conversation, and toggle-thinking.
  Auto-hides on narrow sidepanels (<300 px).
- **Thread history menu.** Drop-up list of past threads ordered by last-used,
  with inline rename + delete revealed on hover. 2 px accent border marks the
  active row.
- **Welcome greeting.** Empty-thread surface centred on a serif greeting
  (Copernicus stack via `--sp-font-serif`) plus suggestion chips that pre-fill
  the composer. Greeting variant follows the local hour.
- **Refreshed thread tab badges.** 24×24 status badges in each tab; border
  colour follows state (active / streaming / attention / idle) with the
  streaming variant animating via the shared `thinking-pulse` keyframe.
- **Transport status pill.** Surfaces the previously-dormant connection
  state on top of the message list with a retry affordance when degraded
  or offline.
- **Full RTL support.** Every scoped style on the agent surface uses logical
  CSS properties (`margin-inline-*`, `padding-inline-*`, `border-start-*-radius`,
  `text-align: start/end`). A lint guard prevents regression.

## Internal changes

- **Design-token CSS layer.** New `src/ui/styles/tokens.css` exposes the
  `--sp-*` token surface (colour, typography, spacing, radii, motion). Default
  values map to Obsidian theme vars so existing themes keep working.
- **IconPort narrow port.** New `IconPort` interface (`src/domain/ports/`)
  implemented by `ObsidianBridge`, `MockBridge`, and `LocalStorageBridge`.
  See ADR-AUX-001.
- **HoverActions primitive.** New
  `src/ui/components/primitives/HoverActions.vue` packages the
  opacity-transition contract used by `MessageActions` and
  `ThreadHistoryMenu`. See ADR-AUX-003.
- **Six primitives shipped.** `SpIcon`, `SpButton`, `SpIconButton`,
  `SpToggleSwitch`, `SpDropdownPanel`, `HoverActions` — all token-driven,
  all with Storybook coverage.
- **Lint-style-tokens guard.** `scripts/lint-style-tokens.mjs` runs as part
  of `npm run verify` and rejects raw Obsidian theme vars + physical CSS
  properties under the agent paths.
- **Animations layer.** New `src/ui/styles/animations.css` defines the five
  named keyframes (`thinking-pulse`, `streaming-cursor-blink`, `spin`,
  `mcp-glow`, `external-context-glow`) with a `prefers-reduced-motion`
  override that collapses durations to `0s`.

## ADRs accepted

- ADR-AUX-001 — IconPort narrow port for `setIcon`.
- ADR-AUX-002 — `--sp-*` design-token CSS layer.
- ADR-AUX-003 — HoverActions primitive.

## Migration notes

None. The feature is purely additive; existing settings, vault layout, and
public APIs are unchanged.

## Known limitations + follow-ups

- **Storybook test runner (Chromium) not exercised on Windows hosts.** The
  WS-AUX-10 coverage gate is satisfied by static inventory; axe-scan story
  for `AgentSidepanelRoot` (T-AUX-347) is deferred to the release-stage
  reviewer.
- **Parity screenshots — manual capture deferred.** The checklist for the
  side-by-side capture at 320 / 520 / 720 px lives in
  `specs/agent-ux-parity/parity-screenshots.md`; the actual `.png` capture
  is a manual followup.
- **CQ-AUX-01 (Cursor brand colour).** Placeholder `#6b7280` shipped with
  inline annotation; awaits Cursor adapter (gated by CQ-MPS-01).
- **CQ-AUX-04 (SpDropdownPanel cross-feature).** Primitive scoped to the
  agent surface only; the Settings tab pickers keep their prior
  implementation pending architect + ux-designer review.
- **CQ-AUX-06 (Fork action).** Shipped behind `showFork` prop defaulting to
  `false`; awaits PM sign-off before flipping default.
- **CQ-AUX-09 (Approval editable fields).** `editableFields: []` retained
  until tool schemas land.
- **CQ-AUX-13 (plan-mode label as token).** Inline literal retained; token
  promotion deferred.
- **MessageItem extraction.** Role-aware avatars + per-message timestamps
  (REQ-AUX-014) are served inline by `MessageList.vue`; carving out a
  dedicated `MessageItem.vue` is tracked in the retrospective for a
  follow-up feature.

## Bundle impact

- Plugin gzip: 738,128 B vs baseline 716,631 B — **+3.00 %** / +21.50 kB.
- Standalone (browser demo) gzip: 99,783 B vs baseline 98,499 B — **+1.30 %**
  / +1.28 kB.

Both inside the NFR-AUX-001 5 % budget.
