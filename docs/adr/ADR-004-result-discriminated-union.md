---
id: ADR-004
title: Result<T, E> discriminated union for explicit error handling
status: accepted
date: 2026-05-01
---

# ADR-004 — `Result<T, E>` discriminated union for explicit error handling

## Decision

Domain methods and use cases return `Result<T, E>` (`src/domain/shared/Result.ts`) instead of throwing exceptions or returning nullable values.

```ts
type Result<T, E extends Error = Error> =
  | { ok: true;  value: T }
  | { ok: false; error: E }
```

## Rationale

Obsidian plugins share the same JS runtime as other plugins. An uncaught exception in plugin code can degrade or crash the host application. Explicit `Result` types:

- force callers to handle the error branch at the call site;
- make the error surface of domain and use case operations visible in TypeScript types;
- avoid silent failures from swallowed `try/catch` blocks;
- are straightforward to test — no need to `expect(...).toThrow()`.

## Consequences

- Domain aggregate methods (`activate`, `advanceStep`, `archive`) return `Result` instead of mutating or throwing.
- Use case `execute` methods return `Result`.
- Infrastructure methods that can fail (e.g. `FeatureRepository.save`) return `Result`.
- Pure I/O bridge methods (`readFile`, `writeFile`, etc.) use `Promise` and may reject; callers in use cases wrap them in `try/catch` and return `err(...)`.
- Exceptions are still used for programmer errors (invalid reconstitution arguments, missing bridge injection).
