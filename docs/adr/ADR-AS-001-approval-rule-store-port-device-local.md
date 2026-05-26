---
id: ADR-AS-001
title: Persist approval rules through a narrow ApprovalRuleStorePort to a device-local store, with a pure matcher
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-26
accepted: 2026-05-26    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, security, approvals, persistence, ports, claudian-reboot, P7]
---

# ADR-AS-001 — `ApprovalRuleStorePort` + approval-rule persistence (device-local)

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-AS-001** (and the
session-vs-persisted half of CLAR-AS-003). Unblocks `PRD-AS-001` (REQ-AS-016, REQ-AS-030..034,
REQ-AS-041/042, REQ-AS-053/054, NFR-AS-002/003/004/005/009).

## Context

P7 of the `claudian-reboot` epic makes the approval **rule engine** live behind the P4 inline
approval prompt (`src/domain/chat/inline/Approval.ts`). The central P7 decision (charter §6a,
"Approval-rule persistence target/shape") is **where and how approval rules persist**, and what the
matching core looks like.

Forces:

- **Charter CHARTER-REQ-SET.** Vaults are collaborative + git-backed, so `data.json` is committed
  and shared. An approval rule (e.g. `allow Bash "git push *"`) is a personal, device-scoped trust
  decision that must **never** leak into shared, version-controlled state. ADR-PSR-002 already moved
  device-scoped settings off `data.json` to Obsidian's device-local store
  (`app.loadLocalStorage`/`saveLocalStorage`); rules belong in the same place.
- **Charter CHARTER-REQ-FRESH.** No backwards compatibility — no migration of any prior rule state.
  The load path is **load-or-default** (empty rule set when nothing is stored), mirroring ADR-PSR-002.
- **Claudian divergence (deliberate).** Claudian writes `allow-always` rules into the SDK
  `projectSettings` destination, which serialises to the project's `.claude/settings.json` — a
  shared, git-committed **vault** path (`ClaudePermissionUpdates.ts:11`). Copying that conflicts with
  CHARTER-REQ-SET. Specorator keeps Claudian's **session-vs-persisted lifetime distinction** but
  relocates the persisted destination to device-local.
- **ADR-008 narrow-port discipline.** Rules are a distinct concern with their own load-or-default and
  their own consumer (the approvals use cases). Folding them into `SettingsPort`/`PluginSettings`
  would couple two concerns and bloat `PluginSettings`. One narrow port, one consumer.
- **Three-bridge discipline (REQ-AS-053).** The engine must work under `MockBridge` (tests +
  `npm run dev`) and `LocalStorageBridge` (GitHub Pages demo) with no Obsidian runtime.
- **Fail-safe (NFR-AS-004).** A store failure must never silently auto-approve. The engine fails
  **safe to the prompt** — a store load/save error returns `Result.err` and the request degrades to
  the inline prompt.
- **Matching semantics (REQ-AS-010..014).** Claudian's `ApprovalManager` (`matchesRulePattern`,
  `getActionPattern`, `getActionDescription`, `isPathPrefixMatch`, `matchesBashPrefix`) is **pure**
  rule-matching: bash exact/explicit-wildcard only, file path-prefix with segment boundaries,
  other-tool simple prefix, null-action guard. This is pure logic with no I/O — it belongs in the
  domain, not the port.

## Decision

We introduce a **new narrow port `ApprovalRuleStorePort`** (one port, one consumer — the approvals
use cases) that persists approval rules to a **device-local store**, and we reproduce Claudian's
rule-matching as a **pure domain function** separate from the store.

### 1. The rule DTO (`src/domain/chat/approvals/ApprovalRule.ts`)

```ts
/** A persisted/session approval rule. Plain inert DATA — never executable, never a secret. */
export interface ApprovalRule {
  readonly id: string;                        // crypto.randomUUID() — for remove/dedupe
  readonly toolName: string;                  // e.g. 'Bash', 'Read', 'Write'
  readonly actionPattern?: string;            // claudian `ruleContent`; absent/'*' ⇒ match-all
  readonly decision: 'allow' | 'deny';        // claudian persists only 'allow'; we add 'deny' (CLAR-AS-004)
  readonly lifetime: 'session' | 'persisted'; // claudian session vs projectSettings split
  readonly createdAt: number;
}
```

The DTO mirrors Claudian's `{ toolName, ruleContent? }` plus an explicit `decision` and a `lifetime`.
It is **inert data** (tool name + pattern + decision + lifetime) — never code, never a secret
(NFR-AS-002). `actionPattern` is the value `getActionPattern` derives; a JSON-serialised fallback
pattern (one beginning with `{`) is **not** stored as a rule (mirrors `ClaudePermissionUpdates.ts:31`)
so the prompt re-surfaces for non-determinable actions.

### 2. The port contract (`src/domain/ports/ApprovalRuleStorePort.ts`)

```ts
export interface ApprovalRuleStorePort {
  /** Load the persisted rules (load-or-default to []). Never throws — returns Result.err on failure. */
  loadRules(): Promise<Result<ApprovalRule[]>>;
  /** Persist a new rule (append). Returns Result.err on failure (the caller fails safe to prompt). */
  addRule(rule: ApprovalRule): Promise<Result<void>>;
  /** Remove a persisted rule by id. */
  removeRule(id: string): Promise<Result<void>>;
  /** Clear all persisted rules. */
  clear(): Promise<Result<void>>;
}
```

Store-only — **no matching on the port**. The port handles ONLY the **persisted** lifetime; session
rules are held in memory by the application engine (they do not survive reload — REQ-AS-033). Every
method returns `Result` (ADR-004): a failure is a value, never a throw (NFR-AS-009).

### 3. The pure matcher (`src/domain/chat/approvals/ApprovalMatcher.ts`)

Three pure, total, no-I/O functions reproducing Claudian's `ApprovalManager` semantics exactly:

- `getActionPattern(toolName, input): string | null` — bash→`command`, file→`file_path`/
  `notebook_path`, glob/grep→`pattern`, default→`JSON.stringify(input)` (REQ-AS-010).
- `getActionDescription(toolName, input): string` — "Run command: …" / "Edit file: …" for the prompt
  (REQ-AS-015).
- `matchesRulePattern(toolName, actionPattern, rulePattern): boolean` — bash exact-or-explicit-wildcard
  (`"git *"` / `"npm:*"`, never a bare prefix), file path-prefix with segment boundaries
  (`isPathPrefixMatch`), other-tool simple prefix, `*`/no-pattern match-all, null-action guard;
  backslash-normalise `\`→`/` (REQ-AS-011..014).

These live in the **domain** (pure logic, no port, no I/O). The application engine (ADR-AS-003)
composes the matcher over the loaded rules.

### 4. Device-local backing on the three bridges

| Bridge | `ApprovalRuleStorePort` backing |
|---|---|
| `ObsidianBridge` | `app.loadLocalStorage('specorator:approval-rules')` / `saveLocalStorage(...)` — device-scoped, **not** synced, never `data.json`, never a vault file (CHARTER-REQ-SET, NFR-AS-003). Mirrors ADR-PSR-002's settings key. |
| `MockBridge` | in-memory array — round-trips for tests + `npm run dev`; scriptable to inject pre-seeded rules and to force load/save failure (REQ-AS-053/054). |
| `LocalStorageBridge` | browser `localStorage` under the same key (GitHub Pages demo); inert-but-functional so the demo's engine works without Obsidian. |

**Load-or-default, no migration** (CHARTER-REQ-FRESH): `loadRules` returns `[]` when the device-local
blob is absent or unparseable. No `settingsVersion`, no legacy read, no relocate-and-clear.

Its own `InjectionKey` (`APPROVAL_RULE_STORE_PORT`) + its own composable
(`useApprovalRuleStorePort`) per ADR-008's one-port-one-composable rule.

## Considered options

### Option A — Dedicated `ApprovalRuleStorePort` (store-only) + pure domain matcher, device-local (chosen)

- Pros: rules are a distinct concern with their own load-or-default; keeps `PluginSettings` lean;
  matches the backend-audit `ApprovalRuleStorePort` row; the matcher is pure/testable with no port;
  device-local honours CHARTER-REQ-SET; one port, one consumer (ADR-008); three-bridge backing keeps
  dev + demo working (REQ-AS-053).
- Cons: one more port + key + composable + three-bridge method to add (acceptable — it is the
  established P5/P6 pattern).

### Option B — Fold rules into `SettingsPort`/`PluginSettings`

- Pros: no new port.
- Cons: couples two concerns; `PluginSettings` is a synchronous load-or-default snapshot, while rules
  are a growing list with add/remove/clear semantics; bloats `PluginSettings`; the matcher would
  still need a home. Rejected (CLAR-AS-001 (b) rejected).

### Option C — Copy Claudian: write rules to `.claude/settings.json` (`projectSettings`)

- Pros: byte-parity with Claudian's destination.
- Cons: that is a shared, git-committed **vault** path — violates CHARTER-REQ-SET (REQ-AS-034,
  NFR-AS-003). A leaked `allow Bash "git push *"` in a committed file is a shared-state hazard.
  Rejected.

## Consequences

### Positive

- Approval rules never enter `data.json` or a vault file; git-backed/synced vaults stay free of
  per-device trust state (CHARTER-REQ-SET, REQ-AS-034, NFR-AS-003).
- The matcher is pure domain logic — fully unit-testable, total, never throws (NFR-AS-009); the
  store is the only I/O seam, and it returns `Result` (NFR-AS-004 fail-safe).
- `PluginSettings` stays lean; rules are their own concern with their own consumer (ADR-008).
- The engine works on all three bridges; dev + the web demo keep functioning (REQ-AS-053).
- No migration code (CHARTER-REQ-FRESH) — load-or-default off the device-local store.

### Negative

- Device-scoped storage means rules do not follow the user to a new device (intended — they are a
  per-device trust decision; a fresh device re-prompts, which is the safe default).
- One more port + bridge method to maintain (acceptable — established pattern).

### Neutral

- The session-vs-persisted lifetime distinction is preserved from Claudian; only the persisted
  destination moves. The `'deny'` decision (CLAR-AS-004, ADR-AS-003) is a Specorator extension over
  Claudian's allow-only model and costs no parity.
- `data.json` survives for genuinely vault-shared settings; P7 adds none.

## Compliance

- **`ObsidianBridge`** reads/writes `app.loadLocalStorage('specorator:approval-rules')` /
  `saveLocalStorage(...)`, never `loadData`/`saveData`, never a vault file (NFR-AS-003). A test
  asserts that after `addRule`, `data.json` and the vault contain no rule data and the value
  round-trips through the device-local store (TEST-AS-034).
- **Load-or-default, no migration** — `loadRules` returns `[]` when the blob is absent/unparseable;
  no `settingsVersion`, no legacy read (CHARTER-REQ-FRESH).
- **Fail-safe** — a forced store load/save failure returns `Result.err`; the engine degrades to the
  inline prompt and shows a non-blocking notice, never auto-approving (NFR-AS-004, TEST-AS-054).
- **Pure matcher** — `matchesRulePattern`/`getActionPattern`/`getActionDescription` are pure, total,
  no-I/O domain functions; matching never throws (NFR-AS-009).
- **No secret** — no test fixture or store payload contains secret material; the LoggerPort emits no
  rule `actionPattern` content (NFR-AS-002).
- **ADR-008** — `ApprovalRuleStorePort` is one narrow port for one consumer, on all three bridges,
  with its own `InjectionKey` + composable; no aggregate.

## References

- PRD-AS-001 (`specs/approvals-security/requirements.md`) — REQ-AS-010..016, REQ-AS-030..034,
  REQ-AS-041/042, REQ-AS-053/054; NFR-AS-002/003/004/005/009; CLAR-AS-001 / CLAR-AS-003/004.
- DESIGN-AS-001 (`specs/approvals-security/design.md`) — Part C §C.2/§C.3/§C.4/§C.8.
- ADR-PSR-002 (`docs/adr/ADR-PSR-002-settings-storage-device-local.md`) — the device-local store
  decision this ADR mirrors for rules.
- ADR-008 (`docs/adr/ADR-008-narrow-ports-supersede-ibridge.md`) — narrow-port discipline.
- ADR-004 (`Result<T,E>`).
- CHARTER-CLAUDIAN-REBOOT (`specs/claudian-reboot/parity-charter.md`) §1 (CHARTER-REQ-SET,
  CHARTER-REQ-FRESH), §6a (Approval-rule persistence).
- claudian-main: `core/security/ApprovalManager.ts` (the pure matcher), `providers/claude/security/
  ClaudePermissionUpdates.ts:11-12,30` (session-vs-projectSettings destination + rule shape).
- ADR-AS-002 / ADR-AS-003 (companion P7 ADRs — permission-mode plumbing + the decision flow).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
