import { promises as fsp } from 'node:fs';

import type { McpServerConfig } from '../../../core/types/mcp';
import type { PluginContext } from '../../../core/types/PluginContext';
import { TOOL_HOST_SOURCE } from '../../../tool-host/embeddedSource';
import type { CatalogPayload, ToolHostScan } from '../../../tool-host/types';
import { curateStdioMcpEnv, findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import { getClaudeProviderSettings, type ToolHostSecretRef } from '../settings';
import { buildToolHostServer } from './buildToolHostServer';
import { isSupportedNode, probeNodeMajor } from './nodeVersion';
import { catalogSecretsByFile, readCatalog, spawnCatalogRunner, unionSecretIds } from './ToolHostCatalog';
import { materializeToolHost } from './ToolHostMaterializer';
import { resolveToolHostPaths } from './toolHostPaths';

const DISABLED: ToolHostScan = {
  catalog: null,
  declaredSecretIds: [],
  toolSecretsByFile: {},
  materialized: false,
};

/**
 * Coerce a fan-out payload into a {@link ToolHostScan}. Accepts a full scan, a
 * bare {@link CatalogPayload} (legacy single-catalog fan-out), or null (disabled).
 */
export function normalizeToolHostScan(
  scan: ToolHostScan | CatalogPayload | null,
): ToolHostScan {
  if (scan === null) return DISABLED;
  if ('materialized' in scan) return scan;
  return {
    catalog: scan,
    declaredSecretIds: unionSecretIds(scan),
    toolSecretsByFile: catalogSecretsByFile(scan),
    materialized: true,
  };
}

/**
 * The runtime's mutable local-tool-host caches that a scan result updates.
 *
 * `hostNodePath`/`hostEnv` are the VALIDATED spawn parameters from the last
 * successful scan: the Node binary that passed the ≥18 probe and the curated env
 * it ran with. The sync per-turn builder reuses these instead of re-resolving Node
 * (it can't re-run the async probe), so a later PATH change pointing at an older
 * `node` is honored only on the NEXT scan — never injected mid-session. Cleared on
 * a disabled scan; preserved on a `scanFailed` scan.
 */
export interface ToolHostCacheState {
  hostMaterialized: boolean;
  toolsRev: number;
  declaredToolSecretIds: string[];
  /**
   * Cataloged per-tool secrets declaration (file → declared ids) from the last
   * successful scan. Kept in lockstep with `declaredToolSecretIds` (the union):
   * preserved together on `scanFailed`, cleared together when disabled, replaced
   * together on success. The host grants each tool secrets keyed off this map.
   */
  toolSecretsByFile: Record<string, string[]>;
  hostNodePath: string | null;
  hostEnv: Record<string, string> | null;
}

/**
 * Pure reducer for applying a scan to the runtime's tool-host caches. Three cases:
 * - `scanFailed`: leave caches UNTOUCHED — a transient catalog failure must not clobber
 *   a previously-good secret union with `[]` (silent secrets-drop), drop the validated
 *   node, or claim the host ready. Keeping `prev` verbatim also keeps the per-turn builder's
 *   serialized config BYTE-IDENTICAL, so the running host is not re-spawned on a transient
 *   blip (the alternative — clearing the union — would change the env, force a re-spawn, and
 *   strip secrets from an otherwise-healthy host). The stale per-file map cannot escalate a
 *   grant: if an unrelated restart re-spawns the host against edited files, the secret a tool
 *   receives is bounded by BOTH the user's fail-closed allowlist (buildToolHostServer) and the
 *   host's intersection with the file's CURRENT manifest (grantSecrets) — a stale entry can
 *   only narrow that set, never hand a tool a secret the user didn't allowlist or whose current
 *   code no longer declares it.
 * - disabled (not materialized / null catalog): clear the host AND the validated node
 *   (disabled or unsupported — there is no usable node to inject).
 * - success: mark the host ready, bump `toolsRev` (→ re-spawn), cache the secret union
 *   and the validated node path + curated env the host actually spawned with.
 */
export function reduceToolHostCache(
  prev: ToolHostCacheState,
  scan: ToolHostScan | CatalogPayload | null,
): ToolHostCacheState {
  const normalized = normalizeToolHostScan(scan);
  if (normalized.scanFailed) return prev;
  if (!normalized.materialized || normalized.catalog === null) {
    return {
      hostMaterialized: false,
      toolsRev: prev.toolsRev,
      declaredToolSecretIds: [],
      toolSecretsByFile: {},
      hostNodePath: null,
      hostEnv: null,
    };
  }
  return {
    hostMaterialized: true,
    toolsRev: prev.toolsRev + 1,
    declaredToolSecretIds: normalized.declaredSecretIds,
    toolSecretsByFile: normalized.toolSecretsByFile,
    hostNodePath: normalized.nodePath ?? null,
    hostEnv: normalized.env ?? null,
  };
}

/** Inputs for {@link buildToolHostServerFromCache} — the runtime-free builder seam. */
export interface BuildToolHostFromCacheInput {
  cache: ToolHostCacheState;
  enabled: boolean;
  hostEntry: string;
  toolsDir: string;
  vaultPath: string;
  disabledFiles: string[];
  /** User's explicit secret allowlist (`name` → keychain `secretId`); read fresh per turn. */
  allowedSecrets: ToolHostSecretRef[];
  resolveSecret: (secretId: string) => string | null;
}

/**
 * Build the synthetic local-tool-host stdio config from the CACHED scan result.
 *
 * The sync per-turn builder must inject ONLY the Node binary that passed the scan's
 * async ≥18 probe — never a freshly-resolved one. A failed/disabled scan clears
 * `hostNodePath` (via {@link reduceToolHostCache}), so this returns null rather than
 * falling back to a re-resolved node that could crash the `node18`-targeted host.
 * A PATH change is honored only on the next scan, which re-validates or disables.
 */
export function buildToolHostServerFromCache(
  input: BuildToolHostFromCacheInput,
): McpServerConfig | null {
  const { cache } = input;
  // Gate on enable + materialized + a cached VALIDATED node. No re-resolution here:
  // the only node we may inject is the one the scan's ≥18 probe approved.
  if (!input.enabled || !cache.hostMaterialized || !cache.hostNodePath) return null;
  return buildToolHostServer({
    enabled: true,
    nodePath: cache.hostNodePath,
    hostEntry: input.hostEntry,
    toolsDir: input.toolsDir,
    vaultPath: input.vaultPath,
    baseEnv: cache.hostEnv ?? {},
    disabledFiles: input.disabledFiles,
    declaredSecrets: cache.declaredToolSecretIds,
    toolSecretsByFile: cache.toolSecretsByFile,
    allowedSecrets: input.allowedSecrets,
    resolveSecret: input.resolveSecret,
    toolsRev: cache.toolsRev,
  });
}

/**
 * Resolve the Node executable and enhanced PATH for the tool host the SAME way
 * the live Claude CLI subprocess resolves them: provider-configured env PATH
 * (Claude settings → Environment) + the CLI dir, not just Obsidian's own PATH.
 */
export function resolveToolHostNode(plugin: PluginContext): {
  nodePath: string | null;
  enhancedPath: string;
} {
  const customEnv = plugin.getResolvedEnvironmentVariables('claude');
  const cliPath = plugin.getResolvedProviderCliPath('claude') ?? '';
  const enhancedPath = getEnhancedPath(customEnv.PATH, cliPath);
  return { nodePath: findNodeExecutable(enhancedPath), enhancedPath };
}

/**
 * Materialize the embedded host (when enabled and Node is supported), then run
 * catalog mode exactly once. Pure of any runtime dependency — it only needs
 * plugin-level accessors — so it works with zero open Claude tabs. Never throws
 * on a missing/old Node; the host stays disabled in that case.
 */
export async function scanLocalToolHost(plugin: PluginContext): Promise<ToolHostScan> {
  const claude = getClaudeProviderSettings(plugin.settings);
  const { nodePath, enhancedPath } = resolveToolHostNode(plugin);
  const vaultPath = plugin.getVaultPath();
  if (!claude.localToolHostEnabled || !nodePath || !vaultPath) return DISABLED;

  // Probe with the SAME curated env the host/catalog spawn uses (strips NODE_OPTIONS
  // etc.); inheriting process.env would let an Electron NODE_OPTIONS that standalone
  // `node` rejects yield no version → wrongly disable a feature that would run fine.
  const baseEnv = curateStdioMcpEnv({ PATH: enhancedPath });
  if (!isSupportedNode(await probeNodeMajor(nodePath, baseEnv))) return DISABLED;

  const paths = resolveToolHostPaths({ vaultPath, pluginDir: plugin.manifest.dir ?? '' });
  await materializeToolHost(paths.hostEntry, TOOL_HOST_SOURCE, {
    read: (p) => fsp.readFile(p, 'utf8'),
    write: (p, c) => fsp.writeFile(p, c, 'utf8'),
  });

  const env = {
    ...baseEnv,
    SPECORATOR_TOOLS_DIR: paths.toolsDir,
    SPECORATOR_VAULT_PATH: vaultPath,
    // JSON (comma-safe) disabled set so the catalog skips disabled files — their secrets must not enter the union.
    SPECORATOR_DISABLED_FILES: JSON.stringify(claude.localToolHostDisabledFiles),
  };
  const catalog = await readCatalog({ runCatalog: spawnCatalogRunner(nodePath, paths.hostEntry, env) });
  // A null catalog means the host materialized but `--catalog` FAILED (timeout / bad
  // output). Flag it so the fan-out leaves a previously-good secret union intact rather
  // than caching `[]` over it — a failed scan is not a successful empty tool set.
  if (catalog === null) {
    return {
      catalog: null,
      declaredSecretIds: [],
      toolSecretsByFile: {},
      materialized: false,
      scanFailed: true,
    };
  }
  // Cache the VALIDATED node + the curated env the host spawned with (sans the
  // per-scan SPECORATOR_* vars buildToolHostServer re-derives) so the sync per-turn
  // builder reuses the probed-≥18 binary instead of re-resolving Node.
  return {
    catalog,
    declaredSecretIds: unionSecretIds(catalog),
    toolSecretsByFile: catalogSecretsByFile(catalog),
    materialized: true,
    nodePath,
    env: baseEnv,
  };
}
