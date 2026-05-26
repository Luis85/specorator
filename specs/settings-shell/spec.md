---
id: SPEC-SS-001
title: Settings shell (P10) — implementation-ready contracts
stage: specification
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
status: complete
owner: architect
integration_branch: next
reference: D:\Projects\claudian-main                    # MIT, read-only structural + visual parity reference
inputs:
  - specs/settings-shell/requirements.md                # PRD-SS-001 (accepted 2026-05-26; REQ-SS-001..095 + NFR-SS-001..012)
  - specs/settings-shell/design.md                      # DESIGN-SS-001 Parts A/B/C (complete)
  - docs/adr/ADR-SS-001  # env-snippet store split — NON-SECRET struct device-local (SettingsPort, additive OPTIONAL PluginSettings fields, _coerceSettings round-trip mirroring homeFsConsent); SECRET values via SecretStorePort under env.<scope>.<KEY>, struct holds only a secretRef; a PURE classifier decides secret-vs-non-secret; injection reuses the P9 runtime env merge; NO new port (compose SettingsPort + SecretStorePort behind a pure EnvSnippetService); NO plaintext secret in data.json/device-local; no new consent gate (CLAR-SS-001/004)
  - docs/adr/ADR-SS-002  # PURE buildSettingsViewModel → ordered capability-gated SettingsViewModel sections (no switch(providerId), extends ADR-PV-001 §4); the PluginSettingTab stays Obsidian Setting-API DOM (NOT Vue, NG2), coverage-excluded src/plugin/** with manual legs; sections surface their existing P6-P9 ports; safe-DOM; native a11y keyboard nav (WCAG 2.2 AA) (CLAR-SS-002)
  - specs/providers-registry/spec.md                    # SPEC-PV-* (the additive-OPTIONAL-field + coerce* + 3-bridge + fake-ports + coverage-exclusion pattern this mirrors)
  - src/domain/settings/PluginSettings.ts               # the additive OPTIONAL fields land here + their coerce* helpers (mirroring coerceHomeFsConsent)
  - src/domain/chat/providers/ProviderDescriptor.ts     # the frozen capability matrix (needsApiKey/supportsMcpTools/supportsProviderCommands) + the additive environmentKeyPatterns field
  - src/domain/ports/ProviderRegistryPort.ts            # listEnabledProviders + getCapabilities (the gate source; UNCHANGED contract bar the descriptor field)
  - src/domain/ports/SecretStorePort.ts                 # set/delete/listKeys/isAvailable/getSecret + providerSecretKey (UNCHANGED contract; env-secrets reuse it under env.<scope>.<KEY>)
  - src/domain/ports/ToolbarCatalogPort.ts              # getCatalog(id).models/defaultModelId (UNCHANGED contract)
  - src/domain/ports/McpConfigStorePort.ts              # load/save/exists (P8, UNCHANGED contract)
  - src/domain/ports/ApprovalRuleStorePort.ts           # loadRules/removeRule/clear (P7, UNCHANGED contract)
  - src/domain/ports/ProviderCommandCatalogPort.ts      # getEntries('command'|'skill') (P4, the read-only slash/skill discovery source)
  - src/plugin/settings.ts                              # the slim P0 SpecoratorSettingTab to grow (Setting-API DOM, coverage-excluded)
  - D:\Projects\claudian-main src/core/providers/providerEnvironment.ts + src/utils/env.ts + src/features/settings/keyboardNavigation.ts + src/core/types/settings.ts (the classifier + parseEnvironmentVariables + parseNavMappings + parseContextLimit + the EnvSnippet/KeyboardNavigationSettings shapes — regrown 1:1)
created: 2026-05-26
updated: 2026-05-26
---

# Specification — Settings shell (P10)

Implementation-ready contracts for P10. Every contract is grounded in `design.md` (DESIGN-SS-001), the two
accepted P10 ADRs (**ADR-SS-001/002**), the **frozen P9 capability matrix** (`ProviderDescriptor.ts` — the
`needsApiKey` / `supportsMcpTools` / `supportsProviderCommands` flags), the existing P4–P9 narrow ports
P10 surfaces (`ProviderRegistryPort`, `SecretStorePort`, `ToolbarCatalogPort`, `McpConfigStorePort`,
`ApprovalRuleStorePort`, `ProviderCommandCatalogPort`), the slim P0 `SpecoratorSettingTab`
(`src/plugin/settings.ts`), and Claudian's real code under `D:\Projects\claudian-main`
(`core/providers/providerEnvironment.ts` — the env classifier + scope routing; `utils/env.ts` —
`parseEnvironmentVariables` / `parseContextLimit`; `features/settings/keyboardNavigation.ts` —
`parseNavMappings` / `buildNavMappingText`; `core/types/settings.ts` — `EnvSnippet` /
`KeyboardNavigationSettings`). **Two independent teams should build the same thing from this document.**

> **Conventions in force (inherited from P0–P9, do not relax):** DDD inward-only imports (ADR-001,
> `domain ← application ← infrastructure ← ui`, NFR-SS-003); narrow ports + three bridges (ADR-008,
> **NO new port** — the env subsystem composes `SettingsPort` + `SecretStorePort` behind a pure
> `EnvSnippetService`, ADR-SS-001 §5); `Result<T,E>` at every use-case + store boundary, no throw across a
> port (ADR-004, REQ-SS-094, NFR-SS-006); **pure-total** transforms (the classifier / codec / coercers /
> view-model never throw, ADR-004); DTO-only store boundary — **no secret value crosses into the view-model,
> a notice, a log, or `data.json`/device-local** (ADR-003, REQ-SS-090, NFR-SS-002); the settings tab stays
> Obsidian `Setting`-API DOM (NOT Vue, NG2, ADR-SS-002) — `src/plugin/**` is the **one** sanctioned place a
> `PluginSettingTab` uses the `Setting` API; **no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`**
> anywhere (REQ-SS-095, NFR-SS-010); blocking flows (delete-snippet confirm) use an Obsidian `Modal`, never
> `window.confirm`/`alert`/`prompt` (REQ-SS-095, NFR-SS-010); `--sp-*` token parity, no raw
> Obsidian-var/physical-property leak (NFR-SS-009); WCAG 2.2 AA + full keyboard nav (REQ-SS-072, NFR-SS-007);
> tests mirror `src/`, coverage 80/70/80/80 with the `Setting`-API DOM (`src/plugin/**`) + the subprocess env
> injection (`src/infrastructure/obsidian/**`) coverage-excluded → manual legs (NFR-SS-011); `manifest.json`
> untouched, **no migration** of any legacy snippet/key/env (NFR-SS-012, CHARTER-REQ-FRESH, NG8);
> **provider-varying behaviour gates on the capability bag / the descriptor data, NEVER
> `switch (providerId)` / `if (provider===)`** in the view-model or the classifier (NFR-SS-008, REQ-SS-010,
> lint/grep-checkable); **additive growth only — no rename/removal of any P0–P9 member; with only Claude
> enabled, P0–P9 settings behaviour is byte-identical** (NFR-SS-001, REQ-SS-093).

This spec defines **28 spec items** across six layer groups (SPEC-SS-001..028). The Tasks stage (`planner`)
decomposes them into `T-SS-NNN`; the QA stage turns the TEST-SS-NNN scenarios (§8) into automated tests.
SPEC-SS items that **extend** a P0–P9 counterpart cite the extension point.

> **The field-level open items the design (DESIGN-SS-001 §Open clarifications) handed to `/spec:specify` —
> RESOLVED HERE (pinned literals, not architecture):**
> 1. **The additive `PluginSettings` field names + the `EnvSnippetStruct`/`EnvEntry` shape + `envSecretKey`** —
>    settled in SPEC-SS-001/004: the six device-local fields (`envSnippets?`, `envScopes?`, `keyboardNav?`,
>    `providerDefaultModel?`, `defaultPermissionMode?`, `providerCliPath?`) are **OPTIONAL + absent from
>    `DEFAULT_SETTINGS`** (mirroring `homeFsConsent`, NFR-SS-001); `envSecretKey(scope, key) = env.<scope>.<KEY>`
>    is the deterministic secret namespace (mirroring `providerSecretKey`).
> 2. **The pinned `SHARED_ENVIRONMENT_KEYS` set + the secret-classification rule** — settled in SPEC-SS-002:
>    the 13-key shared-known set (regrown verbatim) + the **provider-owned auth-key** secret rule
>    (`*_API_KEY` / `*_AUTH_TOKEN` / `*_TOKEN` over a provider-owned key, or a user `markSecret`) route to
>    `SecretStorePort`; every other value stays inline device-local (REQ-SS-066/090).
> 3. **The env-key patterns become additive DESCRIPTOR DATA, never a provider branch** — settled in
>    SPEC-SS-002/SS-009: an additive `ProviderDescriptor.environmentKeyPatterns?: readonly RegExp[]` carries
>    `^ANTHROPIC_` (claude), `^OPENAI_`|`^CODEX_` (codex), `^OPENCODE_` (opencode); the classifier iterates the
>    registry's descriptors' patterns — **no `switch (providerId)`** (NFR-SS-008).
> 4. **The `SettingsControl` discriminated-union members + their port wiring** — settled in SPEC-SS-005: the
>    14-member union (B.1) with its exact per-member port call.
> 5. **The read-only agent/skill/subagent + slash DISCOVERY SOURCE** — settled in SPEC-SS-008: slash + skill
>    read from the existing **P4 `ProviderCommandCatalogPort.getEntries('command'|'skill')** (read-only). There
>    is **no P9 agent/subagent discovery seam**; P10 surfaces agents/subagents **only where a P10-additive
>    read source exists** and **omits the list otherwise** (REQ-SS-031) — read-only either way (NG1). This is
>    flagged to the planner (§Open clarifications) — escalate to PM if a richer agent source is wanted; the
>    must-tier P10 surface needs only the slash/skill catalog (REQ-SS-040 is `should`, REQ-SS-030 is `must`
>    but satisfiable by the catalog's `skill` entries + an omit-when-absent fallback).
> 6. **`contextLimits` sequenced last (REQ-SS-067 `could`)** — settled in SPEC-SS-003: an OPTIONAL
>    `EnvSnippetStruct.contextLimits?` parsed via `parseContextLimit` (bounds 1_000..10_000_000); it MUST NOT
>    gate the must-tier snippet round-trip.

---

## 0. Spec-item index

| Spec item | Title | Layer | New / Extends | REQ / NFR links |
|---|---|---|---|---|
| **DOMAIN** | | | | |
| SPEC-SS-001 | Additive OPTIONAL `PluginSettings` fields + their `coerce*` helpers (+ `envSecretKey`) | domain | extends `PluginSettings.ts` | REQ-SS-060/067/070/071/083/091/092; NFR-SS-001/004 |
| SPEC-SS-002 | `classifyEnvKey` — the PURE classifier + `SHARED_ENVIRONMENT_KEYS` + the secret predicate (+ the additive `environmentKeyPatterns` descriptor field) | domain | new (+ extends `ProviderDescriptor.ts`) | REQ-SS-051/066; NFR-SS-008 |
| SPEC-SS-003 | `EnvSnippet.ts` — `EnvSnippetStruct` / `EnvEntry` / `EnvScope` + the pure `EnvSnippetCodec` (struct ↔ env text, secret split) + `parseContextLimit` | domain | new | REQ-SS-050/060/061/064/067/066 |
| SPEC-SS-004 | `envScope.ts` — `EnvironmentScope` + the PURE scope routing (`getEnvironmentScopeUpdates` / `resolveEnvironmentSnippetScope` / `inferEnvironmentSnippetScope` / `getEnvironmentReviewKeysForScope`) | domain | new | REQ-SS-050/052/053/064 |
| SPEC-SS-005 | `keyboardNav.ts` — PURE `parseNavMappings` / `buildNavMappingText` (single-char + unique) | domain | new | REQ-SS-070/071 |
| **APPLICATION** | | | | |
| SPEC-SS-006 | `buildSettingsViewModel.ts` — PURE ordered + capability-gated `SettingsViewModel` (no `switch(providerId)`) | application | new | REQ-SS-001/002/004/005/010/011/020/030/040/080/081/082/083/093; ADR-SS-002 |
| SPEC-SS-007 | `SettingsControl` discriminated union (the 14 members + per-member port wiring) | application | new | REQ-SS-003/005/011/020/030/040/050/060/070/080/081/082/083/095 |
| SPEC-SS-008 | The read-only agent/skill/subagent + slash discovery source (P4 `ProviderCommandCatalogPort`; agents omitted when absent) | application | extends P4 | REQ-SS-030/031/040/041 |
| SPEC-SS-009 | `EnvSnippetService.ts` — create/edit/remove/apply/list/readScope over `SettingsPort` + `SecretStorePort` (the secret split; `Result`-typed) | application | new | REQ-SS-050..053/060..064/066/067; ADR-SS-001 |
| **INFRA / PLUGIN** | | | | |
| SPEC-SS-010 | `SpecoratorSettingTab.display()` — walk the view-model + render each `SettingsControl` via the `Setting` API; coverage-excluded → manual legs | plugin | extends `settings.ts` | REQ-SS-001..005/010..015/020..022/030/040/050/060..064/080..083/070/095 |
| SPEC-SS-011 | The env-snippet edit `Modal` + the delete-confirm `Modal` (no `window.confirm`) | plugin | new | REQ-SS-060/061/062/063/095 |
| SPEC-SS-012 | `ObsidianBridge._coerceSettings` — round-trip the six additive OPTIONAL fields via the new `coerce*` calls | infra | extends `ObsidianBridge` | REQ-SS-092; NFR-SS-001 |
| SPEC-SS-013 | The provider runtime env merge — inject the applied env-scope (inline + `getSecret(secretRef)`) into the subprocess env (coverage-excluded → manual leg) | infra | extends P9 runtime | REQ-SS-065 |
| SPEC-SS-014 | `MockBridge` / `LocalStorageBridge` — the additive `coerce*` round-trip via `SettingsPort` + the in-memory `SecretStorePort` env-secret slots; `fake-ports` drives the env service | infra | extends P9 bridges | REQ-SS-066/092; NFR-SS-007 |
| **STYLES** | | | | |
| SPEC-SS-015 | The `settings/*` → `--sp-*` token slice (`base/plugin/agent/slash/env-snippets/mcp/opencode-model-picker`) | ui (styles) | new | NFR-SS-009 |
| **CROSS-CUTTING** | | | | |
| SPEC-SS-016 | The shell section/control state model (Claude-only ↔ provider enabled ↔ capability-gated) | app/ui | — | REQ-SS-001/003/010/093 |
| SPEC-SS-017 | The API-key state model (unavailable / not-set / set; value never crosses) | app/ui | — | REQ-SS-011..015 |
| SPEC-SS-018 | The env-edit + snippet state model (editing → classified → review/routed → saved; create/edit/apply/remove) | app/ui | — | REQ-SS-050..053/060..066 |
| SPEC-SS-019 | The secret-split invariant (env secrets via `SecretStorePort` under `env.<scope>.<KEY>`; struct holds only `secretRef`; no secret in `data.json`/device-local) | cross | — | REQ-SS-066/090/091; NFR-SS-002/004 |
| SPEC-SS-020 | The additivity invariant (Claude-only = byte-identical P9; the six fields OPTIONAL + absent from `DEFAULT_SETTINGS`) | domain | — | REQ-SS-093; NFR-SS-001 |
| SPEC-SS-021 | The no-`switch(providerId)` / capability-gated invariant | app | — | REQ-SS-010; NFR-SS-008 |
| SPEC-SS-022 | The `Result`-boundary invariant (every save returns `Result`; failures → notices; no throw across a port) | cross | — | REQ-SS-094; NFR-SS-006 |
| SPEC-SS-023 | The safe-DOM + no-blocking-dialog invariant (`Setting`/`createEl`/`setText`; Obsidian `Modal`) | plugin | — | REQ-SS-095; NFR-SS-010 |
| SPEC-SS-024 | The keyboard-nav + a11y invariant (native focusable controls in view-model order; modal focus trap/restore) | plugin | — | REQ-SS-072; NFR-SS-007 |
| SPEC-SS-025 | The load-or-default / no-migration invariant (absent/garbage → coerced defaults; no legacy migration) | cross | — | REQ-SS-092; NFR-SS-012 |
| SPEC-SS-026 | i18n / microcopy invariant (`settings.*` en+de; no hardcoded string; no secret/env value in a notice or log) | ui | — | REQ-SS-014; NFR-SS-002 |
| SPEC-SS-027 | Coverage split + the manual real legs (TEST-SS-M1..M4); `manifest.json` untouched | cross | — | NFR-SS-001/009/011/012 |
| SPEC-SS-028 | The Claude-only baseline capture on `next` (the additivity reference) | cross | — | REQ-SS-093; NFR-SS-001 |

---

# 1. Domain — additive settings fields, the classifier, the env-snippet shape, scope routing, nav (SPEC-SS-001..005)

Types under `src/domain/settings/` and a new `src/domain/chat/environment/`. No `obsidian`, no `node:*`, no Vue,
no class — additive OPTIONAL settings fields + pure data + pure functions (ADR-001). **Additive only: no P0–P9
field or member is renamed or removed (NFR-SS-001, SPEC-SS-020).** The classifier / codec / scope routing / nav
parser are regrown 1:1 from Claudian's `providerEnvironment.ts` / `utils/env.ts` / `keyboardNavigation.ts`, with
throw-paths converted to total returns (ADR-004) and the provider-id branch replaced by descriptor data
(NFR-SS-008).

## SPEC-SS-001 — Additive OPTIONAL `PluginSettings` fields + `coerce*` + `envSecretKey` (`src/domain/settings/PluginSettings.ts`)

**REQ:** REQ-SS-060/067/070/071/083/091/092 · **NFR:** NFR-SS-001/004 · **ADR:** ADR-SS-001. **Append** six
OPTIONAL device-local fields (each absent from `DEFAULT_SETTINGS`, mirroring `homeFsConsent`) so the exact-key
contract stays byte-identical to P9 (SPEC-SS-020):

```ts
// src/domain/settings/PluginSettings.ts — APPENDED to the PluginSettings interface (additive, OPTIONAL).
// Each is device-local, never a secret (a secret-bearing env value lives in SecretStorePort, ADR-SS-001).

/** The non-secret env-snippet structures (ADR-SS-001, REQ-SS-060). OPTIONAL + absent from
 *  DEFAULT_SETTINGS (NFR-SS-001). A secret-bearing EnvEntry holds only a `secretRef`. */
readonly envSnippets?: readonly EnvSnippetStruct[];
/** The applied per-scope env (the non-secret structure of the live shared + provider:<id> scopes,
 *  REQ-SS-050/064/065). OPTIONAL. Keyed by EnvironmentScope; each value is a non-secret EnvEntry[]. */
readonly envScopes?: Readonly<Record<string, readonly EnvEntry[]>>;
/** The message-pane keyboard-nav mappings (REQ-SS-070). OPTIONAL; defaults (w/s/i) apply when absent. */
readonly keyboardNav?: { readonly scrollUpKey: string; readonly scrollDownKey: string; readonly focusInputKey: string };
/** The persisted per-provider default model id (REQ-SS-021). OPTIONAL; keyed by ProviderId → model id. */
readonly providerDefaultModel?: Readonly<Record<string, string>>;
/** The default permission mode (REQ-SS-083). OPTIONAL; one of 'normal' | 'plan' | 'yolo'. */
readonly defaultPermissionMode?: PermissionMode;
/** The per-provider device-local CLI path (CLAR-SS-006). OPTIONAL; keyed by ProviderId → absolute path. */
readonly providerCliPath?: Readonly<Record<string, string>>;
```

```ts
// The env-secret namespace (ADR-SS-001, mirrors providerSecretKey). Deterministic for get/set/delete.
// scope is 'shared' | `provider:${ProviderId}`; key is the env var name (verbatim case).
export const envSecretKey = (scope: string, key: string): string => `env.${scope}.${key}`; // 'env.shared.FOO', 'env.provider:codex.OPENAI_API_KEY'
```

**The six `coerce*` helpers** (each pure/total, never throws — mirroring `coerceHomeFsConsent`; an OPTIONAL field
stays **absent** when the raw value has no valid content so the exact-key contract holds, NFR-SS-001):

| Coercer | Signature | Load-or-default rule |
|---|---|---|
| `coerceEnvSnippets` | `(raw: unknown) => readonly EnvSnippetStruct[] \| undefined` | non-array → absent; per struct: require non-empty string `id`+`name` (drop the struct otherwise), coerce `description` to string-or-`''`, keep only `EnvEntry[]` with a non-empty string `key` + a valid `{kind:'inline',text:string}`/`{kind:'secretRef',secretRef:string}` value (drop bad entries), keep `scope` only if a valid `EnvironmentScope`, keep `contextLimits` only as `Record<string,number>` of finite positives; an empty result → absent |
| `coerceEnvScopes` | `(raw: unknown) => Readonly<Record<string, readonly EnvEntry[]>> \| undefined` | non-object → absent; keep only keys that are a valid `EnvironmentScope` and whose value is a valid `EnvEntry[]`; empty → absent |
| `coerceKeyboardNav` | `(raw: unknown) => { scrollUpKey; scrollDownKey; focusInputKey } \| undefined` | feed `buildNavMappingText`-equivalent shape through `parseNavMappings`; a `{settings}` result with three single-char unique keys → that record; any `{error}` / invalid shape → absent (defaults apply, REQ-SS-071) |
| `coerceProviderDefaultModel` | `(raw: unknown) => Readonly<Record<string,string>> \| undefined` | non-object → absent; keep only valid `ProviderId` keys with non-empty string values; empty → absent |
| `coercePermissionMode` | `(raw: unknown) => PermissionMode \| undefined` | one of `'normal'\|'plan'\|'yolo'` → that value; else absent |
| `coerceProviderCliPath` | `(raw: unknown) => Readonly<Record<string,string>> \| undefined` | non-object → absent; keep only valid `ProviderId` keys with non-empty string values; empty → absent |

**Validation rules / behaviour:** `DEFAULT_SETTINGS` is **unchanged** (no new key — the six fields are OPTIONAL,
SPEC-SS-020); a recorded value round-trips a reload (SPEC-SS-012); **no plaintext secret ever appears in any
field** — a secret-bearing env value is an `{kind:'secretRef'}` entry pointing at `SecretStorePort`
(SPEC-SS-019, REQ-SS-090). `PermissionMode` imports from `@/domain/chat/PermissionMode` (P7). Unit-testable as a
coerce round-trip + the additivity assertion (TEST-SS-092/093).

## SPEC-SS-002 — `classifyEnvKey` + `SHARED_ENVIRONMENT_KEYS` + the secret predicate (`src/domain/chat/environment/classifyEnvKey.ts`)

**REQ:** REQ-SS-051/066 · **NFR:** NFR-SS-008 · **Claudian ground-truth:** `providerEnvironment.ts:23-61`
(`SHARED_ENVIRONMENT_KEYS` + `classifyEnvironmentKey`). **PURE** — no I/O, total. **The provider patterns are
DESCRIPTOR DATA, not a branch** (NFR-SS-008): an additive `ProviderDescriptor.environmentKeyPatterns?: readonly
RegExp[]` field (appended to `ProviderDescriptor.ts`) carries the per-provider auth/env-key patterns, and the
classifier iterates the registry's descriptors.

```ts
// src/domain/chat/environment/classifyEnvKey.ts — PURE (regrown providerEnvironment.ts, NFR-SS-008).
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ProviderDescriptor } from '@/domain/chat/providers/ProviderDescriptor';

/** The shared-known env keys (regrown VERBATIM from providerEnvironment.ts:23-37). UPPER-CASE compared. */
export const SHARED_ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
  'PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE', 'NODE_EXTRA_CA_CERTS',
  'TMPDIR', 'TMP', 'TEMP',
]);

export type EnvKeyOwnership =
  | { readonly type: 'shared-known' }
  | { readonly type: 'shared-unknown' }
  | { readonly type: 'provider'; readonly providerId: ProviderId };

/** Classify a key shared-known / provider-owned / shared-unknown over the descriptor patterns.
 *  Trims + upper-cases; an empty key → shared-unknown. NO `switch (providerId)` (REQ-SS-051). */
export function classifyEnvKey(
  key: string,
  descriptors: readonly ProviderDescriptor[],
): EnvKeyOwnership;

/** Whether a value for `key` is a SECRET (routes to SecretStorePort, REQ-SS-066): true when the key is
 *  provider-owned AND matches an auth pattern (`/_API_KEY$/i` | `/_AUTH_TOKEN$/i` | `/_TOKEN$/i`), OR the
 *  caller explicitly marks the entry secret (`markSecret`). PURE/total. */
export function isSecretEnvKey(key: string, ownership: EnvKeyOwnership, markSecret: boolean): boolean;
```

**The additive descriptor field + patterns (pinned, no branch):**

| Descriptor | `environmentKeyPatterns` |
|---|---|
| `CLAUDE_DESCRIPTOR` | `[/^ANTHROPIC_/i, /^CLAUDE_/i]` |
| `CODEX_DESCRIPTOR` | `[/^OPENAI_/i, /^CODEX_/i]` |
| `OPENCODE_DESCRIPTOR` | `[/^OPENCODE_/i]` |

**Validation rules / behaviour:** `classifyEnvKey` upper-cases + trims the key; returns `shared-known` for a
`SHARED_ENVIRONMENT_KEYS` member, else the first descriptor whose `environmentKeyPatterns` matches → `provider`,
else `shared-unknown` (parity `providerEnvironment.ts:43-61`). `isSecretEnvKey` returns `true` iff
`ownership.type === 'provider'` and the key matches the auth-suffix regex `/(_API_KEY|_AUTH_TOKEN|_TOKEN)$/i`,
OR `markSecret` is `true` — so `ANTHROPIC_API_KEY` is secret, `OPENAI_BASE_URL` is not, and any user-marked
value is (REQ-SS-066). Both are pure/total and read patterns from descriptor data — **no `switch (providerId)`**
(NFR-SS-008, SPEC-SS-021). Re-exported from `src/domain/chat/environment/index.ts`. Unit-testable in isolation
(TEST-SS-051/066, EC-SS-3).

## SPEC-SS-003 — `EnvSnippet.ts` — the snippet shape + the codec + context-limit parsing (`src/domain/chat/environment/EnvSnippet.ts`)

**REQ:** REQ-SS-050/060/061/064/066/067 · **ADR:** ADR-SS-001 · **Claudian ground-truth:**
`core/types/settings.ts:17-24` (`EnvSnippet`), `utils/env.ts:325-345` (`parseEnvironmentVariables`),
`utils/env.ts:428-451` (`parseContextLimit` + bounds). **PURE data + pure codec** — no I/O, total:

```ts
// src/domain/chat/environment/EnvSnippet.ts — new (parity EnvSnippet + the secret-split shape, ADR-SS-001).
import type { ProviderId } from '@/domain/chat/ProviderId';

export type EnvironmentScope = 'shared' | `provider:${ProviderId}`;

/** One env entry — either an inline (non-secret) value held device-local, or a secretRef pointing at
 *  SecretStorePort under `env.<scope>.<KEY>` (ADR-SS-001, REQ-SS-066). The plaintext secret NEVER lives here. */
export interface EnvEntry {
  readonly key: string;
  readonly value:
    | { readonly kind: 'inline'; readonly text: string }
    | { readonly kind: 'secretRef'; readonly secretRef: string };
}

/** A persisted snippet — the NON-SECRET structure (device-local via SettingsPort). */
export interface EnvSnippetStruct {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope?: EnvironmentScope;
  readonly envEntries: readonly EnvEntry[];
  readonly contextLimits?: Readonly<Record<string, number>>;   // REQ-SS-067 (sequenced last)
}

/** PURE: parse env text → key/value pairs (regrown parseEnvironmentVariables: trims, skips blank/`#`,
 *  strips a leading `export `, splits on first `=`, unquotes a wrapping `"`/`'`). Total. */
export function parseEnvironmentVariables(input: string): Record<string, string>;

/** PURE: serialise EnvEntry[] back to env text (inline → `KEY=text`; a secretRef is rendered as a masked
 *  placeholder line `KEY=••••••` for display ONLY — never the resolved value, REQ-SS-014). Total. */
export function serializeEnvEntries(entries: readonly EnvEntry[]): string;

/** PURE: the context-limit parser (regrown parseContextLimit): trims/lowercases, strips commas, matches
 *  `\d+(.\d+)?(k|m)?`, applies the k/m multiplier, REJECTS (→ null) outside [MIN_CONTEXT_LIMIT,
 *  MAX_CONTEXT_LIMIT] = [1_000, 10_000_000] or on bad input (REQ-SS-067). Total. */
export const MIN_CONTEXT_LIMIT = 1_000 as const;
export const MAX_CONTEXT_LIMIT = 10_000_000 as const;
export function parseContextLimit(input: string): number | null;
```

**Validation rules / behaviour:** `parseEnvironmentVariables` is byte-parity with claudian (`#` comments + blank
lines skipped, `export ` prefix stripped, first-`=` split, wrapping quotes removed, empty key dropped).
`serializeEnvEntries` renders inline values verbatim and **masks a `secretRef`** (the value never re-enters the
DOM, REQ-SS-014, SPEC-SS-017). `parseContextLimit` returns `null` (not throw) for invalid/out-of-bounds input;
an invalid context-limit entry is **dropped** (REQ-SS-067). Re-exported from
`src/domain/chat/environment/index.ts`. Unit-testable (TEST-SS-060/067).

## SPEC-SS-004 — `envScope.ts` — the PURE scope routing (`src/domain/chat/environment/envScope.ts`)

**REQ:** REQ-SS-050/052/053/064 · **Claudian ground-truth:** `providerEnvironment.ts:273-364`
(`getEnvironmentReviewKeysForScope` / `inferEnvironmentSnippetScope` / `resolveEnvironmentSnippetScope` /
`getEnvironmentScopeUpdates`). **PURE** over env text + the descriptor table — no I/O, total:

```ts
import type { EnvironmentScope } from './EnvSnippet';
import type { ProviderDescriptor } from '@/domain/chat/providers/ProviderDescriptor';

export interface EnvironmentScopeUpdate { readonly scope: EnvironmentScope; readonly envText: string; }

/** The keys in `envText` that do NOT belong in `scope` (shared scope: any non-shared-known; a provider scope:
 *  any key not provider-owned by that provider) → the review-warning list (REQ-SS-052). Total. */
export function getEnvironmentReviewKeysForScope(
  envText: string, scope: EnvironmentScope, descriptors: readonly ProviderDescriptor[],
): readonly string[];

/** The single scope all of `envText`'s keys belong to, else undefined (REQ-SS-053/064). Total. */
export function inferEnvironmentSnippetScope(
  envText: string, descriptors: readonly ProviderDescriptor[],
): EnvironmentScope | undefined;

/** The inferred scope, else `fallbackScope` only when `envText` has no meaningful content (REQ-SS-064). Total. */
export function resolveEnvironmentSnippetScope(
  envText: string, descriptors: readonly ProviderDescriptor[], fallbackScope?: EnvironmentScope,
): EnvironmentScope | undefined;

/** Split a pasted env blob across scopes by key ownership (shared vs provider:<id>); a fallback scope catches
 *  an unsplittable blob (REQ-SS-053). Total — comments/decorators attach to the following key's scope. */
export function getEnvironmentScopeUpdates(
  envText: string, descriptors: readonly ProviderDescriptor[], fallbackScope?: EnvironmentScope,
): readonly EnvironmentScopeUpdate[];
```

**Validation rules / behaviour (parity Claudian):** the classification reuses `classifyEnvKey` (SPEC-SS-002) so
the scope routing is also branch-free (NFR-SS-008); `getEnvironmentReviewKeysForScope` returns the keys that are
out-of-scope for review (shared scope → any non-`shared-known`; provider scope → any key not provider-owned by
THAT provider, REQ-SS-052); `getEnvironmentScopeUpdates` distributes each line to its owning scope, attaching
pending comment/blank decorators to the next keyed line's scope (parity `appendLines`), returning a
`fallbackScope`-bucket only when nothing classified (REQ-SS-053). All total. Re-exported from
`src/domain/chat/environment/index.ts`. Unit-testable (TEST-SS-052/053/064, EC-SS-4).

## SPEC-SS-005 — `keyboardNav.ts` — PURE nav-mapping parse (`src/domain/settings/keyboardNav.ts`)

**REQ:** REQ-SS-070/071 · **Claudian ground-truth:** `keyboardNavigation.ts:6-60`. **PURE** — no I/O, total:

```ts
const NAV_ACTIONS = ['scrollUp', 'scrollDown', 'focusInput'] as const;
export type NavAction = (typeof NAV_ACTIONS)[number];
export interface NavMappings { readonly scrollUpKey: string; readonly scrollDownKey: string; readonly focusInputKey: string; }

/** Render the canonical `map <key> <action>` text from a NavMappings (REQ-SS-070). Total. */
export function buildNavMappingText(m: NavMappings): string;

/** Parse the `map <key> <action>` text → `{settings}` on success, else `{error}` (REQ-SS-071). Total —
 *  rejects: a non-`map`/non-3-token line, an unknown action, a multi-char key, a duplicate key (unique),
 *  a duplicate action, a missing action. The default mappings are w/s/i. */
export function parseNavMappings(value: string): { settings?: NavMappings; error?: string };
```

**Validation rules / behaviour (parity Claudian):** each line is `map <single-char-key> <action>`; an action ∉
`NAV_ACTIONS` → `{error: 'Unknown action: …'}`; a multi-char key → `{error: 'Key must be a single character …'}`;
a key reused across actions (case-insensitive) → `{error: 'Navigation keys must be unique'}`; a missing action →
`{error: 'Missing mapping for …'}`. On any error **nothing is persisted** (REQ-SS-071, the i18n key is
`settings.keyboardNav.invalid`). Re-exported from `src/domain/settings/index.ts`. Unit-testable (TEST-SS-070/071,
EC-SS-7).

---

# 2. Application — the view-model + the env service (SPEC-SS-006..009)

Under `src/application/settings/`. Pure / port-driven — no `obsidian`/`node:*`/Vue (NFR-SS-003). The view-model
carries the section/control-visibility weight; the env service carries the secret-split weight. Both are the
automated coverage (NFR-SS-011). `tests/__fakes__/fake-ports.ts` already exposes `providerRegistry`,
`secretStore` (in-memory + availability switch), and a `settings` port; P10 drives the env service + the
view-model through them (no Obsidian, no `node:fs`).

## SPEC-SS-006 — `buildSettingsViewModel.ts` (`src/application/settings/buildSettingsViewModel.ts`)

**REQ:** REQ-SS-001/002/004/005/010/011/020/030/040/080/081/082/083/093 · **ADR:** ADR-SS-002 · **Claudian
ground-truth:** `ClaudianSettings.ts` (the root tab delegating a section per enabled provider). **PURE,
deterministic, Obsidian-free** — the same input yields the same serialisable structure (no DOM/Obsidian
reference, REQ-SS-002):

```ts
// src/application/settings/buildSettingsViewModel.ts — PURE (ADR-SS-002). No switch(providerId) (NFR-SS-008).
export function buildSettingsViewModel(input: {
  settings: PluginSettings;
  registry: ProviderRegistryPort;                  // listEnabledProviders(settings) + getCapabilities(id)
  getCatalog: (id: ProviderId) => ToolbarCatalog;  // model lists (REQ-SS-020)
  secretKeysSet: ReadonlySet<string>;              // from SecretStorePort.listKeys() — keys, never values
  secretStorageAvailable: boolean;                 // SecretStorePort.isAvailable() (REQ-SS-015)
  hasProviderDefinitions: (id: ProviderId) => { slash: boolean; skill: boolean; agent: boolean }; // SPEC-SS-008
}): SettingsViewModel;

export interface SettingsViewModel { readonly sections: readonly SettingsSection[]; }
export interface SettingsSection {
  readonly key: 'shared' | `provider:${ProviderId}` | 'environment';
  readonly titleKey: string;                       // i18n key, never a literal (SPEC-SS-026)
  readonly controls: readonly SettingsControl[];   // ONLY the supported controls
}
```

**Section ordering + composition (REQ-SS-001/004/005, the data, not a branch):**
1. **`shared`** first — the P0 core controls (`coreField` locale + logLevel, unchanged, REQ-SS-005) + the
   cross-provider prefs (`permissionMode` REQ-SS-083, `keyboardNav` REQ-SS-070).
2. **`provider:<id>`** per `registry.listEnabledProviders(settings)` in blank-tab order (opencode 10 / codex 15 /
   claude 20); Claude is always present with **no** `providerToggle` (its `isEnabled` is always true, REQ-SS-004);
   a non-Claude section leads with a `providerToggle` (REQ-SS-003).
3. **`environment`** last — the shared + per-enabled-provider `envScopeEditor` + the `envSnippetList`
   (REQ-SS-050).

**Per-provider control visibility = the capability bag (REQ-SS-010, NFR-SS-008, no `switch(providerId)`):**

| Control emitted | Iff |
|---|---|
| `apiKeyField` | `caps.needsApiKey` (with `state` = `'unavailable'` when `!secretStorageAvailable`, else `'set'`/`'unset'` from `secretKeysSet.has(providerSecretKey(id))`, REQ-SS-011..015) |
| `modelPicker` | always per provider (populated from `getCatalog(id).models`; `empty:true` flag when the list is empty, preselect from `providerDefaultModel[id]` else `catalog.defaultModelId`, REQ-SS-020..022) |
| `mcpManager` | `caps.supportsMcpTools` |
| `mcpDocNote` | `!caps.supportsMcpTools` (the Codex doc-note, REQ-SS-081) |
| `slashList` | `caps.supportsProviderCommands && hasProviderDefinitions(id).slash` (REQ-SS-040) |
| `agentList` | `hasProviderDefinitions(id).agent \|\| hasProviderDefinitions(id).skill` (omitted when both absent, REQ-SS-031) |
| `approvalRules` | per provider with `caps.supportsMcpTools` semantics is NOT used — approvals render in the Claude section unconditionally (P7 is provider-agnostic, REQ-SS-082); `cliPath` iff the descriptor declares it needs one (CLAR-SS-006) |

**Validation rules / behaviour:** **Claude-only** (`enabledProviders: []`) → `sections = [shared, provider:claude,
environment]`, no `providerToggle`, no `apiKeyField` (Claude `needsApiKey:false`), the `mcpManager` present
(`supportsMcpTools:true`), the P0 core controls emitted unchanged — byte-identical to the additive expectation
(REQ-SS-093, SPEC-SS-020). The function reads **only** the bag + the registry + the catalog + the secret-key SET
(never a value) + the definition predicates — **no `if (provider === …)` / `switch (providerId)`** anywhere
(NFR-SS-008, SPEC-SS-021, grep-checkable). Deterministic + serialisable (REQ-SS-002). Unit-testable in full
(TEST-SS-001/002/004/005/010/011/020/030/031/040/080/081/093, EC-SS-1/2).

## SPEC-SS-007 — `SettingsControl` discriminated union + the per-member port wiring

**REQ:** REQ-SS-003/005/011/020/030/040/050/060/070/080/081/082/083/095 · **Extends:** DESIGN-SS-001 B.1. The
view-model emits a discriminated union the DOM renders (SPEC-SS-010); each member carries the i18n keys + the
data the control needs (never a secret value):

| `kind` | Carries | Rendered via (SPEC-SS-010) | `onChange` calls (the port/use case) | REQ |
|---|---|---|---|---|
| `coreField` | `fieldKey`, `optionKeys`, `value` | `Setting.addDropdown` | `plugin.updateSettings` (UNCHANGED P0) | REQ-SS-005 |
| `providerToggle` | `providerId`, `enabled` | `Setting.addToggle` | `SettingsPort` → `enabledProviders` (coerced) + re-render | REQ-SS-003 |
| `apiKeyField` | `providerId`, `state: 'unavailable'\|'set'\|'unset'` | `Setting.addText` (password) + a set/unset indicator | `SecretStorePort.setSecret/deleteSecret`; gated on `isAvailable()` | REQ-SS-011..015 |
| `modelPicker` | `providerId`, `models`, `selectedId`, `empty` | `Setting.addDropdown` | `SettingsPort` → `providerDefaultModel[id]` | REQ-SS-020..022 |
| `envScopeEditor` | `scope`, `text`, `reviewKeys` | `Setting.addTextArea` + a `setText` review warning | `EnvSnippetService.applyScopeText(scope, text)` | REQ-SS-050..053 |
| `envSnippetList` | `snippets: {id,name,scope}[]` | `Setting.addButton` rows + the edit `Modal` (SPEC-SS-011) | `EnvSnippetService.create/edit/apply/remove` | REQ-SS-060..067 |
| `agentList` | `entries: {name,description,kind}[]` (read-only) | `createDiv`+`setText` rows | — (read-only, no write control) | REQ-SS-030/031 |
| `slashList` | `entries: {name,description}[]` (read-only) | `createDiv`+`setText` rows | — (read-only) | REQ-SS-040/041 |
| `mcpManager` | the P8 manager handle | the P8 manager DOM | `McpConfigStorePort.load/save` | REQ-SS-080 |
| `mcpDocNote` | `noteKey` | `Setting.setDesc` (`setText`) | — (informational) | REQ-SS-081 |
| `approvalRules` | `rules: {id,summary}[]` | `Setting.addButton` rows | `ApprovalRuleStorePort.removeRule/clear` | REQ-SS-082 |
| `permissionMode` | `value: PermissionMode` | `Setting.addDropdown` | `SettingsPort` → `defaultPermissionMode` | REQ-SS-083 |
| `keyboardNav` | `text` | `Setting.addTextArea` | `SettingsPort` → `keyboardNav` (via `parseNavMappings`; reject invalid) | REQ-SS-070/071 |
| `cliPath` | `providerId`, `path` | `Setting.addText` | `SettingsPort` → `providerCliPath[id]` (device-local) | CLAR-SS-006 |

**Validation rules / behaviour:** the union is exhaustive (a `default` arm in the renderer asserts-never); **no
member carries a secret value** — `apiKeyField` carries only the tri-state, `envScopeEditor`/`envSnippetList`
carry masked `secretRef` placeholders only (REQ-SS-014, SPEC-SS-017/019). A read-only member (`agentList`,
`slashList`, `mcpDocNote`) exposes **no write `onChange`** (REQ-SS-030/041, EC-SS-9). Unit-testable as the union
shape the view-model emits (TEST-SS-007, via TEST-SS-006).

## SPEC-SS-008 — The read-only agent/skill/subagent + slash discovery source

**REQ:** REQ-SS-030/031/040/041 · **Extends:** P4 `ProviderCommandCatalogPort`. **Slash + skill** entries read
from the existing **`ProviderCommandCatalogPort.getEntries('command')` / `.getEntries('skill')`** (load-or-default
`[]`, never throws) — the `slashList` shows `command` entries, the `agentList` shows `skill` entries, both
**read-only** (no create/edit/delete affordance, NG1, REQ-SS-041). There is **no P9 agent/subagent discovery
seam**; the `hasProviderDefinitions(id)` predicate (SPEC-SS-006) reports `agent:false` for every provider until a
later phase adds one, so the `agentList` falls back to the `skill` entries and is **omitted entirely when both
`command` and `skill` catalogs are empty** (REQ-SS-031, EC-SS-9). The catalog is provider-agnostic in P4; P10
reads it for the active provider's section read-only.

> **Escalation (flagged, not blocking):** if a richer per-provider agent/subagent source is wanted, the planner
> escalates to PM — but the must-tier REQ-SS-030 is satisfied by the catalog's `skill` entries + the
> omit-when-absent fallback, and REQ-SS-040/041 are `should`. Read-only either way (NG1).

**Validation rules / behaviour:** the entries are mapped to the read-only `{name, description, kind}` shape;
no entry exposes a write control (REQ-SS-030/041); an empty catalog → the list is omitted (REQ-SS-031). Total /
load-or-default. Unit-testable over the Mock catalog (TEST-SS-030/031/040/041).

## SPEC-SS-009 — `EnvSnippetService.ts` (`src/application/settings/EnvSnippetService.ts`)

**REQ:** REQ-SS-050..053/060..064/066/067 · **ADR:** ADR-SS-001 · **Claudian ground-truth:**
`EnvSnippetManager.ts` (the create/edit/remove/apply flow + the name guard). The env subsystem use cases —
composes `SettingsPort` (the struct) + `SecretStorePort` (the secret values) behind a pure service (**NO new
port**, ADR-SS-001 §5). Every method `Result`-typed; no throw across a port (REQ-SS-094, NFR-SS-006):

```ts
// src/application/settings/EnvSnippetService.ts — composes SettingsPort + SecretStorePort (ADR-SS-001).
export interface EnvSnippetService {
  /** The persisted non-secret snippet structures (load-or-default `[]`, REQ-SS-060). */
  list(): Promise<Result<readonly EnvSnippetStruct[]>>;
  /** Create a snippet from raw input (name REQUIRED → err on empty, REQ-SS-063): classify each entry; a SECRET
   *  value → setSecret(envSecretKey(scope,key)) + keep {kind:'secretRef'}; a non-secret → {kind:'inline'};
   *  mint an id; persist the struct via SettingsPort (REQ-SS-060/066). One settings write + N secret writes. */
  create(input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>>;
  /** Edit in place preserving id (REQ-SS-061): re-classify; write/delete secret slots to match the new entries;
   *  persist. */
  edit(id: string, input: EnvSnippetInput): Promise<Result<EnvSnippetStruct>>;
  /** Remove a snippet (REQ-SS-062): delete the struct from SettingsPort AND deleteSecret(ref) for each
   *  secretRef entry. Idempotent. */
  remove(id: string): Promise<Result<void>>;
  /** Apply a snippet's entries into its scope (inferring an undeclared scope via resolveEnvironmentSnippetScope,
   *  REQ-SS-064): write the entries into `envScopes[scope]` device-local (secret entries already in the secret
   *  store; the scope holds the secretRef). */
  apply(id: string): Promise<Result<void>>;
  /** Save an env-scope editor's raw text (REQ-SS-050..053): classify + split via getEnvironmentScopeUpdates;
   *  route secret values to SecretStorePort + non-secret to envScopes device-local; return the review keys. */
  applyScopeText(scope: EnvironmentScope, text: string): Promise<Result<{ reviewKeys: readonly string[] }>>;
  /** Read a scope's entries back (rejoin) for the editor — secretRefs render MASKED, never resolved (REQ-SS-014). */
  readScope(scope: EnvironmentScope): Promise<Result<readonly EnvEntry[]>>;
}

export interface EnvSnippetInput {
  readonly name: string; readonly description?: string; readonly envText: string;
  readonly scope?: EnvironmentScope; readonly markSecretKeys?: readonly string[];
  readonly contextLimits?: Readonly<Record<string, number>>;
}
```

**Per-method contract (behaviour · pre/post · errors · side effects):**

| Method | Behaviour · Errors · Side effects |
|---|---|
| `list()` | `getSettings().envSnippets ?? []`. **Errors:** a settings-read failure → `err`. **Side effects:** none. |
| `create(input)` | **Pre:** `input.name.trim()` non-empty (else `err` `settings.envSnippets.nameRequired`, REQ-SS-063 — nothing persisted). Parse `envText`; classify each key (SPEC-SS-002); a secret value (`isSecretEnvKey`/`markSecretKeys`) → `setSecret(envSecretKey(scope,key), value)` + entry `{kind:'secretRef'}`; else `{kind:'inline',text}`; mint `id` (crypto random); append to `envSnippets`; `saveSettings`. **Errors:** any store write fails → `err` (no value substring). **Side effects:** ≤ N secret writes + one settings write; **no plaintext secret in the struct/data.json** (REQ-SS-066/090, SPEC-SS-019). |
| `edit(id, input)` | Same split; reconcile secret slots (delete refs no longer present, set new); preserve `id` (REQ-SS-061). **Errors/Side effects:** as `create`. |
| `remove(id)` | Drop the struct + `deleteSecret(ref)` for each `secretRef` entry (REQ-SS-062, idempotent). **Errors:** a store fail → `err`. **Side effects:** N secret deletes + one settings write. |
| `apply(id)` | Resolve the scope (declared or `resolveEnvironmentSnippetScope`, REQ-SS-064); merge the snippet's entries into `envScopes[scope]`; `saveSettings`. **Side effects:** one settings write (the secret values already live in the store; the scope keeps only secretRefs). |
| `applyScopeText(scope, text)` | `getEnvironmentScopeUpdates(text, descriptors, scope)` splits across scopes; for each entry, the secret split (as `create`); persist each scope's non-secret entries to `envScopes`; return `getEnvironmentReviewKeysForScope(text, scope, descriptors)` (REQ-SS-052). **Side effects:** ≤ N secret writes + one settings write. |
| `readScope(scope)` | `getSettings().envScopes?.[scope] ?? []`. **Post:** a `secretRef` entry stays a `secretRef` (the value is resolved ONLY at the infra boundary, SPEC-SS-013) — **never resolved into the service/UI** (REQ-SS-014, NFR-SS-002). |

**Validation rules / behaviour:** every method returns `Result`; a failure surfaces a notice with **no secret/env
value substring** (REQ-SS-094/102-analogue, SPEC-SS-022/026). The service holds the `ProviderDescriptor[]` (for
the classifier) injected at construction (pure data). Unit-testable in full over `fake-ports` (`secretStore` +
`settings`) — the secret-split, the name guard, the remove-both, the apply scope-inference, the review keys
(TEST-SS-050/052/053/060/061/062/063/064/066, EC-SS-4/5/6).

---

# 3. Infrastructure / plugin — the DOM tab, the modals, the coerce round-trip, the env injection (SPEC-SS-010..014)

The `Setting`-API DOM (`src/plugin/settings.ts`) + the env-snippet modals are **coverage-excluded `src/plugin/**`**
→ manual legs; the `_coerceSettings` round-trip + the three bridges' `SettingsPort`/`SecretStorePort` carry the
automated weight (NFR-SS-011). The subprocess env injection in `src/infrastructure/obsidian/**` is coverage-
excluded → a manual leg.

## SPEC-SS-010 — `SpecoratorSettingTab.display()` — walk the view-model + render (`src/plugin/settings.ts`)

**REQ:** REQ-SS-001..005/010..015/020..022/030/040/050/060..064/080..083/070/095 · **Extends:** the slim P0
`SpecoratorSettingTab` (`settings.ts:20-37`). Grow `display()` to: (1) keep the existing module-schema core loop
(the `coreField`s, UNCHANGED, REQ-SS-005); (2) call `buildSettingsViewModel(...)` (SPEC-SS-006) with the plugin's
ports; (3) for each `SettingsSection`, render a `new Setting(containerEl).setName(t(titleKey)).setHeading()`;
(4) for each `SettingsControl`, `switch (control.kind)` — **this is the ONE allowed switch (on the control union,
NOT on `providerId`)**, SPEC-SS-021 — rendering each via the `Setting` API / `createEl` / `setText` per the
SPEC-SS-007 table, wiring its `onChange` to its port/use case, surfacing a `Result.err` as a `NotificationPort`
notice (REQ-SS-094). A `providerToggle`/key/snippet change re-renders the tab (`this.display()`).

**Validation rules / behaviour:** **no `innerHTML`/`outerHTML`/`insertAdjacentHTML`** — DOM is built via the
`Setting` API / `createEl` / `createDiv` / `setText` (REQ-SS-095, SPEC-SS-023); a confirmation (delete snippet)
opens the Obsidian `Modal` (SPEC-SS-011), never `window.confirm` (REQ-SS-095). The `apiKeyField` masks input
(`type='password'`) and **never reads back the stored value** (it shows only the tri-state from
`secretKeysSet`, REQ-SS-014). Coverage-excluded `src/plugin/**` (NFR-SS-011) → verified by manual leg TEST-SS-M1.
No `obsidian` symbol leaks past this file.

## SPEC-SS-011 — The env-snippet edit `Modal` + the delete-confirm `Modal` (`src/plugin/`)

**REQ:** REQ-SS-060/061/062/063/095. An Obsidian `Modal` subclass hosts the snippet editor (name, description,
env textarea, scope dropdown, optional context-limit inputs) and a separate delete-confirm modal
(`settings.envSnippets.deleteConfirm`). Save calls `EnvSnippetService.create`/`edit`; an empty name shows the
`settings.envSnippets.nameRequired` notice and **does not close/persist** (REQ-SS-063). Delete-confirm → `remove`
(deletes the struct + the secret slots, REQ-SS-062). The modal traps + restores focus (the Obsidian `Modal`
convention, REQ-SS-072, SPEC-SS-024). **No `window.confirm`/`alert`/`prompt`** (REQ-SS-095). Coverage-excluded →
manual leg TEST-SS-M1.

## SPEC-SS-012 — `ObsidianBridge._coerceSettings` round-trip (`src/infrastructure/obsidian/ObsidianBridge.ts`)

**REQ:** REQ-SS-092 · **NFR:** NFR-SS-001 · **Extends:** the P9 `_coerceSettings` chain (alongside
`coerceActiveProvider`/`coerceEnabledProviders`/`coerceHomeFsConsent`). Add the six `coerce*` calls (SPEC-SS-001);
each OPTIONAL member is added to the returned object **only when present** (the
`...(x !== undefined ? { x } : {})` pattern, exactly as `homeFsConsent`). A recorded value round-trips a reload;
absent/garbage → the field stays absent (defaults apply); **no migration** of any legacy snippet/key/env
(REQ-SS-092, NG8, SPEC-SS-025). Coverage-included pure-coercion logic — the `coerce*` helpers are unit-tested
(TEST-SS-092); the bridge wiring is exercised by the round-trip assertion.

## SPEC-SS-013 — The provider runtime env merge (`src/infrastructure/obsidian/**`, coverage-excluded)

**REQ:** REQ-SS-065 · **Extends:** the P9 runtime subprocess env. At turn start the active provider's runtime
composes `{ ...process.env, ...resolve(envScopes['shared']), ...resolve(envScopes['provider:<id>']) }` —
`resolve` reads an `{kind:'inline'}` entry as-is and an `{kind:'secretRef'}` entry via
`SecretStorePort.getSecret(secretRef)` **at the infra boundary only** (the value never enters the
application/UI/DTO, REQ-SS-065, NFR-SS-002, SPEC-SS-019). This is the same merge the P9 runtimes already do for
`providerSecretKey`; P10 adds the env-scope contribution. Coverage-excluded `obsidian/**` → manual leg
TEST-SS-M2; the **Mock** runtime captures the merged env for the automated leg (TEST-SS-065).

## SPEC-SS-014 — `MockBridge` / `LocalStorageBridge` impls

**REQ:** REQ-SS-066/092 · **NFR:** NFR-SS-007.

- **`SettingsPort`** — already round-trips the additive OPTIONAL fields (in-memory device-local map on Mock /
  localStorage on LS); the `coerce*` helpers run identically (they are pure, SPEC-SS-001).
- **`SecretStorePort`** — the in-memory map already backs `env.<scope>.<KEY>` slots (the same store as
  `provider.<id>.apiKey`, no new surface); `setSecretStoreAvailable(false)` drives the unavailable gate
  (REQ-SS-015); `seedSecret`/`getStoredKeys` for assertions; **no real OS secret** touched (REQ-SS-066).
- **Mock runtime env capture** — a scriptable hook records the merged subprocess env so the env-injection leg
  runs without a subprocess (TEST-SS-065).

`fake-ports.ts` exposes `secretStore` + `settings` + `providerRegistry`; the env-service + view-model tests drive
all three. The real `app.secretStorage` env-secret round-trip + the real subprocess injection are the
coverage-excluded manual legs (TEST-SS-M2/M3).

---

# 4. Styles (SPEC-SS-015)

## SPEC-SS-015 — The `settings/*` → `--sp-*` token slice

**NFR:** NFR-SS-009 · **Claudian ground-truth:** `src/style/settings/{base,plugin,agent,slash,env-snippets,mcp,
opencode-model-picker}.css`. The seven `settings/*` CSS modules map to the `--sp-*` token slice with **no raw
Obsidian-var / physical-property leak** (charter §3.10). `lint-style-tokens` MUST be clean for these modules
(REQ-SS-095-adjacent); perceptual `--sp-*` parity vs claudian is captured at 320 / 520 / 720 px, light + dark, at
the single final review gate (charter §5.1, manual leg TEST-SS-M4).

---

# 5. Cross-cutting invariants + state models (SPEC-SS-016..028)

## SPEC-SS-016 — The shell section/control state model

**REQ:** REQ-SS-001/003/010/093.

```mermaid
stateDiagram-v2
    [*] --> ClaudeOnly: fresh install (enabledProviders [])
    ClaudeOnly --> CodexEnabled: toggle codex on (REQ-SS-003) → SettingsPort + re-render
    CodexEnabled --> ClaudeOnly: toggle codex off
    ClaudeOnly --> ClaudeOnly: [shared, provider:claude, environment]; P0 core unchanged (byte-identical P9, REQ-SS-093)
    CodexEnabled --> CodexEnabled: a codex section appears, capability-gated (REQ-SS-001/010)
```

The sections + control visibility are the pure view-model (SPEC-SS-006); a toggle updates `enabledProviders`
device-local + re-renders. Claude-only is byte-identical (SPEC-SS-020). Driven deterministically by the
view-model unit tests (TEST-SS-001/010/093, EC-SS-1/2).

## SPEC-SS-017 — The API-key state model

**REQ:** REQ-SS-011..015.

```mermaid
stateDiagram-v2
    [*] --> Unavailable: SecretStorePort.isAvailable() false
    [*] --> NotSet: available + secretKeysSet lacks providerSecretKey(id)
    Unavailable --> Unavailable: field disabled + "secret storage unavailable"; NO fallback (REQ-SS-015)
    NotSet --> Set: enter a key → setSecret(providerSecretKey(id), value) (REQ-SS-012)
    Set --> NotSet: clear → deleteSecret(providerSecretKey(id)) (REQ-SS-013, idempotent)
    Set --> Set: "key set" from secretKeysSet; value NEVER shown (REQ-SS-014)
```

The value never enters the view-model, a notice, a log, or `data.json` (REQ-SS-090, NFR-SS-002, SPEC-SS-019).
Unit/component-testable (TEST-SS-011/012/013/014/015, EC-SS-8).

## SPEC-SS-018 — The env-edit + snippet state model

**REQ:** REQ-SS-050..053/060..066.

```mermaid
stateDiagram-v2
    [*] --> Editing
    Editing --> Classified: edit/paste → classifyEnvKey each key (REQ-SS-051)
    Classified --> Review: a shared-unknown / out-of-scope key → ⚠ warning, still saveable (REQ-SS-052)
    Classified --> Routed: paste blob → getEnvironmentScopeUpdates splits across scopes (REQ-SS-053)
    Review --> Saved
    Routed --> Saved
    Saved --> [*]: non-secret → device-local envScopes; SECRET values → SecretStorePort env.<scope>.<KEY> (REQ-SS-066)
    [*] --> SnippetNew: + New → Modal
    SnippetNew --> SnippetSaved: name required (REQ-SS-063) → create (secret split)
    SnippetSaved --> SnippetApplied: apply → write into the (inferred) scope (REQ-SS-064)
    SnippetSaved --> SnippetRemoved: remove → delete struct + deleteSecret(ref) for each secret (REQ-SS-062)
```

Driven by the `EnvSnippetService` unit tests over `fake-ports` (TEST-SS-050..064, EC-SS-4/5/6).

## SPEC-SS-019 — The secret-split invariant

**REQ:** REQ-SS-066/090/091 · **NFR:** NFR-SS-002/004 · **ADR:** ADR-SS-001. A provider API key persists via
`SecretStorePort` under `providerSecretKey(id)`; a secret-bearing env value persists via `SecretStorePort` under
`envSecretKey(scope, key) = env.<scope>.<KEY>`; the device-local struct/scope holds only a `{kind:'secretRef'}`.
**Zero secret bytes in `data.json` / the device-local blob across every key + env flow** (the counter-metric) —
asserted by a store-content check over the in-memory `SettingsPort` after every key/snippet/scope save
(TEST-SS-066/090). Each setting in its correct store: secrets → `SecretStorePort`; device prefs (locale,
logLevel, default model, enabled providers, nav keys, permission mode, snippet structure, cli path) →
`SettingsPort`; MCP config → the vault `.claude/mcp.json` (P8); approval rules → the P7 store (REQ-SS-091,
TEST-SS-091).

## SPEC-SS-020 — The additivity invariant

**REQ:** REQ-SS-093 · **NFR:** NFR-SS-001. The only structural growth is the six OPTIONAL `PluginSettings` fields
(SPEC-SS-001, absent from `DEFAULT_SETTINGS`) + the additive `environmentKeyPatterns` descriptor field
(SPEC-SS-002) + the new domain/application modules. With only Claude enabled: `buildSettingsViewModel` →
`[shared, provider:claude, environment]`, no key field, the MCP manager shown, the P0 core controls emitted
unchanged; the P9 exact-key settings contract is byte-identical (no new `DEFAULT_SETTINGS` key, REQ-SS-093).
Provable as a serialisation + diff contract against the SPEC-SS-028 baseline (TEST-SS-093).

## SPEC-SS-021 — The no-`switch(providerId)` / capability-gated invariant

**REQ:** REQ-SS-010 · **NFR:** NFR-SS-008. Section/control visibility gates on the capability bag
(`getCapabilities(id)`) + the descriptor data (`environmentKeyPatterns`, the registry's enabled list); the
classifier + scope routing read descriptor patterns. **The only allowed `switch` is on the `SettingsControl.kind`
union in the renderer (SPEC-SS-010), never on `providerId`.** No `if (provider === …)` / `switch (providerId)` in
`buildSettingsViewModel` / `classifyEnvKey` / `envScope.ts` / `EnvSnippetService` — asserted by an ESLint/grep
guard over `src/application/settings/**` + `src/domain/chat/environment/**` (TEST-SS-010).

## SPEC-SS-022 — The `Result`-boundary invariant

**REQ:** REQ-SS-094 · **NFR:** NFR-SS-006. Every save path (`SecretStorePort` set/delete, `SettingsPort`
save, `McpConfigStorePort` save, `ApprovalRuleStorePort` remove/clear, the `EnvSnippetService` methods) returns
`Result`; a failure surfaces as a `NotificationPort` notice; **no throw crosses a port boundary** and the tab
stays operable (REQ-SS-094). Unit/component-testable (TEST-SS-094).

## SPEC-SS-023 — The safe-DOM + no-blocking-dialog invariant

**REQ:** REQ-SS-095 · **NFR:** NFR-SS-010. The settings DOM is built via the `Setting` API / `createEl` /
`createDiv` / `setText` — **no `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`v-html`**; confirmations use an
Obsidian `Modal` subclass, never `window.confirm`/`alert`/`prompt`. Enforced by `no-restricted-properties` +
`no-restricted-globals` (project-wide, error severity) + `vue/no-v-html`. Asserted by the lint guards + a render
review (TEST-SS-095).

## SPEC-SS-024 — The keyboard-nav + a11y invariant

**REQ:** REQ-SS-072 · **NFR:** NFR-SS-007. Because the DOM is the Obsidian `Setting` API, every control is a
native focusable element rendered in the view-model's section→control order — a logical tab order, visible focus,
Enter/Space activation for free (ADR-SS-002 §3); Tab/Shift+Tab traverse every control; the snippet edit + delete
modals trap + restore focus (the Obsidian `Modal` convention). No control is mouse-only; no focus trap escapes
the keyboard (WCAG 2.2 AA). The remappable message-pane nav keys are the separate `parseNavMappings` pref
(SPEC-SS-005). Verified by manual leg TEST-SS-M1 (the broader a11y stylesheet polish is P12, NG7).

## SPEC-SS-025 — The load-or-default / no-migration invariant

**REQ:** REQ-SS-092 · **NFR:** NFR-SS-012. Absent/garbage settings, snippets, keys, MCP config, or rules load
coerced defaults (the six `coerce*` helpers + the ports' load-or-default contracts); **no legacy
`.claudian`/`data.json` migration**, no compat shims (NG8). Unit-testable (TEST-SS-092).

## SPEC-SS-026 — i18n / microcopy invariant

**REQ:** REQ-SS-014 · **NFR:** NFR-SS-002. All new user-facing strings go through `TranslationPort`/`vue-i18n`
with **en + de** keys (`settings.provider.*`, `.apiKey.*`, `.model.*`, `.env.*`, `.envSnippets.*`, `.mcp.*`,
`.keyboardNav.*` — the representative list in DESIGN-SS-001 B.3). **No hardcoded user-facing string**; **no
secret/env value appears in any notice or log** (REQ-SS-014, NFR-SS-002). A-testable (keyed strings render) + a
grep guard (TEST-SS-014/026).

## SPEC-SS-027 — Coverage split + the manual real legs + `manifest.json` untouched

**NFR:** NFR-SS-001/009/011/012. **Coverage-included (the automated weight, meets 80/70/80/80):** the domain
(`classifyEnvKey`, `EnvSnippet`/codec/`parseContextLimit`, `envScope.ts`, `keyboardNav.ts`, the six `coerce*`) +
the application (`buildSettingsViewModel`, `EnvSnippetService`, the discovery mapping). **Coverage-excluded
(manual real-Obsidian legs):** `src/plugin/settings.ts` (the `Setting`-API DOM render + the modals, SPEC-SS-010/
011) + the P9 subprocess env injection in `src/infrastructure/obsidian/**` (SPEC-SS-013). `manifest.json` identity
(`id`/`version`/`minAppVersion 1.12.7`) is **untouched** (NFR-SS-012). Asserted by the coverage config review +
TEST-SS-M1..M4.

## SPEC-SS-028 — The Claude-only baseline capture on `next`

**REQ:** REQ-SS-093 · **NFR:** NFR-SS-001. Before implementation, capture the Claude-only settings behaviour on
`next` (the P9 exact-key settings contract + the rendered control set) as the additivity reference; the
additivity assertion (SPEC-SS-020, TEST-SS-093) diffs against it. Paired with a baseline-capture task in
`tasks.md`.

---

# 6. Edge cases (EC-SS-*)

| ID | Scenario | Specified behaviour | Spec item · REQ |
|---|---|---|---|
| EC-SS-1 | Claude-only — settings open | `sections = [shared, provider:claude, environment]`; no toggle/key field; MCP manager shown; P0 core unchanged; byte-identical P9 | SPEC-SS-006/020 · REQ-SS-093 / NFR-SS-001 |
| EC-SS-2 | A capability-gated section hidden for a lacking provider | codex `supportsMcpTools:false` → no `mcpManager`, the `mcpDocNote` instead; the gate is the bag, no `switch(providerId)` | SPEC-SS-006/021 · REQ-SS-010/081 |
| EC-SS-3 | Classify `PATH` / `ANTHROPIC_API_KEY` / `FOO` | `PATH` → shared-known; `ANTHROPIC_API_KEY` → provider(claude) + secret; `FOO` → shared-unknown (review) | SPEC-SS-002 · REQ-SS-051/052/066 |
| EC-SS-4 | Paste a multi-key blob across scopes | `getEnvironmentScopeUpdates` splits shared vs provider:<id>; a provider key lands in that provider's scope | SPEC-SS-004/009 · REQ-SS-053 |
| EC-SS-5 | A snippet with a secret value | the value → `SecretStorePort` under `env.<scope>.<KEY>`; only a `secretRef` in the device-local struct; `data.json` has no plaintext | SPEC-SS-009/019 · REQ-SS-066/090 |
| EC-SS-6 | Remove a snippet with a secret | the struct deleted from `SettingsPort` AND `deleteSecret(ref)` for each secret entry (both stores) | SPEC-SS-009 · REQ-SS-062 |
| EC-SS-7 | A malformed / non-unique / multi-char nav mapping | `parseNavMappings` → `{error}`; nothing persisted; `settings.keyboardNav.invalid` notice; defaults apply | SPEC-SS-005 · REQ-SS-071 |
| EC-SS-8 | Secret storage unavailable | the key field + the secret-bearing env entry honest-disabled with a notice; NO plain-store fallback | SPEC-SS-006/017 · REQ-SS-015 |
| EC-SS-9 | A read-only agent/skill/subagent + slash | rendered read-only (no write control); the agent list OMITTED when the catalog is empty | SPEC-SS-007/008 · REQ-SS-030/031/041 |
| EC-SS-10 | An empty model catalog | the picker shows the persisted value + a "no models" notice; the section still renders | SPEC-SS-006 · REQ-SS-022 |
| EC-SS-11 | An empty snippet name on save | rejected with `settings.envSnippets.nameRequired`; nothing persisted | SPEC-SS-009/011 · REQ-SS-063 |
| EC-SS-12 | An invalid context-limit input | `parseContextLimit → null`; the entry dropped; the snippet still saves | SPEC-SS-003 · REQ-SS-067 |
| EC-SS-13 | A store write fails on save | `Result.err` → a notice; no throw across the port; the tab stays operable | SPEC-SS-022 · REQ-SS-094 |
| EC-SS-14 | Apply a snippet with an undeclared scope | the scope is inferred via `resolveEnvironmentSnippetScope`; the entries land in the inferred scope | SPEC-SS-004/009 · REQ-SS-064 |
| EC-SS-15 | A turn starts with an applied env scope | the runtime merges `{...process.env, ...shared, ...provider:<id>}`, resolving each secretRef via `getSecret` at the infra boundary; `FOO=bar` reaches the subprocess env | SPEC-SS-013 · REQ-SS-065 |
| EC-SS-16 | Fresh install — garbage `envSnippets`/`keyboardNav` in the store | the `coerce*` helpers return absent; defaults apply; no migration | SPEC-SS-001/012/025 · REQ-SS-092 |

---

# 7. Test scenarios (TEST-SS-*) — U / A / M split

> **U** = pure unit (the view-model / classifier / codec / scope routing / nav parser / coercers / the
> `EnvSnippetService` over `fake-ports` `secretStore`+`settings` / the discovery mapping / the additivity /
> no-secret / no-branch invariants — these hold the 80/70/80/80 gate). **A** = component via a co-located
> `data-testid` PageObject (only where a tiny Vue piece exists — P10 is DOM, so A is largely N/A; any Vue
> sliver gets a PO). **M** = manual Obsidian leg (the coverage-excluded `Setting`-API DOM render + keyboard-nav +
> the modals, the real `app.secretStorage` env-secret round-trip, the real subprocess env injection, the parity
> screenshots) accumulating for the single final human review gate. Each maps 1:1 to a REQ-SS or an EC-SS.

| TEST | Asserts | Layer | Covers |
|---|---|---|---|
| TEST-SS-001 | `buildSettingsViewModel` emits `[shared, …enabled providers blank-tab-order, environment]`; deterministic | U | REQ-SS-001/002; SPEC-SS-006 |
| TEST-SS-002 | the same input yields the same serialisable structure (no Obsidian/DOM ref) | U | REQ-SS-002; SPEC-SS-006 |
| TEST-SS-003 | toggling a provider updates `enabledProviders` device-local (coerced) + the section appears on re-render | U | REQ-SS-003; SPEC-SS-006/007 |
| TEST-SS-004 | Claude section always present, no `providerToggle` for Claude | U | REQ-SS-004; SPEC-SS-006 |
| TEST-SS-005 | the P0 core (`coreField` locale/logLevel) controls emitted unchanged, persist via `updateSettings` | U | REQ-SS-005; SPEC-SS-006/007 |
| TEST-SS-010 | control visibility reads the capability bag; a grep guard finds no `switch(providerId)`/`if(provider===)` | U | REQ-SS-010; SPEC-SS-006/021; EC-SS-2 |
| TEST-SS-011 | `apiKeyField` emitted iff `needsApiKey` (claude none, codex one) | U | REQ-SS-011; SPEC-SS-006/017 |
| TEST-SS-012 | entering a key → `setSecret(providerSecretKey(id), value)`; `data.json`/device-local has no value | U | REQ-SS-012; SPEC-SS-009/017/019 |
| TEST-SS-013 | clearing → `deleteSecret(providerSecretKey(id))` idempotent; an empty clear is a no-op `ok()` | U | REQ-SS-013; SPEC-SS-017 |
| TEST-SS-014 | the set/unset indicator from `secretKeysSet` (listKeys); the value never echoes back / never logged | U | REQ-SS-014; SPEC-SS-007/017/026 |
| TEST-SS-015 | `isAvailable()` false → `apiKeyField.state = 'unavailable'` (disabled + notice); no plain-store fallback | U | REQ-SS-015; SPEC-SS-006/017; EC-SS-8 |
| TEST-SS-020 | `modelPicker` populated from `getCatalog(id).models`; preselects `providerDefaultModel[id]` else `defaultModelId` | U | REQ-SS-020; SPEC-SS-006/007 |
| TEST-SS-021 | selecting a model persists `providerDefaultModel[id]` device-local | U | REQ-SS-021; SPEC-SS-007 |
| TEST-SS-022 | an empty catalog → the picker shows the persisted value + `empty:true` (a notice); the section still renders | U | REQ-SS-022; SPEC-SS-006; EC-SS-10 |
| TEST-SS-030 | the `agentList`/skill entries render read-only (no write control) from the P4 catalog | U | REQ-SS-030; SPEC-SS-007/008 |
| TEST-SS-031 | an empty catalog → the agent list is OMITTED | U | REQ-SS-031; SPEC-SS-008; EC-SS-9 |
| TEST-SS-040 | `slashList` emitted iff `supportsProviderCommands` + non-empty `command` catalog; read-only | U | REQ-SS-040; SPEC-SS-006/008 |
| TEST-SS-041 | the slash/skill entries expose no create/edit/delete affordance | U | REQ-SS-041; SPEC-SS-007/008 |
| TEST-SS-050 | the environment section offers a shared + per-enabled-provider `envScopeEditor` | U | REQ-SS-050; SPEC-SS-006/009 |
| TEST-SS-051 | `classifyEnvKey`: PATH→shared-known, ANTHROPIC_API_KEY→provider(claude), FOO→shared-unknown | U | REQ-SS-051; SPEC-SS-002; EC-SS-3 |
| TEST-SS-052 | `getEnvironmentReviewKeysForScope` names the out-of-scope key; the scope stays saveable | U | REQ-SS-052; SPEC-SS-004/009 |
| TEST-SS-053 | a pasted blob → `getEnvironmentScopeUpdates` splits each key to its scope | U | REQ-SS-053; SPEC-SS-004/009; EC-SS-4 |
| TEST-SS-060 | `create` persists the non-secret struct to `SettingsPort`; mints an id; load-or-default `[]` | U | REQ-SS-060; SPEC-SS-009 |
| TEST-SS-061 | `edit` preserves the id, reconciles secret slots, persists the change | U | REQ-SS-061; SPEC-SS-009 |
| TEST-SS-062 | `remove` deletes the struct AND `deleteSecret(ref)` for each secret entry (both stores) | U | REQ-SS-062; SPEC-SS-009; EC-SS-6 |
| TEST-SS-063 | an empty name → `err` `nameRequired`; nothing persisted | U | REQ-SS-063; SPEC-SS-009/011; EC-SS-11 |
| TEST-SS-064 | `apply` writes into the (inferred via `resolveEnvironmentSnippetScope`) scope | U | REQ-SS-064; SPEC-SS-004/009; EC-SS-14 |
| TEST-SS-065 | (auto via Mock) the runtime merge injects the applied env-scope (`secretRef`→`getSecret`) into the captured subprocess env | U | REQ-SS-065; SPEC-SS-013/014; EC-SS-15 |
| TEST-SS-066 | a secret env value → `SecretStorePort` `env.<scope>.<KEY>` + a `secretRef` in the struct; `data.json` has zero secret bytes | U | REQ-SS-066/090; SPEC-SS-009/019; EC-SS-5 |
| TEST-SS-067 | `parseContextLimit` parses `k`/`m`, rejects out-of-bounds/invalid → `null`; the entry dropped, the snippet saves | U | REQ-SS-067; SPEC-SS-003; EC-SS-12 |
| TEST-SS-070 | `parseNavMappings` round-trips valid w/s/i; `buildNavMappingText` is its inverse; persists `keyboardNav` | U | REQ-SS-070; SPEC-SS-005 |
| TEST-SS-071 | malformed / multi-char / non-unique mapping → `{error}`; nothing persisted | U | REQ-SS-071; SPEC-SS-005; EC-SS-7 |
| TEST-SS-072 | (manual) every settings control reachable + operable by keyboard; visible focus; modals trap/restore | M | REQ-SS-072; SPEC-SS-010/011/024; TEST-SS-M1 |
| TEST-SS-080 | `mcpManager` emitted iff `supportsMcpTools` (claude); loads/saves via `McpConfigStorePort` | U | REQ-SS-080; SPEC-SS-006/007 |
| TEST-SS-081 | `!supportsMcpTools` → the `mcpDocNote` (codex), not a manager | U | REQ-SS-081; SPEC-SS-006/007; EC-SS-2 |
| TEST-SS-082 | the approvals control lists the P7 rules; remove → `removeRule(id)`; clear → `clear()` | U | REQ-SS-082; SPEC-SS-007 |
| TEST-SS-083 | the permission-mode control persists `defaultPermissionMode` device-local (normal/plan/yolo) | U | REQ-SS-083; SPEC-SS-001/007 |
| TEST-SS-090 | a store-content check finds zero secret bytes in `data.json`/device-local across every key + env flow | U | REQ-SS-090; SPEC-SS-019 |
| TEST-SS-091 | each setting in its correct store (secrets→SecretStore; prefs→Settings; MCP→vault; rules→P7) | U | REQ-SS-091; SPEC-SS-019 |
| TEST-SS-092 | the six `coerce*` round-trip a recorded value; absent/garbage → the field stays absent; no migration | U | REQ-SS-092; SPEC-SS-001/012/025; EC-SS-16 |
| TEST-SS-093 | Claude-only: the view-model + the settings exact-key contract diff against the `next` baseline is empty | U | REQ-SS-093; SPEC-SS-020/028; EC-SS-1 |
| TEST-SS-094 | a failed store write → `Result.err` + a notice; no throw across the port; the tab operable | U | REQ-SS-094; SPEC-SS-022; EC-SS-13 |
| TEST-SS-095 | no `innerHTML`/`window.confirm` (grep/lint); confirmations use the Obsidian `Modal`; `Setting`/`createEl`/`setText` only | U | REQ-SS-095; SPEC-SS-010/011/023 |
| TEST-SS-M1 | (manual) the real `PluginSettingTab` DOM render in Obsidian — every section/control renders, keyboard-nav, the snippet edit + delete modals | M | REQ-SS-001..083/072/095; SPEC-SS-010/011/024 |
| TEST-SS-M2 | (manual) an applied env scope reaches the active provider's real subprocess env at a turn (inline + secretRef resolved) | M | REQ-SS-065; SPEC-SS-013 |
| TEST-SS-M3 | (manual) the real `app.secretStorage` env-secret + API-key round-trip; the no-`data.json` proof | M | REQ-SS-066/090; SPEC-SS-009/019 |
| TEST-SS-M4 | (manual) parity screenshots vs claudian at 320/520/720 px, light+dark (the per-provider shell / key set-unset-unavailable / model picker + empty / env review + snippet list / snippet edit modal / MCP manager vs Codex note / Claude-only) | M | NFR-SS-009; SPEC-SS-015 |

**Split tally:** **U ≈ 38** (the view-model / classifier / codec / scope routing / nav parser / coercers / the
`EnvSnippetService` + discovery over `fake-ports`, the additivity / no-secret / no-branch invariants) — these hold
the 80/70/80/80 coverage gate (NFR-SS-011); **A ≈ 0** (P10 is `Setting`-API DOM, not Vue — any tiny future Vue
sliver gets a co-located `data-testid` PO per ADR-009); **M ≈ 4** (the real `PluginSettingTab` DOM render +
keyboard-nav + modals, the real subprocess env injection, the real `app.secretStorage` env-secret round-trip, the
parity screenshots) accumulating for the single final human review gate (autonomous-drive).

---

# 8. Requirements coverage — REQ-SS ↔ SPEC-SS ↔ TEST-SS

| REQ / NFR | SPEC-SS | TEST-SS |
|---|---|---|
| REQ-SS-001 | SPEC-SS-006/016 | TEST-SS-001; EC-SS-1 |
| REQ-SS-002 | SPEC-SS-006 | TEST-SS-001/002 |
| REQ-SS-003 | SPEC-SS-006/007/016 | TEST-SS-003 |
| REQ-SS-004 | SPEC-SS-006 | TEST-SS-004 |
| REQ-SS-005 | SPEC-SS-006/007/010 | TEST-SS-005 |
| REQ-SS-010 | SPEC-SS-006/021 | TEST-SS-010; EC-SS-2 |
| REQ-SS-011 | SPEC-SS-006/007/017 | TEST-SS-011 |
| REQ-SS-012 | SPEC-SS-009/017/019 | TEST-SS-012 |
| REQ-SS-013 | SPEC-SS-017 | TEST-SS-013 |
| REQ-SS-014 | SPEC-SS-003/007/017/026 | TEST-SS-014 |
| REQ-SS-015 | SPEC-SS-006/017 | TEST-SS-015; EC-SS-8 |
| REQ-SS-020 | SPEC-SS-006/007 | TEST-SS-020 |
| REQ-SS-021 | SPEC-SS-001/007 | TEST-SS-021 |
| REQ-SS-022 | SPEC-SS-006 | TEST-SS-022; EC-SS-10 |
| REQ-SS-030 | SPEC-SS-007/008 | TEST-SS-030 |
| REQ-SS-031 | SPEC-SS-008 | TEST-SS-031; EC-SS-9 |
| REQ-SS-040 | SPEC-SS-006/008 | TEST-SS-040 |
| REQ-SS-041 | SPEC-SS-007/008 | TEST-SS-041 |
| REQ-SS-050 | SPEC-SS-003/004/006/009 | TEST-SS-050 |
| REQ-SS-051 | SPEC-SS-002 | TEST-SS-051; EC-SS-3 |
| REQ-SS-052 | SPEC-SS-004/009 | TEST-SS-052 |
| REQ-SS-053 | SPEC-SS-004/009 | TEST-SS-053; EC-SS-4 |
| REQ-SS-060 | SPEC-SS-001/003/009 | TEST-SS-060 |
| REQ-SS-061 | SPEC-SS-009 | TEST-SS-061 |
| REQ-SS-062 | SPEC-SS-009 | TEST-SS-062; EC-SS-6 |
| REQ-SS-063 | SPEC-SS-009/011 | TEST-SS-063; EC-SS-11 |
| REQ-SS-064 | SPEC-SS-004/009 | TEST-SS-064; EC-SS-14 |
| REQ-SS-065 | SPEC-SS-013/014 | TEST-SS-065; TEST-SS-M2 (M); EC-SS-15 |
| REQ-SS-066 | SPEC-SS-002/009/019 | TEST-SS-066; TEST-SS-M3 (M); EC-SS-5 |
| REQ-SS-067 | SPEC-SS-003 | TEST-SS-067; EC-SS-12 |
| REQ-SS-070 | SPEC-SS-005/007 | TEST-SS-070 |
| REQ-SS-071 | SPEC-SS-005 | TEST-SS-071; EC-SS-7 |
| REQ-SS-072 | SPEC-SS-010/011/024 | TEST-SS-072 (M); TEST-SS-M1 (M) |
| REQ-SS-080 | SPEC-SS-006/007 | TEST-SS-080 |
| REQ-SS-081 | SPEC-SS-006/007 | TEST-SS-081; EC-SS-2 |
| REQ-SS-082 | SPEC-SS-007 | TEST-SS-082 |
| REQ-SS-083 | SPEC-SS-001/007 | TEST-SS-083 |
| REQ-SS-090 | SPEC-SS-009/019 | TEST-SS-090; TEST-SS-M3 (M) |
| REQ-SS-091 | SPEC-SS-019 | TEST-SS-091 |
| REQ-SS-092 | SPEC-SS-001/012/025 | TEST-SS-092; EC-SS-16 |
| REQ-SS-093 | SPEC-SS-006/020/028 | TEST-SS-093; EC-SS-1 |
| REQ-SS-094 | SPEC-SS-022 | TEST-SS-094; EC-SS-13 |
| REQ-SS-095 | SPEC-SS-010/011/023 | TEST-SS-095 |
| NFR-SS-001 | SPEC-SS-001/020/027/028 | TEST-SS-092/093 |
| NFR-SS-002 | SPEC-SS-009/019/026 | TEST-SS-014/066/090 |
| NFR-SS-003 | SPEC-SS-006/009 (pure/port-driven; no obsidian/node/Vue) | grep/lint guard; TEST-SS-010 |
| NFR-SS-004 | SPEC-SS-001/019 | TEST-SS-091 |
| NFR-SS-005 | SPEC-SS-006/009/017 (empty catalog / unavailable storage degrade) | TEST-SS-015/022 |
| NFR-SS-006 | SPEC-SS-022 | TEST-SS-094 |
| NFR-SS-007 | SPEC-SS-010/011/024 | TEST-SS-072 (M); TEST-SS-M1 (M) |
| NFR-SS-008 | SPEC-SS-002/006/021 | TEST-SS-010 |
| NFR-SS-009 | SPEC-SS-015 | TEST-SS-M4 (M) |
| NFR-SS-010 | SPEC-SS-010/011/023 | TEST-SS-095 |
| NFR-SS-011 | SPEC-SS-010/013/027 (DOM + injection coverage-excluded; domain/app carry the weight) | TEST-SS-M1/M2/M3 (M); coverage 80/70/80/80 gate |
| NFR-SS-012 | SPEC-SS-012/025/027 (manifest untouched; load-or-default; no migration) | TEST-SS-092; review check |

**All 37 REQ-SS + 12 NFR-SS covered by ≥ 1 SPEC-SS and ≥ 1 TEST-SS. No `TBD`.**

---

# 9. Quality gate

- [x] Every public interface specified (signature · behaviour · pre/post · errors · side effects · REQ links) —
      the additive settings fields + coercers + classifier + codec + scope routing + nav parser (SPEC-SS-001..005),
      the view-model + control union + discovery + env service (SPEC-SS-006..009), the DOM tab + modals + coerce
      round-trip + env injection + bridges (SPEC-SS-010..014).
- [x] Data structures specified with per-field validation rules (SPEC-SS-001/002/003; the secret-split SPEC-SS-019).
- [x] State transitions modelled (the shell state model SPEC-SS-016; the API-key state model SPEC-SS-017; the
      env-edit + snippet state model SPEC-SS-018).
- [x] Edge cases enumerated, not `TBD` (EC-SS-1..16).
- [x] Test scenarios derived, U/A/M split, 1:1 to REQ/EC (TEST-SS-001..095 + M1..M4).
- [x] Observability specified (SPEC-SS-022/026 — boundary notices via `NotificationPort`/`FeedbackService`, no
      secret/env value in a notice or log).
- [x] Performance budgets inherited (the view-model / classifier / codec / coercers are pure in-repo; no new
      budget tighter than the PRD NFRs).
- [x] Compatibility: **fully additive** — Claude-only byte-identical to P0–P9; the structural growth is the six
      OPTIONAL `PluginSettings` fields (absent from `DEFAULT_SETTINGS`) + the additive `environmentKeyPatterns`
      descriptor field + the new domain/application modules; **NO new port** (compose `SettingsPort` +
      `SecretStorePort`); no migration (SPEC-SS-001/002/020/027, NFR-SS-001/012).
- [x] Every spec item traces to ≥ 1 REQ; full coverage table (§8).
- [x] Two independent teams would build the same thing (the six design open items RESOLVED in §0: the additive
      field names + `EnvSnippetStruct`/`EnvEntry`/`envSecretKey`; the pinned `SHARED_ENVIRONMENT_KEYS` set + the
      secret rule; the env-key patterns as descriptor data; the `SettingsControl` union; the read-only discovery
      source; `contextLimits` sequenced last).
- [x] Every irreversible architectural choice already has an ADR (ADR-SS-001/002, accepted) — no new ADR needed;
      this spec only refines field-level details the ADRs delegated to spec.

> **No open clarifications block the planner.** The six design open items are RESOLVED in §0. One flagged
> escalation (the read-only agent/subagent discovery source, SPEC-SS-008) is non-blocking — the must-tier surface
> is satisfied by the P4 `ProviderCommandCatalogPort` skill/command entries + the omit-when-absent fallback;
> escalate to PM only if a richer per-provider agent source is wanted (read-only either way, NG1). Hand-off to
> `/spec:tasks` (planner) in `workflow-state.md`.
