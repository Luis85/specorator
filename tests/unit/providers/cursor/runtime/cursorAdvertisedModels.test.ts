import { matchAdvertisedModelValue } from '@/providers/cursor/runtime/cursorAdvertisedModels';

describe('matchAdvertisedModelValue', () => {
  it('returns null when nothing is advertised', () => {
    expect(matchAdvertisedModelValue(null, 'gpt-5.4-medium')).toBeNull();
    expect(matchAdvertisedModelValue([], 'gpt-5.4-medium')).toBeNull();
  });

  it('returns an exact advertised value untouched', () => {
    expect(matchAdvertisedModelValue(['auto', 'gpt-5.4[reasoning=medium]'], 'auto')).toBe('auto');
  });

  it('matches the requested variant regardless of advertised order', () => {
    const advertised = ['gpt-5.4[reasoning=high]', 'gpt-5.4[reasoning=medium]'];
    expect(matchAdvertisedModelValue(advertised, 'gpt-5.4-medium')).toBe('gpt-5.4[reasoning=medium]');
    expect(matchAdvertisedModelValue(advertised, 'gpt-5.4-high')).toBe('gpt-5.4[reasoning=high]');
  });

  it('returns null when the family matches but the requested variant is not advertised', () => {
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=high]'], 'gpt-5.4-medium')).toBeNull();
  });

  it('prefers the bare family value when no variant was requested', () => {
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=high]', 'gpt-5.4'], 'gpt-5.4')).toBe('gpt-5.4');
  });

  it('falls back to the first family sibling for a bare selection with no bare wire id', () => {
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=high]'], 'gpt-5.4')).toBe('gpt-5.4[reasoning=high]');
  });

  it('matches a bare-token bracket variant (e.g. thinking)', () => {
    const advertised = ['claude-4.6-opus', 'claude-4.6-opus[thinking]'];
    expect(matchAdvertisedModelValue(advertised, 'claude-4.6-opus-thinking')).toBe('claude-4.6-opus[thinking]');
  });

  it('returns null when no advertised family lines up at all', () => {
    expect(matchAdvertisedModelValue(['claude-4.6-opus[thinking]'], 'gpt-5.4-medium')).toBeNull();
  });
});
