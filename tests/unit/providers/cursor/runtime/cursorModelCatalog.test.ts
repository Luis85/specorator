import {
  buildCursorModelCatalogCliKey,
  CURSOR_MODEL_CATALOG_TTL_MS,
  CursorModelCatalogCache,
  getCachedCursorModelIds,
  isCursorModelCatalogDiscoveryFresh,
  parseModelListOutput,
  resetCursorModelCatalog,
  seedCursorModelCatalogForTest,
  STATIC_FALLBACK_MODEL_IDS,
} from '@/providers/cursor/runtime/cursorModelCatalog';

describe('buildCursorModelCatalogCliKey', () => {
  it('distinguishes backends by CURSOR_BASE_URL even with the same path and auth', () => {
    const a = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_API_KEY: 'k',
      CURSOR_BASE_URL: 'https://api.cursor.sh',
    });
    const b = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_API_KEY: 'k',
      CURSOR_BASE_URL: 'https://proxy.internal',
    });
    expect(a).not.toBe(b);
  });

  it('fingerprints the credential without leaking the secret, and normalizes path + base url', () => {
    const withAuth = buildCursorModelCatalogCliKey('C:\\Users\\Luis\\Bin\\Agent', {
      CURSOR_SESSION_TOKEN: 'tok',
      CURSOR_BASE_URL: 'https://user:pass@api.x/models?token=secret',
    });
    expect(withAuth).toMatch(/^cursor-cli:[0-9a-f]{24}$/);
    expect(withAuth).not.toContain('tok');
    expect(withAuth).not.toContain('Luis');
    expect(withAuth).not.toContain('user');
    expect(withAuth).not.toContain('pass');
    expect(withAuth).not.toContain('api.x');
    expect(withAuth).not.toContain('secret');
    const key = buildCursorModelCatalogCliKey('/usr/bin/agent', { CURSOR_BASE_URL: 'HTTPS://API.X ' });
    expect(key).toBe(buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_BASE_URL: 'https://api.x',
    }));
  });

  it('changes the key when the credential rotates on the same CLI + base URL', () => {
    const base = { CURSOR_BASE_URL: 'https://api.cursor.sh' };
    const before = buildCursorModelCatalogCliKey('/usr/bin/agent', { ...base, CURSOR_API_KEY: 'key-1' });
    const after = buildCursorModelCatalogCliKey('/usr/bin/agent', { ...base, CURSOR_API_KEY: 'key-2' });
    expect(before).not.toBe(after);
    // A session-token swap is likewise distinct from an api-key credential.
    const tokenAuth = buildCursorModelCatalogCliKey('/usr/bin/agent', { ...base, CURSOR_SESSION_TOKEN: 'key-1' });
    expect(tokenAuth).not.toBe(before);
  });

  it('matches Windows environment keys case-insensitively', () => {
    const upper = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_API_KEY: 'key-1',
      CURSOR_BASE_URL: 'https://api.cursor.sh',
    });
    const mixed = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      cursor_api_key: 'key-1',
      Cursor_Base_Url: 'https://api.cursor.sh',
    });

    expect(mixed === upper).toBe(process.platform === 'win32');
  });

  it('is stable for identical inputs', () => {
    const env = { CURSOR_API_KEY: 'k', CURSOR_BASE_URL: 'https://api.cursor.sh' };
    expect(buildCursorModelCatalogCliKey('/usr/bin/agent', env))
      .toBe(buildCursorModelCatalogCliKey('/usr/bin/agent', env));
  });

  it('normalizes URL scheme and host without collapsing case-sensitive URL paths', () => {
    const upperHost = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_BASE_URL: 'HTTPS://API.X/Models',
    });
    const lowerHost = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_BASE_URL: 'https://api.x/Models',
    });
    const lowerPath = buildCursorModelCatalogCliKey('/usr/bin/agent', {
      CURSOR_BASE_URL: 'https://api.x/models',
    });

    expect(upperHost).toBe(lowerHost);
    expect(upperHost).not.toBe(lowerPath);
  });
});

describe('parseModelListOutput', () => {
  it('parses a JSON array of strings', () => {
    const out = JSON.stringify(['auto', 'composer-2', 'gpt-5.5', 'GPT 5.6 Luna']);
    expect(parseModelListOutput(out)).toEqual(['auto', 'composer-2', 'gpt-5.5']);
  });

  it('parses a JSON array of objects via id/modelId/name/model fields', () => {
    const out = JSON.stringify([
      { id: 'auto' },
      { modelId: 'gpt-5.6-luna-medium', name: 'GPT 5.6 Luna' },
      { id: 'Legacy Display Name', modelId: 'gpt-5.6-terra-medium' },
      { name: 'composer-2' },
      { model: 'gemini-2.5-pro', label: 'ignored' },
    ]);
    expect(parseModelListOutput(out)).toEqual([
      'auto',
      'gpt-5.6-luna-medium',
      'gpt-5.6-terra-medium',
      'composer-2',
      'gemini-2.5-pro',
    ]);
  });

  it('drops invalid JSON model identifiers instead of accepting display text', () => {
    const out = JSON.stringify([
      { modelId: 'valid-model', name: 'Valid Model' },
      { modelId: 'invalid model id', name: 'Display Name' },
    ]);
    expect(parseModelListOutput(out)).toEqual(['valid-model']);
  });

  it('parses a JSON object wrapping a models array', () => {
    const out = JSON.stringify({ models: ['auto', { id: 'grok-4' }] });
    expect(parseModelListOutput(out)).toEqual(['auto', 'grok-4']);
  });

  it('parses bulleted text output stripping markers and headers', () => {
    const out = [
      'Available models:',
      '* auto (current)',
      '- composer-2',
      '• composer-1.5',
      '  gpt-5.5   the fast one',
      '',
    ].join('\n');
    expect(parseModelListOutput(out)).toEqual([
      'auto',
      'composer-2',
      'composer-1.5',
      'gpt-5.5',
    ]);
  });

  it('dedupes repeated ids', () => {
    const out = 'auto\nauto\ncomposer-2';
    expect(parseModelListOutput(out)).toEqual(['auto', 'composer-2']);
  });

  it('returns an empty array for blank output', () => {
    expect(parseModelListOutput('   ')).toEqual([]);
  });

  it('parses the real cursor-agent text format (Available models … Tip footer)', () => {
    const out = [
      'Available models',
      '',
      'auto - Auto',
      'composer-2-fast - Composer 2 Fast',
      'composer-2.5-fast - Composer 2.5 Fast (default)',
      'gpt-5.5-extra-high - GPT-5.5 1M Extra High',
      'claude-opus-4-7-thinking-low-fast - Opus 4.7 1M Low Thinking Fast',
      '',
      'Tip: use --model <id> (or /model <id> in interactive mode) to switch.',
    ].join('\n');
    expect(parseModelListOutput(out)).toEqual([
      'auto',
      'composer-2-fast',
      'composer-2.5-fast',
      'gpt-5.5-extra-high',
      'claude-opus-4-7-thinking-low-fast',
    ]);
  });

  it('does not capture trailing Tip lines as model ids', () => {
    const ids = parseModelListOutput('Tip: use --model <id> to switch.');
    expect(ids).not.toContain('Tip:');
    expect(ids).not.toContain('Tip');
  });
});

describe('getCachedCursorModelIds', () => {
  beforeEach(() => {
    resetCursorModelCatalog();
  });

  it('returns the static fallback when no cache is present', () => {
    expect(getCachedCursorModelIds()).toEqual([...STATIC_FALLBACK_MODEL_IDS]);
  });

  it('includes composer-1 in the fallback (not aliased away)', () => {
    expect(getCachedCursorModelIds()).toContain('composer-1');
  });

  it('scopes cache by CLI identity and expires after TTL', () => {
    seedCursorModelCatalogForTest(
      ['model-a'],
      buildCursorModelCatalogCliKey('/usr/bin/agent', { CURSOR_API_KEY: 'x' }),
    );
    expect(getCachedCursorModelIds('/usr/bin/agent', { CURSOR_API_KEY: 'x' })).toEqual(['model-a']);
    expect(getCachedCursorModelIds('/other/agent', { CURSOR_API_KEY: 'x' }))
      .toEqual([...STATIC_FALLBACK_MODEL_IDS]);
    // A rotated credential on the same CLI no longer hits the seeded cache.
    expect(getCachedCursorModelIds('/usr/bin/agent', { CURSOR_API_KEY: 'rotated' }))
      .toEqual([...STATIC_FALLBACK_MODEL_IDS]);

    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + CURSOR_MODEL_CATALOG_TTL_MS + 1);
    expect(isCursorModelCatalogDiscoveryFresh('/usr/bin/agent', { CURSOR_API_KEY: 'x' })).toBe(false);
    jest.useRealTimers();
  });
});

describe('CursorModelCatalogCache', () => {
  it('retains independent fresh catalogs for multiple identities', () => {
    const cache = new CursorModelCatalogCache();
    cache.seed('cli-a', ['model-a']);
    cache.seed('cli-b', ['model-b']);

    expect(cache.get('cli-a')).toEqual(['model-a']);
    expect(cache.get('cli-b')).toEqual(['model-b']);
  });

  it('requires an explicit identity instead of exposing the last refreshed catalog', () => {
    const cache = new CursorModelCatalogCache();
    cache.seed('cli-a', ['model-a']);

    expect(cache.get()).toEqual([...STATIC_FALLBACK_MODEL_IDS]);
  });

  it('deduplicates concurrent refreshes for the same identity', async () => {
    const cache = new CursorModelCatalogCache();
    let release!: (ids: string[]) => void;
    const loader = jest.fn(() => new Promise<string[]>((resolve) => {
      release = resolve;
    }));

    const first = cache.refresh('cli-a', loader);
    const second = cache.refresh('cli-a', loader);
    release(['model-a']);

    await expect(first).resolves.toEqual(['model-a']);
    await expect(second).resolves.toEqual(['model-a']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good identity cache when refresh returns empty', async () => {
    const cache = new CursorModelCatalogCache();
    cache.seed('cli-a', ['model-a']);

    await expect(cache.refresh('cli-a', async () => [])).resolves.toEqual(['model-a']);
    expect(cache.get('cli-a')).toEqual(['model-a']);
  });
});
