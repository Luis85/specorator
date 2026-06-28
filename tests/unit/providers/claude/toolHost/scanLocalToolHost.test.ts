import type { PluginContext } from '@/core/types/PluginContext';
import * as nodeVersion from '@/providers/claude/toolHost/nodeVersion';
import {
  normalizeToolHostScan,
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
    expect(scan).toEqual({ catalog: null, declaredSecretIds: [], materialized: false });
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
  });
});

describe('normalizeToolHostScan', () => {
  it('treats null as a disabled scan', () => {
    expect(normalizeToolHostScan(null)).toEqual({
      catalog: null,
      declaredSecretIds: [],
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
      materialized: true,
    });
  });

  it('passes a full scan through unchanged', () => {
    const scan = { catalog: null, declaredSecretIds: [], materialized: false };
    expect(normalizeToolHostScan(scan)).toBe(scan);
  });
});
