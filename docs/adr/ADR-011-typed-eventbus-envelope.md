---
id: ADR-011
title: Typed EventBus with envelope and trace correlation
status: accepted
date: 2026-05-10
references:
  - src/domain/shared/event-bus.ts
  - src/core/core-events.ts
  - src/modules/hello/hello-events.ts
---

# ADR-011 — Typed `EventBus` with envelope and trace correlation

## Decision

Cross-module communication uses a single in-process `EventBus<EventMap>` constructed by `createEventBus()` (`src/domain/shared/event-bus.ts`). `PluginCore` instantiates one bus and exposes it on every module's `ports.bus`. The bus has four shape commitments:

1. **Typed channels via declaration merging.** Modules add channels by augmenting `EventMap` from a side-effect import:
   ```ts
   // hello-events.ts
   declare module '@/domain/shared/event-bus' {
     interface EventMap {
       'hello:initialized': { moduleId: string }
     }
   }
   ```
   Channel keys follow `<module-id>:<event-name>`. Core emits its own `core:*` channels (`core:module-degraded`, `core:init-complete`, `core:destroy-complete`) declared in `src/core/core-events.ts`.

2. **Envelopes carry trace metadata, not just payload.** Every listener receives an `EventEnvelope<Payload>`:
   ```ts
   { channel, payload, eventId, traceId, parentId?, emittedAt }
   ```
   `traceId` propagates: if `emit({ parentId })` is supplied with a known `parentId`, the new envelope inherits the parent's `traceId`; otherwise the envelope starts a new trace where `traceId === eventId`. The bus retains the last `traceLimit` (default 200) trace entries to resolve `parentId` lookups.

3. **Snapshotted dispatch with priority.** When `emit()` fires, listeners are sorted by descending `priority` (default 0) and snapshotted before invocation. Listeners added or removed during dispatch take effect on the next emit, never the current one. Listener errors are caught per-listener, logged via the `onListenerError` hook (`PluginCore` wires this to `LoggerPort.error`), and never propagated to siblings.

4. **Async dispatch is bounded.** `emitAsync()` runs listeners with bounded concurrency (`asyncConcurrency`, default 4) — fire-and-forget rejections from `emit()` go through the same error hook.

Direct module-to-module imports are forbidden. ESLint rejects any `import … from '@/modules/<other>/…'` inside `src/modules/<id>/`.

## Rationale

- **Type-safe channels prevent silent renames.** A typo in a channel name is a compile error, not a runtime no-op. The merged `EventMap` is the canonical channel registry — adding a channel is a one-line `declare module` augmentation.
- **Envelopes give us correlation for free.** A v1 chat-sidebar action that triggers a write proposal that triggers an MCP-server event needs to be correlated end-to-end for diagnostics. Carrying `traceId`/`parentId` on every event makes this trivial without a separate tracing primitive. v2 agent flows reuse the same envelope shape.
- **Snapshotted dispatch matches Obsidian's expectations.** Plugin lifecycle hooks routinely add or remove subscribers in response to other events. Snapshotting prevents "listener registered during emit" classes of bugs and removes the need to copy listener arrays at every call site.
- **Per-listener error isolation prevents cascading failures.** A bad subscriber in one module must not block other modules from receiving the same event. The `onListenerError` hook is the single place where errors are observed and logged through `LoggerPort` — never `NotificationPort` (logger errors are not user-facing diagnostics).
- **Bus is its own port, not part of `IBridge` or any narrow port.** ADR-008 deliberately scoped the narrow ports to Obsidian/runtime concerns; the bus is a runtime-agnostic in-process primitive that lives in `src/domain/shared/`. Modules receive it via `ModulePorts.bus` so they do not import the implementation.

## Consequences

- Modules **must not** call sibling modules directly. The bus is the only shared substrate. ESLint enforces this; the listener-leak tripwire (ADR-012) catches the symmetric mistake of forgetting to release subscriptions.
- Every module that subscribes also stores the unsubscribe handle and releases it from `destroy()`. The `module-authoring.md` guide treats this as a hard rule. Component-lifecycle release (`onUnmounted`) is insufficient because modules outlive components.
- Channel names are versioned by module. A breaking-change rename is a new channel name plus a transition listener that bridges old → new for one release.
- Envelopes are **never** serialised. `core:module-degraded` carries an `Error` instance directly; consumers must read `error.message` only and never round-trip the envelope through JSON. v2 may introduce a serialisation port for cross-process trace export.
- `emit()` is fire-and-forget. Listeners that need to influence the caller use `emitAsync()` with a payload that includes a result-collecting object (e.g., `votes: string[]`), or a request/response convention layered on top.
- Do not emit bus events from `destroy()`. The leak tripwire (ADR-012) measures per-module listener delta; emissions during destroy can corrupt that delta.

## Alternatives considered

- **DOM `EventTarget` / `CustomEvent`.** Rejected: payloads are untyped, listeners run in DOM order rather than priority order, and there is no native trace metadata. Wrapping `EventTarget` to fix these problems is more code than the current implementation, with a worse type story.
- **An external pub/sub library (mitt, nanoevents).** Rejected: adds a runtime dependency for a primitive that is small enough to maintain in-tree. None of the candidates ship envelopes with trace correlation; each would need a wrapper anyway.
- **Per-module event buses with a parent broadcaster.** Rejected: `dependsOn` resolution at runtime is harder when listeners are scattered across multiple buses, and the snapshot semantics get harder to reason about.

## Notes for downstream work

- v2 agentonomous integration adds `agent:*` channels and reuses the envelope's `traceId` to correlate with MCP tool calls.
- A future `BusInspector` view (debug-only) reads `traceEntries` to render a per-trace event timeline; the bus already retains the last 200 entries with no extra plumbing needed.
- Settings live-reload uses `PluginCore.notifySettingsChanged` rather than a bus event, by design — the call site needs the migrated/validated settings object back, which a fire-and-forget event cannot return.
