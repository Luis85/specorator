import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { PluginContext } from '@/core/types/PluginContext';
import { buildCodexAppServerEnvironment } from '@/providers/codex/runtime/codexAppServerSupport';

function makePlugin(customEnv: Record<string, string>, cliPath: string | null = null): PluginContext {
  return {
    getResolvedEnvironmentVariables: () => customEnv,
    getResolvedProviderCliPath: () => cliPath,
  } as unknown as PluginContext;
}

describe('buildCodexAppServerEnvironment', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    // Restore any host env mutations so tests stay isolated.
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  it('passes host env vars through (full Claude-parity env) but still denies the TLS kill-switch', () => {
    // The allowlist was removed so the Codex app-server and its shell tools
    // resolve host binaries, matching how the Claude SDK spawns.
    process.env.AWS_SECRET_ACCESS_KEY = 'aws-present';
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const env = buildCodexAppServerEnvironment(makePlugin({}));

    expect(env.AWS_SECRET_ACCESS_KEY).toBe('aws-present');
    expect(env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it('preserves OPENAI_/CODEX_-prefixed host vars', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    process.env.CODEX_FOO = 'codex-bar';

    const env = buildCodexAppServerEnvironment(makePlugin({}));

    expect(env.OPENAI_API_KEY).toBe('sk-openai');
    expect(env.CODEX_FOO).toBe('codex-bar');
  });

  it('keeps baseline allowlisted vars (HOME) and an enhanced PATH', () => {
    process.env.HOME = '/home/codex-test';

    const env = buildCodexAppServerEnvironment(makePlugin({}));

    expect(env.HOME).toBe('/home/codex-test');
    expect(typeof env.PATH).toBe('string');
    expect(env.PATH.length).toBeGreaterThan(0);
  });

  it('forwards user-entered custom env (opt-in) outside the allowlist', () => {
    const env = buildCodexAppServerEnvironment(makePlugin({ MY_CUSTOM: 'yes' }));

    expect(env.MY_CUSTOM).toBe('yes');
  });

  it('searches the CLI\'s own directory when Node ships beside it', () => {
    // A distribution that ships its interpreter next to the entry point (or an
    // `env node` shebang answered by a sibling `node`) resolves at spawn only if
    // that directory is on the child's PATH. Omitting the CLI path also put this
    // spawn out of step with the setup view's probe, which searches
    // `getEnhancedPath(runtimePath, cliPath)` — Setup reported `found` for an
    // interpreter this env could not then find.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specorator-codex-'));
    try {
      fs.writeFileSync(path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node'), '');
      const cliPath = path.join(dir, 'codex');

      expect(buildCodexAppServerEnvironment(makePlugin({}, cliPath)).PATH).toContain(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a PATH without it when no CLI path is resolved', () => {
    expect(buildCodexAppServerEnvironment(makePlugin({})).PATH).toBeTruthy();
  });
});
