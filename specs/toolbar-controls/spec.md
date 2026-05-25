---
id: SPEC-TC-001
title: Toolbar & Controls (P6) — implementation-ready contracts
stage: specification
feature: toolbar-controls
area: TC
epic: claudian-reboot
phase: P6
status: complete
owner: architect
integration_branch: next
reference: D:\Projects\claudian-main                    # MIT, read-only structural + visual parity reference
inputs:
  - specs/toolbar-controls/requirements.md              # PRD-TC-001 (accepted 2026-05-25; REQ-TC-001..004/010..027/040..042 + NFR-TC-001..014)
  - specs/toolbar-controls/design.md                    # DESIGN-TC-001 Parts A/B/C (complete)
  - docs/adr/ADR-TC-001  # toolbar mount + per-tab control state (CLAR-TC-003)
  - docs/adr/ADR-TC-002  # additive ChatRuntimeQueryOptions fields mode?/reasoning?/serviceTier? (CLAR-TC-001)
  - docs/adr/ADR-TC-003  # capability-gate / honest-defer seam via ToolbarCatalogPort + getToolbarCapabilities (REQ-TC-003)
  - docs/adr/ADR-TC-004  # provider option-list source (ToolbarCatalogPort) + external-context visible-disabled seam (CLAR-TC-002)
  - specs/context-attachments/spec.md                   # SPEC-CA-* (the P5 composer context-bar slot + fold pattern this mirrors)
  - src/domain/chat/ChatTurn.ts                         # the additive ChatRuntimeQueryOptions fields grow here
  - src/domain/chat/UsageInfo.ts                        # UNCHANGED — the meter reads it
  - src/domain/ports/ChatRuntimePort.ts                 # getToolbarCapabilities appended to the existing seam
  - src/infrastructure/bridge/ports.ts                  # the new TOOLBAR_CATALOG_PORT key
  - src/ui/chat/{ChatComposer,ChatSurface}.vue          # the additive toolbar region + view-model wiring
  - src/ui/stores/tabsStore.ts                          # TabControls bag + setControl + fold-on-submit
  - tests/__fakes__/fake-ports.ts                       # grows a `toolbarCatalog` member
created: 2026-05-25
updated: 2026-05-25
---

# Specification — Toolbar & Controls (P6)

Implementation-ready contracts for P6. Every contract is grounded in `design.md` (DESIGN-TC-001), the
four accepted P6 ADRs (**ADR-TC-001/002/003/004**), the P1 turn-request contract (SPEC-CC), the P2
usage stream (`UsageInfo`, SPEC-CC-003 / SPEC-RR-031), the P3 multi-tab store (`tabsStore`,
SPEC-TS-019), the P4 composer + capability seam (`getCapabilities`, SPEC-CP-002), the P5 composer
context-bar slot + fold pattern (SPEC-CA-001/022, `buildTurnRequest`), and Claudian's real code under
`D:\Projects\claudian-main` (`features/chat/ui/InputToolbar.ts` + the `toolbar/**` selectors/toggles,
the `ContextUsageMeter`, `core/providers/types.ts`). **Two independent teams should build the same
thing from this document.**

> **Conventions in force (inherited from P1–P5, do not relax):** DDD inward-only imports (ADR-001,
> `domain ← application ← infrastructure ← ui`, NFR-TC-002); narrow ports + three bridges (ADR-008,
> NFR-TC-002); `Result<T,E>` at every use-case boundary, **pure-total** transforms elsewhere (ADR-004,
> NFR-TC-005/010); DTO-only store boundary — no domain class instance / function / Obsidian handle
> crosses into reactive state (ADR-003, NFR-TC-005); Vue `<script setup>` only (NFR-TC-005); **no
> `obsidian`/`node:*` import under `src/ui/**`** (NFR-TC-003); **no `v-html`/`innerHTML`/`outerHTML`/
> `insertAdjacentHTML`** anywhere (NFR-TC-004); blocking flows use an Obsidian `Modal` via a seam,
> never `window.confirm`/`alert`/`prompt` (NFR-TC-004); `--sp-*` token parity, colour literals
> confined to the token layer (NFR-TC-008); WCAG 2.2 AA + full keyboard nav + non-colour cues +
> reduced-motion + forced-colors (NFR-TC-009); tests mirror `src/` + `data-testid` PageObjects,
> coverage 80/70/80/80 (NFR-TC-006/007); `manifest.json` untouched (NFR-TC-013); **no stored secret,
> nothing toolbar-related to `data.json`** (NFR-TC-011); **no new runtime dependency** (NFR-TC-012);
> new user-facing strings via `TranslationPort` en+de (NFR-TC-014); **additive growth only — no
> rename/removal of any P0–P5 member** (NFR-TC-001).

This spec defines **30 spec items** across six layer groups (SPEC-TC-001..030). The Tasks stage
(`planner`) decomposes them into `T-TC-NNN`; the QA stage turns the TEST-TC-NNN scenarios (§8) into
automated tests. SPEC-TC items that **extend** a P0–P5 counterpart cite the extension point.

> **The three field-level open items the design (DESIGN-TC-001 §Open clarifications) handed to
> `/spec:specify` — RESOLVED HERE (pinned literals, not architecture):**
> 1. **The Claude effort vocabulary** — settled in SPEC-TC-003: `ReasoningChoice.kind === 'effort'`
>    carries `value: ReasoningEffort` where `ReasoningEffort = 'high' | 'medium' | 'low'` (a closed
>    string union, lower-case, parity Claudian `ProviderReasoningOption`). The display labels
>    ("High"/"Medium"/"Low") are i18n strings (SPEC-TC-028); the **stored + folded value is the
>    lower-case token**.
> 2. **The token-budget defaults** — settled in SPEC-TC-003/SPEC-TC-005: `kind === 'budget'` carries
>    `tokens: number`, a finite integer ≥ 0; the budget option set + the per-option `tokens` come from
>    the catalog descriptor (`ReasoningDescriptor`, SPEC-TC-004) — there is **no hard-coded budget
>    default in P6** (Claude uses `'effort'`; the budget variant is descriptor-driven for the P9
>    providers). The "no reasoning chosen" state is **the absence of `reasoning`** on the tab controls,
>    not a sentinel value.
> 3. **The usage warning threshold** — settled in SPEC-TC-005/SPEC-TC-018: a single module constant
>    `USAGE_WARNING_THRESHOLD = 80` (percent, parity Claudian `ContextUsageMeter` `> 80`). The meter
>    is in the warning style **strictly above** 80% (`percentage > 80`), a load-or-default literal
>    (settings UX is P10, NG5).

---

## 0. Spec-item index

| Spec item | Title | Layer | New / Extends | REQ / NFR links |
|---|---|---|---|---|
| **DOMAIN** | | | | |
| SPEC-TC-001 | `ChatRuntimeQueryOptions` — three additive optional fields (`mode?`/`reasoning?`/`serviceTier?`) | domain | extends `ChatTurn.ts` | REQ-TC-004/014/018/020; ADR-TC-002 §1 |
| SPEC-TC-002 | `ReasoningChoice` discriminated union + `ReasoningEffort` (`src/domain/chat/Reasoning.ts`) | domain | new | REQ-TC-017/018; ADR-TC-002 §2 |
| SPEC-TC-003 | `ToolbarCatalog` descriptor DTOs (`ModelOption`/`ModeDescriptor`/`ReasoningDescriptor`/`ServiceTierDescriptor`) (`src/domain/chat/toolbar/ToolbarCatalog.ts`) | domain | new | REQ-TC-010/013/017/019; ADR-TC-004 §1 |
| SPEC-TC-004 | `ToolbarCatalogPort` + `TOOLBAR_CATALOG_PORT` key + barrel | domain | new | REQ-TC-003/010..019; ADR-TC-004 §1 |
| SPEC-TC-005 | `ToolbarCapabilities` shape + `getToolbarCapabilities()` appended to `ChatRuntimePort` | domain | extends `ChatRuntimePort.ts` | REQ-TC-003/019/021; ADR-TC-003 §2 |
| SPEC-TC-006 | `TabControls` bag (`model?`/`mode?`/`reasoning?`/`serviceTier?`) — the per-tab control DTO | domain/ui-store | new | REQ-TC-012/014/018/020/042; ADR-TC-001 §1 |
| **INFRA** | | | | |
| SPEC-TC-007 | `ObsidianBridge` — Claude static-for-now `ToolbarCatalogPort` + the runtime's real `getToolbarCapabilities`; coverage-excluded → manual leg | infra | new | REQ-TC-010/019/021; NFR-TC-001 (manual leg) |
| SPEC-TC-008 | `MockBridge` — scriptable `ToolbarCatalogPort` + scriptable `getToolbarCapabilities` (drive the seam matrix) | infra | extends SPEC-CC mock | REQ-TC-003/013/019/021; NFR-TC-010 |
| SPEC-TC-009 | `LocalStorageBridge` — inert Claude-shaped catalog + inert capabilities (`supportsMcpTools:false`, `hasServiceTier:false`, `reasoningControl:'none'`) | infra | extends SPEC-CC LS | REQ-TC-019/021; ADR-TC-003 §3 |
| **APPLICATION** | | | | |
| SPEC-TC-010 | `foldControlOptions(controls)` — pure/total fold of `TabControls` → additive `ChatRuntimeQueryOptions` (non-default only) | application | new | REQ-TC-004; ADR-TC-002 §3 |
| SPEC-TC-011 | `buildToolbarViewModel(catalog, capabilities, controls, usage)` — pure/total per-widget visible/enabled/selected (no provider-id branch) | application | new | REQ-TC-003/010..027; ADR-TC-003/004 |
| **UI** | | | | |
| SPEC-TC-012 | `ToolbarStrip.vue` — the `.claudian-input-toolbar` row; lays the widgets in Claudian order; gates each on the view-model | ui | new | REQ-TC-001/003 |
| SPEC-TC-013 | `ModelSelector.vue` — grouped keyboard listbox, current marked | ui | new | REQ-TC-010/011/012/040 |
| SPEC-TC-014 | `ModeSelector.vue` — descriptor-driven two-option toggle (auto-hidden when no descriptor) | ui | new | REQ-TC-013/014/041 |
| SPEC-TC-015 | `PermissionToggle.vue` — PLAN display + honest-defer visible-disabled affordance | ui | new | REQ-TC-015/016 |
| SPEC-TC-016 | `ThinkingSelector.vue` — effort/budget listbox (auto-hidden on `none`/single) | ui | new | REQ-TC-017/018/040 |
| SPEC-TC-017 | `ServiceTierToggle.vue` — capability-hidden zap toggle (declared-now/emitted-later) | ui | new | REQ-TC-019/020/041 |
| SPEC-TC-018 | `McpSelector.vue` — capability-hidden shell; visible-empty "coming later" panel when supported | ui | new | REQ-TC-021/022 |
| SPEC-TC-019 | `ExternalContextControl.vue` — visible-disabled folder affordance, no picker | ui | new | REQ-TC-023 |
| SPEC-TC-020 | `UsageMeter.vue` — declarative 240° SVG arc gauge; warning > 80%; hidden when null | ui | new | REQ-TC-024/025/026/027 |
| SPEC-TC-021 | `ChatComposer.vue` extension — an optional toolbar region between textarea + footer (additive prop) | ui | extends SPEC-CA-022 | REQ-TC-001/002 |
| SPEC-TC-022 | `ChatSurface.vue` extension — build the toolbar view-model + wire change→store | ui | extends SPEC-CA-022 | REQ-TC-003/004/012/042 |
| SPEC-TC-023 | `tabsStore.ts` extension — `TabControls` on `TabState` + `setControl` + fold-on-submit | ui (store) | extends SPEC-TS-019 / SPEC-CA-001 | REQ-TC-004/012/042; ADR-TC-001 |
| SPEC-TC-024 | `useToolbarCatalogPort` composable | ui | extends SPEC-CC-017 | REQ-TC-003/010 |
| SPEC-TC-025 | Wiring — `AgentSidebarView` + `ui/main.ts` provide `TOOLBAR_CATALOG_PORT`; the runtime reports `getToolbarCapabilities` | plugin/ui | extends SPEC-CA-026 | REQ-TC-003/010/021 |
| **STYLES** | | | | |
| SPEC-TC-026 | `toolbar/*` `--sp-*` token slice (charter §3.10) | ui (styles) | extends SPEC-CA/RR tokens | NFR-TC-008 |
| **CROSS-CUTTING** | | | | |
| SPEC-TC-027 | Additivity invariant (P0–P5 members + `PreparedChatTurn`/`EnsureReadyOptions`/`UsageInfo` byte-identical; the three query-option fields + `getToolbarCapabilities` + the new port are the only growth) | domain | — | NFR-TC-001 |
| SPEC-TC-028 | i18n / microcopy invariant (`agent.chat.toolbar.*` en+de; no hardcoded string) | ui | — | NFR-TC-014 |
| SPEC-TC-029 | No-provider-branch + capability-gate + honest-defer invariant | app/ui | — | REQ-TC-003/016/019/021/022/023 |
| SPEC-TC-030 | Result / no-secret / DOM-rule / observability invariant | cross | — | NFR-TC-004/010/011 |

---

# 1. Domain — types, ports, additive growth (SPEC-TC-001..006)

Types under `src/domain/chat/` and `src/domain/ports/`. No `obsidian`, no `node:*`, no Vue, no class —
pure interfaces/unions (ADR-001). **Additive only: no P0–P5 field or member is renamed or removed
(NFR-TC-001, SPEC-TC-027).** The P5 `ChatTurn.ts` audit (read verbatim above) confirms the three
P0–P5 query-option members (`model?`, `forceColdStart?`, `appendSystemPrompt?`) — P6 appends after
them.

## SPEC-TC-001 — `ChatRuntimeQueryOptions` additive fields (`src/domain/chat/ChatTurn.ts`)

**REQ:** REQ-TC-004/014/018/020 · **ADR:** ADR-TC-002 §1 · **Claudian ground-truth:**
`InputToolbar.ts` (`ModeSelector`/`ThinkingBudgetSelector`/`ServiceTierToggle` → the per-turn options),
`core/providers/types.ts` (the option shapes). **Append** the three optional fields **after**
`appendSystemPrompt`; the three P0–P5 members stay byte-identical (`model?` already exists and is **not
re-added**):

```ts
import type { ReasoningChoice } from './Reasoning';

export interface ChatRuntimeQueryOptions {
  model?: string;                  // P0–P5 — UNCHANGED (already exists; model selector reuses it)
  forceColdStart?: boolean;        // P3 — UNCHANGED
  appendSystemPrompt?: string;     // P4 — UNCHANGED
  // ---- P6 additive (SPEC-TC-001, ADR-TC-002 §1) — all optional; an unset query is byte-identical to P5 (NFR-TC-001) ----
  mode?: string;                   // mode selector (REQ-TC-014); the descriptor's active/inactive value token
  reasoning?: ReasoningChoice;     // thinking selector (REQ-TC-018); discriminated effort|budget (SPEC-TC-002)
  serviceTier?: string;            // service-tier toggle (REQ-TC-020); declared-now / emitted by a capable runtime in P9
}
```

**Validation rules (per field):** every field is **optional**; absence is the P5 send path (G2/G5).
When present: `mode` is a non-empty string equal to one of the active mode descriptor's option values
(SPEC-TC-003); `reasoning` is a `ReasoningChoice` (SPEC-TC-002) whose variant matches the catalog's
`reasoningControl` (an `effort` choice on an `effort` provider, a `budget` choice on a `token-budget`
provider — `foldControlOptions` only ever writes a catalog-consistent value, SPEC-TC-010); `serviceTier`
is a non-empty string equal to the service-tier descriptor's active value. `PreparedChatTurn` /
`ChatRuntimeEnsureReadyOptions` / `ChatTurnRequest` stay **byte-identical** (SPEC-TC-027); the runtime's
`query` folds the present options into the CLI invocation it already builds (additive, guarded on the
optional fields — out-of-scope beyond the field contract). `enabledMcpServers?` (NG2 → P8) and
`externalContextPaths?` (NG3 → later) stay **excluded**. **Imports** `ReasoningChoice` from
`./Reasoning`. Unit-testable as a type-shape + serialisation contract: a P5-shaped query (no new field)
serialises byte-identically to P5 (TEST-TC-002, NFR-TC-001).

## SPEC-TC-002 — `ReasoningChoice` (`src/domain/chat/Reasoning.ts`)

**REQ:** REQ-TC-017/018 · **ADR:** ADR-TC-002 §2 · **Claudian ground-truth:** `ThinkingBudgetSelector`
(effort gears vs token-budget gears), `ProviderReasoningOption`. The discriminated union the thinking
selector folds (resolved open item #1/#2):

```ts
/** The Claude adaptive-effort vocabulary — a closed lower-case union (RESOLVED: open item #1). */
export type ReasoningEffort = 'high' | 'medium' | 'low';

export type ReasoningChoice =
  | { readonly kind: 'effort'; readonly value: ReasoningEffort }   // effort providers (Claude)
  | { readonly kind: 'budget'; readonly tokens: number };          // token-budget providers (descriptor-driven; P9)
```

**Validation rules:** `kind` is the discriminant the fold + view-model narrow on. `effort`: `value` ∈
`{'high','medium','low'}` (lower-case stored token; the display label is an i18n string). `budget`:
`tokens` is a finite **non-negative integer** (the catalog descriptor supplies the option set + each
option's `tokens`, SPEC-TC-003 — **no hard-coded default in P6**, resolved open item #2). The union is
re-exported from `src/domain/chat/Reasoning.ts` and surfaced through the ports barrel
(`src/domain/ports/index.ts`, appended). Pure type — no class, no Obsidian. Unit-testable as a
type-shape + narrowing contract (TEST-TC-018).

## SPEC-TC-003 — `ToolbarCatalog` descriptors (`src/domain/chat/toolbar/ToolbarCatalog.ts`)

**REQ:** REQ-TC-010/011/013/017/019 · **ADR:** ADR-TC-004 §1 · **Claudian ground-truth:**
`core/providers/types.ts` (`ProviderChatUIConfig`, `ProviderUIOption`, `ProviderModeSelectorConfig`,
`ProviderReasoningOption`, `ProviderServiceTierToggleConfig`), `ModelSelector.renderOptions`
(grouped/reversed-recent). Pure DTOs — readonly, no class, no Obsidian — the static-for-Claude option
lists the strip renders:

```ts
import type { ReasoningChoice } from '../Reasoning';

/** One selectable model (REQ-TC-010/011). `group` lets the listbox render group separators. */
export interface ModelOption {
  readonly id: string;            // the ChatRuntimeQueryOptions.model value
  readonly label: string;         // the display label (already localised by the provider)
  readonly group?: string;        // optional group heading; absent → ungrouped
}

/** A two-option mode descriptor (REQ-TC-013/014); absent on the catalog → the mode selector hides. */
export interface ModeDescriptor {
  readonly activeValue: string;   // the mode value when the toggle is "on" (REQ-TC-014)
  readonly inactiveValue: string; // the mode value when the toggle is "off"
  readonly activeLabel: string;
  readonly inactiveLabel: string;
}

/** The reasoning option set (REQ-TC-017/018); absent / single-option → the thinking selector hides. */
export interface ReasoningDescriptor {
  readonly control: 'effort' | 'token-budget';   // matches ToolbarCapabilities.reasoningControl when not 'none'
  readonly options: readonly ReasoningChoice[];   // >= 2 to render (single → hidden, REQ-TC-017)
  readonly defaultChoice?: ReasoningChoice;        // the catalog default (used by the view-model "selected" mark + non-default fold)
}

/** A service-tier toggle descriptor (REQ-TC-019/020); absent (Claude) → the toggle is capability-hidden. */
export interface ServiceTierDescriptor {
  readonly activeValue: string;
  readonly inactiveValue: string;
  readonly label: string;
}

/** The full per-provider toolbar catalog (static-for-now for Claude, ADR-TC-004 §1). */
export interface ToolbarCatalog {
  readonly models: readonly ModelOption[];        // may be empty → model selector shows the persisted value + empty notice
  readonly defaultModelId?: string;                // the provider default (the view-model "selected" fallback)
  readonly mode?: ModeDescriptor;                  // absent → mode selector hidden (REQ-TC-013)
  readonly reasoning?: ReasoningDescriptor;        // absent / 'none' / single → thinking selector hidden (REQ-TC-017)
  readonly serviceTier?: ServiceTierDescriptor;    // absent → service-tier hidden (REQ-TC-019)
}
```

**Validation rules:** `ModelOption.id`/`label` non-empty; `models` may be empty (degrade — SPEC-TC-011,
NFR-TC-010). `ModeDescriptor` requires both option values non-empty and distinct. `ReasoningDescriptor.
options.length >= 2` to render (a `0`/`1`-option set is treated as "no reasoning control" by the
view-model, REQ-TC-017). `ServiceTierDescriptor` requires distinct active/inactive values. Every label
is a display string (the provider/i18n owns localisation, NFR-TC-014). **No secret, no path outside the
catalog** (NFR-TC-011, SPEC-TC-030). Re-exported from `src/domain/chat/toolbar/index.ts`. Unit-testable
as type-shape contracts (TEST-TC-010/013/017/019).

## SPEC-TC-004 — `ToolbarCatalogPort` (`src/domain/ports/ToolbarCatalogPort.ts`)

**REQ:** REQ-TC-003/010..019 · **ADR:** ADR-TC-004 §1 · **Claudian ground-truth:**
`ProviderChatUIConfig` (the per-provider UI config no existing port supplies). **New narrow port — one
consumer (the toolbar view-model); one port (ADR-008).** Static-for-now: the Claude catalog is a
load-or-default constant; multi-provider + env-derived custom models are P9/P10 (NG4/NG5).

```ts
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';

export interface ToolbarCatalogPort {
  /**
   * The toolbar option lists + descriptors for `providerId` (model list, mode /
   * reasoning / service-tier descriptors). Synchronous + total: never throws — an
   * unknown provider or a load miss resolves a safe default (an empty-models /
   * no-descriptor catalog the view-model degrades from, NFR-TC-010). NEVER branched
   * on by the consumer (REQ-TC-003) — the consumer reads the returned catalog.
   */
  getCatalog(providerId: ProviderId): ToolbarCatalog;
}
```

**`getCatalog(providerId)` contract (signature · behaviour · pre/post · errors · side effects):**

| Aspect | Contract |
|---|---|
| Behaviour | Return the provider's `ToolbarCatalog` (Claude: the static-for-now constant). |
| Pre | `providerId` is a valid `ProviderId` (P6 ships `'claude'`). |
| Post | A `ToolbarCatalog` (possibly an empty/no-descriptor default). The result is **stable** for the same provider (a pure read of a constant in P6). |
| Errors | None across the boundary — total. A load miss → the empty/default catalog (NFR-TC-010, EC-TC-3). |
| Side effects | None (no I/O in P6; the Claude catalog is a constant). |

**`TOOLBAR_CATALOG_PORT` InjectionKey** (`src/infrastructure/bridge/ports.ts`, appended alongside the
existing keys) and **barrel re-export** of `ToolbarCatalogPort` from `src/domain/ports/index.ts`
(appended). Three bridges implement it (SPEC-TC-007/008/009). Unit-testable against the scriptable Mock
impl (TEST-TC-003/010).

## SPEC-TC-005 — `ToolbarCapabilities` + `getToolbarCapabilities()` (`src/domain/ports/ChatRuntimePort.ts`)

**REQ:** REQ-TC-003/019/021 · **ADR:** ADR-TC-003 §2 · **Claudian ground-truth:** `ProviderCapabilities`
(`supportsMcpTools` etc.), the toolbar's capability gates. **Append one method** to `ChatRuntimePort`
(the runtime already owns capability reporting via `getCapabilities()` — no new port for flags, ADR-008
one-port-one-consumer); the P0–P5 members + the five `RuntimeCapabilities` flags stay byte-identical
(SPEC-TC-027):

```ts
/**
 * Toolbar-widget capability flags (P6, SPEC-TC-005, ADR-TC-003 §2). Read through the
 * port, NEVER branched on by `providerId` (REQ-TC-003). Distinct from the P3/P4
 * `RuntimeCapabilities` (fork/rewind/plan/inline) — these gate the toolbar widgets.
 */
export interface ToolbarCapabilities {
  readonly supportsMcpTools: boolean;                         // gates the MCP selector (REQ-TC-021)
  readonly reasoningControl: 'effort' | 'token-budget' | 'none'; // gates + selects the thinking variant (REQ-TC-017)
  readonly hasServiceTier: boolean;                           // gates the service-tier toggle (REQ-TC-019); false for Claude
  readonly hasModeToggle: boolean;                            // gates the mode selector alongside the catalog descriptor (REQ-TC-013)
  readonly permissionMode: 'default' | 'plan';                // the permission display state (PLAN special-case, REQ-TC-015)
}

export interface ChatRuntimePort {
  // ... the P0–P5 members + getCapabilities() — UNCHANGED ...
  // ---- P6 additive (SPEC-TC-005, ADR-TC-003 §2) ----
  /** The toolbar-widget capability flags — gates widget visibility/enablement (REQ-TC-003/019/021). */
  getToolbarCapabilities(): ToolbarCapabilities;
}
```

**Contract:** `getToolbarCapabilities()` is synchronous + total (never throws); returns the runtime's
fixed flags. For the Claude runtime (P6): `supportsMcpTools` reflects the real CLI capability (manual
leg, SPEC-TC-007); `reasoningControl: 'effort'`; `hasServiceTier: false` (no Codex fast-mode);
`hasModeToggle: true`; `permissionMode` is `'plan'` while the P4 plan state is active, else `'default'`
(display only — P6 does not own plan mode, NG6). `ToolbarCapabilities` is re-exported from
`src/domain/ports/index.ts` (appended, alongside `RuntimeCapabilities`). Unit-testable against the
scriptable Mock runtime (TEST-TC-003/019/021).

## SPEC-TC-006 — `TabControls` bag (`src/domain/chat/toolbar/TabControls.ts`, re-exported into the store)

**REQ:** REQ-TC-012/014/018/020/042 · **ADR:** ADR-TC-001 §1 · **Claudian ground-truth:** the per-tab
draft model + reasoning + mode. The per-tab control DTO the surface folds into the next turn:

```ts
import type { ReasoningChoice } from '../Reasoning';

/** The per-tab control selections (ADR-TC-001 §1). Plain DTO — crosses the Pinia store boundary (NFR-TC-005). */
export interface TabControls {
  model?: string;             // model selector → ChatRuntimeQueryOptions.model
  mode?: string;              // mode selector → .mode (REQ-TC-014)
  reasoning?: ReasoningChoice; // thinking selector → .reasoning (REQ-TC-018)
  serviceTier?: string;       // service-tier toggle → .serviceTier (REQ-TC-020)
}
```

**Validation rules:** every member is **optional**; an absent member means "no explicit user choice —
the runtime applies its own default" (so an untouched toolbar yields a byte-identical turn, NFR-TC-001).
`model`/`mode`/`serviceTier` are non-empty strings when present; `reasoning` is a `ReasoningChoice`. The
seam widgets (permission/MCP/external) write **nothing** here (REQ-TC-016/022/023). `TabState` grows a
`controls: TabControls` field (SPEC-TC-023). Re-exported from `src/domain/chat/toolbar/index.ts`.
Unit-testable as a type-shape contract (TEST-TC-006).

---

# 2. Infrastructure — three-bridge implementations (SPEC-TC-007..009)

The three bridges implement `ToolbarCatalogPort` and `getToolbarCapabilities` on the runtime (NFR-TC-001/
002). `src/infrastructure/obsidian/**` is coverage-excluded (the real Claude capability/catalog reporting
is the manual leg); `MockBridge` + `LocalStorageBridge` carry the unit-testable behaviour. `fake-ports.ts`
grows a `toolbarCatalog` member (the scriptable Mock catalog) so the view-model + widget tests inject a
catalog without a real provider (DESIGN-TC-001 C.4).

## SPEC-TC-007 — `ObsidianBridge` impls (`src/infrastructure/obsidian/*`)

**REQ:** REQ-TC-010/019/021 · **NFR:** NFR-TC-001/002 (manual leg). **Claudian ground-truth:**
`ProviderChatUIConfig` + `ProviderCapabilities`.

- **`ToolbarCatalogPort.getCatalog('claude')`** — returns the **real Claude catalog** (the model list +
  the mode descriptor + the effort `ReasoningDescriptor`; **no** service-tier descriptor), as a
  **static-for-now load-or-default constant** (the multi-provider catalog + env-derived custom models
  are P9/P10, NG4/NG5). Total — never throws (NFR-TC-010).
- **`getToolbarCapabilities()`** (on the Claude `ChatRuntimePort`) — returns the runtime's real flags:
  `supportsMcpTools` from the real CLI capability, `reasoningControl:'effort'`, `hasServiceTier:false`,
  `hasModeToggle:true`, `permissionMode` mirroring the active P4 plan state.

Both are **coverage-excluded** (`src/infrastructure/obsidian/**`) and verified on the manual Obsidian leg
(TEST-TC-M1/M2). No `obsidian` symbol leaks past this file.

## SPEC-TC-008 — `MockBridge` impls (`src/infrastructure/mock/*`)

**REQ:** REQ-TC-003/013/019/021 · **NFR:** NFR-TC-010.

- **`ToolbarCatalogPort`** — **scriptable**: `setToolbarCatalog(catalog)` returns an injected
  `ToolbarCatalog` so the view-model + widget tests drive every shape (custom models, grouped models,
  effort vs token-budget, with/without a mode descriptor, with/without a service-tier descriptor, an
  **empty model list** for the degrade path). Default: a small Claude-shaped catalog.
- **`getToolbarCapabilities()`** (on the Mock runtime) — **scriptable**: `setToolbarCapabilities(caps)`
  drives the seam-hidden-vs-visible matrix (`supportsMcpTools` true/false, `hasServiceTier` true/false,
  `reasoningControl` effort/token-budget/none, `permissionMode` default/plan). Default: Claude-shaped.

The scriptable catalog + flags are what TEST-TC-003/011/013/017/019/021 assert against without a real
provider.

## SPEC-TC-009 — `LocalStorageBridge` impls (`src/infrastructure/localstorage/*`)

**REQ:** REQ-TC-019/021 · **ADR:** ADR-TC-003 §3.

- **`ToolbarCatalogPort.getCatalog`** — a **fixed inert Claude-shaped catalog** (a small model list +
  the mode + effort descriptors, no service-tier) so the GitHub Pages demo renders the full strip.
- **`getToolbarCapabilities()`** — **inert**: `supportsMcpTools:false`, `hasServiceTier:false`,
  `reasoningControl:'none'`, `hasModeToggle:true`, `permissionMode:'default'` (so the demo shows the
  backed widgets + the honest-defer seams, never a live MCP/service-tier).

---

# 3. Application — pure transforms (SPEC-TC-010..011)

Pure functions under `src/application/chat/toolbar/`. **Pure + total** (never throw, ADR-004); no
`obsidian`/Vue import. These are the QA seam — the view-model decision + the fold are testable in
isolation (DESIGN-TC-001 C.8).

## SPEC-TC-010 — `foldControlOptions` (`src/application/chat/toolbar/foldControlOptions.ts`)

**REQ:** REQ-TC-004 · **ADR:** ADR-TC-002 §3 · **Claudian ground-truth:** the `InputToolbar` →
per-turn-options assembly. The pure guarded fold mirroring how `buildTurnRequest` folds P5 context
(`tabsStore.ts:218`):

```ts
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { ChatRuntimeQueryOptions } from '@/domain/chat/ChatTurn';

/**
 * Fold the per-tab control selections into the additive ChatRuntimeQueryOptions
 * fields. ADDITIVE + GUARDED: a field is written ONLY when `controls` carries an
 * explicit (non-default) value, so an untouched toolbar yields `{}` (byte-identical
 * to a P5 turn, NFR-TC-001). Pure + total — never throws. The seam widgets
 * (permission/MCP/external) contribute NOTHING.
 */
export function foldControlOptions(controls: TabControls): Partial<ChatRuntimeQueryOptions>;
```

**Contract (default/non-default rules, RESOLVED):**

| Source | Writes | When |
|---|---|---|
| `controls.model` | `model` | present + non-empty (the selector only sets it on an explicit pick; the catalog default is **not** written, so absence = runtime default — ADR-TC-002 §3) |
| `controls.mode` | `mode` | present + non-empty |
| `controls.reasoning` | `reasoning` | present (an explicit effort/budget choice; the descriptor `defaultChoice` is **not** auto-folded) |
| `controls.serviceTier` | `serviceTier` | present + non-empty |

`foldControlOptions({})` → `{}` (an untouched toolbar — TEST-TC-002/030, EC-TC-1). The result is merged
into the turn's `queryOptions` alongside the P4 `appendSystemPrompt` (SPEC-TC-023). **A default value is
never folded** — the design's resolved under-spec: the runtime applies its own default when a field is
absent, keeping an untouched turn byte-identical (NFR-TC-001, EC-TC-6). Pure/total — never throws.
Unit-testable in isolation (TEST-TC-004, EC-TC-1/6).

## SPEC-TC-011 — `buildToolbarViewModel` (`src/application/chat/toolbar/buildToolbarViewModel.ts`)

**REQ:** REQ-TC-003/010..027 · **ADR:** ADR-TC-003/004 · **NFR:** NFR-TC-010 · **Claudian ground-truth:**
`InputToolbar.renderOptions`/`updateDisplay` per widget + the capability gates. The pure/total decision
function — which widgets show, their current value, their seam state — reading the catalog + capabilities
+ controls + usage, **never a `providerId` branch** (REQ-TC-003):

```ts
import type { ToolbarCatalog } from '@/domain/chat/toolbar/ToolbarCatalog';
import type { ToolbarCapabilities } from '@/domain/ports';
import type { TabControls } from '@/domain/chat/toolbar/TabControls';
import type { UsageInfo } from '@/domain/chat/UsageInfo';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';

export type WidgetVisibility =
  | { kind: 'visible'; enabled: boolean }   // shown; `enabled:false` is the honest-disabled seam affordance
  | { kind: 'hidden' };                     // capability-hidden — the slot collapses (REQ-TC-019/021)

export interface ModelWidgetVm { visibility: WidgetVisibility; options: readonly ModelOption[]; selectedId?: string; emptyNotice: boolean; }
export interface ModeWidgetVm { visibility: WidgetVisibility; descriptor?: ModeDescriptor; activeValue?: string; }
export interface ThinkingWidgetVm { visibility: WidgetVisibility; control: 'effort' | 'token-budget' | 'none'; options: readonly ReasoningChoice[]; selected?: ReasoningChoice; }
export interface ServiceTierWidgetVm { visibility: WidgetVisibility; descriptor?: ServiceTierDescriptor; active: boolean; }
export interface PermissionWidgetVm { visibility: WidgetVisibility; plan: boolean; deferred: true; }   // always visible-disabled (REQ-TC-016)
export interface McpWidgetVm { visibility: WidgetVisibility; empty: true; }                              // hidden | visible-empty (REQ-TC-021/022)
export interface ExternalWidgetVm { visibility: WidgetVisibility; deferred: true; }                      // always visible-disabled (REQ-TC-023)
export interface UsageWidgetVm { visibility: WidgetVisibility; percentage: number; warning: boolean; }   // hidden when usage null (REQ-TC-027)

export interface ToolbarViewModel {
  model: ModelWidgetVm;
  mode: ModeWidgetVm;
  permission: PermissionWidgetVm;
  thinking: ThinkingWidgetVm;
  serviceTier: ServiceTierWidgetVm;
  mcp: McpWidgetVm;
  external: ExternalWidgetVm;
  usage: UsageWidgetVm;
}

export function buildToolbarViewModel(
  catalog: ToolbarCatalog,
  capabilities: ToolbarCapabilities,
  controls: TabControls,
  usage: UsageInfo | null,
): ToolbarViewModel;
```

**Per-widget decision rules (total — no throw, NFR-TC-010):**

| Widget | Rule |
|---|---|
| **model** | always `visible/enabled`; `options = catalog.models`; `selectedId = controls.model ?? catalog.defaultModelId`; `emptyNotice = catalog.models.length === 0` (shows the persisted value + an empty notice, NFR-TC-010, EC-TC-3) |
| **mode** | `visible` iff `capabilities.hasModeToggle && catalog.mode !== undefined`; else `hidden` (REQ-TC-013); `activeValue = controls.mode ?? catalog.mode.inactiveValue` |
| **thinking** | `hidden` when `capabilities.reasoningControl === 'none'` OR `catalog.reasoning` absent OR `catalog.reasoning.options.length < 2`; else `visible`; `options = catalog.reasoning.options`; `selected = controls.reasoning ?? catalog.reasoning.defaultChoice` (REQ-TC-017) |
| **serviceTier** | `hidden` when `!capabilities.hasServiceTier` OR `catalog.serviceTier` absent (Claude → hidden, slot collapses); else `visible/enabled`; `active = controls.serviceTier === catalog.serviceTier.activeValue` (REQ-TC-019) |
| **permission** | always `visible` with `enabled:false` (honest-defer, REQ-TC-016); `plan = capabilities.permissionMode === 'plan'` (the PLAN special-case, REQ-TC-015) |
| **mcp** | `hidden` when `!capabilities.supportsMcpTools`; else `visible` with `enabled:false` (the empty "coming later" panel, REQ-TC-021/022) |
| **external** | always `visible` with `enabled:false` (full-parity visible-disabled seam, REQ-TC-023) |
| **usage** | `hidden` when `usage === null` (no zero-state gauge, REQ-TC-027); else `visible`; `percentage = usage.percentage`; `warning = usage.percentage > USAGE_WARNING_THRESHOLD` (> 80, SPEC-TC-018) |

**No `providerId` branch** anywhere — every decision reads `capabilities` + `catalog` (SPEC-TC-029,
TEST-TC-003). Pure/total — never throws (a partial catalog hides the dependent widget, NFR-TC-010,
EC-TC-3). Unit-testable in isolation across the full matrix (TEST-TC-003/010..027, EC-TC-2/3/4/5).

---

# 4. UI — components, store, composable, wiring (SPEC-TC-012..025)

Vue `<script setup>` components under `src/ui/chat/toolbar/`; **no `obsidian` import** (NFR-TC-003);
**no `v-html`** (NFR-TC-004). Every mounted component has a co-located `data-testid` PageObject `.po.ts`
(NFR-TC-006). `ToolbarStrip` is the only component that reads the view-model; the eight leaf widgets are
**presentational** (props in, events out) so each is testable in isolation with a fake VM slice.

## SPEC-TC-012 — `ToolbarStrip.vue` (`src/ui/chat/toolbar/ToolbarStrip.vue`, PO co-located)

**REQ:** REQ-TC-001/003 · **Claudian ground-truth:** `InputToolbar.ts` (`.claudian-input-toolbar` flex
row). The strip container. **Props:** `vm: ToolbarViewModel`. **Emits:** `pick-model: [id: string]`,
`set-mode: [value: string]`, `set-reasoning: [choice: ReasoningChoice]`, `toggle-service-tier:
[active: boolean]`. **Behaviour:** lays the leaf widgets in Claudian order (model · mode · permission ·
thinking · service-tier · MCP · external grouped at the leading end, the usage meter pinned trailing,
DESIGN-TC-001 A.1); renders each leaf **only** per its `vm.<widget>.visibility.kind === 'visible'` (a
`hidden` widget's slot collapses — no dead button, REQ-TC-019/021); re-emits the four backed widget
changes up to `ChatSurface` (SPEC-TC-022); at 320 px the row `flex-wrap`s with the meter dropping to the
trailing end of the wrapped row (NFR-TC-008, A.8). `data-testid`: `toolbar-strip`. The strip is the
**only** capability-reader; leaf widgets receive their VM slice as props. Tested via PageObject
(TEST-TC-001/003, A-leg).

## SPEC-TC-013 — `ModelSelector.vue` (`src/ui/chat/toolbar/ModelSelector.vue`, PO co-located)

**REQ:** REQ-TC-010/011/012/040 · **Claudian ground-truth:** `ModelSelector.updateDisplay`/
`renderOptions`. A grouped keyboard-operable listbox. **Props:** `vm: ModelWidgetVm`. **Emits:**
`pick: [id: string]`. **Behaviour:** the button shows the `selectedId`'s label (REQ-TC-010); opening
(click OR Enter/Space/focus, **not hover-only**, REQ-TC-040) renders `vm.options` as a `role="listbox"`
with group separators (`role="presentation"`) where `option.group` differs, each option `role="option"`
`aria-selected` (current marked, REQ-TC-011); ArrowUp/Down move `aria-activedescendant`, Home/End jump,
Enter/Space select → emit `pick`, Escape closes + restores button focus (A.3). When `vm.emptyNotice` the
list shows an empty-notice row and the button shows the persisted value (NFR-TC-010, EC-TC-3). The
button is `role="combobox"` `aria-haspopup="listbox"` `aria-expanded`. `data-testid`: `toolbar-model`,
`toolbar-model-option`, `toolbar-model-empty`. Tested via PageObject (TEST-TC-010/011/012/040, A-leg).

## SPEC-TC-014 — `ModeSelector.vue` (`src/ui/chat/toolbar/ModeSelector.vue`, PO co-located)

**REQ:** REQ-TC-013/014/041 · **Claudian ground-truth:** `ModeSelector` (`SpToggleSwitch` +
activeValue/inactiveValue). A descriptor-driven two-option toggle. **Props:** `vm: ModeWidgetVm`.
**Emits:** `set: [value: string]`. **Behaviour:** rendered only when `vm.visibility.kind === 'visible'`
(the strip gates it; the component returns nothing when handed a `hidden` slice as a guard, REQ-TC-013);
shows `vm.descriptor.activeLabel`/`inactiveLabel` per `vm.activeValue`; toggling flips to the other
option value → emit `set` (REQ-TC-014). It is `role="switch"` with `aria-checked` reflecting the active
state + an accessible name (REQ-TC-041). `data-testid`: `toolbar-mode`. Tested via PageObject
(TEST-TC-013/014/041, A-leg).

## SPEC-TC-015 — `PermissionToggle.vue` (`src/ui/chat/toolbar/PermissionToggle.vue`, PO co-located)

**REQ:** REQ-TC-015/016 · **Claudian ground-truth:** `PermissionToggle` (label + toggle; PLAN
special-case); P4 plan state (NG6, display only). The permission display + honest-defer seam. **Props:**
`vm: PermissionWidgetVm`, `notify?: NotificationPort`. **Emits:** none that persists a rule.
**Behaviour:** when `vm.plan`, the toggle is replaced by the "PLAN" label (`toolbar.permission.plan`,
REQ-TC-015); otherwise it shows the permission label + a **disabled** toggle (`enabled:false`); activating
the deferred control surfaces a non-blocking `toolbar.permission.deferred` notice (or a static disabled
affordance) and **persists no rule, writes no `data.json`, gates no tool call** (REQ-TC-016,
SPEC-TC-029). `role="switch"` `aria-disabled` + accessible name (REQ-TC-041). `data-testid`:
`toolbar-permission`. Tested via PageObject (TEST-TC-015/016, A-leg).

## SPEC-TC-016 — `ThinkingSelector.vue` (`src/ui/chat/toolbar/ThinkingSelector.vue`, PO co-located)

**REQ:** REQ-TC-017/018/040 · **Claudian ground-truth:** `ThinkingBudgetSelector` (effort gears vs
token-budget gears; auto-hide on `none`/single). An effort/budget keyboard listbox. **Props:** `vm:
ThinkingWidgetVm`. **Emits:** `set: [choice: ReasoningChoice]`. **Behaviour:** rendered only when
`vm.visibility.kind === 'visible'`; the button shows the current choice — for `effort`, the
`toolbar.thinking.effortLabel` + the localised level ("High"/"Medium"/"Low"); for `token-budget`, the
`toolbar.thinking.budgetLabel` + the token amount (REQ-TC-017); opening lists `vm.options` (same listbox
a11y as SPEC-TC-013, keyboard-openable, REQ-TC-040); selecting emits `set(choice)` (REQ-TC-018).
`data-testid`: `toolbar-thinking`, `toolbar-thinking-option`. Tested via PageObject (TEST-TC-017/018/040,
A-leg).

## SPEC-TC-017 — `ServiceTierToggle.vue` (`src/ui/chat/toolbar/ServiceTierToggle.vue`, PO co-located)

**REQ:** REQ-TC-019/020/041 · **Claudian ground-truth:** `ServiceTierToggle` (Codex fast-mode `zap`).
The capability-gated toggle. **Props:** `vm: ServiceTierWidgetVm`. **Emits:** `toggle: [active: boolean]`.
**Behaviour:** rendered only when `vm.visibility.kind === 'visible'` (the strip hides it on Claude where
`!hasServiceTier`/no descriptor — slot collapses, REQ-TC-019); the `zap` toggle shows `vm.active`;
toggling emits `toggle(!active)` so the surface sets `controls.serviceTier` to the active/inactive value
(REQ-TC-020) — **declared-now, emitted into the turn now; a capable runtime consumes it in P9**.
`role="switch"` `aria-checked` + accessible name (REQ-TC-041); the active glow honours reduced-motion +
forced-colors (NFR-TC-009). `data-testid`: `toolbar-service-tier`. Tested via PageObject
(TEST-TC-019/020/041, A-leg).

## SPEC-TC-018 — `McpSelector.vue` (`src/ui/chat/toolbar/McpSelector.vue`, PO co-located)

**REQ:** REQ-TC-021/022 · **Claudian ground-truth:** `McpServerSelector`; `supportsMcpTools` gating; MCP
backing → P8 (NG2). The honest MCP seam. **Props:** `vm: McpWidgetVm`. **Emits:** none that
connects/toggles a server. **Behaviour:** rendered only when `vm.visibility.kind === 'visible'` (the
strip hides it when `!supportsMcpTools`, REQ-TC-021); the shell shows the MCP icon + a count-0 badge;
opening reveals a **visible-empty** "MCP servers arrive in a later release" panel
(`toolbar.mcp.empty`) — **lists no live servers, toggles/connects nothing** (REQ-TC-022, SPEC-TC-029).
`data-testid`: `toolbar-mcp`, `toolbar-mcp-empty`. Tested via PageObject (TEST-TC-021/022, A-leg).

## SPEC-TC-019 — `ExternalContextControl.vue` (`src/ui/chat/toolbar/ExternalContextControl.vue`, PO co-located)

**REQ:** REQ-TC-023 · **ADR:** ADR-TC-004 §3 (CLAR-TC-002) · **Claudian ground-truth:**
`ExternalContextSelector`; `externalContextPaths` stays excluded (NG3). The visible-disabled folder
affordance. **Props:** `vm: ExternalWidgetVm`, `notify?: NotificationPort`. **Emits:** none.
**Behaviour:** always rendered (full eight-widget parity, CLAR-TC-002 (a)); the paperclip-folder control
is **disabled**; activating it surfaces a non-blocking `toolbar.external.deferred` notice (or a static
disabled affordance) and **opens no picker, adds no path, writes no `externalContextPaths` to any turn
or to settings** (REQ-TC-023, SPEC-TC-029, NFR-TC-011). No `require('electron')`, no `FilePickerPort`
(deferred, charter §6c). `data-testid`: `toolbar-external`. Tested via PageObject (TEST-TC-023, A-leg).

## SPEC-TC-020 — `UsageMeter.vue` (`src/ui/chat/toolbar/UsageMeter.vue`, PO co-located)

**REQ:** REQ-TC-024/025/026/027 · **NFR:** NFR-TC-004/009/012 · **Claudian ground-truth:**
`ContextUsageMeter` (240° arc gauge, `> 80` warning, `/compact` tooltip), `utils/usageInfo.ts`. The
declarative arc gauge. **Props:** `vm: UsageWidgetVm`. **Emits:** none. **Behaviour:** rendered only when
`vm.visibility.kind === 'visible'` (the strip hides it when `usage === null` — no zero-state gauge,
REQ-TC-027, EC-TC-7); renders a **240° arc** as a declarative Vue-bound SVG `<path>` whose `d` +
`stroke-dasharray` are **computed in-repo** from `vm.percentage` (no chart lib, NFR-TC-012; no `v-html`/
`innerHTML`, NFR-TC-004) + a "{percentage}%" label (REQ-TC-024); it re-renders reactively on each usage
update because `vm` derives from the reactive `activeTab.usage` (REQ-TC-025). When `vm.warning`
(`percentage > 80`) it switches to the warning style **and** exposes a tooltip/title suggesting
`/compact` (`toolbar.usage.compactHint`, REQ-TC-026). It is `role="img"` with `aria-label`
(`toolbar.usage.label` "Context usage {percent}%") — colour is never the sole signal (the percentage
text + the warning title carry it, NFR-TC-009); the fill animation honours reduced-motion + the warning
survives forced-colors (a border/label cue). `data-testid`: `toolbar-usage`, `toolbar-usage-arc`,
`toolbar-usage-label`. Tested via PageObject (TEST-TC-024/025/026/027, A-leg).

> **Note:** this is the P6 240° arc-gauge **context meter** widget — distinct from the existing simple
> inline `UsageInfo.vue` token-display (SPEC-RR-031, NG5-then). The strip's meter is the new widget; the
> existing `UsageInfo.vue` is **unchanged** (SPEC-TC-027).

## SPEC-TC-021 — `ChatComposer.vue` toolbar region (`src/ui/chat/ChatComposer.vue`)

**REQ:** REQ-TC-001/002 · **Extends:** SPEC-CA-022 (the P5 composer). **Additive only** — with no
`toolbar` slice the composer is **byte-identical to P5** (the send path + keyboard + DOM unchanged,
NFR-TC-001, G5). Add an **optional toolbar region between the textarea and the footer toolbar** (the
paperclip/send row at `ChatComposer.vue:386-406`) that renders `ToolbarStrip` when a `toolbar?:
ToolbarViewModel` prop is present. The composer re-emits the strip's `pick-model`/`set-mode`/
`set-reasoning`/`toggle-service-tier` to the parent (which owns the per-tab control state, ADR-TC-001).
The region is hidden when the `toolbar` prop is absent (the composer renders exactly as P5 — the same
context-bar/textarea/footer DOM). The new props/emits sit **alongside** the P5 context-bar props/emits
(SPEC-CA-022) — neither is renamed. `data-testid`: `composer-toolbar`. Tested via PageObject extension
(TEST-TC-001/002, A-leg).

## SPEC-TC-022 — `ChatSurface.vue` view-model wiring (`src/ui/chat/ChatSurface.vue`)

**REQ:** REQ-TC-003/004/012/042 · **Extends:** SPEC-CA-022 (the P5 surface). **Additive.** Build the
toolbar view-model and own the change→store wiring:

- Inject `TOOLBAR_CATALOG_PORT` **optionally** (parity with the P1–P5 demos + mount tests; absent → no
  `toolbar` prop, the composer stays pure P5). Read the active runtime's `getToolbarCapabilities()`
  through `tabs.activeRuntime()` (mirroring `activeCapabilities()`, `tabsStore.ts:448`).
- Compute `toolbarVm = buildToolbarViewModel(catalog.getCatalog('claude'), toolbarCaps, activeTab.controls,
  activeTab.usage)` reactively (re-derives on tab switch + on each usage update — REQ-TC-042/025).
- Pass `:toolbar="toolbarVm"` to `ChatComposer`; wire `pick-model`/`set-mode`/`set-reasoning`/
  `toggle-service-tier` to `tabs.setControl(field, value)` (SPEC-TC-023, REQ-TC-012/014/018/020).
- The fold happens in `tabsStore.buildTurnRequest`/`_turnQueryOptions` on submit (SPEC-TC-023); the
  surface does not fold (the store owns the turn).

The surface **never branches on a provider id** (REQ-TC-003): it reads the catalog + capabilities. With
no `TOOLBAR_CATALOG_PORT` the toolbar is absent and the composer is byte-identical to P5 (NFR-TC-001).
`data-testid` inherited (`chat-surface`). Tested via PageObject extension (TEST-TC-003/004/012/042,
A-leg).

## SPEC-TC-023 — `tabsStore.ts` controls + fold (`src/ui/stores/tabsStore.ts`)

**REQ:** REQ-TC-004/012/042 · **ADR:** ADR-TC-001 · **Extends:** SPEC-TS-019 (`TabState`) + SPEC-CA-001
(`buildTurnRequest`/`_turnQueryOptions`). **Additive.**

- `TabState` grows `controls: TabControls` (SPEC-TC-006); `freshTab()` seeds `controls: {}`;
  `loadIntoTab` resets `controls` to `{}` (a resumed/forked conversation starts with no explicit
  control choice — the runtime applies its defaults, REQ-TC-042 parity). `switchTab` needs no change
  (widgets read `activeTab.controls`, so the strip reflects the switched-to tab — REQ-TC-042).
- A `setControl<K extends keyof TabControls>(field: K, value: TabControls[K])` action sets
  `activeTab.controls[field]` (REQ-TC-012/014/018/020). It is a **draft-input** mutation — it does **not**
  send (the backed widgets fold on the next submit, ADR-TC-001).
- On submit, `_turnQueryOptions()` merges `foldControlOptions(active.controls)` (SPEC-TC-010) into the
  query options it already builds from `appendSystemPrompt` (`tabsStore.ts:566`). Additive + guarded: an
  untouched-toolbar turn writes no new field → byte-identical to P5 (NFR-TC-001, EC-TC-1/6). The seam
  widgets fold nothing (no `controls` member for them).

`TabControls`/`ReasoningChoice` are DTO-only imports (no domain class instance crosses the store
boundary, NFR-TC-005). Unit-testable: `setControl` mutates the active tab only; the fold runs on submit
(TEST-TC-004/012/042).

## SPEC-TC-024 — `useToolbarCatalogPort` composable (`src/ui/composables/useToolbarCatalogPort.ts`)

**REQ:** REQ-TC-003/010 · **Extends:** SPEC-CC-017 (the port-composable pattern). Mirroring
`useVaultPort` (inject the key; throw a helpful error when unprovided):

```ts
export function useToolbarCatalogPort(): ToolbarCatalogPort;   // inject TOOLBAR_CATALOG_PORT
```

In `ChatSurface` the port is injected **optionally** (`inject(TOOLBAR_CATALOG_PORT, undefined)`) so a
mount without it degrades to "no toolbar" (SPEC-TC-022); the strict composable exists for any consumer
that requires it. One-port-one-composable (ADR-008). Tested via the Mock port (TEST-TC-003, A-leg).

## SPEC-TC-025 — Wiring (`src/plugin/AgentSidebarView.ts` + `src/ui/main.ts`)

**REQ:** REQ-TC-003/010/021 · **Extends:** SPEC-CA-026 (the provide pattern). **`AgentSidebarView`**
(production) `app.provide`s `TOOLBAR_CATALOG_PORT` (the `ObsidianBridge` Claude static catalog); the
per-tab Claude `ChatRuntimePort` already exposes `getToolbarCapabilities()` (SPEC-TC-005/007), read via
`tabs.activeRuntime()`. **`ui/main.ts`** (standalone) provides the `MockBridge`/`LocalStorageBridge`
catalog + the inert capability flags (SPEC-TC-008/009) so the demo renders the strip with the backed
widgets + the honest seams. Verified on the manual Obsidian leg (TEST-TC-M1/M2). No `obsidian` symbol
enters `src/ui/**`.

---

# 5. Styles — `toolbar/*` `--sp-*` token slice (SPEC-TC-026)

## SPEC-TC-026 — token additions (`src/ui/styles/tokens.css` + the toolbar component styles)

**NFR:** NFR-TC-008 · Charter §3.10 `toolbar/*`. Reuse the existing token set (DESIGN-TC-001 B.2); add
**only** what the new surfaces genuinely need. **No hex, no raw Obsidian var outside the token layer, no
physical CSS property** (`lint-style-tokens` guard). Reused: `--sp-border`, `--sp-radius-*`, `--sp-bg-*`,
`--sp-text-*`, `--sp-accent`/`--sp-brand`, `--sp-space-*`, `--sp-font-*`, `--sp-status-*`, `--sp-warning`,
`--sp-shadow-dropup`, `--sp-z-dropdown`, `--sp-duration-*`. The strip's dropdowns reuse the P4
`SpDropdownPanel`/`--sp-surface-overlay` pattern.

| New token (only if not already present) | Surface | Default (token-layer lookup) | Justification (Claudian rule) |
|---|---|---|---|
| `--sp-toolbar-gap` | strip row | `var(--sp-space-2)` | `.claudian-input-toolbar` flex gap |
| `--sp-toolbar-widget-h` | each widget | a fixed control height | toolbar control height |
| `--sp-toolbar-disabled-opacity` | seam widgets | a dimmed affordance | the "coming later" dimmed seam |
| `--sp-toggle-track` / `--sp-toggle-thumb` | mode/permission/service-tier | `var(--sp-border)` / `var(--sp-bg-secondary)` | `SpToggleSwitch` track/thumb |
| `--sp-toggle-active` | toggle-on | `var(--sp-accent)` | the active fill |
| `--sp-usage-arc-track` | meter | the gauge background arc | `context-footer.css` |
| `--sp-usage-arc-fill` | meter | `var(--sp-accent)` | the gauge fill |
| `--sp-usage-arc-warn` | meter > 80% | `var(--sp-warning)` | the pale-red warning fill |
| `--sp-usage-arc-size` / `--sp-usage-arc-stroke` | meter | the gauge box + stroke | gauge geometry |
| `--sp-service-tier-glow` | service-tier active | a reduced-motion-safe glow | the `zap` active glow |

> Prefer reuse over a near-duplicate; each minted token is justified against a Claudian
> `toolbar/{model,mode,thinking,mcp,external-context}-selector.css` / `{permission,service-tier}-toggle.css`
> / `context-footer.css` rule at the single final review gate. A `lint-style-tokens` test asserts no raw
> hex / raw Obsidian var / physical property leaks (TEST-TC-026).

---

# 6. Cross-cutting invariants (SPEC-TC-027..030)

## SPEC-TC-027 — Additivity invariant

**NFR:** NFR-TC-001. P0–P5 stay byte-identical: the **only** growth is the three optional
`ChatRuntimeQueryOptions` fields (SPEC-TC-001), the new `Reasoning.ts` union, the new `toolbar/`
DTOs + `TabControls`, the new `ToolbarCatalogPort` + `TOOLBAR_CATALOG_PORT` key + barrel re-export, the
`getToolbarCapabilities` method + `ToolbarCapabilities` on `ChatRuntimePort`, the two pure transforms,
the nine UI components, the additive `ChatComposer` toolbar region + `ChatSurface` wiring + `tabsStore`
`controls`/`setControl`/fold, and the composable. `PreparedChatTurn`, `ChatRuntimeEnsureReadyOptions`,
`ChatTurnRequest`, `UsageInfo`, the existing `UsageInfo.vue`, the P0–P5 `ChatRuntimePort` members + the
five `RuntimeCapabilities` flags, and the P5 composer context-bar slot are **unchanged**. TEST-TC-002
asserts a P5-shaped query (no new field) serialises byte-identically to P5; TEST-TC-027 asserts the
unchanged members + that `UsageInfo`/`PreparedChatTurn` are untouched.

## SPEC-TC-028 — i18n / microcopy invariant

**NFR:** NFR-TC-014. Every new user-facing string routes through `TranslationPort`/`vue-i18n` with
English **and German** keys (en+de like P5; full-locale parity is NG8 → P11). New keys under
`agent.chat.toolbar.*`: `model.label`/`model.open`, `mode.label`, `permission.label`/`permission.plan`/
`permission.deferred`, `thinking.effortLabel`/`thinking.budgetLabel`, `serviceTier.label`, `mcp.label`/
`mcp.empty`, `external.label`/`external.deferred`, `usage.label`/`usage.compactHint`. No hardcoded
user-facing string in any new component; no `v-html` (NFR-TC-004). Verified by a review check + the
A-leg component tests asserting the keyed strings render.

## SPEC-TC-029 — No-provider-branch + capability-gate + honest-defer invariant

**REQ:** REQ-TC-003/016/019/021/022/023. Widget visibility + enablement read `ToolbarCapabilities` +
`ToolbarCatalog` — **zero `if (providerId === 'claude')` branch** in `buildToolbarViewModel`,
`ToolbarStrip`, or any leaf widget (parity with REQ-TS-026 / REQ-CA-028). The seam widgets defer
**honestly**: service-tier + MCP are **capability-hidden** (Claude / `!supportsMcpTools` → slot
collapses); permission + external + the MCP-empty panel are **visible-disabled** "coming later"
affordances that **persist no rule, open no picker, connect no server, write no turn field** (REQ-TC-016/
022/023). Mirrors the P5 `supportsBrowserSelection` defer (ADR-CA-003 §2). TEST-TC-003 grep-asserts no
provider-id branch; TEST-TC-016/019/021/022/023 assert the honest-defer behaviour (counter-metric:
**zero** live-looking-but-dead controls).

## SPEC-TC-030 — Result / no-secret / DOM-rule / observability invariant

**NFR:** NFR-TC-004/010/011/006. The two transforms (`foldControlOptions`, `buildToolbarViewModel`) are
**pure + total** (never throw); a `ToolbarCatalogPort.getCatalog` miss returns a safe default (the strip
degrades to a hidden/empty widget, NFR-TC-010, EC-TC-3); no exception crosses a boundary. **No secret/
token** in any widget DTO, view-model, or query-option field; **nothing toolbar-related is written to
`data.json`** (NFR-TC-011; TEST-TC-030 asserts no secret + `data.json` untouched). No `v-html`/
`innerHTML`/`outerHTML`/`insertAdjacentHTML` (the arc gauge + selectors are declarative Vue bindings);
no `window.confirm`/`alert`/`prompt`; any seam notice is a `NotificationPort` call, never a blocking
dialog (NFR-TC-004). **Observability:** the surface/store emit `LoggerPort` events at boundaries (control
set, catalog miss, seam-defer activated) but **never log message content or a secret** (NFR-TC-006) — the
same posture as SPEC-CA-030. `manifest.json` untouched; no migration (NFR-TC-013).

---

# 7. Edge cases (EC-TC-*)

| ID | Scenario | Specified behaviour | Spec item · REQ |
|---|---|---|---|
| EC-TC-1 | Untouched toolbar — turn submitted with `controls: {}` | `foldControlOptions({}) → {}`; the query options are byte-identical to a P5 turn (no new field) | SPEC-TC-010/023/027 · NFR-TC-001 / REQ-TC-002 |
| EC-TC-2 | Capability-absent (Claude `hasServiceTier:false`, no descriptor) | service-tier widget `hidden`, slot collapses; MCP `hidden` when `!supportsMcpTools` | SPEC-TC-011/012/017/018 · REQ-TC-019/021 |
| EC-TC-3 | Catalog load failure / empty model list | `getCatalog` returns the safe default; model selector shows the persisted value + an empty notice; descriptor-less widgets hide — no broken control, no throw | SPEC-TC-004/011/013 · NFR-TC-010 |
| EC-TC-4 | `reasoningControl: 'none'` or a single reasoning option | thinking selector `hidden` | SPEC-TC-011/016 · REQ-TC-017 |
| EC-TC-5 | PLAN state active (P4 plan mode) | permission widget shows the "PLAN" label in place of the toggle (display only) | SPEC-TC-011/015 · REQ-TC-015 |
| EC-TC-6 | A `reasoning`/`mode` **default** value (not an explicit pick) | the descriptor `defaultChoice`/inactive value is **not** folded (`foldControlOptions` writes only `controls`-present values) → byte-identical turn | SPEC-TC-010 · NFR-TC-001 / REQ-TC-004 |
| EC-TC-7 | `usage === null` (fresh tab, no stream yet) | usage meter `hidden` — no zero-state gauge; the first usage chunk renders it | SPEC-TC-011/020 · REQ-TC-027/025 |
| EC-TC-8 | Per-tab isolation on tab switch (tab A model X / 30%, tab B model Y / 70%) | every widget re-derives from `activeTab.controls`/`activeTab.usage`; switching shows Y / 70% | SPEC-TC-022/023 · REQ-TC-042 |
| EC-TC-9 | Seam interaction (open MCP / click disabled permission/external) | the empty/"coming later" affordance shows; nothing persists, no picker/server/turn field | SPEC-TC-015/018/019/029 · REQ-TC-016/022/023 |
| EC-TC-10 | Concurrent stream for a non-active tab | the usage chunk updates only that tab's `usage`; the active tab's meter is untouched (P3 per-tab isolation inherited) | SPEC-TC-023 · REQ-TC-042 |
| EC-TC-11 | Selection then no submit (a control set, no turn) | `controls` persists on the tab until changed (draft input); folds only on an actual submit | SPEC-TC-023 · REQ-TC-004 |
| EC-TC-12 | Keyboard-only operation of the model/thinking selector | Enter/Space opens, Arrow navigates, Enter selects, Escape closes + restores focus — no hover-only trap | SPEC-TC-013/016 · REQ-TC-040 |
| EC-TC-13 | Strip wrapping at 320 px | the row `flex-wrap`s, the meter drops to the wrapped row's trailing end; no widget dropped by width (only by capability) | SPEC-TC-012 · NFR-TC-008 |
| EC-TC-14 | No `TOOLBAR_CATALOG_PORT` provided (P1–P5 demo / mount) | the composer renders the pure-P5 surface (no toolbar region) | SPEC-TC-022 · REQ-TC-002 / NFR-TC-001 |

---

# 8. Test scenarios (TEST-TC-*) — U / A / M split

> **U** = pure unit (the two transforms, the DTOs, the store fold, additivity/no-secret/no-branch
> invariants) over the Mock ports. **A** = component via co-located `data-testid` PageObject (mount +
> assert). **M** = manual Obsidian leg (coverage-excluded real Claude capability/catalog reporting, the
> real-CLI turn carrying the folded options) accumulating for the single final human review gate
> (autonomous-drive). Each maps 1:1 to a REQ-TC or an EC-TC.

| TEST | Asserts | Layer | Covers |
|---|---|---|---|
| TEST-TC-001 | the strip renders the eight widget regions in Claudian order, each by `data-testid` | A | REQ-TC-001; SPEC-TC-012/021 |
| TEST-TC-002 | a P5-shaped query (no new field) + `foldControlOptions({}) → {}` serialise byte-identically to P5 | U | REQ-TC-002; NFR-TC-001; SPEC-TC-001/010/027 |
| TEST-TC-003 | the view-model reads capability flags + catalog, NO `providerId` branch (grep + behaviour) | U | REQ-TC-003; SPEC-TC-011/029 |
| TEST-TC-004 | a backed widget change folds into the next turn's query options; others untouched | U | REQ-TC-004; SPEC-TC-010/023 |
| TEST-TC-006 | `TabControls` type-shape; `freshTab` seeds `{}`, `loadIntoTab` resets it | U | REQ-TC-042; SPEC-TC-006/023 |
| TEST-TC-010 | model widget VM: options from the catalog, current marked; empty list → empty notice + persisted value | U/A | REQ-TC-010; SPEC-TC-003/011/013; EC-TC-3 |
| TEST-TC-011 | model selector opens, lists grouped models, marks current selected | A | REQ-TC-011; SPEC-TC-013 |
| TEST-TC-012 | selecting a model → `setControl('model')` → next turn carries `queryOptions.model` | U/A | REQ-TC-012; SPEC-TC-010/013/022/023 |
| TEST-TC-013 | mode widget VM hidden without a descriptor; visible shows active label | U/A | REQ-TC-013; SPEC-TC-011/014 |
| TEST-TC-014 | toggling mode → `setControl('mode', other)` → next turn carries `queryOptions.mode` | U/A | REQ-TC-014; SPEC-TC-010/014/023 |
| TEST-TC-015 | permission widget shows the PLAN label when `permissionMode:'plan'`; else the disabled toggle | A | REQ-TC-015; SPEC-TC-011/015 |
| TEST-TC-016 | the permission toggle is an honest seam: disabled/"coming later", persists no rule, no `data.json` write | A | REQ-TC-016; SPEC-TC-015/029; EC-TC-9 |
| TEST-TC-017 | thinking widget hidden on `none`/single; effort variant shows "Effort: Medium"; budget variant shows the amount | U/A | REQ-TC-017; SPEC-TC-011/016; EC-TC-4 |
| TEST-TC-018 | `ReasoningChoice` narrowing; selecting High → `setControl('reasoning', {kind:'effort',value:'high'})` → folded | U/A | REQ-TC-018; SPEC-TC-002/010/016/023 |
| TEST-TC-019 | service-tier hidden on Claude (no descriptor / `!hasServiceTier`); visible toggle where a descriptor exists | U/A | REQ-TC-019; SPEC-TC-011/017; EC-TC-2 |
| TEST-TC-020 | toggling a configured service-tier → `setControl('serviceTier')` → next turn carries `queryOptions.serviceTier` | U/A | REQ-TC-020; SPEC-TC-010/017/023 |
| TEST-TC-021 | MCP hidden when `!supportsMcpTools`; visible shell + count-0 when supported | U/A | REQ-TC-021; SPEC-TC-011/018 |
| TEST-TC-022 | opening MCP shows the empty "coming later" panel; lists no server, toggles nothing | A | REQ-TC-022; SPEC-TC-018/029; EC-TC-9 |
| TEST-TC-023 | external-context is visible-disabled; activating it opens no picker, adds no path, writes no `externalContextPaths` | A | REQ-TC-023; SPEC-TC-019/029; EC-TC-9 |
| TEST-TC-024 | usage meter renders a 240° arc + "{n}%" from `vm.percentage` (declarative SVG, no `v-html`) | A | REQ-TC-024; SPEC-TC-011/020; NFR-TC-004 |
| TEST-TC-025 | a usage update re-renders the arc + percentage (42% → 67%) | A | REQ-TC-025; SPEC-TC-020/022 |
| TEST-TC-026 | `percentage > 80` → warning style + `/compact` tooltip; `lint-style-tokens` green | U/A | REQ-TC-026; SPEC-TC-020/026 |
| TEST-TC-027 | usage meter hidden when `usage === null`; additivity: P0–P5 members + `UsageInfo`/`PreparedChatTurn` byte-identical | U/A | REQ-TC-027; NFR-TC-001; SPEC-TC-011/020/027; EC-TC-7 |
| TEST-TC-040 | model + thinking selectors open + arrow-navigate + Enter-select + Esc-close by keyboard (no hover-only) | A | REQ-TC-040; SPEC-TC-013/016; EC-TC-12 |
| TEST-TC-041 | mode/permission/service-tier toggles expose `aria-checked`/pressed + an accessible name | A | REQ-TC-041; SPEC-TC-014/015/017 |
| TEST-TC-042 | tab switch (A model X / 30% vs B model Y / 70%) re-derives every widget from the active tab | U/A | REQ-TC-042; SPEC-TC-022/023; EC-TC-8/10 |
| TEST-TC-030 | no secret in any widget DTO / query-option field; `data.json` untouched; catalog miss degrades, no throw | U | NFR-TC-010/011; SPEC-TC-030; EC-TC-3 |
| TEST-TC-043 | the composer with no `toolbar` prop renders byte-identically to P5 (no toolbar region) | A | REQ-TC-002; SPEC-TC-021/022; EC-TC-14 |
| TEST-TC-M1 | (manual) the real Claude runtime reports `getToolbarCapabilities` + the `ToolbarCatalogPort` wires end-to-end in Obsidian | M | NFR-TC-001; SPEC-TC-005/007/025 |
| TEST-TC-M2 | (manual) per-widget parity screenshots vs claudian at 320/520/720 px, light + dark | M | NFR-TC-008; SPEC-TC-012/026 |
| TEST-TC-M3 | (manual) a real-CLI turn carries the folded `mode`/`reasoning` options to the runtime | M | REQ-TC-004; SPEC-TC-001/010/023 |

**Split tally:** **U ≈ 9** (the two transforms incl. the empty-fold, the DTO/narrowing shapes, the
additivity/no-secret/no-branch invariants, the store fold) — these hold the 80/70/80/80 coverage gate
(NFR-TC-007); **A ≈ 18** (the strip + the eight leaf widgets + the meter + the composer/surface
extensions + the a11y/keyboard/toggle-AT-state + the token guard, several U/A spanning both); **M ≈ 3**
(the real Claude capability/catalog reporting, the parity screenshots, the real-CLI folded-options turn)
accumulating for the single final human review gate (autonomous-drive).

---

# 9. Requirements coverage — REQ-TC ↔ SPEC-TC ↔ TEST-TC

| REQ / NFR | SPEC-TC | TEST-TC |
|---|---|---|
| REQ-TC-001 | SPEC-TC-012/021 | TEST-TC-001 |
| REQ-TC-002 | SPEC-TC-001/021/022/027 | TEST-TC-002/043; EC-TC-1/14 |
| REQ-TC-003 | SPEC-TC-004/005/011/022/029 | TEST-TC-003 |
| REQ-TC-004 | SPEC-TC-001/010/023 | TEST-TC-004; TEST-TC-M3 (M); EC-TC-1/6/11 |
| REQ-TC-010 | SPEC-TC-003/011/013 | TEST-TC-010 |
| REQ-TC-011 | SPEC-TC-003/013 | TEST-TC-011 |
| REQ-TC-012 | SPEC-TC-006/010/013/022/023 | TEST-TC-012 |
| REQ-TC-013 | SPEC-TC-003/011/014 | TEST-TC-013 |
| REQ-TC-014 | SPEC-TC-001/010/014/023 | TEST-TC-014 |
| REQ-TC-015 | SPEC-TC-005/011/015 | TEST-TC-015; EC-TC-5 |
| REQ-TC-016 | SPEC-TC-015/029 | TEST-TC-016; EC-TC-9 |
| REQ-TC-017 | SPEC-TC-002/003/011/016 | TEST-TC-017; EC-TC-4 |
| REQ-TC-018 | SPEC-TC-001/002/010/016/023 | TEST-TC-018 |
| REQ-TC-019 | SPEC-TC-005/011/017 | TEST-TC-019; EC-TC-2 |
| REQ-TC-020 | SPEC-TC-001/010/017/023 | TEST-TC-020 |
| REQ-TC-021 | SPEC-TC-005/011/018 | TEST-TC-021 |
| REQ-TC-022 | SPEC-TC-018/029 | TEST-TC-022; EC-TC-9 |
| REQ-TC-023 | SPEC-TC-019/029 | TEST-TC-023; EC-TC-9 |
| REQ-TC-024 | SPEC-TC-011/020 | TEST-TC-024 |
| REQ-TC-025 | SPEC-TC-020/022 | TEST-TC-025 |
| REQ-TC-026 | SPEC-TC-020/026 | TEST-TC-026 |
| REQ-TC-027 | SPEC-TC-011/020 | TEST-TC-027; EC-TC-7 |
| REQ-TC-040 | SPEC-TC-013/016 | TEST-TC-040; EC-TC-12 |
| REQ-TC-041 | SPEC-TC-014/015/017 | TEST-TC-041 |
| REQ-TC-042 | SPEC-TC-006/022/023 | TEST-TC-042/006; EC-TC-8/10 |
| NFR-TC-001 | SPEC-TC-001/006/010/023/027 | TEST-TC-002/027/043 |
| NFR-TC-002 | SPEC-TC-004/005/007/008/009/024/025 | TEST-TC-003; TEST-TC-M1 (M) |
| NFR-TC-003 | SPEC-TC-012..022 (ports/VM; no `obsidian` in `src/ui/**`) | TEST-TC-024; A-leg lint |
| NFR-TC-004 | SPEC-TC-020/030 | TEST-TC-024 |
| NFR-TC-005 | SPEC-TC-006/010/011/023 (`<script setup>`, `Result`/total, DTO store) | A-leg + U-leg |
| NFR-TC-006 | every `.vue` has a `.po.ts` (SPEC-TC-012..020) | A-leg tests |
| NFR-TC-007 | SPEC-TC-010/011/023/030 (U-leg) | coverage 80/70/80/80 gate |
| NFR-TC-008 | SPEC-TC-012/026 | TEST-TC-026; TEST-TC-M2 (M); EC-TC-13 |
| NFR-TC-009 | SPEC-TC-013/014/015/016/017/020 (a11y) | TEST-TC-040/041; TEST-TC-M2 (M) |
| NFR-TC-010 | SPEC-TC-004/011/030 | TEST-TC-010/030; EC-TC-3 |
| NFR-TC-011 | SPEC-TC-019/030 | TEST-TC-030 |
| NFR-TC-012 | SPEC-TC-020 (in-repo arc) | TEST-TC-024 (no new dep) |
| NFR-TC-013 | manifest untouched (cross-cutting) | review check |
| NFR-TC-014 | SPEC-TC-028 | A-leg (keyed strings render) |

**All 27 REQ-TC + 14 NFR-TC covered by ≥ 1 SPEC-TC and ≥ 1 TEST-TC. No `TBD`.**

---

# 10. Quality gate

- [x] Every public interface specified (signature · behaviour · pre/post · errors · side effects ·
      REQ links) — DOMAIN types/ports (SPEC-TC-001..006), the pure transforms (SPEC-TC-010/011), the UI
      components + store + composable + wiring (SPEC-TC-012..025).
- [x] Data structures specified with per-field validation rules (SPEC-TC-001/002/003/004/005/006).
- [x] State transitions modelled (the per-widget state matrix — DESIGN-TC-001 A.2 referenced;
      `buildToolbarViewModel` enumerates the visible/enabled/hidden legs, SPEC-TC-011).
- [x] Edge cases enumerated, not `TBD` (EC-TC-1..14).
- [x] Test scenarios derived, U/A/M split, 1:1 to REQ/EC (TEST-TC-001..043 + M1/M2/M3).
- [x] Observability specified (SPEC-TC-030 — boundary logs, no content/secret).
- [x] Performance budgets inherited (no new threshold; the arc is computed in-repo, NFR-TC-012).
- [x] Compatibility: **fully additive** — P0–P5 byte-identical, no migration (SPEC-TC-027, NFR-TC-013).
- [x] Every spec item traces to ≥ 1 REQ; full coverage table (§9).
- [x] Two independent teams would build the same thing (the three field-level open items RESOLVED in §0:
      effort vocab `'high'|'medium'|'low'`, descriptor-driven budget — no hard-coded default, the
      `USAGE_WARNING_THRESHOLD = 80` `>` constant).
- [x] Every irreversible architectural choice already has an ADR (ADR-TC-001..004, accepted) — no new
      ADR needed; this spec only refines field-level details the ADRs delegated to spec.

> **No open clarifications block the planner.** The three design open items (effort vocabulary,
> token-budget defaults, the warning threshold) are RESOLVED in §0. Hand-off to `/spec:tasks` (planner)
> in `workflow-state.md`.
