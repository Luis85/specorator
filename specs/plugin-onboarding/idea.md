---
id: IDEA-POB-001
title: "Plugin onboarding flow"
stage: idea
feature: plugin-onboarding
status: accepted
owner: pm
created: 2026-05-05
updated: 2026-05-05
references:
  - github: "luis85/specorator#162"
  - github: "luis85/specorator#161"
  - github: "luis85/specorator#164"
---

## Problem statement

A new user installing Specorator faces several immediate barriers before they can do anything useful: they need to know what the plugin does, configure their vault folder, install the agentic-workflow template, and (optionally) set up Claude CLI for AI assistance. Without a guided flow, users must discover these steps from documentation, which creates friction and drops the conversion rate from install to first meaningful action. Additionally, without knowing anything about the user, the AI assistant cannot give relevant, personalised responses — a PM gets the same answer as an engineering lead, which degrades trust in the tool. The onboarding flow solves both: it guides the user to a working state and collects the personal context that makes every subsequent AI interaction more useful.

## Primary users

- **First-time installers** who have never used Specorator and need to reach a working state quickly.
- **Non-technical users** (founders, PMs, business analysts) who may be unfamiliar with Obsidian vault configuration and need clear, plain-language guidance.
- **Any user whose AI responses feel generic** — the onboarding persona step is also accessible from settings to let users update or add their introduction at any time.

## Success criteria

- A new user completes onboarding in under three minutes and arrives at the workflow navigator or chat sidebar in a ready state.
- The persona step ("Tell us about yourself") uses warm, non-technical copy; provides three example persona cards as inspiration; and has a de-emphasised "I'll do this later" option — not a cancel button.
- Claude CLI availability is checked and communicated in plain language: "Your AI assistant is ready" or "To get AI help, you'll need Claude installed" — never "ClaudeCliPort unavailable" or similar.
- The vault configuration step defaults sensibly and only shows advanced options on demand.
- The template installation step reuses the existing install use case with overwrite protection.
- Completing onboarding sets `onboardingComplete: true` and `userPersona: string` in `PluginSettings`.
- The user's persona is injected as the highest-priority layer in every system prompt: "About the person you're helping:\n{userPersona}".
- A user who skips the persona step receives a gentle nudge at completion and can return to it from settings at any time.
- The flow works in both Obsidian and standalone browser UI contexts.

## Constraints

- Must not introduce any breaking changes to `PluginSettings` — additions only (`userPersona: string`, `onboardingComplete: boolean`).
- The persona textarea must feel like a friendly invitation, not a form field. No labels like "User persona", "Configure persona", or "Role and responsibilities".
- Claude CLI check must use `ClaudeCliPort.isAvailable()` — never call the CLI directly from the UI layer.
- Onboarding must remain accessible from settings after initial completion so users can update their persona or re-run installation.
- Skipping onboarding entirely must not break any plugin functionality — all features must work with an empty persona.

## Research questions

- What is the shortest persona description that meaningfully improves AI response relevance — should we guide users with a character count hint or example prompts?
- Should the onboarding wizard block the main UI (modal) or run in the main panel? Modal reduces distractions but may feel heavy on first install.
- How should the persona field handle multi-paragraph input — single textarea or structured fields (role, team, context)?
- Is a six-step wizard the right length, or should steps 4 and 5 (vault config and template install) be merged?

## Preliminary scope

**In scope:** Six-step wizard (welcome → persona → Claude check → vault config → template install → completion); `PluginSettings` additions (`userPersona`, `onboardingComplete`); `ClaudeCliPort.isAvailable()` integration; persona injection into `buildSystemPrompt()`; skip-and-return path; re-accessible from settings.

**Out of scope:** Persona versioning or history, team/multi-user persona management, guided tour of plugin features post-onboarding (separate concern), advanced Claude CLI configuration (provider, model selection — deferred).
