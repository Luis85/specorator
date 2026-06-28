import { readCatalog } from '@/providers/claude/toolHost/ToolHostCatalog';

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
