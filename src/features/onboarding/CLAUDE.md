# Onboarding (Setup) Feature

A guided first-run surface: `VIEW_TYPE_ONBOARDING`, a Vue 3 + Pinia island in
the **main workspace area** that detects installed provider CLIs, installs the
missing ones, and walks the vault config a user needs to be productive. Opens
itself **once** per vault, then lives on the `open-setup-guide` command and a
button on the Settings → General first-run banner.

Design: [`docs/superpowers/specs/2026-07-25-onboarding-setup-view-design.md`](../../../docs/superpowers/specs/2026-07-25-onboarding-setup-view-design.md).
ADR 0006 closed the Vue *migration* set but permits new view-level product
surfaces to use the island pattern; this is one.

## Layout

| File | Role |
|------|------|
| `providerDetection.ts` | `detectProviderCli` / `detectProviderClis` — probes each provider through the provider's OWN `ProviderCliResolver` (`reset()` first), falling back to a `findBinaryOnPath` sweep. Status is `found` / `missing` / `unknown` |
| `cliInstallRunner.ts` | `runCliInstall` (shell-free `spawn` of a provider-declared argv, streamed output, process-tree cancel/timeout, 10-min cap), `appendInstallOutput` (bounded line ring), `platformInstallMethods` |
| `onboardingSettings.ts` | Every settings write the flow performs: provider enable, host-scoped CLI path pin, `setDefaultModel` (commits a model to its OWNING provider), the five folder settings (+ `ensureOnboardingFolders` / `readOnboardingFolders`), the enumerated scalar keys, and `completeOnboarding` / `isOnboardingComplete` |
| `onboardingSteps.ts` | `ONBOARDING_STEPS` order + label keys |
| `maybeOpenOnboarding.ts` | `shouldOpenOnboarding` (first-run predicate over `onboardingAutoOpened` + `firstRunDismissed` + provider-enabled state) + the activation wrapper called from `PluginLifecycle.runDeferredStartup()` |
| `OnboardingView.ts` / `activateOnboarding.ts` / `viewType.ts` | `ItemView` host (per-leaf Vue app via the shared `mountLeafIsland`), main-area leaf activation, view-type constant |
| `vue/OnboardingRoot.vue` | Header + `StepRail` + step router + footer (Back / Next / Finish). Dismissing completes the flow |
| `vue/components/StepRail.vue` | Free-navigable step rail (`role="navigation"` + `aria-current="step"`, deliberately not an ARIA tablist) |
| `vue/components/ProvidersStep.vue` / `ProviderCard.vue` | Detected providers first; per-card status badge, resolved path, enable toggle, auth hint, install panel, manual-path escape hatch |
| `vue/components/InstallPanel.vue` / `InstallConfirm.vue` / `InstallOutcome.vue` | Method picker + copyable command + run/cancel; the explicit pre-spawn confirm; the result line + bounded console |
| `vue/components/DefaultsStep.vue` | Default model (grouped per enabled provider, owner-tagged), the STATED approval default, auto-titles |
| `vue/components/FoldersStep.vue` | The five vault folders with exists / will-create / unconfigured badges and a create-missing action |
| `vue/components/WorkspaceStep.vue` | Chat placement + max chat tabs (bounds mirror the General tab slider) |
| `vue/components/MarketplaceStep.vue` | Network opt-in (routed through the shared one-time warning) + a deep link to the Marketplace |
| `vue/components/FinishStep.vue` | Enabled-provider summary; completes the flow and opens chat |
| `vue/stores/onboardingStore.ts` | Reactive projection over detection + the install runner + the settings writers. `runFor(providerId)` is the per-provider run accessor |
| `vue/useAppSetting.ts` | `[ref, setter]` binding for one top-level setting (a tuple, because a ref nested in a returned object is not unwrapped in templates) |
| `vue/onboardingKeys.ts` / `createOnboardingPinia.ts` | `PLUGIN_KEY` + `CLOSE_VIEW_KEY`; a FRESH Pinia per leaf |

## Contracts & invariants

- **Detection mirrors what the provider's RUNTIME does at spawn time**, and
  resets the resolver first (`CachedCliResolver` memoizes on a settings-derived
  key and an install changes no setting, so a cached `null` would outlive the
  install that fixed it). Two provider shapes, split by
  `cliInstall.runtimeFallsBackToPathLookup`:
  - **Runtime needs a resolved path** (Claude, Codex, Cursor — their resolvers
    already scan PATH). A resolver `null` is authoritative → `missing`. With NO
    resolver (workspace init failed, or hasn't run) the status is `unknown` and
    no PATH probe is consulted: `getResolvedProviderCliPath` would still return
    `null` and the runtime would refuse to start, so a bare PATH hit must not be
    reported as ready.
  - **Runtime spawns the bare command** (OpenCode —
    `getResolvedProviderCliPath('opencode') ?? 'opencode'`, and
    `resolveOpencodeCliPath` checks configured paths only). Here a resolver
    `null` means "no pin, use PATH", so the probe IS the authoritative answer;
    treating it as `missing` would call a working install broken and keep saying
    so after a successful in-app install.
  `unknown` is never downgraded to `missing` without an authoritative look —
  claiming a CLI is absent when we could not properly look is worse than
  admitting we don't know.
  Two further rules keep `found` honest:
  - **The probe searches the provider's RUNTIME PATH**, i.e. the shared +
    provider-scoped env text (`getRuntimeEnvironmentVariables`), because a CLI
    installed only under a provider-scoped `PATH=` override is genuinely
    launchable — the runtime builds its subprocess PATH from exactly that. Read
    from settings, never `plugin.getResolvedEnvironmentVariables`: that resolves
    SecretStorage refs and warns about missing ones, which a probe that reruns on
    every card interaction must not do.
  - **A resolved value is `found` only once it is confirmed to be a file this
    host can run AND this provider's launch path accepts** (`classifyResolvedPath`).
    Two ways a real file is still `missing`, both carrying the path and a reason
    through `unusable` rather than a bare "not found" that sends the user hunting
    for a file they can see:
    - `not-executable` — no `+x` (`isExecutableFile` = `stat().isFile()` plus
      `X_OK`, which is a no-op on Windows where the extension decides). A
      partially installed or copied script would fail at spawn with `EACCES`.
    - `batch-shim` — a Windows `.cmd`/`.bat` under a provider that declares
      `cliInstall.windowsBatchShimUnsupported`. Claude is the one: the SDK owns
      its stdio stream, so a cmd.exe wrapper is not available to it the way it is
      to the self-spawning providers — which is exactly why `findClaudeCLIPath`
      skips `.cmd` while probing. Nothing stops a user pinning `claude.cmd` by
      hand, and npm installs precisely that on Windows. The fact is declared on
      the registration, never inferred from a provider id here.
    `findBinaryOnPath` now requires executability too, so a PATH scan skips a
    non-runnable hit and keeps looking instead of returning something that fails
    at spawn. `resolveConfiguredCliPath` deliberately stays existence-only: a pin
    must still resolve so detection can say *why* it is unusable.
    Codex in WSL mode resolves to a command inside the distro (`codex`, or a
    configured Linux path), which the runtime hands to `wsl.exe`; verifying it
    would mean spawning into the guest, and the host PATH answers a different
    question. That case is `unknown` with `unknownReason: 'external-target'`.
  - **On Windows the candidates are `.exe` / `.cmd` / `.bat` only** — never the
    bare name (`executableCandidateNames`, shared with the installer's own
    package-manager lookup, which had the same bug). npm installs BOTH `opencode`
    (an sh script) and `opencode.cmd`, and Windows cannot execute the former, so
    offering it would name a file nothing on this platform can spawn and would
    hide the real entry point. `.exe` leads because it spawns without a shell; a
    `.cmd`/`.bat` needs the cmd.exe wrap, which every provider launch now applies
    (`utils/windowsSpawn.resolveBatchAwareSpawnSpec`). OpenCode's ACP launch was
    missing that wrap entirely, and additionally resolves a BARE `opencode` to a
    real path on win32 first — an extension-based wrap cannot fire on a name with
    no extension, and its runtime deliberately spawns the bare command when
    nothing is pinned.
- **An install is offered only for a CONFIRMED absence** (`status === 'missing'`).
  For `unknown` the card explains which of the two reasons applies and keeps the
  manual-path field — that one names a path instead of assuming one is absent,
  and it is also how the WSL command is set. Offering the global installer there
  would have the user reinstall a package they may already have, and the
  post-install re-probe would still read `unknown`, so the same button would come
  straight back.
- **The manual-path editor is offered in EVERY state**, including `found`, and
  opens seeded with the host pin (`pinnedPath`, not the resolved path — prefilling
  a discovered path would turn Save into an accidental pin of whatever was found).
  Hiding it once something resolves removed the only control that could correct a
  wrong-but-existing pin or clear it (blank deletes the host entry and restores
  auto-detection) without leaving Setup for the provider settings tab.
- **Every control offers exactly the values the canonical setting accepts.** The
  tab-cap options are generated from the General tab's slider bounds
  (`setLimits(3, 10, 1)`) rather than listed, because a subset renders a live 7 or
  9 as an unselected control with no way back to it.
- **The install `argv` IS the security model.** `ProviderRegistration.cliInstall`
  declares each method's `argv` statically; the runner spawns it with **no
  shell**, so there is no command string for anything to be interpolated into. A
  method whose real install is a piped script (`curl … | bash`, `irm … | iex`)
  MUST declare `argv: null` — the runner refuses it and the UI renders a
  copyable command plus docs link instead of gaining a hidden `shell: true`
  path. Cursor is entirely copy-only for this reason. Further rails: an explicit
  per-run confirm naming the exact command, a bounded output ring, a 10-minute
  timeout, and `onUnmounted` cancel so a closed leaf leaves nothing running.
  **Teardown is process-tree-wide, not child-only**: a package manager forks
  (lifecycle scripts, node-gyp) and on win32 the direct child is the `cmd.exe`
  wrapper, so a bare `child.kill()` would leave the real npm installing after
  Cancel. The child leads its own POSIX process group (`detached`, skipped on
  win32 where it would spawn a console) and is reaped through
  `utils/processKill.forceKillProcessGroup` — `process.kill(-pid)` / `taskkill
  /T /F` — and the run settles only AFTER that resolves. Plus `npm.cmd`
  resolution + the `cmd.exe` verbatim wrap on win32 (Node's CVE-2024-27980
  batch-shim refusal), and `buildFullSubprocessEnvironment` with the enhanced
  PATH (a GUI-launched host's PATH cannot find `npm`).
- **Tool approval is STATED, not offered.** There is no durable choice to make:
  `plan` is ephemeral by design (the load path resets it to `normal` every start,
  because `prePlanPermissionMode` is lost), and `yolo` stays behind the toolbar
  toggle and its one-time warning (SEC-1). A select offering either would
  advertise a default the app refuses to keep, so the step names the safe default
  and points at the toolbar for per-conversation Plan/bypass. `permissionMode` is
  therefore absent from `OnboardingScalarKey`. The Marketplace opt-in likewise
  routes through the SAME `maybeWarnMarketplaceNetwork` notice the view and
  settings tab use, so the network disclosure can't be skipped by entering
  through onboarding.
- **The wizard is a view over settings, not a staging buffer.** Every control
  persists through `plugin.saveSettings()` the moment it is touched, so
  abandoning the flow keeps exactly what was already confirmed and reopening it
  shows live state. Corollary: the step only renders controls whose value the app
  actually keeps — see the approval note below. Consequence: `useAppSetting` reads once at mount and writes
  on change — it does not watch `plugin.settings` (a plain non-reactive object).
  Because persist-on-touch means two writes can overlap (two provider cards
  toggled in a row), `SpecoratorSettingsStorage.save` chains its adapter writes:
  each call still serializes its own snapshot synchronously, but an earlier write
  can no longer land after a later one and leave the file holding a value the
  user already changed. That fix is at the storage layer, so every settings
  surface gets it.
- **State the store derives from settings is mirrored, not computed.** Anything
  read out of `plugin.settings` for the UI to react to (`settingsProviderId`)
  lives in a `ref` refreshed by the actions that move it — a `computed` over that
  plain object registers no dependency and caches its first answer for the life
  of the store. That is also why the model commit is a store action
  (`selectModel`) rather than a direct `setDefaultModel` call from the step: it
  keeps the write and the re-read in one place, and it was the one settings write
  a component made on its own.
- **Enabling or disabling a provider re-projects the selection.** `setProviderEnabled`
  runs `normalizeProviderSelection` + `projectProviderState` before saving,
  because otherwise the provider selection and the top-level model disagree: a
  fresh vault holds Claude's `haiku`, `saveSettings` would point
  `settingsProvider` at the newly enabled provider, and the blank-tab factory
  routes by MODEL — so enabling Codex first and Claude later opened the first
  chat on Claude. Disabling matters for the same reason (the outgoing provider's
  model must not remain the default).
- **A blank folder setting is skipped, never defaulted.** The Library and the
  Marketplace installer both read blank as "unconfigured" and refuse to write
  there, so materializing a default would land content somewhere nothing scans.
- **Two flags, two jobs.** `onboardingAutoOpened` gates the AUTO-open and is
  written when it fires, so the view auto-opens at most once per vault
  **however it is closed** — Obsidian's own tab-close control never reaches our
  code, so keying the trigger on an explicit dismissal would re-steal focus on
  every later load. (Writing it from `ItemView.onClose` instead would be worse:
  that hook also fires on plugin unload and popout/move, where "dismissed" is
  not the user's intent and a `saveSettings` may not flush.) `firstRunDismissed`
  keeps gating the Settings → General banner, so someone who closed the wizard
  without configuring still has a quiet nudge with a way back in. Auto-open
  additionally requires that no provider is enabled (`hasAnyProviderEnabled`),
  so an existing user who set up from the settings tab is never ambushed.
- **The auto-open survives a broken startup, but not an unload.**
  `PluginLifecycle.runDeferredStartup` sequences it after
  `completeDeferredOnload` unconditionally rather than chaining onto success:
  that method bails out when provider workspace init fails and can reject when a
  cache hydration throws, and a vault where that happens is exactly where the
  setup view is most needed. The one exception is `isUnloaded()` — the flow
  persists its auto-open flag *before* activating, so continuing into a
  torn-down plugin would burn the single auto-open the vault gets.
- **A model choice is committed to the provider that owns it, in ONE save.**
  Writing only the top-level `model` does not survive: `ProviderSettingsCoordinator`
  projects per-provider state, and projecting a provider that doesn't own the
  current model replaces it with that provider's own first option — so with
  Claude and Codex both enabled, picking a Codex model and writing `model` alone
  silently reverts. `setDefaultModel` points `settingsProvider` at the owner,
  calls `applyModelDefaults`, and persists the projection maps through
  `persistProjectedProviderState`. The owner comes from the SELECTED OPTION, not
  from re-inferring it from the model id: two providers can advertise the same
  custom id, and `resolveProviderForModel` prefers a non-current owner, so
  inference could commit the pick to the provider the user wasn't choosing —
  which is also why `modelOptions` carries `providerId` and is not deduped by
  value. The model field is deliberately NOT bound through `useAppSetting`:
  that setter persists on its own, and `saveSettings` itself re-runs
  `persistProjectedProviderState` for the CURRENT provider, so a second
  unordered save could stamp the pick onto the outgoing provider's projection.
- **A CLI-path change recycles live runtimes.** `setCliPath` calls the shared
  `broadcastCliPathRuntimeCleanup` the provider CLI-path widgets use: a
  persistent Codex/Cursor/OpenCode process already holds the OLD executable, so
  without it the card would read "detected" while live chats kept spawning the
  previous binary. That helper iterates `getAllViews()` (it used to clean only
  `getView()`, silently leaving secondary leaves on the old executable — fixed
  for the provider settings widgets too). Provider-specific invalidation runs
  through `ProviderRegistration.onCliPathChanged`, called BEFORE the save so one
  write persists both: OpenCode drops its discovered model/mode catalog there,
  since a different binary may not support the old models. The hook exists
  because that cleanup lives in a provider-internal module the features layer
  cannot import — and a `providerId === 'opencode'` branch here would trip
  `noHardcodedProviderList`.
- **Provider metadata comes from the registry.** `cliInstall` lives on each
  `ProviderRegistration` (like `firstRunBlurb` / `cliCommand` before it — see
  tech-debt 2026-06-07); a feature-level `{claude: …, codex: …}` table would trip
  the `noHardcodedProviderList` guard. `providerRegistrationContract.test.ts`
  requires every provider to offer at least one install method per platform.

## Tests

`tests/unit/features/onboarding/` (detection, install runner, settings writers,
first-run trigger) and `tests/vue/onboarding/` (root/rail navigation, providers
step, install panel, the config steps, and the store). The install metadata
contract lives in `tests/unit/core/providers/providerRegistrationContract.test.ts`.
