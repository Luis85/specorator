---
id: ADR-PV-002
title: Store provider secrets in Obsidian native secret storage behind a SecretStorePort, never data.json
status: accepted
date: 2026-05-26
deciders:
  - architect (P9 providers-registry, autonomous-drive)
consulted:
  - pm (PRD-PV-001)
  - parity-charter §1 (CHARTER-REQ-SEC) / §6a
informed:
  - planner
  - dev
  - qa
  - human (minAppVersion escalation gate — see Compliance)
supersedes: []
superseded-by: []
tags: [providers, secrets, security, secret-storage, minAppVersion, P9]
---

# ADR-PV-002 — Store provider secrets in Obsidian native secret storage behind a SecretStorePort, never data.json

## Status

Accepted — P9 (`feature/providers-registry`, autonomous-drive). Ratifies CLAR-PV-003 + CLAR-PV-004 +
CLAR-PV-006. **One escalation gate carried to the human** (the `app.secretStorage` `minAppVersion` check
— see Compliance); the architectural decision is accepted regardless of the verdict because the
capability-gate (REQ-PV-072) makes a host without secret storage degrade rather than force a bump.

## Context

P9 is the first phase that stores a provider secret (an API key / auth token). The charter
(CHARTER-REQ-SEC, §1 line 57-63; §6a line 237-240, RESOLVED) mandates Obsidian **native secret storage**
(`app.secretStorage` — vault-keyed local storage, outside `data.json`), behind a `SecretStorePort`. We
deliberately do NOT copy Claudian, which writes raw API keys into its settings JSON. `data.json` is
git-shared/committed (CHARTER-REQ-SET), so a secret there leaks across collaborators.

Forces: (a) the secret must never reach `data.json`, the device-local settings store, a notice, a log, a
Pinia store, or a DTO (CHARTER-REQ-SEC; REQ-PV-070/071/102; NFR-PV-002); (b) the real binding is an
Obsidian API → coverage-excluded infra → the demo bridges must not touch a real OS secret (REQ-PV-073);
(c) `app.secretStorage` availability at the user-confirmed intentional `minAppVersion 1.12.7` is
unverified, and the charter mandates **escalate, do not silently bump** (CLAR-PV-004); (d) when native
storage is unavailable the surface must capability-gate, never fall back to a plain store (REQ-PV-072).

## Decision

We will introduce a narrow **`SecretStorePort`** (domain `src/domain/ports/`, own `SECRET_STORE_PORT`
InjectionKey + `useSecretStorePort()` composable, one consumer, no aggregate), `Result`-typed:

```ts
interface SecretStorePort {
  isAvailable(): boolean;                                  // false ⇒ capability-gate the surface (REQ-PV-072)
  getSecret(key: string): Promise<Result<string | null>>; // null = no stored value (load-or-default)
  setSecret(key: string, value: string): Promise<Result<void>>;
  deleteSecret(key: string): Promise<Result<void>>;
  listKeys(): Promise<Result<readonly string[]>>;          // KEYS only — never values
}
```

1. **Binding.** On `ObsidianBridge` (coverage-excluded `src/infrastructure/obsidian/**`) the port is
   backed by `app.secretStorage`. On `MockBridge` and `LocalStorageBridge` it is a **non-persistent
   in-memory map** (cleared per session), so unit tests and the GitHub Pages demo never read or write a
   real OS/native secret (REQ-PV-073, NFR-PV-012).

2. **Read at the infrastructure boundary only.** A provider runtime that needs a key fetches it via
   `getSecret` **inside the bridge / runtime construction** and injects it into the subprocess env
   (`{ ...process.env, <secret>, PATH: enhancedPath }`, REQ-PV-101). The secret value **never** crosses
   into the application/UI layer, a Pinia store, or a DTO (REQ-PV-071, ADR-003). A failure involving a
   key reports the failure (e.g. "authentication failed") with **no key substring** in any notice/log
   (REQ-PV-102, NFR-PV-002).

3. **Capability-gate when unavailable, never a plain-store fallback** (REQ-PV-072). When
   `isAvailable()` is false the secret-entry surface is disabled with an honest "secret storage
   unavailable" message; the system does **not** write the secret to `data.json` or any plain settings
   store.

4. **The minimal secret-entry seam only** (REQ-PV-092, NG2): a masked input wired to `setSecret`,
   never echoing the stored value back into the DOM. The full per-provider settings shell is P10.

5. **Auth scope** (CLAR-PV-006, NG5): P9 supports CLI/env auth + a native-secret API key per provider.
   Non-CLI/non-env auth flows (OpenRouter / Kimi compatibility) are out of P9.

## Considered options

### Option A — `SecretStorePort` → `app.secretStorage`, in-memory on demo bridges, capability-gated (chosen)
- Pros: honours CHARTER-REQ-SEC (no secret in `data.json`); a single narrow port; the real binding is
  coverage-excluded; demo/tests never touch a real secret; degrades honestly when unavailable.
- Cons: depends on an Obsidian API whose `minAppVersion` floor is unverified (handled by the escalation
  gate + the capability-gate).

### Option B — Plain settings JSON (Claudian's approach)
- Pros: trivial; no new API dependency.
- Cons: violates CHARTER-REQ-SEC — the key lands in git-shared `data.json`; rejected outright.

### Option C — A separate gitignored plaintext key file
- Pros: keeps it out of `data.json`.
- Cons: still plaintext on disk; not the charter-mandated native store; rejected.

## Consequences

### Positive
- A provider key lives only in native secret storage; a `data.json`/device-local read contains no secret
  (NFR-PV-002).
- The demo + the test suite are secret-free; the real binding is the only coverage-excluded secret code.

### Negative
- A host whose `app.secretStorage` is unavailable cannot store a key — but it degrades honestly
  (REQ-PV-072) rather than leaking, which is the correct trade.

### Neutral
- `listKeys` returns keys, never values, so a UI can show "key set / not set" without exposing the secret.

## Compliance
- **minAppVersion escalation gate (CLAR-PV-004):** verify `app.secretStorage` availability at
  `minAppVersion 1.12.7` (`manifest.json:5`, user-confirmed intentional policy). If 1.12.7 exposes it →
  keep the manifest untouched. If it requires a newer Obsidian → **escalate to the human with the
  evidence + the proposed bump; do NOT silently raise `minAppVersion`** (charter §1 line 62-63). Default
  posture pending the check = keep 1.12.7 + the REQ-PV-072 capability-gate. Recorded here for the dev to
  execute the API check at implementation and flag the human if triggered (NFR-PV-011).
- Lint/review: no secret value in any `NotificationPort`/`LoggerPort`/Pinia store/DTO (REQ-PV-102); the
  real `SecretStorePort` lives only in coverage-excluded `src/infrastructure/obsidian/**` (REQ-PV-111);
  Mock/LS in-memory (REQ-PV-073).
- Tests: a `data.json` + device-local read after `setSecret` contains no secret substring (REQ-PV-070);
  the unavailable-storage gate is asserted (REQ-PV-072) over the Mock bridge.

## References
- PRD-PV-001 (REQ-PV-070..073, 092, 101, 102, 111; NFR-PV-002/011/013); CLAR-PV-003/004/006.
- DESIGN-PV-001 Part C (C.5/C.8).
- parity-charter §1 (CHARTER-REQ-SEC), §6a line 237-240 (secret handling RESOLVED).
- `claudian-audit-backend.md:606,629-631` (SecretStorePort ports table + secret-handling decision).
- Related: ADR-PSR-002 (device-local settings — secrets are NOT device-local), ADR-PV-001 (registry),
  ADR-PV-003 (home-fs).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
