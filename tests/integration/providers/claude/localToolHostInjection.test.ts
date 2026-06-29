import type { McpStdioServerConfig } from '@/core/types/mcp';
import { LOCAL_TOOL_HOST_SERVER_NAME } from '@/providers/claude/toolHost/buildToolHostServer';
import {
  buildToolHostServerFromCache,
  reduceToolHostCache,
  type ToolHostCacheState,
} from '@/providers/claude/toolHost/scanLocalToolHost';
import type { CatalogPayload } from '@/tool-host/types';

/**
 * Integration coverage for the synthetic local-tool-host server injection at the
 * Claude cold-start seam. It exercises the CURRENT seams end to end:
 *   1. `reduceToolHostCache` applies a scan to the runtime's cache (enable + materialize).
 *   2. `buildToolHostServerFromCache` builds the stdio config from that cache (sync per-turn builder).
 *   3. The cold-start merge (mirrored from `ClaudeQueryOptionsBuilder`) injects it under
 *      the reserved name without clobbering a same-named user server.
 *
 * Intent (per plan Task 21): (1) no server when disabled, (2) injected under the
 * reserved name when enabled + materialized, (3) never overwrites a user server of that name.
 */

const EMPTY_CACHE: ToolHostCacheState = {
  hostMaterialized: false,
  toolsRev: 0,
  declaredToolSecretIds: [],
  toolSecretsByFile: {},
  hostNodePath: null,
  hostEnv: null,
};

const CATALOG: CatalogPayload = {
  tools: [{ file: 'word_count.mjs', name: 'word_count', description: 'd', secrets: [] }],
  errors: [],
};

/** A successful scan: host materialized on disk with a validated (≥18) node. */
const SUCCESS_SCAN = {
  catalog: CATALOG,
  declaredSecretIds: [],
  toolSecretsByFile: { 'word_count.mjs': [] },
  materialized: true,
  nodePath: '/validated/node',
  env: { PATH: '/validated/bin' },
};

/** Materialize the host into a fresh cache the way the runtime's scan fan-out does. */
function materializedCache(): ToolHostCacheState {
  return reduceToolHostCache(EMPTY_CACHE, SUCCESS_SCAN);
}

/** The runtime's per-turn builder closure, parameterized on enable + cache. */
function buildServer(enabled: boolean, cache: ToolHostCacheState) {
  return buildToolHostServerFromCache({
    cache,
    enabled,
    hostEntry: '/vault/.obsidian/plugins/specorator/tool-host.mjs',
    toolsDir: '/vault/.specorator/tools',
    vaultPath: '/vault',
    disabledFiles: [],
    allowedSecrets: [],
    resolveSecret: () => null,
  });
}

/** Mirrors the cold-start merge in ClaudeQueryOptionsBuilder (Task 18). */
function inject(
  active: Record<string, unknown>,
  enabled: boolean,
  cache: ToolHostCacheState,
): Record<string, unknown> {
  const merged = { ...active };
  const host = buildServer(enabled, cache);
  if (host && !(LOCAL_TOOL_HOST_SERVER_NAME in merged)) {
    merged[LOCAL_TOOL_HOST_SERVER_NAME] = host;
  }
  return merged;
}

describe('local tool host injection (cold-start seam)', () => {
  it('reserves the documented server name', () => {
    expect(LOCAL_TOOL_HOST_SERVER_NAME).toBe('specorator-tools');
  });

  it('produces NO server when the feature is disabled, even after materialization', () => {
    const cache = materializedCache();
    expect(buildServer(false, cache)).toBeNull();
    expect(inject({}, false, cache)).toEqual({});
  });

  it('produces NO server before the host is materialized (no validated node cached)', () => {
    // Enabled but never scanned → no cached node → builder stays null (won't spawn a
    // missing/unvalidated entrypoint mid-turn).
    expect(buildServer(true, EMPTY_CACHE)).toBeNull();
    expect(inject({}, true, EMPTY_CACHE)).toEqual({});
  });

  it('injects under the reserved name when enabled AND materialized', () => {
    const cache = materializedCache();
    const merged = inject({}, true, cache);
    expect(Object.keys(merged)).toEqual([LOCAL_TOOL_HOST_SERVER_NAME]);

    const cfg = merged[LOCAL_TOOL_HOST_SERVER_NAME] as McpStdioServerConfig;
    expect(cfg).toMatchObject({
      type: 'stdio',
      command: '/validated/node',
      args: ['/vault/.obsidian/plugins/specorator/tool-host.mjs'],
    });
    // The injected config spawns the scan-validated node with the curated env.
    expect(cfg.env).toMatchObject({
      PATH: '/validated/bin',
      SPECORATOR_TOOLS_DIR: '/vault/.specorator/tools',
      SPECORATOR_VAULT_PATH: '/vault',
    });
  });

  it('does NOT clobber a user MCP server already named specorator-tools', () => {
    const userServer = { type: 'stdio', command: 'mine' };
    const merged = inject(
      { [LOCAL_TOOL_HOST_SERVER_NAME]: userServer },
      true,
      materializedCache(),
    );
    // The reserved-name guard keeps the user's server intact.
    expect(merged[LOCAL_TOOL_HOST_SERVER_NAME]).toBe(userServer);
    expect(Object.keys(merged)).toEqual([LOCAL_TOOL_HOST_SERVER_NAME]);
  });
});
