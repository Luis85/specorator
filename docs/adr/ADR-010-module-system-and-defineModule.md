---
id: ADR-010
title: Module system with the defineModule contract
status: accepted
date: 2026-05-10
references:
  - src/modules/module.ts
  - src/modules/index.ts
  - src/core/plugin-core.ts
  - docs/module-authoring.md
---

# ADR-010 — Module system with the `defineModule` contract

## Decision

Feature areas live as bounded-context **modules** under `src/modules/<module-id>/`. Each module is a single descriptor produced by `defineModule()` (`src/modules/module.ts`) and registered in the central array `ALL_MODULES` exported from `src/modules/index.ts`. Modules declare what they need from the rest of the plugin and what they contribute to it through one shape:

| Field | Purpose |
|---|---|
| `id` | Unique kebab-case identifier; used as the prefix for command IDs (`hello:open-view`) and event channels (`hello:initialized`). |
| `dependsOn` | Optional sibling-module IDs. `PluginCore` topo-sorts modules so dependencies init first; if a dependency is degraded, dependants are skipped and emitted as `core:module-degraded`. |
| `commands` | Obsidian commands registered through the descriptor — never via `app.commands.addCommand` directly. |
| `uriActions` | URL action handlers routed by `PluginCore.handleUri()` (see ADR-012). |
| `views` | View intents (id + label). W4/W11 wire them to the router. |
| `settingsSchema` | Declarative field list (`toggle`, `text`, `number`, `dropdown`) rendered by the central settings tab. |
| `settingsKey` / `settingsVersion` / `settingsDefaults` / `migrate` / `validateSettings` | Per-module settings slice with versioned migration; `_moduleVersions` tracks stored versions. |
| `messages` | Flat dotted-key locale messages merged into vue-i18n. |
| `init` / `onSettingsChange` / `destroy` | Lifecycle hooks; receive a `ModulePorts` object containing the five narrow ports (ADR-008), the typed `EventBus` (ADR-011), and `TranslationPort`. |

Modules receive **all dependencies through `ModulePorts`**. They never import other modules directly; cross-module communication goes through `EventBus`. ESLint enforces this by banning `@/modules/<other>/*` imports inside any `src/modules/<id>/` directory.

Vue components owned by a module live in the same directory and use `<script setup>` plus `<style scoped>`. Sibling-module SFC imports are forbidden by the same ESLint rule.

## Rationale

- **Bounded contexts have one declared seam.** Before W2, feature wiring was scattered across `main.ts`, the settings tab, command registration, and ad-hoc Vue mounts. The descriptor centralises all of it on one object that can be statically analysed, scaffolded (`npm run scaffold:module`), and tested with `fakeModulePorts()` (ADR-009).
- **Declarative wins over imperative for cross-cutting registration.** Commands, settings fields, locale messages, and URI actions are data — `PluginCore` reads the descriptor array once and registers everything in lockstep. Per-module imperative `onload()` hooks would push the same registration logic into every module.
- **The descriptor is the test boundary.** A unit test calls `helloModule.init(fakeModulePorts(), settings)` and asserts on bus emissions; no Obsidian runtime is required. This keeps W10's coverage thresholds reachable without component mounts.
- **Modules can degrade independently.** `PluginCore.initModule` catches init errors, calls `destroy()` defensively, records the failure on `degradedModules`, emits `core:module-degraded`, and skips dependants. One broken module does not stop the plugin from loading.
- **Settings versioning lives with the module that owns the data.** A migration that knows about a `hello.showBadge` key belongs in the `hello` module file, not in a global migration registry that grows with every feature.

## Consequences

- New feature areas start with `npm run scaffold:module -- <name>` (W12) which produces module file, events file, view, and test mirroring `tests/modules/<name>/`.
- Cross-module collaboration is **always** through `EventBus`. Any direct `import { otherModule }` inside `src/modules/<id>/` is an ESLint error (ADR-011 has more on the bus contract).
- `ALL_MODULES` is the single registration list. Adding a module is one import and one array-push edit; nothing else in `main.ts` changes.
- `PluginCore` validates the registry at init time: duplicate `id`, duplicate `settingsKey`, reserved `_`-prefixed `settingsKey`, unknown `dependsOn`, self-dependency, and dependency cycles all throw before any module runs.
- Per-module settings live in their own top-level keys in the stored data blob (`{ specorator: …, hello: …, _moduleVersions: { hello: 1 } }`). The legacy flat `PluginSettings` shape stays under the reserved `specorator` key (handled by `coreSettingsModule`).
- Modules must release every bus subscription acquired in `init()` from `destroy()`. `PluginCore` measures listener delta per module and logs a `listener leak detected` warning on teardown when fewer listeners are released than were registered (ADR-012). Component-lifecycle teardown (`onUnmounted`) is **not** a substitute — modules outlive components.

## Alternatives considered

- **Per-module classes with an `onload()` method.** Rejected: pushes registration plumbing into every module and makes static analysis of the registry harder. The descriptor is a value, not a class — easier to scaffold, snapshot, and diff in tests.
- **Global event hub without a descriptor.** Rejected: leaves command, settings, and locale registration scattered with no single seam to enforce ESLint rules against.
- **Auto-discovery of modules by directory scan at build time.** Rejected: explicit registration in `ALL_MODULES` keeps the dependency graph readable and makes ordering bugs visible in the diff.

## Notes for downstream work

- W11 (#109) wires `ModuleViewIntent` IDs into the router; modules emit a `view-open` event and the router resolves it.
- W13 (#163) extends `CorePorts` with `mcpServer?: ObsidianMcpServerPort`. Modules cannot register MCP tools directly — see ADR-013 for the extension seam.
- v2 agent runtime introduces `dependsOn` checks against agent capabilities; the validator already supports cross-module dependency edges.
