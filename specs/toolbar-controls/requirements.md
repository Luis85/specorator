---
id: PRD-TC-001
title: Toolbar & Controls (Claudian Reboot P6)
stage: requirements
feature: toolbar-controls
status: accepted     # autonomous drive — no human gate; CLAR-TC-001..003 resolved by PM recommendation, to be ratified by the P6 architect ADRs
owner: pm
inputs:
  - CHARTER-CLAUDIAN-REBOOT §3.5 / §3.10 / §4 (P6) / §5 / §6
  - specs/claudian-reboot/claudian-audit-frontend.md §3.5
  - specs/claudian-reboot/claudian-audit-backend.md (provider capabilities, ProviderUiConfig)
  - D:\Projects\claudian-main (read-only structural + visual reference, MIT)
  - P1–P5 on `next`: ChatTurn.ts (ChatRuntimeQueryOptions), UsageInfo.ts, ChatRuntimePort.ts (RuntimeCapabilities), ChatComposer.vue (P5 context-bar slot pattern)
created: 2026-05-25
updated: 2026-05-25
epic: claudian-reboot
phase: P6
area: TC
integration_branch: next
---

# PRD — Toolbar & Controls (Claudian Reboot P6)

## Summary

P6 adds the **input toolbar control strip** to the P1–P5 composer — the row of
selectors and toggles that Claudian lays into `.claudian-input-toolbar` at the bottom
of the composer (`features/chat/ui/InputToolbar.ts`). Eight widgets in charter §3.5:
**model selector · mode selector · permission toggle · thinking selector · service-tier
toggle · MCP selector · external-context control · usage/context meter.** Each widget
renders the current per-tab control state, and — for the widgets whose backing the
runtime already supports — threads the user's choice into the **next turn's**
`ChatRuntimeQueryOptions` (additive fields only; the P0–P5 members stay byte-identical).

The defining work of P6 is an **honest scoping decision per widget**. Some widgets are
**fully backed** in P6 because the Claude runtime already accepts the per-turn option
(model, mode, thinking) or the data already streams in (usage/context meter). Others are
**capability-gated seams** whose backing lands in a later phase — **permission rules →
P7**, **MCP client/servers → P8**, **service-tier provider catalog → P9**,
**external-context picker → a later phase** — and these MUST render as an honest,
disabled/"coming later" affordance, never a broken or silently-dropped control. This
mirrors the P5 composer's `supportsBrowserSelection` capability-gate pattern
(`ChatComposer.vue:64`): the affordance exists, the gate is explicit, and the strip
degrades gracefully.

This is a **parity PRD**: each functional requirement maps 1:1 to a Claudian source path
(the behaviour spec) and a Given/When/Then acceptance (the test seed), per charter §5.

### Per-widget scoping decision (the central P6 call)

| Widget | P6 classification | Backing phase | Additive `ChatRuntimeQueryOptions` field |
|---|---|---|---|
| **Model selector** | **Backed** | P6 (Claude catalog; P9 multi-provider) | `model?` — **already exists** (`ChatTurn.ts:50`); no new field |
| **Mode selector** | **Backed** | P6 (Claude two-option mode) | `mode?: string` — **new additive** |
| **Thinking selector** | **Backed** | P6 (effort/budget from provider UI config) | `reasoning?: ReasoningChoice` — **new additive** |
| **Usage / context meter** | **Backed** | P6 (reads `UsageInfo` from the stream) | none — read-only, sourced from `StreamChunk` `usage` |
| **Service-tier toggle** | **Seam (capability-gated; hidden for Claude)** | P9 (Codex fast-mode catalog) | `serviceTier?: string` — **new additive, declared-now/emitted-later** |
| **Permission toggle** | **Seam (capability-gated; honest-defer)** | P7 (approvals + rules) | none in P6 (rule persistence is P7) |
| **MCP selector** | **Seam (capability-gated; honest-defer)** | P8 (MCP client/servers) | `enabledMcpServers?` — **stays EXCLUDED** until P8 (NG-MCP) |
| **External-context control** | **Seam (deferred control; honest-defer)** | later phase (FilePickerPort + persistence) | `externalContextPaths?` — **stays EXCLUDED** until then (NG3 continues) |

> "Backed" = the widget changes the next turn's behaviour through an additive
> `ChatRuntimeQueryOptions` field (or, for the meter, reflects streamed data) in P6.
> "Seam" = the widget renders honestly (visible-and-disabled with a "coming in Pn"
> affordance, or hidden when the capability flag is false) and its backing arrives in the
> named phase. **No widget is silently dropped** (charter §3 invariant).

## Goals

- G1 — Reach Claudian §3.5 control-strip **layout + affordance** parity on the rebuilt
  composer: all eight widgets present, placed, and styled through `--sp-*` tokens, with
  the same states (current value, open/closed, active, disabled) a Claudian user expects.
- G2 — Thread the **backed** widgets' choices into the next turn **additively** — the
  P0–P5 `ChatRuntimeQueryOptions` members (`model`, `forceColdStart`, `appendSystemPrompt`)
  stay byte-identical; a turn submitted with no toolbar interaction serialises exactly as
  it does today (the composer is unchanged when the toolbar is absent — G5).
- G3 — Render the **seam** widgets honestly: capability-gated visibility driven by
  provider/runtime capability flags (never a `providerId` branch), and an explicit
  disabled/"coming in P7/P8/P9" affordance for the deferred ones — never a control that
  appears live but does nothing.
- G4 — Surface the **usage/context meter** from the stream's `UsageInfo`
  (`UsageInfo.ts:12`) + the context window — the P1 meter seam (`REQ-CC-005a`) is realised
  here — including the >80% warning state and the `/compact` suggestion tooltip.
- G5 — Keep the strip **additive and composer-neutral**: the P1–P5 composer renders
  identically when the toolbar prop is absent or a widget is seam-only; every
  Obsidian-coupled need (folder picker, MCP data) stays behind a port/seam so the Vue
  layer never imports `obsidian`.

## Non-goals

- NG1 — **Approval rules + permission persistence** (ApprovalManager, rule matching,
  session-vs-project rule destination). → **P7**. P6 renders the permission toggle's UI
  + reads its display state, but does not persist rules or gate tool calls.
- NG2 — **MCP client / servers / config / tester** (in-app MCP). → **P8**. P6 renders the
  MCP selector shell honestly; it lists no live servers and toggles nothing until P8.
- NG3 — **External-context paths backing** — the native folder picker, path validation,
  persist/lock, and the `externalContextPaths` request field. The control is deferred (a
  later phase introduces `FilePickerPort` + persistence). `externalContextPaths?` stays
  EXCLUDED from `ChatRuntimeQueryOptions` (continuing the P5 NG3 exclusion).
- NG4 — **Codex / Opencode providers + their model/mode/reasoning/service-tier catalogs.**
  → **P9**. P6 wires the **Claude** catalog only and builds the capability-driven seams;
  the service-tier toggle (Codex fast-mode) is hidden for Claude.
- NG5 — **Settings UX** for any toolbar control (model defaults, per-model context limits,
  env-derived custom models, keyboard-nav prefs). → **P10**. P6 reads provider UI config as
  a load-or-default; it does not build a settings surface.
- NG6 — **Plan mode `Shift+Tab` + the inline plan/exit-plan/ask-user blocks.** These
  shipped in **P4** (charter §3.3). P6 does not re-spec plan mode; the permission toggle's
  PLAN special-case display reflects the P4 plan state, it does not own it.
- NG7 — **The `@mention` ↔ MCP-selector sync** (mentioning a server enabling it in the
  toolbar). The `@mention` of files shipped in P4; the MCP half is P8 (NG2). No cross-link
  is wired in P6.
- NG8 — **i18n of all 10 locales** for new P6 strings beyond the project default-locale
  baseline. → **P11**. New strings go through the existing `TranslationPort` with English
  keys.
- NG9 — **New tab / provider-menu / blank-tab provider ordering** (the multi-provider
  new-tab affordance). → **P9** (single provider in P6). The model selector lists the
  active provider's models only.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| **Note-taker / knowledge worker** (primary Specorator + Claudian user) | Pick a model, tune thinking effort, switch mode, and watch the context fill up — all without leaving the composer | The control strip is how the user steers each turn; it is the visible "cockpit" of the chat |
| **Returning Claudian user** | Recognise the model/mode/thinking/service-tier/MCP/external selectors and the arc-gauge usage meter as "the same product" | Charter §1 binding goal — a side-by-side reads as the same product |
| **Power user approaching the context limit** | See the meter go warning-red past 80% and get the `/compact` hint before the turn fails | The meter is the only pre-emptive signal that a turn is about to overflow the window |
| **Architect (downstream, P6 design)** | A clear backed-vs-seam classification + the additive `ChatRuntimeQueryOptions` fields each backed widget implies, decided in ADRs | P6 is autonomous-drive; the PRD must hand the architect well-framed seam-vs-backed calls, not guesses |
| **Reviewer / brand-reviewer (P6 review)** | Per-widget parity checklist mapped to Claudian source + `--sp-*` tokens + the capability-gate honesty check | Charter §5 parity acceptance method |
| **Accessibility-dependent user** | Keyboard-operable selectors (open on click/focus, arrow-navigate, Enter-select, Esc-close) and toggles, with a non-hover open path | Claudian opens several selectors on **hover only**; WCAG 2.2 AA requires a keyboard/focus open path |

## Jobs to be done

- When **a task needs a stronger or cheaper model**, I want to **pick the model from a
  selector on the composer**, so I can **steer the next turn without retyping anything**.
- When **I want the assistant to reason harder (or faster)**, I want to **set the thinking
  effort / budget from the toolbar**, so I can **trade latency for depth per turn**.
- When **I want the assistant to edit freely vs ask first**, I want to **flip the mode
  toggle**, so I can **control how autonomous the turn is**.
- When **a long conversation is filling the context window**, I want to **see how full it
  is and get a warning before it overflows**, so I can **compact or start fresh in time**.
- When **a control isn't available yet (permissions, MCP, external folders)**, I want to
  **see an honest "coming later" affordance rather than a dead button**, so I can **trust
  that the controls that look live actually work**.

## Functional requirements (EARS)

> EARS notation (`docs/ears-notation.md`). One requirement per entry. Each maps 1:1 to a
> Claudian source path (behaviour spec) + a Given/When/Then acceptance (test seed) +
> a future test id `TEST-TC-NNN`. Patterns: ubiquitous · event-driven (WHEN) ·
> state-driven (WHILE) · optional-feature (WHERE) · unwanted-behaviour (IF/THEN).
> "the plugin" = the Specorator agent surface. "the active tab" = the focused chat thread.

### Cross-cutting strip behaviour

Claudian source: `features/chat/ui/InputToolbar.ts` (the `.claudian-input-toolbar`
flex row + per-widget `updateDisplay()`/`renderOptions()`), `core/providers/types.ts`
(`ProviderCapabilities`, `ProviderChatUIConfig`).

---

### REQ-TC-001 — Render the toolbar control strip on the composer

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL render an input toolbar control strip on the composer
  containing the model selector, mode selector, permission toggle, thinking selector,
  service-tier toggle, MCP selector, external-context control, and usage/context meter,
  each placed per the Claudian layout.*
- **Acceptance:**
  - Given the chat surface is open with a Claude tab active
  - When the composer renders
  - Then the toolbar strip is present and contains each of the eight widget regions in the
    Claudian order (model/mode/permission/thinking/service-tier/MCP/external grouped at the
    start, usage meter pinned at the end), each addressable by a `data-testid`
- **Priority:** must
- **Satisfies:** CHARTER §3.5 / §3.10; claudian `InputToolbar.ts` (`.claudian-input-toolbar`)
- **Test:** TEST-TC-001

### REQ-TC-002 — The strip is additive — the composer is unchanged without it

- **Pattern:** state-driven
- **Statement:** *WHILE no toolbar strip is mounted on the composer, the plugin SHALL render
  and behave the composer exactly as the P1–P5 composer does, and SHALL submit turns with the
  P0–P5 `ChatRuntimeQueryOptions` members unchanged.*
- **Acceptance:**
  - Given the composer is rendered without the toolbar prop (e.g. the P1 send path)
  - When the user submits a turn
  - Then the submitted query options contain only the previously-set members and the composer
    DOM/keyboard behaviour matches the P5 component test baseline
- **Priority:** must
- **Satisfies:** CHARTER §4 (additive vertical slice); mirrors `ChatComposer.vue:43-44` (context-bar absent → renders as P4); G5
- **Test:** TEST-TC-002

### REQ-TC-003 — Widget visibility is driven by capability flags, not a provider-id branch

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL decide each widget's visibility and enabled state from the
  active runtime's capability flags and provider UI config, and SHALL NOT branch widget
  presence on a literal provider id.*
- **Acceptance:**
  - Given the active tab runs the Claude provider
  - When the strip computes which widgets to show
  - Then the decision reads capability flags / UI-config descriptors (e.g. reasoning control,
    toggle descriptors, `supportsMcpTools`) and no `if (providerId === 'claude')` branch exists
    in the strip component or its view-model
- **Priority:** must
- **Satisfies:** CHARTER §3.6 (capability-driven UI); claudian `ProviderCapabilities` gating; mirrors REQ-TS-026 / REQ-CA-028 no-provider-branch rule
- **Test:** TEST-TC-003

### REQ-TC-004 — Backed widgets thread their choice into the next turn additively

- **Pattern:** event-driven
- **Statement:** *WHEN the user submits a turn after changing a backed toolbar widget, the
  plugin SHALL include that widget's current value in the turn's `ChatRuntimeQueryOptions`
  via that widget's additive field, leaving every other option member unchanged.*
- **Acceptance:**
  - Given the user has set the model, the mode, and the thinking choice on the active tab
  - When the user submits a turn
  - Then the query options carry `model`, `mode`, and `reasoning` set to those values and no
    other member is added or mutated
- **Priority:** must
- **Satisfies:** CHARTER §3.5; `ChatRuntimeQueryOptions` additive fields (`ChatTurn.ts:48`); G2
- **Test:** TEST-TC-004
- **Note:** the exact additive field names/shapes (`mode?`, `reasoning?`, `serviceTier?`) are **CLAR-TC-001**.

---

### Widget 1 — Model selector  (BACKED · P6)

Claudian source: `InputToolbar.ts` `ModelSelector`; `toolbar/model-selector.css`;
`ProviderChatUIConfig` model list (`providers/<id>/ui/<Id>ChatUIConfig.ts`).

---

### REQ-TC-010 — Render the model selector with the current model

- **Pattern:** state-driven
- **Statement:** *WHILE the active tab has a selected model, the plugin SHALL render the model
  selector showing that model's display label as the current value.*
- **Acceptance:**
  - Given the active tab's selected model is the provider's default
  - When the selector renders
  - Then the selector button shows that model's display label
- **Priority:** must
- **Satisfies:** claudian `ModelSelector.updateDisplay` (current label, brand-colored)
- **Test:** TEST-TC-010

### REQ-TC-011 — Open the model selector and list available models

- **Pattern:** event-driven
- **Statement:** *WHEN the user opens the model selector, the plugin SHALL present the active
  provider's available models as a selectable list, grouped where the provider's UI config
  defines groups, with the current model marked selected.*
- **Acceptance:**
  - Given the provider exposes more than one model
  - When the user opens the selector (click or keyboard/focus — REQ-TC-040)
  - Then a list of the provider's models is shown, grouped per the UI config, with the current
    model visually marked selected
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ModelSelector.renderOptions` (grouped, reversed-recent, selected highlight)
- **Test:** TEST-TC-011

### REQ-TC-012 — Selecting a model updates the active tab's model for the next turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects a model from the selector, the plugin SHALL set that
  model as the active tab's selected model so the next turn's `ChatRuntimeQueryOptions.model`
  carries it.*
- **Acceptance:**
  - Given the selector is open and a different model is offered
  - When the user selects it
  - Then the selector's current value updates to that model and the next submitted turn's
    `ChatRuntimeQueryOptions.model` equals that model id
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ModelSelector` change handler; `ChatRuntimeQueryOptions.model` (`ChatTurn.ts:50`, already exists)
- **Test:** TEST-TC-012

---

### Widget 2 — Mode selector  (BACKED · P6)

Claudian source: `InputToolbar.ts` `ModeSelector` (two-option toggle + `SpToggleSwitch`);
`toolbar/mode-selector.css`; provider mode descriptor in `ProviderChatUIConfig`.

---

### REQ-TC-013 — Render the mode selector with the current mode

- **Pattern:** optional-feature
- **Statement:** *WHERE the active provider's UI config defines a mode toggle, the plugin SHALL
  render the mode selector showing the current mode's label and toggle state.*
- **Acceptance:**
  - Given the provider's UI config supplies a two-option mode descriptor with the first option active
  - When the selector renders
  - Then the mode label and toggle reflect the active option
  - And given the provider supplies no mode descriptor, the mode selector is not rendered
- **Priority:** must
- **Satisfies:** claudian `ModeSelector` (label + toggle, descriptor-driven)
- **Test:** TEST-TC-013

### REQ-TC-014 — Toggling the mode updates the active tab's mode for the next turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user toggles the mode selector, the plugin SHALL set the active tab's
  mode to the other configured option so the next turn's query options carry it via the additive
  mode field.*
- **Acceptance:**
  - Given the mode selector shows option A active
  - When the user toggles it
  - Then the selector shows option B active and the next submitted turn's query options carry the
    mode-field value for option B
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ModeSelector` click handler (`activeValue`/`inactiveValue`); additive `mode?` field (CLAR-TC-001)
- **Test:** TEST-TC-014

---

### Widget 3 — Permission toggle  (SEAM · backing P7)

Claudian source: `InputToolbar.ts` `PermissionToggle`; `toolbar/permission-toggle.css`;
`core/security/ApprovalManager.ts` (P7); `RuntimeCapabilities.supportsPlanMode` (P4).

---

### REQ-TC-015 — Render the permission toggle reflecting the current permission display state

- **Pattern:** state-driven
- **Statement:** *WHILE a permission/plan display state exists for the active tab, the plugin
  SHALL render the permission toggle reflecting that state, including the PLAN special-case where
  the toggle is replaced by a "PLAN" label.*
- **Acceptance:**
  - Given the active tab is not in plan mode
  - When the toggle renders
  - Then it shows the permission label + toggle in the current state
  - And given the active tab is in P4 plan mode, the toggle is replaced by the "PLAN" label
- **Priority:** must
- **Satisfies:** claudian `PermissionToggle` (label + toggle; PLAN special-case); P4 plan state (NG6, display only)
- **Test:** TEST-TC-015

### REQ-TC-016 — The permission toggle is an honest seam pending P7 approvals

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user interacts with the permission toggle while approval-rule backing
  is absent, THEN the plugin SHALL surface an honest "permissions arrive in a later release"
  affordance (a disabled state or a non-blocking notice) and SHALL NOT persist any rule or
  silently change tool-call gating.*
- **Acceptance:**
  - Given approval-rule backing is not present (P6)
  - When the user activates the permission toggle's deferred control
  - Then an honest disabled/"coming later" affordance is shown (or a non-blocking notice), no
    approval rule is persisted, and no `data.json`/settings write occurs for rules
- **Priority:** must
- **Satisfies:** CHARTER §3.9 (approvals → P7); mirrors the `supportsBrowserSelection` honest-defer pattern (`ChatComposer.vue:64`); NG1
- **Test:** TEST-TC-016

---

### Widget 4 — Thinking selector  (BACKED · P6, options expand P9)

Claudian source: `InputToolbar.ts` `ThinkingBudgetSelector` (effort gears / token-budget
gears); `toolbar/thinking-selector.css`; `ProviderChatUIConfig.reasoningControl`
(`'effort' | 'token-budget' | 'none'`) + reasoning options.

---

### REQ-TC-017 — Render the thinking selector per the provider's reasoning control

- **Pattern:** optional-feature
- **Statement:** *WHERE the active provider's reasoning control is `effort` or `token-budget`
  and more than one option exists, the plugin SHALL render the thinking selector with the current
  reasoning choice and the appropriate variant (effort labels or token-budget amounts).*
- **Acceptance:**
  - Given the provider's reasoning control is `effort` with options High/Medium/Low and Medium active
  - When the selector renders
  - Then it shows the "Effort:" label and "Medium" as the current value
  - And given the reasoning control is `none` (or a single option), the thinking selector is not rendered
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ThinkingBudgetSelector` (effort vs budget; auto-hide on `none`/single)
- **Test:** TEST-TC-017

### REQ-TC-018 — Selecting a thinking choice updates the active tab's reasoning for the next turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects a thinking option, the plugin SHALL set the active tab's
  reasoning choice so the next turn's query options carry it via the additive reasoning field.*
- **Acceptance:**
  - Given the thinking selector shows Medium effort
  - When the user selects High
  - Then the selector's current value becomes High and the next submitted turn's query options carry
    the reasoning-field value for High
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ThinkingBudgetSelector` change handler; additive `reasoning?` field (CLAR-TC-001)
- **Test:** TEST-TC-018

---

### Widget 5 — Service-tier toggle  (SEAM · capability-gated; backing P9)

Claudian source: `InputToolbar.ts` `ServiceTierToggle` (Codex fast-mode `zap` button);
`toolbar/service-tier-toggle.css`; service-tier descriptor in `ProviderChatUIConfig` (Codex).

---

### REQ-TC-019 — Render the service-tier toggle only where the provider configures it

- **Pattern:** optional-feature
- **Statement:** *WHERE the active provider's UI config supplies a service-tier toggle descriptor,
  the plugin SHALL render the service-tier toggle showing its active/inactive state; otherwise the
  plugin SHALL NOT render it.*
- **Acceptance:**
  - Given the active provider is Claude, which supplies no service-tier descriptor
  - When the strip renders
  - Then no service-tier toggle is shown and the strip layout closes the gap (no empty/dead button)
  - And given a provider that supplies the descriptor, the toggle renders with its `zap`-icon state
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ServiceTierToggle` (auto-hidden when no toggle config); NG4 (Codex catalog → P9)
- **Test:** TEST-TC-019

### REQ-TC-020 — Service-tier choice threads via an additive field, declared now, emitted when backed

- **Pattern:** event-driven
- **Statement:** *WHEN the user toggles a configured service-tier control, the plugin SHALL set the
  active tab's service-tier so the next turn's query options carry it via the additive service-tier
  field, with the field declared additively now and consumed by a capable provider runtime.*
- **Acceptance:**
  - Given a provider with a service-tier descriptor and the toggle inactive
  - When the user toggles it active and submits a turn
  - Then the next turn's query options carry the service-tier-field value for the active tier
- **Priority:** should
- **Satisfies:** claudian `ServiceTierToggle` (`activeValue`/`inactiveValue`); additive `serviceTier?` field declared now / Codex-emitted P9 (CLAR-TC-001); mirrors the declared-now/emitted-later discipline of the P2–P4 `StreamChunk`/`ChatRuntimeQueryOptions` members
- **Test:** TEST-TC-020

---

### Widget 6 — MCP selector  (SEAM · backing P8)

Claudian source: `InputToolbar.ts` `McpServerSelector`; `toolbar/mcp-selector.css`;
`core/mcp/McpServerManager.ts` (P8); `RuntimeCapabilities` / `supportsMcpTools`.

---

### REQ-TC-021 — Render the MCP selector only where the provider supports MCP tools

- **Pattern:** optional-feature
- **Statement:** *WHERE the active runtime's capabilities report MCP-tool support, the plugin SHALL
  render the MCP selector shell; otherwise the plugin SHALL NOT render it.*
- **Acceptance:**
  - Given the active runtime reports MCP-tool support
  - When the strip renders
  - Then the MCP selector shell (icon + count badge region) is present
  - And given a runtime that reports no MCP-tool support, the MCP selector is not rendered
- **Priority:** must
- **Satisfies:** CHARTER §3.5 / §3.7; claudian `McpServerSelector` (auto-hide when no servers); `supportsMcpTools` gating; NG2
- **Test:** TEST-TC-021

### REQ-TC-022 — The MCP selector is an honest seam pending P8 MCP backing

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user opens the MCP selector while MCP client/server backing is absent,
  THEN the plugin SHALL present an honest empty/"MCP servers arrive in a later release" state and
  SHALL NOT toggle, connect, or claim to enable any server.*
- **Acceptance:**
  - Given MCP backing is not present (P6) and the selector shell is shown
  - When the user opens it
  - Then it shows an honest empty/"coming later" state, lists no live servers, and toggling does nothing
    persistent
- **Priority:** must
- **Satisfies:** CHARTER §3.7 (MCP → P8); honest-defer pattern; NG2 / NG7
- **Test:** TEST-TC-022

---

### Widget 7 — External-context control  (SEAM · deferred control)

Claudian source: `InputToolbar.ts` `ExternalContextSelector`; `toolbar/external-context.css`;
native Electron folder picker (`remote.dialog`); `externalContextPaths` (NG3, still excluded).

---

### REQ-TC-023 — Render the external-context control as a deferred, honest affordance

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user activates the external-context control while its folder-picker and
  path-persistence backing are absent, THEN the plugin SHALL present an honest disabled/"external
  folders arrive in a later release" affordance and SHALL NOT open a folder picker, add a path, or
  write `externalContextPaths` to any turn or to settings.*
- **Acceptance:**
  - Given the external-context backing is not present (P6)
  - When the user activates the control
  - Then an honest disabled/"coming later" affordance is shown, no folder picker opens, no path is
    added, and no `externalContextPaths` field is written to the turn or persisted
- **Priority:** should
- **Satisfies:** CHARTER §3.5; claudian `ExternalContextSelector`; NG3 (the picker needs `FilePickerPort`; `externalContextPaths` stays excluded — CLAR-TC-002)
- **Test:** TEST-TC-023
- **Note:** whether P6 shows the control as a visible-but-disabled affordance or omits it pending the
  picker port is **CLAR-TC-002**; PM recommends a visible-disabled honest affordance so the strip reads
  as the full Claudian layout (parity).

---

### Widget 8 — Usage / context meter  (BACKED · P6)

Claudian source: `InputToolbar.ts` `ContextUsageMeter` + `utils/usageInfo.ts`;
`components/context-footer.css`; `UsageInfo` (`UsageInfo.ts:12`); `StreamChunk` `usage`
(`StreamChunk.ts:33`).

---

### REQ-TC-024 — Surface the usage/context meter from streamed usage

- **Pattern:** state-driven
- **Statement:** *WHILE the active tab has received usage information for the current
  conversation, the plugin SHALL render the usage/context meter showing the context-window fill as a
  percentage derived from the latest `UsageInfo`.*
- **Acceptance:**
  - Given the active tab's latest usage reports `contextTokens` and `contextWindow` yielding 42%
  - When the meter renders
  - Then the meter shows a 42% fill and a "42%" label
- **Priority:** must
- **Satisfies:** CHARTER §3.5; claudian `ContextUsageMeter` (240° arc gauge + percent); `UsageInfo` (`UsageInfo.ts:12`); realises the P1 meter seam REQ-CC-005a
- **Test:** TEST-TC-024

### REQ-TC-025 — Update the meter on each usage event

- **Pattern:** event-driven
- **Statement:** *WHEN the active tab's stream emits a usage event, the plugin SHALL update the meter's
  fill and percentage to reflect the new `UsageInfo`.*
- **Acceptance:**
  - Given the meter shows 42%
  - When a usage `StreamChunk` arrives reporting 67%
  - Then the meter updates to a 67% fill and a "67%" label
- **Priority:** must
- **Satisfies:** claudian `ContextUsageMeter.update`; `StreamChunk` `{ type: 'usage'; usage }` (`StreamChunk.ts:33`)
- **Test:** TEST-TC-025

### REQ-TC-026 — Show the warning state past the usage threshold

- **Pattern:** state-driven
- **Statement:** *WHILE the context-window fill is above the warning threshold, the plugin SHALL render
  the meter in its warning style and SHALL present a tooltip suggesting compaction.*
- **Acceptance:**
  - Given the latest usage yields a fill above the warning threshold (Claudian: >80%)
  - When the meter renders
  - Then the meter uses the warning fill + label style and exposes a tooltip suggesting `/compact`
- **Priority:** should
- **Satisfies:** CHARTER §3.5; claudian `ContextUsageMeter` warning class (>80%, pale-red) + `/compact` tooltip
- **Test:** TEST-TC-026

### REQ-TC-027 — Hide the meter when no usage exists

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the active tab has received no usage information, THEN the plugin SHALL NOT render
  the usage/context meter (no zero-state gauge).*
- **Acceptance:**
  - Given a freshly opened tab with no usage yet
  - When the strip renders
  - Then no usage meter is shown
- **Priority:** should
- **Satisfies:** claudian `ContextUsageMeter` (hidden when no usage)
- **Test:** TEST-TC-027

---

### Cross-cutting — accessibility & state reflection

---

### REQ-TC-040 — Selectors open and operate by keyboard, not hover only

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL allow every toolbar selector that opens a list (model, mode,
  thinking, MCP, external-context) to be opened and operated by keyboard — focus/Enter/Space to open,
  Arrow keys to navigate, Enter to select, Escape to close — in addition to any pointer/hover affordance.*
- **Acceptance:**
  - Given the model selector is focused via keyboard
  - When the user presses Enter (or Space), then Arrow Down, then Enter
  - Then the list opens, the next option is highlighted, and selecting it closes the list and updates
    the current value — with no reliance on a hover-only trigger
- **Priority:** must
- **Satisfies:** CHARTER §1 a11y (WCAG 2.2 AA); claudian selectors are **hover-open** (`model-selector.css`, audit "hover-open vs a11y" open question) — Specorator adds keyboard/focus open
- **Test:** TEST-TC-040

### REQ-TC-041 — Toggles expose their on/off state to assistive technology

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL expose each toolbar toggle's (mode, permission, service-tier)
  pressed/checked state to assistive technology and SHALL provide a text label or accessible name for
  every widget.*
- **Acceptance:**
  - Given the mode toggle is active
  - When its accessibility state is inspected
  - Then it reports a pressed/checked state and carries an accessible name describing the control
- **Priority:** must
- **Satisfies:** CHARTER §1 a11y (WCAG 2.2 AA); claudian `SpToggleSwitch` (visual-only state) — Specorator adds the AT state
- **Test:** TEST-TC-041

### REQ-TC-042 — Each widget reflects the active tab's current control state on tab switch

- **Pattern:** event-driven
- **Statement:** *WHEN the user switches to a different chat tab, the plugin SHALL update every toolbar
  widget to reflect that tab's current control state (model, mode, thinking, service-tier, usage).*
- **Acceptance:**
  - Given tab A has model X at 30% usage and tab B has model Y at 70% usage
  - When the user switches from tab A to tab B
  - Then the model selector shows Y and the meter shows 70%
- **Priority:** should
- **Satisfies:** CHARTER §3.5 (per-tab control state); claudian per-tab draft model + usage; per-tab-vs-global state is **CLAR-TC-003**
- **Test:** TEST-TC-042
- **Note:** whether control state is per-tab or global is **CLAR-TC-003**; PM recommends **per-tab** (parity with Claudian's per-tab draft model + the P3 tab model).

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1 bounding constraints + §5),
> `CLAUDE.md` (DDD/ports/DOM/testing), and ADR-008. Restated per project convention.
> P6 introduces **no new threshold** — every target is inherited.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-TC-001 | architecture (additivity) | The P0–P5 `ChatRuntimeQueryOptions` members (`model`, `forceColdStart`, `appendSystemPrompt`) and the P1–P5 composer send path stay byte-identical; P6 fields are additive optionals only | A `{ text }`-only / no-toolbar turn serialises exactly as on `next` today; new fields are optional and absent unless set |
| NFR-TC-002 | architecture (DDD/ports) | DDD inward-only imports; all Obsidian access via narrow ports; any new port (folder picker, MCP, provider UI config) added to all three bridges (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) | No `obsidian` import outside `src/infrastructure/obsidian/**` + `src/plugin/**`; new ports on all three bridges |
| NFR-TC-003 | architecture | Vue components never import `obsidian`; provider catalog, capability flags, usage data, and any folder picker route through ports / view-model DTOs | ESLint `no-restricted-imports` green; no `obsidian` symbol in `src/ui/**` |
| NFR-TC-004 | security/DOM | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no `window.confirm`/`alert`/`prompt`; the meter's SVG arc and selectors are built with declarative Vue bindings | `no-restricted-properties` + `vue/no-v-html` + `no-restricted-globals` green |
| NFR-TC-005 | code-style | All new components use `<script setup>`; view-model/use-case results use `Result<T,E>`; DTOs cross the Pinia store boundary (no domain class instances) | ESLint Composition-API rule green; use cases return `Result`; store holds DTOs |
| NFR-TC-006 | testing | Tests mirror `src/` path-for-path; mounted components have co-located `data-testid` PageObjects; no CSS/id selectors in tests | `tests/**` lint green; every new component test has a `.po.ts` |
| NFR-TC-007 | testing (coverage) | Coverage thresholds hold | ≥ 80 statements / 70 branches / 80 functions / 80 lines (`npm run test:coverage`) |
| NFR-TC-008 | visual parity | Every widget (model/mode/permission/thinking/service-tier/MCP/external selectors + toggles + arc-gauge meter) renders through the `toolbar/*` `--sp-*` token slice; no raw Obsidian var, hardcoded hex, or physical CSS property leaks | `lint-style-tokens` guard green; per-widget parity screenshots vs claudian at 320/520/720 px, light + dark |
| NFR-TC-009 | accessibility | Selectors keyboard-openable/navigable; toggles expose AT state; focus is managed and visible; forced-colors + reduced-motion honoured (meter fill animation, mcp/external glow) | WCAG 2.2 AA; keyboard + AT-state + forced-colors asserted in component tests |
| NFR-TC-010 | reliability | Widget rendering and selection degrade gracefully — missing/partial provider UI config or usage data hides the widget rather than crashing; no thrown error crosses a use-case boundary | Strip renders with absent capability/usage data; view-model transforms are total; failures return `Result.err` |
| NFR-TC-011 | privacy/security (secrets) | No secret/token material is rendered in or threaded through any toolbar widget; nothing toolbar-related is written to `data.json` | No secret in any widget DTO or query-option field; `data.json` untouched (device-local for any pref, per CHARTER-REQ-SET) |
| NFR-TC-012 | dependencies | No new runtime dependency for the strip or the arc-gauge meter (the gauge is computed in-repo, mirroring claudian's programmatic SVG path) | `package.json` runtime deps unchanged |
| NFR-TC-013 | identity/manifest | Product identity stays Specorator; `manifest.json` (`id`, `version`, `minAppVersion 1.12.7`) untouched; no migration of prior state | manifest diff empty; no migration/compat code (CHARTER-REQ-FRESH) |
| NFR-TC-014 | i18n | New user-facing strings (widget labels, "coming later" affordances, the `/compact` tooltip) go through the existing `TranslationPort` with English keys | No hardcoded user-facing string in new components; full-locale parity deferred (NG8) |

## Success metrics

- **North star:** A returning Claudian user finds all eight §3.5 control-strip widgets in
  place and recognises the cockpit — picks a model, sets thinking effort, flips the mode,
  and watches the arc-gauge meter fill (and warn past 80%) — with no missing affordance and
  no dead control, verified by the per-widget parity checklist + screenshots (charter §5)
  passing at `/spec:review`.
- **Supporting:**
  - 100% of `must` REQ-TC-* mapped to a Claudian source path and an executed test (charter §5.2).
  - All eight widgets render through the `toolbar/*` `--sp-*` token slice with zero raw-var /
    hardcoded-hex / physical-property leaks (NFR-TC-008).
  - The three backed widgets (model/mode/thinking) each demonstrably thread their value into
    `ChatRuntimeQueryOptions` additively, with the P0–P5 members byte-identical (NFR-TC-001).
  - Every keyboard-only operation in REQ-TC-040/041 passes (no hover-only trap).
- **Counter-metric (honest-defer integrity + scope leakage):** **zero** seam widgets present
  a live-looking-but-dead control — every seam (permission/MCP/external, and service-tier on a
  non-supporting provider) is either capability-hidden or shows an explicit disabled/"coming
  later" affordance; and **zero** P6 artifacts implement approval rules (NG1), MCP servers (NG2),
  external-context paths backing (NG3), a Codex/Opencode catalog (NG4), settings UX (NG5), or a
  plan-mode/`@mention`/new-tab re-spec (NG6/NG7/NG9). Tracked by a review checklist: any seam
  that "looks live but does nothing" or any REQ/spec/task touching a deferred surface is a
  defect to bounce to the owning phase.

## Release criteria

What must be true to ship P6 to `next`.

- [ ] All `must` REQ-TC-* pass acceptance (strip renders; capability-driven visibility; backed
      model/mode/thinking thread additively; permission + MCP honest seams; meter surfaces/updates/
      warns/hides; keyboard + AT-state a11y).
- [ ] All NFR-TC-* met or explicitly waived with an ADR (notably NFR-TC-001 additivity,
      NFR-TC-008 token parity, NFR-TC-009 a11y).
- [ ] CLAR-TC-001..003 ratified by the accepted P6 architect ADRs before design freezes the
      additive `ChatRuntimeQueryOptions` fields + the per-tab state model.
- [ ] Per-widget parity screenshots captured (320/520/720 px, light + dark) and approved at
      `/spec:review` (charter §5.1) — accumulating toward the single final epic review gate.
- [ ] Every seam widget is verified honest: capability-hidden or explicit-disabled/"coming later";
      none appears live-but-inert (counter-metric clean).
- [ ] The P0–P5 `ChatRuntimeQueryOptions` members are byte-identical and a no-toolbar turn
      serialises unchanged (NFR-TC-001 regression check).
- [ ] `npm run verify` + `npm run test:all` exit zero on the P6 branch.
- [ ] Counter-metric clean: no scope leakage into NG1–NG9.

## Open questions / clarifications

> These are **architect-owned** (P6 is autonomous-drive; no human gate). Each is an
> ADR-worthy decision flagged with options + constraints. Because the brief mandates
> autonomous drive, each carries a **PM-recommended resolution** to unblock design rather
> than a hold; the P6 architect ADRs ratify (or amend) them. They are **resolved-by-recommendation**
> for the purpose of `status: accepted`.

- **CLAR-TC-001 — The additive `ChatRuntimeQueryOptions` fields for the backed widgets.**
  *owner: architect.* What fields do the backed widgets thread, and with what shapes?
  Options: (a) one field per widget — `mode?: string`, `reasoning?: ReasoningChoice`
  (a discriminated `{ kind: 'effort'; value } | { kind: 'budget'; tokens }`),
  `serviceTier?: string` — appended to `ChatRuntimeQueryOptions` after the P5 members; (b) a
  single `toolbar?: {...}` bag. Constraints: **additive only** — the P0–P5 members
  (`model`, `forceColdStart`, `appendSystemPrompt`) stay byte-identical (NFR-TC-001); `model`
  already exists (no new field); `serviceTier?` is declared now / emitted by a capable provider
  in P9 (declared-now/emitted-later discipline); `enabledMcpServers?` and `externalContextPaths?`
  stay **excluded** (NG2/NG3). **PM recommendation:** option (a) — one additive optional field per
  backed widget (`mode?`, `reasoning?`, `serviceTier?`), mirroring how P3/P4/P5 appended single
  members; the discriminated `reasoning` shape carries both the effort and token-budget variants
  the thinking selector needs.

- **CLAR-TC-002 — External-context control: visible-disabled seam vs omit-until-backed.**
  *owner: architect.* `externalContextPaths` was NG3-EXCLUDED through P5 and the native folder
  picker needs a new desktop-only `FilePickerPort` (charter §6c) plus path persistence — none of
  which lands in P6. Options: (a) render a **visible-but-disabled** external-context control with a
  "coming later" affordance (full Claudian layout parity, honest), backing in a later phase;
  (b) omit the control entirely until the picker port + persistence land. Constraints: no
  `require('electron')` in Vue; `externalContextPaths` stays excluded from the request; honest-defer
  (no dead live control), charter §3 "nothing silently dropped." **PM recommendation:** option (a) —
  visible-but-disabled honest affordance, so the strip reads as the complete Claudian eight-widget
  layout while truthfully signalling the control is not yet active; the field stays excluded and the
  `FilePickerPort` + persistence are a later phase.

- **CLAR-TC-003 — Per-tab vs global control state.** *owner: architect.* Does each tab carry its
  own model/mode/thinking/service-tier selection (and usage), or is control state global to the
  surface? Options: (a) per-tab control state (each tab a draft model + reasoning + mode + its own
  usage), (b) global control state shared across tabs. Constraints: parity with Claudian's per-tab
  draft model + the P3 multi-tab model; the meter is inherently per-conversation (usage is per
  stream). **PM recommendation:** option (a) **per-tab** — Claudian keeps a per-tab draft model and
  the usage meter is per-conversation by nature; global state would break parity on tab switch
  (REQ-TC-042).

## Out of scope

See Non-goals NG1–NG9. Restated for the cycle: no approval rules / permission persistence (P7),
no MCP client/servers/tester (P8), no external-context paths backing / folder picker (later phase),
no Codex/Opencode catalogs or service-tier backing (P9), no settings UX (P10), no plan-mode or
`@mention` re-spec (P4 shipped them), no new-tab/provider-menu (P9), no full-locale i18n (P11).

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID (REQ-TC-001..004, 010..027, 040..042).
- [x] Acceptance criteria testable (Given/When/Then, each mapped to a claudian path + a TEST-TC id).
- [x] NFRs listed with targets (NFR-TC-001..014; no new threshold — all inherited).
- [x] Success metrics defined (including a counter-metric: honest-defer integrity + scope leakage vs NG1–NG9).
- [x] Release criteria stated.
- [x] `/spec:clarify` returned no open questions — **closed by recommendation**: CLAR-TC-001..003
      carry PM-recommended resolutions to be ratified by the P6 architect ADRs (autonomous drive,
      no human gate). PRD → `accepted`.
