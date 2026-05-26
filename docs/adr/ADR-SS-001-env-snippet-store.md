---
id: ADR-SS-001
title: Split env-snippet persistence — non-secret structure device-local, secret-bearing values in the secret store — composing SettingsPort + SecretStorePort (no new port)
status: accepted
date: 2026-05-26
deciders:
  - architect (autonomous-drive, /goal 2026-05-26)
consulted:
  - pm (PRD-SS-001, CLAR-SS-001/004)
informed:
  - planner
  - dev
  - qa
supersedes: []
superseded-by: []
tags: [settings-shell, P10, security, environment, secret-store, claudian-reboot]
---

# ADR-SS-001 — Split env-snippet persistence (non-secret structure device-local, secret-bearing values in the secret store), composing SettingsPort + SecretStorePort

## Status

Accepted — P10 (settings-shell). Ratifies CLAR-SS-001 (env-snippet store + the secret-split, ADR-needed)
and CLAR-SS-004 (no new consent gate for the env-secret surface). Parallels ADR-PV-002 (secrets →
native storage, never `data.json`).

## Context

P10 grows the slim P0 `PluginSettingTab` (`src/plugin/settings.ts`) into a per-provider settings shell.
The one genuinely-new subsystem is the **environment settings + env-snippet manager** (REQ-SS-050..067,
G6): named env-var sets ("snippets") scoped `shared` vs `provider:<id>`, with a key-ownership review
(shared-known / provider-owned / shared-unknown) and injection into a provider's subprocess env.

The forcing problem: **env vars can carry secrets.** Claudian-main stores raw env text — including
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — in plain settings JSON (`providerEnvironment.ts` reads/writes
`settings.sharedEnvironmentVariables` and `EnvSnippet.envVars` as plain strings). The reboot forbids
this (CHARTER-REQ-SEC, NFR-SS-002, the `PluginSettings.ts:13` invariant "No secret value ever lives
here"): no secret byte may land in the git-shared `data.json` **or** in the device-local store, both of
which are non-secret stores. P9 already established the secret discipline (ADR-PV-002): provider API
keys persist only through `SecretStorePort` → `app.secretStorage`, read only at the infra boundary into
the subprocess env, never crossing into `data.json` / device-local / a DTO / a notice / a log.

An env snippet, however, is mostly **non-secret personal preference** — its id, name, description, scope,
the non-secret key names + values (e.g. `PATH`, `HTTPS_PROXY`), and the optional per-model
`contextLimits`. That structure is exactly the CHARTER-REQ-SET device-local class (locale, logLevel,
enabled providers, keyboard-nav keys). Only the **secret-bearing values** within a snippet must escape to
the secret store. So the snippet cannot live wholly in either store: a whole-snippet-in-`data.json` leaks
secrets; a whole-snippet-in-secret-storage abuses the narrow key-value secret surface for non-secret
preference data and loses round-trippable structure.

We must decide: (1) where the snippet **structure** persists, (2) where the **secret-bearing values**
persist and under what key namespace, (3) which keys are classified secret, (4) how a snippet's env
reaches a provider subprocess, and (5) whether this warrants a **new `EnvSnippetStorePort`** or composes
the two existing ports.

## Decision

**We split env-snippet persistence and compose the two existing P9 ports — we add NO new port.**

1. **The snippet structure persists device-local via `SettingsPort`**, as an additive `PluginSettings`
   field (mirroring the P9 `homeFsConsent` OPTIONAL-field precedent):

   ```ts
   // src/domain/settings/PluginSettings.ts — additive (P10, SPEC-SS-*)
   /** A persisted env snippet's NON-SECRET structure. Secret-bearing values are
    *  NOT stored here — they hold only a placeholder reference (`secretRef`) and
    *  the value lives in SecretStorePort. Device-local (CHARTER-REQ-SET). */
   export interface EnvSnippetStruct {
     readonly id: string;
     readonly name: string;
     readonly description: string;
     readonly scope?: EnvironmentScope;            // 'shared' | `provider:${ProviderId}`
     /** The env lines, with each secret-classified value replaced by a `secretRef`
      *  placeholder token; non-secret values are kept inline (REQ-SS-066). */
     readonly envEntries: readonly EnvEntry[];
     readonly contextLimits?: Readonly<Record<string, number>>;  // REQ-SS-067
   }
   export interface EnvEntry {
     readonly key: string;
     /** Inline non-secret value, OR `{ secretRef }` pointing at the secret store. */
     readonly value: { readonly kind: 'inline'; readonly text: string }
                    | { readonly kind: 'secretRef'; readonly secretRef: string };
   }
   // additive PluginSettings members (OPTIONAL — absent on a fresh install so the
   // exact-key contract stays byte-identical P0–P9, mirroring homeFsConsent):
   readonly envSnippets?: readonly EnvSnippetStruct[];
   /** The applied env per scope — the non-secret lines + secretRef placeholders
    *  the runtime resolves. Keyed by EnvironmentScope. */
   readonly envScopes?: Readonly<Record<string, readonly EnvEntry[]>>;
   readonly keyboardNav?: KeyboardNavSettings;     // REQ-SS-070 (device-local)
   readonly providerDefaultModel?: Readonly<Record<string, string>>;  // REQ-SS-021
   readonly defaultPermissionMode?: PermissionMode; // REQ-SS-083
   readonly providerCliPath?: Readonly<Record<string, string>>;  // CLAR-SS-006
   ```

   Each new field is **OPTIONAL and absent from `DEFAULT_SETTINGS`**, and round-trips through a new
   `coerce*` helper added to the existing `ObsidianBridge._coerceSettings` chain (alongside
   `coerceActiveProvider` / `coerceEnabledProviders` / `coerceHomeFsConsent`). A non-array / garbage
   value coerces to absent (load-or-default, never throws — REQ-SS-092). The exact-key contract for a
   fresh install stays byte-identical to P9 (NFR-SS-001).

2. **Secret-bearing values persist via `SecretStorePort`** (the P9 native-secret surface, ADR-PV-002)
   under a **deterministic namespace**:

   ```ts
   // domain — pure, total. Mirrors providerSecretKey (SPEC-PV-006).
   export const envSecretKey = (scope: EnvironmentScope, key: string): string =>
     `env.${scope}.${key}`;            // e.g. env.provider:claude.ANTHROPIC_API_KEY
   ```

   The device-local `EnvEntry` for a secret key holds **only** `{ kind: 'secretRef', secretRef:
   envSecretKey(scope, key) }` — never the value. The value goes to `SecretStorePort.setSecret(ref,
   value)`. Removing a snippet/scope entry deletes the value via `SecretStorePort.deleteSecret(ref)`
   (REQ-SS-062). No plaintext secret in `data.json` or device-local (REQ-SS-066/090, NFR-SS-002).

3. **A pure classifier decides secret vs non-secret** (regrown from claudian `providerEnvironment.ts`,
   domain, no I/O):

   ```ts
   // src/domain/chat/environment/classifyEnvironmentKey.ts — pure/total
   type EnvKeyOwnership =
     | { type: 'shared-known' }        // PATH, *_PROXY, CA bundles, TMP* (the SHARED_ENVIRONMENT_KEYS set)
     | { type: 'shared-unknown' }      // anything unrecognised → review warning (REQ-SS-052)
     | { type: 'provider'; providerId: ProviderId };   // ^ANTHROPIC_/^OPENAI_/^OPENCODE_ patterns
   ```

   A value is treated as **secret** when its key is `provider`-owned-and-auth (the provider env-key
   auth patterns, e.g. `*_API_KEY`/`*_AUTH_TOKEN`) **or** the user explicitly marks the entry secret.
   Shared-known and non-auth keys persist inline in the device-local structure. The classifier also
   drives the scope routing helpers (`getEnvironmentScopeUpdates`, `resolveEnvironmentSnippetScope`,
   `getEnvironmentReviewKeysForScope`) regrown 1:1 as pure functions (REQ-SS-051/052/053/064).

4. **Injection into the provider subprocess env** reuses the P9 runtime env merge (ADR-PV-002 §infra
   boundary). At turn start the **infra-boundary** runtime registry composes, for the active provider:
   `{ ...process.env, ...resolve(envScopes['shared']), ...resolve(envScopes['provider:<id>']) }`, where
   `resolve` reads each `EnvEntry` — inline text as-is, `secretRef` via `SecretStorePort.getSecret(ref)`
   (the ONE place the secret value is read, never logged). This is the same env merge the P9 Codex/
   Opencode runtimes already perform for `providerSecretKey`; P10 adds the env-scope contribution
   (REQ-SS-065). The secret value never enters the application/UI/DTO layer.

5. **No new port — compose `SettingsPort` + `SecretStorePort`** behind a pure application
   `EnvSnippetService` (and a pure domain codec). ADR-008 narrow-port discipline says one port per
   consumer kind; the env subsystem's two persistence needs each already have a port (device-local
   prefs = `SettingsPort`; secrets = `SecretStorePort`). A third `EnvSnippetStorePort` would either
   duplicate `SettingsPort` (for the structure) or `SecretStorePort` (for the values), adding a port
   with no new boundary. The composition logic (split on save, rejoin on read, delete-both on remove)
   is **pure application code** over the two ports — tested, no Obsidian.

6. **No new consent gate** (CLAR-SS-004): the env-secret write needs no `homeFsConsent`-style gate — the
   user is explicitly typing/marking a secret into a field. It MUST, however, reuse the
   `SecretStorePort.isAvailable()` check (REQ-SS-015): when native secret storage is unavailable, the
   secret-bearing env field is disabled with an informational message and **no plain-store fallback**
   (the non-secret structure still persists).

## Considered options

### Option A — A new `EnvSnippetStorePort` (load/save/remove, `Result`-typed)

- Pros: one named seam for the env subsystem; symmetrical with `ApprovalRuleStorePort` /
  `McpConfigStorePort`.
- Cons: it would still have to delegate the structure to a device-local store and the secret values to
  the secret store — so it is a *composition wrapper*, not a new boundary. It re-implements coercion +
  the secret split that already belong to `SettingsPort` + `SecretStorePort`. Adds a port + InjectionKey
  + composable + three bridge impls for no new I/O surface. Violates the spirit of ADR-008 ("one port per
  consumer kind", not one port per feature).

### Option B — Whole snippet (including secret values) in the secret store

- Pros: a single store; never a leak risk in `data.json`.
- Cons: abuses the narrow key-value secret surface for bulky non-secret preference data; loses
  round-trippable structured prefs; `listKeys` would surface snippet structure; harder to coerce/migrate;
  the non-secret structure is exactly device-local-pref-shaped (CHARTER-REQ-SET) and belongs there.

### Option C — Whole snippet (including secret values) in device-local `PluginSettings`

- Pros: trivial; one store; matches claudian-main's plain-JSON approach.
- Cons: **a hard CHARTER-REQ-SEC / NFR-SS-002 violation** — a secret value lands in the non-secret
  device-local store (and, on a synced vault, is exactly the class of data that must not). The reboot
  exists in part to fix this claudian leak. Rejected outright.

### Option D (chosen) — Split: non-secret structure device-local (`SettingsPort`), secret values in `SecretStorePort`, composed by a pure service; no new port

- Pros: each datum lands in its correct store (REQ-SS-091); zero secret bytes outside native storage
  (REQ-SS-090, the counter-metric); reuses the proven P9 secret discipline + the device-local coercion
  chain; no new port (ADR-008 honoured); the split/rejoin/delete logic is pure, tested application code;
  the additive OPTIONAL `PluginSettings` fields keep the exact-key contract byte-identical (NFR-SS-001).
- Cons: a snippet's persisted form is two-store (structure + referenced secrets) — slightly more moving
  parts at save/remove time. Mitigated: the pure `EnvSnippetService` is the single owner of the split,
  fully unit-tested; remove-deletes-both is a single code path (REQ-SS-062).

## Consequences

### Positive

- No secret byte in `data.json` or the device-local store across every env flow (REQ-SS-066/090,
  NFR-SS-002) — asserted by a store-content check (the counter-metric).
- Each setting lands in its correct store (REQ-SS-091): structure + prefs → device-local; secret env
  values → `SecretStorePort`; (MCP → vault `.claude/mcp.json` per ADR-MC-001; approval rules → ADR-AS-001).
- Reuses the P9 secret discipline (ADR-PV-002) and the existing `_coerceSettings` round-trip pattern; no
  new port, InjectionKey, or composable (ADR-008, NFR-SS-003).
- The classifier + the split/rejoin/inject logic are pure, Obsidian-free, fully tested — the automated
  weight (NFR-SS-011); the secret read stays at the infra boundary (coverage-excluded).
- Load-or-default, no migration: an absent/garbage snippet field coerces to absent (REQ-SS-092,
  CHARTER-REQ-FRESH); claudian's plain-JSON env is **not** migrated (NG8).

### Negative

- Two-store persistence per secret-bearing snippet (structure ref + secret value) — a remove must touch
  both stores. Owned by one pure path (REQ-SS-062), so the surface is small and tested.
- When `SecretStorePort.isAvailable()` is false the secret-bearing env entry cannot be persisted
  (disabled field, REQ-SS-015) — by design, no fallback.

### Neutral

- The additive `PluginSettings` fields (`envSnippets?`, `envScopes?`, `keyboardNav?`,
  `providerDefaultModel?`, `defaultPermissionMode?`, `providerCliPath?`) are all device-local prefs,
  OPTIONAL, absent from `DEFAULT_SETTINGS`. Their exact shape (field names, codec) is pinned in `spec.md`.

## Compliance

- **Counter-metric / store-content assertion (TEST-SS-066/090):** after any key-entry or secret env flow,
  a read of `data.json` + the device-local blob contains no secret substring; the value is only in the
  `SecretStorePort` (in-memory on Mock/LS, `app.secretStorage` on Obsidian).
- **No new port lint:** no `EnvSnippetStorePort` symbol; the env service depends only on `SettingsPort`
  + `SecretStorePort` (each one-consumer, own InjectionKey/composable — ADR-008, NFR-SS-003).
- **Coercion round-trip (TEST-SS-092):** the additive fields flow through their `coerce*` helpers in
  `ObsidianBridge._coerceSettings`; an absent/garbage value yields the absent/default; a stored snippet
  survives a reload.
- **Pure-classifier discipline (NFR-SS-008):** the env classifier + scope routing import no `obsidian` /
  `node:*` / Vue; no `switch (providerId)` (the provider env-key patterns come from the registry/
  descriptor data, not an id branch).
- **`isAvailable` gate (TEST-SS-015):** the secret-bearing env field is disabled when secret storage is
  unavailable; no plain-store fallback.

## References

- PRD-SS-001 (`specs/settings-shell/requirements.md`) — REQ-SS-050..067, REQ-SS-090/091/092, NFR-SS-002,
  CLAR-SS-001, CLAR-SS-004.
- DESIGN-SS-001 (`specs/settings-shell/design.md`) Part C — system overview, the env service, the
  `_coerceSettings` round-trip, the security analysis.
- ADR-PV-002 — `SecretStorePort` → `app.secretStorage`, never `data.json` (the secret discipline this
  parallels).
- ADR-PSR-002 — device-local settings store, load-or-default, no migration.
- ADR-008 — narrow ports, one per consumer kind (why no new port).
- claudian-main `src/core/providers/providerEnvironment.ts` (the classifier + scope routing regrown
  pure), `src/core/types/settings.ts` (`EnvSnippet`), `src/features/settings/ui/EnvSnippetManager.ts`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
