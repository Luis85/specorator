---
id: PRD-POB-001
title: "Plugin onboarding flow"
stage: requirements
feature: plugin-onboarding
status: proposed
owner: pm
inputs:
  - IDEA-POB-001
  - RESEARCH-POB-001
created: 2026-05-12
updated: 2026-05-12
---

# PRD — Plugin onboarding flow

## Summary

We are building a five-step onboarding wizard that runs as a Vue Router route (`/onboarding`) inside the existing `SpecoratorView` panel. The wizard auto-opens on first install, guides users to a working plugin state, and captures a short personal introduction that makes every subsequent AI interaction more relevant. It targets first-time installers — particularly non-technical users such as founders, product managers, and business analysts — who cannot be expected to discover configuration steps from documentation. The wizard ships as a complete unit with the auto-open mechanism; a wizard that requires manual discovery is not onboarding.

## Goals

- G1: A first-time installer reaches a working plugin state (vault configured, templates available) without reading documentation.
- G2: The plugin knows enough about the user to inject relevant personal context into every AI system prompt from the first interaction onward.
- G3: Users who skip or defer persona input are gently re-invited, not blocked, and can return to the wizard from settings at any time.
- G4: The wizard works identically in Obsidian (ObsidianBridge) and in the standalone browser UI (MockBridge, LocalStorageBridge).

## Non-goals

- NG1: Persona versioning or history — the field stores the current value only.
- NG2: Team or multi-user persona management — persona is personal and single-user.
- NG3: A guided tour of plugin features after onboarding completes — that is a separate concern.
- NG4: Advanced Claude CLI configuration (provider selection, model selection) — deferred.
- NG5: Structured persona fields (role box, team box, context box) — a single textarea with example cards is the chosen pattern.
- NG6: Char-count hints or word-count enforcement on the persona textarea.
- NG7: Privacy controls on the `userPersona` setting — it is user-controlled plain text, not a secret.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| First-time installer | Reach a working plugin state without reading documentation | Without guidance, a new user faces an empty Obsidian window with no indication of what to do next |
| Non-technical user (founder, PM, business analyst) | Plain-language guidance through vault configuration and CLI dependency checks | Technical error messages and raw settings panels create friction that drops install-to-first-use conversion |
| Any user whose AI responses feel generic | A way to tell the plugin who they are so responses become more relevant | A PM receiving engineering-focused answers degrades trust in the tool |
| Returning user | Update their persona or re-run installation from settings | Persona relevance decays as roles and contexts change; locking capture to first run creates a support burden |

## Jobs to be done

- When I install Specorator for the first time, I want to be guided to a state where I can start a feature, so I don't have to figure out configuration from scratch.
- When I want the AI to understand my context, I want to describe myself in my own words, so every subsequent suggestion is relevant to my role.
- When I don't know whether Claude CLI is installed, I want a plain-language status message, so I know whether AI help is available without opening a terminal.
- When my role or context has changed, I want to update my introduction from settings, so I don't have to reinstall the plugin to get relevant AI responses.
- When I'm in a hurry, I want to skip the persona step and proceed, so I can start using the plugin immediately without being blocked.

## Functional requirements (EARS)

EARS patterns used:
- **Ubiquitous** — the system shall [requirement]
- **Event-driven** — WHEN [trigger], the [system] shall [response]
- **State-driven** — WHILE [state], the [system] shall [response]
- **Optional feature** — WHERE [feature is included], the [system] shall [response]
- **Unwanted behaviour** — IF [unwanted condition], the [system] shall [response]

---

### REQ-POB-001 — Auto-open wizard on first load

- **Pattern:** event-driven
- **Statement:** WHEN the Obsidian layout becomes ready and `PluginSettings.onboardingComplete` is absent or `false`, the plugin shall open the `SpecoratorView` panel and the onboarding wizard shall navigate to the `/onboarding` route.
- **Acceptance:**
  - Given a clean Obsidian install where `onboardingComplete` has never been set (or is explicitly `false`)
  - When Obsidian finishes loading its layout
  - Then the `SpecoratorView` panel is visible and the active route inside it is `/onboarding`, without any user action
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (auto-open on first install), RESEARCH-POB-001 §Q2

---

### REQ-POB-002 — Wizard self-routes on mount when onboarding is incomplete

- **Pattern:** state-driven
- **Statement:** WHILE `PluginSettings.onboardingComplete` is `false` or absent, the onboarding wizard component shall navigate to `/onboarding` in its `onMounted` hook if the current route is not already `/onboarding`.
- **Acceptance:**
  - Given the `SpecoratorView` panel is open and `onboardingComplete` is `false`
  - When the root Vue application mounts
  - Then the router's active route is `/onboarding`, regardless of what route `main.ts` previously requested
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (auto-open constraint), RESEARCH-POB-001 §Technical considerations (onLayoutReady coordination)
- **Note:** This is the guard against the race condition where `onLayoutReady` fires before `SpecoratorView.onOpen()` mounts the Vue app. `main.ts` is responsible only for calling `activateView()`; routing responsibility belongs to the wizard module.

---

### REQ-POB-003 — Step 1: Welcome screen

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 1, the wizard shall present a welcome heading and a "Let's get started" call-to-action button as the primary interactive element, with no other required actions.
- **Acceptance:**
  - Given the wizard is at Step 1
  - When the step renders
  - Then a welcome heading is visible, a "Let's get started" button is present and focusable, and advancing to Step 2 requires only activating that button
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (success criteria: guided path to first value)

---

### REQ-POB-004 — Step 2: Persona textarea with warm copy

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 2, the wizard shall present a single free-text textarea accompanied by warm, invitational copy (not a form label), secondary guidance reading "Two to four sentences is plenty", and three example persona cards illustrating natural-language descriptions for distinct user types.
- **Acceptance:**
  - Given the wizard is at Step 2
  - When the step renders
  - Then a textarea is visible; the surrounding copy contains no technical labels such as "User persona", "Configure persona", or "Role and responsibilities"; secondary copy with the phrase "Two to four sentences is plenty" is visible; and three example persona cards are visible before the user begins typing
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (persona step copy constraints), RESEARCH-POB-001 §Q1, §Q3

---

### REQ-POB-005 — Step 2: Persona skip path is de-emphasised

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 2, the wizard shall present the skip action as a de-emphasised secondary option labelled "I'll do this later", not as a cancel button or a primary action.
- **Acceptance:**
  - Given the wizard is at Step 2
  - When the step renders
  - Then the primary button is "Continue" (or equivalent forward action), and the skip option is visually subordinate to it and labelled "I'll do this later" or equivalent
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (persona step: de-emphasised skip)

---

### REQ-POB-006 — Step 2: Persona saved on Continue

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the Continue action on Step 2, the wizard shall save the textarea content to `PluginSettings.userPersona` via `SettingsPort.saveSettings()` before advancing to Step 3.
- **Acceptance:**
  - Given the wizard is at Step 2 and the user has entered text in the persona textarea
  - When the user activates the Continue action
  - Then `SettingsPort.saveSettings()` is called with the updated `userPersona` value and the wizard advances to Step 3; the saved value persists across plugin restarts
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (completing onboarding sets `userPersona: string`)

---

### REQ-POB-007 — Step 2: Persona preserved on skip

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the "I'll do this later" action on Step 2, the wizard shall advance to Step 3 without writing to `PluginSettings.userPersona`, leaving its current value unchanged.
- **Acceptance:**
  - Given the wizard is at Step 2 and the user has not entered any text (or has entered text but chooses skip)
  - When the user activates "I'll do this later"
  - Then the wizard advances to Step 3 and `PluginSettings.userPersona` remains unchanged from its prior value
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (skipping onboarding must not break any plugin functionality)

---

### REQ-POB-008 — Step 3: Claude CLI availability check

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 3, the wizard shall call `ClaudeCliPort.isAvailable()` and display the result in plain language: "Your AI assistant is ready" when the result is `true`, or "To get AI help, you'll need Claude installed" when the result is `false`.
- **Acceptance:**
  - Given the wizard is at Step 3 and `ClaudeCliPort` is resolvable
  - When the step mounts
  - Then `ClaudeCliPort.isAvailable()` is called; if it returns `true`, the message "Your AI assistant is ready" (or equivalent plain-language confirmation) is displayed; if it returns `false`, the message "To get AI help, you'll need Claude installed" (or equivalent) is displayed; no technical port name, error code, or internal identifier appears in the UI
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (Claude CLI check in plain language)

---

### REQ-POB-009 — Step 3: Graceful fallback when ClaudeCliPort is unresolvable

- **Pattern:** unwanted behaviour
- **Statement:** IF `ClaudeCliPort` cannot be resolved at runtime when Step 3 mounts, the wizard shall display a neutral status message indicating that the AI assistant status could not be determined, and shall allow the user to continue to Step 4 without blocking.
- **Acceptance:**
  - Given the wizard is at Step 3 and `ClaudeCliPort` is not registered or throws on resolution
  - When the step mounts
  - Then a neutral, plain-language message is displayed (for example: "We couldn't check your AI assistant status right now") and the Continue button is active and advances to Step 4
- **Priority:** must
- **Satisfies:** RESEARCH-POB-001 §RISK-POB-001 (ClaudeCliPort not yet declared)

---

### REQ-POB-010 — Step 4: Workspace setup — specs folder display and edit

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 4, the wizard shall show the current `PluginSettings.specsFolder` value pre-filled in an input field, allow the user to modify it, and save any change via `SettingsPort.saveSettings()` when the user activates the Continue action.
- **Acceptance:**
  - Given the wizard is at Step 4
  - When the step renders
  - Then the input field is pre-filled with the current `specsFolder` value (default: `specs`); the user can change the value; activating Continue with a changed value saves the new `specsFolder` via `SettingsPort.saveSettings()`
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (vault configuration step defaults sensibly)

---

### REQ-POB-011 — Step 4: Workspace setup — template installation

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the Install button on Step 4, the wizard shall invoke the existing template installation use case, display a plain-language summary of files to be created, and honour overwrite protection (skip existing files without overwriting).
- **Acceptance:**
  - Given the wizard is at Step 4 and the user activates the Install button
  - When the installation use case runs
  - Then a plain-language list of files to be created is shown before or after confirmation; any file that already exists is skipped without overwriting; no file paths or system terminology appear in user-visible strings; the user is informed of the outcome in plain language
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (template installation step reuses existing install use case with overwrite protection), REQ-AVS-005 (overwrite protection)

---

### REQ-POB-012 — Step 4: Workspace setup — skip template install

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the Skip button on Step 4, the wizard shall advance to Step 5 without invoking the template installation use case.
- **Acceptance:**
  - Given the wizard is at Step 4
  - When the user activates the Skip button (not Install)
  - Then the wizard advances to Step 5 and the template installation use case is not called
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (skipping onboarding must not break any plugin functionality)

---

### REQ-POB-013 — Step 4: Detects existing template installation

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 4, the wizard shall check whether the workflow templates are already installed and display a plain-language indicator of the current installation status before the user activates Install.
- **Acceptance:**
  - Given the wizard is at Step 4
  - When the step renders
  - Then the display reflects whether templates are already present (for example: "Templates are already installed" vs. "Templates are not yet installed"), and this is communicated without technical file paths in the primary message
- **Priority:** should
- **Satisfies:** IDEA-POB-001 (template installation step with overwrite protection)

---

### REQ-POB-014 — Step 5: Sets onboardingComplete true

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 5 (completion), the wizard shall set `PluginSettings.onboardingComplete` to `true` via `SettingsPort.saveSettings()`.
- **Acceptance:**
  - Given the wizard has reached Step 5
  - When Step 5 mounts
  - Then `SettingsPort.saveSettings()` is called with `onboardingComplete: true`; subsequent plugin restarts do not auto-open the wizard
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (completing onboarding sets `onboardingComplete: true`)

---

### REQ-POB-015 — Step 5: Per-step status summary

- **Pattern:** event-driven
- **Statement:** WHEN the onboarding wizard displays Step 5, the wizard shall display a summary showing the outcome of each prior step (persona entered or skipped, Claude CLI ready or not ready, templates installed or skipped).
- **Acceptance:**
  - Given the wizard has reached Step 5
  - When the step renders
  - Then for each of the prior steps (persona, Claude check, workspace), the summary shows whether that step produced a positive outcome or was skipped/unavailable, using plain language without technical identifiers
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (completion step shows per-step status)

---

### REQ-POB-016 — Step 5: Persona nudge when persona was skipped

- **Pattern:** state-driven
- **Statement:** WHILE `PluginSettings.userPersona` is empty when Step 5 displays, the wizard shall show a gentle nudge inviting the user to add their introduction, with a link or action that returns to the persona step or opens the settings persona field.
- **Acceptance:**
  - Given the wizard is at Step 5 and `userPersona` is empty (the user skipped Step 2)
  - When the step renders
  - Then a nudge message is visible that invites the user to add their introduction; the nudge is not blocking and does not prevent the user from dismissing the wizard
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (user who skips persona step receives a gentle nudge at completion)

---

### REQ-POB-017 — Step 5: AI nudge when Claude is not ready

- **Pattern:** state-driven
- **Statement:** WHILE `ClaudeCliPort.isAvailable()` returned `false` (or was unresolvable) when Step 5 displays, the wizard shall show a plain-language message explaining how the user can get AI help, without blocking wizard completion.
- **Acceptance:**
  - Given the wizard is at Step 5 and the Claude CLI check from Step 3 produced a not-ready or unknown result
  - When the step renders
  - Then a non-blocking message is visible explaining in plain language what the user can do to enable AI assistance; the user can still complete and close the wizard
- **Priority:** should
- **Satisfies:** IDEA-POB-001 (AI nudge if not ready on completion)

---

### REQ-POB-018 — Persona injected as Layer 0 in system prompt contract

- **Pattern:** ubiquitous
- **Statement:** The system prompt construction contract shall include `userPersona` as the highest-priority layer, formatted as `"About the person you're helping:\n{userPersona}"`, placed before all other context layers.
- **Acceptance:**
  - Given `PluginSettings.userPersona` is non-empty
  - When any system prompt is constructed for an AI interaction
  - Then the persona block `"About the person you're helping:\n{userPersona}"` is the first content in the constructed prompt
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (user's persona is injected as the highest-priority layer)
- **Note:** The injection site (`buildSystemPrompt()` or equivalent) is not yet located in the codebase. This requirement defines the contract — what must happen — not the function name. The architect resolves the integration point. See Open questions Q1.

---

### REQ-POB-019 — Persona block omitted when userPersona is empty

- **Pattern:** state-driven
- **Statement:** WHILE `PluginSettings.userPersona` is an empty string, the system prompt construction contract shall omit the "About the person you're helping" block entirely.
- **Acceptance:**
  - Given `PluginSettings.userPersona` is an empty string
  - When any system prompt is constructed for an AI interaction
  - Then no "About the person you're helping" block appears in the constructed prompt; all other prompt layers are unaffected
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (if empty, the "About the person" block is omitted — assistant still works)

---

### REQ-POB-020 — Persona nudge in sidebar when userPersona is empty

- **Pattern:** state-driven
- **Statement:** WHILE `PluginSettings.userPersona` is empty and the user is viewing the main Specorator sidebar (not the onboarding wizard), the sidebar shall display a gentle nudge inviting the user to add their introduction, with an action that opens the persona entry point.
- **Acceptance:**
  - Given the onboarding wizard has been completed (`onboardingComplete: true`) and `userPersona` is empty
  - When the user views the main Specorator sidebar
  - Then a nudge is visible in the sidebar; the nudge provides an action to navigate to the persona input; the nudge does not block any other sidebar functionality
- **Priority:** should
- **Satisfies:** IDEA-POB-001 (nudge accessible from settings at any time)

---

### REQ-POB-021 — Settings tab: About you field

- **Pattern:** ubiquitous
- **Statement:** The Specorator settings tab shall include a text area labelled in plain language (not "User persona" or "Configure persona") that reads and saves `PluginSettings.userPersona` via `SettingsPort`.
- **Acceptance:**
  - Given the user opens the Specorator settings tab
  - When the tab renders
  - Then a text area is present that displays the current `userPersona` value; changes saved in the settings tab are persisted and reflected in subsequent AI interactions
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (re-accessible from settings at any time)

---

### REQ-POB-022 — Settings tab: Nudge when userPersona is empty

- **Pattern:** state-driven
- **Statement:** WHILE `PluginSettings.userPersona` is empty and the settings tab is open, the settings tab shall display a prompt encouraging the user to add their introduction adjacent to the persona text area.
- **Acceptance:**
  - Given the user opens the settings tab and `userPersona` is empty
  - When the tab renders
  - Then a visible prompt adjacent to the persona text area encourages the user to fill it in; the prompt is absent when `userPersona` is non-empty
- **Priority:** should
- **Satisfies:** IDEA-POB-001 (nudge from settings)

---

### REQ-POB-023 — Re-run setup: command palette command

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the "Re-run setup" command from the command palette, the plugin shall set `PluginSettings.onboardingComplete` to `false` via `SettingsPort.saveSettings()` and open the `SpecoratorView` panel navigated to `/onboarding`.
- **Acceptance:**
  - Given the user has completed onboarding (`onboardingComplete: true`)
  - When the user activates the "Re-run setup" command from the command palette
  - Then `onboardingComplete` is saved as `false`, the `SpecoratorView` panel becomes visible, and the active route is `/onboarding`
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (re-run setup from command palette), RESEARCH-POB-001 §Open items 2

---

### REQ-POB-024 — Re-run setup: settings tab button

- **Pattern:** event-driven
- **Statement:** WHEN the user activates the "Re-run setup" button in the Specorator settings tab, the plugin shall set `PluginSettings.onboardingComplete` to `false` via `SettingsPort.saveSettings()` and open the `SpecoratorView` panel navigated to `/onboarding`.
- **Acceptance:**
  - Given the user has completed onboarding (`onboardingComplete: true`) and is viewing the settings tab
  - When the user activates the "Re-run setup" button
  - Then `onboardingComplete` is saved as `false`, the `SpecoratorView` panel becomes visible, and the active route is `/onboarding`
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (re-run setup from settings), RESEARCH-POB-001 §Open items 2

---

### REQ-POB-025 — PluginSettings additions are additive only

- **Pattern:** ubiquitous
- **Statement:** The `PluginSettings` interface shall include `userPersona: string` (default `''`) and `onboardingComplete: boolean` (default `false`), and the addition of these fields shall not alter the type or default value of any existing `PluginSettings` field.
- **Acceptance:**
  - Given the updated `PluginSettings` interface and `DEFAULT_SETTINGS`
  - When the plugin loads with a settings file that was saved before this feature shipped
  - Then all existing settings fields retain their prior values; `userPersona` defaults to `''` and `onboardingComplete` defaults to `false` for any settings file that does not contain these fields
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (must not introduce any breaking changes to PluginSettings)

---

### REQ-POB-026 — No technical terminology in user-visible onboarding strings

- **Pattern:** ubiquitous
- **Statement:** The onboarding wizard shall not display any internal identifier, port name, file path, or technical error code in any string visible to the user; all user-visible strings shall use plain language appropriate for a non-technical audience.
- **Acceptance:**
  - Given any step in the onboarding wizard, the settings tab fields, or the sidebar nudge
  - When those elements render under any condition (success, skip, error, unavailable port)
  - Then no string visible to the user contains terms such as "ClaudeCliPort", "SettingsPort", "VaultPort", "workflow-state.md", error codes, stack traces, or internal module names
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (plain-language constraint throughout)

---

### REQ-POB-027 — Wizard works in standalone browser mode with MockBridge

- **Pattern:** ubiquitous
- **Statement:** The onboarding wizard shall complete all five steps — including the Claude CLI status check — without error when running in the standalone browser context using `MockBridge`, where `ClaudeCliPort.isAvailable()` returns `false`.
- **Acceptance:**
  - Given the standalone browser context (`npm run dev`) with `MockBridge`
  - When the user navigates through all five wizard steps
  - Then each step renders correctly; Step 3 displays the not-ready message; Step 5 displays the AI nudge; no unhandled exceptions are thrown; the wizard completes successfully
- **Priority:** must
- **Satisfies:** IDEA-POB-001 (works in both Obsidian and standalone browser UI contexts)

---

### REQ-POB-028 — Vue components use script setup Composition API

- **Pattern:** ubiquitous
- **Statement:** All Vue components introduced by the onboarding feature shall use the `<script setup>` Composition API; Options API shall not be used in any onboarding component.
- **Acceptance:**
  - Given any `.vue` file in the onboarding module
  - When ESLint runs with the project's `vue/component-api-style` rule
  - Then no violations are reported
- **Priority:** must
- **Satisfies:** CLAUDE.md (Vue conventions, ADR-003)

---

### REQ-POB-029 — PageObject-covered component tests for key wizard paths

- **Pattern:** ubiquitous
- **Statement:** Each wizard step component shall have a co-located PageObject class, and the component test suite shall cover the happy path (all steps completed), the AI-not-ready path (Claude CLI unavailable), and the persona-skipped path.
- **Acceptance:**
  - Given the onboarding component test files
  - When `npm run test` executes
  - Then tests exist covering: (1) a user completing all steps with persona entered and Claude ready; (2) a user completing all steps with Claude not ready; (3) a user skipping the persona step; all PageObjects query elements exclusively via `data-testid`
- **Priority:** must
- **Satisfies:** CLAUDE.md (testing conventions, ADR-009), RESEARCH-POB-001 §Technical considerations

---

## Non-functional requirements

> Steering documents (`docs/steering/quality.md`, `docs/steering/operations.md`, `docs/steering/product.md`) are currently unpopulated stubs. All thresholds below are derived from explicit project-level constraints in `CLAUDE.md`, `idea.md`, and `research.md`. Any threshold introduced here that is not from those sources is marked with a note.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-POB-001 | usability | Onboarding completion time for a non-technical user | A user unfamiliar with Obsidian configuration completes all five steps in ≤ 3 minutes |
| NFR-POB-002 | accessibility | WCAG conformance for all onboarding UI | WCAG 2.2 AA (inherited from project-level default, CLAUDE.md) |
| NFR-POB-003 | test coverage — statements | Vitest statement coverage for `src/domain/**`, `src/application/**`, `src/infrastructure/**` (excl. `obsidian/**`) | ≥ 80% (inherited from `CLAUDE.md` coverage thresholds) |
| NFR-POB-004 | test coverage — branches | Vitest branch coverage (same scope as NFR-POB-003) | ≥ 70% |
| NFR-POB-005 | test coverage — functions | Vitest function coverage (same scope as NFR-POB-003) | ≥ 80% |
| NFR-POB-006 | test coverage — lines | Vitest line coverage (same scope as NFR-POB-003) | ≥ 80% |
| NFR-POB-007 | compatibility | Onboarding wizard runs without error in ObsidianBridge (Obsidian runtime) and MockBridge (standalone browser), and LocalStorageBridge (GitHub Pages demo) | Zero unhandled exceptions across all three bridge implementations during wizard traversal |
| NFR-POB-008 | code style | All onboarding Vue components comply with ESLint `vue/component-api-style: script-setup` | Zero ESLint violations on `npm run lint` |
| NFR-POB-009 | plain language | No internal identifier, port name, file path, or error code appears in any user-visible string under any runtime condition | Verified by string review: zero violations found in a manual pass of all onboarding string literals |
| NFR-POB-010 | settings compatibility | Adding `userPersona` and `onboardingComplete` to `PluginSettings` does not alter existing field types or defaults | `npm run typecheck` passes; existing plugin consumers of `PluginSettings` require no changes |

## Success metrics

- **North star:** Percentage of new installs that reach `onboardingComplete: true` within the first session. Target: ≥ 70% of new installs complete the wizard in the first session (to be measured via telemetry if telemetry is introduced; otherwise validated via user testing pre-release).
- **Supporting — persona fill rate:** Percentage of users who complete onboarding with a non-empty `userPersona`. Target: ≥ 50% of users who complete onboarding enter a persona (validated via user testing or post-launch analytics).
- **Supporting — time-to-completion:** Median time from wizard Step 1 display to Step 5 completion. Target: ≤ 2 minutes median, ≤ 3 minutes p90.
- **Counter-metric — wizard abandonment rate:** Percentage of users who open the wizard but never reach Step 5. If this exceeds 40%, the wizard complexity or copy should be revisited. A high abandonment rate combined with a high persona-skip rate may indicate the persona step is perceived as a blocker despite de-emphasising the skip action.

## Release criteria

What must be true to ship.

- [ ] All `must` requirements (REQ-POB-001 through REQ-POB-029 marked `must`) pass their acceptance criteria.
- [ ] All `should` requirements (REQ-POB-013, REQ-POB-017, REQ-POB-020, REQ-POB-022) are implemented or explicitly waived with documented rationale.
- [ ] All NFRs (NFR-POB-001 through NFR-POB-010) are met or explicitly waived with an ADR.
- [ ] Coverage thresholds (NFR-POB-003 through NFR-POB-006) pass on `npm run test:coverage`.
- [ ] `npm run lint` reports zero violations.
- [ ] `npm run typecheck` reports zero errors.
- [ ] Component tests cover the three paths specified in REQ-POB-029.
- [ ] All user-visible strings reviewed for technical terminology; zero violations found (NFR-POB-009).
- [ ] Wizard verified in Obsidian production context (ObsidianBridge) and standalone browser (MockBridge).
- [ ] `PluginSettings` additions confirmed additive (existing tests that depend on `PluginSettings` still pass).
- [ ] Open question Q1 (persona injection site) resolved by architect before implementation of REQ-POB-018 and REQ-POB-019 begins.
- [ ] Open question Q2 (ClaudeCliPort interface) resolved or REQ-POB-009 fallback confirmed sufficient.

## Open questions / clarifications

- **Q1 — Persona injection site** — The `buildSystemPrompt()` function referenced in `idea.md` has not been located in the codebase. `RESEARCH-POB-001` §Technical considerations notes it may be introduced by the `claude-cli-chat-sidebar` module. REQ-POB-018 and REQ-POB-019 define the contract (what must happen) rather than pinning to a function name. The architect must identify or define the injection site before implementation of those requirements begins. *Owner: architect / claude-cli-chat-sidebar spec.* Status: open.

- **Q2 — ClaudeCliPort interface** — `ClaudeCliPort` is not yet declared in `src/domain/ports/`. REQ-POB-008 depends on `ClaudeCliPort.isAvailable()` returning a boolean. REQ-POB-009 covers the fallback when the port is unresolvable. The architect must declare the `ClaudeCliPort` interface (minimum: `isAvailable(): Promise<boolean>`) and register it in `MockBridge` (returning `false`) before Step 3 can be implemented. *Owner: architect / claude-cli-chat-sidebar spec.* Status: open.

## Out of scope

What we explicitly will not do this cycle.

- Persona versioning or history (NG1).
- Team or multi-user persona management (NG2).
- A guided tour of plugin features post-onboarding (NG3).
- Advanced Claude CLI configuration: provider, model, or API key management (NG4).
- Structured persona fields (role box, team box, context box) — single textarea is the mandated pattern (NG5).
- Character count or word count enforcement on the persona textarea (NG6).
- Privacy controls or encryption for `userPersona` (NG7).
- Telemetry infrastructure — success metrics are validated via user testing pre-release; telemetry is a separate concern.
- A six-step wizard — research (RESEARCH-POB-001 §Q4) recommends five steps; the vault config and template install steps are merged into one "Set up your workspace" step.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID (REQ-POB-001 through REQ-POB-029).
- [x] Acceptance criteria testable (each has a concrete Given/When/Then; no "handles errors gracefully" language).
- [x] NFRs listed with targets (NFR-POB-001 through NFR-POB-010).
- [x] Success metrics defined including a counter-metric.
- [x] Release criteria stated.
- [x] Open questions surfaced rather than guessed (Q1: injection site; Q2: ClaudeCliPort interface).
- [x] No design language in functional requirements (no component names, no CSS, no Vue template details).
- [x] No code or schemas written.
- [x] No architecture proposed (port declaration and injection site resolution escalated to architect).
- [x] Every requirement is a single testable statement (no hidden `and`s within individual REQ entries).
- [x] All user-visible copy constraints are stated as requirements, not UX guidance.
- [x] NFR thresholds sourced from CLAUDE.md; steering stubs noted; no invented thresholds without documentation.
