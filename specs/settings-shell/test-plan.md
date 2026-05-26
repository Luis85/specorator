---
id: TESTPLAN-SS-001
title: Settings shell (P10) — test plan
stage: testing
feature: settings-shell
area: SS
epic: claudian-reboot
phase: P10
owner: qa / dev
created: 2026-05-26
updated: 2026-05-26
---

# Test plan — Settings shell (P10)

Tracks the automated unit/component coverage plus the coverage-excluded manual
legs (TEST-SS-M1/M2/M3/M4) that ride the single final epic-review human gate.

## Deleted-symbol guard verification (T-SS-001 / NFR-SS-011)

Confirmed against `eslint.config.js` (read 2026-05-26):

- **CLEAN — NO relaxation needed.** The new P10 paths
  `@/domain/chat/environment/**`, `@/domain/settings/keyboardNav`,
  `@/application/settings/**` and the `EnvSnippet*` / `classifyEnvKey` /
  `EnvSnippetService` symbols match **none** of the `DELETED_SUBSYSTEM_BAN.group`
  globs and **none** of the `DELETED_INJECTION_KEYS.importNames` entries.
  `@/domain/chat` regrew in P1 and `@/application` in P9 — both off the ban list;
  there is no `@/domain/settings` ban (only `@/domain/feature` /
  `@/application/feature` / `@/application/migration` are banned). There is no
  `EnvSnippet*` / `classifyEnvKey` / `EnvSnippetService` ban glob of any kind.
- **NO new InjectionKey.** P10 adds no port; the env subsystem composes the
  existing `SETTINGS_PORT` + `SECRET_STORE_PORT` (ADR-SS-001 §5). `SECRET_STORE_PORT`
  was already un-banned in P9.
- **NO new `obsidian/**` impl file.** The env-secret round-trip reuses the P9
  `src/infrastructure/obsidian/SecretStorage.ts` (named to avoid the still-banned
  `@/infrastructure/obsidian/ObsidianSecretStore*` glob, `eslint.config.js:148`);
  the env→subprocess merge extends the P9 runtime files
  (`CodexRuntime.ts` / `OpencodeRuntime.ts` / the Claude runtime), none of which
  match a banned glob.
- **Verdict: NO guard-relax task in P10.** T-SS-033 (the gate) re-confirms.

## Claude-only additivity baseline (T-SS-001 / NFR-SS-001 / SPEC-SS-028 / TEST-SS-093)

The reference the additivity diff (TEST-SS-093) asserts against:

- **Exact-key `PluginSettings`/`DEFAULT_SETTINGS` contract on `next`** (pre-P10):
  `DEFAULT_SETTINGS` keys are exactly `{ locale, logLevel, sessionsFolder, maxTabs,
  customSystemPrompt, activeProvider, enabledProviders }` (the `homeFsConsent` field
  is OPTIONAL + absent from `DEFAULT_SETTINGS`). P10 appends six more OPTIONAL fields
  (`envSnippets?` / `envScopes?` / `keyboardNav?` / `providerDefaultModel?` /
  `defaultPermissionMode?` / `providerCliPath?`), each **absent from
  `DEFAULT_SETTINGS`**, so a P9-shaped settings object (none of the six recorded) is
  byte-identical to the P9 exact-key contract.
- **Rendered control set at `enabledProviders: []`** (the additivity expectation):
  `buildSettingsViewModel` → `[shared, provider:claude, environment]`; the shared
  section carries the unchanged P0 core controls (locale, logLevel) + the
  cross-provider prefs; the Claude section carries no `providerToggle`, no
  `apiKeyField` (`needsApiKey:false`), the `mcpManager` present
  (`supportsMcpTools:true`); the environment section carries the shared +
  `provider:claude` env editors + the snippet list. No P0-P9 behaviour changes.

## Automated unit coverage — DOMAIN batch (T-SS-002..013)

The pure domain carries the unit weight + the 80/70/80/80 coverage gate (NFR-SS-011):

| Test file | TEST-SS ids | Status |
|---|---|---|
| `tests/domain/settings/PluginSettings.ts.test.ts` | TEST-SS-092/093 (additivity leg) | scheduled |
| `tests/domain/settings/coerceSettings.test.ts` | TEST-SS-092/093 (coerce leg) | scheduled |
| `tests/domain/chat/providers/ProviderDescriptor.test.ts` (extended) | TEST-SS-051 (descriptor-field leg) + P9 TEST-PV-020..023 stay green | scheduled |
| `tests/domain/chat/environment/EnvSnippet.test.ts` | TEST-SS-060/067 (codec leg) | scheduled |
| `tests/domain/chat/environment/classifyEnvKey.test.ts` | TEST-SS-051 (classifier leg) | scheduled |
| `tests/domain/settings/keyboardNav.test.ts` | TEST-SS-070/071 | scheduled |
| `tests/domain/chat/environment/envScope.test.ts` | TEST-SS-052/053/064 | scheduled |

## Coverage-excluded manual legs (TEST-SS-M1..M4)

Never self-claimed by an agent; recorded for the single final epic-review gate.

- **TEST-SS-M1** — the real `PluginSettingTab` `Setting`-API DOM render: every
  section/control renders; keyboard-nav reaches/operates every control; the snippet
  edit + delete modals trap/restore focus.
- **TEST-SS-M2** — an applied env scope reaches the active provider's real
  subprocess env at a turn (inline + `secretRef` resolved via `getSecret` at the
  infra boundary).
- **TEST-SS-M3** — the real `app.secretStorage` env-secret + API-key round-trip +
  the no-`data.json` proof (zero secret bytes in `data.json`/device-local).
- **TEST-SS-M4** — parity screenshots vs claudian at 320/520/720 px, light + dark
  (`parity-screenshots.md`).
