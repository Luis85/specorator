import {
  buildCursorModelCatalogCliKey,
  CURSOR_MODEL_CATALOG_TTL_MS,
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

  it('fingerprints auth presence without leaking the secret, and normalizes path + base url', () => {
    expect(buildCursorModelCatalogCliKey('C:\\Bin\\Agent', { CURSOR_SESSION_TOKEN: 'tok' }))
      .toBe('c:/bin/agent|auth|');
    const key = buildCursorModelCatalogCliKey('/usr/bin/agent', { CURSOR_BASE_URL: 'HTTPS://API.X ' });
    expect(key).toBe('/usr/bin/agent|noauth|https://api.x');
    expect(key).not.toContain('tok');
  });

  it('is stable for identical inputs', () => {
    const env = { CURSOR_API_KEY: 'k', CURSOR_BASE_URL: 'https://api.cursor.sh' };
    expect(buildCursorModelCatalogCliKey('/usr/bin/agent', env))
      .toBe(buildCursorModelCatalogCliKey('/usr/bin/agent', env));
  });
});

describe('parseModelListOutput', () => {
  it('parses a JSON array of strings', () => {
    const out = JSON.stringify(['auto', 'composer-2', 'gpt-5.5']);
    expect(parseModelListOutput(out)).toEqual(['auto', 'composer-2', 'gpt-5.5']);
  });

  it('parses a JSON array of objects via id/name/model fields', () => {
    const out = JSON.stringify([
      { id: 'auto' },
      { name: 'composer-2' },
      { model: 'gemini-2.5-pro', label: 'ignored' },
    ]);
    expect(parseModelListOutput(out)).toEqual(['auto', 'composer-2', 'gemini-2.5-pro']);
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
    seedCursorModelCatalogForTest(['model-a'], '/usr/bin/agent|auth|');
    expect(getCachedCursorModelIds('/usr/bin/agent', { CURSOR_API_KEY: 'x' })).toEqual(['model-a']);
    expect(getCachedCursorModelIds('/other/agent', { CURSOR_API_KEY: 'x' }))
      .toEqual([...STATIC_FALLBACK_MODEL_IDS]);

    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + CURSOR_MODEL_CATALOG_TTL_MS + 1);
    expect(isCursorModelCatalogDiscoveryFresh('/usr/bin/agent', { CURSOR_API_KEY: 'x' })).toBe(false);
    jest.useRealTimers();
  });
});
