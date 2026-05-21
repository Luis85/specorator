---
id: ADR-MPS-001
title: Rename ClaudeCliPort to ChatTransportPort
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
tags: [architecture, ports, naming, multi-provider]
---

# ADR-MPS-001 — Rename `ClaudeCliPort` to `ChatTransportPort`

## Status

Accepted

## Context

`ClaudeCliPort` was named when only one Claude SDK transport existed. The port
now serves both the Anthropic SDK adapter and the `claude` CLI subprocess
adapter, and the multi-provider-agent-sidepanel feature (SPEC-MPS-001) adds
two further adapters for Cursor (API and CLI). The "ClaudeCli" prefix is
provider-specific and CLI-specific; it is misleading for an interface that
abstracts arbitrary chat transports across providers and execution modes.

Forces:

- **Domain naming hygiene.** Port names describe a capability, not a vendor.
  Mis-named ports leak vendor coupling into consumers.
- **Migration cost.** The port and its five exported types
  (`ClaudeCliPort`, `ClaudeCliError`, `ClaudeCliErrorCode`,
  `ClaudeCliQueryOptions`, `ClaudeCliStreamOptions`), the InjectionKey
  (`CLAUDE_CLI_PORT`), and the composable (`useClaudeCliPort`) appear across
  ~33 files in `src/`. A manual rename is error-prone.
- **Drift risk.** Once the rename lands, a follow-up PR could accidentally
  re-introduce the legacy names. We need a mechanical guard.
- **Backwards compatibility.** Downstream code-generators or third-party
  templates may still target the old import path during the release in which
  the rename ships.

## Decision

We rename the port and its associated symbols per the canonical mapping in
SPEC-MPS-001 §2.1 / DES-MPS-001 §C2:

| Before | After |
|---|---|
| `ClaudeCliPort` | `ChatTransportPort` |
| `ClaudeCliError` | `ChatTransportError` |
| `ClaudeCliErrorCode` | `ChatTransportErrorCode` |
| `ClaudeCliQueryOptions` | `ChatTransportQueryOptions` |
| `ClaudeCliStreamOptions` | `ChatTransportStreamOptions` |
| `CLAUDE_CLI_PORT` (InjectionKey) | `CHAT_TRANSPORT_PORT` |
| `useClaudeCliPort` | `useChatTransportPort` |

We also extend `ChatTransportErrorCode` with two additive members required by
later workstreams: `ATTACHMENT_TOO_LARGE` (REQ-MPS-044) and
`PROVIDER_UNAVAILABLE` (cursor preview gating).

We ship the rename with three mechanical aids:

1. A codemod under `scripts/codemod/rename-claude-cli-port.mjs` that performs
   the symbol substitution across `src/`, `tests/`, and `templates/`. The
   codemod is idempotent and supports `--dry-run`.
2. A one-release re-export shim at `src/ui/composables/useClaudeCliPort.ts`
   re-exporting `useChatTransportPort`. The shim carries an `@deprecated`
   JSDoc tag and is removed in the next minor version.
3. A custom ESLint rule `no-legacy-claude-cli-port-names` that errors on any
   re-introduction of the legacy identifiers. The shim file is allow-listed
   by path.

## Considered options

### Option A — Rename now, no shim

- Pros: Cleanest tree. No deprecated surface to remove later.
- Cons: Breaks any pinned downstream consumer in the same release. Risk of
  out-of-tree breakage we cannot observe in CI.

### Option B — Rename now, one-release shim *(chosen)*

- Pros: Mechanical guard via lint rule; downstream consumers get one release
  to migrate; shim removal is a follow-up ADR-tracked change.
- Cons: One transient deprecated re-export file. Mitigated by lint rule that
  allow-lists exactly that file.

### Option C — Keep the legacy names; introduce `ChatTransportPort` as an
                alias

- Pros: Zero migration cost in this PR.
- Cons: Two names for one concept forever; the misleading name persists in
  domain code; new readers see Claude-specific terms even when working with
  Cursor adapters.

## Consequences

### Positive

- Domain naming reflects capability, not vendor.
- Codemod + lint rule make accidental drift impossible.
- The rename clears the path for WS-2 (`ProviderSelection`) without dragging
  Claude-specific names into the new types.

### Negative

- One transient re-export shim in the UI composables directory until the
  next minor release.
- Test fixtures and templates that mention the legacy identifiers must be
  swept by the codemod.

### Neutral

- The adapter files (`ClaudeCliAdapter`, `ClaudeSubprocessAdapter`) keep
  their current file names in WS-1; the file-rename to `ClaudeApiAdapter`
  ships with later workstreams that touch those files for other reasons.

## Compliance

- ESLint rule `no-legacy-claude-cli-port-names` (error severity) enforces
  the ban repository-wide. Lint test
  `tests/lint/no-legacy-claude-cli-port-names.test.ts` enumerates every
  legacy identifier and fails on any occurrence outside the allow-listed
  shim file.
- Import-boundary test `tests/domain/ports/ChatTransportPort.imports.test.ts`
  asserts the renamed port file does not import `obsidian`,
  `@anthropic-ai/claude-agent-sdk`, `node:child_process`, or `node:https`
  (NFR-MPS-012).
- `npm run verify` exercises typecheck, lint, unit tests, and bundle build,
  catching any caller that escaped the codemod.

## References

- SPEC-MPS-001 §2.1 (canonical type-name table).
- DES-MPS-001 §C2 (renames) and §C12 (ADR draft).
- REQ-MPS-001, REQ-MPS-002, REQ-MPS-009, NFR-MPS-012.
- ADR-008 (narrow ports — naming convention).
