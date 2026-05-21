---
id: ADR-MPS-003
title: Add Cursor provider; key in SecretStorePort; no keytar fallback
status: accepted
date: 2026-05-21
deciders:
  - architect
  - dev
consulted:
  - qa
  - pm
informed:
  - pm
supersedes: []
superseded-by: []
tags: [architecture, infrastructure, security, multi-provider, secret-storage]
---

# ADR-MPS-003 — Add Cursor provider; key in `SecretStorePort`; no keytar fallback

## Status

Accepted

## Context

SPEC-MPS-001 introduces a second chat provider — Cursor — alongside the
existing Claude integration. Cursor exposes two execution surfaces: a
public HTTP/SSE API (gated for v1 behind the `cursorApiPreview` opt-in
flag pending CQ-MPS-01) and a local `cursor-agent` CLI subprocess
(owned by WS-5). This ADR scopes the **API** surface: how the API key
is stored, how the adapter reads it, and what happens on devices where
secret storage is unavailable.

The predecessor `claude-cli-chat-sidebar` workstream already moved the
Anthropic API key onto `SecretStorePort` (desktop ≥ 1.11.4) so that
`PluginSettings` — which ships through Obsidian Sync — never carries
the secret. The same hygiene is non-negotiable for the Cursor key
(NFR-MPS-001, NFR-MPS-002). Mobile and pre-1.11.4 desktop builds
expose `SecretStorePort.available === false`; on those targets there
is no other safe home for the value.

Forces:

- **No secret in `data.json`.** `PluginSettings` rides Obsidian Sync.
  A leak via Sync would propagate the key to every device the user
  signs in on — and remain in version-control snapshots indefinitely.
  Hard requirement (NFR-MPS-001).
- **No native modules.** Specorator's narrow-port discipline (ADR-008)
  forbids smuggling Obsidian-specific concerns past the seam. Adding
  `keytar` (or any other OS-keychain binding) would re-introduce a
  native dependency that we deliberately removed in the predecessor
  patch and that conflicts with the mobile target.
- **Late key read.** Users will set the Cursor key after the plugin
  has already started. The adapter must therefore not cache the key
  at construction time — every `queryStream()` call re-reads the
  current value (REQ-MPS-013).
- **Preview flag.** Cursor's public HTTP API shape is not yet
  documented in a way we can pin to (CQ-MPS-01). Until WS-4's
  research spike (T-MPS-037) resolves that, the adapter must be
  reachable only when the user explicitly opts in via
  `settings.cursorApiPreview`. Default is `false`.
- **Degraded-mode UX.** On mobile / pre-1.11.4 desktop, the Settings
  Cursor field renders a non-blocking degraded notice rather than a
  password input that silently no-ops (REQ-MPS-012). The selector
  hard-folds every Cursor row to `degraded` (R7 in the §4 truth
  table).
- **Logging discipline.** Adapter logs must contain neither the key
  value, the request body, nor the `Authorization` header (NFR-MPS-002,
  TST-MPS-09). The post-save `data.json` snapshot test verifies the
  storage half (TST-MPS-09 — entered key value yields zero matches in
  the persisted blob).

## Decision

We add a Cursor provider with a single new secret id and a single
new HTTP adapter:

1. **New constant** `SECRET_ID_CURSOR = 'specorator-cursor-apikey'`
   in `src/domain/ports/SecretStorePort.ts`. Mirrors the existing
   `SECRET_ID_ANTHROPIC` shape (lowercase, hyphenated — Obsidian's
   `App.secretStorage` rejects camelCase or dot-delimited ids).

2. **New adapter** `src/infrastructure/cursor/CursorApiAdapter.ts`
   implementing `ChatTransportPort`. Constructor takes a
   `CursorApiAdapterDeps` bag with five injected dependencies:
   `secretStore` (`SecretStorePort`), `logger` (`LoggerPort`),
   `fetch` (`typeof globalThis.fetch`), `baseUrl` (string injected
   by `buildProviderRegistry`), and `getSettings` (closure over the
   live `PluginSettings`).

3. **`isAvailable()` semantics** (synchronous projection rules
   captured in `_routeTransport`):
   - `false` if `!secretStore.available` (REQ-MPS-012).
   - `false` if `!getSettings().cursorApiPreview` (REQ-MPS-014).
   - `false` if `await secretStore.getSecret(SECRET_ID_CURSOR)` is
     null or empty.
   - `true` otherwise.

4. **Late key read.** `queryStream()` re-reads
   `secretStore.getSecret(SECRET_ID_CURSOR)` on every call. The key
   is never closed over at construction time and is never logged.

5. **Logging discipline.** The adapter logs only the request URL
   path (no query string) and the HTTP response status. It never
   logs the request body, headers, or the key. The
   `Authorization` header is constructed in a single expression at
   the `fetch()` call site and is not held on a local variable that
   could be inspected by a future maintenance edit.

6. **Attachment cap.** Before issuing the request the adapter sums
   `attachment.byteLength` across non-vault entries; if any single
   attachment exceeds 5 MB or the total exceeds 5 MB, the adapter
   yields `{ type: 'error', error: ChatTransportError{ATTACHMENT_TOO_LARGE} }`
   then `{ type: 'done' }` and **does not POST** (REQ-MPS-044).

7. **No keytar.** We deliberately do not introduce a native
   keychain binding. On the unavailable path the Settings field
   renders a degraded notice block (`CursorKeyField.vue`
   unavailable variant) with no password input rendered.

8. **No `HttpPort`.** The adapter uses `globalThis.fetch` directly,
   injected through the deps bag for tests. We do not introduce a
   narrow `HttpPort` for one consumer (NFR-MPS-013) — the seam
   would be unused by every other planned feature.

## Considered options

### Option A — `SECRET_ID_CURSOR` on `SecretStorePort` + degraded notice on the unavailable path *(chosen)*

- Pros: Reuses the predecessor secret-storage seam; zero new
  dependencies; degraded UX matches the Anthropic field exactly.
  Mobile/pre-1.11.4 users see a clear "key not stored on this
  device" notice rather than a silent no-op.
- Cons: Cursor on mobile remains unavailable until Obsidian ships
  secret storage there. Acceptable — the Cursor CLI surface (WS-5)
  is the only viable mobile path either way.

### Option B — Add `keytar` as a runtime dependency

- Pros: Works on every desktop build, including pre-1.11.4.
- Cons: Native module; rebuilds per Electron version; conflicts
  with the mobile target; adds an attack surface; re-introduces the
  native-dependency cost we just removed for the Anthropic key.

### Option C — Store the Cursor key in `PluginSettings` with a "do not sync this field" marker

- Pros: One field, no port plumbing.
- Cons: `PluginSettings` is the wrong layer (no opt-out from
  Obsidian Sync at the field granularity); accidental settings
  exports would still capture the value; violates NFR-MPS-001 outright.

### Option D — Per-thread Cursor keys

- Pros: Lets a power user run two Cursor accounts simultaneously.
- Cons: No demand signalled; quadruples the secret-storage surface
  for one speculative use case; complicates the `data.json` leakage
  test. Rejected.

## Consequences

### Positive

- Cursor key never persists in `data.json` (NFR-MPS-001 verified by
  TST-MPS-09 / `cursor-key-leakage.test.ts`).
- Adapter unit tests cover the four `isAvailable()` cases, the late
  key read, SSE event mapping, no-key-in-logs, and the attachment
  cap (T-MPS-040..044).
- Selector truth table (SPEC-MPS-001 §4) is unchanged — R7's
  `cursorApi` row folds to `degraded` when
  `secretStoreAvailable === false`, exactly mirroring the Claude
  rows.
- Adding a third provider in the future is a copy-paste of this
  adapter shape: declare a new `SECRET_ID_*` constant, mirror the
  `isAvailable()` projection, and inject the base URL.

### Negative

- Cursor API is unavailable on mobile until Obsidian ships secret
  storage on mobile. Documented in Settings under the unavailable
  notice.
- The `baseUrl` is injected as a placeholder constant from
  `buildProviderRegistry` until CQ-MPS-01 closes. Until then, the
  preview flag stays `false` by default and the adapter is
  unreachable from the selector.

### Neutral

- The adapter declines to implement `runStructured?` — Cursor
  structured-output is out of scope for v1. The optional shape on
  `ChatTransportPort` makes that a typecheck-only narrowing site at
  the application layer (the existing `queryStructured()` wrapper
  already handles the absence).

## Compliance

- Unit tests under `tests/infrastructure/cursor/CursorApiAdapter.*.test.ts`
  cover the four scenarios listed in SPEC-MPS-001 §11 — TST-MPS-04
  (selector R6 green), TST-MPS-05 (R7 degraded), TST-MPS-07 (preview
  off), TST-MPS-08 (late key read), TST-MPS-29 adapter half
  (attachment cap).
- Component test at `tests/ui/components/settings/CursorKeyField.test.ts`
  covers both available and unavailable variants (REQ-MPS-011,
  REQ-MPS-012).
- E2E leakage test at `tests/plugin/settings/cursor-key-leakage.test.ts`
  asserts the persisted `data.json` blob contains zero matches for
  the entered key value (NFR-MPS-001, TST-MPS-09).
- `npm run verify` exercises typecheck, lint, unit tests, plugin
  bundle, standalone build, and TypeDoc.
- ADR-008 (narrow ports) is upheld: `CursorApiAdapter` imports only
  from `@/domain/ports` and `@/domain/settings`; it does not import
  from `obsidian` or `node:child_process`.

## References

- SPEC-MPS-001 §2.7 (`cursorApiPreview`, `autoPreferProvider`), §5
  (Cursor API adapter contract), §11 (test scenarios).
- DES-MPS-001 §C8 (Cursor API adapter outline), §C12 (ADR draft).
- REQ-MPS-010, REQ-MPS-011, REQ-MPS-012, REQ-MPS-013, REQ-MPS-014,
  REQ-MPS-017, REQ-MPS-044, NFR-MPS-001, NFR-MPS-002, NFR-MPS-013.
- ADR-MPS-001 (port rename — prerequisite).
- ADR-MPS-002 (`ProviderSelection` discriminator — prerequisite).
- ADR-008 (narrow ports — naming and import boundaries).
- CQ-MPS-01 (Cursor public HTTP API shape — open; resolution
  feeds back via `buildProviderRegistry`'s injected `baseUrl`).
