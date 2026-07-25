import type { ProviderLaunchForm } from '@/core/providers/cliInstall';
import { getProviderConfig } from '@/core/providers/providerConfig';
import { getRuntimeEnvironmentVariables } from '@/core/providers/providerEnvironment';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { pickEnvValueCaseInsensitive } from '@/core/providers/subprocessEnvironmentAllowlist';
import type { ProviderId } from '@/core/providers/types';
import type { PluginContext } from '@/core/types/PluginContext';
import { asSettingsBag } from '@/core/types/settings';
import {
  executableCandidateNames,
  findBinaryOnPath,
  isExecutableFile,
  isExistingFile,
} from '@/utils/cliBinaryLocator';
import {
  cliPathRequiresNode,
  findNodeExecutable,
  getEnhancedPath,
  getHostnameKey,
} from '@/utils/env';

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

/** Why a file that is genuinely there still cannot be launched. */
export type ProviderCliUnusableReason =
  /** No execute permission — the spawn would fail with `EACCES`. */
  | 'not-executable'
  /** A Windows `.cmd`/`.bat` this provider's launch path cannot run. */
  | 'batch-shim'
  /** A Windows file in no form this provider can start (sh shim, `.ps1`, …). */
  | 'unsupported-form'
  /** A Node-backed entry point with no Node interpreter to run it. */
  | 'missing-node';

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
   * A real file the runtime still could not launch — set with
   * `status === 'missing'` so the card can name it, and say WHY, instead of
   * claiming nothing is there.
   */
  unusable?: { path: string; reason: ProviderCliUnusableReason };
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

/** Native Windows executables — every provider can spawn these directly. */
const WINDOWS_NATIVE_EXTENSIONS = /\.(exe|com)$/i;

/**
 * A path this provider's WINDOWS launch path cannot start, whatever the
 * filesystem says.
 *
 * Windows has no shebang support, so what runs is decided by how the provider
 * spawns: a native `.exe` always works, `.cmd`/`.bat` need the cmd.exe wrap, and
 * a Node entry point needs the Node prefix — and providers differ, so each
 * declares its `launchForms` rather than the feature layer guessing.
 * Everything else (npm's extensionless POSIX sh shim, a `.ps1`, a Node script
 * under a provider that won't prefix Node) reaches `spawn()` raw and fails, and
 * `isExecutableFile` cannot catch any of it because `X_OK` is an existence check
 * on Windows. The setup view's own path field is what makes such a pin reachable.
 */
function unusableReason(
  providerId: ProviderId,
  resolved: string,
  platform: NodeJS.Platform = process.platform,
): ProviderCliUnusableReason | null {
  if (platform !== 'win32') {
    return null;
  }
  const trimmed = resolved.trim();
  if (WINDOWS_NATIVE_EXTENSIONS.test(trimmed)) {
    return null;
  }
  if (/\.(cmd|bat)$/i.test(trimmed)) {
    return launchForms(providerId).includes('windows-batch') ? null : 'batch-shim';
  }
  return isNodeLaunched(providerId, trimmed) ? null : 'unsupported-form';
}

/** What this provider's spawn can start beyond executing the file itself. */
function launchForms(providerId: ProviderId): readonly ProviderLaunchForm[] {
  return ProviderRegistry.getCliInstall(providerId).launchForms ?? [];
}

/**
 * True when this provider would launch this path as `node <script>` rather than
 * executing the file — which decides which question "launchable" even is.
 */
function isNodeLaunched(providerId: ProviderId, resolved: string): boolean {
  return launchForms(providerId).includes('node') && cliPathRequiresNode(resolved);
}

/**
 * What a resolver's answer is actually worth.
 *
 * - `found` — a file this host can run and this provider's launch path accepts.
 * - `unusable` — a real file the runtime still could not launch. Named with its
 *   path rather than folded into a bare "not found", which would send the user
 *   looking for a file they can see.
 * - `external` — not a host file at all. Codex in WSL mode resolves to `codex`
 *   (or a configured Linux path) which the runtime hands to `wsl.exe` to run
 *   inside the guest; verifying that would mean spawning a subprocess into the
 *   distro, and probing the host PATH would answer a different question. Better
 *   to admit we don't know than to promise a ready provider — or to offer a host
 *   install that would never reach the guest.
 */
type ResolvedPathVerdict =
  | { kind: 'found' }
  | { kind: 'unusable'; reason: ProviderCliUnusableReason }
  | { kind: 'external' };

function classifyResolvedPath(
  providerId: ProviderId,
  resolved: string,
  runtimePath: string | undefined,
): ResolvedPathVerdict {
  const rejected = unusableReason(providerId, resolved);
  if (rejected) {
    return { kind: 'unusable', reason: rejected };
  }
  if (!isExistingFile(resolved)) {
    return { kind: 'external' };
  }

  // A Node-backed entry point under a provider that rewrites it to
  // `node <script>` is opened by the INTERPRETER, not the kernel, so the
  // script's own execute bit decides nothing: `node cli.js` runs a 0644 file
  // that `spawn()` would reject with EACCES. Asking `X_OK` here would report a
  // hand-pinned, perfectly working Claude entry point as broken and offer a
  // reinstall for it. What must hold instead is that Node is reachable — the
  // runtime refuses to start without it (`getMissingNodeError`, checked on both
  // the persistent and cold paths).
  //
  // The interpreter is searched on the SAME path the runtime builds for the
  // spawn — `getEnhancedPath(customPath, cliPath)` also adds the CLI's own
  // directory, so a Node shipped beside the CLI counts, exactly as it does at
  // launch. Searching the bare runtime PATH would report `missing-node` for a
  // bundle the runtime launches fine.
  const nodeReachable = (): boolean => (
    findNodeExecutable(getEnhancedPath(runtimePath, resolved)) !== null
  );
  if (isNodeLaunched(providerId, resolved)) {
    return nodeReachable() ? { kind: 'found' } : { kind: 'unusable', reason: 'missing-node' };
  }

  // Everything else the kernel opens itself, so the permission bit is the
  // question — and for a `#!…node` script that the provider spawns directly,
  // the shebang's interpreter must be reachable on top of it.
  if (!isExecutableFile(resolved)) {
    return { kind: 'unusable', reason: 'not-executable' };
  }
  return cliPathRequiresNode(resolved) && !nodeReachable()
    ? { kind: 'unusable', reason: 'missing-node' }
    : { kind: 'found' };
}

/** The identity half of a detection, before anything is known about the binary. */
type DetectionBase = Omit<
  ProviderCliDetection,
  'status' | 'cliPath' | 'unknownReason' | 'unusable'
>;

/**
 * Turns ONE candidate path into the detection it justifies.
 *
 * Both ways a candidate arrives — the provider's resolver and the PATH probe —
 * go through here, so a launchability rule cannot end up applying to only one of
 * them. Every rule added so far was first written on the resolver branch alone
 * and then had to be extended to the probe.
 */
function detectionForCandidate(
  base: DetectionBase,
  providerId: ProviderId,
  candidate: string,
  runtimePath: string | undefined,
): ProviderCliDetection {
  const verdict = classifyResolvedPath(providerId, candidate, runtimePath);
  if (verdict.kind === 'found') {
    return { ...base, status: 'found', cliPath: candidate };
  }
  if (verdict.kind === 'unusable') {
    return {
      ...base,
      status: 'missing',
      cliPath: null,
      unusable: { path: candidate, reason: verdict.reason },
    };
  }
  return { ...base, status: 'unknown', unknownReason: 'external-target', cliPath: null };
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
  // Windows env names are case-insensitive, so the override may arrive as `Path`
  // — and when the shared env declares `PATH=` and the provider's own declares
  // `Path=`, LAST wins, which is what the runtime's own env builder does. Picking
  // the first would search the shared path while the runtime searched the
  // provider one.
  return pickEnvValueCaseInsensitive(getRuntimeEnvironmentVariables(settings, providerId), 'PATH');
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
 * Whichever way a candidate arrives — resolver or probe — it becomes a detection
 * through `detectionForCandidate`, so the launchability rules apply to both. A
 * candidate is only `found` once it is a file this host can run, with whatever
 * interpreter it needs, and this provider's launch path accepts. One that exists
 * but lacks `+x`, needs an unreachable Node, or is a Windows batch shim under a
 * provider that cannot spawn one, is `missing` with the offending path and the
 * reason named (`unusable`); one that isn't a host file at all (Codex in WSL mode
 * names a command inside the distro) is `unknown`/`external-target` rather than a
 * promise we can't check.
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
  const runtimePath = providerPathOverride(settings, providerId);

  const resolver = ProviderWorkspaceRegistry.getCliResolver(providerId);
  if (resolver) {
    resolver.reset();
    const resolved = resolver.resolveFromSettings(settings);
    if (resolved) {
      return detectionForCandidate(base, providerId, resolved, runtimePath);
    }
    if (!spawnsBareCommand) {
      return { ...base, status: 'missing', cliPath: null };
    }
  } else if (!spawnsBareCommand) {
    return { ...base, status: 'unknown', unknownReason: 'no-resolver', cliPath: null };
  }

  const onPath = findBinaryOnPath(binaryCandidates(providerId), runtimePath);
  if (onPath) {
    return detectionForCandidate(base, providerId, onPath, runtimePath);
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
