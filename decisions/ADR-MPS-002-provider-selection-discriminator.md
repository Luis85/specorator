---
id: ADR-MPS-002
title: ProviderSelection discriminator and one-shot migration
status: accepted
date: 2026-05-21
deciders:
  - architect
  - dev
consulted:
  - qa
informed:
  - pm
supersedes: []
superseded-by: []
tags: [architecture, domain, migration, multi-provider]
---

# ADR-MPS-002 — `ProviderSelection` discriminator + one-shot migration

## Status

Accepted

## Context

WS-1 renamed `ClaudeCliPort` to `ChatTransportPort` (ADR-MPS-001) so the port
no longer names a vendor. The remaining vendor coupling in the codebase is the
settings shape: a flat `transportKind: 'auto' | 'api-key' | 'subscription' | 'degraded'`
field on `PluginSettings`, mirrored by a `transport: 'api-key' | 'subscription'`
string on every `ChatThreadRecord`. Both encodings conflate two orthogonal axes:

- **Provider** (vendor) — Claude or Cursor.
- **Mode** (execution surface) — HTTP/SSE API or local CLI subprocess.

Adding Cursor as a second provider with two modes apiece (SPEC-MPS-001 §4)
yields four explicit cells and two "forced" sentinels (`auto`, `degraded`).
Encoding all six as a flat string union (e.g. `'claude-api' | 'cursor-cli' | …`)
either blows up the union or smuggles structure into a string parser. Neither
is acceptable in the domain layer (ADR-008) where the selector and registry
need to address each axis independently.

Forces:

- **Structural addressability.** The selector switches on `provider` and
  `mode` separately (spec §4 truth-table rows R6–R15). A discriminated record
  preserves that; a string union forces a `.split(':')` parser at the
  decision site.
- **Type safety.** `ExplicitSelection` is exhaustive over four cells; the
  forced sentinels are a closed two-member union. The compiler enforces this
  via the `isExplicit` type-guard.
- **Persistence migration.** v0.x users have `transportKind: 'subscription'`
  on disk. The translation must be lossless, idempotent, and never throw —
  startup with a corrupt blob must degrade, not crash (NFR-MPS-006).
- **Backwards-compatible thread hydration.** Stored `ChatThreadRecord`s
  carry the legacy two-value `transport` string. They are translated on load
  (`'api-key' → { provider: 'claude', mode: 'api' }`,
  `'subscription' → { provider: 'claude', mode: 'cli' }`) so no user-visible
  data loss occurs.
- **One-shot, not gradual.** Running the migration on every load (idempotent,
  cheap, no async) is simpler than tracking a schema-version key and avoids
  the operational footgun of a half-migrated blob.

## Decision

We model the user's transport intent as a discriminated record:

```typescript
export type ProviderId = 'claude' | 'cursor'
export type ProviderMode = 'api' | 'cli'

export type ExplicitSelection = {
  readonly provider: ProviderId
  readonly mode: ProviderMode
}

export type ProviderSelection =
  | ExplicitSelection
  | { readonly forced: 'auto' | 'degraded' }

export function isExplicit(s: ProviderSelection): s is ExplicitSelection
export function selectionKey(s: ProviderSelection): string
```

`ProviderSelection` lives at `src/domain/chat/ProviderSelection.ts`. The
companion modules `ProviderRegistry.ts` (interface only) and
`ProviderCapabilities.ts` (readonly capability record) declare the registry
contract that WS-3 will implement.

`PluginSettings` gains six new fields per spec §2.7:

```typescript
readonly providerSelection: ProviderSelection
readonly cursorCliPath: string
readonly cursorApiPreview: boolean
readonly autoPreferProvider: ProviderId
readonly providerModel: Readonly<Record<ProviderId, string>>
readonly chatTabCap: number
```

`ChatThreadRecord` gains `title: string`, `forkParent: string | null`, and
its `transport` field becomes `{ provider: ProviderId; mode: ProviderMode }`.

We translate persisted v0.x data once, at plugin load, via a pure function
`migrateProviderSelection(input: RawStoredData): MigrationResult` at
`src/application/migration/migrateProviderSelection.ts`. The function:

1. Translates `settings.transportKind` per the table below, then **deletes**
   the legacy key.
2. For every `chatThreads` entry, translates the legacy `transport` string
   into an object, defaults `title` to `''`, and defaults `forkParent` to
   `null`. Already-migrated records are left untouched (idempotency).
3. Never throws. Per-record validation issues land in `result.errors`; the
   caller decides whether to discard malformed records.

`transportKind` translation table:

| Legacy `transportKind` | New `providerSelection` |
|---|---|
| `'auto'` | `{ forced: 'auto' }` |
| `'api-key'` | `{ provider: 'claude', mode: 'api' }` |
| `'subscription'` | `{ provider: 'claude', mode: 'cli' }` |
| `'degraded'` | `{ forced: 'degraded' }` |

`ChatThreadRecord.transport` translation:

| Legacy `transport` | New `transport` |
|---|---|
| `'api-key'` | `{ provider: 'claude', mode: 'api' }` |
| `'subscription'` | `{ provider: 'claude', mode: 'cli' }` |

The plugin entry point (`src/plugin/main.ts`) invokes the migration after
`loadData()` and before any adapter wiring, persists via `saveData()` when
`migrated === true`, and surfaces a sticky `NotificationPort.showError` only
on a defensively-caught throw (the function itself does not throw).

## Considered options

### Option A — Discriminated record + one-shot pure migration *(chosen)*

- Pros: Domain types address provider and mode independently; the selector
  is a pure switch over closed unions; migration is pure, testable, and
  cheap. Idempotency falls out of the shape check (`typeof transport ===
  'object'` short-circuits the translation).
- Cons: Adds two new modules (`ProviderSelection.ts`, `ProviderRegistry.ts`)
  and a one-time migration function.

### Option B — Flat string union (e.g. `'claude:api' | 'cursor:cli' | 'auto' | 'degraded'`)

- Pros: Smaller surface; one type to add.
- Cons: Every consumer has to parse `':'` to recover provider and mode; the
  selector grows a `parseSelection()` helper that this ADR is meant to
  avoid; new modes (e.g. `'sdk'`, `'mcp'`) require a combinatorial expansion
  of the union.

### Option C — Schema-versioned migration

- Pros: Future migrations have an obvious anchor (`schemaVersion: 2`).
- Cons: Premature. The current migration is one-shot, idempotent, and runs
  on every load anyway. A version key adds operational state (drift if
  forgotten, double-writes if mis-handled) without removing work.

### Option D — Lazy migration on first read of each field

- Pros: Zero startup cost.
- Cons: Migration code lives behind every consumer instead of in one place;
  `_storedData` ends up with a mixed schema on disk; idempotency proofs
  become harder. Rejected.

## Consequences

### Positive

- Domain types reflect the two orthogonal axes (provider, mode) explicitly.
- Selector reshape (WS-3, T-MPS-029) is a mechanical translation of the
  truth table — no string parsing on the hot path.
- Migration is pure, idempotent, and exhaustively tested (T-MPS-018..021).
- Adding a third provider or a new mode is an additive change to the union;
  the registry handles capability enumeration.

### Negative

- One additional layer of indirection (`isExplicit` guard) at every
  consumer site that needs to distinguish forced vs. explicit selection.
- The migration is invoked on every plugin load. Its idempotency check is
  O(threads) — acceptable at expected thread counts (≤ 100 per
  `chatTabCap`) but profile if that ceiling ever rises.

### Neutral

- The legacy `transportKind` and string `transport` constants survive in
  the `RawStoredData` input type (necessary for the migration to read
  them); they are absent from `PluginSettings` and `ChatThreadRecord`
  after migration.

## Compliance

- Unit tests under `tests/application/migration/migrateProviderSelection.*.test.ts`
  cover settings translation, thread translation, idempotency, and
  malformed-record handling (T-MPS-018..021, TST-MPS-01..03).
- Integration test at `tests/plugin/migration-on-load.test.ts` exercises
  three fixture `data.json` files (legacy `'auto'`, `'api-key'`,
  `'subscription'`) through a `MockBridge`-backed plugin lifecycle
  (T-MPS-026, NFR-MPS-006).
- `npm run verify` exercises typecheck, lint, unit tests, and bundle build.
- ADR-008 (narrow ports) is upheld: `ProviderSelection.ts`,
  `ProviderRegistry.ts`, `ProviderCapabilities.ts`, and
  `migrateProviderSelection.ts` have no `obsidian` / `child_process`
  imports.

## References

- SPEC-MPS-001 §2.2 (`ProviderSelection`), §2.3 (`ProviderRegistry`),
  §2.4 (`ProviderCapabilities`), §2.6 (`ChatThreadRecord`), §2.7
  (`PluginSettings`), §3 (migration contract).
- DES-MPS-001 §C3 (provider selection model), §C5 (`ProviderRegistry`),
  §C6 (`ProviderCapabilities`), §C7 (migration), §C12 (ADR draft).
- REQ-MPS-003, REQ-MPS-004, REQ-MPS-005, REQ-MPS-006, REQ-MPS-007,
  REQ-MPS-008, NFR-MPS-006.
- ADR-MPS-001 (port rename — prerequisite).
- ADR-008 (narrow ports — naming and import boundaries).
