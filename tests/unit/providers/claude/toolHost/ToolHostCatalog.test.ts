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

  it('returns null when the process fails (non-zero exit)', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('boom', 1) });
    expect(res).toBeNull();
  });

  it('returns null on a timeout exit (code -1)', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('', -1) });
    expect(res).toBeNull();
  });

  it('returns null when the runner rejects (process error)', async () => {
    const res = await readCatalog({ runCatalog: () => Promise.reject(new Error('spawn EACCES')) });
    expect(res).toBeNull();
  });

  it('returns null on unparseable stdout', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn('not json') });
    expect(res).toBeNull();
  });

  it('returns null on a clean exit with structurally-invalid JSON', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn(JSON.stringify({ tools: 'nope' })) });
    expect(res).toBeNull();
  });

  it('returns a genuinely-empty payload on a clean exit with no tools', async () => {
    const res = await readCatalog({ runCatalog: fakeSpawn(JSON.stringify({ tools: [], errors: [] })) });
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
