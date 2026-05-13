---
id: RESEARCH-POB-001
title: "Plugin onboarding flow"
stage: research
feature: plugin-onboarding
status: complete
owner: analyst
inputs:
  - IDEA-POB-001
created: 2026-05-12
updated: 2026-05-12
---

# Research — Plugin onboarding flow

## Research questions

| ID | Question | Status |
|---|---|---|
| Q1 | What is the shortest persona description that meaningfully improves AI response relevance — should we guide users with a character count hint or example prompts? | answered |
| Q2 | Should the onboarding wizard block the main UI (modal) or run in the main panel? | answered |
| Q3 | How should the persona field handle multi-paragraph input — single textarea or structured fields (role, team, context)? | answered |
| Q4 | Is a six-step wizard the right length, or should steps 4 and 5 (vault config and template install) be merged? | answered |

---

### Q1 — Persona description length and guidance mechanism

Research on user persona injection into AI system prompts shows a consistent pattern: a short, specific, role-anchored description of 2–4 sentences (40–80 words) delivers most of the personalisation benefit, while longer descriptions introduce diminishing returns and can cause the model to anchor on irrelevant detail.

Key evidence:

- The PromptHub role-prompting experiment (2025) found that basic one-liner personas ("You are a mathematician") produce negligible improvement over no persona, while a paragraph-level description with domain, context, and goal framing produces measurable relevance gains. https://www.prompthub.us/blog/role-prompting-does-adding-personas-to-your-prompts-really-make-a-difference
- The ExpertPrompting framework literature shows "vanilla prompting + static description" underperforms vs. detailed persona, but also that GPT-4-class models show diminishing returns beyond a few sentences of domain context, suggesting a soft ceiling around 100 words for practical applications. (arxiv.org/html/2311.10054v3)
- General prompt engineering guidance converges on 1–4 sentences (20–80 words) as the practical sweet spot for user-facing context injection in system prompts. https://synthmetric.com/persona-prompts-make-models-write-for-your-audience/
- Research on AI persona development tools (CloChat, ChatLab) found that example-based prompting — showing users sample descriptions — outperforms open-ended prompts or character count hints as an onboarding scaffold, because users model their input on the examples rather than guessing at appropriate depth. https://arxiv.org/html/2504.04927v1

Conclusion for Q1: Guide users with three example persona cards (showing concretely what a useful description looks like for a PM, a solo founder, and an engineering lead) rather than a character count hint. This prevents both the "one liner that helps nothing" failure and the "novel-length biography that confuses the model" failure. A soft guidance note such as "two to four sentences is plenty" can accompany the textarea as secondary copy.

---

### Q2 — Modal versus main panel for the wizard

The Obsidian Plugin API exposes two viable surfaces for a wizard:

1. **Modal** (`Modal` subclass via `new MyModal(app).open()`) — a blocking overlay with its own DOM, no Vue router involvement, requires custom multi-step state management within the modal class.
2. **ItemView / Vue router route** — the wizard runs as a named route inside the existing Specorator panel (`SpecoratorView`), driven by Vue Router and Pinia like all other UI. Displayed in the right sidebar or a dedicated leaf. Auto-opened via `onLayoutReady` by calling `activateView()` then navigating to `/onboarding`.

Evidence from UX research and Obsidian ecosystem conventions:

- Nielsen Norman Group documents that modal wizards obstruct background information the user may need, and recommends against modals for multi-step onboarding when the user needs to reference the surrounding application. https://www.nngroup.com/articles/wizards/
- Obsidian's own `window.confirm` / `window.alert` / `window.prompt` are explicitly banned by ESLint in this codebase (`no-restricted-globals`). The CLAUDE.md notes that `window.confirm` "blocks Obsidian's event loop and looks out of place". This design signal extends to multi-step modal flows: a heavy modal wizard has the same out-of-place quality even when implemented with a `Modal` subclass.
- The Claude Code VS Code extension uses an inline panel approach for its onboarding checklist, dismissible in-place, which aligns with modern tool-plugin conventions. https://code.claude.com/docs/en/vs-code
- The Specorator codebase already uses a Vue Router + Pinia pattern for all UI state. Adding a multi-step wizard as a Modal would require duplicating state management outside the existing architecture. The `SpecoratorView` already mounts Vue and provides all five ports; the wizard simply needs a new route.
- A panel-based wizard does not block the user's vault — they can still open notes while the wizard is in the sidebar. Closing the panel is a lower-friction gesture than dismissing a modal, which means the "I'll do this later" path is more natural.
- One concrete risk with the modal approach in Obsidian: the `no-restricted-globals` ESLint rule scope and the `window.confirm` design signal mean that any modal-rendered multi-step flow requiring async operations (like `ClaudeCliPort.isAvailable()`) will need careful callback management inside `onOpen`. Vue's async composables are not directly usable within a plain `Modal` subclass without wrapping, adding implementation complexity for no UX gain.

Conclusion for Q2: Run the wizard inside the existing Specorator panel as a Vue Router route (`/onboarding`). Auto-open the panel via `onLayoutReady()` calling `activateView()` then `router.replace('/onboarding')`. This reuses all existing port injection, error boundary, and i18n infrastructure with zero additional modal plumbing.

---

### Q3 — Single textarea versus structured fields for the persona

UX research on input field design distinguishes two scenarios:

- **Structured fields** (role, team, context as separate inputs) are appropriate when the data has known, enumerable dimensions and the user benefits from being told exactly what to provide.
- **Free-text textarea** is appropriate when the relevant information varies by user, the goal is expressiveness, and the user's own framing matters.

Evidence:

- Baymard Institute input field research shows that users complete free-text fields faster and with higher satisfaction when the surrounding UI provides sufficient scaffolding (examples, hints) rather than fragmenting the input into multiple labelled boxes. https://baymard.com/learn/input-fields
- The idea.md constraint is explicit: "The persona textarea must feel like a friendly invitation, not a form field. No labels like 'User persona', 'Configure persona', or 'Role and responsibilities'." Structured fields intrinsically resist this requirement — three boxes labelled "Role", "Team", "Context" are the definition of a form field.
- Splitting into structured fields also fragments the final string stored in `userPersona`. Reconstructing a coherent persona paragraph from three separate fields requires joining logic, creates awkward artefacts in the system prompt for users who fill only some fields, and prevents the user from expressing context that crosses the field boundaries (e.g., "I'm a solo founder who does both PM and engineering work").
- Research on AI persona customisation tools (CloChat, ChatLab) shows that free-text prompts with example scaffolding produce richer, more accurate persona descriptions than demographic dropdowns or structured forms, because users can provide nuance that structured categories cannot capture. https://arxiv.org/html/2504.04927v1

Conclusion for Q3: Single textarea with example persona cards as the scaffolding mechanism. The three example cards (visible before the user starts typing) should demonstrate natural-language, multi-sentence descriptions that cross role/team/context dimensions organically. This satisfies both the "friendly invitation" UX constraint and produces a cleaner string for `userPersona` storage and system prompt injection.

---

### Q4 — Six steps versus merging vault config and template install

UX research on wizard step count establishes that 3–7 steps is the productive range, with completion rates declining beyond 7. Most high-performing onboarding flows consolidate "configuration" actions that share the same mental model into a single step.

Evidence:

- Lollypop Design and WeWeb multi-step form research (2026) identifies that wizard steps should represent distinct cognitive tasks, not arbitrary technical boundaries. If two steps can be completed with the same mental frame ("set up my workspace"), merging them reduces perceived complexity without losing clarity. https://lollypop.design/blog/2026/january/wizard-ui-design/
- The current six steps are: Welcome → Persona → Claude check → Vault config → Template install → Completion. Steps 4 (vault config) and 5 (template install) are both workspace-configuration tasks and both operate on the vault. From the user's perspective, "set up my specs folder" and "install the workflow templates" are one job: "set up my workspace."
- The idea.md constraint states that the vault config step "defaults sensibly and only shows advanced options on demand." If the default vault folder is pre-filled and template install is a single "Install" button with overwrite protection, step 4 requires no active input from most users. Merging it with step 5 — as a combined "Set up your workspace" step — reduces step count to five without removing functionality.
- Merging also eliminates a transition that would feel arbitrary to non-technical users: they do not have a natural mental boundary between "configuring a folder path" and "installing files into that folder."
- Five steps (Welcome → Persona → Claude check → Workspace setup → Done) keeps the flow within the 3–5 steps optimal range identified by multi-step form research. https://edana.ch/en/2026/04/26/stepper-ui-how-to-design-clear-reassuring-and-effective-multi-step-flows/

Conclusion for Q4: Merge steps 4 and 5 into a single "Set up your workspace" step. The merged step shows the specs folder input (pre-filled with the default) and a template install action, with an expandable "Advanced" section if the user needs to change the folder. This yields a five-step wizard. The PM/designer may choose to retain six steps if distinct step headers improve transparency for some user segments — this is a judgment call for requirements/design, not a research mandate. The research evidence favours five.

---

## Market / ecosystem

| Solution | Approach | Strengths | Weaknesses | Source |
|---|---|---|---|---|
| Cursor IDE | Import VS Code settings wizard on first launch; progressive disclosure thereafter | Zero-friction for migrants; leverages existing knowledge | Assumes prior VS Code familiarity; not applicable to Obsidian | https://cursor.com/docs/configuration/migrations/vscode |
| Claude Code VS Code extension | Inline panel checklist on first open; dismissible in-place; re-openable from settings | Stays in context; non-blocking; matches tool conventions | Checklist (not wizard); no persona capture | https://code.claude.com/docs/en/vs-code |
| Obsidian Modal Form plugin | Community plugin that renders arbitrary forms in a Modal subclass | Mature Modal implementation; works without Vue | No wizard/step pattern; requires additional dependency | https://forum.obsidian.md/t/plugin-modal-form-integrate-forms-into-quickadd-templater-etc/67103 |
| Ideaverse for Obsidian | Vault-based onboarding: a set of notes the user reads; one "Trust author" prompt | Low plugin complexity | Passive; no active state capture; no AI personalisation | https://www.linkingyourthinking.com/ideaverse-for-obsidian/onboarding-ideaverse |
| ChatLab / CloChat (research) | Free-text + avatar/voice for AI persona customisation | Rich persona; user-controlled tone | Research prototypes; not Obsidian; too heavyweight for plugin onboarding | https://arxiv.org/html/2504.04927v1 |

No existing Obsidian plugin was identified that ships a multi-step wizard as a Vue Router route within an ItemView panel. The pattern is novel in the Obsidian ecosystem but straightforward given the existing Specorator architecture.

---

## User needs

No primary user research (interviews, surveys) was conducted for this feature. The following needs are inferred from the issue brief (#162), the idea.md problem statement, and the identified user segments. These are assumptions to be validated post-launch via user feedback.

- **First-time installers need a guided path to first value** — without onboarding, a new user lands in an empty Obsidian vault with no direction. The plugin's core function (structured spec-driven development) is not self-evident from the ribbon icon alone. *(inferred from issue #162 problem statement)*
- **Non-technical users cannot diagnose missing CLI dependencies** — the Claude CLI availability check must translate a technical binary state ("is a CLI tool installed on this machine") into a plain-language action the user can take. *(inferred from idea.md primary users: founders, PMs, business analysts)*
- **Users who skip persona input still need a working plugin** — the persona is optional; forcing it creates a barrier for users who want to try the plugin before committing to self-description. *(stated constraint: idea.md §Constraints)*
- **Users want to return and update their persona** — persona relevance decays as a user's role or context changes. Onboarding that locks persona capture to first run creates a support burden. *(stated in idea.md success criteria: "re-accessible from settings at any time")*
- **The AI assistant's generic responses erode trust** — users who receive responses that ignore their role (a PM getting engineering-focused answers) learn to distrust the tool, reducing engagement. *(inferred from idea.md problem statement: "a PM gets the same answer as an engineering lead, which degrades trust")*

Assumptions that must hold:
- Users are willing to spend 2–3 sentences describing their role if the request feels conversational rather than bureaucratic.
- The example persona cards will be understood as illustrative, not as templates to copy verbatim.
- `ClaudeCliPort.isAvailable()` produces a reliable signal; false positives would cause the wizard to report "ready" when the CLI is misconfigured.

---

## Alternatives considered

### Alternative A — Panel-based wizard (Vue Router route, recommended)

The wizard is implemented as a dedicated route (`/onboarding`) within the existing `SpecoratorView` Vue application. The `onLayoutReady()` hook in `main.ts` checks `settings.onboardingComplete`; if false or absent, it calls `activateView()` and navigates the router to `/onboarding`. Step state is held in a Pinia store (wizard store) scoped to the `onboarding-module`. Each step is a Vue component; navigation between steps is local state in the store. Completing the wizard navigates to `/` (the home/workflow navigator). The wizard route is also accessible from the settings tab at any time.

- **Pros:**
  - Reuses all existing infrastructure: port injection, error boundary, i18n, Pinia stores, `<script setup>` conventions.
  - No additional DOM or lifecycle plumbing beyond registering a new route.
  - `ClaudeCliPort.isAvailable()` can be called from a composable in the Vue component tree without async workarounds.
  - Non-blocking: the user can still interact with Obsidian while the wizard is open in the sidebar.
  - Consistent with existing Specorator UX — the wizard looks and feels like the rest of the plugin.
  - Accessible from settings tab by navigating to `/onboarding` programmatically.
  - Works in the standalone browser context (MockBridge) without any code forking.
- **Cons:**
  - The wizard route lives inside a sidebar panel that users can close. The `onLayoutReady` auto-open addresses cold-start discovery, but a user who closes the panel mid-wizard needs a way back (ribbon icon or settings).
  - Router navigation to `/onboarding` on `onLayoutReady` requires the Vue app to be mounted first. If `onLayoutReady` fires before `SpecoratorView.onOpen()`, the navigation is lost. This needs a coordination mechanism — e.g., the wizard module checking `onboardingComplete` on mount and self-navigating if incomplete.

### Alternative B — Modal-based wizard (Obsidian Modal subclass)

The wizard is implemented as a multi-step `Modal` subclass. Each step renders its DOM using Obsidian's `createEl`/`createDiv` API (no Vue). On `onLayoutReady`, `main.ts` checks `onboardingComplete` and opens the modal. The modal manages step state internally. Saving persona and settings calls `SettingsPort` directly. Completion closes the modal and optionally opens the main view.

- **Pros:**
  - Draws undivided user attention on first open — the modal cannot be ignored or closed by accident.
  - No dependency on the Vue app being mounted; works entirely at the plugin layer.
  - Precedent: the Obsidian sample plugin demonstrates this pattern.
- **Cons:**
  - Requires building a complete multi-step state machine and DOM construction layer outside Vue — significant duplication of the UI layer that already exists.
  - Vue components cannot be mounted into a `Modal` subclass without a separate `createApp()` call, which creates a second Vue application instance with its own Pinia and port injection. This is architectural complexity for no functional benefit.
  - The CLAUDE.md and ESLint rules explicitly signal that blocking DOM patterns (`window.confirm`, `innerHTML`) are out of place in this codebase. A blocking modal wizard follows the same anti-pattern philosophy, even if it uses the `Modal` class rather than `window.confirm`.
  - `ClaudeCliPort.isAvailable()` must be called inside the modal's step transition, requiring a callback or Promise chain wired through the modal's own state — more error-prone than Vue's composable async pattern.
  - No shared error boundary: the Vue `ErrorBoundary.vue` wrapping `<RouterView>` does not protect code running in a `Modal` subclass.
  - Does not work in the standalone browser context (MockBridge/LocalStorageBridge) without a full browser-side Modal shim.

### Alternative C — Settings tab first run (no wizard, redirect to settings)

On first install, the plugin opens the Obsidian Settings tab directly to the Specorator section. The user configures vault folder, persona, and template installation from within the standard settings UI. No step-by-step wizard. `onLayoutReady` opens Settings via `this.app.setting.open()`.

- **Pros:**
  - Zero new UI components — entirely reuses the existing `SpecoratorSettingTab`.
  - No routing or wizard state complexity.
  - Familiar Obsidian UX idiom (settings are how users configure plugins).
- **Cons:**
  - Settings tabs are densely formatted; they do not support warm, persona-invitation copy or example cards.
  - The progressive wizard structure — which is the mechanism for ensuring users reach a "ready" state — is entirely absent. Users cannot be guided step by step through `ClaudeCliPort` check → vault config → template install in a settings tab without custom rendering logic that effectively re-implements the wizard inside the settings tab.
  - Non-technical users find the Obsidian settings UI intimidating. The idea.md constraint for "warm, non-technical copy" and "three example persona cards as inspiration" is not achievable within the standard `PluginSettingTab` API without significant custom DOM construction.
  - The vault config step "defaulting sensibly" and "only showing advanced options on demand" (progressive disclosure) cannot be expressed with standard `Setting` API entries.
  - The Claude CLI check ("Your AI assistant is ready" vs. "To get AI help, you'll need Claude installed") requires a live async check that does not fit the synchronous rendering model of `SpecoratorSettingTab.display()`.

---

## Technical considerations

**Port boundary compliance:**
The wizard must use `SettingsPort.getSettings()` and `SettingsPort.saveSettings()` for reading and writing `onboardingComplete` and `userPersona`. Direct access to `PluginSettings` from the UI is not permitted (ADR-008). The `onboarding-module` must inject `SettingsPort` via its InjectionKey.

**`ClaudeCliPort` availability:**
`ClaudeCliPort` is not yet declared in `src/domain/ports/index.ts` (the current port exports are: SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, TranslationPort, MetadataCachePort, CanvasPort, ObsidianMcpServerPort). The `claude-cli-chat-sidebar` spec (a current Phase 4 entry) is expected to introduce `ClaudeCliPort`. The onboarding module's step 3 depends on this port. This is a declared dependency in `workflow-state.md` under "Blocks". The PM/architect must confirm whether `ClaudeCliPort` will be available before implementation begins, or whether the onboarding module provides a stub/fallback that skips the check gracefully.

**`PluginSettings` additions — additive only:**
`userPersona: string` and `onboardingComplete: boolean` must be added to the `PluginSettings` interface and `DEFAULT_SETTINGS` in `src/domain/settings/PluginSettings.ts`. The constraint "additions only, no breaking changes" means existing consumers of `PluginSettings` are unaffected. Default values must be: `userPersona: ''` and `onboardingComplete: false`.

**Module registration:**
The `onboarding-module` follows the existing `ModuleDescriptor` pattern (see `src/modules/module.ts`). It must be registered in `ALL_MODULES` in `src/modules/index.ts`. Its `settingsKey` must be distinct (e.g., `'onboarding'`), not `'specorator'` — the `onboardingComplete` and `userPersona` fields live in the `specorator` settings slice (they are `PluginSettings` fields), not in a separate module slice. The module's own slice (`onboarding`) may hold wizard UI state if needed (e.g., `lastCompletedStep`).

**`onLayoutReady` coordination:**
`main.ts` currently calls `detectLegacyVaultLayout()` inside `onLayoutReady()`. The wizard auto-open must also run in `onLayoutReady()`. The coordination issue (Vue app not yet mounted when `onLayoutReady` fires) is solved by the wizard route checking `onboardingComplete` in its own `onMounted` hook and navigating to `/onboarding` if incomplete — rather than navigating from `main.ts` directly. `main.ts` responsibility is limited to calling `activateView()` when `onboardingComplete` is false.

**Standalone browser (MockBridge) compatibility:**
`MockBridge` implements all five current ports. It must also implement `ClaudeCliPort` (or the onboarding step must feature-flag based on bridge capability). The standalone `main.ts` uses `MockBridge` for development and `LocalStorageBridge` for the GitHub Pages demo; both must handle the `ClaudeCliPort.isAvailable()` call gracefully — the mock can return `false` (simulating "not installed") without breaking the wizard.

**Persona injection:**
`userPersona` injection into the system prompt (`buildSystemPrompt()`) is out of scope for this research stage. The research notes that the system-prompt injection site (`"About the person you're helping:\n{userPersona}"`) is referenced in `idea.md` and must be identified and modified during implementation. No current `buildSystemPrompt` function was found in the codebase; this may be introduced with the `claude-cli-chat-sidebar` module. This is a cross-module integration concern for the architect.

**Vue Router route guard:**
The router must ensure that `/onboarding` is accessible before authentication or feature-gating logic (if any is introduced). Currently the router uses `createWebHashHistory` with no guards; adding a guard for `onboardingComplete` must not block the settings tab's ability to re-open the wizard for returning users.

**Test coverage:**
The `onboarding-module` falls under `src/application/**` and `src/infrastructure/**` coverage thresholds (80/70/80/80). Vue component tests for each wizard step require co-located PageObjects querying exclusively by `data-testid`. The wizard store and use cases require unit tests using `fakeModulePorts()`.

---

## Risks

| ID | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| RISK-POB-001 | `ClaudeCliPort` is not available when implementation begins (blocked on `claude-cli-chat-sidebar` spec) | high | med | Design step 3 with a graceful fallback: if `ClaudeCliPort` is not resolvable, show a static "Claude CLI status unknown" message rather than blocking the wizard. Define `ClaudeCliPort.isAvailable()` as the minimal interface the onboarding module needs; stub it in `MockBridge` returning `false`. |
| RISK-POB-002 | `onLayoutReady` fires before `SpecoratorView.onOpen()` mounts the Vue app, causing the router navigation to `/onboarding` to be lost | med | med | Do not navigate from `main.ts`. Instead, the wizard route component checks `onboardingComplete` in `onMounted` and navigates itself. `main.ts` only calls `activateView()` to ensure the panel is open; the panel self-routes on mount. |
| RISK-POB-003 | Users skip persona step and never return, leaving `userPersona` empty and degrading AI response quality | med | high | Implement the "gentle nudge" on the completion step (visible but not blocking) and surface the persona edit in the settings tab without additional steps. Accept that some users will never fill it in; the plugin must work correctly with an empty persona. |
| RISK-POB-004 | Example persona cards anchor users to specific professions, making the field feel irrelevant to users outside those examples | low | med | Use broadly applicable example personas (e.g., a PM, a solo business owner, an engineering lead) and include copy that explicitly invites deviation: "Write whatever feels true for you." Rotate or replace examples based on user feedback post-launch. |
| RISK-POB-005 | Merging vault config and template install into one step creates a step that is too long or too complex for non-technical users | low | low | Apply progressive disclosure: show the template install button prominently; put the folder path input in a collapsible "Advanced" section. The default path (`specs/`) requires no action from most users. The merged step should feel like one button click for the majority of users. |
| RISK-POB-006 | Persona content stored in `PluginSettings` (`userPersona: string`) is readable by any code that accesses settings, including the MCP server and future modules | low | low | This is by design: persona is user-provided context intended for AI assistance. Document that `userPersona` is user-controlled plain text; it is not a secret. If privacy controls are needed in future, that is a separate requirement. |
| RISK-POB-007 | The wizard route (`/onboarding`) is accidentally accessible post-completion, allowing users to re-trigger template installation with overwrite protection gaps | low | low | The existing overwrite protection (REQ-AVS-005) already skips creation if the file exists. The wizard can be re-entered from settings intentionally. The completion step should re-check `onboardingComplete` before re-running template install; the use case handles idempotency. |

---

## Recommendation

Adopt **Alternative A — Panel-based wizard (Vue Router route)**.

This is the approach that honours the existing architectural grain of the codebase (DDD layered, port-based, Vue/Pinia UI layer), produces the lowest implementation risk, and delivers the UX goals from `idea.md` (warm copy, example cards, progressive disclosure, graceful skip path).

For the four research questions, the recommendation set is:

- **Q1:** Guide users with three example persona cards, not a character count hint. Accompany the textarea with secondary copy reading "Two to four sentences is plenty." Store the raw string as `userPersona`.
- **Q2:** Panel-based wizard (Vue Router route `/onboarding`) auto-opened by `onLayoutReady` calling `activateView()`. The wizard self-routes on mount by checking `onboardingComplete`.
- **Q3:** Single textarea with example persona cards as scaffolding. Do not split into structured fields.
- **Q4:** Merge steps 4 and 5 into a single "Set up your workspace" step, yielding a five-step wizard. Mark this recommendation explicitly in requirements so the PM can override if they judge six steps more appropriate for transparency.

What still needs validating before Requirements:

1. `ClaudeCliPort` interface and its availability signal must be defined (or its absence handled) — TBD owner: architect / `claude-cli-chat-sidebar` spec.
2. The `buildSystemPrompt()` injection site must be identified; the architect must confirm the integration point before the PM can write the requirement for persona injection.
3. The settings tab entry point for re-running the wizard (opening the panel and navigating to `/onboarding`) needs a mechanism in `SpecoratorSettingTab` — a button, not a settings field. The PM should decide whether this is in scope for the onboarding feature or deferred.

---

## Sources

- PromptHub: Role-Prompting — Does Adding Personas to Your Prompts Really Make a Difference — https://www.prompthub.us/blog/role-prompting-does-adding-personas-to-your-prompts-really-make-a-difference
- ExpertPrompting / When Personas Don't Improve Performance — https://arxiv.org/html/2311.10054v3
- How to Craft a Powerful Persona for Your LLM Assistant (synthmetric) — https://synthmetric.com/persona-prompts-make-models-write-for-your-audience/
- How Is Generative AI Used for Persona Development? Systematic Review — https://arxiv.org/html/2504.04927v1
- Nielsen Norman Group: Wizards — Definition and Design Recommendations — https://www.nngroup.com/articles/wizards/
- Lollypop Design: Best Practices for High-Conversion Wizard UI Design — https://lollypop.design/blog/2026/january/wizard-ui-design/
- Edana: Stepper UI — Designing Clear Multi-Step Journeys — https://edana.ch/en/2026/04/26/stepper-ui-how-to-design-clear-reassuring-and-effective-multi-step-flows/
- WeWeb: Multi-Step Form Design — https://www.weweb.io/blog/multi-step-form-design
- Baymard Institute: 8 Recommendations for Creating Effective Input Fields — https://baymard.com/learn/input-fields
- Obsidian Developer Docs: Modals — https://docs.obsidian.md/Plugins/User+interface/Modals
- Obsidian Forum: Plugins with a lot to do at startup — https://forum.obsidian.md/t/plugins-with-a-lot-to-do-at-startup-being-async-onlayoutready/26205
- Claude Code in VS Code onboarding — https://code.claude.com/docs/en/vs-code
- Cursor IDE migration from VS Code — https://cursor.com/docs/configuration/migrations/vscode
- Obsidian Modal Form plugin — https://github.com/danielo515/obsidian-modal-form
- Ideaverse for Obsidian onboarding — https://www.linkingyourthinking.com/ideaverse-for-obsidian/onboarding-ideaverse

---

## Quality gate

- [x] Each research question is answered or marked open.
- [x] Sources cited.
- [x] >= 2 alternatives explored (three alternatives covered).
- [x] User needs supported by evidence (or assumptions explicit).
- [x] Technical considerations noted.
- [x] Risks listed with severity.
- [x] Recommendation made.
