---
id: ADR-CP-002
title: Add three composer-power narrow ports — MentionDataProviderPort, ProviderCommandCatalogPort, and the security-bounded ShellExecPort
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
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
tags: [architecture, ports, security, composer, claudian-reboot, P4]
---

# ADR-CP-002 — Three composer-power narrow ports (mention / command-catalog / shell-exec)

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CP-002**. Unblocks
`PRD-CP-001` (REQ-CP-004/009/010/012/030/031/032; NFR-CP-006).

## Context

Three composer-power surfaces touch a resource the six core ports + the chat ports do not cover:

1. **`@mention`** needs vault files/folders (covered: `VaultPort.listFiles`/`listFolders`) **plus**
   subagent / MCP-server / external-directory referents the vault port cannot reach (audit-frontend
   §3.3: `MentionDropdownController` + `VaultMentionDataProvider` + a catalog source).
2. **Slash `/` + Skills `$`** need built-in commands (pure, in-app) **plus** a lazily-loaded,
   request-id-guarded per-provider command/skill catalog (`ProviderCommandCatalog`,
   `providers/claude/{commands,storage}`).
3. **Bang-bash `!`** needs to run one user-typed shell command. Claudian's `BangBashService` uses
   node `child_process.exec` with a 30s timeout, 1 MB buffer, `cmd.exe`/`/bin/bash`. This is a
   **dual-use security-sensitive capability** — the single most sensitive seam P4 adds (NFR-CP-006).

ADR-008's governing rule: *no port before its consumer earns it*; *one port per consumer*; *three
bridge impls*. ADR-CC-001 §6 establishes the per-mount **factory** pattern for stateful ports.

## Decision

We add **three** narrow ports — not one aggregate. Each gets its own InjectionKey + composable.

### 1. `MentionDataProviderPort` — the mention catalog seam (vault + non-vault sources independently swappable)

```ts
// src/domain/ports/MentionDataProviderPort.ts
export type MentionReferentKind = 'file' | 'folder' | 'subagent' | 'mcp-server' | 'external-dir';
export interface MentionReferent {
  readonly kind: MentionReferentKind;
  readonly name: string;
  readonly mentionText: string;     // what replaceTriggerToken inserts (resolved)
  readonly detail?: string;         // path (files) or description (subagent/MCP), drives the 2-line row
}
export interface MentionDataProviderPort {
  /** Filtered referents for the open palette. Load-or-default: empty sources → []. */
  query(filter: string, signal?: AbortSignal): Promise<MentionReferent[]>;
}
```

- **Composition, not a god-source.** The Obsidian/Mock impls are an **application-layer composite**
  over two independently-swappable sources: a *vault source* built on the existing `VaultPort`
  (`listFiles`/`listFolders`, REQ-CP-010 — the UI never imports `obsidian`) and a *catalog source*
  for subagent/MCP/external-dir referents. The catalog source is **provider-addressed** and in P4
  the **MCP-server source no-ops gracefully (returns `[]`)** until P8, and the subagent source is
  wired Claude-only (NG4/NG5, REQ-CP-012). A merged empty non-vault source must not error the
  palette (REQ-CP-012 acceptance).
- One port, one consumer (the mention palette). Debounced filtering (REQ-CP-014) lives in the
  *consumer* (`useComposerMode`/the palette), not the port — the port stays a pure data seam.

### 2. `ProviderCommandCatalogPort` — the command/skill catalog + storage seam (request-id guarded)

```ts
// src/domain/ports/ProviderCommandCatalogPort.ts
export type CatalogEntryKind = 'command' | 'skill';
export interface CatalogEntry {
  readonly kind: CatalogEntryKind;
  readonly prefix: '/' | '$';      // drives REQ-CP-005 prefix+name+space insertion
  readonly name: string;
  readonly description?: string;
  readonly builtIn: boolean;       // built-in command → run action (REQ-CP-006), not insert
}
export interface ProviderCommandCatalogPort {
  /** Provider command/skill entries for the open palette. Load-or-default: [] on empty/unloaded. */
  getEntries(kind: CatalogEntryKind): Promise<CatalogEntry[]>;
}
```

- **Built-in commands are NOT in the port.** The six built-ins (`/clear`,`/new`,`/add-dir`,
  `/resume`,`/fork`,`/compact`) are a **pure application-layer list** (ported from Claudian's
  `builtInCommands.ts` + `hiddenCommands`) listed *before* provider entries and independent of any
  catalog load (REQ-CP-003). The port supplies only the *provider* (lazily-loaded, file-backed via
  `VaultPort`) entries (REQ-CP-004).
- **Request-id guarding is the consumer's job** (REQ-CP-004): `useComposerMode` stamps each open
  with a monotonic request id and discards a late `getEntries` response whose id is stale — the port
  itself stays a plain async data seam (mirrors the title-gen per-id abort discipline, ADR-TS-003).
- One impl wired in P4 (Claude, file-backed); the per-provider shape is the P9 seam (NG5).

### 3. `ShellExecPort` — the security-bounded bang-bash execution seam (NFR-CP-006)

```ts
// src/domain/ports/ShellExecPort.ts
export interface ShellExecRequest { readonly command: string; }   // EXACTLY the user's typed text
export interface ShellExecResult {
  readonly command: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;        // 124 = timeout/maxbuffer (Claudian parity)
  readonly truncated: boolean;      // hit the output cap
  readonly notice?: string;         // 'timed out' / 'output exceeded 1MB'
}
export interface ShellExecPort {
  /** Run one command. Resolves a Result; a non-zero exit is ok(result), not err. */
  run(request: ShellExecRequest): Promise<Result<ShellExecResult, Error>>;
}
```

**This port is the sole shell-execution path in the plugin** and carries a hard security posture:

- **S1 — User-explicit only.** The port runs only when the user explicitly submits an `!cmd`
  (REQ-CP-030). No auto-execution, no model-invoked execution, no chaining (REQ-CP-032). The
  *caller* (the bang-bash mode in `useComposerMode`) is the only thing that may call `run`, and only
  on an explicit Enter — never on paste/programmatic set. The port has **no** API the model/runtime
  can reach: it is **not** a member of `ChatRuntimePort` and is never exposed as a tool.
- **S2 — No command rewriting.** `request.command` is passed through verbatim — no prefix/suffix,
  no augmentation, no shell-metacharacter sanitisation that would change semantics (REQ-CP-030).
  It is the user's own terminal; legitimate dual-use (parity with `BangBashService`).
- **S3 — No secret capture.** The exec environment is the user's own environment (parity), but the
  port **never reads, logs, or renders any secret value** into the output block. Plugin secrets
  (`SecretStorePort`, future) are never injected into the child env beyond what the user's own shell
  already has; the `LoggerPort` never logs `stdout`/`stderr` content; only the command string + exit
  code may be logged (NFR-CP-006, NFR-CP-010).
- **S4 — Bounded.** 30 s timeout + 1 MB output cap (Claudian parity); on breach → `exitCode 124` +
  `truncated`/`notice`, never an unbounded read or a thrown error across the port (`Result`).
- **S5 — Output is a tool-like block.** The result surfaces as a render-only block (REQ-CP-031),
  no `v-html`/`innerHTML` (NFR-CP-003); stderr + non-zero exit are indicated.

**Three-bridge story:**
- **`ObsidianBridge`** → a real impl under `src/infrastructure/obsidian/**` (coverage-excluded,
  CLAUDE.md) wrapping node `child_process.exec` with the Claudian options (cwd = vault adapter
  base path, enhanced PATH, timeout, maxBuffer, `cmd.exe`/`/bin/bash`). The only place `node:*` /
  `child_process` is imported in the whole codebase besides the existing CLI runtime.
- **`MockBridge`** → a scripted/echo impl: returns a deterministic `ShellExecResult` from a fixture
  map (used by `npm run dev` + unit tests); **never spawns a process**.
- **`LocalStorageBridge`** (GitHub Pages demo) → an **unavailable** impl: `run` resolves
  `err(new Error('shell execution is not available in the browser demo'))`, surfaced as a notice —
  honest capability gating, no silent dead path (parity with ADR-TS-004 transport honesty).

**Stateless → the bridge IS the port** (no factory needed, unlike `ChatRuntimePort`): exec has no
per-conversation state. `SHELL_EXEC_PORT` InjectionKey + `useShellExecPort()` composable.

### 4. InjectionKeys + composables (additive; no aggregate)

```ts
// src/infrastructure/bridge/ports.ts (additive)
export const MENTION_DATA_PROVIDER_PORT: InjectionKey<MentionDataProviderPort> = Symbol('MentionDataProviderPort');
export const PROVIDER_COMMAND_CATALOG_PORT: InjectionKey<ProviderCommandCatalogPort> = Symbol('ProviderCommandCatalogPort');
export const SHELL_EXEC_PORT: InjectionKey<ShellExecPort> = Symbol('ShellExecPort');
```

`MentionDataProviderPort` + `ProviderCommandCatalogPort` are provided per mount as factories
(`bridge.createMentionDataProvider()` / `bridge.createProviderCommandCatalog()`) because the Claude
impl binds to the active provider context; `ShellExecPort` is provided directly (stateless). All
three keep the one-port-one-consumer rule (ADR-008, ADR-CC-001 §5); no `usePorts()` aggregate.

## Considered options

### Mention seam
- **A — One `MentionDataProviderPort` composing a vault source (VaultPort) + a catalog source *(chosen)*.**
  Pros: vault and non-vault sources independently swappable (REQ-CP-012); the UI keeps `VaultPort`
  for files (REQ-CP-010) and the port stays a thin merge seam; MCP no-op now (NG4).
  Cons: a composite has two moving parts — bounded and tested per source.
- **B — Two separate ports (a vault-mention port + a catalog port).** Cons: the vault source is
  already `VaultPort`; a second vault-shaped port duplicates it; the palette wants one merged list —
  rejected.

### Command/skill seam
- **A — A `ProviderCommandCatalogPort` for provider entries; built-ins as a pure app list *(chosen)*.**
  Built-ins need no IO (REQ-CP-003); only provider entries are file-backed + lazy (REQ-CP-004).
- **B — Fold built-ins into the port.** Cons: forces an IO round-trip for a static list; couples the
  always-present built-ins to a provider load that may be empty/slow. Rejected.

### Bang-bash exec seam
- **A — A dedicated `ShellExecPort` with the S1–S5 posture, three-bridge incl. browser-unavailable *(chosen)*.**
  Pros: the sole shell path; security posture is one auditable surface; browser demo degrades
  honestly; never reachable by the model.
- **B — Add an exec method to `ChatRuntimePort`.** Cons: would put a model-reachable shell on the
  runtime port — exactly the auto-exec risk S1 forbids; conflates user-terminal with agent-turn.
  **Rejected on security grounds.**
- **C — Run exec in the UI layer directly.** Cons: violates DDD inward-only + Vue-no-`node:*`
  (NFR-CP-002/003). Rejected.

## Consequences

### Positive
- Three small, single-consumer ports; the mention/catalog seams are P9-ready (per-provider) and
  P8-ready (MCP) without rework (additive, NFR-CP-009).
- The single most sensitive capability (shell exec) is isolated behind one port with an explicit,
  auditable security posture and an honest browser-unavailable degrade (NFR-CP-006).

### Negative
- Three new InjectionKeys + composables + nine bridge method-impls (3 ports × 3 bridges) — the
  expected ADR-008 fan-out cost; mitigated by the Mock/Local impls being trivial.

### Neutral
- `ShellExecPort` is stateless (bridge-is-the-port), diverging from `ChatRuntimePort`'s factory
  shape — correct for a stateless capability.

## Compliance

- A review check confirms `ShellExecPort` is the **only** `child_process`/`node:*` shell import
  outside the existing CLI runtime, and that no `ChatRuntimePort` member exposes exec (S1).
- A test asserts the bang-bash caller calls `run` only on explicit Enter, never on paste/set
  (REQ-CP-032); the `MockBridge` impl proves no process spawns; the `LocalStorageBridge` impl
  resolves `err` (browser-unavailable).
- A test asserts `LoggerPort` never receives `stdout`/`stderr` content (S3), only the command +
  exit code; the output cap + timeout map to `exitCode 124` + `truncated`/`notice` (S4).
- A test asserts the catalog consumer discards a stale-request-id `getEntries` response (REQ-CP-004)
  and that built-ins list with no catalog load (REQ-CP-003).
- ESLint: no `obsidian`/`node:*` under `src/ui/**`; the three ports' UI consumers use composables.

## References

- PRD-CP-001 — REQ-CP-003/004/009/010/012/013/014/030/031/032; NFR-CP-002/003/006/010.
- `specs/composer-power/design.md` Part C.
- ADR-008 (narrow ports, one per consumer, three bridges), ADR-CC-001 §6 (per-mount factory pattern),
  ADR-PSR-002 (device-local settings / no `data.json` secret), ADR-TS-004 (honest browser/transport degrade).
- Charter §3.3, §6c (recommended new ports), CHARTER-REQ-SEC.
- Claudian reference: `features/chat/services/BangBashService.ts` (exec options), `shared/mention/{MentionDropdownController,VaultMentionCache,VaultMentionDataProvider,types}.ts`, `utils/contextMentionResolver.ts`, `core/commands/builtInCommands.ts`, `core/providers/commands/*`, `providers/claude/{commands,storage}/*`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
