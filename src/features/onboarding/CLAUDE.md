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
| `cliInstallRunner.ts` | `runCliInstall` (shell-free `spawn` of a provider-declared argv, streamed output, cancel, 10-min timeout), `appendInstallOutput` (bounded line ring), `platformInstallMethods` |
| `onboardingSettings.ts` | Every settings write the flow performs: provider enable, host-scoped CLI path pin, `setDefaultModel` (commits a model to its OWNING provider), the five folder settings (+ `ensureOnboardingFolders` / `readOnboardingFolders`), the enumerated scalar keys, and `completeOnboarding` / `isOnboardingComplete` |
| `onboardingSteps.ts` | `ONBOARDING_STEPS` order + label keys |
| `maybeOpenOnboarding.ts` | `shouldOpenOnboarding` (first-run predicate over `onboardingAutoOpened` + `firstRunDismissed` + provider-enabled state) + the activation wrapper called from `PluginLifecycle.runDeferredStartup()` |
| `OnboardingView.ts` / `activateOnboarding.ts` / `viewType.ts` | `ItemView` host (per-leaf Vue app via the shared `mountLeafIsland`), main-area leaf activation, view-type constant |
| `vue/OnboardingRoot.vue` | Header + `StepRail` + step router + footer (Back / Next / Finish). Dismissing completes the flow |
| `vue/components/StepRail.vue` | Free-navigable step rail (`role="navigation"` + `aria-current="step"`, deliberately not an ARIA tablist) |
| `vue/components/ProvidersStep.vue` / `ProviderCard.vue` | Detected providers first; per-card status badge, resolved path, enable toggle, auth hint, install panel, manual-path escape hatch |
| `vue/components/InstallPanel.vue` / `InstallConfirm.vue` / `InstallOutcome.vue` | Method picker + copyable command + run/cancel; the explicit pre-spawn confirm; the result line + bounded console |
| `vue/components/DefaultsStep.vue` | Default model (grouped per enabled provider), tool-approval mode, auto-titles |
| `vue/components/FoldersStep.vue` | The five vault folders with exists / will-create / unconfigured badges and a create-missing action |
| `vue/components/WorkspaceStep.vue` | Chat placement + max chat tabs (bounds mirror the General tab slider) |
| `vue/components/MarketplaceStep.vue` | Network opt-in (routed through the shared one-time warning) + a deep link to the Marketplace |
| `vue/components/FinishStep.vue` | Enabled-provider summary; completes the flow and opens chat |
| `vue/stores/onboardingStore.ts` | Reactive projection over detection + the install runner + the settings writers. `runFor(providerId)` is the per-provider run accessor |
| `vue/useAppSetting.ts` | `[ref, setter]` binding for one top-level setting (a tuple, because a ref nested in a returned object is not unwrapped in templates) |
| `vue/onboardingKeys.ts` / `createOnboardingPinia.ts` | `PLUGIN_KEY` + `CLOSE_VIEW_KEY`; a FRESH Pinia per leaf |

## Contracts & invariants

- **Detection uses the provider's own resolver, and resets it first.** What the
  setup view reports is exactly what the runtime will find at spawn time — not a
  second search path that can drift. `CachedCliResolver` memoizes on a
  settings-derived key and an install changes no setting, so without the
  `reset()` a cached `null` would outlive the install that fixed it and the card
  would stay stuck on "not found". A provider with no workspace resolver yet
  (services initialize on `onLayoutReady`) reports `unknown`, **never**
  `missing` — claiming a CLI is absent when we could not properly look is worse
  than admitting we don't know.
- **The install `argv` IS the security model.** `ProviderRegistration.cliInstall`
  declares each method's `argv` statically; the runner spawns it with **no
  shell**, so there is no command string for anything to be interpolated into. A
  method whose real install is a piped script (`curl … | bash`, `irm … | iex`)
  MUST declare `argv: null` — the runner refuses it and the UI renders a
  copyable command plus docs link instead of gaining a hidden `shell: true`
  path. Cursor is entirely copy-only for this reason. Further rails: an explicit
  per-run confirm naming the exact command, a bounded output ring, a 10-minute
  timeout, cancel-kills-child, `onUnmounted` cancels so a closed leaf leaves no
  orphan child, `npm.cmd` resolution + the `cmd.exe` verbatim wrap on win32
  (Node's CVE-2024-27980 batch-shim refusal), and `buildFullSubprocessEnvironment`
  with the enhanced PATH (a GUI-launched host's PATH cannot find `npm`).
- **`yolo` is not offered.** The defaults step exposes `normal` and `plan` only;
  bypassing tool approval stays an explicit toolbar toggle behind its one-time
  warning (SEC-1), which a setup wizard has no business short-circuiting. The
  Marketplace opt-in likewise routes through the SAME
  `maybeWarnMarketplaceNetwork` notice the view and settings tab use, so the
  network disclosure can't be skipped by entering through onboarding.
- **The wizard is a view over settings, not a staging buffer.** Every control
  persists through `plugin.saveSettings()` the moment it is touched, so
  abandoning the flow keeps exactly what was already confirmed and reopening it
  shows live state. Consequence: `useAppSetting` reads once at mount and writes
  on change — it does not watch `plugin.settings` (a plain non-reactive object).
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
- **The auto-open survives a broken startup.** `PluginLifecycle.runDeferredStartup`
  sequences it with an unconditional continuation after `completeDeferredOnload`
  rather than chaining onto its success: that method bails out when provider
  workspace init fails and can reject when a cache hydration throws, and a vault
  where that happens is exactly where the setup view is most needed (detection
  already degrades to `unknown` without workspace services).
- **A model choice is committed to the provider that owns it.** Writing only the
  top-level `model` does not survive: `ProviderSettingsCoordinator` projects
  per-provider state, and projecting a provider that doesn't own the current
  model replaces it with that provider's own first option — so with Claude and
  Codex both enabled, picking a Codex model and writing `model` alone silently
  reverts. `setDefaultModel` therefore points `settingsProvider` at the owner,
  calls `applyModelDefaults`, and persists the projection maps through
  `persistProjectedProviderState`.
- **A CLI-path change recycles live runtimes.** `setCliPath` calls the shared
  `broadcastCliPathRuntimeCleanup` the provider CLI-path widgets use: a
  persistent Codex/Cursor/OpenCode process already holds the OLD executable, so
  without it the card would read "detected" while live chats kept spawning the
  previous binary. Residual: OpenCode's widget additionally clears its
  discovery state (model/mode catalog) through a provider-internal helper the
  features layer cannot reach, so an OpenCode path change made here can leave a
  stale model list until the next discovery — closing that needs a
  registration-level "CLI path changed" hook, not a provider import.
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
