---
feature: agent-ux-parity
stage: implementation
last_updated: 2026-05-22
last_agent: dev
---

# Implementation log — agent-ux-parity

Append-only log. One entry per task or coherent task batch. Each entry must
record commit SHA, files touched, spec reference, outcome, and any deviation
from the spec.

---

## WS-AUX-1 — Tokens + animations layer

### 2026-05-22 — T-AUX-001 — ADR-AUX-002 accepted

- **commit:** `9f4ec13` (`chore(aux): T-AUX-001 mark ADR-AUX-002 accepted`)
- **files:** `decisions/ADR-AUX-002-sp-design-token-css-layer.md`
- **spec:** ADR-AUX-002 §Status; spec.md §4.1–§4.7 (binding token tables)
- **outcome:** done
- **notes:** Marked ADR-AUX-002 `accepted` with explicit cross-reference to
  spec §4.1–§4.7. Unblocks T-AUX-002 onwards.

### 2026-05-22 — T-AUX-002 — RED token-presence test

- **commit:** `42237ec` (`test(aux): T-AUX-002 RED token-presence test for tokens.css`)
- **files:** `tests/ui/styles/tokens.test.ts` (new)
- **spec:** REQ-AUX-006, REQ-AUX-009; spec.md §4
- **outcome:** done (failing as RED — 7/7 tests fail with ENOENT for the
  missing tokens.css until T-AUX-003)
- **notes:** String-grep over `src/ui/styles/tokens.css` for every token
  declaration in §4.1–§4.7 plus the four provider-override selectors, the
  `body.theme-light` block, the Copernicus serif stack, and the
  `prefers-reduced-motion` @media. Source-level grep is the deterministic
  contract check; mount-and-compute style assertion does not work under
  jsdom because `var(--text-*)` chains dead-end against undefined Obsidian
  theme vars.

### 2026-05-22 — T-AUX-003..006 — tokens.css

- **commit:** `1c2b986` (`feat(aux): T-AUX-003..006 add tokens.css design-token layer`)
- **files:** `src/ui/styles/tokens.css` (new)
- **spec:** REQ-AUX-006, REQ-AUX-007, REQ-AUX-009, NFR-AUX-006; spec.md §4.1–§4.7
- **outcome:** done; T-AUX-002 GREEN (7/7)
- **notes:** Lands the additive `--sp-*` layer on `.specorator-root`. All
  colour defaults chain to `var(--text-*)` / `var(--background-*)` / etc.,
  preserving user-theme inheritance. Brand literals inlined; provider
  overrides bound via `[data-provider]`. Reduced-motion `@media` block
  collapses `--sp-duration-*` to `0s`. Batched T-AUX-003 (colour),
  T-AUX-004 (brand + provider + body.theme-light override + CQ-AUX-01
  cursor placeholder inline comment), T-AUX-005 (typography with
  Copernicus stack), T-AUX-006 (spacing + radii + shadow/z/motion + surfaces
  + reduced-motion) into one commit because they share the file and the
  spec gives verbatim CSS. **CQ-AUX-01 carry-through:** cursor brand is
  the placeholder `#6b7280` with the `CQ-AUX-01` inline comment per task
  DoD.

### 2026-05-22 — T-AUX-007 — RED keyframes-presence test

- **commit:** `36aa42e` (`test(aux): T-AUX-007 RED keyframes-presence test for animations.css`)
- **files:** `tests/ui/styles/animations.test.ts` (new)
- **spec:** REQ-AUX-008, REQ-AUX-019; spec.md §1.3.6 / §3.4 / §4.6
- **outcome:** done (failing as RED — 2/2 tests fail with ENOENT)
- **notes:** Asserts the five required `@keyframes` declarations and the
  `prefers-reduced-motion` override for `spin` (CQ-AUX-14).

### 2026-05-22 — T-AUX-008 — animations.css

- **commit:** `c1a42b8` (`feat(aux): T-AUX-008 add animations.css with 5 named keyframes`)
- **files:** `src/ui/styles/animations.css` (new)
- **spec:** REQ-AUX-008, REQ-AUX-019; spec.md §1.3.6 / §3.4 / §4.6
- **outcome:** done; T-AUX-007 GREEN
- **notes:** `thinking-pulse`, `streaming-cursor-blink`, `spin`,
  `mcp-glow`, `external-context-glow`. CQ-AUX-14 satisfied via explicit
  `prefers-reduced-motion` block that halts indeterminate `spin`
  animations (durations elsewhere collapse via the `--sp-duration-*`
  tokens defined in tokens.css).

### 2026-05-22 — T-AUX-009 — wire styles into main.ts

- **commit:** `1634834` (`feat(aux): T-AUX-009 import tokens.css + animations.css in ui/main.ts`)
- **files:** `src/ui/main.ts`
- **spec:** REQ-AUX-009
- **outcome:** done; `npm run build:web` green (274.48 kB JS / 21.77 kB CSS
  raw, 95.45 kB / 3.94 kB gzipped)

### 2026-05-22 — T-AUX-010 — RED [data-provider] plumbing test

- **commit:** `ea49f0f` (`test(aux): T-AUX-010 RED [data-provider] plumbing test for root`)
- **files:** `tests/ui/agent/AgentSidepanelRoot.dataProvider.test.ts` (new),
  `tests/ui/agent/AgentSidepanelRoot.dataProvider.po.ts` (new co-located
  PageObject)
- **spec:** REQ-AUX-006
- **outcome:** done (3/4 RED — the "degraded omits data-provider" test
  trivially passes because the attribute is absent altogether before the
  binding lands)
- **notes:** Co-located PageObject queries by data-testid only, per ADR-009.

### 2026-05-22 — T-AUX-011 — bind [data-provider] on root

- **commit:** `0a853b0` (`feat(aux): T-AUX-011 bind [data-provider] on AgentSidepanelRoot`)
- **files:** `src/ui/agent/AgentSidepanelRoot.vue`
- **spec:** REQ-AUX-006; spec.md §3.3
- **outcome:** done; T-AUX-010 GREEN (4/4)
- **notes:** Adds `specorator-root` to the template root classes so the
  `--sp-*` token layer applies, and binds `:data-provider` to a computed
  derived from `chatProviderStore.resolved`. `'degraded'` → `null` so the
  attribute is elided. Spec §1.3 mentions `providerStore.providerId` but
  the existing store exposes `resolved.provider` — the computed maps the
  store's actual shape; no API change.

### 2026-05-22 — T-AUX-012 — provider swap recolours brand without remount

- **commit:** `58ba641` (`test(aux): T-AUX-012 provider-swap brand recolour test`)
- **files:** `tests/ui/agent/AgentSidepanelRoot.providerSwap.test.ts` (new)
- **spec:** REQ-AUX-006
- **outcome:** done; green
- **notes:** Injects tokens.css into the jsdom document via a `<style>`
  element so the `[data-provider]` selectors apply, then asserts both the
  indirection token (`--sp-brand` chains to `--sp-brand-<id>`) and the
  brand literal endpoint (`--sp-brand-claude` → `#d97757`,
  `--sp-brand-cursor` → `#6b7280`). jsdom does not resolve nested `var()`
  chains, so the assertion is split across two reads.

### 2026-05-22 — T-AUX-013 — Tokens Storybook reference page

- **commit:** `a285331` (`feat(aux): T-AUX-013 Tokens reference Storybook page`)
- **files:** `stories/styles/Tokens.stories.ts` (new)
- **spec:** REQ-AUX-017; spec.md §5.3
- **outcome:** done (deviation noted)
- **deviation:** Spec §5.3 lists the file at
  `src/ui/styles/__stories__/Tokens.stories.ts`, but the project's
  `.storybook/main.ts` only globs `../stories/**`. Filed under
  `stories/styles/` to remain discoverable. Story-glob relocation is out
  of scope for WS-AUX-1.

### 2026-05-22 — T-AUX-014 — baseline gzipped bundle size

- **commit:** `cebeaaa` (`chore(aux): T-AUX-014 capture WS-AUX-1 baseline gzipped bundle size`)
- **files:** `specs/agent-ux-parity/bundle-baseline.json` (new)
- **spec:** NFR-AUX-001
- **outcome:** done
- **baseline (gzip):**
  - plugin `main.js`: 707,263 B; `styles.css`: 9,368 B; **total 716,631 B**
  - standalone `index.js`: 94,548 B; `index.css`: 3,951 B; **total 98,499 B**
- **notes:** T-AUX-351 (WS-AUX-10) will read these to enforce the 5%
  ceiling.

### 2026-05-22 — WS-AUX-1 verify-gate close-out

- **commit:** `3506535` (`fix(aux): WS-AUX-1 lint cleanup + bundled styles.css refresh`)
- **files:** `eslint.config.js`, `stories/styles/Tokens.stories.ts`,
  `tests/ui/styles/animations.test.ts`, `styles.css`
- **outcome:** done — `npm run verify` GREEN
- **lint config change:** Added `obsidianmd/prefer-active-doc`,
  `prefer-active-window-timers`, `prefer-create-el`,
  `no-forbidden-elements` to the `tests/**` relaxation block. These rules
  are about runtime safety inside the plugin sandbox (popout window,
  Obsidian DOM helpers); vitest runs under jsdom in node and legitimately
  drives the DOM directly (e.g. injecting `<style>` to verify CSS-token
  cascades). The relaxation is scoped to test files only.
- **styles.css refresh:** the plugin build emits the bundled stylesheet
  with new scoped-style hashes after the AgentSidepanelRoot.vue edit; the
  repo tracks `styles.css` for Obsidian marketplace install so the diff
  is part of WS-AUX-1.
- **verify output:**
  - typecheck green
  - lint green (50 warnings, 0 errors — all pre-existing in unrelated
    files)
  - unit tests: 232 files, 2276 tests, all passing
  - coverage: Statements 91.37% / Branches 85.35% / Functions 91.05% /
    Lines 92.48% — well above the 80/70/80/80 thresholds
  - plugin build: main.js 2.89 MB / 4 MB budget OK
  - standalone build: largest JS chunk 0.26 MB / 2 MB budget OK
  - docs:api, validate:manifest, verify:scaffold, verify:workflows all green

---

### CQ carry-through summary (WS-AUX-1)

- **CQ-AUX-01 (Cursor brand colour):** unresolved. Placeholder `#6b7280`
  in `tokens.css` with `CQ-AUX-01` inline comment per T-AUX-004 DoD.
  Blocks nothing in WS-AUX-1; PM + ux-designer must confirm before
  release.
- **CQ-AUX-14 (`spin` reduced-motion override):** resolved by T-AUX-008
  (explicit `@media (prefers-reduced-motion: reduce)` block halts spin).

### Follow-ups raised by WS-AUX-1

- No new CQ-AUX-NN raised.
- Minor follow-up: align `.storybook/main.ts` story globs with the spec
  §5.3 paths so future stories can live under
  `src/ui/**/__stories__/`. Not a blocker; can be a chore commit in any
  later WS or addressed by WS-AUX-10's Storybook coverage audit.

---

## WS-AUX-2 — IconPort + SpIcon

### 2026-05-22 — T-AUX-015 — ADR-AUX-001 accepted

- **commit:** `3355d09` (`chore(aux): T-AUX-015 mark ADR-AUX-001 accepted`)
- **files:** `decisions/ADR-AUX-001-icon-port-for-set-icon.md`
- **spec:** ADR-AUX-001; spec.md §1.1
- **outcome:** done
- **notes:** Flipped frontmatter `status: proposed → accepted` and the
  body status line. ADR enumerates `setIcon(el, name): void` verbatim as
  in spec §1.1. Unblocks T-AUX-016 onward.

### 2026-05-22 — T-AUX-016..027 — IconPort + bridge impls + wiring

- **commit:** `297f9d1` (`feat(aux): T-AUX-016..027 add IconPort + bridge impls + wiring`)
- **files:**
  - `tests/domain/ports/IconPort.contract.test.ts` (new, T-AUX-016 RED → GREEN)
  - `src/domain/ports/IconPort.ts` (new, T-AUX-017)
  - `src/domain/ports/index.ts` (T-AUX-018 — re-export `IconPort`)
  - `tests/ui/composables/useIconPort.test.ts` (new, T-AUX-019 RED → GREEN)
  - `src/infrastructure/bridge/ports.ts` (T-AUX-020 — `ICON_PORT` symbol)
  - `src/ui/composables/useIconPort.ts` (new, T-AUX-021)
  - `src/infrastructure/obsidian/ObsidianBridge.ts` (T-AUX-022 — delegates to `obsidian.setIcon`)
  - `src/infrastructure/mock/MockBridge.ts` (T-AUX-023 — SVG `<title>` placeholder + `markIconAsMissing()` test helper)
  - `src/infrastructure/localstorage/LocalStorageBridge.ts` (T-AUX-024 — mirrors MockBridge)
  - `tests/__fakes__/fake-ports.ts` (T-AUX-025 — exposes `iconPort` field)
  - `src/ui/main.ts` (T-AUX-026 — `app.provide(ICON_PORT, bridge)`)
  - `src/plugin/SpecoratorView.ts`, `src/plugin/AgentSidepanelView.ts` (T-AUX-027)
- **spec:** REQ-AUX-001, ADR-AUX-001; spec.md §1.1, §1.5
- **outcome:** done; both RED tests GREEN (3/3 contract + 2/2 composable)
- **notes:** Bridge placeholders use `el.ownerDocument.createElementNS`
  instead of the global `document` (passes the
  `obsidianmd/prefer-active-doc` rule without an inline exception).
  `MockBridge.markIconAsMissing(name)` is a test-only helper that flips
  the bridge into "no-op" mode for a given icon name; required by the
  SpIcon T-AUX-029/030 RED tests to exercise the textContent fallback
  path deterministically.

### 2026-05-22 — T-AUX-028..033 — SpIcon primitive + PO + stories

- **commit:** `72a90ce` (`feat(aux): T-AUX-028..033 add SpIcon primitive + PO + stories`)
- **files:**
  - `tests/ui/components/primitives/SpIcon.test.ts` (new, T-AUX-028/029/030 RED → GREEN)
  - `tests/ui/components/primitives/SpIcon.po.ts` (new, T-AUX-032)
  - `src/ui/components/primitives/SpIcon.vue` (new, T-AUX-031)
  - `stories/primitives/SpIcon.stories.ts` (new, T-AUX-033)
- **spec:** REQ-AUX-001, REQ-AUX-018, REQ-AUX-017; spec.md §1.3.1
- **outcome:** done; 5/5 SpIcon tests green
- **notes:**
  - `<SpIcon>` exposes the host `el` ref via `defineExpose({ el })`.
  - `onMounted` + `watch(() => props.name)` call `iconPort.setIcon`;
    if no `<svg>` appears after the call, the component writes
    `el.textContent = ariaLabel ?? name` and emits a
    `loggerPort.warn('SpIcon: missing icon "{name}"', { name })`
    deduplicated through a module-level `Set<string>`. The set is
    cleared by a private export `__resetSpIconWarnedNames()` used only
    by the unit tests.
  - `aria-hidden` is the literal string `"true"`/`"false"` so the test
    can assert verbatim without DOM coercion ambiguity.
- **deviation:** Story lives at `stories/primitives/SpIcon.stories.ts`
  rather than `src/ui/components/primitives/__stories__/SpIcon.stories.ts`
  because `.storybook/main.ts` only globs `../stories/**` (same
  deviation as the WS-AUX-1 Tokens story). Story-glob relocation
  remains a deferred follow-up.

### 2026-05-22 — T-AUX-034 — WS-AUX-2 verify-gate close-out

- **commit:** rolled into the SpIcon commit (`72a90ce`) — no
  additional code change required; `npm run verify` runs clean off
  the WS-AUX-2 tip.
- **spec:** NFR-AUX-007
- **outcome:** done — verify GREEN.
- **verify output:**
  - typecheck green
  - lint green (55 warnings, 0 errors — all pre-existing in unrelated
    files)
  - plugin build: `main.js` 2.89 MB / 4 MB budget OK; gzipped
    `main.js` 710.58 kB (baseline 707.26 kB, +0.47%); `styles.css`
    gzipped 9.37 kB (~baseline)
  - standalone build: largest JS chunk 0.26 MB / 2 MB budget OK;
    gzipped JS 95.60 kB (baseline 94.55 kB, +1.11%)
  - all build deltas well inside the 5% budget ceiling that
    T-AUX-351 will enforce
  - docs:api, validate:manifest, verify:scaffold, verify:workflows all green

### Follow-ups raised by WS-AUX-2

- No new CQ-AUX-NN raised.
- The Storybook story-glob mismatch carries forward from WS-AUX-1 —
  this WS adds one more file under `stories/` instead of
  `src/ui/components/primitives/__stories__/`. Already on the deferred
  follow-up list.
