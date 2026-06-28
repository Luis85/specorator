import type { PluginContext } from '@/core/types/PluginContext';
import * as nodeVersion from '@/providers/claude/toolHost/nodeVersion';
import {
  normalizeToolHostScan,
  reduceToolHostCache,
  scanLocalToolHost,
} from '@/providers/claude/toolHost/scanLocalToolHost';
import * as catalogMod from '@/providers/claude/toolHost/ToolHostCatalog';
import * as materializer from '@/providers/claude/toolHost/ToolHostMaterializer';
import type { CatalogPayload } from '@/tool-host/types';
import * as envUtils from '@/utils/env';

function makePlugin(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    settings: {
      providerConfigs: {
        claude: {
          localToolHostEnabled: true,
          localToolHostDisabledFiles: [],
        },
      },
    },
    manifest: { dir: '.obsidian/plugins/specorator' },
    getResolvedEnvironmentVariables: jest.fn().mockReturnValue({ PATH: '/usr/bin' }),
    getResolvedProviderCliPath: jest.fn().mockReturnValue('/usr/local/bin/claude'),
    getVaultPath: jest.fn().mockReturnValue('/vault'),
    secretStore: { get: jest.fn() },
    ...overrides,
  } as unknown as PluginContext;
}

describe('scanLocalToolHost', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a disabled scan when the feature is off', async () => {
    const plugin = makePlugin({
      settings: {
        providerConfigs: { claude: { localToolHostEnabled: false, localToolHostDisabledFiles: [] } },
      },
    } as unknown as Partial<PluginContext>);
    const scan = await scanLocalToolHost(plugin);
    expect(scan).toEqual({
      catalog: null,
      declaredSecretIds: [],
      toolSecretsByFile: {},
      materialized: false,
    });
  });

  it('returns a disabled scan when Node is missing', async () => {
    jest.spyOn(envUtils, 'getEnhancedPath').mockReturnValue('/usr/bin');
    jest.spyOn(envUtils, 'findNodeExecutable').mockReturnValue(null);
    const scan = await scanLocalToolHost(makePlugin());
    expect(scan.catalog).toBeNull();
    expect(scan.materialized).toBe(false);
  });

  it('returns a disabled scan when Node is too old (<18) without materializing', async () => {
    jest.spyOn(envUtils, 'getEnhancedPath').mockReturnValue('/usr/bin');
    jest.spyOn(envUtils, 'findNodeExecutable').mockReturnValue('/usr/bin/node');
    jest.spyOn(nodeVersion, 'probeNodeMajor').mockResolvedValue(16);
    const materialize = jest.spyOn(materializer, 'materializeToolHost');
    const scan = await scanLocalToolHost(makePlugin());
    expect(scan.materialized).toBe(false);
    expect(materialize).not.toHaveBeenCalled();
  });

  it('materializes and scans the catalog when Node is supported', async () => {
    const catalog: CatalogPayload = {
      tools: [{ file: 'a.mjs', name: 'a', description: 'da', secrets: ['K1', 'K2'] }],
      errors: [],
    };
    jest.spyOn(envUtils, 'getEnhancedPath').mockReturnValue('/usr/bin');
    jest.spyOn(envUtils, 'findNodeExecutable').mockReturnValue('/usr/bin/node');
    jest.spyOn(envUtils, 'curateStdioMcpEnv').mockReturnValue({ PATH: '/usr/bin' });
    jest.spyOn(nodeVersion, 'probeNodeMajor').mockResolvedValue(20);
    const materialize = jest.spyOn(materializer, 'materializeToolHost').mockResolvedValue(true);
    jest.spyOn(catalogMod, 'spawnCatalogRunner').mockReturnValue(async () => ({ stdout: '', stderr: '', code: 0 }));
    jest.spyOn(catalogMod, 'readCatalog').mockResolvedValue(catalog);

    const scan = await scanLocalToolHost(makePlugin());

    expect(materialize).toHaveBeenCalled();
    expect(scan.materialized).toBe(true);
    expect(scan.catalog).toEqual(catalog);
    expect(scan.declaredSecretIds).toEqual(['K1', 'K2']);
    // Per-tool cataloged declaration is carried in lockstep with the union, keyed by file.
    expect(scan.toolSecretsByFile).toEqual({ 'a.mjs': ['K1', 'K2'] });
  });

  it('flags a failed catalog scan (readCatalog null) without claiming success or secrets', async () => {
    jest.spyOn(envUtils, 'getEnhancedPath').mockReturnValue('/usr/bin');
    jest.spyOn(envUtils, 'findNodeExecutable').mockReturnValue('/usr/bin/node');
    jest.spyOn(envUtils, 'curateStdioMcpEnv').mockReturnValue({ PATH: '/usr/bin' });
    jest.spyOn(nodeVersion, 'probeNodeMajor').mockResolvedValue(20);
    jest.spyOn(materializer, 'materializeToolHost').mockResolvedValue(true);
    jest.spyOn(catalogMod, 'spawnCatalogRunner').mockReturnValue(async () => ({ stdout: '', stderr: '', code: -1 }));
    jest.spyOn(catalogMod, 'readCatalog').mockResolvedValue(null);

    const scan = await scanLocalToolHost(makePlugin());

    expect(scan.scanFailed).toBe(true);
    expect(scan.materialized).toBe(false);
    expect(scan.catalog).toBeNull();
    expect(scan.declaredSecretIds).toEqual([]);
    expect(scan.toolSecretsByFile).toEqual({});
  });
});

describe('normalizeToolHostScan', () => {
  it('treats null as a disabled scan', () => {
    expect(normalizeToolHostScan(null)).toEqual({
      catalog: null,
      declaredSecretIds: [],
      toolSecretsByFile: {},
      materialized: false,
    });
  });

  it('wraps a bare catalog as a materialized scan with the secret union', () => {
    const catalog: CatalogPayload = {
      tools: [{ file: 'a.mjs', name: 'a', description: '', secrets: ['K'] }],
      errors: [],
    };
    expect(normalizeToolHostScan(catalog)).toEqual({
      catalog,
      declaredSecretIds: ['K'],
      toolSecretsByFile: { 'a.mjs': ['K'] },
      materialized: true,
    });
  });

  it('passes a full scan through unchanged', () => {
    const scan = { catalog: null, declaredSecretIds: [], toolSecretsByFile: {}, materialized: false };
    expect(normalizeToolHostScan(scan)).toBe(scan);
  });
});

describe('reduceToolHostCache', () => {
  const emptyCache = {
    hostMaterialized: false,
    toolsRev: 0,
    declaredToolSecretIds: [],
    toolSecretsByFile: {},
    hostNodePath: null,
    hostEnv: null,
  };
  const good = {
    catalog: { tools: [{ file: 'a.mjs', name: 'a', description: '', secrets: ['K1', 'K2'] }], errors: [] },
    declaredSecretIds: ['K1', 'K2'],
    toolSecretsByFile: { 'a.mjs': ['K1', 'K2'] },
    materialized: true,
    nodePath: '/usr/bin/node',
    env: { PATH: '/usr/bin' },
  };

  it('marks the host ready and bumps toolsRev on a successful scan', () => {
    const next = reduceToolHostCache(
      { ...emptyCache, toolsRev: 3 },
      good,
    );
    expect(next).toEqual({
      hostMaterialized: true,
      toolsRev: 4,
      declaredToolSecretIds: ['K1', 'K2'],
      toolSecretsByFile: { 'a.mjs': ['K1', 'K2'] },
      hostNodePath: '/usr/bin/node',
      hostEnv: { PATH: '/usr/bin' },
    });
  });

  it('caches the validated node path + curated env from the successful scan', () => {
    const next = reduceToolHostCache(emptyCache, good);
    expect(next.hostNodePath).toBe('/usr/bin/node');
    expect(next.hostEnv).toEqual({ PATH: '/usr/bin' });
  });

  it('does NOT clobber a previously-cached non-empty secret union / per-tool map or validated node on a failed scan', () => {
    const prev = {
      hostMaterialized: true,
      toolsRev: 7,
      declaredToolSecretIds: ['K1', 'K2'],
      toolSecretsByFile: { 'a.mjs': ['K1', 'K2'] },
      hostNodePath: '/usr/bin/node',
      hostEnv: { PATH: '/usr/bin' },
    };
    const next = reduceToolHostCache(prev, {
      catalog: null,
      declaredSecretIds: [],
      toolSecretsByFile: {},
      materialized: false,
      scanFailed: true,
    });
    // Prior good state is preserved verbatim — no empty-union drop, no per-tool-map
    // drop, no toolsRev bump; the previously-validated node/env survive. The per-tool
    // map MUST stay in lockstep with the union: a stale map + fresh empty union (or
    // vice-versa) would mismatch what the host can grant vs. the values transported.
    expect(next).toEqual(prev);
    expect(next.hostMaterialized).toBe(true);
    expect(next.declaredToolSecretIds).toEqual(['K1', 'K2']);
    expect(next.toolSecretsByFile).toEqual({ 'a.mjs': ['K1', 'K2'] });
    expect(next.hostNodePath).toBe('/usr/bin/node');
  });

  it('clears the host AND the cached node / per-tool map on a disabled scan (off / unsupported)', () => {
    const next = reduceToolHostCache(
      {
        hostMaterialized: true,
        toolsRev: 5,
        declaredToolSecretIds: ['K1'],
        toolSecretsByFile: { 'a.mjs': ['K1'] },
        hostNodePath: '/usr/bin/node',
        hostEnv: { PATH: '/usr/bin' },
      },
      null,
    );
    expect(next).toEqual({
      hostMaterialized: false,
      toolsRev: 5,
      declaredToolSecretIds: [],
      toolSecretsByFile: {},
      hostNodePath: null,
      hostEnv: null,
    });
  });

  it('clears the host on a genuinely-empty (clean) catalog rather than preserving stale secrets', () => {
    const next = reduceToolHostCache(
      {
        hostMaterialized: true,
        toolsRev: 2,
        declaredToolSecretIds: ['K1'],
        toolSecretsByFile: { 'a.mjs': ['K1'] },
        hostNodePath: '/old/node',
        hostEnv: { PATH: '/old' },
      },
      { catalog: { tools: [], errors: [] }, declaredSecretIds: [], toolSecretsByFile: {}, materialized: true, nodePath: '/usr/bin/node', env: { PATH: '/usr/bin' } },
    );
    expect(next).toEqual({
      hostMaterialized: true,
      toolsRev: 3,
      declaredToolSecretIds: [],
      toolSecretsByFile: {},
      hostNodePath: '/usr/bin/node',
      hostEnv: { PATH: '/usr/bin' },
    });
  });

  it('replaces the per-tool map from the new catalog on a fresh success (no merge with prior)', () => {
    const next = reduceToolHostCache(
      {
        hostMaterialized: true,
        toolsRev: 1,
        declaredToolSecretIds: ['OLD'],
        toolSecretsByFile: { 'old.mjs': ['OLD'] },
        hostNodePath: '/usr/bin/node',
        hostEnv: { PATH: '/usr/bin' },
      },
      good,
    );
    expect(next.toolSecretsByFile).toEqual({ 'a.mjs': ['K1', 'K2'] });
    expect(next.toolSecretsByFile).not.toHaveProperty('old.mjs');
  });
});
