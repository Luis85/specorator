---
title: First-run onboarding — a guided setup view that detects, installs, and configures providers
date: 2026-07-25
status: accepted
scope: src/features/onboarding, src/core/providers (cliInstall metadata), src/providers/*/registration.ts, src/app/views, src/app/commands, src/features/settings/firstRunBanner, src/style/vue, src/i18n, tests/unit/features/onboarding, tests/vue/onboarding
relates-to: docs/adr/0006-settings-and-modals-stay-obsidian-native.md, docs/adr/0007-remote-marketplace-replaces-bundled-presets.md, docs/tech-debt/2026-06-07-firstrun-banner-provider-list.md, docs/product/user-manuals/install-claude.md
method: owner-directed design (2026-07-25) + codebase audit of the existing first-run path
---

# First-run onboarding setup view

## Context

Today the entire first-run experience is a small banner rendered **inside the
Settings → General tab** (`src/features/settings/firstRunBanner/FirstRunBanner.ts`),
shown only while `!firstRunDismissed && !hasAnyProviderEnabled`. It lists the
registered providers with a checkbox, the provider's `firstRunBlurb`, and the
`cliCommand` the user is told to already have on `PATH`.

Three gaps make a fresh install feel broken:

1. **It is hidden.** Nothing opens after install. A new user sees an empty chat
   with every provider disabled (`enabled: false` is the default for all four)
   and no signal that a CLI is even required.
2. **It does not look.** The plugin already owns robust CLI detection —
   `ProviderWorkspaceRegistry.getCliResolver(id)` wraps a per-provider
   `CachedCliResolver` that resolves the host-scoped configured path, the legacy
   path, then a PATH scan — but the banner never calls it. The user is asked to
   self-certify "requires this command on your path".
3. **It stops at the toggle.** Enabling a provider is necessary but not
   sufficient to be productive: the Agent Board folders, the Quick Actions
   folder, chat placement, default model/permission mode, and the (off by
   default) Marketplace network gate all still need visiting, each on a
   different settings tab.

## Decision

Ship a dedicated **Setup view** — `VIEW_TYPE_ONBOARDING`, a Vue 3 + Pinia
island in the **main workspace area** (not a sidebar leaf, not a modal) — that
opens itself **once** on the first plugin load in a vault and walks five steps.
ADR 0006 closed the Vue *migration* set but explicitly permits new view-level
product surfaces to choose the island pattern; this is one.

### Steps

| # | Step | What it does |
|---|------|--------------|
| 1 | **Providers** | Probes every registered provider's CLI. Detected providers sort to the top with their resolved binary path and a one-click enable. Missing ones offer an in-app install (below), a manual path field, and a docs link. |
| 2 | **Defaults** | Default model per enabled provider, permission mode (the safe `normal` default stated rather than hidden), auto-title generation. |
| 3 | **Vault folders** | Confirms/creates the four Agent Board folders + the Quick Actions folder, each editable, with a per-folder exists/will-create badge. |
| 4 | **Workspace** | Chat placement (right sidebar / main area) and max chat tabs. |
| 5 | **Marketplace** | Explains that catalog fetch is network-gated and off by default; offers to enable it and deep-links the Marketplace. |

A **Finish** panel closes the flow, marks it complete, and opens a chat tab.
Every step is skippable and the rail is free-navigable — nothing is a modal
trap. Leaving the view early changes nothing that was not already saved: each
control persists through the normal `plugin.saveSettings()` path as it is
touched, so the wizard is a *view over settings*, never a staging buffer.

### CLI detection

`detectProviderCli(plugin, providerId)` calls the provider's own
`ProviderCliResolver`, so detection is exactly what the runtime will do at spawn
time — no second, drifting search path. Two consequences:

- **A resolver `reset()` precedes every re-probe.** `CachedCliResolver` memoizes
  on a settings-derived key, so after an install (which changes no setting) a
  cached `null` would survive and the freshly installed CLI would read as still
  missing.
- **Detection degrades, never throws.** Workspace services are initialized on
  `onLayoutReady`; a probe that runs before that (or for a provider whose
  init failed) falls back to a direct `findBinaryOnPath` over the provider's
  `cliCommand` plus its declared extra binary names, and reports
  `status: 'unknown'` rather than a false "missing".

### In-app CLI install

Install metadata moves onto `ProviderRegistration` as `cliInstall` — the same
pattern that resolved the hardcoded-provider-list debt for `firstRunBlurb` /
`cliCommand` (tech-debt 2026-06-07). A feature-level `{claude: …, codex: …}`
table would trip the `noHardcodedProviderList` guard, and rightly so.

```ts
interface ProviderCliInstall {
  docsUrl: string;              // vetted https:// only at render time
  authCommand: string;          // shown as "sign in by running …"
  extraBinaryNames?: string[];  // Cursor also ships `agent`
  methods: ProviderCliInstallMethod[];
}
interface ProviderCliInstallMethod {
  id: string;                   // 'npm' | 'native' | …
  label: string;
  displayCommand: string;       // what the user sees and can copy
  argv: { command: string; args: readonly string[] } | null;
  platforms?: readonly NodeJS.Platform[];
}
```

**`argv` is the whole security model.** The runner spawns `argv.command` with
`argv.args` — a static, provider-contributed vector — with **`shell: false`**,
so there is no string to interpolate and nothing user-supplied reaches a shell.
Three providers therefore get a real one-click install (`npm install -g` for
`@anthropic-ai/claude-code`, `@openai/codex`, `opencode-ai`); Cursor's only
supported install is `irm … | iex` / `curl … | bash`, which *needs* a shell, so
its method carries `argv: null` and renders as copy-command + docs. Honest and
inert beats a hidden `shell: true`.

Guard rails on the runner: explicit per-provider confirm before the first
spawn, a bounded output ring (the console shows the tail, memory stays flat), a
10-minute timeout, a cancel that kills the child, `npm.cmd` resolution plus the
`cmd.exe` verbatim wrap on win32 (`wrapWindowsCmdShim`, Node's CVE-2024-27980
batch-shim refusal), env built by `buildFullSubprocessEnvironment` with the
enhanced PATH, and an automatic re-probe on exit so the card flips to
"detected" without a manual refresh.

### Trigger

Auto-open keys off the **existing** `firstRunDismissed` setting — no new flag,
and completing the wizard also retires the settings banner, since the banner's
condition is the same boolean. The open happens in `completeDeferredOnload`
(after `onLayoutReady`, so provider services exist and detection is real) and
only when the workspace has no restored Specorator leaf, so it cannot steal
focus from a user's saved layout. It is re-openable forever via the
`open-setup-guide` palette command and a button on the settings banner.

## Consequences

- The settings banner stays (it is the discoverable re-entry point) but becomes
  a two-line card whose primary action opens the view.
- `firstRunDismissed` now means "the setup flow has been completed or
  dismissed" for two consumers instead of one. The name is kept: renaming it
  would need a settings migration for zero user-visible gain.
- Provider authors gain one more required registration field (`cliInstall`),
  enforced by `providerRegistrationContract.test.ts`.
- The view is the first surface that spawns a *package manager*. It is opt-in
  per click, argv-only, and cancellable; the residual risk is the same one the
  user accepts by installing a global npm package in a terminal.
