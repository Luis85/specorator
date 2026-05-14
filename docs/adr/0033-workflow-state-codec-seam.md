---
id: ADR-0033
title: Introduce IWorkflowStateCodec to decouple FeatureRepository from YAML format
status: accepted
date: 2026-05-14
deciders:
  - Engineering
consulted: []
informed: []
supersedes: []
superseded-by: []
tags: [infrastructure, testing, persistence]
---

# ADR-0033 — Introduce `IWorkflowStateCodec` to decouple `FeatureRepository` from YAML format

## Status

Accepted

## Context

`FeatureRepository` currently imports two bare free functions from `WorkflowStateDocument.ts`:

```ts
import {
  deserializeWorkflowState,
  serializeWorkflowState,
} from '../workflow-state/WorkflowStateDocument';
```

These are called at four `deserialize` and one `serialize` call sites inside the repository. No interface exists between the repository and its codec. This creates two concrete problems:

**Testability gap.** Repository-level invariants — overwrite protection, retry-safe write ordering, error propagation — can only be tested by wiring a full `MockBridge` and relying on the real YAML codec to round-trip correctly. There is no way to test the repository's coordination logic independently from the parser.

**Implicit schema versioning.** The fallback `data.feature ?? data.title` in `validateWorkflowFrontmatter` is an undocumented v1 migration that has already accreted inside the parser. Without a seam, there is no extension point for a versioned `WorkflowStateCodecV2` or schema validation.

## Decision

We introduce `IWorkflowStateCodec` in `src/infrastructure/workflow-state/`:

```ts
export interface IWorkflowStateCodec {
  serialize(feature: Feature): string;
  deserialize(content: string): Feature | null;
}
```

We create `WorkflowStateCodec` (same directory) as the default implementation, delegating to the existing `serializeWorkflowState` / `deserializeWorkflowState` free functions in `WorkflowStateDocument.ts`. The free functions themselves are not modified.

We inject the codec into `FeatureRepository` as an optional constructor parameter (third, after the two-arg `(vault, settingsPort)` form established by ADR-adjacent C3 refactor). When omitted, `FeatureRepository` instantiates `WorkflowStateCodec` as the default. All existing construction call sites are zero-change.

```ts
constructor(
  private readonly vault: VaultPort,
  private readonly settingsPort: SettingsPort,
  codec?: IWorkflowStateCodec,
) {
  this.codec = codec ?? new WorkflowStateCodec();
}
```

## Considered options

### Option A — `IWorkflowStateCodec` injected into `FeatureRepository` (chosen)
- Pros: seam is internal to infrastructure; no domain or application layer change; optional parameter keeps all call sites unchanged; enables stub-codec tests.
- Cons: adds two new files; slight indirection for the default path.

### Option B — Generic type parameter `IFeatureRepository<TCodec>`
- Pros: makes the codec dependency explicit at the domain contract level.
- Cons: leaks a persistence format concern into the domain interface; every use case receiving `IFeatureRepository` must supply the type argument; higher ceremony for no benefit at the consumer boundary.

### Option C — Leave the direct import, accept the testability gap
- Pros: zero new files.
- Cons: repository coordination tests remain coupled to YAML parsing; schema migration has no clean extension point.

## Consequences

### Positive

- `FeatureRepository` can be tested in isolation with a stub codec — `save()` err path, `findBySlug()` malformed-file behaviour, and retry-safety invariants become independently verifiable.
- `WorkflowStateDocument.ts` and its free functions are unchanged. `WorkflowStateDocument.test.ts` continues to pass without modification.
- A future `WorkflowStateCodecV2` can handle schema migration without modifying `FeatureRepository` or any domain layer.
- The `createStageFile` idempotency invariant (writes stage file before workflow-state so retries are safe) can now be tested with a trivial stub rather than a full file-system round-trip.

### Negative

- Two new files (`IWorkflowStateCodec.ts`, `WorkflowStateCodec.ts`) in `src/infrastructure/workflow-state/`.
- Developers must remember to inject a stub or use the default in tests.

### Neutral

- ESLint import rules do not need updating — `WorkflowStateDocument.ts` remains importable from infrastructure; only `FeatureRepository` stops depending on it directly.
- The optional-parameter default pattern is consistent with how `PluginSettings.DEFAULT_SETTINGS` works: a sensible default exists, override is possible for tests.

## Compliance

- `FeatureRepository.ts` must contain no direct imports of `serializeWorkflowState` or `deserializeWorkflowState` after this ADR is implemented. Enforce via a lint rule targeting the specific import path if violations recur.
- `tests/infrastructure/bridge/FeatureRepository.test.ts` must exist with at least six stub-codec test cases covering: save err path, serialize call count, deserialize null → null return, deserialize null on extant file → throw, idea.md write retry-safety, codec called once per read.

## References

- ADR-001: DDD Layered Architecture (infrastructure must not leak into domain)
- ADR-008: Narrow Ports (precedent for interface-per-concern in infrastructure)
- ADR-009: Test Conventions (mirror layout, fake-ports factory)
- `src/infrastructure/workflow-state/WorkflowStateDocument.ts` (free functions wrapped by this ADR)
- `src/infrastructure/bridge/FeatureRepository.ts` (primary beneficiary)
