import {
  cursorWireContextWindow,
  parseCursorWireModel,
} from '@/providers/cursor/runtime/cursorWireModel';

describe('parseCursorWireModel', () => {
  it('parses the family, keyed axes, and bare flags once', () => {
    const parsed = parseCursorWireModel(
      'claude-opus-4-8[context=300k,reasoning=high,thinking,fast=true]',
    );

    expect(parsed.family).toBe('claude-opus-4-8');
    expect(parsed.hasBracket).toBe(true);
    expect(parsed.values).toEqual(new Set(['300k', 'high', 'thinking', 'true']));
    expect(parsed.keyed).toEqual(new Map([
      ['context', '300k'],
      ['reasoning', 'high'],
      ['fast', 'true'],
    ]));
  });

  it('distinguishes a bare family from an explicit empty bracket', () => {
    expect(parseCursorWireModel('default')).toMatchObject({
      family: 'default',
      hasBracket: false,
    });
    expect(parseCursorWireModel('default[]')).toMatchObject({
      family: 'default',
      hasBracket: true,
    });
  });
});

describe('cursorWireContextWindow', () => {
  it.each([
    ['272k', 272_000],
    ['1m', 1_000_000],
    ['12.5k', 12_500],
    ['400000', 400_000],
  ])('parses context=%s', (context, expected) => {
    expect(cursorWireContextWindow(parseCursorWireModel(`model[context=${context}]`)))
      .toBe(expected);
  });

  it('rejects malformed or non-positive context values', () => {
    expect(cursorWireContextWindow(parseCursorWireModel('model[context=huge]'))).toBe(0);
    expect(cursorWireContextWindow(parseCursorWireModel('model[context=0]'))).toBe(0);
    expect(cursorWireContextWindow(parseCursorWireModel('model[context=272k'))).toBe(0);
  });
});
