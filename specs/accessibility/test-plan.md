---
id: TEST-PLAN-AY-001
title: Accessibility (P12, FINAL phase) — Test Plan / Baseline + Guard-Verify Note
stage: testing
feature: accessibility
area: AY
epic: claudian-reboot
phase: P12
status: in-progress
owner: dev
integration_branch: next
created: 2026-05-27
updated: 2026-05-27
inputs:
  - SPEC-AY-001 (spec.md — SPEC-AY-001..011, TEST-AY-001..017, EC-AY-001..014)
  - PRD-AY-001 (requirements.md — REQ-AY-001..017 + NFR-AY-001..010)
  - DESIGN-AY-001 (design.md — Parts A/B/C; RG-1..6; D-AY-1..5; §C.6 ADR/port verdict)
  - src/ui/styles/tokens.css (the --sp-* token layer; --sp-focus-ring / --sp-shadow-focus-ring)
  - src/ui/styles/animations.css (the five named keyframes + the CQ-AUX-14 spin guard)
  - src/plugin/main.ts + src/ui/main.ts (the two CSS import sites)
  - D:\Projects\claudian-main\src\style\accessibility.css (the 41-line focus-visible-only reference)
---

# Test Plan — Accessibility (P12, the FINAL phase)

This plan captures the **token reference**, the **import-site reference**, the **reduced-motion
source inventory**, the **forced-colors background-cue-only control inventory**, the **claudian
reference**, and the **guard verdict** for P12. P12 adds **one new CSS file**
(`src/ui/styles/accessibility.css`, RG-1..RG-6), **two one-line import edits**, and **targeted
additive ARIA / `.sr-only` / live-region fills** on existing components. Every rule is gated behind
`:focus-visible`, `prefers-reduced-motion`, `forced-colors`, `.sr-only`, or an additive ARIA
attribute, so the P0-P11 default render stays byte-identical for mouse users (REQ-AY-014).

## 1. Token reference (the RG-5 ring consumers — NFR-AY-002, D-AY-2 / NG2)

RG-5 (the focus-visible ring) consumes the two **existing** tokens. No new token is minted.

| Token | Location | Value | Role |
|---|---|---|---|
| `--sp-focus-ring` | `src/ui/styles/tokens.css:42` | `var(--interactive-accent)` | The ring colour (follows the user theme accent — EC-AY-014). |
| `--sp-shadow-focus-ring` | `src/ui/styles/tokens.css:140` | `0 0 0 2px var(--sp-focus-ring)` | The `box-shadow` ring variant for controls whose `outline` is clipped by `overflow: hidden`. |

Both verified present at the recorded lines on branch `feature/accessibility`. RG-5 is a token
**consumer** — it adds no colour literal of its own (the only colour keywords in `accessibility.css`
are CSS system colours inside the `forced-colors` block, RG-3/RG-4 — NFR-AY-002, D-AY-5).

## 2. Import-site reference (the SPEC-AY-002/003 insertion points — NFR-AY-006)

The current 2-import CSS head at each entry; `accessibility.css` lands as the **3rd** import, after
`animations.css`, in both files.

| Entry | Current CSS head | Insertion point (3rd import) |
|---|---|---|
| `src/plugin/main.ts` | L1 `import '@/ui/styles/tokens.css';` · L2 `import '@/ui/styles/animations.css';` | after L2: `import '@/ui/styles/accessibility.css';` |
| `src/ui/main.ts` | L12 `import './standalone.css';` · L13 `import './styles/tokens.css';` · L14 `import './styles/animations.css';` | after L14: `import './styles/accessibility.css';` |

(The plugin entry uses the `@/ui/styles/…` alias; the standalone entry uses the relative
`./styles/…` path. Each registers `accessibility.css` immediately after its `animations.css` line.)

## 3. Reduced-motion source inventory (what RG-1 complements — CLAR-AY-002)

`accessibility.css` **complements** (does not replace) the existing per-section token overrides
(`tokens.css` zeroes `--sp-duration-*`) and the explicit `spin` halt in `animations.css`. RG-1 is a
global safety-net guard; RG-2 re-asserts the explicit `spin` halt.

The five named keyframes (declared in `src/ui/styles/animations.css`) that the reduced-motion guard
covers via their consumers:

| Keyframe | Consumer | Reduced-motion handling |
|---|---|---|
| `thinking-pulse` | ThinkingBlock dot + tab "streaming" border | duration token collapses to `0s`; RG-1 safety-net catches any miss. |
| `streaming-cursor-blink` | StreamingCursor tail glyph | duration token collapses; RG-1 safety-net. |
| `spin` | indeterminate spinners (title-gen / inline-edit / instruction) | **RG-2 `animation: none`** (a near-zero duration alone would not stop an indeterminate loop — CQ-AUX-14 / EC-AY-001). `animations.css` keeps its own copy; idempotent. |
| `mcp-glow` | McpIndicator active glow | duration token collapses; RG-1 safety-net. |
| `external-context-glow` | external-context indicator | duration token collapses; RG-1 safety-net. |

`@keyframes` definitions are **never** targeted by `accessibility.css` (the guard targets the
**consumers** — elements running animations/transitions; the build skips `@keyframes` children).

## 4. Forced-colors background-cue-only control inventory (the RG-4 selector enumeration — SPEC-AY-006)

The controls whose normal affordance is a background fill/wash only, each given a `currentColor`
border (or non-shifting `outline`) inside the `@media (forced-colors: active)` block so each stays
distinguishable when the OS replaces the palette (EC-AY-003, NFR-AY-009):

| Control | Selector (RG-4) |
|---|---|
| Toolbar toggle switch | `.sp-toggle-switch` |
| State pills | `[data-state]` |
| File / image chips | `.sp-chip` |
| Tab badges | `.sp-tab` |
| Selected dropdown option | `[role="option"][aria-selected="true"]` |

(The concrete enumeration is committed in RG-4 by T-AY-002/T-AY-005; the T-AY-006 mount leg confirms
the listed controls exist in the rendered surfaces so the selectors are not dead.)

## 5. Claudian reference (the meet / beat split — CLAR-AY-001)

`D:\Projects\claudian-main\src\style\accessibility.css` is the **minimal focus-visible-only** layer:
**41 lines, three selector groups, no media queries** — no `prefers-reduced-motion`, no
`forced-colors`, no `.sr-only`.

- **Group 1** (`outline + offset + border-radius`): tool/thinking/subagent/model headers + header
  buttons + `thinking-current` → `outline: 2px solid var(--interactive-accent); outline-offset: 2px;`
- **Group 2** (`outline + offset only`): action buttons, toggle switch, file/image chips + remove
  buttons, image-modal close, approved-remove, save-env, snippet restore/edit/delete, cancel/save,
  code-lang label.
- **Group 3** (`negative offset`): `history-item-content`.

So the **meet** leg is the focus-visible ring (RG-5, REQ-AY-007) — we reproduce it across the
equivalent `--sp-*` surfaces via the `:where(...)` interactive selector. The **beat** legs are the
three rule groups claudian lacks: RG-1 (reduced-motion guard, REQ-AY-003), RG-2 (spin halt,
REQ-AY-004), RG-3 (forced-colors mapping, REQ-AY-005), RG-4 (forced-colors borders, REQ-AY-006), and
RG-6 (`.sr-only`, REQ-AY-009).

## 6. Guard-verify note (the deleted-symbol guard verdict — NO guard-relax)

Confirmed against `eslint.config.js` + `tests/architecture/no-deleted-subsystem-refs.test.ts` on
branch `feature/accessibility`. The deleted-subsystem guard is a `no-restricted-imports` rule keyed
by the message fragment `deleted in the P0 reboot`; it matches **import paths and injection-key
import names**, not CSS filenames, CSS selectors, or template ARIA attributes.

- **The new `src/ui/styles/accessibility.css` file** — a plain CSS filename under the already-live
  `src/ui/styles/**` path (tokens.css/animations.css already live there). It is not an import path
  the guard restricts; it matches no `DELETED_SUBSYSTEM_BAN` glob (the obsidian/deleted-subsystem
  globs are `Claude*` / `Cursor*` / `ObsidianMcp*` etc.) and is not a `DELETED_INJECTION_KEYS`
  import name.
- **The two new import lines** (`import '@/ui/styles/accessibility.css';` /
  `import './styles/accessibility.css';`) — side-effect CSS imports of a live `src/ui/styles/**`
  path; they match no ban glob and import no banned symbol.
- **The additive ARIA / `.sr-only` / live-region edits** (Chunk 2) — add attributes / classes to
  existing templates; they introduce no import, no `innerHTML`/`v-html`/`outerHTML`/
  `insertAdjacentHTML` sink (REQ-AY-015, NFR-AY-003), and trip no guard.

**Verdict (verified against SPEC-AY-001..011 + DESIGN-AY-001 §C.6):**

- **NO new InjectionKey / port / composable / component / ADR.** P12 touches only the UI-layer CSS
  + the two import sites + additive ARIA/label/live-region attributes on already-live components.
- **NO guard-relax task in P12.** The new CSS file, the two import lines, and the ARIA edits are not
  caught by `DELETED_SUBSYSTEM_BAN` / `DELETED_INJECTION_KEYS`.
- **NO new token.** RG-5 reuses `--sp-focus-ring` / `--sp-shadow-focus-ring`.
- **`manifest.json` + `en.ts` / `de.ts` + all ten locales untouched** (NFR-AY-004/008). T-AY-018
  (the gate) re-confirms via `git diff next`.

One-line lint confirmation of the guard verdict (recorded at T-AY-001): the new file path, the two
import lines, and the additive ARIA edits trip no `no-restricted-imports` "deleted in the P0 reboot"
message — the project lint pass that exercises the registration lands green with T-AY-002.
