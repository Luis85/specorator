---
id: ADR-MC-001
title: Persist the MCP server list to the vault file .claude/mcp.json behind a McpConfigStorePort, with a pure McpConfigParser
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
tags: [architecture, mcp, storage, vault, ports, claudian-reboot, P8]
---

# ADR-MC-001 — `McpConfigStorePort` + the vault `.claude/mcp.json` config + the pure `McpConfigParser`

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-26): architect files, PM
accepts, human defers to one final epic-review gate. Ratifies **CLAR-MC-001** (config source = vault
file) and **CLAR-MC-002** (the canonical path stays `.claude/mcp.json`). Unblocks `PRD-MC-001`
(REQ-MC-001..007, REQ-MC-040, REQ-MC-063, REQ-MC-081).

## Context

P8 grows the in-app MCP client on the merged P1–P7 surface. The server list must persist somewhere,
and the persistence location is architecturally load-bearing because of a tension the PRD flags
(CLAR-MC-001):

- **The epic baseline (CHARTER-REQ-SET):** user/device-scoped *personal prefs* (locale, logLevel,
  device CLI paths) persist to a **device-local** store, never `data.json` — because `data.json` is
  committed + shared with the vault. ADR-PSR-002 (settings) and ADR-AS-001 (P7 approval rules) both
  put their state device-local for exactly this reason.
- **The Claudian ground truth:** Claudian stores the MCP server list **in the vault** at
  `.claude/mcp.json` (`McpStorage.ts:9` — `MCP_CONFIG_PATH`) as an `mcpServers` map plus a
  `_claudian.servers` per-server metadata sidecar (`enabled` / `contextSaving` / `disabledTools` /
  `description`). The **Claude Agent-SDK / CLI reads that exact path** from the vault — that
  CLI-readability is the whole point of the file existing where it does.

The MCP server list is therefore **project/vault configuration, not a personal device pref**: it must
be readable by the Claude CLI from a known vault location, and it is meaningfully shared with the
vault (collaborators on the same vault want the same servers). So it legitimately diverges from the
device-local calls in ADR-PSR-002 / ADR-AS-001.

A second tension: a vault file is git-committed and shared, so any auth material in a server config
(`headers` / `env`) would be committed too. The PRD (REQ-MC-063, CLAR-MC-004) bounds this: P8 stores
only the config the user already authored, never duplicates a secret into a separate plaintext store,
and never eval-s a config value. The dedicated `SecretStorePort`-backed secret editor is deferred
(NG5, ≈P10). The parser is pure JSON parsing (`McpConfigParser`); the store port is the only I/O.

## Decision

### 1. The MCP config is a VAULT file at `.claude/mcp.json` (CLAR-MC-001 / CLAR-MC-002)

We persist the MCP server list to the vault file `.claude/mcp.json` — the same path + shape Claudian
uses, because the Claude CLI/Agent-SDK reads it. We deliberately **diverge from the device-local calls
of ADR-PSR-002 / ADR-AS-001**: those hold personal prefs / device-global approval rules; the MCP list
is project config the CLI must read from a known vault location. The file keeps the Claudian shape:

```jsonc
{
  "mcpServers": {
    "fs": { "command": "npx", "args": ["-y", "server-filesystem"] },
    "search": { "type": "http", "url": "https://…", "headers": { /* user-authored */ } }
  },
  "_claudian": {
    "servers": {
      "search": { "enabled": false, "disabledTools": ["delete"] }   // only NON-DEFAULT metadata
    }
  }
}
```

We keep the path `.claude/mcp.json` (NOT a Specorator-branded `.specorator/…`): renaming would break
Claude-CLI readability, which is the reason for the vault-file decision. We keep the `_claudian` sidecar
key verbatim for the same reason — it is the on-disk contract the CLI/migrants share, not a brand mark
(the product identity stays Specorator in the UI; the file key is an interop contract). **No migration**
(CHARTER-REQ-FRESH): a fresh vault has no file → empty list (load-or-default).

### 2. `McpConfigStorePort` — a narrow store-only port over `VaultPort` semantics

```ts
// src/domain/ports/McpConfigStorePort.ts — new (ADR-008, one consumer = the MCP use cases)
export interface McpConfigStorePort {
  /** Load-or-default. Absent/empty/unparseable `.claude/mcp.json` ⇒ ok([]); never throws (REQ-MC-001/002). */
  load(): Promise<Result<readonly ManagedMcpServer[]>>;
  /** Write the list back, preserving `mcpServers` + only NON-DEFAULT `_claudian` metadata (REQ-MC-007). */
  save(servers: readonly ManagedMcpServer[]): Promise<Result<void>>;
  /** Whether the vault file exists (drives the empty/list UX, REQ-MC-040). */
  exists(): Promise<Result<boolean>>;
}
```

Its own `InjectionKey` (`MCP_CONFIG_STORE_PORT`) + composable (`useMcpConfigStorePort`); one consumer
(the `McpServerManager` use case), no aggregate (ADR-008, REQ-MC-081). Every method is `Result`-typed
(ADR-004) — a vault read/write failure surfaces as `Result.err`, never a throw across the boundary
(NFR-MC-004). The port models the *config-document* round-trip (parse-on-load, serialise-on-save with
metadata pruning), so the application use case never touches raw JSON or the vault path. The Obsidian
bridge backs it with `VaultPort.readFile`/`writeFile`/`fileExists`; the Mock bridge holds an in-memory
document (scriptable); the LocalStorage bridge backs it with browser `localStorage` (the GitHub Pages
demo can manage config even though it cannot connect — that lives behind `McpClientPort`, ADR-MC-002).

### 3. `McpConfigParser` — pure domain, `Result`-returning (REQ-MC-003/004/005/006)

The parser is pure domain (no I/O): `parseClipboardConfig(json) → Result<ParsedMcpConfig>` accepting the
four Claudian paste formats (full `mcpServers` wrapper / single unnamed → `needsName:true` / single named
/ multiple named), plus `getMcpServerType` (sse|http|stdio classification) and `isValidMcpServerConfig`
(non-empty `command` for stdio OR non-empty `url` for sse/http). **The Claudian throw paths convert to
`Result.err`** ("Invalid JSON" / "Invalid MCP configuration format") per ADR-004 + Constitution I.3 —
malformed config never throws, never corrupts the stored config, never crashes the host (REQ-MC-004).
The config-document codec (the `_claudian` round-trip with default-pruning, REQ-MC-007) is a pure
serialise/deserialise pair the store port delegates to.

## Considered options

### Option A — vault `.claude/mcp.json` behind `McpConfigStorePort` + pure parser *(chosen)*
- Pros: the Claude CLI reads the config from the path it expects; Claudian migrants' existing servers
  appear unchanged (charter §1 north star); a narrow port keeps the vault path + JSON out of the
  application/UI layers; the pure parser carries the automated coverage; load-or-default = no migration.
- Cons: a vault file is git-shared, so any user-authored auth in a config is shared too (bounded by
  REQ-MC-063 / CLAR-MC-004 — no NEW plaintext secret store, secret-editor deferred); diverges from the
  device-local precedent (justified — CLI-readable project config, not a personal pref).

### Option B — device-local store (mirror ADR-PSR-002 / ADR-AS-001)
- Pros: consistent with the settings + approval-rule storage decision; nothing committed to the vault.
- Cons: the Claude CLI cannot read a device-local store at its expected path — the servers would not
  reach the agent without re-exporting to `.claude/mcp.json` anyway, doubling the source of truth and
  breaking parity with Claudian migrants. Rejected — the CLI-readability is the requirement.

### Option C — a Specorator-branded vault path (`.specorator/mcp.json`)
- Pros: brand-consistent file name.
- Cons: the Claude CLI reads `.claude/mcp.json`; a renamed path breaks the interop that motivates the
  vault decision. Rejected (CLAR-MC-002).

## Consequences

### Positive
- A Claudian migrant's existing `.claude/mcp.json` servers appear + behave identically (charter §1).
- The vault path + JSON codec live in one bridge-backed port; the application/UI never see them
  (REQ-MC-081). The pure parser + codec carry the automated coverage (NFR-MC-006).
- Load-or-default, no migration (CHARTER-REQ-FRESH).

### Negative
- A second persistence location alongside the device-local settings/approval stores — justified, but it
  means "where does X persist" now has two answers (device-local for prefs/rules; vault for MCP config).
  Recorded here so the divergence is explicit.
- A git-shared file may carry user-authored auth — bounded by REQ-MC-063; the `SecretStorePort` editor
  is a flagged follow-up (CLAR-MC-004).

### Neutral
- The `_claudian` sidecar key is an on-disk interop contract (kept verbatim for CLI/migrant parity); it
  is not a brand mark and does not affect the in-UI Specorator identity.

## Compliance

- A test asserts an absent / empty / `mcpServers`-missing / unparseable file loads as `ok([])`
  (REQ-MC-002), never throwing.
- A test asserts a round-trip writes `mcpServers` + only non-default `_claudian.servers` metadata, and
  a default-valued server writes no sidecar entry (REQ-MC-007).
- A test asserts each of the four paste formats parses, `needsName` is true only for format 2, and
  malformed input returns `Result.err` without mutating the stored config (REQ-MC-003/004).
- ESLint asserts no Vue / application file imports `obsidian` or `node:*`; the parser is pure
  (REQ-MC-081). A review check confirms `.claude/mcp.json` is the path and no secret is duplicated into
  a separate plaintext store (REQ-MC-063).

## References

- PRD-MC-001 — REQ-MC-001..007/040/063/081; CLAR-MC-001/002/004; NFR-MC-005/011.
- `specs/mcp-client/design.md` Part C (C.2/C.3/C.4/C.8).
- **ADR-MC-002** (the transport seam this store feeds), **ADR-MC-003** (the runtime/approval
  composition), ADR-PSR-002 + ADR-AS-001 (the device-local precedent this consciously diverges from),
  ADR-005 (vault sink), ADR-004 (`Result`), ADR-008 (narrow ports).
- Claudian reference: `providers/claude/storage/McpStorage.ts` (`MCP_CONFIG_PATH` + load/save + sidecar
  pruning), `core/mcp/McpConfigParser.ts` (the four formats), `core/types/mcp.ts`
  (`ManagedMcpServer` / `ManagedMcpConfigFile` / `getMcpServerType` / `isValidMcpServerConfig` /
  `DEFAULT_MCP_SERVER`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
