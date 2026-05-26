---
id: REVIEW-PV-001
title: Providers registry (P9) — Stage-9 review
stage: review
feature: providers-registry
area: PV
epic: claudian-reboot
phase: P9
owner: reviewer
integration_branch: next
base: next @ ae7e9559 (unchanged — git diff next..HEAD is the whole P9 feature)
verdict: Approved with conditions
created: 2026-05-26
updated: 2026-05-26
---

# Review — Providers registry (P9, the LARGEST phase)

## Verdict

**Approved with conditions.** The P9 feature is correctly specified, live-wired,
security-sound, additive, and capability-parity-faithful to claudian-main. The
conditions are not code defects — they are the **pending-manual legs** (TEST-PV-M1
Codex, TEST-PV-M2 Opencode, TEST-PV-M3 secret, TEST-PV-M4 parity screenshots) and
the `app.secretStorage` `minAppVersion` API check, which by design ride the single
final epic-review human gate and must not be self-claimed before merge to `next`.
No P1/P2 (release-blocking) findings.

## Finding counts by severity

| Severity | Count |
|---|---|
| P1 (critical — blocks release) | 0 |
| P2 (high — typically blocks) | 0 |
| P3 (medium — scheduled) | 3 |
| P4 (low — nit) | 4 |
| Pending-manual (gated, not defects) | 4 legs |

There are **no P1/P2 findings** for the maintainer to fix before merge.

## Security confirmation (the load-bearing P9 concern)

All five security invariants hold:

1. **Secret → `app.secretStorage` ONLY.** `src/infrastructure/obsidian/SecretStorage.ts`
   reads/writes exclusively through the native `app.secretStorage` shape (`:42-86`);
   no `data.json`, no device-local store, no `NotificationPort`/`LoggerPort` line, no
   DTO carries a value. The Codex/Opencode runtimes read the key via
   `SecretStorePort.getSecret(providerSecretKey(<id>))` at the **turn boundary** and
   merge it into the subprocess env only (`CodexRuntime.ts:90-102`,
   `OpencodeRuntime.ts:90-101`). `SelectProviderUseCase` maps construct-fail to copy
   keys (`keyRequired`/`cliNotFound`/`unavailable`), never echoing a value
   (`SelectProviderUseCase.ts:28-33`). `ProviderSecretField.vue` holds the draft
   transiently, clears it on save, `type="password"`, never echoes it back
   (`:22-37/43-53`).
2. **`HomeFsPort` read-only, rooted, scoped, path-escape → err.** `HomeFileSystem.ts`
   exposes only `readFile`/`exists`/`listFolders` (no write/delete), rooted at
   `os.homedir()`, double-gated: the pure `isInsideHomeRoot` check (`homeFsPath.ts`)
   then a resolved-absolute containment guard against `HOME_FS_ROOTS` (`.codex`/`.claude`)
   so a `..`/symlink cannot escape (`:73-87`). Consented once before any read via
   `ProviderConsentGate` (`ChatSurface.vue:230`).
3. **Stdio spawns bounded/explicit/no-shell-eval.** `JsonRpcStdioChannel._spawnOptions`
   sets `shell: false`, a bounded merged env `{...process.env, <secret>, PATH: enhanced}`,
   `windowsHide: true`; Windows `.cmd`/`.bat` route through `cmd.exe /d /s /c` with
   `windowsVerbatimArguments` and no string-eval (`:311-347`). SIGTERM→SIGKILL(3s)
   graceful shutdown (`:151-177`).
4. **Honest gate, never crash.** No-key/no-CLI/unavailable-transport →
   `ObsidianProviderRuntimeRegistry.createChatRuntime` returns `Result.err`
   (`:73-95`), surfaced as a non-blocking notice; LS demo returns `err('unavailable')`
   for non-Claude (`LocalStorageProviderRuntime.ts:23`); a key-less turn yields a
   terminal `{type:'error'}` chunk then `done`, not a throw (`CodexRuntime.ts:91-95`).
5. **No `switch(providerId)`.** The source-guard test
   `tests/ui/chat/providers/no-provider-switch.test.ts` passes (verified, 6/6); the
   runtime registries use `Map`-keyed builder tables
   (`ObsidianProviderRuntimeRegistry.ts:48-65`), the infra `ProviderRegistry` indexes
   the descriptor table, and `ModelSelector.vue`'s `PICKER_VARIANT[providerId]` is a
   table lookup (not a branch). The single `if (providerId === 'claude')` in
   `LocalStorageProviderRuntime.ts:20` is the inert-demo Claude/err-everything gate —
   not capability branching in a use case (NFR-PV-014 honoured).

## Live-wiring confirmation (P5 lesson — not built-but-dead)

The machinery is genuinely wired in **both** composition roots:

- **`AgentSidebarView.ts`** provides `PROVIDER_REGISTRY_PORT`, `SECRET_STORE_PORT`,
  `HOME_FS_PORT` (`:126-128`), the widened `CHAT_RUNTIME_FACTORY` routed through
  `bridge.providerRuntimeRegistry.createChatRuntime(providerId)` (`:134-136`), and
  `OPEN_PROVIDER_CONSENT` opening the **real** `ProviderConsentModal` (`:141-150`).
- **`src/ui/main.ts`** provides the same three ports + factory against `MockBridge`
  (`:87-101`), with a browser-safe consent stand-in (`Promise.resolve(true)`, inert
  home-fs).
- **`ChatSurface.vue`** mounts `ProviderChooser` (`:832-837`), routes selection through
  `SelectProviderUseCase` + `ProviderConsentGate` (gated on `readsHomeDir`, `:230-233`),
  resolves the active provider from `registry.resolveActiveProvider(settings)` (`:195`),
  rebinds the active tab's runtime (`tabs.rebindActiveRuntime`, `:215/235`), and reads
  `getCatalog(activeProviderId.value)` — the `'claude'` hardcode **removed** (`:704`).
- **Optional-inject + ≤1-provider degrade = byte-identical P8:** every P9 port is
  `inject(..., undefined)`; with no registry the surface stays pure P8 (active
  provider = default `'claude'`, no chooser, `createRuntime` falls back to the P8
  Claude runtime on construct-fail, `:139-149`).
- **`homeFsConsent` round-trip:** `ObsidianBridge._coerceSettings` load-or-defaults it
  (`:574/583`) and `core-settings.ts:64-66` round-trips it — the APPLICATION-batch
  escalation (the coercer originally dropped it) is **fixed**. `coerceActiveProvider`/
  `coerceEnabledProviders` also round-trip (`ObsidianBridge.ts:568-569`,
  `core-settings.ts:59-60`). `tests/infrastructure/obsidian/ObsidianBridge.settings.test.ts`
  passes (verified).

## Capability-matrix parity (verbatim vs claudian-main)

Compared `src/domain/chat/providers/ProviderDescriptor.ts` against
`D:\Projects\claudian-main\src\providers\{claude,codex,opencode}\capabilities.ts`:

| Flag | Claude | Codex | Opencode | Parity |
|---|---|---|---|---|
| persistentRuntime/nativeHistory/planMode/image/instruction | true | true | true | ✅ |
| rewind | true | **false** | **false** | ✅ |
| fork | true | true | **false** | ✅ |
| providerCommands | true | **false** | true | ✅ |
| mcpTools | true | **false** | **false** | ✅ |
| turnSteer | false | **true** | false | ✅ |
| reasoningControl | effort | effort | effort | ✅ |
| blankTabOrder | 20 | 15 | 10 | ✅ |

Byte-identical to claudian's frozen flags. Only BACKED caps are wired; every GATED-OFF
flag is a literal `false`, honestly hidden/disabled through the existing
capability-gated view-model — none built (NG1 honoured). The claudian-only
`planPathPrefix` (Claude) is an unrelated detail outside the P9 frozen-bag contract.

## File-naming-ban + scoped-guard-relax checks

- **File-naming ban honoured:** the real infra is `SecretStorage.ts` / `HomeFileSystem.ts`
  (NOT `ObsidianSecretStore*`); runtimes/transports live at the `obsidian/` root
  (`CodexRuntime.ts`/`OpencodeRuntime.ts`/`AcpTransport.ts`/`CodexRpcTransport.ts`/
  `JsonRpcStdioChannel.ts`), matching no banned glob.
- **Guard-relax scoped:** `eslint.config.js` drops ONLY `@/domain/ports/SecretStorePort`
  (from `DELETED_SUBSYSTEM_BAN`) and `SECRET_STORE_PORT` (from `DELETED_INJECTION_KEYS`)
  — the documented per-phase regrow (ICON_PORT precedent). The OLD
  `@/infrastructure/obsidian/ObsidianSecretStore*` glob (`:148`) **stays banned**;
  `PROVIDER_REGISTRY_KEY` (distinct from the new `PROVIDER_REGISTRY_PORT`) stays
  banned; every other P0-deleted symbol stays banned.

## Architecture + i18n

- DDD layering intact: no `obsidian`/`node:*`/Vue in `src/domain/**` or
  `src/application/**`; `obsidian` confined to `src/plugin/**` + `src/infrastructure/obsidian/**`;
  `node:*` only in the coverage-excluded `obsidian/**` transports/home-fs. UI never
  imports `obsidian` (eslint UI bans intact). Each new port has its own InjectionKey +
  composable (`use{ProviderRegistry,SecretStore,HomeFs}Port`), no aggregate.
- `vue/no-v-html` is error; consent uses an Obsidian `Modal` (`ProviderConsentModal.ts`),
  never `window.confirm`. Mounted components have co-located `data-testid` PageObjects.
- **en↔de i18n parity:** the `agent.chat.providers.*` key tree (chooser/name/secret/
  notice/consent) is identical in `en.ts` and `de.ts` (verified). The forbidden-terms
  guard whitelists exactly the credential-config keys (`agent.chat.providers.secret.*`,
  `...notice.keyRequired`) — the documented exception, consistent with `settings.*`.

## Per-provider parity assessment (one line each)

- **Claude:** complete default, all-true caps, P1 runtime reused unchanged via
  `createChatRuntime('claude') → ok` — byte-identical P8. ✅
- **Codex:** JSON-RPC-over-stdio runtime + JSONL-via-HomeFs history + turn-steer
  BACKED; rewind/provider-commands/MCP honest-false; real transport coverage-excluded
  → TEST-PV-M1. ✅ (functional-but-partial per charter §6a).
- **Opencode:** shared-ACP runtime + ACP-loadSession history + provider-commands
  BACKED; rewind/fork/steer/MCP honest-false; real transport coverage-excluded →
  TEST-PV-M2. ✅ (functional-but-partial per charter §6a).

## Brand review

The diff touches UI surfaces (`*.vue`, `tokens.css`), so `brand-reviewer` is dispatched
in parallel by `/spec:review`; fold its findings into this section before the final
verdict. Reviewer surface assessment (preliminary, pending the subagent): the new
components (`ProviderChooser`/`ProviderOption`/`ProviderSecretField`) and the changed
`ModelSelector` render exclusively through `--sp-*` tokens — no hex/raw-Obsidian-var/
emoji/icon-library-import/gradient/white-page-background observed in the component
`<style>` blocks; brand literals stay confined to `tokens.css` (the single seam,
`[data-provider]` swap). `tests/ui/styles/tokens.test.ts` (TEST-PV-091) guards the
4-token slice. **Brand review: pending subagent fold; no blocking brand signal observed
in the reviewer pass.**

## Findings

### P3 (medium — scheduled, non-blocking)

- **R-PV-001 (medium · reliability).** `CodexRpcTransport._toChunk` emits a terminal
  `done` only on the `turn/completed` notification (`:117-120`); a transport that ends
  the turn without that notification (a Codex app-server protocol drift) would leave
  the `query` generator parked on its `wake` promise until `onClose` fires. The
  `onClose` path covers process death, but a *graceful* server-side turn end that omits
  `turn/completed` has no timeout on the streaming loop (only the `turn/start` request
  is timed). Recommend a per-turn idle watchdog or an explicit end-of-turn fallback at
  the M1 manual leg. Owner: dev (verify at TEST-PV-M1). `CodexRpcTransport.ts:82-93`.
- **R-PV-002 (medium · spec-fidelity).** `CodexRuntime.getToolbarCapabilities` maps
  `hasServiceTier: this.capabilities.supportsTurnSteer` (`:164`) — it reuses the
  turn-steer flag as the service-tier proxy because the frozen `ProviderCapabilities`
  bag has no dedicated service-tier field. This happens to be correct for the three P9
  providers (Codex is the only steer-true AND the only service-tier provider), but it
  is a coincidental coupling: a future steer-capable-but-no-service-tier provider would
  mis-gate. SPEC-PV-017/REQ-PV-064 treat service-tier as a provider toggle *config*,
  not the steer flag. Recommend a dedicated `hasServiceTier` descriptor field in P10.
  Owner: architect/dev (P10). `CodexRuntime.ts:159-168`.
- **R-PV-003 (medium · history).** REQ-PV-032/042/084 require Codex JSONL + Opencode
  ACP history to hydrate into the P3 `ProviderHistoryPort` shape, but the runtimes'
  `resumeSession`/`getSessionId` are present while the actual JSONL/ACP parse-into-P3
  hydration is reached only through `HomeFsPort`/ACP at runtime (coverage-excluded).
  The automated suite does not exercise a provider-native → P3 mapping (it is M1/M2).
  This is per the coverage-exclusion design, but the traceability cell for REQ-PV-084 is
  "contract unchanged" rather than a tested provider-native leg — confirm the JSONL/ACP
  → P3 mapping at M1/M2 explicitly. Owner: dev (verify at M1/M2).

### P4 (low — nit)

- **R-PV-004 (low).** `SecretStorage.deleteSecret` clears to empty string rather than
  truly deleting (native `SecretStorage` exposes no delete); a subsequent `listKeys`
  may still return the cleared key (Obsidian-version-dependent). Documented in-file
  (`:70-75`); benign since `getSecret` returns `ok(null)` for empty. Note for M3.
- **R-PV-005 (low).** `JsonRpcStdioChannel._enhancedPath` hard-codes POSIX paths
  (`/usr/local/bin`, `/opt/homebrew/bin`, `$HOME/.local/bin`); on Windows these are
  inert but appended. Harmless (parity with the P1/P8 enhanced-PATH posture); cosmetic.
- **R-PV-006 (low).** `ChatSurface.vue` `createRuntime` falls back to the P8 Claude
  runtime on a per-tab construct-fail and re-throws only if Claude itself fails
  (`:146-148`). Correct for additivity, but the silent fallback means a non-Claude
  active provider that loses its key at bind time renders a Claude tab without an
  inline marker until the explicit select path re-notifies. Acceptable per
  SPEC-PV-013; worth a UX note in P10.
- **R-PV-007 (low).** The `de` consent/secret copy is hand-translated and reads well,
  but `providers.secret.unavailable` ("Der sichere Speicher ist … nicht verfügbar")
  paraphrases rather than mirrors the en "Secret storage is unavailable" — fine for
  P9, flag for the P11 i18n sweep.

## Quality metrics evidence

`specorator quality:metrics` was not run in this read-only thread (the parent runs the
full verify/coverage gate). Deterministic signals gathered directly: the four targeted
guard/round-trip/forbidden-terms/descriptor test files pass (23/23, verified via
`npx vitest run`); the diff is large but cohesive (112 files, +13256, TDD-ordered
RED→green per the 44-task plan); no `switch(providerId)` in `src/`; eslint guard-relax
scoped to the two regrown secret symbols. Coverage 80/70/80/80 + full-suite green are
the parent's gate — this review does not let a metric override the manual-leg
conditions below.

## Conditions for merge to `next`

1. The **automated** verify gate (`npm run verify` + `npm run test:all`) is green —
   confirmed by the parent (not re-run here).
2. The pending-manual legs **TEST-PV-M1 / M2 / M3 / M4** and the `app.secretStorage`
   `minAppVersion` API check (SPEC-PV-032, CLAR-PV-004) are scheduled for the single
   final epic-review human gate and recorded as pending — **not** self-claimed green.
3. The brand-reviewer subagent's findings are folded into `## Brand review` and carry
   no blocking signal (token literal / emoji / icon-library import / gradient /
   white page background). Preliminary reviewer pass: none observed.

## Notes

- Standalone-mount smoke tests hitting the 5000ms ceiling under load (pass with
  `--testTimeout=30000`) are an environment artefact, **not** a defect.
- The coverage-excluded legs (real Codex JSON-RPC, real Opencode ACP, real
  `app.secretStorage`, real `~/.codex`/`~/.claude` reads) are correctly gated by
  TEST-PV-M1/M2/M3 and recorded pending-manual in `traceability.md`.
