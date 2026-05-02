---
id: IDEA-SUI-001
title: Standalone UI with multilang support and DDD architecture
stage: idea
feature: standalone-ui-multilang
status: accepted
owner: analyst
created: 2026-05-01
updated: 2026-05-01
---

## Problem statement

The Specorator plugin UI is tightly coupled to the Obsidian runtime. Every UI change requires a running Obsidian instance to test, which slows the development loop and makes automated testing of UI states impossible without mocking the entire Obsidian environment. Additionally, the plugin has no internationalisation support, limiting its reach to English speakers only. The codebase also lacks a clear layering strategy, which will make it brittle as features are added.

## Primary users

- Plugin developers iterating on Specorator UI features (need a fast, Obsidian-free dev loop)
- End users who work in non-English languages (need a localised interface)
- Contributors from the community (need a clean, well-layered codebase to navigate safely)

## Success criteria

- A developer can run `npm run dev` and see a fully functional UI in a browser without Obsidian installed.
- All UI component tests pass without an Obsidian instance.
- The UI renders labels in English and German based on a runtime locale setting.
- The codebase has clearly named layers (domain / application / infrastructure / UI) with no upward imports.

## Constraints

- Must not break the existing Obsidian plugin entry point.
- The bridge abstraction must be the only change required to swap environments (Obsidian ↔ browser).
- Must remain compatible with Obsidian's isolated browser renderer (no Node.js APIs in UI layer).
- Language files must be plain TypeScript modules — no JSON or YAML parsing at runtime.

## Research questions

- Which mock-bridge data format produces the most realistic dev-fixture experience?
- What is the recommended vue-i18n v9 composition API setup to remain tree-shakeable?
- How should DDD repositories interact with Pinia stores without leaking domain types into the view layer?

## Preliminary scope

**In scope:** IBridge abstraction, MockBridge, standalone Vite entry, vue-i18n EN/DE, DDD layers (domain / application / infrastructure / UI), Vitest unit tests for domain and application layers.

**Out of scope:** CI integration of the dev server, additional languages beyond EN/DE, runtime language detection from browser locale.
