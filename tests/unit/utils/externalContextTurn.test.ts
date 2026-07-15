import {
  dedupeExternalContextPaths,
  filterRedundantExternalContextPaths,
} from '@/utils/externalContextTurn';

describe('externalContextTurn', () => {
  it('dedupes external context roots by normalized path', () => {
    expect(
      dedupeExternalContextPaths(['/proj/a', '/proj/a/', '/proj/b']),
    ).toEqual(['/proj/a', '/proj/b']);
  });

  it('keeps a directory root when only a file INSIDE it is attached (scope over siblings)', () => {
    // A pill for one file under /proj/a must not cancel the /proj/a directory
    // root — the agent still needs the root to reach sibling files.
    const attached = ['/proj/a/src/foo.ts'];
    expect(
      filterRedundantExternalContextPaths(['/proj/a', '/proj/b'], attached),
    ).toEqual(['/proj/a', '/proj/b']);
  });

  it('drops a root only when an attached path is the EXACT same path (true duplicate)', () => {
    const attached = ['/proj/a/', '/proj/c/foo.ts'];
    expect(
      filterRedundantExternalContextPaths(['/proj/a', '/proj/b'], attached),
    ).toEqual(['/proj/b']);
  });

  it('returns undefined when every root is an exact duplicate of an attachment', () => {
    expect(
      filterRedundantExternalContextPaths(['/proj/a'], ['/proj/a']),
    ).toBeUndefined();
  });
});
