import { materializeToolHost } from '@/providers/claude/toolHost/ToolHostMaterializer';

function fakeFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    read: async (p: string) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p)!; },
    write: async (p: string, c: string) => { files.set(p, c); },
  };
}

describe('materializeToolHost', () => {
  it('writes the source when the file is absent', async () => {
    const fs = fakeFs();
    const wrote = await materializeToolHost('/plugin/tool-host.mjs', 'SOURCE', fs);
    expect(wrote).toBe(true);
    expect(fs.files.get('/plugin/tool-host.mjs')).toBe('SOURCE');
  });

  it('skips the write when content already matches', async () => {
    const fs = fakeFs({ '/plugin/tool-host.mjs': 'SOURCE' });
    const wrote = await materializeToolHost('/plugin/tool-host.mjs', 'SOURCE', fs);
    expect(wrote).toBe(false);
  });

  it('overwrites when content differs (version bump)', async () => {
    const fs = fakeFs({ '/plugin/tool-host.mjs': 'OLD' });
    const wrote = await materializeToolHost('/plugin/tool-host.mjs', 'NEW', fs);
    expect(wrote).toBe(true);
    expect(fs.files.get('/plugin/tool-host.mjs')).toBe('NEW');
  });
});
