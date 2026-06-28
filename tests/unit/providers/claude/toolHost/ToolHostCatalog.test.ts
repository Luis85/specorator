import { readCatalog, unionSecretIds } from '@/providers/claude/toolHost/ToolHostCatalog';
import type { CatalogPayload } from '@/tool-host/types';

function fakeSpawn(stdout: string, code = 0) {
  return () =>
    Promise.resolve({ stdout, stderr: '', code });
}

describe('readCatalog', () => {
  it('parses catalog JSON from stdout', async () => {
    const payload = { tools: [{ file: 'a.mjs', name: 'a', description: 'd' }], errors: [] };
    const res = await readCatalog({ runCatalog: fakeSpawn(JSON.stringify(payload)) });
    expect(res).toEqual(payload);
  });

  it('returns an empty catalog when the process fails', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('boom', 1) });
    expect(res).toEqual({ tools: [], errors: [] });
  });

  it('returns an empty catalog on unparseable stdout', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('not json') });
    expect(res).toEqual({ tools: [], errors: [] });
  });
});

describe('unionSecretIds', () => {
  it('dedupes the union of declared secrets across tools', () => {
    const catalog: CatalogPayload = {
      tools: [
        { file: 'a.mjs', name: 'a', description: '', secrets: ['A'] },
        { file: 'b.mjs', name: 'b', description: '', secrets: ['A', 'B'] },
      ],
      errors: [],
    };
    expect(unionSecretIds(catalog)).toEqual(['A', 'B']);
  });

  it('returns an empty union when no tool declares secrets', () => {
    const catalog: CatalogPayload = {
      tools: [{ file: 'a.mjs', name: 'a', description: '', secrets: [] }],
      errors: [],
    };
    expect(unionSecretIds(catalog)).toEqual([]);
  });
});
