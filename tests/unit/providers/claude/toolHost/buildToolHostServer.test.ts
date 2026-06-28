import { buildToolHostServer } from '@/providers/claude/toolHost/buildToolHostServer';

const base = {
  enabled: true,
  nodePath: '/usr/bin/node',
  hostEntry: '/vault/plugin/tool-host.mjs',
  toolsDir: '/vault/.specorator/tools',
  vaultPath: '/vault',
  baseEnv: { PATH: '/usr/bin' },
  disabledFiles: ['old_tool.mjs'],
  declaredSecrets: ['OPENAI_API_KEY'],
  toolSecretsByFile: { 'wc.mjs': ['OPENAI_API_KEY'] },
  resolveSecret: (id: string) => (id === 'OPENAI_API_KEY' ? 'sk-test' : null),
  toolsRev: 0,
};

describe('buildToolHostServer', () => {
  it('returns null when disabled', () => {
    expect(buildToolHostServer({ ...base, enabled: false })).toBeNull();
  });

  it('returns null when node is unresolved', () => {
    expect(buildToolHostServer({ ...base, nodePath: null })).toBeNull();
  });

  it('builds an stdio config pointing node at the host entry with env', () => {
    const cfg = buildToolHostServer(base);
    expect(cfg).toMatchObject({
      type: 'stdio',
      command: '/usr/bin/node',
      args: ['/vault/plugin/tool-host.mjs'],
    });
    expect(cfg!.env).toMatchObject({
      PATH: '/usr/bin',
      SPECORATOR_TOOLS_DIR: '/vault/.specorator/tools',
      SPECORATOR_VAULT_PATH: '/vault',
      SPECORATOR_DISABLED_FILES: '["old_tool.mjs"]',
      SPECORATOR_SECRET_OPENAI_API_KEY: 'sk-test',
    });
  });

  it('omits a declared secret that does not resolve', () => {
    const cfg = buildToolHostServer({ ...base, resolveSecret: () => null });
    expect(cfg!.env).not.toHaveProperty('SPECORATOR_SECRET_OPENAI_API_KEY');
  });

  it('emits the tools revision so a reload changes the serialized config', () => {
    expect(buildToolHostServer(base)!.env!.SPECORATOR_TOOLS_REV).toBe('0');
    expect(buildToolHostServer({ ...base, toolsRev: 5 })!.env!.SPECORATOR_TOOLS_REV).toBe('5');
  });

  it('emits the cataloged per-tool secrets map so the host grants per file, not per serve manifest', () => {
    const cfg = buildToolHostServer(base);
    expect(cfg!.env!.SPECORATOR_TOOL_SECRETS).toBe('{"wc.mjs":["OPENAI_API_KEY"]}');
  });
});
