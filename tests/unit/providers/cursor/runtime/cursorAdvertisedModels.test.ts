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

  it('matches a compound fast variant against separate reasoning + fast bracket fields', () => {
    // Advertised values split the axes into distinct fields, so the whole
    // `medium-fast` suffix never equals a single segment — decompose and match
    // each axis. The reasoning-only sibling must NOT match (no fast field).
    const advertised = ['gpt-5.4[reasoning=medium]', 'gpt-5.4[reasoning=medium,fast=true]'];
    expect(matchAdvertisedModelValue(advertised, 'gpt-5.4-medium-fast'))
      .toBe('gpt-5.4[reasoning=medium,fast=true]');
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=medium]'], 'gpt-5.4-medium-fast')).toBeNull();
  });

  it('matches a thinking+effort+fast compound against its bracket encoding', () => {
    const advertised = [
      'claude-opus-4-7[reasoning=low]',
      'claude-opus-4-7[reasoning=low,thinking,fast=true]',
    ];
    expect(matchAdvertisedModelValue(advertised, 'claude-opus-4-7-thinking-low-fast'))
      .toBe('claude-opus-4-7[reasoning=low,thinking,fast=true]');
  });

  it('still matches a simple effort selection when the advertised value carries extra axes', () => {
    // Only the effort axis is specified, so the unconstrained fast field is fine.
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=medium,fast=true]'], 'gpt-5.4-medium'))
      .toBe('gpt-5.4[reasoning=medium,fast=true]');
  });

  it('skips (returns null) when a compound selection has no satisfying advertised value', () => {
    expect(matchAdvertisedModelValue(['gpt-5.4[reasoning=high,fast=true]'], 'gpt-5.4-medium-fast')).toBeNull();
  });
});
