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

/**
 * A file form a provider's spawn can launch beyond executing the file itself.
 * `windows-batch` = `.cmd`/`.bat` through cmd.exe (Windows-only by nature);
 * `node` = a Node entry point prefixed with the Node executable, on every
 * platform.
 */
export type ProviderLaunchForm = 'windows-batch' | 'node';

/** Provider-contributed CLI install guidance for the onboarding setup view. */
export interface ProviderCliInstall {
  /** Install/auth documentation. Must be `https://` — the UI refuses to link anything else. */
  docsUrl: string;
  /** Command the user runs once to sign the CLI in, e.g. `claude` or `agent login`. */
  authCommand: string;
  /**
   * Additional binary names that satisfy this provider beyond `cliCommand`
   * (Cursor ships both `cursor-agent` and `agent`). Used by the onboarding
   * PATH probe.
   */
  extraBinaryNames?: readonly string[];
  /**
   * True when the runtime spawns the BARE `cliCommand` if no path resolves
   * (`getResolvedProviderCliPath(id) ?? 'opencode'`), letting the OS resolve it
   * from PATH at spawn time.
   *
   * This is what tells onboarding how to read a `null` from the provider's
   * resolver. OpenCode's resolver is configured-paths-only by design, and
   * Codex's launch spec spawns `resolvedCliCommand?.trim() || 'codex'`, so for
   * both a `null` means "no pin, will use PATH" — reporting that as missing
   * would call a perfectly working install broken (and would keep saying so
   * after a successful in-app install). Providers whose runtime instead REFUSES
   * to start without a resolved path (Claude, Cursor — their resolvers already
   * scan PATH themselves) leave this unset: for them a `null` is authoritative,
   * and a bare PATH hit found without a resolver proves nothing about usability.
   *
   * Declare what the LAUNCH path actually does, not what the resolver does. A
   * resolver that scans PATH does not make the runtime's fallback go away —
   * reading it as "so a null must mean absent" is what left Codex mis-declared,
   * offering to reinstall a CLI chat was launching fine.
   */
  runtimeFallsBackToPathLookup?: boolean;
  /**
   * What this provider's spawn can start BEYOND executing the file itself —
   * which differs per provider, so detection needs it declared rather than
   * guessed:
   *
   * - `windows-batch` — routes `.cmd`/`.bat` through cmd.exe
   *   (`utils/windowsSpawn`). Codex, Cursor and OpenCode spawn their own command
   *   and do this.
   * - `node` — rewrites a Node entry point to `node <script>`. Only Claude does,
   *   in `createCustomSpawnFunction`; conversely the SDK owns its stdio stream,
   *   so a cmd.exe wrapper is not available to it — which is why
   *   `findClaudeCLIPath` skips `.cmd` while probing and prefers `claude.exe`.
   *
   * `node` is deliberately NOT Windows-scoped: it changes what "launchable"
   * means on every platform. On POSIX the interpreter, not the kernel, opens the
   * file, so the script's own execute bit is irrelevant — `node script.js` runs a
   * 0644 file that `spawn()` would reject with EACCES. On Windows, where nothing
   * but `.exe`/`.com` starts on its own, it is the only reason a Node entry point
   * is launchable at all.
   *
   * Anything not covered — npm's extensionless POSIX sh shim, a `.ps1`, a Node
   * script under a provider that won't prefix Node — reaches `spawn()` raw and
   * fails. Nothing stops a user PINNING one of those by hand through the setup
   * view's path field, and npm installs exactly such files on Windows.
   */
  launchForms?: readonly ProviderLaunchForm[];
  methods: readonly ProviderCliInstallMethod[];
}

/**
 * The CLI-facing half of a `ProviderRegistration`, grouped here with the
 * resolver + install contracts it belongs with rather than scattered through
 * `types.ts`.
 */
export interface ProviderCliContract {
  /** CLI executable the provider requires on PATH. */
  cliCommand: string;
  /** How the onboarding setup view installs, authenticates, and documents this CLI. */
  cliInstall: ProviderCliInstall;
  /**
   * Invalidates provider state that a CLI-path change makes stale, called
   * BEFORE the settings save so one write persists both. Mutates the settings
   * bag; returns whether anything changed.
   *
   * Exists because that cleanup is provider-specific (OpenCode drops its
   * discovered model/mode catalog — a new binary may not support the old
   * models) and lives in a provider-internal module the features layer cannot
   * import. Onboarding's manual-path field routes through this hook so it gets
   * the same invalidation as the provider's own settings widget.
   */
  onCliPathChanged?(settings: Record<string, unknown>): boolean;
}
