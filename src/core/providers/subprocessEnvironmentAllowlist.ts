/**
 * Subprocess environment for providers that spawn a CLI subprocess (Cursor,
 * Opencode, Codex). These providers spread the FULL host environment onto the
 * child — parity with the Claude SDK spawn, which uses
 * `{ ...process.env, PATH: enhancedPath }`. A GUI-launched host (Obsidian /
 * Electron) otherwise hands its CLI child an impoverished environment whose own
 * shell tool then can't resolve host binaries (git/node "not on PATH"). The one
 * hard filter kept is the denylist kill-switch below; provider API keys and MCP
 * secrets live in Obsidian SecretStorage, never in the process environment.
 */

/**
 * Keys we always refuse to forward. Acts as a kill-switch.
 *
 * Matched case-insensitively because Windows env-var names are themselves
 * case-insensitive: `process.env.node_tls_reject_unauthorized` and
 * `process.env.NODE_TLS_REJECT_UNAUTHORIZED` refer to the same OS variable on
 * Windows. An exact-case check would let a user enter the lowercase form in the
 * provider custom env (or the host carry it pre-canonicalized) and re-enable the
 * TLS bypass this kill-switch blocks. On POSIX names are case-sensitive, but no
 * legitimate variable collides case-insensitively with the canonical name here.
 */
export const SUBPROCESS_ENV_DENYLIST: ReadonlySet<string> = new Set([
  'NODE_TLS_REJECT_UNAUTHORIZED',
]);

const SUBPROCESS_ENV_DENYLIST_UPPER: ReadonlySet<string> = new Set(
  [...SUBPROCESS_ENV_DENYLIST].map((k) => k.toUpperCase()),
);

function isDeniedKey(key: string): boolean {
  return SUBPROCESS_ENV_DENYLIST_UPPER.has(key.toUpperCase());
}

export interface BuildSubprocessEnvironmentOptions {
  processEnv: Record<string, string | undefined>;
  customEnv: Record<string, string>;
  /** Optional override of the PATH key — providers enhance PATH (node/git dirs). */
  pathOverride?: string;
}

/**
 * Full host-environment passthrough (Claude-parity). Spreads every processEnv
 * then customEnv key; the ALLOWLIST that used to gate this was removed so no
 * provider hits a missing-var/PATH problem the Claude integration doesn't. Only
 * the denylist kill-switch is enforced, and PATH is overridden + collapsed to a
 * single canonical key so a Windows child can't resolve the un-enhanced `Path`.
 */
export function buildFullSubprocessEnvironment(
  opts: BuildSubprocessEnvironmentOptions,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.processEnv)) {
    if (value === undefined || isDeniedKey(key)) continue;
    out[key] = value;
  }
  // customEnv (provider settings → Environment) is user-opt-in; the denylist
  // still applies so it can't re-enable the TLS bypass.
  for (const [key, value] of Object.entries(opts.customEnv)) {
    if (isDeniedKey(key)) continue;
    out[key] = value;
  }
  if (opts.pathOverride !== undefined) {
    // Delete every case-variant first so the override is the sole PATH key.
    // Overwriting `out.PATH` in place would leave its original insertion
    // position, so a later-inserted differently-cased `Path` would win the
    // collapse below and discard the enhanced override.
    deleteCaseVariants(out, 'PATH');
    out.PATH = opts.pathOverride;
  }
  collapseDuplicatePathKeys(out);
  return out;
}

function deleteCaseVariants(env: Record<string, string>, canonical: string): void {
  const upper = canonical.toUpperCase();
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === upper) {
      delete env[key];
    }
  }
}

/**
 * Windows env-var names are case-insensitive, so `process.env` carries `Path`
 * while a `pathOverride` (or a customEnv entry) writes `PATH`. Shipping BOTH
 * case-variants to the child means its shell resolves PATH case-insensitively
 * and may pick the un-enhanced `Path`, silently discarding the override. When
 * two or more variants exist, collapse them onto a single canonical `PATH`
 * holding the last-written value (preserving pathOverride/customEnv precedence).
 * A lone PATH key of any casing is left untouched.
 */
function collapseDuplicatePathKeys(env: Record<string, string>): void {
  const pathKeys = Object.keys(env).filter((key) => key.toUpperCase() === 'PATH');
  if (pathKeys.length < 2) {
    return;
  }
  const winner = env[pathKeys[pathKeys.length - 1]];
  deleteCaseVariants(env, 'PATH');
  env.PATH = winner;
}
