---
id: ADR-PV-003
title: Read provider transcripts beyond the vault through a read-scoped, consented HomeFsPort
status: accepted
date: 2026-05-26
deciders:
  - architect (P9 providers-registry, autonomous-drive)
consulted:
  - pm (PRD-PV-001)
  - parity-charter §6a (HomeFsPort security surface)
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [providers, home-fs, beyond-vault, security, consent, transports, P9]
---

# ADR-PV-003 — Read provider transcripts beyond the vault through a read-scoped, consented HomeFsPort

## Status

Accepted — P9 (`feature/providers-registry`, autonomous-drive). Ratifies CLAR-PV-002 and folds in the
ACP / Codex JSON-RPC transport placement (the §6a "ACP transport port + Codex JSON-RPC transport" note).

## Context

The six core ports are vault-scoped (`VaultPort` reads only inside the vault). Codex and Opencode store
their session transcripts in the user's home directory (`~/.codex`, `~/.claude`) — **outside the vault**.
Reading there is a genuine new security surface (charter §6a line 234-236: "reads outside the vault →
needs an ADR"). Claudian's `core/storage/HomeFileAdapter.ts` reads these paths directly; Specorator must
do so behind a narrow port, scoped, consented, and inert on the demo bridges.

P9 also introduces two real subprocess transports — the Codex **app-server JSON-RPC-over-stdio**
transport (`CodexAppServerProcess`/`CodexRpcTransport`) and the shared **ACP** (Agent Client Protocol)
line-delimited JSON-RPC transport (`providers/acp/AcpSubprocess`/`AcpJsonRpcTransport`) Opencode rides.
These are Node-only, coverage-excluded infra; the registry (ADR-PV-001) constructs the runtimes that
wrap them; a scriptable Mock carries the automated coverage.

Forces: (a) the read must be restricted to the declared provider roots, never an arbitrary home path
(REQ-PV-081, NFR-PV-003); (b) first beyond-vault access is user-consented once, via an Obsidian `Modal`
(never `window.confirm`), and the consent persists device-local (REQ-PV-082); (c) the port never writes/
deletes outside the vault unexpectedly (REQ-PV-081); (d) on the Mock/LocalStorage bridges it is inert
(REQ-PV-083, NFR-PV-012); (e) Codex/Opencode history must plug into the **unchanged P3
`ProviderHistoryPort`** (REQ-PV-084); (f) the transports must never throw across the port boundary —
timeout/abort/dying-subprocess become a `Result.err` / a terminal error `StreamChunk` (REQ-PV-051/052).

## Decision

We will introduce a narrow, **read-first** `HomeFsPort` (domain `src/domain/ports/`, own `HOME_FS_PORT`
InjectionKey + `useHomeFsPort()` composable, one consumer, no aggregate), `Result`-typed, rooted at
`os.homedir()` and scoped to the declared provider roots:

```ts
interface HomeFsPort {
  isAvailable(): boolean;                                       // false on demo/non-Node bridges (inert)
  readFile(relPath: string): Promise<Result<string>>;          // within a declared root only
  exists(relPath: string): Promise<Result<boolean>>;
  listFolders(relPath: string): Promise<Result<readonly string[]>>;
  // declared roots only: ~/.codex, ~/.claude (REQ-PV-081). NO write/delete in P9.
}
```

1. **Read-only + root-scoped** (REQ-PV-080/081, NFR-PV-003). Every `relPath` resolves under one of the
   declared roots (`~/.codex`, `~/.claude`); a path escaping a declared root (`..` traversal, an absolute
   path elsewhere) is rejected with `Result.err`. P9 exposes **no** write/delete — the port cannot touch
   an arbitrary home-dir path; any future genuine provider write is scoped + consented separately.

2. **User-consented once** (REQ-PV-082). The first time an enabled+selected provider needs a
   beyond-vault read, the system shows a one-time Obsidian `Modal` consent prompt (never `window.confirm`,
   REQ-PV-113); declining disables that provider's history with an honest message; consent persists
   device-local (ADR-PSR-002) so the prompt is not repeated.

3. **Inert on the demo bridges** (REQ-PV-083, NFR-PV-012). On `MockBridge`/`LocalStorageBridge`,
   `isAvailable()` is false and the read methods return in-memory fixtures or `ok(null)`/`ok([])` —
   **no `node:fs` call**, so `npm run dev` and the GitHub Pages demo never touch the real filesystem.

4. **History plugs into the unchanged P3 `ProviderHistoryPort`** (REQ-PV-084). Codex's `CodexHistoryStore`
   (parse the JSONL session file under the Codex sessions root via `HomeFsPort`) and Opencode's ACP
   `loadSession`/`listSessions` both map into the provider-neutral P3 history shape; the
   `ProviderHistoryPort` contract is byte-identical to P3 (fork offered only where `supportsFork`).

5. **The transports are coverage-excluded infra behind the registry's runtime construction.** The Codex
   JSON-RPC and the shared ACP transports live in `src/infrastructure/obsidian/**` (coverage-excluded,
   REQ-PV-111); the registry (ADR-PV-001) constructs the provider runtimes that wrap them. The transport
   contract carries **timeout + abort** (a request that times out aborts → `Result.err`, REQ-PV-051) and
   never throws out of a stream (a dying subprocess yields a terminal error `StreamChunk` with the
   stderr ring-buffer detail, REQ-PV-052). A **scriptable Mock** transport on the Mock bridge carries the
   automated coverage (REQ-PV-053); the LocalStorage bridge is inert (providers report "unavailable").
   Subprocesses spawn with an explicit cmd+args + bounded merged env + enhanced PATH + `windowsHide`, no
   shell-eval, with Windows `.cmd` quoting (REQ-PV-031/101, NFR-PV-004); a cancel/reset aborts the RPC
   and shuts the subprocess down gracefully (SIGTERM→SIGKILL, REQ-PV-035/044).

   > **Externals/dependency decision:** prefer NO new runtime SDK dependency for the transports — the
   > Codex JSON-RPC client and the ACP JSON-RPC client are thin, in-tree line-delimited-JSON-RPC-2.0-over-
   > stdio implementations (mirroring Claudian's hand-written `CodexRpcTransport`/`AcpJsonRpcTransport`),
   > consistent with the project's narrow-transport posture. **If** a provider integration genuinely
   > requires a vendor SDK, it is externalized + bundled into `main.js` like `@modelcontextprotocol/sdk`
   > (ADR-MC-002) and `@codemirror/*` — never reaching `build:web` (the real transports live only in
   > `src/infrastructure/obsidian/**`, which the standalone `MockBridge` entry never imports) — with the
   > rationale recorded in the implementing PR per AGENTS.md §8. P9's default is no new dep.

## Considered options

### Option A — Read-first, root-scoped, consented `HomeFsPort`; transports coverage-excluded behind the registry; no new SDK dep (chosen)
- Pros: the beyond-vault surface is minimal (read-only, two roots), consented, and inert on demo;
  history reuses the unchanged P3 port; the transports never crash the host; no new supply-chain surface.
- Cons: a hand-written JSON-RPC client per transport (mitigated — they are thin + Mock-tested; Claudian
  already proves the shape).

### Option B — Widen `VaultPort` to read home-dir paths
- Pros: no new port.
- Cons: conflates the vault boundary with the beyond-vault security surface; breaks the §6a "needs an
  ADR" intent; rejected.

### Option C — A read/write `HomeFsPort` mirroring Claudian's full `HomeFileAdapter`
- Pros: future-proof.
- Cons: a write/delete beyond the vault is exactly the surface P9 must NOT open without explicit scoped
  consent; over-scoped for P9; rejected (read-only in P9, REQ-PV-081).

## Consequences

### Positive
- Only the declared roots are read; no unexpected beyond-vault write/delete (NFR-PV-003).
- The demo + tests never touch `node:fs`; the real `HomeFsPort` + transports are the only coverage-
  excluded beyond-vault code (REQ-PV-083/111).
- Codex/Opencode history is honest about each provider's fork/rewind capability via the unchanged P3 port.

### Negative
- Two hand-written JSON-RPC transports to maintain (accepted — thin, Mock-tested, no SDK supply-chain).

### Neutral
- The consent prompt is a one-time device-local acknowledgement; a Claude-only user never sees it
  (no beyond-vault read, REQ-PV-114).

## Compliance
- Lint/review: no Vue import of `obsidian`/`node:*` (REQ-PV-112); the real `HomeFsPort` + transports in
  coverage-excluded `src/infrastructure/obsidian/**` (REQ-PV-111); the consent flow uses an Obsidian
  `Modal`, not `window.confirm` (REQ-PV-113); no new runtime dep unless recorded per AGENTS.md §8.
- Tests: a path escaping a declared root → `Result.err` (REQ-PV-081); inert on Mock/LS (REQ-PV-083); the
  scriptable Mock transport drives timeout/abort/error-chunk (REQ-PV-051/052/053); history maps into the
  P3 shape (REQ-PV-032/042/084). The real-fs/real-transport legs are manual (TEST-PV-M1/M2, REQ-PV-111).

## References
- PRD-PV-001 (REQ-PV-030..035, 040..044, 050..053, 080..084, 101, 111..113; NFR-PV-003/004/005/007/012/013);
  CLAR-PV-002.
- DESIGN-PV-001 Part C (C.4/C.5/C.6/C.8).
- parity-charter §6a line 234-236 (HomeFsPort needs an ADR; the ACP/Codex transport note).
- `claudian-main` `core/storage/HomeFileAdapter.ts`, `providers/codex/runtime/{CodexAppServerProcess,
  CodexRpcTransport}.ts`, `providers/codex/history/CodexHistoryStore.ts`, `providers/acp/{AcpSubprocess,
  AcpJsonRpcTransport}.ts`; `claudian-audit-backend.md:602,626-628` (HomeFsPort), `:564-570` (transports).
- Related: ADR-TS-001 (`ProviderHistoryPort`; `HomeFsPort` deferred to P9 — realised here), ADR-MC-002
  (externalized-dep precedent), ADR-PV-001 (registry), ADR-PV-002 (secrets), ADR-PSR-002 (device-local).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
