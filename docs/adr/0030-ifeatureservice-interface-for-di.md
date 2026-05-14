---
id: ADR-0030
title: Introduce IFeatureService interface to decouple UI composables from the concrete class
status: accepted
date: 2026-05-14
deciders:
  - Engineering
consulted: []
informed: []
supersedes: []
superseded-by: []
tags: [ui, testing, dependency-injection]
---

# ADR-0030 — Introduce `IFeatureService` interface to decouple UI composables from the concrete class

## Status

Accepted

## Context

`FEATURE_SERVICE_KEY` in `src/ui/composables/useFeatureService.ts` is typed as `InjectionKey<FeatureService>` — the concrete application class, not an interface. This means any Vue component test that mounts a component calling `useFeatureService()` must provide a fully wired `new FeatureService(new FeatureRepository(bridge, bridge, bridge))`.

Observed consequences today:

- `tests/ui/composables/useFeatures.test.ts` imports `MockBridge`, `FeatureRepository`, and `FeatureService` and constructs the full infrastructure stack in every test harness.
- `tests/ui/views/Home.test.ts` does the same: `new FeatureService(new FeatureRepository(ports.bridge, ports.bridge, ports.bridge))`.
- Error-path tests must manufacture domain errors through real use-case execution rather than a simple `vi.fn().mockResolvedValue(err(...))`.
- Each new UI component test is forced to couple to three infrastructure layers that are irrelevant to its behaviour.

A secondary inconsistency: `useFeatures.ts` handles `Result<Feature[]>` from `loadFeatures` manually inside `withLoading`, while every other operation delegates to `syncResult`. The structural asymmetry exists because `syncResult` is typed for a single `Feature`, not `Feature[]`.

## Decision

We introduce `IFeatureService` in `src/application/feature/IFeatureService.ts`:

```ts
export interface IFeatureService {
  loadFeatures(): Promise<Result<Feature[]>>
  createFeature(title: string, area?: string): Promise<Result<Feature>>
  activateFeature(featureId: string): Promise<Result<Feature>>
  archiveFeature(featureId: string): Promise<Result<Feature>>
  advanceFeatureStage(featureId: string): Promise<Result<Feature>>
}
```

`FeatureService` is annotated `implements IFeatureService` — one-line addition, zero runtime change.

`FEATURE_SERVICE_KEY` changes from `InjectionKey<FeatureService>` to `InjectionKey<IFeatureService>`. The two provision sites (`SpecoratorView.ts`, `src/ui/main.ts`) continue to provide the concrete `FeatureService` — TypeScript's structural subtyping means `FeatureService implements IFeatureService` satisfies the key without any change at provision sites.

`useFeatures.ts` receives a `syncArrayResult(result: Result<Feature[]>): void` helper, making `loadFeatures` structurally uniform with all four single-feature operations.

## Considered options

### Option A — `InjectionKey<IFeatureService>` with new interface (chosen)
- Pros: decouples UI tests from infrastructure; no provision-site change; stub injection via `vi.fn()`.
- Cons: one new file; `FeatureService` gains one `implements` annotation.

### Option B — Keep `InjectionKey<FeatureService>` and accept the coupling
- Pros: zero files changed.
- Cons: every future component test must wire real infrastructure; error-path tests require contorted setup.

### Option C — Replace `FeatureService` with a Pinia action layer
- Pros: eliminates the service/store duality.
- Cons: large refactor; outside scope of this ADR; would require revisiting ADR-003 and the store architecture.

## Consequences

### Positive

- UI component tests can provide a `vi.fn()`-backed stub — no `MockBridge`, no `FeatureRepository`, no `FeatureService` imports required.
- Error-path testing becomes a one-liner: `makeStubService({ loadFeatures: vi.fn().mockResolvedValue(err(new Error('vault error'))) })`.
- `useFeatures.ts` becomes structurally uniform: all five operations follow `withLoading(async () => { syncXxx(...) })`.
- The seam is consistent with ADR-008's interface-segregation principle and ADR-001's inward-only import direction (`ui → application`).
- `FeatureService` remains the concrete class injected at plugin bootstrap — no change to production wiring.

### Negative

- One new file (`IFeatureService.ts`) in `src/application/feature/`.
- Test harness migration in `useFeatures.test.ts` and `Home.test.ts` (mechanical search-and-replace).

### Neutral

- The one integration test in `useFeatures.test.ts` that asserts file-system side effects (checks `bridge.getAllFiles()` after `advanceFeatureStage`) may retain its `MockBridge` backing — the interface does not preclude using real infrastructure when integration behaviour is under test.

## Compliance

- `FEATURE_SERVICE_KEY` must be typed `InjectionKey<IFeatureService>` after this ADR. ESLint `no-restricted-imports` can ban direct `FeatureService` imports from `src/ui/` if violations recur.
- New Vue component tests that use `useFeatureService` must not import `FeatureRepository`, `FeatureService`, or `MockBridge` for their test harness setup (stub-only). Enforce via code review; add a lint rule if violations accumulate.
- `Feature` has a private constructor — plain object literals do not satisfy `Result<Feature>`. Use `Feature.reconstitute()` in all stub factories.

## References

- ADR-001: DDD Layered Architecture (ui → application import direction)
- ADR-003: Vue 3 Composition API and Hash-Mode Router
- ADR-008: Narrow Ports Replace IBridge (precedent for interface extraction)
- ADR-009: Test Conventions (component tests via PageObject + stub injection)
- `src/ui/composables/useFeatureService.ts` (primary change site)
- `src/ui/composables/useFeatures.ts` (secondary change — `syncArrayResult`)
