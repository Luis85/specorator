# Idea — Agent Sidepanel UX Parity

**Feature slug:** `agent-ux-parity`
**Area:** AUX
**Created:** 2026-05-22

## One-line pitch

Bring the Specorator agent sidepanel's look, feel, and interaction polish to parity with the Claudian plugin while keeping our Vue/DDD architecture intact.

## Why now

The Multi-Provider Agent Sidepanel feature (MPS, WS-1..WS-10) shipped **feature** parity with Claudian — every capability that Claudian offers is wired up. The remaining gap is **experience** parity: the surface still looks and feels prototype-y next to Claudian's polished UI. We want users to open the sidepanel and feel they are using a finished product, not a wireframe.

## The two upstream inputs

### A. Current Specorator MPS — observed gaps

From the audit of `src/ui/agent/` + `src/ui/components/agent/` + `src/ui/components/chat/`:

1. **No icon system.** Send, Copy, Regenerate, Edit, New-thread, context-menu, delete are all text labels or a lone `+`/`▾`.
2. **Persistent per-message actions.** No hover-reveal — every message permanently shows Copy/Edit/Regenerate, adding visual noise.
3. **Header is information-dense and stacked** (title row + feature scope + tab strip + provider/model row = 4 vertical bands eating sidepanel height before any message renders).
4. **Provider badge renders raw machine string** (literal `claude/cli`) instead of the design's "Claude · CLI" copy.
5. **No avatars, no model name on assistant bubble, no timestamps** despite `createdAt` available.
6. **Streaming cursor is a literal `▍` character**, not a styled element.
7. **Empty-state tiles** are dashed 2×2 with leftward text alignment — prototype-y.
8. **AttachmentStrip + StatusPanel** sit between MessageList and ChatInput as stacked siblings; no visual grouping with the input.
9. **`/help` popover** is a plain absolute `<div>`; no search, no keyboard nav.
10. **Two parallel chat surfaces** — `AgentSidepanelRoot` calls into legacy `ChatSidebar`'s exposed refs (split rendering responsibility).
11. **Compact-boundary divider** is an italic centred label with `var(--text-faint)` — easy to miss.
12. **No design-token CSS module** — every component uses `<style scoped>` consuming Obsidian vars directly, no shared spacing/radius/typography scale.
13. **No Storybook coverage** for any agent/chat component (only generic primitives have stories).
14. **`ThreadTabStrip` rename emit is unhandled** at root level.
15. **`ChatDegradedState`** exists in `chat/` but is not surfaced through any of the new MPS components.

### B. Claudian — UX reference

From the audit of `D:\Projects\claudian-main`:

- **Lucide icons via `setIcon`** drive every affordance (`bot`, `square-plus`, `square-pen`, `history`, `copy`, `rotate-ccw`, `git-fork`, `pencil`, `trash-2`, `loader-2`, `check`, `x`, `alert-circle`).
- **Per-provider brand color via `[data-provider="claude|codex|opencode"]`** — switches `--claudian-brand` (Claude orange `#D97757`).
- **Logical-property layout everywhere** (`inset-inline-end`, `margin-inline-start`, `border-end-end-radius`) — RTL-safe.
- **User messages = right-aligned bubble** (`rgba(0,0,0,0.3)` bg, asymmetric corner, max-width 95%); **assistant = transparent full-width** (no bubble).
- **Per-message actions** at `bottom:-20px right:0`, `opacity 0 → 1` on hover; `copy` icon swap to "Copied" label on click.
- **2px left-border indent** unifies thinking, tool, and subagent nested blocks — one visual idiom for expanded detail.
- **Composer**: 140px min-height, border tints by mode (blue instruction / pink bang-bash / green plan), context chips pill-shaped (12px radius, 200px max), input is transparent.
- **Toolbar** below input: model · mode · permission · thinking · mcp · context-meter (SVG donut, brand→red above 80%) · send.
- **Status panel** persistent above input — todos + bash live tail (`max-height: min(40vh, 320px)`, own scroll).
- **Floating nav-sidebar** right edge, 32px circular buttons, `opacity:0.15` resting → `1` on hover with `scale(1.05)`.
- **Backdrop-blur on dropdowns** (slash, history) for native-app feel.
- **Welcome state** is a centered greeting in **serif** (`Copernicus, Tiempos Headline, Georgia` 28px/300) — contrasts the monospace-heavy app.
- **Animations**: `thinking-pulse 1.5s ease-in-out infinite`, `spin 1s linear`, `external-context-glow`, `mcp-glow`, 0.15s transitions everywhere.
- **Tab badges**: 24×24 rounded square, 2px border, states `active` (accent) / `streaming` (brand) / `attention` (error) / `idle` (border).
- **Approval / ask-user widget** inline in transcript, monospace, tabbed at top, list items with `▌` cursor; single-select check-mark, multi-select `[ ]` / `[✓]`.

### Delta summary (what parity requires)

| Surface | Specorator now | Claudian | Parity move |
|---|---|---|---|
| Icons | None | Lucide everywhere | Adopt Lucide via `obsidian.setIcon` |
| Message bubbles | Same shape both roles | User bubble / assistant flat | Two roles, asymmetric corner |
| Per-message actions | Always visible | Hover-reveal at `bottom:-20px` | Hover/focus reveal pattern |
| Header | 4 stacked bands | Single compact band | Collapse + relocate provider/model to toolbar |
| Composer toolbar | Send-only row | model · mode · perm · thinking · mcp · meter · send | Build `InputToolbar` |
| Status panel | Inline above input | Persistent compact above input | Match Claudian shape |
| Empty state | Dashed tiles | Centered serif greeting | Welcome greeting + optional tiles |
| Design tokens | None of our own | Brand var + radii/spacing rhythm | Define `--sp-*` token layer (mapped to Obsidian vars) |
| Provider switch | Raw machine string | Branded badge + brand color swap | Use copy table; `[data-provider]` attribute |
| Streaming | Literal `▍` | Styled pulse | Replace cursor with animated element |
| RTL | Mixed phys/logical | Logical everywhere | Migrate scoped CSS to logical properties |
| Storybook | No MPS stories | (n/a, plain TS) | Add MPS stories for visual-regression loop |

## Out of scope

- Architectural rewrite of `ChatSidebar` ↔ `AgentSidepanelRoot` coupling (separate ADR follow-up).
- New provider adapters (Cursor API still gated by CQ-MPS-01 spike).
- Translation work beyond updating the copy table affected by the parity refresh.

## Success criteria (acceptance, high level)

1. A first-time user opening the sidepanel sees a finished, branded surface, not a prototype.
2. Side-by-side screenshots of Specorator and Claudian show feature-equivalent layouts at three breakpoints (narrow sidepanel, mid, wide).
3. All interactive affordances use icons (Lucide via `setIcon`) with text labels falling back via `aria-label` / tooltip.
4. Per-message actions hover-reveal, do not occupy persistent space in the transcript.
5. Composer carries the full Claudian-parity toolbar row.
6. A `--sp-*` design-token layer exists and is consumed by every MPS component; no component reads Obsidian vars directly except via the token layer.
7. Storybook covers every MPS-surface component for visual regression.
8. Verify gate (`npm run verify`) green at every workstream tip.

## Acceptance gate

- PM accepts `idea.md` (this file) and requirements that follow.
- Architect signs off on design (Parts A — UX, B — UI, C — Architecture).
- Planner produces TDD-ordered tasks.md before any implementation branch is opened.
