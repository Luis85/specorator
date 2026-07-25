/**
 * The provider-CLI-on-disk contracts: how Specorator FINDS a provider's CLI
 * (`ProviderCliResolver`) and how a user INSTALLS it (`ProviderCliInstall`).
 * Extracted from `types.ts` — one concern, two halves the onboarding setup view
 * uses together (probe, then offer an install for what is missing).
 */

/** Resolves a provider's CLI path from settings; memoizing implementations honor `reset()`. */
export interface ProviderCliResolver {
  resolveFromSettings(settings: Record<string, unknown>): string | null;
  reset(): void;
}

/**
 * One way to install a provider's CLI.
 *
 * `argv` is the security boundary for the onboarding installer: a method with a
 * non-null `argv` is spawned with `shell: false` and these exact, statically
 * declared arguments, so nothing user-supplied can reach a shell. A method
 * whose real install is a piped shell script (`curl … | bash`) MUST declare
 * `argv: null` — it then renders as a copyable command plus a docs link instead
 * of gaining a hidden `shell: true` execution path.
 */
export interface ProviderCliInstallMethod {
  /** Stable id (`npm`, `native`, …) — used as the UI key, never shown raw. */
  id: string;
  /** Short human label, e.g. `npm (global)`. */
  label: string;
  /** The command as a user would type it; shown in the UI and copyable. */
  displayCommand: string;
  /** Shell-free argv the installer may spawn, or `null` for copy-only methods. */
  argv: { command: string; args: readonly string[] } | null;
  /** `process.platform` values this method applies to; omitted means all. */
  platforms?: readonly NodeJS.Platform[];
}

/** Provider-contributed CLI install guidance for the onboarding setup view. */
export interface ProviderCliInstall {
  /** Install/auth documentation. Must be `https://` — the UI refuses to link anything else. */
  docsUrl: string;
  /** Command the user runs once to sign the CLI in, e.g. `claude` or `agent login`. */
  authCommand: string;
  /**
   * Additional binary names that satisfy this provider beyond `cliCommand`
   * (Cursor ships both `cursor-agent` and `agent`). Used only by the onboarding
   * fallback probe — the provider's own `ProviderCliResolver` stays
   * authoritative whenever workspace services are initialized.
   */
  extraBinaryNames?: readonly string[];
  methods: readonly ProviderCliInstallMethod[];
}
