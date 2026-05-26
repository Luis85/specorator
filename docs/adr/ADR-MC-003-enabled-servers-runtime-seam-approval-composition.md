---
id: ADR-MC-003
title: Thread enabled MCP servers to a turn via an additive ChatRuntimeQueryOptions.enabledMcpServers folded by a McpServerManager use case; MCP tool calls route through the unchanged P7 approval gate
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
tags: [architecture, mcp, runtime, additivity, approvals, claudian-reboot, P8]
---

# ADR-MC-003 — Enabled-servers runtime seam + the `McpServerManager` use case + the P7 approval composition

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-MC-005** (the additive
`enabledMcpServers?` shape + the empty mention-set default). Unblocks `PRD-MC-001` (REQ-MC-010..016,
REQ-MC-050..054, REQ-MC-065, REQ-MC-082).

## Context

P8 must (a) manage the server lifecycle (add/edit/remove/enable/disable, per-tool disable), (b) make an
enabled server's tools reach a Claude turn, (c) let the P6 MCP selector list + toggle the enabled
servers, and (d) gate an MCP tool call through the P7 approval engine — all **additively**, so that with
no MCP server configured the P1–P7 surface is byte-identical (REQ-MC-082, NFR-MC-001).

The seams already exist:

- `ChatRuntimeQueryOptions` carries an **EXCLUDED** `enabledMcpServers?` field, documented as deferred
  in `ChatTurn.ts:51`/`:71` (alongside `externalContextPaths?`). The P6/P7 fold (`foldControlOptions`,
  `buildTurnRequest`) writes only non-default toolbar/permission values, so a no-interaction turn is
  byte-identical. Introducing `enabledMcpServers?` follows the exact P6/P7 additive pattern.
- The P6 `McpSelector.vue` is a visible-empty "coming later" seam reading `McpWidgetVm`
  (`buildMcp(capabilities)` → `{ visibility, empty:true }`, gated on `ToolbarCapabilities.supportsMcpTools`).
  P8 makes the VM list the managed servers with their enabled state + a count badge.
- The P7 `ApprovalManager` (`decide`/`applyDecision`) sits behind `ChatRuntimePort.setApprovalCallback`
  and decides allow / deny / prompt by tool name + action pattern (mode gate → match → prompt → persist).
  It is **tool-agnostic** — it matches on `{ toolName, actionPattern }`, not a tool family literal.
- Claudian's `McpServerManager.getActiveServers(mentionedNames)` folds the enabled servers (filtered by
  the context-saving + @-mention rule) into a `Record<name, config>`, and
  `getDisallowedMcpTools`/`getAllDisallowedMcpTools` produce the `mcp__<server>__<tool>` disallowed list.

## Decision

### 1. `ChatRuntimeQueryOptions.enabledMcpServers?` — additive, folded, empty ⇒ byte-identical (CLAR-MC-005)

We introduce the EXCLUDED field additively, appended after the P7 members:

```ts
// src/domain/chat/ChatTurn.ts — APPENDED after permissionMode (P0–P7 members byte-identical).
export interface ChatRuntimeQueryOptions {
  // model? / forceColdStart? / appendSystemPrompt? / mode? / reasoning? / serviceTier? / permissionMode?  — UNCHANGED
  /** P8 additive (ADR-MC-003 §1): the active enabled servers (name → config) + their disallowed tools. Absent/empty ⇒ byte-identical to P7. */
  enabledMcpServers?: EnabledMcpServers;   // { servers: Record<string, McpServerConfig>; disallowedTools: readonly string[] }
}
```

A pure guard (extending the P6 `foldControlOptions` / the `buildTurnRequest` fold) writes the field
**only when the active set is non-empty** — an absent/empty value leaves the query serialising
byte-identically to a P7 query (the `externalContextPaths?` field stays EXCLUDED). The Claude runtime
reads it to advertise the servers' tools to the turn (the parity counterpart of Claudian feeding
`getActiveServers` into the SDK `mcpServers` option + `getDisallowedMcpTools` into `disallowedTools`).
**No `providerId` branch** — the field is provider-agnostic; the Claude runtime is the only consumer in
P8 (capability-gated on `supportsMcpTools`), and a later provider folds the same field.

### 2. `McpServerManager` — an application use case over the two ports + the pure manager logic

The lifecycle + active-set computation is an **application use case** (`McpServerManager`) over
`McpConfigStorePort` (ADR-MC-001) + `McpClientPort` (ADR-MC-002), holding the loaded
`ManagedMcpServer[]`:

- **Lifecycle** (REQ-MC-010..016): `add` (default metadata `enabled:true`/`contextSaving:true`; reject
  empty/duplicate name → `Result.err`, REQ-MC-011), `edit`, `remove`, `setEnabled`, `setToolDisabled`;
  each mutates the in-memory list + persists via `store.save` (`Result`-typed, REQ-MC-007).
- **`getEnabledCount()`** (REQ-MC-015) → the selector badge.
- **`getActiveServers(mentionedNames): EnabledMcpServers`** (REQ-MC-052/053/054) — the **pure**
  active-set fold (regrown from Claudian `getActiveServers` + `collectDisallowedTools`): an enabled
  server is active iff `!contextSaving || mentionedNames.has(name)`; the disallowed-tools list is
  `mcp__<server>__<tool>` for each active (or, for persistent pre-registration, all-enabled) server's
  `disabledTools`. **For P8 the mention set is empty by default** (the composer `@mention` MCP
  cross-link is NG3): context-saving servers are excluded from the *active* set but their disabled tools
  are pre-registered (`getAllDisallowedMcpTools`), so a later mention does not force a cold start
  (REQ-MC-053). Non-context-saving enabled servers are active immediately.

The pure active-set / disallowed-tools fold + the parser/codec (ADR-MC-001) live in **domain** for
coverage; the use case orchestrates the ports.

### 3. The P6 selector lists + toggles the enabled servers (REQ-MC-050/051)

`buildMcp` (the pure toolbar VM builder) grows from the P6 empty seam to read the managed-server list +
enabled count: `McpWidgetVm` gains `servers: readonly { name; type; enabled }[]` + `enabledCount`. The
expanded `McpSelector.vue` lists each managed server with an enabled toggle + the count badge, replacing
the P6 "coming later" panel **when at least one server is configured** (REQ-MC-050); with no server it
keeps the P6 visible-empty seam (REQ-MC-082). Toggling a server calls `McpServerManager.setEnabled`
(REQ-MC-051). The widget stays capability-gated on `supportsMcpTools` (hidden for non-Claude, REQ-MC-041).

### 4. An MCP tool call routes through the UNCHANGED P7 approval gate (REQ-MC-065)

An MCP tool call is **not auto-trusted**. When the runtime requests approval for an MCP tool, the same
P7 path runs: `ChatRuntimePort.setApprovalCallback` fires → `ApprovalManager.decide({ toolName, actionPattern }, mode)`
→ mode gate → rule match (deny-wins) → auto-decide OR the unchanged P4 inline block → `*-always`
persists a rule. The MCP tool name is the `mcp__<server>__<tool>` identifier (already the disallowed-id
format); the `ApprovalManager` matches on it exactly as for any other tool — **no MCP special-case in the
gate** (the manager is tool-agnostic). With no matching rule + `normal` mode, the unchanged P4/P7 inline
approval block is shown (REQ-MC-065). Disabled tools never reach the runtime as callable — they are in
the `disallowedTools` list (§2), so the agent cannot invoke them, before approval is even considered
(REQ-MC-054). Composition only — P7 is not re-specified (NG4).

## Considered options

### 1 — additive `enabledMcpServers?` folded (empty ⇒ byte-identical), manager use case, P7 gate unchanged *(chosen)*
- Pros: introduces the already-reserved EXCLUDED field the exact P6/P7 way; no-servers default is
  byte-identical (REQ-MC-082); the manager is one application use case over the two ports; MCP tools
  reuse the tool-agnostic P7 gate with zero new approval surface; no `providerId` branch.
- Cons: `ChatRuntimeQueryOptions` grows a field (additive, optional, guarded-fold); the runtime must
  read it (Claude only in P8) — accepted (the seam is provider-agnostic).

### 2 — a dedicated `setMcpApprovalCallback` / MCP-specific approval path
- Pros: explicit MCP gate.
- Cons: forks the P7 engine + UI for a tool family that already matches on `{ toolName, actionPattern }`;
  contradicts "MCP tools are not special" (REQ-MC-065 — gated exactly as any other tool). Rejected.

### 3 — pass enabled servers via a new `McpRuntimePort` / out-of-band channel
- Pros: isolates MCP from the query options.
- Cons: a whole new runtime seam for data that is a per-turn query option, when the EXCLUDED field is
  reserved for exactly this; breaks the additive byte-identical invariant tooling already proves.
  Rejected (no port before its consumer earns it; the field is the seam).

## Consequences

### Positive
- With no MCP server configured, the chat / toolbar / runtime query are byte-identical to P1–P7
  (REQ-MC-082, NFR-MC-001) — the selector keeps its P6 empty seam, the query omits `enabledMcpServers`.
- An enabled server's tools reach a Claude turn (REQ-MC-052) and every MCP tool call is P7-approval-
  gated, not auto-trusted (REQ-MC-065); disabled tools are unreachable (REQ-MC-054).
- The selector lists + toggles enabled servers with a count badge (REQ-MC-050/051), reusing the P6 VM.

### Negative
- `ChatRuntimeQueryOptions` + `McpWidgetVm` + `buildMcp` grow (all additive/guarded).
- The context-saving @-mention *trigger* is deferred (NG3) — P8 wires the gating with an empty mention
  set; context-saving servers are pre-registered-disabled (REQ-MC-053). A later phase sources the
  mention set from the composer.

### Neutral
- The `getActiveServers` / disallowed-tools fold is pure domain (Claudian-semantics), carrying
  automated coverage; the runtime read is in the Claude runtime (coverage-excluded infra).

## Compliance

- A test asserts a turn with no enabled server folds no `enabledMcpServers` and serialises byte-
  identically to a P7 turn (REQ-MC-082, NFR-MC-001).
- A test asserts `getActiveServers(∅)` excludes context-saving enabled servers from the active set but
  includes their disabled tools in the disallowed list (pre-registration), and includes non-context-
  saving enabled servers (REQ-MC-053/054).
- A test asserts toggling a server in the selector flips `enabled`, persists, and updates the count
  badge (REQ-MC-051/015); a duplicate/empty add returns `Result.err` (REQ-MC-011).
- A test asserts an MCP tool-call approval request runs the SAME `ApprovalManager.decide` path (mode
  gate → match → prompt) as any other tool, and the unchanged P4 block renders on no-match/`normal`
  (REQ-MC-065). A review check confirms no MCP special-case in the approval gate and no `providerId`
  branch in the fold/runtime read.

## References

- PRD-MC-001 — REQ-MC-010..016/050..054/065/082; CLAR-MC-005; NFR-MC-001.
- `specs/mcp-client/design.md` Part C (C.2/C.3/C.5/C.6).
- **ADR-MC-001** (the config the manager loads/saves), **ADR-MC-002** (the transport the runtime
  connects), ADR-AS-003 (the `ApprovalManager` decision flow this composes with, unchanged), ADR-TC-002
  (the guarded additive query-option fold this extends), ADR-TC-003 (capability-gating, no `providerId`
  branch), ADR-CC-001 (the runtime port shape), ADR-004 (`Result`).
- Claudian reference: `core/mcp/McpServerManager.ts` (`getActiveServers` / `getEnabledCount` /
  `collectDisallowedTools` / `getAllDisallowedMcpTools`), `ChatTurn.ts:51/71` (the EXCLUDED
  `enabledMcpServers?`), `McpServerSelector` (list + toggle + count badge).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
