---
id: ADR-014
title: Declare ClaudeCliPort as a new narrow port for CLI availability detection
status: accepted
date: 2026-05-12
deciders:
  - architect
consulted:
  - ux-designer
  - pm
informed:
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [ports, infrastructure, onboarding, claude-cli]
---

# ADR-014 — Declare ClaudeCliPort as a new narrow port for CLI availability detection

## Status

Accepted

## Context

The plugin-onboarding wizard (Step 3) must check whether the Claude CLI is available on the user's machine and display a plain-language result. The check is runtime-environment-specific: it calls a shell executable in the Obsidian production context and must return `false` in the standalone browser context (MockBridge) and the GitHub Pages demo context (LocalStorageBridge), where no shell is available.

The project already uses the narrow-port pattern (ADR-008) for all Obsidian API calls: SettingsPort, VaultPort, WorkspacePort, NotificationPort, and LoggerPort. Each port is a single-responsibility interface with a matching InjectionKey and composable. ESLint forbids re-introducing the deleted IBridge aggregate.

Two options were considered for exposing the CLI availability check: extending an existing port or declaring a new one. A third option — coupling the check directly to a Vue composable with no port abstraction — was also considered.

## Decision

We declare a new narrow port `ClaudeCliPort` in `src/domain/ports/ClaudeCliPort.ts` with one method:

```ts
export interface ClaudeCliPort {
  isAvailable(): Promise<boolean>
}
```

We register its InjectionKey as `CLAUDE_CLI_PORT: InjectionKey<ClaudeCliPort>` in `src/infrastructure/bridge/ports.ts`.

We implement it in all three bridge classes:
- `ObsidianBridge`: attempts a shell invocation (e.g. `claude --version`) with a timeout; returns `true` if the process exits cleanly, `false` otherwise.
- `MockBridge`: returns `Promise.resolve(false)` — no shell available in the browser.
- `LocalStorageBridge`: returns `Promise.resolve(false)` — no shell available on GitHub Pages.

We export the type from `src/domain/ports/index.ts`.

We add a composable `useClaudeCliPort()` in `src/ui/composables/` following the same pattern as `useSettingsPort()` and `useVaultPort()`.

## Considered options

### Option A — New narrow port `ClaudeCliPort` (chosen)
- Pros: Consistent with ADR-008; each port has one responsibility; mockable at the port boundary; ESLint-compatible; allows the `claude-cli-chat-sidebar` feature to depend on the same port without coupling to the onboarding module.
- Cons: Adds a new file and InjectionKey; all three bridge classes must be updated.

### Option B — Extend `WorkspacePort` with `isClaudeCliAvailable()`
- Pros: No new InjectionKey or composable.
- Cons: Violates single-responsibility; WorkspacePort's contract is about file/leaf operations, not shell process management; adding a CLI method bloats an unrelated port; harder to mock independently.

### Option C — Inline check in Vue composable with no port
- Pros: Fewest files.
- Cons: Not testable without mocking module internals; couples UI layer to OS-level shell detection; impossible to substitute in MockBridge/LocalStorageBridge without modifying Vue code; violates ADR-008's rationale.

## Consequences

### Positive
- The wizard's Step 3 component depends only on `ClaudeCliPort` — one dependency for one concern.
- `MockBridge` and `LocalStorageBridge` return `false` consistently, enabling full wizard traversal in all runtime environments (REQ-POB-027, NFR-POB-007).
- The `claude-cli-chat-sidebar` feature can depend on the same port without additional abstraction.
- REQ-POB-009 (graceful fallback when port is unresolvable) is satisfied by catching injection errors at the call site.

### Negative
- Three bridge classes require a new method; must be implemented before onboarding Step 3 can ship.
- Adds one more InjectionKey to `ports.ts` (manageable; currently seven).

### Neutral
- `ClaudeCliPort` is exported from `src/domain/ports/index.ts` and is therefore available to any module that needs it.

## Compliance

- ESLint `no-restricted-imports` rule must add `ClaudeCliPort` to the domain ports allowlist for UI imports.
- `npm run typecheck` must pass with the new interface declared.
- `MockBridge` and `LocalStorageBridge` must implement `ClaudeCliPort`; TypeScript enforces this via the `implements` clause.
- The `fakeModulePorts()` factory in `tests/__fakes__/fake-ports.ts` must be updated to include a `ClaudeCliPort` stub so component tests can inject it.

## References

- ADR-008 (narrow ports pattern — referenced in CLAUDE.md)
- REQ-POB-008 (Step 3: Claude CLI check)
- REQ-POB-009 (graceful fallback when port unresolvable)
- REQ-POB-027 (wizard works in MockBridge)
- DESIGN-POB-001 Part C

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
