import { getProviderConfig } from '@/core/providers/providerConfig';
import { getRuntimeEnvironmentVariables } from '@/core/providers/providerEnvironment';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { ProviderId } from '@/core/providers/types';
import type { PluginContext } from '@/core/types/PluginContext';
import { asSettingsBag } from '@/core/types/settings';
import {
  executableCandidateNames,
  findBinaryOnPath,
  isExecutableFile,
  isExistingFile,
} from '@/utils/cliBinaryLocator';
import { getHostnameKey } from '@/utils/env';

/**
 * `found` — a binary the runtime would actually spawn.
 * `missing` — the provider's own resolver looked and came up empty.
 * `unknown` — nothing authoritative could look yet (workspace services are
 *   initialized on `onLayoutReady`, and a provider whose init failed has none),
 *   so the fallback PATH probe is all we have. Never reported as `missing`:
 *   telling a user their CLI is absent when we could not properly look is worse
 *   than admitting we don't know.
 */
export type ProviderCliStatus = 'found' | 'missing' | 'unknown';

/**
 * Why nothing authoritative could look, so the card can explain instead of
 * shrugging — and so it can offer the RIGHT remedy (an install helps a missing
 * CLI; it helps neither of these).
 */
export type ProviderCliUnknownReason =
  /** Workspace services (and with them the provider's resolver) aren't up. */
  | 'no-resolver'
  /** The resolver named a command that runs somewhere this host can't stat. */
  | 'external-target';

export interface ProviderCliDetection {
  providerId: ProviderId;
  displayName: string;
  blurb: string;
  cliCommand: string;
  status: ProviderCliStatus;
  /** Resolved absolute binary path when `status === 'found'`. */
  cliPath: string | null;
  /** Set only when `status === 'unknown'`. */
  unknownReason?: ProviderCliUnknownReason;
  /**
   * A path that exists but cannot be executed — set with `status === 'missing'`
   * so the card can name it instead of claiming nothing is there.
   */
  unusablePath?: string;
  /**
   * The path pinned for THIS host, if any — distinct from `cliPath`, which may
   * have come from a PATH scan. The manual-path editor shows it so a wrong pin
   * can be corrected or cleared without leaving Setup.
   */
  pinnedPath: string | null;
  enabled: boolean;
}

/**
 * Binary names that satisfy a provider, most canonical first — the primary
 * command plus any provider-declared aliases, each in the forms the platform can
 * actually execute (`executableCandidateNames`, shared with the installer's own
 * package-manager lookup).
 */
export function binaryCandidates(
  providerId: ProviderId,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const primary = ProviderRegistry.getCliCommand(providerId);
  const extra = ProviderRegistry.getCliInstall(providerId).extraBinaryNames ?? [];
  return [primary, ...extra].flatMap((name) => executableCandidateNames(name, platform));
}

/**
 * The host-scoped pin `setProviderCliPathForHost` writes, read back through the
 * same generic provider-config shape so the editor can show and clear it.
 */
function pinnedCliPath(
  settings: Record<string, unknown>,
  providerId: ProviderId,
): string | null {
  const byHost = getProviderConfig(settings, providerId).cliPathsByHost;
  if (!byHost || typeof byHost !== 'object' || Array.isArray(byHost)) {
    return null;
  }
  const pinned = (byHost as Record<string, unknown>)[getHostnameKey()];
  return typeof pinned === 'string' && pinned.trim() ? pinned : null;
}

/**
 * The PATH override the provider's own runtime will search, taken from the same
 * place its resolver does: the shared + provider-scoped environment text.
 *
 * A CLI installed only under a provider-scoped `PATH=` entry is genuinely
 * launchable — `OpencodeChatRuntime` builds its subprocess env from exactly this
 * — so probing the host PATH alone would report a working install as missing.
 * Read from settings rather than `plugin.getResolvedEnvironmentVariables`: that
 * one resolves SecretStorage refs and warns about missing ones, which a probe
 * that reruns on every card interaction must not do.
 */
function providerPathOverride(
  settings: Record<string, unknown>,
  providerId: ProviderId,
): string | undefined {
  const env = getRuntimeEnvironmentVariables(settings, providerId);
  // Windows env names are case-insensitive, so the override may arrive as `Path`.
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH');
  return key ? env[key] : undefined;
}

/**
 * Probes one provider's CLI the way that provider's RUNTIME will at spawn time,
 * so the setup view can't report something the runtime disagrees with.
 *
 * Two provider shapes, distinguished by `cliInstall.runtimeFallsBackToPathLookup`:
 *
 * - **Runtime needs a resolved path** (Claude, Codex, Cursor). Their resolvers
 *   already scan PATH, so a `null` is authoritative → `missing`. With no
 *   resolver at all (workspace init failed, or hasn't run), a bare PATH hit
 *   proves nothing — `getResolvedProviderCliPath` still returns `null` and the
 *   runtime refuses to start — so that stays `unknown` rather than a `found`
 *   that would promise a provider the user can't actually use.
 * - **Runtime spawns the bare command** (OpenCode). Its resolver is
 *   configured-paths-only by design, so `null` means "no pin, use PATH" and the
 *   probe is the authoritative answer, not a fallback. That probe searches the
 *   provider's own runtime PATH, not just the host's.
 *
 * A resolved value is only `found` once it is confirmed to be an EXECUTABLE file
 * on THIS host. One that exists but lacks `+x` would fail at spawn, so it is
 * `missing` with the offending path named (`unusablePath`); one that isn't a host
 * file at all (Codex in WSL mode names a command inside the distro) is
 * `unknown`/`external-target` rather than a promise we can't check.
 *
 * `reset()` before probing: `CachedCliResolver` memoizes on a settings-derived
 * key, and an install changes no setting, so a cached `null` would otherwise
 * outlive the install that fixed it and the card would stay stuck on "not found".
 */
export function detectProviderCli(
  plugin: PluginContext,
  providerId: ProviderId,
): ProviderCliDetection {
  const settings = asSettingsBag(plugin.settings);
  const base = {
    providerId,
    displayName: ProviderRegistry.getProviderDisplayName(providerId),
    blurb: ProviderRegistry.getFirstRunBlurb(providerId),
    cliCommand: ProviderRegistry.getCliCommand(providerId),
    pinnedPath: pinnedCliPath(settings, providerId),
    enabled: ProviderRegistry.isEnabled(providerId, settings),
  };
  const spawnsBareCommand = ProviderRegistry
    .getCliInstall(providerId).runtimeFallsBackToPathLookup === true;

  const resolver = ProviderWorkspaceRegistry.getCliResolver(providerId);
  if (resolver) {
    resolver.reset();
    const resolved = resolver.resolveFromSettings(settings);
    if (resolved && isExecutableFile(resolved)) {
      return { ...base, status: 'found', cliPath: resolved };
    }
    if (resolved && isExistingFile(resolved)) {
      // The file is right there but cannot be run (no `+x` — a partially
      // installed or copied script), so the runtime would fail with EACCES.
      // Reported as a confirmed problem with the path named, rather than as a
      // bare "not found" that sends the user looking for a file they have.
      return { ...base, status: 'missing', cliPath: null, unusablePath: resolved };
    }
    if (resolved) {
      // A resolver can name a command that does not exist on THIS host: Codex in
      // WSL mode resolves to `codex` (or a configured Linux path), which the
      // runtime hands to `wsl.exe` to run inside the guest. Verifying it would
      // mean spawning a subprocess into the distro, and probing the host PATH
      // would answer a different question — so admit we don't know instead of
      // promising a ready provider (and instead of offering a host install that
      // would not reach the guest anyway).
      return { ...base, status: 'unknown', unknownReason: 'external-target', cliPath: null };
    }
    if (!spawnsBareCommand) {
      return { ...base, status: 'missing', cliPath: null };
    }
  } else if (!spawnsBareCommand) {
    return { ...base, status: 'unknown', unknownReason: 'no-resolver', cliPath: null };
  }

  const onPath = findBinaryOnPath(
    binaryCandidates(providerId),
    providerPathOverride(settings, providerId),
  );
  if (onPath) {
    return { ...base, status: 'found', cliPath: onPath };
  }
  // Nothing found: `missing` only when a resolver also looked, so an
  // uninitialized workspace never hardens into a false negative.
  return resolver
    ? { ...base, status: 'missing', cliPath: null }
    : { ...base, status: 'unknown', unknownReason: 'no-resolver', cliPath: null };
}

/**
 * Probes every registered provider, detected ones first — the setup view's
 * "installed providers on top" ordering. Ties keep registration order so the
 * list is stable across re-probes (a sort keyed only on status would let equal
 * elements shuffle and cards jump under the user's cursor).
 */
export function detectProviderClis(plugin: PluginContext): ProviderCliDetection[] {
  const statusRank: Record<ProviderCliStatus, number> = { found: 0, unknown: 1, missing: 2 };
  const detections = ProviderRegistry.getRegisteredProviderIds()
    .map((providerId) => detectProviderCli(plugin, providerId));
  const registryOrder = new Map(
    ProviderRegistry.getRegisteredProviderIds().map((id, index) => [id, index]),
  );

  return detections.sort((a, b) => (
    statusRank[a.status] - statusRank[b.status]
    || (registryOrder.get(a.providerId) ?? 0) - (registryOrder.get(b.providerId) ?? 0)
  ));
}
