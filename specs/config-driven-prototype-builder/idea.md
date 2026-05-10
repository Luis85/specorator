---
id: IDEA-CDP-001
title: "Config-driven prototype builder"
stage: idea
feature: config-driven-prototype-builder
status: draft
owner: pm
created: 2026-05-10
updated: 2026-05-10
references:
  - external: "https://github.com/lowdefy/lowdefy"
  - external: "https://lowdefy.com/docs"
  - adr: "ADR-001"
  - adr: "ADR-004"
  - adr: "ADR-008"
  - spec: "claude-cli-chat-sidebar"
---

## Problem statement

Specorator users need to move from a written specification to a tangible, demonstrable prototype without leaving the vault and without writing application code. Today, the workflow ends at written artifacts (idea, requirements, design, spec, tasks). There is no way to validate flow, layout, and data shapes interactively. Stakeholders cannot click through a proposal, and feedback loops stretch across days because every design tweak requires a developer.

A config-driven prototype builder closes this gap. The user authors a single human-readable file (markdown + YAML frontmatter) that describes pages, blocks, data, and actions. The plugin renders that file as a live multi-page app inside an Obsidian view tab. AI assists authoring through the existing Claude CLI Chat Sidebar — same write-proposal review flow that already governs other vault edits.

The conceptual model is borrowed from [Lowdefy](https://github.com/lowdefy/lowdefy): YAML config interpreted at runtime, operator-object expressions instead of `eval`, blocks as a typed component registry. The implementation is a Vue-3-native thin runtime — Lowdefy is React-based and not directly reusable — sized for in-Obsidian rendering, not standalone deployment.

## Primary users

- **Non-technical founders, PMs, designers** who want to mock multi-page flows with real data shapes without engineering involvement.
- **Solo developers** validating UX choices before writing production code; prototype.md becomes living spec.
- **Stakeholders / reviewers** who click through a real interface as part of feature acceptance, replacing static screenshots.

## Success criteria

- A user can author `specs/{slug}/prototype.md` (frontmatter config + free-text body) and open it in a new Obsidian view tab as a runnable multi-page app.
- The rendered prototype supports navigation between pages, input blocks bound to local state, container blocks (Card, List, Box), and display blocks — all from declarative config.
- Three data adapters work end-to-end: `vault-file` (JSON / CSV / MD-frontmatter), `feature-data` (Specorator features), `inline` (config-embedded fixtures). No HTTP in v1.
- An expression engine resolves operator-object references (`_state`, `_data`, `_item`, `_if`, `_format`, …) without using `eval`/`Function()` — passes Obsidian plugin review.
- Schema validation via Zod produces precise error locations; failures show inline in the prototype view, sibling blocks still render.
- The Claude CLI Chat Sidebar can read and propose edits to `prototype.md` through its existing write-proposal review card. Zero new AI infrastructure.
- The prototype is a sibling artifact under `specs/{slug}/` — no new workflow stage, no change to FEATURE_STEPS, no change to the spec-first gate.
- Behind a `enablePrototypes` PluginSettings flag (default `false`) for safe rollout.

## Constraints

- Stack stays Vue 3 + TypeScript. Lowdefy is not a dependency.
- No `eval` or `Function()` constructor anywhere in the runtime — Obsidian plugin review excludes plugins that ship arbitrary code execution.
- All Obsidian I/O goes through the existing narrow ports (ADR-008). One new narrow port joins the family: `PrototypeDataPort` (single-method, dispatched by adapter id).
- Domain mutations and use cases continue to return `Result<T, E>` (ADR-004); no exceptions across layer boundaries.
- DDD layered import direction (ADR-001) is preserved — `domain/prototype` depends on nothing; renderer in `ui/prototype` consumes use cases plus port keys.
- Custom user blocks are explicitly out of scope for v1 — a curated built-in library only. Composition / SFC loading deferred.
- Coverage thresholds 80/70/80/80 enforced on all new source files via `npm run verify`.

## Research questions

- What is the minimum operator surface that covers ~80% of realistic prototype configs? The proposed v1 set is ~15 operators (`_state`, `_data`, `_item`, `_event`, `_url_query`, `_url_params`, `_if`, `_eq`, `_not_eq`, `_and`, `_or`, `_not`, `_get`, `_format`, `_length`, `_filter`, `_ref`). Should `_request` (HTTP) and `_js` (sandboxed JS) be deferred to v2 or be reserved as schema slots from day one?
- Should the runtime cache resolved data per session (and across opens), or always re-resolve on view mount? Caching simplifies snappy reopens but complicates `RefreshData` semantics.
- How should the prototype tab respond when the underlying `prototype.md` is edited externally? Hot reload via `MetadataCachePort.onFileChange`, or explicit "reload" button only?
- What is the right boundary between the prototype view and the existing Specorator workflow view — separate tabs (current proposal) or a tab pane inside the workflow view? Separate tabs feel cleaner; pane is closer to a single feature workspace.
- How should validation errors be surfaced to the AI in the chat sidebar so the next proposed edit fixes them? Pass the Zod error path + message into the next system-prompt context layer? Treat validation as a tool-call result?

## Preliminary scope

**In scope (v1):**

- New artifact `specs/{slug}/prototype.md` (frontmatter + body markdown).
- Zod-validated config schema versioned `specorator: 0.1`, namespace `prototype:`.
- Domain operator engine (~15 operators, pure functions, no IO).
- `PrototypeDataPort` narrow port + three adapters (`vault-file`, `feature-data`, `inline`).
- Built-in block library (~20 components): containers (Page, Box, Card, List), display (Heading, Text, Badge, Markdown, Empty), inputs (TextInput, TextArea, NumberInput, Checkbox, Toggle, Select, RadioGroup, DatePicker), action (Button, Link, IconButton).
- Action types: `Navigate`, `SetState`, `ResetState`, `RefreshData`, `Notify`. Action lists with `try` / `catch` semantics (Lowdefy parity).
- Vue 3 renderer (`PrototypeView.vue`) registered as Obsidian view; Pinia store for runtime state per prototype.
- `FeatureRepository` extension: `readPrototype(slug)`, `writePrototype(slug, config)` with overwrite-protection per AVS-005.
- Command palette entry `Specorator: Open Prototype` + button on workflow nav.
- CCS reuse: prototype.md edits flow through existing write-proposal review card.
- `PluginSettings.enablePrototypes` feature flag (default `false`).
- Storybook stories per built-in block; PageObject tests for renderer; golden-file tests for operator engine.

**Out of scope (deferred):**

- Custom user-authored blocks (composition templates or .vue file loading).
- HTTP / fetch data adapter; auth and secrets handling.
- Standalone export (Lowdefy's `lowdefy build` equivalent / runnable Vite repo generation).
- Visual / drag-and-drop block editor.
- Multi-user or real-time collaboration on prototype.md.
- `_js` operator (QuickJS-emscripten sandbox).
- Date math, regex, server-only operators, request engine, secret store.

## Open questions to resolve before requirements

1. Tab vs pane integration with the existing workflow view (research question #4).
2. Hot-reload contract on external edits (research question #3).
3. Whether the AI proposal review card needs prototype-specific rendering (block diff) or the existing markdown diff is acceptable for v1.
