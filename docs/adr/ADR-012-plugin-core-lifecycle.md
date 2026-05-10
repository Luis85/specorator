---
id: ADR-012
title: PluginCore owns the module lifecycle, URI dispatch, and MCP server start/stop
status: accepted
date: 2026-05-10
references:
  - src/core/plugin-core.ts
  - src/plugin/main.ts
  - src/core/core-events.ts
---

# ADR-012 — `PluginCore` owns the module lifecycle, URI dispatch, and MCP server start/stop

## Decision

`PluginCore` (`src/core/plugin-core.ts`) is the single object responsible for orchestrating registered modules across the plugin's lifetime. The Obsidian `Plugin` subclass (`src/plugin/main.ts`) constructs one `PluginCore` in `onload()`, hands it `ALL_MODULES` plus a `CorePorts` bag, and delegates four distinct responsibilities to it:

1. **Module init in dependency order.** `init(rawSettings)` runs once. It validates the registry (duplicate IDs, duplicate `settingsKey`, reserved `_`-prefixed keys, unknown / cyclic / self-dependencies, duplicate URI actions), topo-sorts `dependsOn` edges with Kahn's BFS, runs per-module migration via `migrateSettings`, and then calls `mod.init(modulePorts, settings)` for each module in topological order. Modules whose dependencies degraded are skipped; their failure is recorded on `degradedModules` and emitted as `core:module-degraded`. After all modules complete (or degrade), `PluginCore` starts the MCP server (if provided) and emits `core:init-complete` with the degraded count.

2. **URI dispatch in one place.** During `init`, `PluginCore` indexes every module's `uriActions[].action` into a single map. The Obsidian `Plugin` calls `core.handleUri(searchParams)` from its single `registerObsidianProtocolHandler('specorator', …)` callback. Modules **never** register their own protocol handlers. Duplicate `action` values across modules throw at `init` time before any handler runs.

3. **MCP server lifecycle.** When `CorePorts.mcpServer` is provided (`ObsidianMcpServerAdapter` in production, undefined in unit tests), `PluginCore.init` calls `mcpServer.start()` after module init succeeds, and `destroy()` calls `mcpServer.stop()` after module teardown. Failures from start/stop are logged but do not block the rest of the lifecycle. See ADR-013 for the server itself.

4. **Listener-leak tripwire.** Before each `mod.init`, `PluginCore` snapshots `bus.listenerCount()` and stores the per-module delta in `leakMap`. On `destroy()`, modules are torn down in reverse topological order; for each module, the bus listener count is sampled before and after `destroy()`. If `released < subscribed`, `PluginCore` logs a `listener leak detected` warning and increments a leak counter that is published with `core:destroy-complete`.

`PluginCore.notifySettingsChanged(settingsKey, rawValue)` is the single live-reload entry point: it runs `validateSettings` first, caches the validated value in `moduleSettingsMap`, and then invokes the module's `onSettingsChange` hook. The Obsidian `Plugin` calls this from `updateSettings` and `updateModuleSettings` and persists the validated (possibly coerced) value back to disk.

## Rationale

- **Single owner removes "who registers what" ambiguity.** Pre-W4, command registration, settings tab population, URI handler dispatch, and i18n message loading lived in `main.ts` and grew with every new feature area. Pulling all of it into `PluginCore` makes `main.ts` a thin Obsidian-shape adapter and lets the registry validators run before any side effect.
- **Topological init makes `dependsOn` honest.** A module that needs another module's bus channels alive at `init` time can declare it; `PluginCore` guarantees the order. Without topo-sort, declaration-order coupling becomes implicit.
- **Listener-leak detection at the bus boundary catches the most common module bug.** Modules subscribe in `init` and are expected to release in `destroy`. Measuring listener delta at the only place that owns both lifecycle ends (the bus) means leaks surface at the right spot, in the right log line, instead of as memory growth in long-running Obsidian sessions.
- **One protocol handler simplifies extension.** Obsidian fires the protocol handler synchronously per URL; routing inside `handleUri` lets modules contribute actions without each fighting for the protocol slot, and lets v1 stub handlers (`open-chat`, `focus-chat`) live in `main.ts` while real handlers slot in once their owning module ships.
- **MCP start/stop is keyed to module readiness.** Starting the MCP server before modules finish initialising would expose tool calls to a half-initialised plugin; starting it after (and stopping it before module teardown) keeps invariants ordered.

## Consequences

- Modules cannot call `app.commands.addCommand`, `app.workspace.registerObsidianProtocolHandler`, or `app.metadataCache.on` directly — those go through the descriptor (commands), `uriActions` (URI), or `MetadataCachePort` (metadata). ESLint enforces no `obsidian` imports outside `src/infrastructure/obsidian/` and `src/plugin/`.
- `init()` is idempotent-by-throw: a second call throws. The Obsidian `Plugin` calls it exactly once.
- `onunload()` is synchronous (Obsidian contract). `core.destroy()` is fired and not awaited; module `destroy` implementations must be fast and side-effect-light.
- Module destroy errors are caught and logged (`module destroy failed`); they do not stop subsequent modules from being torn down.
- Settings live-reload always validates first. If `validateSettings` rejects the new value, `onSettingsChange` is **not** called and the persisted blob remains the previous value.
- `core:module-degraded` is emitted whenever (a) a module's init throws, (b) i18n message merge throws, or (c) any of its `dependsOn` is already degraded. UI may surface degraded modules in a settings panel; v1 only logs them.

## Alternatives considered

- **Each module owns its lifecycle (`onload`/`onunload` per module).** Rejected: spreads `app.*` registration across modules, breaks the ESLint boundary, and makes `dependsOn` impossible to enforce.
- **Lifecycle hooks via the bus (`emit('core:init')` and listen).** Rejected: hides ordering, makes init failures hard to attribute to a specific module, and gives no return value to the lifecycle owner.
- **Multiple `PluginCore` instances per concern (commands core, settings core, …).** Rejected: every concern needs the same module list. One `PluginCore` per `Plugin` keeps state colocated.

## Notes for downstream work

- v2 agentonomous integration introduces `mod.dependsOnAgent?: AgentCapabilityId[]` and `PluginCore` short-circuits modules whose required agent capabilities are missing — same degraded-module mechanism.
- Settings live-reload triggers a downstream `vue-i18n` re-merge when locale settings change; `applyModuleMessages` is already idempotent.
- A future "module restart" admin command would call `mod.destroy?()` then `mod.init(...)` for one module; the registry validator and `leakMap` already work per-module.
