import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import type { ProviderId } from '@/core/providers/types';
import type { PluginContext } from '@/core/types/PluginContext';
import { asSettingsBag } from '@/core/types/settings';
import { findBinaryOnPath } from '@/utils/cliBinaryLocator';

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

export interface ProviderCliDetection {
  providerId: ProviderId;
  displayName: string;
  blurb: string;
  cliCommand: string;
  status: ProviderCliStatus;
  /** Resolved absolute binary path when `status === 'found'`. */
  cliPath: string | null;
  enabled: boolean;
}

/** Binary names that satisfy a provider, most canonical first. */
function binaryCandidates(providerId: ProviderId): string[] {
  const primary = ProviderRegistry.getCliCommand(providerId);
  const extra = ProviderRegistry.getCliInstall(providerId).extraBinaryNames ?? [];
  const bases = [primary, ...extra];
  if (process.platform !== 'win32') {
    return bases;
  }
  // GUI-launched Electron sees npm/installer shims, not bare names, on Windows.
  return bases.flatMap((name) => [name, `${name}.cmd`, `${name}.exe`, `${name}.bat`]);
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
 *   probe is the authoritative answer, not a fallback.
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
    enabled: ProviderRegistry.isEnabled(providerId, settings),
  };
  const spawnsBareCommand = ProviderRegistry
    .getCliInstall(providerId).runtimeFallsBackToPathLookup === true;

  const resolver = ProviderWorkspaceRegistry.getCliResolver(providerId);
  if (resolver) {
    resolver.reset();
    const resolved = resolver.resolveFromSettings(settings);
    if (resolved) {
      return { ...base, status: 'found', cliPath: resolved };
    }
    if (!spawnsBareCommand) {
      return { ...base, status: 'missing', cliPath: null };
    }
  } else if (!spawnsBareCommand) {
    return { ...base, status: 'unknown', cliPath: null };
  }

  const onPath = findBinaryOnPath(binaryCandidates(providerId));
  if (onPath) {
    return { ...base, status: 'found', cliPath: onPath };
  }
  // Nothing found: `missing` only when a resolver also looked, so an
  // uninitialized workspace never hardens into a false negative.
  return { ...base, status: resolver ? 'missing' : 'unknown', cliPath: null };
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
