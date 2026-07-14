import {
  cursorSessionAdditionalDirectories,
  cursorSessionRootsEqual,
  normalizeCursorSessionRoots,
} from '@/providers/cursor/runtime/cursorSessionRoots';

describe('normalizeCursorSessionRoots', () => {
  it('returns an empty list for undefined or empty input', () => {
    expect(normalizeCursorSessionRoots(undefined)).toEqual([]);
    expect(normalizeCursorSessionRoots([])).toEqual([]);
  });

  it('trims, drops blanks, dedupes, and sorts for a stable comparison key', () => {
    expect(normalizeCursorSessionRoots(['/b', '  /a  ', '', '/b', '   '])).toEqual(['/a', '/b']);
  });
});

describe('cursorSessionRootsEqual', () => {
  it('is order-independent once both sides are normalized', () => {
    const a = normalizeCursorSessionRoots(['/a', '/b']);
    const b = normalizeCursorSessionRoots(['/b', '/a']);
    expect(cursorSessionRootsEqual(a, b)).toBe(true);
  });

  it('detects an added, removed, or changed root', () => {
    expect(cursorSessionRootsEqual(['/a'], ['/a', '/b'])).toBe(false);
    expect(cursorSessionRootsEqual(['/a', '/b'], ['/a'])).toBe(false);
    expect(cursorSessionRootsEqual(['/a'], ['/c'])).toBe(false);
    expect(cursorSessionRootsEqual([], [])).toBe(true);
  });
});

describe('cursorSessionAdditionalDirectories', () => {
  it('is undefined for no roots (so the ACP request omits the field)', () => {
    expect(cursorSessionAdditionalDirectories([])).toBeUndefined();
  });

  it('is a fresh copy of the roots when present', () => {
    const roots = ['/a', '/b'];
    const dirs = cursorSessionAdditionalDirectories(roots);
    expect(dirs).toEqual(['/a', '/b']);
    expect(dirs).not.toBe(roots);
  });
});
