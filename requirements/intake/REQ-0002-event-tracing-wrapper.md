---
id: REQ-0002
status: proposed
summary: "Every user interaction SHALL be wrapped in a typed Request object, dispatched through the runtime, and return a typed Response object; the full lifecycle SHALL be traced as events on the EventBus."
owner: "Luis85"
created: 2026-05-10
last_updated: 2026-05-10
source_issue: ""
related_design: ""
tags: [requirements, intake, architecture, tracing, event-bus]
priority: high
risk: medium
verification:
  - "A UserRequest value object exists in src/application/shared/ with requestId, traceId, action, input, and issuedAt fields"
  - "A UserResponse value object exists in src/application/shared/ with requestId, traceId, action, status, value/error, and durationMs fields"
  - "interaction:started, interaction:succeeded, and interaction:failed channels are declared via EventMap declaration merge"
  - "A RequestDispatcher (or equivalent) accepts a UserRequest, emits lifecycle events on the bus, and returns a UserResponse"
  - "All UI composables that invoke use cases do so through the dispatcher, not by calling UseCase.execute() directly"
  - "Unit tests cover: successful dispatch emits started + succeeded events with matching requestId/traceId; failing dispatch emits started + failed events; durationMs is non-negative"
statement: >
  The system SHALL wrap every user-initiated interaction (form submissions, command
  invocations, step advancements, and any other action originating from the UI layer)
  in a UserRequest value object before handing it to the application runtime.
  The runtime SHALL emit an interaction:started event on the EventBus when a request
  is received, execute the corresponding use case, emit an interaction:succeeded or
  interaction:failed event carrying the outcome and duration, and return a UserResponse
  value object to the caller.  The requestId and traceId carried by the request SHALL
  propagate into every EventBus envelope emitted during that interaction so that all
  events produced by a single user action share a common trace.
rationale: >
  The existing EventBus (src/domain/shared/event-bus.ts) already supports traceId
  propagation across envelopes, but use cases are called directly from UI composables
  with no event emission and no correlation ID. This makes it impossible to observe,
  replay, or audit a complete user interaction from a single trace. Wrapping every
  interaction in a request/response pair and emitting lifecycle events on the shared
  bus gives the runtime full observability into what the user triggered, what the
  system did, whether it succeeded, and how long it took — without modifying the
  domain or infrastructure layers. The pattern also provides a single choke-point for
  cross-cutting concerns such as loading-state management, optimistic updates, and
  future audit logging.
acceptance_criteria:
  - "A read-only UserRequest<TInput> type is declared in src/application/shared/ with fields: requestId (string), traceId (string), action (string), input (TInput), issuedAt (Date)."
  - "A read-only UserResponse<TOutput> type is declared in src/application/shared/ with fields: requestId (string), traceId (string), action (string), status ('success' | 'failure'), value (TOutput, present on success), error (Error, present on failure), durationMs (number)."
  - "Three EventMap channels are added via declaration merge in src/application/shared/interaction-events.ts: interaction:started carrying { requestId, traceId, action, issuedAt }; interaction:succeeded carrying { requestId, traceId, action, durationMs, value: unknown }; interaction:failed carrying { requestId, traceId, action, durationMs, error: Error }."
  - "A RequestDispatcher type (or equivalent factory function) is declared in src/application/shared/. Its dispatch method accepts a UserRequest<TInput> and a UseCase<TInput, TOutput>, emits the three lifecycle events on the injected EventBus, and returns Promise<UserResponse<TOutput>>."
  - "The traceId from the UserRequest is passed as EmitOptions.traceId on all three event emissions so all envelopes for the same interaction share a single trace."
  - "All existing UI composables that call use case execute() methods are updated to route through the dispatcher."
  - "No domain or infrastructure source file is modified by this change."
  - "npm run verify passes with no new type errors, lint violations, or coverage regressions."
traceability:
  upstream:
    - "docs/prd.md — observability and audit trail requirements"
    - "src/domain/shared/event-bus.ts — EventBus with traceId/parentId propagation already in place"
    - "src/application/shared/UseCase.ts — existing use-case contract that RequestDispatcher wraps"
  downstream:
    - "TBD — design doc after acceptance"
    - "TBD — implementation tasks after design acceptance"
---

## Notes

### Scope boundaries

- **In scope:** `src/application/shared/` new types + dispatcher; `src/ui/` composable updates to call through dispatcher; declaration-merge event channels.
- **Out of scope:** domain layer (`src/domain/`), infrastructure adapters, `ObsidianBridge`, `MockBridge`. No port interfaces change.
- **UseCase contract unchanged:** `UseCase<TInput, TOutput>.execute()` is not modified. The dispatcher is an application-layer wrapper, not a domain primitive.

### Design notes

`action` is a dot-separated string identifying the use case, e.g. `"feature:create"`, `"feature:advance-stage"`, `"feature:archive"`, `"feature:activate"`. Naming convention to be finalised in the design doc.

`traceId` on the `UserRequest` may be supplied by the caller (e.g. propagated from an upstream event envelope) or generated fresh by the dispatcher when absent, matching the convention already used by `createEventBus`.

The dispatcher is injected with the `EventBus` instance owned by `PluginCore`; UI composables obtain it via a new `BUS_PORT` InjectionKey or an extended `ModulePorts`, to be decided at design time.

### Open questions

1. Should `RequestDispatcher` be a class or a plain factory function `createRequestDispatcher(bus)`? Decide at design time.
2. Should a `BUS_PORT` InjectionKey be added to the narrow-ports family, or should the EventBus be threaded through `ModulePorts`? Decide at design time.
3. Do we want a `interaction:*` wildcard listener helper for test assertions, or is `onAny` sufficient? Decide at design time.
