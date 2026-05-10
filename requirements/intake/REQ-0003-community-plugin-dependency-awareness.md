---
id: REQ-0003
status: proposed
summary: "Declare per-feature dependencies on Obsidian community plugins; check on startup and feature entry; gracefully disable features with missing dependencies"
owner: "Luis85"
created: 2026-05-10
last_updated: 2026-05-10
source_issue: "#221"
related_design: ""
tags: [requirements, intake, architecture, ports, ux]
priority: medium
risk: medium
verification:
  - "FeatureAvailabilityService unit tests cover present, missing, and multi-dependency cases against MockBridge"
  - "Vue component test asserts disabled state via data-testid page object when a required community plugin is absent"
  - "Manual smoke: with a real Obsidian community plugin disabled, the dependent Specorator feature renders disabled and a NotificationPort warning names the missing plugin id"
  - "On plugin onload, missing dependencies are logged via LoggerPort"
  - "ESLint port-import boundaries remain unchanged (no Vue component imports `obsidian`)"
statement: "The system SHALL declare per-feature optional dependencies on Obsidian community plugins, evaluate availability of each declared plugin on plugin load and again when a dependent feature is invoked, and gracefully disable or hide features whose required community plugins are missing while surfacing an actionable user-facing notice naming the missing plugin id. Live subscription to Obsidian plugin enable/disable events is out of scope for this requirement."
rationale: "Specorator gains its full value when it composes with the wider Obsidian community-plugin ecosystem (Dataview, Templater, Tasks, and others). Without an explicit dependency-awareness layer, users with a missing dependency see broken behavior or silent failures inside a Specorator feature. A plugin-agnostic registry plus a narrow domain port keeps the domain and application layers decoupled from Obsidian internals per ADR-008, and lets MockBridge and LocalStorageBridge simulate dependency states for unit tests and the standalone browser demo. Re-evaluating availability on feature entry (in addition to plugin onload) avoids forcing users to restart Obsidian after installing a missing dependency."
acceptance_criteria:
  - "A registry maps each Specorator feature id to zero or more required community-plugin ids."
  - "A new narrow domain port exposes at minimum `isPluginEnabled(id: string): boolean` and `listEnabledPluginIds(): string[]`."
  - "ObsidianBridge, MockBridge, and LocalStorageBridge each implement the new port."
  - "An application-layer service (e.g. `FeatureAvailabilityService`) resolves each registered feature to either `available` or `missing(missingPluginIds)` using the port."
  - "On plugin `onload`, availability is computed once and any missing dependencies are logged via `LoggerPort` (no user notice on startup)."
  - "When the user enters a feature with missing dependencies, the UI re-evaluates availability and renders a disabled or hidden state plus a `NotificationPort.showWarning` that names each missing plugin id and suggests installation."
  - "A feature with a missing dependency MUST NOT throw; the disabled-state path is the only behavior."
  - "Unit tests cover `FeatureAvailabilityService` for present, missing, and multi-dependency cases against `MockBridge`."
  - "Vue component test asserts the disabled state via a class-based page object using `data-testid` selectors per ADR-009."
  - "ESLint `no-restricted-imports` rules and ADR-008 port boundaries remain green; no Vue component imports `obsidian` directly."
traceability:
  upstream:
    - "ADR-008 — narrow ports"
    - "ADR-009 — testing conventions"
    - "Issue #221 — Requirement intake"
  downstream:
    - "TBD — design / implementation tasks after acceptance"
---

## Notes

- **Mechanism (plugin-agnostic):**
  - `CommunityPluginPort` (working name) lives under `src/domain/ports/`.
  - Concrete implementations: `ObsidianBridge` reads `app.plugins.enabledPlugins` (or equivalent stable surface); `MockBridge` keeps an in-memory `Set<string>` for tests and `npm run dev`; `LocalStorageBridge` reads from a config key for the GitHub Pages demo.
  - Feature → dependency mapping in a single registry module under `src/domain/features/` (or `src/application/`), not duplicated per use case.
  - Composable `useCommunityPluginPort` injected via a dedicated `COMMUNITY_PLUGIN_PORT` `InjectionKey` per ADR-008's one-port-per-dependency convention.
- **Lifecycle:**
  - Startup: compute availability once during plugin `onload` and log missing deps; do not show a user notice on startup to avoid noise.
  - On-demand: re-evaluate when a dependent feature is invoked (route guard, component mount, or use-case entry — choose at design time).
  - Out of scope: subscribing to live plugin enable/disable events. A future requirement can add live reactivity if needed.
- **Open questions for triage / design:**
  - Disabled vs hidden when a dependency is missing — should it be feature-configurable, or one global rule?
  - Where should the registry live: domain (pure data) or application (alongside use cases)?
  - Should the notice be one-shot per session, or re-shown on every feature entry?
  - How should declared dependencies be discovered for documentation (auto-generated table in the README / settings tab)?
- **Risk:** medium. Touches plugin lifecycle, adds a new port across three bridges, and affects UI affordances. Mitigated by following the established narrow-port + composable pattern.
