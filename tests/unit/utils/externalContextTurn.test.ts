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

  it('drops roots already covered by attached external files', () => {
    const attached = ['/proj/a/src/foo.ts'];
    expect(
      filterRedundantExternalContextPaths(['/proj/a', '/proj/b'], attached),
    ).toEqual(['/proj/b']);
  });
});
