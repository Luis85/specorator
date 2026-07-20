import {
  resolveActiveCursorModel,
  resolveCursorSessionModelId,
} from '@/providers/cursor/runtime/cursorModelResolution';

describe('resolveActiveCursorModel', () => {
  // The override branch is pure; the fall-through settings path delegates to
  // ProviderSettingsCoordinator.getProviderSettingsSnapshot (covered by its own
  // tests + the CursorChatRuntime integration tests, which register the provider).
  it('prefers a trimmed, non-empty per-turn override without consulting settings', () => {
    // A non-empty override short-circuits before the settings snapshot, so an
    // (unregistered-in-this-spec) provider is never projected here.
    expect(resolveActiveCursorModel({ model: '  cursor:gpt-5-high  ' }, {})).toBe('cursor:gpt-5-high');
    expect(resolveActiveCursorModel({ model: 'auto' }, {})).toBe('auto');
  });
});

describe('resolveCursorSessionModelId', () => {
  const catalog = ['gpt-5-low', 'gpt-5-high'];

  it('returns undefined for an empty selection', () => {
    expect(resolveCursorSessionModelId(null, catalog)).toBeUndefined();
    expect(resolveCursorSessionModelId(undefined, catalog)).toBeUndefined();
    expect(resolveCursorSessionModelId('', catalog)).toBeUndefined();
  });

  it('strips the cursor: namespace prefix before resolving', () => {
    // 'auto' has no family/mode split, so it resolves to itself.
    expect(resolveCursorSessionModelId('cursor:auto', [])).toBe('auto');
  });

  it('keeps an explicit variant id as-is', () => {
    expect(resolveCursorSessionModelId('cursor:gpt-5-high', catalog)).toBe('gpt-5-high');
    expect(resolveCursorSessionModelId('gpt-5-low', catalog)).toBe('gpt-5-low');
  });

  it('resolves a family-only pick against the active catalog', () => {
    expect(resolveCursorSessionModelId('gpt-5', catalog)).toBe('gpt-5');
    expect(resolveCursorSessionModelId('cursor:gpt-5', catalog)).toBe('gpt-5');
  });
});
