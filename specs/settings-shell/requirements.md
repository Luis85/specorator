---
id: PRD-SS-001
title: Settings shell — per-provider settings tabs (model picker · agent/skill/subagent read-only · slash-command) + environment settings + env-snippet manager + keyboard navigation + approvals/MCP surfaced
stage: requirements
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
status: accepted
owner: pm
integration_branch: next
inputs:
  - specs/claudian-reboot/parity-charter.md#3.8 (Settings shell)
  - specs/claudian-reboot/parity-charter.md#3.10 (settings/* css → --sp-*)
  - specs/claudian-reboot/parity-charter.md#4 (P10 row)
  - specs/claudian-reboot/parity-charter.md#1 (CHARTER-REQ-SEC secrets, CHARTER-REQ-SET device-local, CHARTER-REQ-FRESH no migration)
  - specs/claudian-reboot/claudian-audit-backend.md (Settings shell §: settings root + provider tabs / env settings + env-snippet manager / agent-skill-subagent-slash / keyboard navigation / approvals)
  - specs/settings-shell/workflow-state.md (P10 scope + the surfaces-P6-P9-seams framing + the env-snippet/store note + epic constraints)
  - D:\Projects\claudian-main src/features/settings/ClaudianSettings.ts (root settings tab + provider-tab delegation)
  - D:\Projects\claudian-main src/features/settings/ui/{EnvironmentSettingsSection,EnvSnippetManager}.ts + core/providers/providerEnvironment.ts + utils/env.ts (env classification + snippets)
  - D:\Projects\claudian-main src/features/settings/keyboardNavigation.ts + core/types/settings.ts (KeyboardNavigationSettings, EnvSnippet, SlashCommand)
  - D:\Projects\claudian-main src/providers/{claude,codex,opencode}/ui/*SettingsTab.ts + AgentSettings/SlashCommandSettings/CodexSkillSettings/CodexSubagentSettings/OpencodeAgentSettings
  - D:\Projects\claudian-main src/style/settings/{base,plugin,agent,slash,env-snippets,mcp,opencode-model-picker}.css
  - The existing surface to expand — src/plugin/settings.ts (the P0 slim PluginSettingTab, module-schema Setting-API DOM, persists via SettingsPort) + src/domain/settings/PluginSettings.ts
  - What P1–P9 give to SURFACE — ProviderRegistryPort + ProviderDescriptor/ProviderCapabilities matrix (P9, src/domain/ports/ProviderRegistryPort.ts, src/domain/chat/providers/ProviderDescriptor.ts); SecretStorePort + providerSecretKey (P9, src/domain/ports/SecretStorePort.ts); ToolbarCatalogPort + ToolbarCatalog (P6, src/domain/ports/ToolbarCatalogPort.ts); ApprovalRuleStorePort + ApprovalRule (P7, src/domain/ports/ApprovalRuleStorePort.ts); McpConfigStorePort + ManagedMcpServer (P8, src/domain/ports/McpConfigStorePort.ts); HomeFsPort (P9); device-local PluginSettings (ADR-PSR-002)
created: 2026-05-26
updated: 2026-05-26
---

# PRD — Settings shell (P10)

## Summary

P10 is the **settings shell**: the proper Obsidian `PluginSettingTab` surface that consolidates
and exposes the seams P6–P9 already built as a **per-provider settings UX**. The P0 reboot left a
slim settings tab (`src/plugin/settings.ts`) that renders only the module-schema dropdowns and
persists through `SettingsPort`. P10 grows that tab into a **per-provider tabbed shell** — one
section per provider the registry reports **enabled**, each section's controls **capability-gated**
by the frozen `ProviderCapabilities` matrix. It is built for the Claudian user who configures more
than one agent CLI from a single settings surface, and for the cautious user whose API keys and
env-var values must never land in the git-shared `data.json`.

**Most of P10 is SURFACING, not new machinery.** The provider list/enable/order
(`ProviderRegistryPort`), the per-provider API key (`SecretStorePort`), the per-provider default
model (`ToolbarCatalogPort`), the MCP servers (`McpConfigStorePort`, P8), and the approval rules
(`ApprovalRuleStorePort`, P7) all already exist behind their ports; P10 renders and wires them in
the settings tab. **The one genuinely-new subsystem is the environment settings + env-snippet
manager** — named env-var sets, scoped shared-vs-provider, injected into a provider subprocess env.
Because env values can carry secrets, P10 must NOT persist raw env values into `data.json`; the
recommended split (CLAR-SS-001) keeps secret-bearing values behind `SecretStorePort` and
non-secret structure/metadata device-local — flagged for an architect ADR.

**Agent / skill / subagent settings render READ-ONLY** this phase — the providers expose them
(per the P9 capability-gated posture); P10 does NOT add full CRUD authoring. **Keyboard navigation**
is in scope: the settings shell is keyboard-navigable to WCAG 2.2 AA. The settings tab **stays
Obsidian `Setting`-API DOM** (the existing `settings.ts` pattern), styled via the `settings/*`
`--sp-*` token slice — it does NOT mount Vue (CLAR-SS-002). The automated-test weight is a **pure
settings view-model** (per-provider tabs + capability-gated section visibility) plus any new
env-snippet store/manager; the `Setting`-API DOM render in `src/plugin/**` is coverage-excluded and
verified by manual real-Obsidian legs that accumulate for the final epic gate.

**Additive:** with only Claude configured, the P0 core settings (the two module-schema dropdowns)
and the P1–P9 surfaces behave identically — the shell adds a Claude section and the new env
subsystem and changes nothing else.

## Goals

- **G1 — Per-provider settings shell.** Render the settings tab as a per-provider structure — one
  section per provider the registry reports **enabled** (blank-tab-ordered), with provider
  enable/disable controls — over `ProviderRegistryPort`, the registry being the single source of
  which providers and sections appear.
- **G2 — Capability-gated sections.** Show or hide each per-provider section (model picker,
  agent/skill/subagent, slash-command, MCP, approvals) strictly from the provider's frozen
  `ProviderCapabilities` bag — never by branching on the provider id.
- **G3 — Secure per-provider API key entry.** Enter, replace, and clear a provider's API key
  through `SecretStorePort` (Obsidian native secret storage), with the field reflecting set/not-set
  state — the value never crosses into the view-model, a notice, a log, or `data.json`.
- **G4 — Model picker (default model).** Set a per-provider **default model** from the
  `ToolbarCatalogPort` model list, persisted to device-local settings — the same catalog the P6
  toolbar already reads.
- **G5 — MCP + approvals surfaced from settings.** Manage MCP servers (P8 `McpConfigStorePort`) and
  approval rules (P7 `ApprovalRuleStorePort`) from the settings shell, reusing the existing P7/P8
  machinery — capability-gated (MCP appears only where `supportsMcpTools` is true).
- **G6 — Environment settings + env-snippet manager (the new subsystem).** Create, edit, remove,
  and apply **env snippets** (named env-var sets, scoped `shared` vs `provider:<id>`), with a
  key-ownership review that classifies keys shared-known / provider-owned / shared-unknown; an
  applied snippet's env reaches the active provider's subprocess env.
- **G7 — Agent/skill/subagent read-only surfacing.** Render the provider's discovered
  agent/skill/subagent definitions **read-only** — surfacing only, no CRUD authoring (the P9
  capability-gated posture).
- **G8 — Keyboard-navigable shell.** Make the settings shell fully keyboard-navigable (tab order,
  focus management, key activation) to WCAG 2.2 AA — keyboard nav is in scope this phase.
- **G9 — Correct persistence, never the wrong store.** Every setting persists to its correct store:
  secrets and secret-bearing env values → `SecretStorePort`; device/user prefs → device-local
  (`SettingsPort`); MCP config → the vault `.claude/mcp.json` (P8); approval rules → their P7 store.
  No setting ever lands in the wrong store.
- **G10 — Additivity + every epic constraint.** Claude-only = the P0 + P1–P9 surface behaves
  identically; the settings DOM is plugin-layer (`Setting`-API, no `innerHTML`/`v-html`, built via
  `createEl`/`setText`); a pure view-model carries the tested weight; Vue (where any is used) never
  imports `obsidian`/`node:*`; `Result<T,E>`; coverage 80/70/80/80 with the DOM coverage-excluded;
  `--sp-*` parity; WCAG 2.2 AA; `manifest.json` identity unchanged.

## Non-goals

- **NG1 — Full agent / skill / subagent / slash-command CRUD authoring.** P10 surfaces these
  **read-only** per the P9 capability-gated posture. Creating, editing, or deleting agent / skill /
  subagent / slash-command definitions from the settings shell is out (deferred; the providers'
  file-backed CRUD is a later surface).
- **NG2 — Mounting Vue in the settings tab.** The settings tab stays Obsidian `Setting`-API DOM
  (the existing `settings.ts` pattern); P10 does not introduce a Vue settings tree (CLAR-SS-002).
- **NG3 — New chat/runtime/transport behaviour.** P10 surfaces and configures the P6–P9 seams; it
  does not add provider runtimes, transports, model routing, approval-engine matching, or MCP
  client behaviour — those shipped in P6–P9.
- **NG4 — Claude plugins subsystem.** Claudian's `providers/claude/plugins` /
  `PluginSettingsManager` is charter-flagged niche (charter §6b bullet 2; audit open question
  §409–434). Out of P10 (CLAR-SS-005 recommends defer).
- **NG5 — In-app MCP / agent surfaces for non-Claude providers.** Codex MCP is CLI-managed
  (`supportsMcpTools:false`); P8 already scoped non-Claude in-app MCP out. The Codex section shows
  the informational doc note, not a manager. No MCP manager appears for a non-Claude provider.
- **NG6 — Provider auth beyond CLI/env + native-secret key.** OpenRouter / Kimi compatibility and
  any non-CLI/non-env auth flow are out (charter §6b bullet 4).
- **NG7 — i18n 10-locale sweep (P11) + a11y stylesheet polish (P12).** Only the en (+ de where a
  surface needs it) keys for the new settings surfaces; the `accessibility.css` parity, forced-
  colors, and reduced-motion work is P12. WCAG 2.2 AA **keyboard nav** is in scope (G8); the broader
  a11y stylesheet polish is not.
- **NG8 — Migration of any legacy settings / snippets / keys.** CHARTER-REQ-FRESH — settings,
  snippets, and keys **load-or-default**; no `.claudian`/`data.json` migration, no compat shims.
- **NG9 — CLI-path / safe-mode device settings beyond what a runtime needs.** Device-keyed CLI path
  + safe-mode are a runtime concern (the audit notes them on the provider tab). P10 surfaces a CLI
  path field where a provider declares it needs one, but full per-host CLI resolution is the
  provider runtime's job (P9 infra), not new P10 behaviour (CLAR-SS-006).

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Multi-CLI power user (Obsidian, desktop) | Configure Claude, Codex, and Opencode from one per-provider settings shell | The primary P10 audience; the per-provider tabbed shell is the whole point |
| Claudian migrant | The settings layout, provider tabs, model picker, env-snippet manager, and microcopy read as Claudian | Charter §1 "a Claudian user would recognise immediately" |
| Cautious user | A provider API key and any secret-bearing env value never land in the git-shared `data.json` | CHARTER-REQ-SEC; the env subsystem is the new place a secret could leak (CLAR-SS-001) |
| Keyboard-only / AT user | Navigate and operate every settings control with the keyboard | WCAG 2.2 AA keyboard nav is in scope this phase (G8, charter §1) |
| Claude-only user | Adding the per-provider shell + env subsystem changes nothing about the existing settings | Additivity: the P0 core settings + P1–P9 surfaces stay identical |
| Specorator maintainer | The settings DOM is plugin-layer (`Setting`-API, coverage-excluded); a pure view-model carries the tested weight; secrets/env values never hit `data.json`; the verify gate stays green | Keeps the DDD architecture intact; the real-Obsidian settings-DOM manual legs accumulate for the final epic gate |

## Jobs to be done

- When I have more than one agent CLI configured, I want to **configure each provider from its own
  settings section**, so I manage all my providers in one place.
- When a provider can't do something Claude can (e.g. no in-app MCP), I want its settings section to
  **only show controls it actually supports**, so I'm never offered a control that does nothing.
- When I set a provider's API key, I want it **stored securely**, so my key is never committed to the
  git-shared `data.json`.
- When I pick a provider's default model, I want it **remembered for that provider**, so my chosen
  model is preselected next time.
- When I manage MCP servers or approval rules, I want to do it **from settings, reusing what already
  works**, so I don't learn two different surfaces.
- When I save a named set of environment variables, I want to **apply it to a provider's runtime**,
  so my provider subprocess gets the env I configured — without me re-typing it each time.
- When I paste a blob of env vars, I want the shell to **tell me which keys are shared, provider-
  owned, or need review**, so I don't put a provider's key in the wrong scope.
- When I look at a provider's agents / skills / subagents, I want to **see what's defined**, so I
  know my configuration — even though I edit the files elsewhere.
- When I use only the keyboard, I want to **reach and operate every control**, so the settings are
  usable without a mouse.
- As a Claude-only user, I want **the existing settings to be unchanged**, so the new shell costs me
  nothing.

## Functional requirements (EARS)

> EARS notation per `docs/ears-notation.md` — five patterns: **ubiquitous** (The system SHALL …) ·
> **event-driven** (WHEN … the system SHALL …) · **state-driven** (WHILE … the system SHALL …) ·
> **optional-feature** (WHERE … the system SHALL …) · **unwanted-behaviour** (IF … THEN the system
> SHALL …). One requirement per entry, stable ID, a Given/When/Then acceptance criterion, a MoSCoW
> priority, an upstream link + a 1:1 `claudian-main` path, and a future `TEST-SS-*` id. Each entry is
> tagged **[SURFACED]** (renders/wires an existing P6–P9 port) or **[NEW]** (genuinely-new P10
> behaviour). Grouped: shell structure & tabs · per-provider settings & secret key · model picker ·
> agent/skill/subagent surfacing · slash-command settings · environment settings · env-snippet
> manager · keyboard navigation · approvals & MCP surfacing · security · persistence & additivity.

### Settings-shell structure & tabs

#### REQ-SS-001 — Render a per-provider settings structure
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the settings tab is opened, the system SHALL render one settings section per provider that `ProviderRegistryPort.listEnabledProviders(settings)` reports enabled, in blank-tab order, plus the shared (core) settings section.*
- **Acceptance:**
  - Given claude + codex enabled and opencode disabled
  - When the user opens the settings tab
  - Then the tab renders a shared section and a section each for codex then claude (blank-tab order), and no opencode section
- **Priority:** must
- **Satisfies:** charter §3.8; G1; `ClaudianSettings.ts` (root tab delegating a section per enabled provider); `ProviderRegistryPort.listEnabledProviders` (`src/domain/ports/ProviderRegistryPort.ts:23`)
- **Test:** TEST-SS-001

#### REQ-SS-002 — The settings structure is computed by a pure view-model
- **[NEW]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL compute the settings-shell structure (which sections, in what order, with which controls visible) in a pure, Obsidian-free settings view-model that the `PluginSettingTab` DOM renders.*
- **Acceptance:**
  - Given a `PluginSettings` value and the registry/capability data
  - When the view-model is built
  - Then it returns a serialisable description of sections + controls (no Obsidian/DOM dependency), and the same input yields the same structure (deterministic)
- **Priority:** must
- **Satisfies:** workflow-state §"the automated weight is a PURE settings view-model"; G10; NFR-SS-003; the existing `src/plugin/settings.ts` `display()` loop
- **Test:** TEST-SS-002

#### REQ-SS-003 — Enable or disable a provider from settings
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user toggles a provider's enabled state in settings, the system SHALL update `PluginSettings.enabledProviders` through `SettingsPort` (device-local) and re-render the per-provider sections accordingly.*
- **Acceptance:**
  - Given opencode disabled
  - When the user enables opencode
  - Then `enabledProviders` gains `opencode` in device-local settings (CHARTER-REQ-SET), and an opencode section appears in the tab
- **Priority:** must
- **Satisfies:** charter §3.8; G1; `PluginSettings.enabledProviders` (`src/domain/settings/PluginSettings.ts:42`); `coerceEnabledProviders`; ADR-PSR-002
- **Test:** TEST-SS-003

#### REQ-SS-004 — Claude's section is always present
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL always render the Claude settings section, because Claude is always enabled — the user cannot disable it.*
- **Acceptance:**
  - Given a fresh install (`enabledProviders: []`)
  - When the user opens the settings tab
  - Then the Claude section is present and shows no disable control for Claude
- **Priority:** must
- **Satisfies:** charter §6a (Claude complete default); `claudeIsEnabled` always-true (`ProviderDescriptor.ts:89`)
- **Test:** TEST-SS-004

#### REQ-SS-005 — Preserve the existing core (module-schema) settings
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL continue to render the existing P0 core settings (the module-schema dropdowns persisted via `SettingsPort`) within the shared section, unchanged in behaviour.*
- **Acceptance:**
  - Given the P0 `coreSettingsModule` controls (locale, logLevel)
  - When the settings tab renders
  - Then those controls appear with the same labels and persist through `plugin.updateSettings` exactly as before P10
- **Priority:** must
- **Satisfies:** G10 additivity; the existing `src/plugin/settings.ts` module-schema loop; NFR-SS-001
- **Test:** TEST-SS-005

### Per-provider settings & secret API key

#### REQ-SS-010 — Gate per-provider sections by the capability matrix
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider's `ProviderCapabilities` flag for a feature is false, the system SHALL hide or disable that feature's control in the provider's settings section — gating by the capability bag, never by branching on the provider id.*
- **Acceptance:**
  - Given codex with `supportsMcpTools:false`
  - When the codex section renders
  - Then no MCP manager control appears in it (and the gate is driven by the capability flag, with no `switch (providerId)` in the view-model)
- **Priority:** must
- **Satisfies:** charter §3.8; G2; NFR-SS-008; `ProviderCapabilities` (`ProviderDescriptor.ts:25-48`); audit "capability-driven discipline" (`claudian-audit-backend.md:343`)
- **Test:** TEST-SS-010

#### REQ-SS-011 — Show a provider's API-key field only where it needs a key
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider's `ProviderCapabilities.needsApiKey` is true, the system SHALL render an API-key field in that provider's section; where false, the system SHALL NOT render a key field.*
- **Acceptance:**
  - Given claude (`needsApiKey:false`) and codex (`needsApiKey:true`)
  - When their sections render
  - Then the codex section shows a key field and the claude section shows none
- **Priority:** must
- **Satisfies:** charter §3.8; G3; `ProviderCapabilities.needsApiKey` (`ProviderDescriptor.ts:45`)
- **Test:** TEST-SS-011

#### REQ-SS-012 — Set or replace a provider API key through the secret store
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user enters a provider API key in its section, the system SHALL persist it through `SecretStorePort.setSecret(providerSecretKey(id), value)` and SHALL NOT write the value to `data.json`, the device-local store, the view-model, a notice, or a log.*
- **Acceptance:**
  - Given the codex section's key field
  - When the user enters a key and confirms
  - Then `SecretStorePort.setSecret('provider.codex.apiKey', value)` is called and `data.json` / device-local settings contain no key value
- **Priority:** must
- **Satisfies:** charter §3.8 + CHARTER-REQ-SEC; G3; NFR-SS-002; `SecretStorePort.setSecret` + `providerSecretKey` (`src/domain/ports/SecretStorePort.ts:20,28`)
- **Test:** TEST-SS-012

#### REQ-SS-013 — Clear a provider API key
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user clears a provider's API key, the system SHALL call `SecretStorePort.deleteSecret(providerSecretKey(id))`, which is idempotent for an absent key.*
- **Acceptance:**
  - Given a stored codex key
  - When the user clears the field
  - Then `SecretStorePort.deleteSecret('provider.codex.apiKey')` is called and the field reflects not-set; clearing an already-empty field is a no-op `ok()`
- **Priority:** must
- **Satisfies:** charter §3.8; G3; `SecretStorePort.deleteSecret` (`src/domain/ports/SecretStorePort.ts:30`)
- **Test:** TEST-SS-013

#### REQ-SS-014 — Reflect key set / not-set without revealing the value
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL reflect whether a provider's key is set or not set using only `SecretStorePort.listKeys()` (keys, never values), and SHALL NOT display, log, or place the secret value anywhere.*
- **Acceptance:**
  - Given a stored codex key
  - When the codex section renders
  - Then it shows a "key set" indication (from `listKeys`), the masked field shows no value, and no log/notice/DTO carries the value
- **Priority:** must
- **Satisfies:** charter §3.8 + CHARTER-REQ-SEC; G3; NFR-SS-002; `SecretStorePort.listKeys` (`src/domain/ports/SecretStorePort.ts:32`)
- **Test:** TEST-SS-014

#### REQ-SS-015 — Degrade gracefully when native secret storage is unavailable
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If `SecretStorePort.isAvailable()` is false, then the system SHALL disable the API-key field with an informational message and SHALL NOT fall back to persisting the key anywhere else.*
- **Acceptance:**
  - Given `isAvailable()` returns false
  - When a needs-key provider's section renders
  - Then the key field is disabled with a "secret storage unavailable" notice and no key is written to settings/data.json
- **Priority:** must
- **Satisfies:** CHARTER-REQ-SEC; G3; `SecretStorePort.isAvailable` (`src/domain/ports/SecretStorePort.ts:24`); NFR-SS-005
- **Test:** TEST-SS-015

### Model picker (default model)

#### REQ-SS-020 — Render the per-provider model picker from the toolbar catalog
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When a provider's section renders, the system SHALL populate its model picker from `ToolbarCatalogPort.getCatalog(id).models`, marking the catalog's `defaultModelId` (or the persisted default) as selected.*
- **Acceptance:**
  - Given the Claude catalog's model list and `defaultModelId`
  - When the Claude section renders
  - Then the picker lists those models and preselects the persisted-or-catalog default
- **Priority:** must
- **Satisfies:** charter §3.8; G4; `ToolbarCatalogPort.getCatalog` + `ToolbarCatalog.models/defaultModelId` (`src/domain/ports/ToolbarCatalogPort.ts:20`, `src/domain/chat/toolbar/ToolbarCatalog.ts:66-69`); `settings/opencode-model-picker.css`
- **Test:** TEST-SS-020

#### REQ-SS-021 — Set a provider's default model
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user selects a model in a provider's model picker, the system SHALL persist it as that provider's default model to device-local settings, so the toolbar preselects it next time.*
- **Acceptance:**
  - Given the Claude picker
  - When the user selects a different model
  - Then the provider's default-model setting updates in device-local settings (CHARTER-REQ-SET) and the next chat preselects it
- **Priority:** must
- **Satisfies:** charter §3.8; G4; `ToolbarCatalog` model ids = the toolbar `model` value; ADR-PSR-002 device-local
- **Test:** TEST-SS-021

#### REQ-SS-022 — Empty model list degrades the picker
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If `getCatalog(id).models` is empty, then the system SHALL render the picker with the persisted value plus an empty-list notice and SHALL NOT crash or block the section.*
- **Acceptance:**
  - Given a provider whose catalog has no models
  - When its section renders
  - Then the picker shows the persisted value + an "no models" notice and the rest of the section still renders
- **Priority:** should
- **Satisfies:** `ToolbarCatalog.models` "may be empty" (`ToolbarCatalog.ts:66`); NFR-SS-005
- **Test:** TEST-SS-022

### Agent / skill / subagent surfacing (read-only)

#### REQ-SS-030 — Surface agent / skill / subagent definitions read-only
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When a provider's section renders, the system SHALL display that provider's discovered agent / skill / subagent definitions as a read-only list and SHALL NOT offer create / edit / delete controls.*
- **Acceptance:**
  - Given a provider with discovered agents/skills/subagents
  - When its section renders
  - Then the definitions appear as a read-only list with no add/edit/remove affordance
- **Priority:** must
- **Satisfies:** charter §3.8 + the P9 capability-gated posture; NG1; audit `AgentSettings.ts`/`CodexSubagentSettings.ts`/`OpencodeAgentSettings.ts` (`claudian-audit-backend.md:412-413`); `settings/agent-settings.css`
- **Test:** TEST-SS-030

#### REQ-SS-031 — Gate the agent/skill/subagent list by capability
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider does not expose agents / skills / subagents (the capability/source is absent), the system SHALL omit that read-only list rather than render an empty or misleading control.*
- **Acceptance:**
  - Given a provider that exposes no subagents
  - When its section renders
  - Then no subagent list appears for it
- **Priority:** should
- **Satisfies:** charter §3.8; G2/G7; the capability-gated posture
- **Test:** TEST-SS-031

### Slash-command settings

#### REQ-SS-040 — Surface a provider's slash commands
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider's `ProviderCapabilities.supportsProviderCommands` is true, the system SHALL render that provider's slash-command list (name, description, kind) in its section.*
- **Acceptance:**
  - Given claude (`supportsProviderCommands:true`) and codex (`supportsProviderCommands:false`)
  - When their sections render
  - Then the claude section shows a slash-command list and the codex section shows none
- **Priority:** should
- **Satisfies:** charter §3.8; G2; `ProviderCapabilities.supportsProviderCommands` (`ProviderDescriptor.ts:35`); `SlashCommand` (`core/types/settings.ts:30`); `SlashCommandSettings.ts`; `settings/slash-settings.css`
- **Test:** TEST-SS-040

#### REQ-SS-041 — Slash-command surfacing is read-only in P10
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL render slash-command settings read-only (no create / edit / delete) in P10, consistent with the agent/skill/subagent read-only posture.*
- **Acceptance:**
  - Given a provider's slash-command list
  - When its section renders
  - Then the entries are read-only with no authoring affordance
- **Priority:** should
- **Satisfies:** charter §3.8; NG1
- **Test:** TEST-SS-041

### Environment settings

#### REQ-SS-050 — Render a scoped environment settings section
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the settings tab renders, the system SHALL provide an environment settings section with a `shared` scope and a `provider:<id>` scope per enabled provider, each holding an editable env-var text area.*
- **Acceptance:**
  - Given claude + codex enabled
  - When the environment section renders
  - Then it offers a shared env editor and a per-provider env editor for claude and codex
- **Priority:** must
- **Satisfies:** charter §3.8; G6; `EnvironmentSettingsSection.ts` + `EnvironmentScope` (`core/providers/providerEnvironment.ts:6`); `settings/env-snippets.css`
- **Test:** TEST-SS-050

#### REQ-SS-051 — Classify env keys into ownership buckets
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user edits or pastes env text, the system SHALL classify each key as shared-known (PATH, *_PROXY, CA bundles, TMPDIR…), provider-owned (by the provider env-key patterns, e.g. `^ANTHROPIC_`, `^OPENAI_`, `^OPENCODE_`), or shared-unknown.*
- **Acceptance:**
  - Given env text with `PATH=...`, `ANTHROPIC_API_KEY=...`, and `FOO=bar`
  - When it is classified
  - Then `PATH` → shared-known, `ANTHROPIC_API_KEY` → provider (claude), `FOO` → shared-unknown
- **Priority:** must
- **Satisfies:** charter §3.8; G6; `classifyEnvironmentKey` + `SHARED_ENVIRONMENT_KEYS` + `environmentKeyPatterns` (`providerEnvironment.ts:23-61`); `parseEnvironmentVariables` (`utils/env.ts`)
- **Test:** TEST-SS-051

#### REQ-SS-052 — Warn on shared-unknown keys for review
- **[NEW]**
- **Pattern:** state-driven
- **Statement:** *While the env text contains a shared-unknown key, the system SHALL show a review warning naming the key(s), so the user can confirm the key belongs in the chosen scope.*
- **Acceptance:**
  - Given shared scope env text containing an unrecognised key
  - When the section renders
  - Then a review warning lists that key and the scope is still saveable
- **Priority:** should
- **Satisfies:** charter §3.8; G6; the ownership-review warning (`EnvironmentSettingsSection.ts`, audit `claudian-audit-backend.md:392-406`)
- **Test:** TEST-SS-052

#### REQ-SS-053 — Auto-route a pasted env blob to the right scope
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user pastes a multi-key env blob, the system SHALL split it across the correct scopes (shared vs `provider:<id>`) by key ownership, so a provider key lands in that provider's scope.*
- **Acceptance:**
  - Given a pasted blob with both shared and provider-owned keys
  - When it is applied
  - Then `getEnvironmentScopeUpdates` distributes each key to its scope and the editors reflect the split
- **Priority:** should
- **Satisfies:** charter §3.8; G6; `getEnvironmentScopeUpdates` / `resolveEnvironmentSnippetScope` (`providerEnvironment.ts`, `EnvSnippetManager.ts:5-7`)
- **Test:** TEST-SS-053

### Env-snippet manager (the new subsystem)

#### REQ-SS-060 — Create an env snippet
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user saves a named env-var set, the system SHALL create an env snippet (id, name, description, env-var text, scope, optional per-model context limits) and persist its non-secret structure to device-local storage.*
- **Acceptance:**
  - Given the user names a set of env vars and a scope
  - When they save
  - Then a snippet with `{id, name, description, envVars-structure, scope, contextLimits?}` is persisted to device-local settings (with secret-bearing values handled per REQ-SS-066)
- **Priority:** must
- **Satisfies:** charter §3.8; G6; `EnvSnippet` (`core/types/settings.ts:17-24`); `EnvSnippetModal.saveSnippet` (`EnvSnippetManager.ts:59-80`)
- **Test:** TEST-SS-060

#### REQ-SS-061 — Edit an env snippet
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user edits an existing env snippet, the system SHALL update it in place (preserving its id) and persist the change.*
- **Acceptance:**
  - Given an existing snippet
  - When the user edits its name/vars/scope and saves
  - Then the same `id` is updated and the change persists
- **Priority:** must
- **Satisfies:** charter §3.8; G6; `EnvSnippetModal` edit path (`EnvSnippetManager.ts:38,77-80`)
- **Test:** TEST-SS-061

#### REQ-SS-062 — Remove an env snippet
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user removes an env snippet, the system SHALL delete it from storage, and SHALL also remove any secret-bearing values it held from `SecretStorePort`.*
- **Acceptance:**
  - Given a snippet with a secret-bearing value
  - When the user removes it
  - Then its structure is deleted from device-local settings and its secret values are deleted from `SecretStorePort`
- **Priority:** must
- **Satisfies:** charter §3.8 + CHARTER-REQ-SEC; G6/G9; CLAR-SS-001; `EnvSnippetManager` delete flow; `SecretStorePort.deleteSecret`
- **Test:** TEST-SS-062

#### REQ-SS-063 — Require a snippet name
- **[NEW]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If the user tries to save an env snippet with an empty name, then the system SHALL reject the save with a notice and SHALL NOT persist a nameless snippet.*
- **Acceptance:**
  - Given an empty name field
  - When the user attempts to save
  - Then a "name required" notice shows and nothing is persisted
- **Priority:** should
- **Satisfies:** charter §3.8; G6; `saveSnippet` name guard (`EnvSnippetManager.ts:60-64`)
- **Test:** TEST-SS-063

#### REQ-SS-064 — Apply a snippet to a scope
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When the user applies an env snippet, the system SHALL write its env vars into the snippet's scope (shared or `provider:<id>`), inferring the scope when the snippet does not declare one.*
- **Acceptance:**
  - Given a saved provider-scoped snippet
  - When the user applies it
  - Then its env vars populate that provider's env scope; an undeclared scope is inferred via `resolveEnvironmentSnippetScope`
- **Priority:** must
- **Satisfies:** charter §3.8; G6; `resolveEnvironmentSnippetScope` / `getEnvironmentScopeUpdates` (`EnvSnippetManager.ts:5-7`); `inferEnvironmentSnippetScope` (audit `claudian-audit-backend.md:395`)
- **Test:** TEST-SS-064

#### REQ-SS-065 — Inject an applied snippet's env into the provider subprocess env
- **[NEW]**
- **Pattern:** event-driven
- **Statement:** *When a provider runtime starts a turn, the system SHALL inject the env vars from the provider's applied env scope (including applied snippets) into that provider's subprocess environment.*
- **Acceptance:**
  - Given an applied provider-scoped snippet with `FOO=bar`
  - When that provider's runtime starts a turn
  - Then `FOO=bar` is present in the subprocess env handed to the provider CLI
- **Priority:** must
- **Satisfies:** charter §3.8; G6; the audit's runtime PATH/env enhancement (`getEnhancedPath`, `claudian-audit-backend.md:400-404,558-578`); the P9 provider runtimes' subprocess env
- **Test:** TEST-SS-065

#### REQ-SS-066 — Persist secret-bearing env values via the secret store, never data.json
- **[NEW]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If an env var an env snippet or env scope carries is a secret (a value the user marks secret, or a provider-owned auth key), then the system SHALL persist that value through `SecretStorePort` and SHALL NOT write it to `data.json` or the device-local store.*
- **Acceptance:**
  - Given a snippet whose env includes `ANTHROPIC_API_KEY=sk-...`
  - When the snippet is saved
  - Then the key value persists via `SecretStorePort` (a placeholder/reference is kept in the device-local snippet structure) and `data.json` contains no key value
- **Priority:** must
- **Satisfies:** CHARTER-REQ-SEC; G6/G9; NFR-SS-002; CLAR-SS-001 (recommended split + ADR); audit secret-handling open question (`claudian-audit-backend.md:405-407,629-631`)
- **Test:** TEST-SS-066

#### REQ-SS-067 — Surface per-model context limits on a snippet
- **[NEW]**
- **Pattern:** optional-feature
- **Statement:** *Where a snippet declares custom-model context limits, the system SHALL store and surface them as the snippet's `contextLimits` map, parsed from the user's input.*
- **Acceptance:**
  - Given a snippet with a context-limit input for a custom model
  - When it is saved
  - Then `contextLimits[modelId]` holds the parsed numeric limit (invalid input dropped)
- **Priority:** could
- **Satisfies:** charter §3.8; `EnvSnippet.contextLimits` + `parseContextLimit` (`core/types/settings.ts:23`, `EnvSnippetManager.ts:66-75`)
- **Test:** TEST-SS-067

### Keyboard navigation

#### REQ-SS-070 — Configure message-pane keyboard navigation keys
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user changes a keyboard-navigation key (scroll-up, scroll-down, focus-input), the system SHALL persist the mapping to device-local settings for the chat surface's keyboard handler to consume.*
- **Acceptance:**
  - Given the default keys (w / s / i)
  - When the user remaps scroll-up to a new single character
  - Then the new mapping persists to device-local settings and the chat keyboard handler honours it
- **Priority:** should
- **Satisfies:** charter §3.8; G8; `KeyboardNavigationSettings` (`core/types/settings.ts:49-53`); `keyboardNavigation.ts` (`buildNavMappingText`/`parseNavMappings`)
- **Test:** TEST-SS-070

#### REQ-SS-071 — Reject invalid / non-unique key mappings
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If a keyboard-navigation mapping is malformed, uses a multi-character key, or duplicates another action's key, then the system SHALL reject it with a specific error and SHALL NOT persist the invalid mapping.*
- **Acceptance:**
  - Given two actions mapped to the same key
  - When the user saves
  - Then a "keys must be unique" error shows and the mapping is not persisted
- **Priority:** should
- **Satisfies:** charter §3.8; G8; `parseNavMappings` validation (`keyboardNavigation.ts:14-59`)
- **Test:** TEST-SS-071

#### REQ-SS-072 — The settings shell is keyboard-navigable
- **[NEW]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL make every settings-shell control reachable and operable by keyboard alone — logical tab order, visible focus, and key activation — to WCAG 2.2 AA.*
- **Acceptance:**
  - Given the settings tab open
  - When the user navigates with Tab / Shift+Tab / Enter / Space only
  - Then every control (provider toggles, key field, model picker, env editors, snippet actions) is reachable, focus is visible, and each activates by keyboard
- **Priority:** must
- **Satisfies:** charter §1 (WCAG 2.2 AA, keyboard nav in scope this phase); G8; NFR-SS-007
- **Test:** TEST-SS-072

### Approvals & MCP surfacing

#### REQ-SS-080 — Manage MCP servers from settings (Claude only)
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider's `supportsMcpTools` is true, the system SHALL render an MCP-server management control in its section that loads and saves servers through the P8 `McpConfigStorePort`.*
- **Acceptance:**
  - Given claude (`supportsMcpTools:true`)
  - When the claude section renders
  - Then an MCP manager appears, listing servers from `McpConfigStorePort.load()` and persisting edits via `save(...)`
- **Priority:** should
- **Satisfies:** charter §3.7/§3.8; G5; `McpConfigStorePort.load/save` (`src/domain/ports/McpConfigStorePort.ts:22,30`); `settings/mcp.css`
- **Test:** TEST-SS-080

#### REQ-SS-081 — Show a doc note for CLI-managed MCP providers
- **[SURFACED]**
- **Pattern:** optional-feature
- **Statement:** *Where a provider's `supportsMcpTools` is false but it manages MCP out-of-band (Codex), the system SHALL show an informational note instead of an MCP manager.*
- **Acceptance:**
  - Given codex (`supportsMcpTools:false`)
  - When the codex section renders
  - Then it shows a "Codex manages MCP via its own CLI" note and no manager
- **Priority:** could
- **Satisfies:** charter §3.7; NG5; audit Codex MCP note (`claudian-audit-backend.md:330-346`)
- **Test:** TEST-SS-081

#### REQ-SS-082 — Manage approval rules from settings
- **[SURFACED]**
- **Pattern:** event-driven
- **Statement:** *When the user views the approvals settings, the system SHALL list the persisted approval rules from the P7 `ApprovalRuleStorePort` and let the user remove a rule or clear all rules.*
- **Acceptance:**
  - Given persisted approval rules
  - When the approvals section renders
  - Then the rules list from `loadRules()`, and removing a rule calls `removeRule(id)` / clearing calls `clear()`
- **Priority:** should
- **Satisfies:** charter §3.8/§3.9; G5; `ApprovalRuleStorePort.loadRules/removeRule/clear` (`src/domain/ports/ApprovalRuleStorePort.ts:19,32,34`); `ApprovalRule`
- **Test:** TEST-SS-082

#### REQ-SS-083 — Surface the default permission mode
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL surface the default permission mode (the P7 `PermissionMode`) as a settings control, persisted to device-local settings.*
- **Acceptance:**
  - Given the approvals settings
  - When the user selects a default permission mode
  - Then the choice persists to device-local settings and the chat toolbar reflects it
- **Priority:** could
- **Satisfies:** charter §3.8/§3.9; `PermissionMode` (`@/domain/chat/PermissionMode`); ADR-PSR-002
- **Test:** TEST-SS-083

### Security, persistence & additivity

#### REQ-SS-090 — No secret ever reaches data.json
- **[NEW]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If any settings-shell flow handles a secret (an API key or a secret-bearing env value), then the system SHALL route it only through `SecretStorePort` and SHALL NOT write it to `data.json` or the device-local store.*
- **Acceptance:**
  - Given any key-entry or secret env flow
  - When the value is persisted
  - Then `data.json` and the device-local store contain no secret value (asserted by a store-content check)
- **Priority:** must
- **Satisfies:** CHARTER-REQ-SEC; G9; NFR-SS-002; `SecretStorePort`; `PluginSettings.ts:13` ("No secret value ever lives here")
- **Test:** TEST-SS-090

#### REQ-SS-091 — Each setting persists to its correct store
- **[SURFACED]**
- **Pattern:** ubiquitous
- **Statement:** *The system SHALL persist each setting to its designated store — secrets → `SecretStorePort`; device/user prefs → device-local (`SettingsPort`); MCP config → the vault `.claude/mcp.json` (`McpConfigStorePort`); approval rules → their P7 store — and never to the wrong store.*
- **Acceptance:**
  - Given a save of a key, a preference, an MCP server, and an approval rule
  - When each is persisted
  - Then the key lands in `SecretStorePort`, the preference in device-local settings, the MCP server in the vault config, and the rule in its P7 store
- **Priority:** must
- **Satisfies:** CHARTER-REQ-SEC + CHARTER-REQ-SET; G9; NFR-SS-002/004; the four ports' own store contracts
- **Test:** TEST-SS-091

#### REQ-SS-092 — Settings load-or-default with no migration
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If any stored settings, snippets, keys, MCP config, or approval rules are absent or unparseable, then the system SHALL load defaults (empty / coerced) and SHALL NOT run any migration of legacy state.*
- **Acceptance:**
  - Given a fresh install (no stored settings/snippets/keys)
  - When the settings tab loads
  - Then it shows defaults (Claude section, empty snippet list, no keys) with no migration step
- **Priority:** must
- **Satisfies:** CHARTER-REQ-FRESH; NG8; the `coerce*` load-or-default helpers (`PluginSettings.ts:118-157`); the ports' "NO migration" contracts
- **Test:** TEST-SS-092

#### REQ-SS-093 — Claude-only settings are identical to the pre-P10 surface
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If only Claude is enabled, then the settings shell SHALL render the P0 core controls plus a single Claude section and SHALL change nothing about the existing P0–P9 settings behaviour.*
- **Acceptance:**
  - Given a Claude-only configuration
  - When the settings tab renders
  - Then the diff against the pre-P10 settings behaviour is limited to the additive Claude section + the env subsystem, with the P0 core controls unchanged
- **Priority:** must
- **Satisfies:** G10 additivity; NFR-SS-001; the existing `src/plugin/settings.ts`
- **Test:** TEST-SS-093

#### REQ-SS-094 — Settings save returns a Result, never throws across the boundary
- **[SURFACED]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If a settings save fails (secret store, device-local, vault, or rule store), then the system SHALL surface the failure as a `Result.err` (a user notice) and SHALL NOT throw across the port boundary or leave the tab in a broken state.*
- **Acceptance:**
  - Given a store write that fails
  - When the user saves a setting
  - Then a notice shows the failure, no exception escapes, and the tab stays operable
- **Priority:** must
- **Satisfies:** ADR-004; NFR-SS-006; the ports' `Result`-typed contracts
- **Test:** TEST-SS-094

#### REQ-SS-095 — The settings DOM uses safe construction only
- **[NEW]**
- **Pattern:** unwanted-behaviour
- **Statement:** *If the settings tab builds DOM, then it SHALL build it via the Obsidian `Setting` API / `createEl` / `setText` and SHALL NOT assign `innerHTML` / `outerHTML` / `insertAdjacentHTML` or use blocking `window.confirm`/`alert`/`prompt`.*
- **Acceptance:**
  - Given the settings tab render and any modal flow (e.g. delete-snippet confirm)
  - When DOM is built and confirmations are shown
  - Then no raw-HTML assignment occurs and confirmations use an Obsidian `Modal`, not `window.confirm`
- **Priority:** must
- **Satisfies:** CLAUDE.md DOM rules; NFR-SS-010; the existing `settings.ts` `Setting`-API pattern
- **Test:** TEST-SS-095

## Non-functional requirements

> Targets inherit the epic constraints (charter §1, workflow-state §"Epic constraints") and the
> project gates (CLAUDE.md). Baselines (additivity, parity) are captured on `next` before P10
> implementation; pair NFR-SS-001 / NFR-SS-009 with a baseline-capture task in `tasks.md`.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-SS-001 | additivity | A Claude-only configuration's settings behaviour matches the pre-P10 surface | Pre-P10 (on `next`) behaviour byte-identical except the additive Claude section + env subsystem; baseline captured before implementation |
| NFR-SS-002 | security | API keys + secret-bearing env values never persist outside native secret storage | Zero secret bytes in `data.json` or the device-local store; values only via `SecretStorePort` (CHARTER-REQ-SEC) |
| NFR-SS-003 | architecture (DDD/ports) | The tested settings weight lives in a pure, Obsidian-free view-model + application services over the existing ports; the `Setting`-API DOM is plugin-layer | View-model/services import no `obsidian`/`node:*`; the DOM render lives only in `src/plugin/**` |
| NFR-SS-004 | privacy / storage | Device/user prefs persist device-local, never the git-shared `data.json` | Locale, logLevel, default model, enabled providers, keyboard-nav keys, default permission mode, snippet structure all device-local (CHARTER-REQ-SET) |
| NFR-SS-005 | reliability | A missing store value, empty catalog, or unavailable secret storage degrades gracefully | No crash / no blocked tab on any absent/empty/unavailable input; an informative notice is shown |
| NFR-SS-006 | reliability | All settings save paths return `Result<T,E>`; no throw crosses a port boundary | Every save returns `Result`; failures surface as notices (ADR-004) |
| NFR-SS-007 | accessibility | The settings shell is keyboard-navigable | WCAG 2.2 AA: full keyboard reach + operation, visible focus on every control (charter §1) |
| NFR-SS-008 | architecture (capability gating) | Section/control visibility is driven by the capability bag, never by a provider-id branch | No `switch (providerId)` / `if (provider === …)` in the view-model (NFR-PV-014 discipline) |
| NFR-SS-009 | visual parity | The `settings/*` CSS modules map to `--sp-*` tokens with no raw Obsidian-var / physical-property leak | `lint-style-tokens` clean for `settings/{base,plugin,agent,slash,env-snippets,mcp,opencode-model-picker}`; perceptual parity at 320/520/720 px, light + dark |
| NFR-SS-010 | security (DOM) | No raw HTML injection; no blocking dialogs | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`; no `window.confirm`/`alert`/`prompt` (CLAUDE.md, error severity) |
| NFR-SS-011 | testability / coverage | Coverage thresholds hold with the `Setting`-API DOM coverage-excluded | `npm run test:coverage` ≥ 80/70/80/80 on domain/application/infrastructure; the `src/plugin/**` DOM render verified by manual real-Obsidian legs |
| NFR-SS-012 | identity / packaging | `manifest.json` identity unchanged | `id` / `version` / `minAppVersion 1.12.7` untouched by P10 |

## Success metrics

- **North star:** A multi-CLI user can fully configure every enabled provider — key, default model,
  env, MCP (where supported), approvals — entirely from the settings shell, with each value landing
  in its correct store and the shell operable by keyboard alone.
- **Supporting:** 100% of P10 `must` requirements pass acceptance; every `settings/*` CSS module
  maps to `--sp-*` with the `lint-style-tokens` guard clean; the per-provider section + control
  visibility matches the capability matrix for all three providers; the env-snippet round-trip
  (create → apply → inject into subprocess env) verified end-to-end on at least one provider.
- **Counter-metric:** zero secret bytes detected in `data.json` / the device-local store across all
  key + env flows (a settings save that places a secret in the wrong store, or a section that shows
  a capability the provider lacks, is a P10 failure even if everything else passes).

## Release criteria

What must be true to ship P10 (to merge `feature/settings-shell` → `next` after a green gate +
green CI; the real-Obsidian settings-DOM + parity-screenshot manual legs accumulate for the single
final epic human review gate per the operating-mode directive).

- [ ] All `must` requirements (REQ-SS-001/002/003/004/005, 010/011/012/013/014/015, 020/021, 030,
      050/051, 060/061/062, 064/065/066, 072, 090/091/092/093/094/095) pass acceptance.
- [ ] All NFRs met or explicitly waived with an ADR.
- [ ] Secret-store assertion green: no secret value in `data.json` / device-local across every key +
      env flow (counter-metric).
- [ ] Capability-gating verified for all three providers (claude / codex / opencode) — sections +
      controls match the frozen matrix; no `switch (providerId)` in the view-model.
- [ ] Env-snippet round-trip (create → apply → inject into a provider subprocess env) verified.
- [ ] Keyboard navigation: every settings control reachable + operable by keyboard; visible focus.
- [ ] `npm run verify` green + `npm run test:all` zero failures; coverage ≥ 80/70/80/80.
- [ ] `lint-style-tokens` clean for the `settings/*` modules; `--sp-*` perceptual parity captured.
- [ ] `manifest.json` identity unchanged; `next` integration gate + CI green.
- [ ] CLAR-SS-001 (env-secret store/shape) and CLAR-SS-004 (consent for the new env-secret surface)
      ratified by the architect at `/spec:design` (an ADR for CLAR-SS-001).

## Open questions / clarifications

> Resolved by recommendation (autonomous drive). The architect ratifies the ADR-needed items at
> `/spec:design`; none blocks Stage 4.

- **CLAR-SS-001 — Env-snippet / env-value store + shape (ADR-needed).** *owner: architect.*
  Env vars can carry secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Claudian stores raw env
  (including keys) in plain settings JSON; the reboot must not (CHARTER-REQ-SEC). **Recommendation:**
  split persistence — the env-snippet **structure** (id, name, description, scope, the non-secret
  key names + non-secret values, contextLimits) persists **device-local** via `SettingsPort` (it is
  a personal pref, CHARTER-REQ-SET); any **secret-bearing value** persists via `SecretStorePort`
  under a deterministic per-snippet/per-key namespace (e.g. `env.<scope>.<KEY>`), with the
  device-local structure holding only a reference/placeholder. A pure classifier (regrowing
  `providerEnvironment.ts`) decides shared-known / provider-owned / shared-unknown; provider-owned
  auth keys (and a user "mark secret") route to the secret store. This introduces an
  **`EnvSnippetStorePort`** (or composes `SettingsPort` + `SecretStorePort`) — **architect decision +
  ADR** (parallels ADR-PV-002 secret handling). *Recommended resolution: device-local structure +
  `SecretStorePort` values; ADR records the port + the secret/non-secret split.*

- **CLAR-SS-002 — Settings tab DOM vs Vue.** *owner: architect.* The existing `src/plugin/settings.ts`
  is Obsidian `Setting`-API DOM; the backend audit (`claudian-audit-backend.md:370-383`) once
  suggested Vue. **Recommendation: keep the `Setting`-API DOM** — it is the existing pattern, the one
  sanctioned place a `PluginSettingTab` uses the Setting API (workflow-state epic constraints), styled
  via `settings/*` `--sp-*`. The tested weight goes into a pure `buildSettingsViewModel`; the DOM
  render stays coverage-excluded `src/plugin/**` with manual legs. *Recommended resolution: DOM, not
  Vue; no ADR needed (consistent with the P0 reboot's settings decision).*

- **CLAR-SS-003 — Agent/skill/subagent surfacing scope.** *owner: pm.* P10 surfaces these
  **read-only** (NG1, the P9 capability-gated posture). **Recommendation:** confirm read-only is
  enough for P10; full CRUD authoring is a later surface. *Recommended resolution: read-only;
  resolved — no ADR.*

- **CLAR-SS-004 — Consent for the new env-secret surface.** *owner: architect.* The env subsystem is a
  new place a user can store secrets; P9 already added a one-time consent gate for beyond-vault reads
  (`homeFsConsent`). **Recommendation:** the env-secret write needs no new consent gate (the user is
  explicitly typing a key into a key field) but MUST reuse the `SecretStorePort` availability check
  (REQ-SS-015) and the no-`data.json` guarantee (REQ-SS-090). *Recommended resolution: no new consent
  gate; reuse `isAvailable()` + the secret-store guarantee. Confirmed at /spec:design alongside
  CLAR-SS-001.*

- **CLAR-SS-005 — Claude plugins subsystem in/out.** *owner: pm.* Charter §6b flags it niche.
  **Recommendation:** out of P10 (NG4). *Recommended resolution: defer; resolved — no ADR.*

- **CLAR-SS-006 — CLI-path / safe-mode device fields.** *owner: architect.* The audit notes a
  device-keyed CLI path + safe-mode on Claudian's provider tabs. **Recommendation:** P10 surfaces a
  device-local CLI-path field where a provider declares it needs one (CHARTER-REQ-SET), but the full
  per-host CLI resolution stays the P9 provider runtime's job (infra), not new P10 behaviour (NG9).
  *Recommended resolution: surface a device-local CLI-path field only; resolution path = the P9
  runtime; no ADR.*

## Out of scope

What P10 explicitly will not do this cycle (see Non-goals for the reasoned list): full agent /
skill / subagent / slash-command **CRUD authoring** (NG1); a **Vue** settings tree (NG2); new
chat/runtime/transport behaviour (NG3); the Claude **plugins** subsystem (NG4); in-app MCP / agent
surfaces for non-Claude providers (NG5); provider auth beyond CLI/env (NG6); the i18n 10-locale
sweep (P11) + the a11y stylesheet polish beyond keyboard-nav (P12) (NG7); migration of any legacy
settings / snippets / keys (NG8); full per-host CLI resolution (NG9).

---

## Quality gate

- [x] Goals and non-goals explicit (G1–G10; NG1–NG9).
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has a stable ID (REQ-SS-001..095), a NEW/SURFACED
      tag, a MoSCoW priority, an upstream + 1:1 `claudian-main` link, and a future `TEST-SS-*` id.
- [x] Acceptance criteria testable (Given/When/Then per requirement).
- [x] NFRs listed with targets (NFR-SS-001..012).
- [x] Success metrics defined, including a counter-metric (no secret bytes in `data.json`).
- [x] Release criteria stated.
- [x] `/spec:clarify` self-check run: six CLAR-SS items recorded, each resolved-by-recommendation;
      CLAR-SS-001 (+ CLAR-SS-004) flagged ADR-needed for the architect at `/spec:design`; none blocks
      Stage 4 (autonomous drive).
