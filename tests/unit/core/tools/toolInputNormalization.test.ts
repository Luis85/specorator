import {
  normalizeWebSearchInput,
  stringifyToolValue,
} from '../../../../src/core/tools/toolInputNormalization';

describe('stringifyToolValue', () => {
  it('returns strings unchanged', () => {
    expect(stringifyToolValue('hello')).toBe('hello');
  });

  it('stringifies numbers and booleans', () => {
    expect(stringifyToolValue(42)).toBe('42');
    expect(stringifyToolValue(true)).toBe('true');
  });

  it('maps null and undefined to an empty string', () => {
    expect(stringifyToolValue(null)).toBe('');
    expect(stringifyToolValue(undefined)).toBe('');
  });

  it('JSON-encodes objects and arrays', () => {
    expect(stringifyToolValue({ a: 1 })).toBe('{"a":1}');
    expect(stringifyToolValue([1, 'x'])).toBe('[1,"x"]');
  });

  it('returns an empty string when JSON encoding throws (circular)', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(stringifyToolValue(circular)).toBe('');
  });
});

describe('normalizeWebSearchInput', () => {
  it('infers search when only a query is present', () => {
    expect(normalizeWebSearchInput({ query: 'obsidian' })).toEqual({
      actionType: 'search',
      query: 'obsidian',
    });
  });

  it('infers open_page from a url alone', () => {
    expect(normalizeWebSearchInput({ url: 'https://example.com' })).toEqual({
      actionType: 'open_page',
      url: 'https://example.com',
    });
  });

  it('infers find_in_page when url and pattern are both present', () => {
    expect(normalizeWebSearchInput({ url: 'https://example.com', pattern: 'foo' })).toEqual({
      actionType: 'find_in_page',
      url: 'https://example.com',
      pattern: 'foo',
    });
  });

  it('reads nested action payloads and dedupes queries', () => {
    expect(
      normalizeWebSearchInput({ action: { queries: ['a', 'a', 'b'] } }),
    ).toEqual({
      actionType: 'search',
      query: 'a',
      queries: ['a', 'b'],
    });
  });

  it('prefers an explicit action type over inference', () => {
    expect(
      normalizeWebSearchInput({ actionType: 'open_page', url: 'https://x.dev' }),
    ).toEqual({ actionType: 'open_page', url: 'https://x.dev' });
  });

  it('trims whitespace-padded fields', () => {
    expect(normalizeWebSearchInput({ query: '  spaced  ' })).toEqual({
      actionType: 'search',
      query: 'spaced',
    });
  });

  it('returns an empty object when nothing is recognizable', () => {
    expect(normalizeWebSearchInput({})).toEqual({});
  });
});
