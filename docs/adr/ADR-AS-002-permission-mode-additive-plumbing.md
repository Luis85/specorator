---
id: ADR-AS-002
title: Thread the live three-mode permission value via an additive ChatRuntimeQueryOptions field + a runtime setMode seam, expanding the P6 ToolbarCapabilities
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-26
accepted: 2026-05-26    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
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
tags: [architecture, permissions, runtime, toolbar, claudian-reboot, P7]
---

# ADR-AS-002 — Permission-mode plumbing (additive)

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-AS-002** + **CLAR-AS-003**
(the per-tab-mode half). Unblocks `PRD-AS-001` (REQ-AS-001..006, REQ-AS-024) and supersedes the P6
honest-defer permission seam (REQ-TC-015/016). Additive only — P0–P6 byte-identical (NFR-AS-001).

## Context

Claudian's permission-mode model is **exactly three modes**: `PermissionMode = 'yolo' | 'plan' |
'normal'` (`core/types/settings.ts:76`), persisted per-provider as `savedProviderPermissionMode`
(`:136`). Each maps to a Claude Agent-SDK `PermissionMode` via `resolveSDKPermissionMode` and is
synced session-scoped on plan exit (`ClaudeApprovalHandler.ts:63-71` — the `{ type:'setMode', mode,
destination:'session' }` permission update).

P6 shipped the permission toggle as an **honest-defer seam** (`PermissionToggle.vue`): visible-disabled
with a "permissions arrive in a later release" notice, and a two-state display union
`ToolbarCapabilities.permissionMode: 'default' | 'plan'` (`ChatRuntimePort.ts:51`). P7 must make the
toggle **live**: the three modes thread into the runtime, the toggle sets and reflects the active
mode, and the mode determines whether actions need approval (notably plan mode gating edits).

Forces:

- **Additivity (NFR-AS-001).** The P0–P6 `ChatRuntimeQueryOptions` members (`model`, `forceColdStart`,
  `appendSystemPrompt`, and the P6 `mode`/`reasoning`/`serviceTier`) and the P4 inline DTOs must stay
  byte-identical except for additive optionals. With no rule + `normal` mode, P0–P6 must be
  byte-identical (REQ-AS-052).
- **Provider-agnostic UI (NG6, REQ-AS-003).** The exact Claudian→SDK string mapping
  (`yolo`↔`bypassPermissions`, `plan`↔`plan`, `normal`↔`default`) and the `setMode` destination must
  stay in **provider infrastructure** (the Claude runtime), never a `providerId` branch in the UI.
  Codex/Opencode permission models are P9.
- **Per-tab parity (CLAR-AS-003).** Claudian's mode is per-provider/per-tab; the P6 control state is
  already per-tab (`TabControls` on `TabState`, ADR-TC-001). The mode is a per-tab control.
- **Two distinct mode roles.** (a) The *applied* mode for a turn (gates approval) — needs to thread
  to the runtime additively, like the P6 fold. (b) The *display/PLAN* mode the toggle reflects — the
  P6 `ToolbarCapabilities.permissionMode` two-state union must widen to the live three-mode value.

## Decision

We thread the live three-mode value through **two additive seams**, both provider-agnostic, both
mirroring the P6 toolbar fold/capability pattern.

### 1. The applied mode — additive `ChatRuntimeQueryOptions.permissionMode`

Add one optional field to the existing `ChatRuntimeQueryOptions` (the P6 fold target), and one
member to the per-tab `TabControls`:

```ts
// src/domain/chat/PermissionMode.ts — new
export type PermissionMode = 'normal' | 'plan' | 'yolo';

// src/domain/chat/ChatTurn.ts — APPENDED after serviceTier (additive; P0–P6 byte-identical)
export interface ChatRuntimeQueryOptions {
  // ... P0–P6 members unchanged ...
  permissionMode?: PermissionMode;  // P7 additive (ADR-AS-002) — absent ⇒ runtime's default ('normal')
}

// src/domain/chat/toolbar/TabControls.ts — APPENDED (additive)
export interface TabControls {
  // ... model/mode/reasoning/serviceTier unchanged ...
  permissionMode?: PermissionMode;  // permission toggle → queryOptions.permissionMode (REQ-AS-002)
}
```

`foldControlOptions` (the P6 pure fold) grows one guarded clause: write `permissionMode` only when
`controls.permissionMode` is present and **not** `'normal'` (the default), so an untouched toggle
yields a byte-identical turn (NFR-AS-001, REQ-AS-052). This mirrors exactly how P6 folds
`mode`/`reasoning`/`serviceTier`. The seam stays additive: a turn with no toolbar interaction carries
no `permissionMode` field.

> **`permissionMode` is a domain field, not a toolbar-catalog field.** Unlike `mode`/`serviceTier`
> (whose option lists come from the `ToolbarCatalogPort`), the three permission modes are an
> **invariant** of the Claudian model (CLAR-AS-002), not a per-provider catalog list. The toggle
> offers the fixed three modes; the catalog is not consulted for them.

### 2. The display mode — expand `ToolbarCapabilities.permissionMode` to the live three-mode value

The P6 two-state display union widens to the three-mode value (the only non-additive *type* change —
a union **widening**, which is byte-compatible for all existing P6 callers that only read
`'default' | 'plan'` because `'default'` is renamed-equivalent to `'normal'`):

```ts
// src/domain/ports/ChatRuntimePort.ts — ToolbarCapabilities (P6) expanded (ADR-AS-002 §2)
export interface ToolbarCapabilities {
  // ... supportsMcpTools / reasoningControl / hasServiceTier / hasModeToggle unchanged ...
  readonly permissionMode: PermissionMode;   // was 'default' | 'plan'; now 'normal' | 'plan' | 'yolo'
}
```

The runtime reports the **active tab's** permission mode through the existing `getToolbarCapabilities`
seam read OR — preferred for the live value — the surface reads the active tab's `controls.permissionMode`
(defaulting to `'normal'`) and feeds the toggle view-model. The PLAN display special-case (P6
`buildPermission`) is preserved: `plan` ⇒ the PLAN label; `normal`/`yolo` ⇒ the live toggle. The P6
`buildToolbarViewModel.PermissionWidgetVm` drops `deferred: true` and gains the active three-mode value
+ `enabled: true` (the toggle is now live, REQ-AS-001/003).

### 3. The SDK mapping + plan-exit sync stay in the Claude runtime (no UI branch)

The Claude runtime infrastructure owns:
- `resolveSDKPermissionMode(mode)` — `yolo`→`bypassPermissions`, `plan`→`plan`, `normal`→`default`
  (parity with `ClaudeApprovalHandler`/`resolveSDKPermissionMode`).
- The plan-exit `setMode` session sync — on an `ExitPlanModeDecision { kind:'implement' }`, the
  runtime emits the SDK `{ type:'setMode', mode: sdkMode, destination:'session' }` permission update
  (`ClaudeApprovalHandler.ts:63-71`) so the resolved mode applies session-scoped (REQ-AS-005).

The runtime reads the applied `permissionMode` from `queryOptions` (the fold) — there is **no
`providerId` branch** anywhere in the UI or application layer (NG6, REQ-AS-003). A non-Claude
runtime simply ignores the field until P9 backs it.

## Considered options

### Option A — Additive `ChatRuntimeQueryOptions.permissionMode` + widened `ToolbarCapabilities` + runtime-owned SDK mapping (chosen)

- Pros: mirrors the P6 fold (one additive optional, guarded) so a no-interaction turn is byte-identical
  (NFR-AS-001); per-tab via `TabControls` (parity, CLAR-AS-003); the SDK mapping + setMode sync stay in
  provider infra (NG6, no UI branch); reuses the P6 `foldControlOptions` + view-model machinery.
- Cons: a union **widening** of `ToolbarCapabilities.permissionMode` (`'default'`→`'normal'`) touches
  the P6 type — but it is additive in behaviour and the P6 callers read it only for the PLAN
  special-case (accepted; the rename `'default'`→`'normal'` aligns with Claudian's own vocabulary).

### Option B — A separate permission-mode store on the tab/session model

- Pros: isolates mode from the toolbar fold.
- Cons: duplicates the per-tab control mechanism the P6 `TabControls` already provides; a second
  fold/seam to maintain. Rejected — the P6 control bag is the right home (CLAR-AS-002 (b) rejected).

### Option C — A dedicated `setPermissionMode` runtime setter (mirroring claudian's setMode callback)

- Pros: closer to Claudian's `setPermissionModeSyncCallback`.
- Cons: the applied mode is naturally a per-turn query option (it gates *that turn's* approvals), so a
  query-option field is the additive, byte-identical seam; the plan-exit `setMode` sync (§3) is the
  one genuine in-flight setter and it lives in the runtime, not the UI. A standalone UI-facing setter
  would add a member to `ChatRuntimePort` that the fold already covers. Rejected as the primary seam;
  the session-sync setMode is internal to the runtime.

## Consequences

### Positive

- The three modes are live and per-tab; the P6 toggle becomes a real control (REQ-AS-001/002/003/006).
- Additive — a no-toolbar-interaction `normal`-mode turn is byte-identical to P6 (NFR-AS-001,
  REQ-AS-052).
- The SDK mapping + plan-exit setMode sync stay in the Claude runtime; the UI never branches on
  `providerId` (NG6, REQ-AS-003).
- Reuses the P6 fold (`foldControlOptions`) + view-model (`buildToolbarViewModel`) — minimal new
  machinery.

### Negative

- `ToolbarCapabilities.permissionMode` type widens (`'default'`→`'normal'`, adds `'yolo'`); P6 call
  sites that switch on it must handle the third value (the view-model + `PermissionToggle.vue`,
  expanded in P7 anyway).

### Neutral

- Codex/Opencode permission modes stay out (P9, NG6); the seam is provider-agnostic by construction so
  P9 backs them additively.
- `serviceTier`/`mcp`/`external` seams from P6 are untouched.

## Compliance

- **Additivity** — a test asserts a `normal`-mode turn with no toolbar interaction folds no
  `permissionMode` and serialises byte-identically to a P6 turn (TEST-AS-052, NFR-AS-001).
- **No provider branch** — ESLint/review confirms no `providerId` literal gates permission-mode
  behaviour in `src/ui/**` or `src/application/**` (REQ-AS-003).
- **SDK mapping location** — `resolveSDKPermissionMode` + the plan-exit setMode live only in the
  Claude runtime infrastructure (`src/infrastructure/**`), never in domain/application/ui.
- **Per-tab** — switching tabs reflects the switched-to tab's `controls.permissionMode` on the toggle
  (TEST-AS-006).

## References

- PRD-AS-001 — REQ-AS-001..006, REQ-AS-024; NFR-AS-001/006; CLAR-AS-002/003.
- DESIGN-AS-001 (`specs/approvals-security/design.md`) — Part C §C.2/§C.5/§C.6; Part A §A.1/§A.4.
- ADR-TC-002 (`docs/adr/ADR-TC-002-...`) — the additive `ChatRuntimeQueryOptions` fold this mirrors.
- ADR-TC-001 — the per-tab `TabControls` bag this extends.
- ADR-TC-003 — the `getToolbarCapabilities` seam whose `permissionMode` field this widens.
- claudian-main: `core/types/settings.ts:76` (the three modes), `providers/claude/runtime/
  ClaudeApprovalHandler.ts:63-71` (plan-exit setMode session sync), `resolveSDKPermissionMode`.
- ADR-AS-001 (rule store) / ADR-AS-003 (decision flow) — companion P7 ADRs.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
