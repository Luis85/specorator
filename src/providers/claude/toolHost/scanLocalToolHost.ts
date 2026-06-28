import { promises as fsp } from 'node:fs';

import type { PluginContext } from '../../../core/types/PluginContext';
import { TOOL_HOST_SOURCE } from '../../../tool-host/embeddedSource';
import type { CatalogPayload, ToolHostScan } from '../../../tool-host/types';
import { curateStdioMcpEnv, findNodeExecutable, getEnhancedPath } from '../../../utils/env';
import { getClaudeProviderSettings } from '../settings';
import { isSupportedNode, probeNodeMajor } from './nodeVersion';
import { readCatalog, spawnCatalogRunner, unionSecretIds } from './ToolHostCatalog';
import { materializeToolHost } from './ToolHostMaterializer';
import { resolveToolHostPaths } from './toolHostPaths';

const DISABLED: ToolHostScan = { catalog: null, declaredSecretIds: [], materialized: false };

/**
 * Coerce a fan-out payload into a {@link ToolHostScan}. Accepts a full scan, a
 * bare {@link CatalogPayload} (legacy single-catalog fan-out), or null (disabled).
 */
export function normalizeToolHostScan(
  scan: ToolHostScan | CatalogPayload | null,
): ToolHostScan {
  if (scan === null) return DISABLED;
  if ('materialized' in scan) return scan;
  return { catalog: scan, declaredSecretIds: unionSecretIds(scan), materialized: true };
}

/** The runtime's mutable local-tool-host caches that a scan result updates. */
export interface ToolHostCacheState {
  hostMaterialized: boolean;
  toolsRev: number;
  declaredToolSecretIds: string[];
}

/**
 * Pure reducer for applying a scan to the runtime's tool-host caches. Three cases:
 * - `scanFailed`: leave caches UNTOUCHED — a transient catalog failure must not clobber
 *   a previously-good secret union with `[]` (silent secrets-drop) or claim the host ready.
 * - disabled (not materialized / null catalog): clear the host (disabled or unsupported).
 * - success: mark the host ready, bump `toolsRev` (→ re-spawn), cache the secret union.
 */
export function reduceToolHostCache(
  prev: ToolHostCacheState,
  scan: ToolHostScan | CatalogPayload | null,
): ToolHostCacheState {
  const normalized = normalizeToolHostScan(scan);
  if (normalized.scanFailed) return prev;
  if (!normalized.materialized || normalized.catalog === null) {
    return { hostMaterialized: false, toolsRev: prev.toolsRev, declaredToolSecretIds: [] };
  }
  return {
    hostMaterialized: true,
    toolsRev: prev.toolsRev + 1,
    declaredToolSecretIds: normalized.declaredSecretIds,
  };
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
    return { catalog: null, declaredSecretIds: [], materialized: false, scanFailed: true };
  }
  return { catalog, declaredSecretIds: unionSecretIds(catalog), materialized: true };
}
