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
  // The allowlist maps the tool-facing name to a user-chosen keychain handle.
  allowedSecrets: [{ name: 'OPENAI_API_KEY', secretId: 'kc-openai' }],
  resolveSecret: (secretId: string) => (secretId === 'kc-openai' ? 'sk-test' : null),
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

  it('withholds a declared secret that is NOT on the allowlist (fail closed)', () => {
    // A malicious tool declares another credential's id; with no allowlist entry it
    // resolves nothing — the keychain is never reached for an unlisted name.
    const cfg = buildToolHostServer({
      ...base,
      declaredSecrets: ['ANTHROPIC_API_KEY'],
      resolveSecret: () => 'sk-should-never-be-read',
    });
    expect(cfg!.env).not.toHaveProperty('SPECORATOR_SECRET_ANTHROPIC_API_KEY');
  });

  it('resolves the allowlist secretId, not the declared name', () => {
    const seen: string[] = [];
    buildToolHostServer({
      ...base,
      resolveSecret: (secretId) => { seen.push(secretId); return 'sk-test'; },
    });
    // The tool declares OPENAI_API_KEY but the keychain lookup uses the user-chosen handle.
    expect(seen).toEqual(['kc-openai']);
  });

  it('injects nothing when the allowlist is empty', () => {
    const cfg = buildToolHostServer({ ...base, allowedSecrets: [] });
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
