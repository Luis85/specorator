---
id: ADR-PSR-002
title: Persist user/device-scoped settings to device-local storage, not data.json
status: accepted
date: 2026-05-24
deciders:
  - architect
  - pm
  - maintainer (human)
consulted:
  - analyst
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [architecture, settings, persistence, claudian-reboot, P0]
amended:
  - date: 2026-05-24
    by: architect
    note: >-
      CHARTER-REQ-FRESH (no backwards compatibility) — removed the one-time
      legacy data.json→device-local migrate-and-clear from the Decision. Settings
      are now load-or-default off the device-local store; no migration of any
      prior state. The device-local backing-store decision is unchanged. Amended
      in place because this ADR was not yet downstream-consumed (no
      implementation depends on the removed migration).
---

# ADR-PSR-002 — Persist user/device-scoped settings to device-local storage, not `data.json`

## Status

Accepted

## Context

P0 of the `claudian-reboot` epic reduces `PluginSettings` to a core-only
`{ locale, logLevel }` surface (REQ-PSR-006) persisted through `SettingsPort`
(REQ-PSR-007). In the pre-reboot plugin these settings ride Obsidian's
`Plugin.loadData`/`saveData` pair, which serialises to the per-plugin
`data.json` inside the vault's `.obsidian/plugins/specorator/` folder.

The updated epic parity charter (`specs/claudian-reboot/parity-charter.md` §1,
bounding constraint **CHARTER-REQ-SET**) adds a binding constraint surfaced as
**REQ-PSR-013** (with the data-hygiene guard **NFR-PSR-010** and the
compatibility check **NFR-PSR-011**): user/device-scoped settings must persist
to a device-local store **outside** `data.json`.

A later charter amendment (**CHARTER-REQ-FRESH**, no backwards compatibility —
PRD NG8) further rules out *any* migration of prior `data.json` / settings /
session state. P0 is a complete rewrite: there is no strip-on-read field
migration, no `settingsVersion` bump, and no one-time legacy→device-local
relocate-and-clear. On first run with no stored settings the plugin uses
`DEFAULT_SETTINGS` (**load-or-default**). This ADR was amended in place
(2026-05-24) to drop the migrate-and-clear step it originally carried; see the
frontmatter `amended` note.

Forces at play:

- **Collaboration / version control.** Vaults are used collaboratively and are
  commonly git-backed. `data.json` is committed and shared between machines and
  contributors. Personal, device-specific preferences (display language,
  console log verbosity) are not vault content and must not leak into shared,
  version-controlled state where they cause noisy diffs and clobber each
  collaborator's local choice on sync.
- **Sync semantics.** Obsidian Sync and git both replicate `data.json` across
  devices. A device-local store (`app.loadLocalStorage`/`app.saveLocalStorage`)
  is device-scoped and **not** synced — the correct scope for `locale`/`logLevel`,
  which are properties of *this* machine's view, not of the vault.
- **Forward compatibility (the secret seam).** The same charter constraint set
  carries **CHARTER-REQ-SEC** / **REQ-PSR-014**: secrets must live in
  `app.secretStorage`, never `data.json`. That is a separate, P0-vacuous
  concern (P0 has no secret) and is **deliberately not** decided here — see the
  forward pointer below. This ADR is about non-secret, device-scoped
  *preferences* only.
- **Manifest policy.** `minAppVersion` is pinned at `1.12.7` (R-PSR-6, NG6) and
  must not change. The chosen device-local API must be available at that pin.

The `SettingsPort` **contract is unchanged** — `getSettings`/`saveSettings`
keep the same signatures and `PluginSettings` keeps the same `{ locale,
logLevel }` shape (REQ-PSR-006). Only the `ObsidianBridge` backing store moves.
`MockBridge` (in-memory, tests + `npm run dev`) and `LocalStorageBridge`
(web/GitHub-Pages demo, already browser-`localStorage`-backed) are unaffected in
contract; only the production `ObsidianBridge` changes where it reads and writes.

## Decision

We persist the user/device-scoped `PluginSettings` (`locale`, `logLevel`)
through `ObsidianBridge` to a **device-local store** — Obsidian's
`app.loadLocalStorage(key)` / `app.saveLocalStorage(key, data)` under a single
stable key `specorator:settings` — and **not** to `data.json`
(`Plugin.loadData`/`saveData`). The device-local store is device-scoped and not
synced; `data.json` is reserved for genuinely vault-shared settings, of which
P0 has **none** (so P0's `data.json` settings slice is empty after migration).

`getSettings` reads the device-local store (falling back to `DEFAULT_SETTINGS`
when absent or unparseable); `saveSettings` writes the device-local store and
writes **nothing** to `data.json`.

**No migration from legacy `data.json` (CHARTER-REQ-FRESH) — load-or-default.**
P0 is a complete rewrite with no backwards compatibility (PRD NG8). The plugin
does **not** read, project, relocate, or clear any prior `data.json` settings
slice, and `coreSettingsModule` carries **no** `migrate()` and does **not** bump
`settingsVersion`. On first run with no device-local settings the plugin loads
`DEFAULT_SETTINGS`; an in-place upgrade simply finds no device-local blob and
starts from defaults. (An earlier revision of this ADR specified a one-time
legacy→device-local migrate-and-clear; that step is removed by CHARTER-REQ-FRESH
— see the amendment note.)

**API-availability check (NFR-PSR-011).** The dev MUST verify, at implementation,
that `app.loadLocalStorage`/`app.saveLocalStorage` are available at
`minAppVersion 1.12.7` before relying on them. If they are not available at the
pinned version, escalate per NG6 / R-PSR-6 (do not silently bump the manifest);
the fallback option below (a gitignored device-local file under the plugin data
folder) is the escalation path.

### Forward pointer — secrets (REQ-PSR-014, CHARTER-REQ-SEC) deferred to P1

This ADR covers **non-secret, device-scoped preferences only**. The
`SecretStorePort` contract and its `app.secretStorage` binding (for API keys and
tokens — the first being the Claude key in P1) are a **separate decision filed
under a deferred ADR when the first secret lands in P1+**. P0 introduces no
secret surface and, per SPEC-PSR-013, deletes the prior
`SECRET_STORE_PORT`/`SecretStorePort`/`SECRET_ID_*` symbols. We do **not** fold
secrets into this ADR beyond this pointer. Open flag carried to P1: confirm
`app.secretStorage` availability at `minAppVersion 1.12.7` before that surface
lands (NFR-PSR-011); escalate rather than bump the manifest silently.

## Considered options

### Option A — Device-local store (`app.loadLocalStorage`/`saveLocalStorage`) with load-or-default, no migration (chosen)

- Pros: device-scoped + not synced — the correct scope for personal preferences;
  keeps `data.json` clean on git-backed collaborative vaults (CHARTER-REQ-SET);
  the `SettingsPort` contract and `PluginSettings` shape are unchanged
  (`MockBridge`/`LocalStorageBridge` untouched in contract); native Obsidian API,
  no new dependency or file format; **no migration code** to write, test, or
  maintain (CHARTER-REQ-FRESH) — the load path is simply load-or-default.
- Cons: device-scoped means a new machine starts from defaults until the user
  re-chooses (acceptable — these are local preferences, and `locale` defaults to
  `en`, `logLevel` to `warn`); an in-place upgrade from a pre-reboot install does
  not carry forward any prior `locale`/`logLevel` (accepted — no backwards
  compatibility, NG8); depends on the API being present at `minAppVersion 1.12.7`
  (verified per NFR-PSR-011).

### Option B — Keep settings in `data.json` (`loadData`/`saveData`) — status quo

- Pros: simplest; no migration; the pre-reboot path.
- Cons: violates CHARTER-REQ-SET / REQ-PSR-013 — `data.json` is committed and
  synced, so personal `locale`/`logLevel` leak into shared, version-controlled
  state, causing noisy diffs and cross-collaborator clobbering. Rejected.

### Option C — Gitignored device-local file under the plugin data folder

- Pros: device-scoped and outside `data.json`; works even if the
  `app.loadLocalStorage` API is unavailable at the pin.
- Cons: needs an explicit `.gitignore` entry the user must maintain (fragile — a
  file the plugin writes inside `.obsidian/plugins/specorator/` is easy to commit
  by accident); reinvents what `app.saveLocalStorage` provides natively. Kept as
  the **escalation fallback** if Option A's API proves unavailable at `1.12.7`
  (NFR-PSR-011), not the default.

## Consequences

### Positive

- Personal preferences no longer enter `data.json`; git-backed and synced vaults
  stay free of per-device noise (CHARTER-REQ-SET / REQ-PSR-013 / NFR-PSR-010).
- The `SettingsPort` contract, `PluginSettings` shape, the settings tab
  (REQ-PSR-007), and `MockBridge`/`LocalStorageBridge` are all unchanged — the
  move is confined to `ObsidianBridge` + the `main.ts` persistence path.
- No migration code (CHARTER-REQ-FRESH): the load path is a simple
  load-or-default off the device-local store — nothing to project, relocate, or
  clear, and no version-driven branch to test or maintain.
- A device-local store is the correct sync scope; Obsidian Sync / git no longer
  replicate machine-specific preferences.

### Negative

- Device-scoped storage means preferences do not follow the user to a new device;
  this is intended for `locale`/`logLevel` but is a behaviour change from the
  pre-reboot synced `data.json`.
- No backwards compatibility: an in-place upgrade from a pre-reboot install does
  not carry forward any prior `locale`/`logLevel`; first run loads
  `DEFAULT_SETTINGS` (accepted per NG8 / CHARTER-REQ-FRESH).
- Adds a dependency on the `app.loadLocalStorage`/`saveLocalStorage` API being
  present at `minAppVersion 1.12.7` (verified per NFR-PSR-011; escalation path =
  Option C).

### Neutral

- `data.json` survives as the slot for genuinely vault-shared settings; P0 has
  none, so its settings slice is empty. Later phases that add a truly vault-shared
  setting put it back in `data.json`.
- The `_storedData`/`saveData` path in `main.ts` loses its P0 settings consumer.
  `PluginCore.init(storedData)` may still take a stored-data argument for module
  bootstrap, but the **settings** write no longer rides `saveData`; if no kept P0
  consumer of `saveData` remains, the dev drops the `saveData(this._storedData)`
  call (Stage 5 / SPEC-PSR-002 notes this; see Compliance).
- Secrets are explicitly **out of scope** here and decided under a deferred P1
  ADR (REQ-PSR-014 / CHARTER-REQ-SEC).

## Compliance

- **`ObsidianBridge.getSettings`/`saveSettings`** read/write
  `app.loadLocalStorage('specorator:settings')` / `saveLocalStorage(...)`, never
  `loadData`/`saveData` for the settings slice (SPEC-PSR-008, design §C.6).
- **Load-or-default, no migration** (CHARTER-REQ-FRESH) — `coreSettingsModule` has
  no `migrate()` and no `settingsVersion` bump; `getSettings()` returns
  `DEFAULT_SETTINGS` when the device-local blob is absent/unparseable. No legacy
  `data.json` read/project/relocate/clear (SPEC-PSR-002, design §C.3/§C.3a).
- **NFR-PSR-010 regression guard** — a test asserts that after a `saveSettings`,
  the persisted `data.json` settings slice contains no `locale` and no `logLevel`,
  and the value round-trips through the device-local store (TEST-PSR-024).
- **NFR-PSR-011 API-availability** — the dev verifies `app.loadLocalStorage`/
  `saveLocalStorage` are available at `minAppVersion 1.12.7` before relying on
  them; escalate (Option C fallback) rather than bump the manifest (NG6).
- **`manifest.json`** identity unchanged; `validate:manifest` passes
  (NFR-PSR-007).

## References

- PRD-PSR-001 (`specs/plugin-shell-reboot/requirements.md`) — REQ-PSR-013
  (load-or-default), REQ-PSR-014, NFR-PSR-010, NFR-PSR-011, NG8, Clarification
  CL-FRESH.
- DESIGN-PSR-001 (`specs/plugin-shell-reboot/design.md`) — §C.3 (data model =
  load-or-default), §C.3a (device-local, no migration), §C.6 (`main.ts`
  persistence path), §C.16 (settings storage).
- SPEC-PSR-001 (`specs/plugin-shell-reboot/spec.md`) — SPEC-PSR-002 (load-or-default,
  no migration), SPEC-PSR-008 (settings tab persistence), TEST-PSR-024.
- CHARTER-CLAUDIAN-REBOOT (`specs/claudian-reboot/parity-charter.md`) §1
  (CHARTER-REQ-SET, CHARTER-REQ-SEC, CHARTER-REQ-FRESH), §6a (Settings storage —
  RESOLVED, P0-relevant, ADR filed in P0).
- ADR-PSR-001 (`docs/adr/ADR-PSR-001-reboot-plugin-shell.md`) — the P0 reboot
  this ADR's settings change rides on.
- ADR-008 (`docs/adr/ADR-008-narrow-ports-supersede-ibridge.md`) — `SettingsPort`
  narrow-port contract (unchanged here).
- Obsidian API: `App.loadLocalStorage` / `App.saveLocalStorage` (device-scoped,
  not synced); `App.secretStorage` (vault-keyed, out of scope — deferred P1 ADR).
- **Deferred (P1):** the `SecretStorePort` / `app.secretStorage` ADR for the first
  secret (Claude key) — REQ-PSR-014 / CHARTER-REQ-SEC. Not decided here.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR;
> only the predecessor's `status` and `superseded-by` pointer fields may be updated.
