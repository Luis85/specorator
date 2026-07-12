import {
  buildFullSubprocessEnvironment,
  pickEnvValueCaseInsensitive,
  SUBPROCESS_ENV_DENYLIST,
} from '@/core/providers/subprocessEnvironmentAllowlist';

describe('buildFullSubprocessEnvironment', () => {
  it('passes the full host environment through (Claude-parity)', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: {
        PATH: '/usr/bin',
        HOME: '/home/test',
        SECRET_TOKEN: 'sk-host',
        NPM_TOKEN: 'npm-host',
        DEBUG: '1',
      },
      customEnv: {},
    });
    // No allowlist: unrelated host vars now reach the child, matching how the
    // Claude SDK spawns ({ ...process.env }).
    expect(result.SECRET_TOKEN).toBe('sk-host');
    expect(result.NPM_TOKEN).toBe('npm-host');
    expect(result.DEBUG).toBe('1');
    expect(result.PATH).toBe('/usr/bin');
    expect(result.HOME).toBe('/home/test');
  });

  it('drops undefined-valued process env entries', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { PATH: '/usr/bin', UNSET: undefined },
      customEnv: {},
    });
    expect('UNSET' in result).toBe(false);
  });

  it('still refuses NODE_TLS_REJECT_UNAUTHORIZED from host and custom env', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { NODE_TLS_REJECT_UNAUTHORIZED: '0', PATH: '/usr/bin' },
      customEnv: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
    });
    expect(result.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it('refuses NODE_TLS_REJECT_UNAUTHORIZED in any letter case (Windows env-var names are case-insensitive)', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: {
        node_tls_reject_unauthorized: '0',
        Node_TLS_REJECT_UNAUTHORIZED: '0',
        PATH: '/usr/bin',
      },
      customEnv: { node_tls_reject_unauthorized: '0' },
    });
    expect(result.node_tls_reject_unauthorized).toBeUndefined();
    expect(result.Node_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
    expect(result.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it('exposes the denylist for inspection', () => {
    expect(SUBPROCESS_ENV_DENYLIST.has('NODE_TLS_REJECT_UNAUTHORIZED')).toBe(true);
  });

  it('customEnv overrides processEnv values for the same key', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { CURSOR_API_KEY: 'host-key', PATH: '/usr/bin' },
      customEnv: { CURSOR_API_KEY: 'override' },
    });
    expect(result.CURSOR_API_KEY).toBe('override');
  });

  it('applies the pathOverride as the single canonical PATH key', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { PATH: '/usr/bin' },
      customEnv: {},
      pathOverride: '/enhanced/bin:/usr/bin',
    });
    expect(result.PATH).toBe('/enhanced/bin:/usr/bin');
  });

  it('collapses Windows `Path` + `pathOverride` into a single enhanced `PATH` key', () => {
    // The child shell resolves PATH case-insensitively; shipping both `Path`
    // (host) and `PATH` (enhanced) could let it pick the un-enhanced one.
    const result = buildFullSubprocessEnvironment({
      processEnv: { Path: 'C:\\Windows\\System32' },
      customEnv: {},
      pathOverride: 'C:\\Windows\\System32;C:\\Program Files\\Git\\bin',
    });
    const pathKeys = Object.keys(result).filter((key) => key.toUpperCase() === 'PATH');
    expect(pathKeys).toEqual(['PATH']);
    expect(result.PATH).toBe('C:\\Windows\\System32;C:\\Program Files\\Git\\bin');
    expect(result.Path).toBeUndefined();
  });

  it('keeps the pathOverride even when host `PATH` and a customEnv `Path` differ in case', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { PATH: '/host/bin' },
      customEnv: { Path: '/custom/bin' },
      pathOverride: '/host/bin:/enhanced/git/bin',
    });
    const pathKeys = Object.keys(result).filter((key) => key.toUpperCase() === 'PATH');
    expect(pathKeys).toEqual(['PATH']);
    expect(result.PATH).toBe('/host/bin:/enhanced/git/bin');
    expect(result.Path).toBeUndefined();
  });

  it('leaves a lone `Path` key untouched when there is no duplicate', () => {
    const result = buildFullSubprocessEnvironment({
      processEnv: { Path: 'C:\\Windows\\System32' },
      customEnv: {},
    });
    expect(result.Path).toBe('C:\\Windows\\System32');
    expect(result.PATH).toBeUndefined();
  });
});

describe('pickEnvValueCaseInsensitive', () => {
  it('finds a value under any letter case', () => {
    expect(pickEnvValueCaseInsensitive({ Path: '/a' }, 'PATH')).toBe('/a');
    expect(pickEnvValueCaseInsensitive({ path: '/b' }, 'PATH')).toBe('/b');
    expect(pickEnvValueCaseInsensitive({ PATH: '/c' }, 'PATH')).toBe('/c');
  });

  it('returns undefined when no case-variant is present', () => {
    expect(pickEnvValueCaseInsensitive({ HOME: '/h' }, 'PATH')).toBeUndefined();
  });

  it('returns the last-declared match when several variants coexist', () => {
    expect(pickEnvValueCaseInsensitive({ Path: '/a', PATH: '/b' }, 'PATH')).toBe('/b');
  });
});
