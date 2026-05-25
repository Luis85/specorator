---
id: DESIGN-TC-001
title: Toolbar & Controls (P6) — design (UX + UI + Architecture)
stage: design
feature: toolbar-controls
area: TC
status: complete
owner: architect
epic: claudian-reboot
phase: P6
integration_branch: next
reference: D:\Projects\claudian-main
requires:
  - PRD-TC-001                                  # specs/toolbar-controls/requirements.md
  - CHARTER-CLAUDIAN-REBOOT                      # §3.5 / §3.10 / §4 (P6)
adrs:
  - ADR-TC-001  # toolbar mount + per-tab control state (CLAR-TC-003)
  - ADR-TC-002  # additive ChatRuntimeQueryOptions fields: mode? / reasoning? / serviceTier? (CLAR-TC-001)
  - ADR-TC-003  # capability-gate / honest-defer seam via the ToolbarCatalogPort + RuntimeCapabilities (REQ-TC-003)
  - ADR-TC-004  # provider option-list source (ToolbarCatalogPort) + external-context visible-disabled seam (CLAR-TC-002)
created: 2026-05-25
updated: 2026-05-25
---

# Design — Toolbar & Controls (P6)

> Three parts. **A — UX** (the control-strip layout, the per-widget state matrix
> idle/selected/loading-options/disabled-seam/error, the keyboard + a11y model, responsive
> behaviour). **B — UI** (the Vue component inventory + co-located PageObjects, the `toolbar/*`
> `--sp-*` token slice, microcopy / i18n keys en+de). **C — Architecture** (system overview, the
> additive domain changes, the capability-source port + three-bridge story, the data flow that
> folds a selection into the next turn, DDD placement, the ADR-TC list). The three CLARs resolve as
> **ADR-TC-001..004** (accepted, autonomous-drive).

This phase layers on the **merged P1–P5 surface**. It extends `ChatComposer.vue` the same additive
way P5 added its context bar (`ChatComposer.vue:39-44`/`:336-356`): an optional **toolbar slot**
above the textarea that is absent → the composer renders **byte-identical to P5** (REQ-TC-002, G5,
NFR-TC-001). It reads the per-tab control state from the P3 `tabsStore` (`TabState`, additive
fields), surfaces the meter from the P2 `UsageInfo` already flowing onto `TabState.usage`
(`tabsStore.ts:63`/`:675`), and folds each backed widget's choice into the next turn's
`ChatRuntimeQueryOptions` exactly as P4/P5 fold `appendSystemPrompt`/context (`tabsStore.ts:566`/
`buildTurnRequest`). The P0–P5 `ChatRuntimeQueryOptions` members (`model`, `forceColdStart`,
`appendSystemPrompt`) and the P1–P5 composer send path stay byte-identical (NFR-TC-001). The seam
widgets mirror the P5 `supportsBrowserSelection` honest-defer pattern (`ChatComposer.vue:64`,
ADR-CA-003 §2).

---

## Part A — UX

### A.0 The surface this layers on

The P5 composer is a bordered rounded wrapper: a context-bar region (file/image chips + selection
indicator), the textarea, the palette dropdowns, the inline interactive blocks, and a footer
toolbar that today holds only the paperclip + send/stop controls (`ChatComposer.vue:386-406`). P6
adds the **input toolbar control strip** — Claudian's `.claudian-input-toolbar` flex row
(`InputToolbar.ts`) — as a new region between the textarea and that footer. The strip is a single
horizontal row of widgets; the usage meter is pinned to the trailing end, the selectors/toggles
group at the leading end, matching Claudian's order (REQ-TC-001).

### A.1 Control-strip layout (REQ-TC-001, REQ-TC-002)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [context bar — P5, when non-empty]                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  textarea …                                                          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  ┌── toolbar strip (P6) ────────────────────────────────────────────────┐ │
│  │ [Model ▾] [Mode⇄] [🛡 Perm⇄] [Effort ▾] [⚡Tier] [MCP▾] [📁Ext]  ◷42% │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│  [📎]                                                                  [↑]  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Leading group** (in Claudian order): model selector · mode selector · permission toggle ·
  thinking selector · service-tier toggle · MCP selector · external-context control.
- **Trailing**: the usage/context arc-gauge meter, right-pinned.
- Each widget region carries a stable `data-testid` (`toolbar-strip`, `toolbar-model`,
  `toolbar-mode`, `toolbar-permission`, `toolbar-thinking`, `toolbar-service-tier`, `toolbar-mcp`,
  `toolbar-external`, `toolbar-usage`).
- **The strip is additive (REQ-TC-002).** With no `toolbar` prop the strip region does not render
  and the composer is byte-identical to P5 — same DOM, same keyboard, same send path. A
  no-toolbar-interaction turn serialises with the P0–P5 `ChatRuntimeQueryOptions` members only
  (NFR-TC-001).
- A widget that the capability gate hides **collapses its slot** — the row closes the gap, never a
  dead/empty button (REQ-TC-019, REQ-TC-021).

### A.2 Per-widget state matrix

Every widget renders one of a small set of states. The seam widgets add a **disabled-seam** state
the backed widgets never reach.

| Widget | idle / current value | open / selected | loading-options | disabled-seam | error |
|---|---|---|---|---|---|
| **Model** (backed) | current model label (REQ-TC-010) | grouped list, current marked (REQ-TC-011) | skeleton row while the catalog resolves | — | catalog empty → button shows the persisted value, list shows an empty notice (NFR-TC-010) |
| **Mode** (backed) | current mode label + toggle state (REQ-TC-013) | toggled to the other option (REQ-TC-014) | n/a (two static options) | — | absent descriptor → not rendered (REQ-TC-013) |
| **Thinking** (backed) | "Effort: Medium" / budget amount (REQ-TC-017) | option chosen (REQ-TC-018) | skeleton while options resolve | — | `none`/single option → not rendered (REQ-TC-017) |
| **Usage meter** (backed) | arc fill + "42%" (REQ-TC-024) | — | — | — | no usage → not rendered (REQ-TC-027) |
| **Service-tier** (seam) | toggle state where descriptor present (REQ-TC-019) | toggled active/inactive (REQ-TC-020) | n/a | **hidden** when no descriptor (Claude) — capability-gated, not disabled | — |
| **Permission** (seam) | label + toggle / "PLAN" label (REQ-TC-015) | — | — | **visible-disabled** with a "permissions arrive in a later release" affordance (REQ-TC-016) | — |
| **MCP** (seam) | icon + count-0 badge shell where `supportsMcpTools` (REQ-TC-021) | opens an empty "MCP servers arrive in a later release" panel (REQ-TC-022) | — | **hidden** when `!supportsMcpTools`; **visible-empty** otherwise | — |
| **External-context** (seam) | paperclip-folder icon (REQ-TC-023) | — | — | **visible-disabled** with an "external folders arrive in a later release" affordance; no picker opens (REQ-TC-023, CLAR-TC-002) | — |

> **The honest-defer contract (G3, counter-metric).** A seam widget is EITHER capability-hidden
> (service-tier on Claude, MCP when `!supportsMcpTools`) OR visible-but-explicitly-disabled with a
> "coming in a later release" affordance (permission, external-context, the MCP empty panel). It is
> never a live-looking control that silently does nothing, and it never persists a rule, opens a
> picker, connects a server, or writes a turn field (REQ-TC-016/022/023). This mirrors P5's
> `supportsBrowserSelection` defer (ADR-CA-003 §2): the affordance exists, the gate is explicit, the
> strip degrades gracefully.

### A.3 The three backed selectors (model / thinking — list selectors)

- **Open** on click OR keyboard (REQ-TC-040): the button is `role="combobox"` `aria-haspopup="listbox"`
  `aria-expanded`; the list is `role="listbox"`, each option `role="option"` with `aria-selected`.
- **Navigate**: ArrowUp/ArrowDown move the active descendant (`aria-activedescendant`); Home/End jump;
  Enter/Space select; Escape closes and restores focus to the button. **No hover-only open path** —
  Claudian opens these on hover (`model-selector.css`); Specorator adds the keyboard/focus path
  (REQ-TC-040, NFR-TC-009).
- **Grouped lists** (model): group separators render as `role="presentation"` headings inside the
  listbox; the current model is marked selected and the list is reversed-recent per Claudian
  `ModelSelector.renderOptions` (REQ-TC-011).
- **Select** → the active tab's matching control field updates (REQ-TC-012/018); the next submitted
  turn carries it (A.5 fold).

### A.4 The toggles (mode / permission / service-tier)

- A toggle is a `role="switch"` (or `aria-pressed` button) exposing its on/off state to AT
  (REQ-TC-041) — Claudian's `SpToggleSwitch` is visual-only; Specorator adds the AT state.
- **Mode** flips between the two configured options (REQ-TC-014); **service-tier** flips
  active/inactive where the descriptor exists (REQ-TC-020).
- **Permission** renders the current display state and the **PLAN special-case** (toggle replaced by a
  "PLAN" label) reflecting the P4 plan state (NG6 — display only, P6 does not own plan mode). Its
  interaction is the honest seam (REQ-TC-016): disabled with a "coming later" affordance; no rule
  persists, no `data.json` write.

### A.5 Selection → next turn (the fold, REQ-TC-004)

A backed widget never sends on change — it updates the **active tab's per-tab control state**
(ADR-TC-001). On the next turn submit, the surface folds the current control state into the request's
`ChatRuntimeQueryOptions` (ADR-TC-002), exactly mirroring how P5 folds context in `buildTurnRequest`
and P4 folds `appendSystemPrompt` in `_turnQueryOptions` (`tabsStore.ts:566`/`:601`):

- `model` (already exists) ← model selector
- `mode?` (new) ← mode selector
- `reasoning?` (new, discriminated) ← thinking selector
- `serviceTier?` (new, declared-now/emitted-later) ← service-tier toggle

Each field is written **only when the control carries a non-default value**, so a turn taken with no
toolbar interaction is byte-identical to a P5 turn (NFR-TC-001). The seam widgets (permission, MCP,
external) fold **nothing** in P6.

### A.6 Usage / context meter (REQ-TC-024..027)

- The meter reads `TabState.usage` (`UsageInfo`), which the P2 `onUsage` sink already populates
  (`tabsStore.ts:675`). It renders a **240° arc gauge** (Claudian `ContextUsageMeter`) showing the
  context-window fill `percentage` + a "{n}%" label (REQ-TC-024). The arc is a declarative Vue-bound
  SVG `<path>` (computed `d` + `stroke-dasharray`) — no `v-html`, no `innerHTML` (NFR-TC-004).
- It **updates** on every usage `StreamChunk` because `usage` is reactive `TabState` (REQ-TC-025).
- Past the **warning threshold** (Claudian >80%) it switches to the warning style and exposes a
  tooltip suggesting `/compact` (REQ-TC-026).
- With **no usage yet** (`usage === null`) the meter is **not rendered** — no zero-state gauge
  (REQ-TC-027).
- On **tab switch** the meter (and every other widget) reflects the newly-active tab's state because
  all widget state is read from `activeTab` (REQ-TC-042).

### A.7 Accessibility (WCAG 2.2 AA, NFR-TC-009)

- **Selectors** are keyboard-openable and arrow-navigable (A.3); no hover-only trap (REQ-TC-040).
- **Toggles** expose pressed/checked state + an accessible name (REQ-TC-041).
- **Focus** is managed and visible: opening a list moves focus into it via `aria-activedescendant`;
  Escape restores focus to the trigger; the strip is in the natural tab order after the textarea.
- The **meter** is `role="img"` with an `aria-label` ("Context usage 42%") — colour is never the only
  signal; the percentage text carries the value (warning state adds a text/title cue, not colour
  alone).
- **forced-colors** and **reduced-motion** are honoured: the meter fill animation and any
  mcp/external glow degrade to no-motion; the warning state uses a border/label cue that survives
  forced-colors — asserted in component tests.

### A.8 Responsive behaviour (charter widths 320 / 520 / 720 px, NFR-TC-008)

- At **720 px** the full strip fits on one row.
- At **520 px** widget labels may abbreviate (icon + value, label hidden via `aria-label`) but every
  widget stays present and operable.
- At **320 px** the strip wraps to a second row (flex-wrap) with the meter dropping to the trailing
  end of the wrapped row; no widget is dropped or hidden by width alone (only by capability).
- Hidden-by-capability widgets collapse their flex slot at every width (A.1).

---

## Part B — UI

### B.1 Component inventory

One Vue component per widget + a strip container, each `<script setup>`, each with a co-located
`data-testid` PageObject (`.po.ts`) (NFR-TC-005/006). No component imports `obsidian`; provider
catalog, capability flags, usage data all arrive as props/DTOs from the view-model (NFR-TC-003).

| Component | Responsibility | data-testid | New/changed |
|---|---|---|---|
| `chat/toolbar/ToolbarStrip.vue` | the `.claudian-input-toolbar` flex row; lays out the widgets in Claudian order; gates each child on the capability view-model; emits each widget's change up to `ChatSurface` | `toolbar-strip` | new |
| `chat/toolbar/ModelSelector.vue` | grouped listbox of the active provider's models; current marked; keyboard-openable (REQ-TC-010..012/040) | `toolbar-model` | new |
| `chat/toolbar/ModeSelector.vue` | two-option toggle, descriptor-driven; auto-hidden when no descriptor (REQ-TC-013/014/041) | `toolbar-mode` | new |
| `chat/toolbar/PermissionToggle.vue` | permission/PLAN display + the honest-defer disabled affordance (REQ-TC-015/016) | `toolbar-permission` | new |
| `chat/toolbar/ThinkingSelector.vue` | effort/token-budget listbox; auto-hidden on `none`/single (REQ-TC-017/018) | `toolbar-thinking` | new |
| `chat/toolbar/ServiceTierToggle.vue` | zap toggle; capability-hidden when no descriptor (REQ-TC-019/020) | `toolbar-service-tier` | new |
| `chat/toolbar/McpSelector.vue` | MCP shell + count badge; visible-empty "coming later" panel; hidden when `!supportsMcpTools` (REQ-TC-021/022) | `toolbar-mcp` | new |
| `chat/toolbar/ExternalContextControl.vue` | visible-disabled folder affordance, no picker (REQ-TC-023) | `toolbar-external` | new |
| `chat/toolbar/UsageMeter.vue` | 240° arc-gauge SVG bound declaratively; warning + tooltip; hidden when no usage (REQ-TC-024..027) | `toolbar-usage` | new |
| `chat/ChatComposer.vue` | host an optional `toolbar` slot/region between textarea + footer; re-emit widget changes (additive prop) (REQ-TC-001/002) | `chat-composer` | changed (additive) |

`ToolbarStrip` is the only widget that reads the capability view-model; the leaf widgets are
presentational (props in, events out) so each is testable in isolation with a fake DTO.

### B.2 `--sp-*` token slice (charter §3.10 `toolbar/*`)

Reuse the existing token set (`--sp-border`, `--sp-radius-*`, `--sp-bg-*`, `--sp-text-*`,
`--sp-accent`, `--sp-brand`, `--sp-space-*`, `--sp-font-*`, `--sp-status-*`, `--sp-warning`,
`--sp-shadow-dropup`, `--sp-z-dropdown`, `--sp-duration-*`). **No hex, no raw Obsidian var, no
physical CSS property** — `lint-style-tokens` guard (NFR-TC-008). The strip's dropdowns reuse the P4
`SpDropdownPanel`/`--sp-surface-overlay` pattern. Mint only the genuinely-new toolbar tokens, each
justified at review against a Claudian `toolbar/*` CSS rule:

| New token (only if not already present) | Surface | Maps to Claudian |
|---|---|---|
| `--sp-toolbar-gap` | strip row | `.claudian-input-toolbar` flex gap (reuse `--sp-space-2` if equivalent) |
| `--sp-toolbar-widget-h` | each widget | toolbar control height |
| `--sp-toolbar-disabled-opacity` | seam widgets | the "coming later" dimmed affordance |
| `--sp-toggle-track` / `--sp-toggle-thumb` | mode/permission/service-tier toggles | `SpToggleSwitch` track/thumb (reuse `--sp-border`/`--sp-bg-secondary` if equivalent) |
| `--sp-toggle-active` | toggle-on | the active fill (reuse `--sp-accent`) |
| `--sp-usage-arc-track` | meter | the gauge background arc (`context-footer.css`) |
| `--sp-usage-arc-fill` | meter | the gauge fill (reuse `--sp-accent`) |
| `--sp-usage-arc-warn` | meter >80% | the pale-red warning fill (reuse `--sp-warning`) |
| `--sp-usage-arc-size` / `--sp-usage-arc-stroke` | meter | gauge box + stroke width |
| `--sp-service-tier-glow` | service-tier active | the `zap` active glow (reduced-motion safe) |

> Prefer reuse over a near-duplicate. Each minted token is checked against a
> `toolbar/{model,mode,thinking,mcp,external-context}-selector.css` /
> `{permission,service-tier}-toggle.css` / `context-footer.css` rule at review.

### B.3 Microcopy / i18n (en + de, NFR-TC-014)

All new strings go through the existing `TranslationPort`/`vue-i18n` with English keys (en + de like
P5; full-locale parity is NG8 → P11). New keys under `agent.chat.toolbar.*`:

| Key | en |
|---|---|
| `toolbar.model.label` | "Model" |
| `toolbar.model.open` | "Choose a model" |
| `toolbar.mode.label` | "Mode" |
| `toolbar.permission.label` | "Permissions" |
| `toolbar.permission.plan` | "PLAN" |
| `toolbar.permission.deferred` | "Permission controls arrive in a later release." |
| `toolbar.thinking.effortLabel` | "Effort" |
| `toolbar.thinking.budgetLabel` | "Thinking budget" |
| `toolbar.serviceTier.label` | "Fast mode" |
| `toolbar.mcp.label` | "MCP servers" |
| `toolbar.mcp.empty` | "MCP servers arrive in a later release." |
| `toolbar.external.label` | "External folders" |
| `toolbar.external.deferred` | "External folders arrive in a later release." |
| `toolbar.usage.label` | "Context usage {percent}%" |
| `toolbar.usage.compactHint` | "Context is filling up — run /compact to free space." |

No hardcoded user-facing string in any new component; no `v-html` (NFR-TC-004).

### B.4 Parity-screenshot plan (deferred to the single final review gate)

Per-widget parity screenshots vs claudian at **320 / 520 / 720 px, light + dark** (NFR-TC-008,
charter §5.1): (1) the full strip with Claude active (service-tier + MCP hidden, external disabled),
(2) the model selector open (grouped, current marked), (3) the thinking selector open (effort + token
variants), (4) the mode + permission toggles (incl. the PLAN label), (5) the usage meter at <80% and
the >80% warning + `/compact` tooltip, (6) the strip wrapped at 320 px. These accumulate for the
single final human review gate (autonomous-drive directive).

---

## Part C — Architecture

### C.1 System overview

```mermaid
flowchart TD
    subgraph ui[ui (Vue, no obsidian)]
        composer[ChatComposer.vue + toolbar region]
        strip[ToolbarStrip.vue]
        widgets[Model/Mode/Permission/Thinking/ServiceTier/Mcp/External/UsageMeter]
        surface[ChatSurface.vue — owns the toolbar view-model]
    end
    subgraph store[ui store]
        tabs[tabsStore — per-tab control state + usage]
    end
    subgraph app[application]
        vm[buildToolbarViewModel — pure]
        fold[foldControlOptions — pure, in buildTurnRequest]
    end
    subgraph domain[domain]
        cqo[ChatRuntimeQueryOptions + ReasoningChoice]
        caps[RuntimeCapabilities + getToolbarCapabilities]
        catalog[ToolbarCatalogPort + ToolbarCatalog DTO]
        usage[UsageInfo — UNCHANGED]
    end
    subgraph plugin[plugin (owns obsidian)]
        bridges[ObsidianBridge / MockBridge / LocalStorageBridge]
    end
    composer --> strip --> widgets
    surface --> strip
    surface --> vm
    vm --> catalog & caps
    widgets -->|change| surface -->|update| tabs
    tabs -->|submit| fold --> cqo
    surface --> usage
    catalog & caps --> bridges
```

### C.2 Components & responsibilities

| Layer | Component | Responsibility | New/changed |
|---|---|---|---|
| domain | `chat/ChatTurn.ts` | grow `ChatRuntimeQueryOptions` with `mode?`/`reasoning?`/`serviceTier?` (all optional — ADR-TC-002 §1); the P0–P5 members stay byte-identical | changed (additive) |
| domain | `chat/Reasoning.ts` | the discriminated `ReasoningChoice = { kind:'effort'; value } \| { kind:'budget'; tokens }` (ADR-TC-002 §2) | new |
| domain | `chat/toolbar/ToolbarCatalog.ts` | pure DTOs: `ModelOption`/`ModeDescriptor`/`ReasoningDescriptor`/`ServiceTierDescriptor` + `ToolbarCatalog` (the static-for-Claude option lists) | new |
| domain | `ports/ToolbarCatalogPort.ts` | `getCatalog(providerId): ToolbarCatalog` — the option-list + descriptor source (ADR-TC-004 §1) | new |
| domain | `ports/ChatRuntimePort.ts` | append `getToolbarCapabilities(): ToolbarCapabilities` to `RuntimeCapabilities` access (ADR-TC-003 §2); the P3/P4 flags stay byte-identical | changed (additive) |
| application | `chat/toolbar/buildToolbarViewModel.ts` | pure: `(catalog, capabilities, tabControls, usage) → ToolbarViewModel` (which widgets show, their current values, their seam state) — REQ-TC-003 no-provider-branch | new |
| application | `chat/toolbar/foldControlOptions.ts` | pure: fold the per-tab control state into `ChatRuntimeQueryOptions` (additive, guarded) — called from `buildTurnRequest` (ADR-TC-002 §3) | new |
| ui | `chat/toolbar/*` | the nine widgets (B.1) | new |
| ui | `chat/ChatComposer.vue` | host the optional `toolbar` region (additive prop), re-emit changes | changed (additive) |
| ui | `chat/ChatSurface.vue` | build the toolbar view-model (`useToolbarCatalogPort` + `activeCapabilities` + `activeTab`); own the change→store wiring | changed (additive) |
| ui | `stores/tabsStore.ts` | add `TabControls` to `TabState` (additive) + `setControl(field,value)` actions; fold into `buildTurnRequest` (ADR-TC-001 §2) | changed (additive) |
| ui | `composables/useToolbarCatalogPort.ts` | inject `TOOLBAR_CATALOG_PORT` (one-port-one-composable, ADR-008) | new |
| infrastructure | three bridges | implement `ToolbarCatalogPort` (Obsidian real / Mock scriptable / LS inert) + `getToolbarCapabilities` on the runtime | changed |
| infrastructure | `bridge/ports.ts` | add `TOOLBAR_CATALOG_PORT` InjectionKey | changed (additive) |

### C.3 Additive domain changes (ADR-TC-002)

```ts
// src/domain/chat/Reasoning.ts — new (ADR-TC-002 §2)
export type ReasoningChoice =
  | { readonly kind: 'effort'; readonly value: string }   // High/Medium/Low (Claude adaptive)
  | { readonly kind: 'budget'; readonly tokens: number }; // token-budget providers

// src/domain/chat/ChatTurn.ts — APPENDED after appendSystemPrompt (ADR-TC-002 §1).
// The P0–P5 members (model, forceColdStart, appendSystemPrompt) are byte-identical.
export interface ChatRuntimeQueryOptions {
  model?: string;                  // P0–P5 — UNCHANGED (already exists)
  forceColdStart?: boolean;        // P3 — UNCHANGED
  appendSystemPrompt?: string;     // P4 — UNCHANGED
  // ---- P6 additive (SPEC-TC, ADR-TC-002) ----
  mode?: string;                   // mode selector (REQ-TC-014)
  reasoning?: ReasoningChoice;     // thinking selector (REQ-TC-018)
  serviceTier?: string;            // declared-now/emitted-when-backed (REQ-TC-020, P9)
}
```

One additive optional field per backed widget (CLAR-TC-001 option (a)), mirroring how P3/P4
appended single members. `enabledMcpServers?` (NG2 → P8) and `externalContextPaths?` (NG3 → later)
stay **excluded** from `ChatRuntimeQueryOptions`. `model` is not re-added (it exists).

### C.4 The capability source + three-bridge story (ADR-TC-003 / ADR-TC-004)

Two read seams feed the strip; both are read through ports, never branched on a `providerId`
(REQ-TC-003):

1. **Capability flags** — extend the existing per-runtime `RuntimeCapabilities` access additively
   with `getToolbarCapabilities()` returning a `ToolbarCapabilities` bag
   (`supportsMcpTools`, `reasoningControl: 'effort'|'token-budget'|'none'`, `hasServiceTier`,
   `hasModeToggle`, `permissionMode`). This is the **same `ChatRuntimePort` seam** P3/P4 grew for
   `getCapabilities()` — no new port for capability flags (ADR-008 one-port-one-consumer; the runtime
   already owns capability reporting). The P3/P4 `RuntimeCapabilities` flags stay byte-identical.
2. **Option lists / descriptors** — a **new narrow `ToolbarCatalogPort`** (`getCatalog(providerId)
   → ToolbarCatalog`). The catalog is the model list, the mode descriptor, the reasoning options, and
   the service-tier descriptor. This is a *new consumer* (the strip needs the static-for-now Claude
   option lists, which no existing port supplies), so it earns its own port + key + composable + three
   bridges (ADR-008). It is **static-for-now** (the Claude catalog is a load-or-default constant; the
   multi-provider catalog + env-derived custom models are P9/P10, NG4/NG5).

The seam widgets defer **honestly** off these two reads (ADR-TC-003 §3, mirroring ADR-CA-003 §2):

| Seam widget | Gate | Honest affordance |
|---|---|---|
| Service-tier | `caps.hasServiceTier` (false for Claude) | **hidden** — slot collapses, no dead button (REQ-TC-019) |
| MCP | `caps.supportsMcpTools` | hidden when false; when true, a **visible-empty** "MCP servers arrive in a later release" panel — no live servers, toggles nothing (REQ-TC-021/022) |
| Permission | always rendered (display state from P4 plan + `caps.permissionMode`) | **visible-disabled** "permissions arrive in a later release"; no rule persists, no `data.json` write (REQ-TC-016) |
| External-context | always rendered (CLAR-TC-002 (a)) | **visible-disabled** "external folders arrive in a later release"; no picker opens; `externalContextPaths` stays excluded (REQ-TC-023) |

| Port / read | `ObsidianBridge` | `MockBridge` | `LocalStorageBridge` |
|---|---|---|---|
| `ToolbarCatalogPort.getCatalog` | the real Claude catalog (model list + descriptors), static-for-now load-or-default | **scriptable** — tests inject a catalog (custom models, effort vs budget, with/without mode/service-tier descriptors) | a fixed inert Claude-shaped catalog (GitHub Pages demo) |
| `getToolbarCapabilities` (runtime) | the Claude runtime's real flags (`supportsMcpTools` etc.) | scriptable flags (drive the seam-hidden vs seam-visible tests) | inert (`supportsMcpTools:false`, `hasServiceTier:false`, `reasoningControl:'none'`) |

`fake-ports.ts` grows a `toolbarCatalog` member (the scriptable `MockBridge` catalog) so the
view-model + widget tests inject a catalog without a real provider.

### C.5 Per-tab control state (ADR-TC-001, CLAR-TC-003 → per-tab)

Control state is **per-tab** (CLAR-TC-003 option (a) — parity with Claudian's per-tab draft model and
the P3 multi-tab model; the meter is per-conversation by nature). `TabState` grows an additive
`controls: TabControls` bag:

```ts
// src/ui/stores/tabsStore.ts — additive on TabState (ADR-TC-001 §1)
export interface TabControls {
  model?: string;
  mode?: string;
  reasoning?: ReasoningChoice;
  serviceTier?: string;
}
// freshTab() seeds `controls: {}`; loadIntoTab resets it; switchTab needs no change
// (widgets read activeTab.controls, so the strip reflects the switched-to tab — REQ-TC-042).
```

A `setControl` action updates `activeTab.controls[field]`. On submit, `buildTurnRequest`
(`tabsStore.ts:218`) calls the pure `foldControlOptions(tab.controls)` and merges the result into
`queryOptions` alongside the existing `_turnQueryOptions()` (`appendSystemPrompt`) — additive + guarded
so an untouched-toolbar turn is byte-identical to P5 (NFR-TC-001). Usage is **already** per-tab
(`TabState.usage`, P2) — the meter needs no new state.

### C.6 Data flow — primary scenarios

1. **Pick a model → send:** `ModelSelector` change → `ChatSurface` → `tabsStore.setControl('model', id)`
   → `activeTab.controls.model = id` → on submit `foldControlOptions` writes `queryOptions.model = id`
   (REQ-TC-012/004).
2. **Set thinking effort → send:** `ThinkingSelector` change → `setControl('reasoning', {kind:'effort',
   value:'high'})` → fold writes `queryOptions.reasoning` (REQ-TC-018/004).
3. **Flip mode → send:** `ModeSelector` toggle → `setControl('mode', other)` → fold writes
   `queryOptions.mode` (REQ-TC-014/004).
4. **Usage meter:** the P2 `onUsage` sink sets `activeTab.usage` → `UsageMeter` (bound to `activeTab.usage`)
   re-renders the arc + percentage; >80% → warning + `/compact` tooltip; `null` → not rendered
   (REQ-TC-024..027).
5. **Seam interaction:** opening MCP shows the empty "coming later" panel; clicking the disabled
   permission/external affordance shows the "coming later" microcopy — nothing persists, no turn field
   is written (REQ-TC-016/022/023).
6. **Tab switch:** `switchTab` changes `activeTabId` → every widget (reading `activeTab.controls` +
   `activeTab.usage`) reflects the new tab (REQ-TC-042).
7. **No toolbar / no interaction:** the strip is absent or untouched → `buildTurnRequest` writes no
   new field → the request + query options are byte-identical to P5 (REQ-TC-002, NFR-TC-001).

### C.7 Edge cases

- **Empty / partial catalog** — `buildToolbarViewModel` is total: a missing model list shows the
  persisted value with an empty-list notice; a missing mode/reasoning/service-tier descriptor hides
  that widget (NFR-TC-010, REQ-TC-013/017/019).
- **No usage yet** — meter not rendered (REQ-TC-027); first usage chunk renders it (REQ-TC-025).
- **`reasoningControl: 'none'` or single option** — thinking selector not rendered (REQ-TC-017).
- **Service-tier on Claude (no descriptor)** — widget hidden, slot collapses (REQ-TC-019).
- **`supportsMcpTools: false`** — MCP widget hidden; true → visible-empty panel (REQ-TC-021/022).
- **PLAN state active (P4)** — permission toggle replaced by the "PLAN" label (REQ-TC-015).
- **Tab with model X / usage 30% vs tab with model Y / usage 70%** — switching reflects each tab's
  state (REQ-TC-042).
- **Concurrency** — each tab owns its `controls` + `usage`; a stream for tab B updates only B's meter
  (P3 per-tab isolation, inherited).
- **Selection then no submit** — control state persists on the tab until changed (it is draft input,
  like the P5 context sets), but folds only on an actual submit.

### C.8 QA seam, Result boundary, constraints

- **QA seam:** the pure functions (`buildToolbarViewModel`, `foldControlOptions`) and the leaf widgets
  (props in, events out) are testable in isolation; mounted widgets get co-located `data-testid`
  PageObjects (NFR-TC-006); the seam-hidden-vs-visible matrix is driven by the scriptable `MockBridge`
  catalog + capability flags.
- **Result boundary:** the view-model transforms are total (no throw); any bridge read that can fail
  returns `Result.err` and the strip degrades to a hidden/empty widget rather than crashing
  (NFR-TC-010). No exception crosses a use-case boundary.
- **DOM rules:** the arc gauge + selectors are declarative Vue bindings — no `v-html`/`innerHTML`, no
  `window.confirm`/`alert`/`prompt`; any future picker is a port/seam (NFR-TC-004).
- **No new dependency:** the arc-gauge SVG path is computed in-repo (mirroring Claudian's programmatic
  path), no chart lib (NFR-TC-012).
- **No provider-id branch:** visibility + enablement read capability flags + the catalog, never a
  literal `providerId` (REQ-TC-003).
- **Privacy / manifest:** no secret in any widget DTO or query-option field; nothing toolbar-related
  written to `data.json`; `manifest.json` untouched (NFR-TC-011/013).

---

## Requirements coverage (Part C)

| REQ | Covered by |
|---|---|
| REQ-TC-001/002 | `ToolbarStrip` + the additive `ChatComposer` toolbar region (ADR-TC-001); absent → byte-identical to P5 |
| REQ-TC-003 | `buildToolbarViewModel` reads `ToolbarCatalogPort` + `getToolbarCapabilities`, no provider-id branch (ADR-TC-003/004) |
| REQ-TC-004 | `foldControlOptions` in `buildTurnRequest` writes the additive query-option fields (ADR-TC-002) |
| REQ-TC-010..012 | `ModelSelector.vue` + `ToolbarCatalog` model list + `setControl('model')` → `queryOptions.model` |
| REQ-TC-013/014 | `ModeSelector.vue` + mode descriptor + `mode?` field (ADR-TC-002) |
| REQ-TC-015/016 | `PermissionToggle.vue` + PLAN display + honest-defer disabled affordance (ADR-TC-003 §3) |
| REQ-TC-017/018 | `ThinkingSelector.vue` + `reasoningControl` + `ReasoningChoice`/`reasoning?` (ADR-TC-002) |
| REQ-TC-019/020 | `ServiceTierToggle.vue` capability-hidden + `serviceTier?` declared-now (ADR-TC-002/003) |
| REQ-TC-021/022 | `McpSelector.vue` gated on `supportsMcpTools`; visible-empty seam (ADR-TC-003 §3) |
| REQ-TC-023 | `ExternalContextControl.vue` visible-disabled seam; `externalContextPaths` excluded (ADR-TC-004 §3, CLAR-TC-002) |
| REQ-TC-024..027 | `UsageMeter.vue` over `TabState.usage` (P2); arc + warning + hide-on-empty |
| REQ-TC-040/041 | keyboard-openable selectors + AT-state toggles (A.3/A.4/A.7) |
| REQ-TC-042 | per-tab `controls` + `usage`; widgets read `activeTab` (ADR-TC-001 §3) |
| NFR-TC-001..014 | additivity (C.3/C.5), ports/DDD (C.2/C.4), DOM+Result (C.8), tokens (B.2), a11y (A.7), no-secret/manifest (C.8), i18n (B.3), no new dep (C.8) |

## Open clarifications for the planner (Tasks)

- **None blocking.** All three CLARs resolve (ADR-TC-001..004 accepted). Implementation notes to carry
  into `spec.md`/`tasks.md` (spec-level field detail, not architecture):
  - The exact `ReasoningChoice` `value` vocabulary for the Claude effort variant (`'high'|'medium'|'low'`)
    and the token-budget defaults are **spec-level** field-validation details to pin in `spec.md`.
  - The warning threshold constant (Claudian >80%) is a load-or-default constant (settings UX is P10,
    NG5) — pin the literal in `spec.md`.
  - Sequence the **additive `ChatRuntimeQueryOptions` grow + `foldControlOptions`** as an early task so
    the backed widgets build on a frozen fold; the `ToolbarCatalogPort` + three bridges follow; the
    nine widgets + the view-model last.
- **Found slightly under-specified (flagged, not blocking):** the PRD does not state whether a
  control's *default* value (the catalog default) should be folded into the turn or only an explicit
  user change. Design decision (ADR-TC-002 §3): fold **only a non-default value** so an untouched
  toolbar keeps the turn byte-identical (NFR-TC-001) — the runtime applies its own default when the
  field is absent. Pin this in `spec.md` per-field.
