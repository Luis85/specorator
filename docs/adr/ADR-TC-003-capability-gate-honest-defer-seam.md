---
id: ADR-TC-003
title: Gate widget visibility on capability flags (RuntimeCapabilities + getToolbarCapabilities), never a provider-id branch; seam widgets defer honestly
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
tags: [architecture, toolbar, capabilities, honest-defer, claudian-reboot, P6]
---

# ADR-TC-003 — Capability-gate + honest-defer seam pattern

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Realises REQ-TC-003 and the honest-defer
counter-metric. Unblocks `PRD-TC-001` (REQ-TC-003/016/019/021/022; NFR-TC-010).

## Context

P6's defining work is an honest scoping decision per widget. The backed widgets (model/mode/thinking/
usage) work in P6; the seam widgets land later — **permission → P7, MCP → P8, service-tier (Codex
fast-mode) → P9, external-context → a later phase**. Each seam widget MUST render as an honest
disabled/"coming later" affordance or be capability-hidden — never a live-looking control that
silently does nothing (G3, the counter-metric). The PRD also forbids branching widget presence on a
literal `providerId` (REQ-TC-003); decisions must read **capability flags**.

This is exactly the P5 `supportsBrowserSelection` honest-defer pattern (`ChatComposer.vue:64`,
ADR-CA-003 §2): the affordance exists, the gate is explicit, the surface degrades gracefully. The
question is **where the capability source lives** — extend `RuntimeCapabilities`, add a new port, or
read the catalog descriptors.

## Decision

### 1. Visibility/enablement read capability flags + catalog descriptors, never a `providerId` branch

`ToolbarStrip` never inspects `providerId`. The pure `buildToolbarViewModel(catalog, capabilities,
controls, usage)` decides each widget's visibility + enabled/seam state from capability flags and the
catalog descriptors (REQ-TC-003).

### 2. Capability flags ride the existing `ChatRuntimePort` capability seam — additive `getToolbarCapabilities`

`RuntimeCapabilities` already lives on `ChatRuntimePort` (P3/P4: `getCapabilities()`,
`ChatRuntimePort.ts:72`). P6 **does not add a new port for capability flags** — the runtime already
owns capability reporting (ADR-008 one-port-one-consumer). It exposes an additive
`getToolbarCapabilities(): ToolbarCapabilities` bag; the P3/P4 `RuntimeCapabilities` flags stay
byte-identical:

```ts
// src/domain/ports/ChatRuntimePort.ts — additive accessor (the P3/P4 flags unchanged)
export interface ToolbarCapabilities {
  readonly supportsMcpTools: boolean;
  readonly reasoningControl: 'effort' | 'token-budget' | 'none';
  readonly hasServiceTier: boolean;
  readonly hasModeToggle: boolean;
  readonly permissionMode: string;   // current permission display state (P4 plan/permission)
}
getToolbarCapabilities(): ToolbarCapabilities;
```

### 3. The honest-defer matrix

Each seam widget is EITHER capability-hidden OR visible-but-explicitly-disabled — never live-but-inert:

| Seam widget | Gate | Honest affordance |
|---|---|---|
| **Service-tier** | `caps.hasServiceTier` (false for Claude) | **hidden** — slot collapses, no dead button (REQ-TC-019) |
| **MCP** | `caps.supportsMcpTools` | hidden when false; when true, a **visible-empty** "MCP servers arrive in a later release" panel — no live servers, toggles nothing, connects nothing (REQ-TC-021/022) |
| **Permission** | always rendered (display state from `caps.permissionMode` + the P4 plan state) | **visible-disabled** "permissions arrive in a later release"; no rule persists, no `data.json` write (REQ-TC-016) |
| **External-context** | always rendered (CLAR-TC-002 → visible) | **visible-disabled** "external folders arrive in a later release"; no folder picker opens; `externalContextPaths` stays excluded (REQ-TC-023, ADR-TC-004 §3) |

The permission toggle's **PLAN special-case** (toggle replaced by a "PLAN" label) reflects the P4 plan
state as **display only** — P6 does not own plan mode (NG6).

### 4. `getToolbarCapabilities` on the three bridges

| Bridge | `getToolbarCapabilities` |
|---|---|
| `ObsidianBridge` (Claude runtime) | the real Claude flags: `supportsMcpTools` per the runtime, `reasoningControl: 'effort'`, `hasServiceTier: false`, `hasModeToggle` per the descriptor, `permissionMode` from the P4 state |
| `MockBridge` | **scriptable** — tests drive the seam-hidden vs seam-visible matrix (e.g. flip `supportsMcpTools`/`hasServiceTier`) |
| `LocalStorageBridge` | inert: `supportsMcpTools:false`, `hasServiceTier:false`, `reasoningControl:'none'` |

## Considered options

### Option A — capability flags on the existing `ChatRuntimePort` seam + a separate catalog port for descriptors *(chosen)*
- Pros: the runtime already owns capability reporting (no new port for flags); reuses the P3/P4
  `getCapabilities` pattern; the catalog port (ADR-TC-004) is the one genuinely-new consumer; the
  honest-defer matrix mirrors the proven P5 `supportsBrowserSelection` pattern.
- Cons: `RuntimeCapabilities` access grows an accessor (additive).

### Option B — a single new `ToolbarCapabilityPort` carrying both flags and option lists
- Pros: one seam for everything toolbar.
- Cons: conflates per-runtime capability reporting (which the runtime already owns) with the static
  catalog (a separate concern); a fatter port with two unrelated responsibilities violates the narrow
  -port discipline (ADR-008). Rejected.

### Option C — branch widget presence on `providerId`
- Cons: forbidden by REQ-TC-003 (and the charter §3.6 capability-driven-UI rule); breaks the moment a
  second provider lands. Rejected.

## Consequences

### Positive
- Zero seam widget is live-but-inert (the counter-metric); each is capability-hidden or
  explicit-disabled (G3).
- No provider-id branch anywhere in the strip (REQ-TC-003).
- Capability flags reuse the existing runtime seam; only the descriptor catalog is a new port.

### Negative
- The Claude runtime grows a `getToolbarCapabilities` accessor (additive); the seam widgets carry
  "coming later" microcopy through i18n (NFR-TC-014).

### Neutral
- Permission rules (P7), MCP servers (P8), Codex service-tier (P9), and the external-folder picker
  (later) all stay in their owning phases — P6 ships only the honest shells.

## Compliance

- A test asserts no `if (providerId === ...)` branch exists in `ToolbarStrip` or `buildToolbarViewModel`
  (REQ-TC-003).
- A test asserts the service-tier widget is hidden for Claude and the MCP widget is hidden when
  `!supportsMcpTools` (REQ-TC-019/021).
- A test asserts the permission + external + MCP-empty affordances render disabled/"coming later",
  persist no rule, open no picker, write no turn field, and leave `data.json` untouched
  (REQ-TC-016/022/023).
- A test asserts the PLAN special-case renders from the P4 plan state (display only, NG6).

## References

- PRD-TC-001 — REQ-TC-003/016/019/021/022; NFR-TC-010/011; G3 + counter-metric.
- `specs/toolbar-controls/design.md` Part C (C.4) + Part A (A.2).
- **ADR-TC-004** (the `ToolbarCatalogPort` that supplies the descriptors this gate reads),
  **ADR-CA-003 §2** (the P5 `supportsBrowserSelection` honest-defer pattern this mirrors),
  ADR-CP-004 (the P4 capability flags + plan state), ADR-008 (one port per consumer; capability
  reporting stays on the runtime).
- Claudian reference: `core/providers/types.ts` (`ProviderCapabilities.supportsMcpTools` /
  `reasoningControl`), `features/chat/ui/InputToolbar.ts` (`ServiceTierToggle`/`McpServerSelector`
  auto-hide; `PermissionToggle` PLAN special-case).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
