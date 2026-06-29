import type { McpStdioServerConfig } from '@/core/types/mcp';
import { LOCAL_TOOL_HOST_SERVER_NAME } from '@/providers/claude/toolHost/buildToolHostServer';
import { buildToolHostServerFromCache } from '@/providers/claude/toolHost/scanLocalToolHost';

const baseCache = {
  hostMaterialized: true,
  toolsRev: 2,
  declaredToolSecretIds: ['OPENAI_API_KEY'],
  toolSecretsByFile: { 'wc.mjs': ['OPENAI_API_KEY'] },
  hostNodePath: '/validated/node18',
  hostEnv: { PATH: '/validated/bin' },
};

const baseInput = {
  cache: baseCache,
  enabled: true,
  hostEntry: '/vault/plugin/tool-host.mjs',
  toolsDir: '/vault/.specorator/tools',
  vaultPath: '/vault',
  disabledFiles: ['old.mjs'],
  allowedSecrets: [{ name: 'OPENAI_API_KEY', secretId: 'kc-openai' }],
  resolveSecret: (secretId: string) => (secretId === 'kc-openai' ? 'sk-test' : null),
};

describe('buildToolHostServerFromCache', () => {
  it('returns null when disabled', () => {
    expect(buildToolHostServerFromCache({ ...baseInput, enabled: false })).toBeNull();
  });

  it('returns null when the host has not been materialized this session', () => {
    expect(
      buildToolHostServerFromCache({
        ...baseInput,
        cache: { ...baseCache, hostMaterialized: false },
      }),
    ).toBeNull();
  });

  it('uses the CACHED validated node + env — never a freshly-resolved binary', () => {
    const cfg = buildToolHostServerFromCache(baseInput) as McpStdioServerConfig | null;
    expect(cfg).toMatchObject({
      type: 'stdio',
      command: '/validated/node18',
      args: ['/vault/plugin/tool-host.mjs'],
    });
    // PATH comes straight from the cached curated env, not a re-resolution.
    expect(cfg!.env).toMatchObject({
      PATH: '/validated/bin',
      SPECORATOR_TOOLS_DIR: '/vault/.specorator/tools',
      SPECORATOR_VAULT_PATH: '/vault',
      SPECORATOR_DISABLED_FILES: '["old.mjs"]',
      SPECORATOR_TOOLS_REV: '2',
      SPECORATOR_SECRET_OPENAI_API_KEY: 'sk-test',
      SPECORATOR_TOOL_SECRETS: '{"wc.mjs":["OPENAI_API_KEY"]}',
    });
  });

  it('returns null when a disabled/failed scan left no validated node cached', () => {
    // A failed or disabled scan clears hostNodePath/hostEnv (via reduceToolHostCache);
    // the builder must NOT fall back to a freshly-resolved node — it stays disabled.
    expect(
      buildToolHostServerFromCache({
        ...baseInput,
        cache: { ...baseCache, hostNodePath: null, hostEnv: null },
      }),
    ).toBeNull();
  });

  it('surfaces under the reserved server name when merged by the caller', () => {
    const cfg = buildToolHostServerFromCache(baseInput);
    expect(cfg).not.toBeNull();
    expect(LOCAL_TOOL_HOST_SERVER_NAME).toBe('specorator-tools');
  });
});
