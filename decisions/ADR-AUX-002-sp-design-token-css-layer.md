---
id: ADR-AUX-002
title: Introduce a --sp-* design-token CSS layer mapped onto Obsidian theme vars
status: accepted
date: 2026-05-22
deciders:
  - architect
consulted:
  - ui-designer
  - ux-designer
informed:
  - planner
  - dev
supersedes: []
superseded-by: []
tags: [ui, theming, css, design-system]
---

# ADR-AUX-002 — Introduce a `--sp-*` design-token CSS layer mapped onto Obsidian theme vars

## Status

Accepted (2026-05-22). Token enumeration in §4.1–§4.7 of `specs/agent-ux-parity/spec.md` is binding; the file-level layout (`tokens.css` + `animations.css`) is the single seam for `--sp-*` and named keyframes.

## Context

Currently every Vue component under `src/ui/agent/` and `src/ui/components/agent/` consumes Obsidian CSS variables (`--text-normal`, `--background-primary`, `--interactive-accent`, …) directly inside `<style scoped>` blocks. This is straightforward but has three problems exposed by the UX-parity work:

1. **No place to attach brand colour.** The Claudian-parity surface needs a per-provider brand colour (`Claude` orange, `Codex` neutral, `OpenCode` grey). Inlining the `[data-provider]` override at every component leaks knowledge of the provider switch into every scoped style.
2. **No rhythm.** Padding, gap, and radius are picked per component; the result drifts because nothing forces consistency.
3. **No single seam for reduced-motion / forced-colors / RTL.** Each component re-declares `prefers-reduced-motion` and physical/logical properties independently. The RTL sweep in `requirements.md` REQ-AUX-010 is hard to enforce without a central declaration.

The Claudian audit (`specs/agent-ux-parity/idea.md` §B) shows the polished surface depends on a coherent token vocabulary: brand, surfaces, radii, spacing, motion, typography. We need the equivalent vocabulary on our side — but we must not break Obsidian theme inheritance (custom themes set `--text-normal` etc.; users expect that to keep working).

## Decision

We ship a project-wide design-token CSS layer named `--sp-*` (Specorator-prefixed) declared in a new file `src/ui/styles/tokens.css`. The layer:

1. Declares every token on the `.specorator-root` selector. The Agent Sidepanel root already carries that class.
2. **Defaults each token to a `var(--*)` lookup against Obsidian's theme**, e.g. `--sp-text-normal: var(--text-normal);`. User themes continue to drive the palette by transitive resolution.
3. Defines brand-flavour tokens as literals (`--sp-brand-claude: #D97757;`, etc.) inside the same file — never at usage sites.
4. Uses `.specorator-root[data-provider="claude|codex|opencode|cursor"]` to rebind `--sp-brand` to the matching flavour. `AgentSidepanelRoot.vue` writes `[data-provider]` from `chatProviderStore.providerId`.
5. Centralises reduced-motion handling via `@media (prefers-reduced-motion: reduce)` blocks that collapse `--sp-duration-*` to `0s`. Components do not redeclare the media query.
6. Sits as the **single seam** between Obsidian's theme vars and Specorator's surfaces. Every MPS scoped style consumes `--sp-*` only.

A companion file `src/ui/styles/animations.css` declares the named keyframes (`thinking-pulse`, `streaming-cursor-blink`, `spin`, `mcp-glow`, `external-context-glow`). `tokens.css` `@imports` it so a single import in `src/ui/main.ts` brings both. The Obsidian build (Vite `cssCodeSplit: false`) inlines them into the bundled `styles.css` that the plugin ships.

A lint guard (Stylelint rule or grep-based CI check) forbids scoped styles under `src/ui/agent/**` and `src/ui/components/agent/**` from referencing `var(--text-*)`, `var(--background-*)`, `var(--interactive-*)` directly. The token file is the only place those references appear.

## Considered options

### Option A — `--sp-*` token layer with Obsidian-var defaults (chosen)

- Pros: backwards-compatible by construction; user themes keep working; single seam; brand swap is one attribute write; reduced-motion / forced-colors handled centrally.
- Cons: one more layer of indirection; we accept it because the surface area is bounded.

### Option B — Direct Obsidian-var usage + per-component `[data-provider]` overrides

- Pros: no new file.
- Cons: every component leaks the provider switch; brand updates must touch every scoped style; impossible to enforce rhythm.

### Option C — Replace Obsidian vars with a literal palette

- Pros: full visual control.
- Cons: breaks user themes; conflicts with Obsidian Marketplace expectations; introduces dark/light maintenance burden on us.

### Option D — Sass / PostCSS variables compiled at build time

- Pros: tooling-driven consistency.
- Cons: gives up runtime theme switching (the `[data-provider]` swap relies on runtime CSS var resolution); the build pipeline would need to learn Sass. Friction outweighs benefit.

## Consequences

### Positive

- Provider brand swap is a single attribute write (`AgentSidepanelRoot` sets `[data-provider]`); no remount, no per-component logic.
- Reduced-motion compliance lives in one file; new components inherit by consuming `--sp-duration-*`.
- The Claudian audit's "brand wash" surfaces (`--sp-brand-translucent`, `--sp-brand`) become declarative.
- Design-system upgrades (new radii / new spacing) land in one place.

### Negative

- One extra indirection level for theme reads. Negligible runtime cost (CSS resolves vars at use-time).
- Verify-gate gains a lint rule whose violations block PRs.

### Neutral

- Token names align with Claudian's `--claudian-*` shape but use `--sp-*` prefix.
- The bundle gains ~3–5 KB of CSS for the token + animation files (well within the 5% growth budget in `requirements.md` NFR-AUX-001).

## Compliance

- Stylelint (or grep-based CI check) flags forbidden direct Obsidian-var references under `src/ui/agent/**` and `src/ui/components/agent/**` — added in WS-AUX-9.
- A coverage check during code review (manual at first, automatable later) confirms every new `<style scoped>` consumes `--sp-*`.
- Visual-regression Storybook covers per-token reskins (WS-AUX-10).

## References

- `specs/agent-ux-parity/idea.md` §A.12 (no design-token layer), §B (Design tokens)
- `specs/agent-ux-parity/requirements.md` REQ-AUX-006, REQ-AUX-009, REQ-AUX-010, NFR-AUX-006, NFR-AUX-010
- `specs/agent-ux-parity/design.md` §C.2.2, §C.3.1, §C.3.4
- `specs/agent-ux-parity/design-part-b-ui.md` §B.1 (token catalogue)
- Claudian reference: `D:\Projects\claudian-main\styles\*.css` (`--claudian-*`)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
