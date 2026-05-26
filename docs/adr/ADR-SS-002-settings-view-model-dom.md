---
id: ADR-SS-002
title: Drive the settings shell from a pure buildSettingsViewModel over the existing P6–P9 ports (capability-gated, no switch(providerId)); keep the Obsidian Setting-API DOM (not Vue), coverage-excluded
status: accepted
date: 2026-05-26
deciders:
  - architect (autonomous-drive, /goal 2026-05-26)
consulted:
  - pm (PRD-SS-001, CLAR-SS-002)
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [settings-shell, P10, architecture, view-model, capability-gating, dom, claudian-reboot]
---

# ADR-SS-002 — Drive the settings shell from a pure `buildSettingsViewModel`; keep the Obsidian `Setting`-API DOM (not Vue)

## Status

Accepted — P10 (settings-shell). Ratifies CLAR-SS-002 (settings tab DOM vs Vue) and realises NFR-SS-003
(tested weight in a pure view-model), NFR-SS-008 (no `switch (providerId)`), NFR-SS-011 (coverage with
the DOM excluded). Extends the data-driven, capability-gated discipline of ADR-PV-001 into the settings
surface.

## Context

P10 grows the slim P0 `PluginSettingTab` (`src/plugin/settings.ts` — a module-schema `Setting`-API loop)
into a per-provider settings shell that **surfaces** the seams P6–P9 already built: provider enable/order
(`ProviderRegistryPort`), per-provider API key (`SecretStorePort`), default model (`ToolbarCatalogPort`),
MCP servers (`McpConfigStorePort`), approval rules + permission mode (`ApprovalRuleStorePort`), plus the
new env subsystem (ADR-SS-001) and read-only agent/skill/subagent/slash surfacing.

Two architecture forces:

1. **The DOM lives in `src/plugin/**` and is coverage-excluded** (the one sanctioned place a
   `PluginSettingTab` uses the Obsidian `Setting` API — epic constraint). So the *tested* logic — which
   sections appear, in what order, which controls are visible/enabled, what each control's current value
   and persistence target is — must live **outside** the DOM, in a pure unit-testable layer. P0–P9 set
   this precedent (`buildProviderViewModel`, `buildToolbarViewModel`, the `coerce*` helpers).
2. **Capability gating must be data, never a provider-id branch** (NFR-SS-008, the NFR-PV-014 discipline,
   ADR-PV-001): section/control visibility comes from the frozen `ProviderCapabilities` bag, never
   `switch (providerId)`.

CLAR-SS-002 also asks: does the settings tab stay Obsidian `Setting`-API DOM, or mount Vue? The P0 reboot
chose `Setting`-API DOM; the backend audit once floated Vue.

## Decision

**We compute the entire settings-shell structure in a pure, Obsidian-free `buildSettingsViewModel`, and
keep the `PluginSettingTab` as Obsidian `Setting`-API DOM (NOT Vue), coverage-excluded.**

1. **The pure view-model (application/domain, tested):**

   ```ts
   // src/application/settings/buildSettingsViewModel.ts — PURE, no obsidian/node/Vue, total
   export function buildSettingsViewModel(input: {
     settings: PluginSettings;
     registry: ProviderRegistryPort;          // listEnabledProviders + getCapabilities (pure reads)
     getCatalog: (id: ProviderId) => ToolbarCatalog;   // ToolbarCatalogPort (model lists)
     secretKeysSet: ReadonlySet<string>;       // from SecretStorePort.listKeys() (keys only, never values)
     secretStorageAvailable: boolean;          // SecretStorePort.isAvailable()
     // read-only surfacing inputs (agents/skills/subagents/slash) + mcp/approval availability flags
   }): SettingsViewModel;

   export interface SettingsViewModel {
     readonly sections: readonly SettingsSection[];   // ordered: shared (core) first, then enabled
                                                       // providers in blank-tab order
   }
   export interface SettingsSection {
     readonly key: 'shared' | `provider:${ProviderId}`;
     readonly titleKey: string;                        // i18n key, never a literal
     readonly controls: readonly SettingsControl[];    // only the controls this section SUPPORTS
   }
   // SettingsControl is a discriminated union: coreField | providerToggle | apiKeyField
   //   (with set/unset + disabled-when-unavailable) | modelPicker (+ empty-list flag) |
   //   envScopeEditor | envSnippetList | agentList (read-only) | slashList (read-only) |
   //   mcpManager | mcpDocNote | approvalRules | permissionMode | keyboardNav | cliPath.
   ```

   The view-model is **deterministic** (same input → same structure, REQ-SS-002) and **serialisable**
   (no DOM/Obsidian reference). Visibility is decided strictly by the capability bag + the registry's
   enabled list — there is **no `switch (providerId)`** anywhere in it (REQ-SS-010, NFR-SS-008). Examples:
   `apiKeyField` appears iff `capabilities.needsApiKey` (REQ-SS-011); `mcpManager` iff
   `supportsMcpTools`, else `mcpDocNote` for an out-of-band provider (REQ-SS-080/081); `slashList` iff
   `supportsProviderCommands` (REQ-SS-040); a section per `registry.listEnabledProviders(settings)`
   (REQ-SS-001), Claude always present (REQ-SS-004), the shared/core section always first (REQ-SS-005).

2. **The DOM is the existing `Setting`-API render in `src/plugin/settings.ts`** (CLAR-SS-002 — **DOM, not
   Vue**). `display()` walks the view-model and renders each `SettingsControl` via the Obsidian `Setting`
   API / `createEl` / `setText` — no `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no
   `window.confirm`/`alert`/`prompt` (confirmations — e.g. delete-snippet — use an Obsidian `Modal`
   subclass) (REQ-SS-095, NFR-SS-010). Each control's `onChange` calls the matching application use case
   /port (`SettingsPort` for device-local prefs, `SecretStorePort` for keys, `EnvSnippetService` for
   snippets, `McpConfigStorePort`/`ApprovalRuleStorePort` for their seams) and surfaces failures as a
   `Result.err` notice (REQ-SS-094, NFR-SS-006). The DOM is **coverage-excluded** `src/plugin/**`; manual
   real-Obsidian legs accumulate for the final epic gate (NFR-SS-011).

3. **Keyboard navigation (WCAG 2.2 AA, REQ-SS-072, NFR-SS-007):** the Obsidian `Setting` API renders
   native, focusable controls (toggles, dropdowns, text inputs, buttons) in DOM order, which gives a
   logical tab order + visible focus + key activation for free. The view-model's section/control ordering
   *is* the tab order. Modal flows (env-snippet edit, delete confirm) trap focus per the Obsidian `Modal`
   convention and restore it on close. The remappable message-pane nav keys (REQ-SS-070/071) are a
   device-local pref edited through the pure `parseNavMappings` validator (regrown from claudian) — not
   the settings-tab's own keyboard model.

4. **Sections surface their existing port (no new machinery, REQ-SS-001/003/012/020/080/082):** each
   control type reads/writes through the port that already owns its data — the view-model only *describes*
   the control; the DOM `onChange` invokes the port/use case. No section re-implements persistence.

## Considered options

### Option A — Mount a Vue settings tree in the tab

- Pros: reuse the Vue component + `data-testid` PageObject test pattern; richer interactivity.
- Cons: diverges from the P0 reboot decision and the epic constraint that the `PluginSettingTab` is the
  one sanctioned `Setting`-API DOM surface; Vue-in-settings adds a mount/teardown lifecycle inside
  Obsidian's settings modal; the `Setting` API already gives native a11y + the Obsidian look. NG2
  explicitly excludes a Vue settings tree. Rejected (CLAR-SS-002).

### Option B — Logic inline in the DOM `display()` (no view-model)

- Pros: less indirection; one file.
- Cons: the section/visibility/ordering logic would live in coverage-excluded `src/plugin/**` — untested
  (fails NFR-SS-003/011); easy to slip a `switch (providerId)` into the DOM (fails NFR-SS-008). Rejected.

### Option C (chosen) — Pure `buildSettingsViewModel` + the `Setting`-API DOM, coverage-excluded

- Pros: the structural logic is pure, deterministic, fully unit-tested (NFR-SS-003/011); capability gating
  is data, lint-checkable for no `switch (providerId)` (NFR-SS-008); the DOM stays the existing sanctioned
  `Setting`-API pattern with native a11y (CLAR-SS-002, REQ-SS-072); Claude-only stays additive (the
  view-model yields the core section + one Claude section, REQ-SS-093). Mirrors `buildProviderViewModel`
  (ADR-PV-001 §4).
- Cons: a thin descriptor layer between data and DOM. Accepted — it is the testable seam.

## Consequences

### Positive

- Tested weight in a pure layer (NFR-SS-003/011); the DOM render is a thin, coverage-excluded walk.
- Capability gating is data, never an id branch (NFR-SS-008, REQ-SS-010); lint/grep-checkable.
- Additive: Claude-only yields the core section + a Claude section, the P0 core controls unchanged
  (REQ-SS-005/093, NFR-SS-001).
- Native keyboard a11y from the `Setting` API; the view-model order is the tab order (REQ-SS-072).
- No Vue in settings (NG2); the safe-DOM + no-blocking-dialog rules hold (REQ-SS-095, NFR-SS-010).

### Negative

- The view-model must enumerate every control type as a discriminated union; adding a control means
  extending the union + the DOM switch. Bounded — the control set is the P6–P9 seams + the env subsystem.

### Neutral

- The exact `SettingsControl` union members + their value/persistence wiring are pinned in `spec.md`.

## Compliance

- **No `switch (providerId)` (NFR-SS-008):** lint/grep the view-model + the DOM render; visibility comes
  from the capability bag + registry list. Verified for all three providers (release criterion).
- **Coverage split (NFR-SS-011):** `buildSettingsViewModel` + the env service + the codecs are
  coverage-included and meet 80/70/80/80; `src/plugin/settings.ts` DOM is coverage-excluded with manual
  legs.
- **DOM safety (REQ-SS-095, NFR-SS-010):** no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`; no
  `window.confirm`/`alert`/`prompt` (ESLint `no-restricted-properties`/`no-restricted-globals` already
  enforce this project-wide).
- **No new port:** the shell composes the existing P6–P9 ports + the ADR-SS-001 env service; no aggregate
  `usePorts` (ADR-008).
- **Additivity (NFR-SS-001):** a Claude-only byte-identical baseline is captured on `next` before
  implementation (paired baseline-capture task).

## References

- PRD-SS-001 (`specs/settings-shell/requirements.md`) — REQ-SS-001/002/003/004/005, 010/011/012/014/015,
  020/021/022, 030/031, 040/041, 072, 080/081/082/083, 093/094/095; NFR-SS-001/003/007/008/010/011;
  CLAR-SS-002/003.
- DESIGN-SS-001 (`specs/settings-shell/design.md`) Parts A/B/C.
- ADR-PV-001 — the data-driven, capability-gated routing seam this extends (§4 `buildProviderViewModel`).
- ADR-SS-001 — the env-snippet store the env-scope/snippet controls surface.
- ADR-PSR-008 — the slim P0 `PluginSettingTab` (`src/plugin/settings.ts`) this grows.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
