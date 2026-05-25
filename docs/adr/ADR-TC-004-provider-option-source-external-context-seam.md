---
id: ADR-TC-004
title: Source the toolbar option lists from a new narrow ToolbarCatalogPort (Claude static-for-now); render the external-context control as a visible-disabled seam
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, toolbar, catalog, port, external-context, claudian-reboot, P6]
---

# ADR-TC-004 — Provider option-list source + external-context seam

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-TC-002**. Unblocks `PRD-TC-001`
(REQ-TC-010/011/013/017/019/023; NFR-TC-002/003).

## Context

The backed selectors need option lists + descriptors: the model list, the mode descriptor, the
reasoning options (effort vs token-budget), the service-tier descriptor. In Claudian these come from
the provider's `ProviderChatUIConfig` (`getModelOptions`, `getModeSelector`, `getReasoningOptions`,
the toggle descriptors). No existing Specorator port supplies these (the capability *flags* ride the
runtime seam, ADR-TC-003 §2, but the *option lists* are a separate, descriptor-shaped concern). P6
wires the **Claude** catalog only (NG4: Codex/Opencode catalogs are P9; env-derived custom models +
per-model context limits are P10/NG5).

Separately, CLAR-TC-002 asks whether the **external-context control** is a visible-but-disabled seam or
omitted until the folder picker (`FilePickerPort`, charter §6c) + path persistence land. The PM
recommends visible-disabled for full Claudian layout parity. The native folder picker uses
`remote.dialog` in Claudian (`InputToolbar.ts:23-32`), which a Vue component must never reach
(NFR-TC-003 — no `obsidian`/`electron` in `src/ui/**`).

## Decision

### 1. A new narrow `ToolbarCatalogPort` supplies the option lists + descriptors (ADR-008: a new consumer earns a port)

```ts
// src/domain/ports/ToolbarCatalogPort.ts — new narrow port
export interface ToolbarCatalogPort {
  getCatalog(providerId: ProviderId): ToolbarCatalog;
}

// src/domain/chat/toolbar/ToolbarCatalog.ts — pure DTOs (no obsidian/node/class)
export interface ToolbarCatalog {
  readonly models: readonly ModelOption[];          // grouped, current-markable (REQ-TC-010/011)
  readonly defaultModel: string;
  readonly mode?: ModeDescriptor;                   // absent → mode widget hidden (REQ-TC-013)
  readonly reasoning?: ReasoningDescriptor;         // effort/budget options (REQ-TC-017)
  readonly serviceTier?: ServiceTierDescriptor;     // absent for Claude → widget hidden (REQ-TC-019)
}
```

The catalog needs its own InjectionKey (`TOOLBAR_CATALOG_PORT`) + composable
(`useToolbarCatalogPort`) + three bridge impls (NFR-TC-002), per ADR-008 one-port-one-consumer. It is
**static-for-now**: the Claude catalog is a load-or-default constant (the multi-provider catalog +
env-derived models are P9/P10). The `buildToolbarViewModel` transform reads the catalog + the
`getToolbarCapabilities` flags (ADR-TC-003) — never a `providerId` branch (REQ-TC-003).

### 2. Three-bridge story

| Bridge | `getCatalog` |
|---|---|
| `ObsidianBridge` | the real Claude catalog (model list + descriptors), static-for-now load-or-default |
| `MockBridge` | **scriptable** — tests inject a catalog (custom models, effort vs budget, with/without mode + service-tier descriptors) to drive the view-model + widget tests |
| `LocalStorageBridge` | a fixed inert Claude-shaped catalog (GitHub Pages demo) |

`fake-ports.ts` grows a `toolbarCatalog` member so view-model/widget tests inject a catalog without a
real provider.

### 3. The external-context control is a visible-but-disabled seam (CLAR-TC-002 → option (a))

P6 renders the external-context control as a **visible-but-disabled** affordance with an "external
folders arrive in a later release" message, so the strip reads as the complete Claudian eight-widget
layout (parity) while truthfully signalling the control is inactive (REQ-TC-023). Activating it does
**not** open a folder picker, add a path, or write `externalContextPaths` to any turn or to settings.
The `FilePickerPort` + path persistence + the `externalContextPaths` request field are a **later
phase** (NG3) — `externalContextPaths` stays **excluded** from `ChatRuntimeQueryOptions` (continuing
the P5 NG3 exclusion). No `require('electron')`/`remote.dialog` enters the Vue layer (NFR-TC-003).

## Considered options

### Option A — new `ToolbarCatalogPort` (static-for-now Claude) + visible-disabled external seam *(chosen)*
- Pros: the catalog is a genuinely-new consumer that earns its own narrow port (ADR-008); static-for-now
  keeps P6 scoped to Claude (NG4); the visible-disabled external seam gives full Claudian layout parity
  while staying honest (no picker, no excluded-field leak); no electron in Vue.
- Cons: a new port + key + composable + three bridges; the catalog is a constant until P9/P10 makes it
  dynamic.

### Option B — a static in-component option list (no port)
- Pros: no new seam.
- Cons: bakes the Claude model list into a Vue component (Vue would own provider data); no scriptable
  test seam for the view-model; breaks the moment P9 adds a second provider's catalog. Rejected.

### Option C — omit the external-context control until the picker port lands
- Pros: no seam widget at all.
- Cons: the strip would read as a seven-widget layout, breaking Claudian parity (charter §3 "nothing
  silently dropped"); the PM recommendation is visible-disabled for parity. Rejected.

### Option D — fold the catalog into the runtime `getToolbarCapabilities` bag (ADR-TC-003)
- Pros: one seam.
- Cons: conflates per-runtime capability flags with the static option-list catalog (two responsibilities
  on one accessor); the catalog is descriptor-shaped data, not a runtime capability. Rejected for
  narrow-port hygiene.

## Consequences

### Positive
- The option lists come from a narrow, scriptable, three-bridge port (NFR-TC-002/003); the view-model
  is testable with injected catalogs.
- The strip reads as the full Claudian eight-widget layout (REQ-TC-001, parity) with the external
  control honestly disabled.
- No electron/obsidian reaches the Vue layer; `externalContextPaths` stays excluded (NG3).

### Negative
- A new port + key + composable + three bridge impls; the catalog is static until P9/P10.

### Neutral
- The model list's grouping/reversed-recent ordering (Claudian `ModelSelector.renderOptions`) is a
  presentation detail the catalog DTO carries (`ModelOption.group`); the picker backing for external
  context is a later phase.

## Compliance

- A test asserts the model/mode/thinking widgets render from the injected `MockBridge` catalog and the
  current value is marked (REQ-TC-010/011/013/017).
- A test asserts `getCatalog` exists on all three bridges (NFR-TC-002).
- A test asserts activating the external-context control opens no picker, adds no path, writes no
  `externalContextPaths` to the turn, and persists nothing (REQ-TC-023).
- A review check confirms no `electron`/`obsidian` import in any toolbar Vue component (NFR-TC-003) and
  that `externalContextPaths` is absent from `ChatRuntimeQueryOptions` (NG3).

## References

- PRD-TC-001 — REQ-TC-010/011/013/017/019/023; CLAR-TC-002; NG3/NG4/NG5; NFR-TC-002/003.
- `specs/toolbar-controls/design.md` Part C (C.2/C.4) + Part A (A.2/A.3).
- **ADR-TC-003** (the capability flags the view-model reads alongside the catalog), **ADR-TC-002** (the
  `serviceTier?` field the descriptor threads), **ADR-CA-003** (the P5 honest-defer pattern;
  `FilePickerPort` is the charter §6c port this defers), ADR-008 (a new consumer earns a narrow port).
- Claudian reference: `core/providers/types.ts` (`ProviderChatUIConfig.getModelOptions` /
  `getReasoningOptions` / `getModeSelector` / `ProviderServiceTierToggleConfig`),
  `features/chat/ui/InputToolbar.ts` (`ExternalContextSelector` + the `remote.dialog` picker).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
