import { loadTools } from '@/tool-host/loadTools';
import type { ToolModule } from '@/tool-host/types';

const goodModule: ToolModule = {
  manifest: { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
  handler: async () => 'ok',
};

describe('loadTools', () => {
  it('loads valid .mjs modules and ignores non-.mjs files', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['a.mjs', 'README.md'],
      importModule: async () => goodModule,
    });
    expect(res.tools.map((t) => t.manifest.name)).toEqual(['word_count']);
    expect(res.errors).toEqual([]);
  });

  it('records an error for a module missing a manifest, without sinking others', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['bad.mjs', 'good.mjs'],
      importModule: async (p) =>
        p.endsWith('good.mjs') ? goodModule : ({} as ToolModule),
    });
    expect(res.tools.map((t) => t.file)).toEqual(['good.mjs']);
    expect(res.errors).toEqual([{ file: 'bad.mjs', message: expect.stringMatching(/manifest/i) }]);
  });

  it('records an error when import throws', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => ['x.mjs'],
      importModule: async () => { throw new Error('syntax'); },
    });
    expect(res.tools).toEqual([]);
    expect(res.errors[0]).toEqual({ file: 'x.mjs', message: expect.stringMatching(/syntax/) });
  });

  it('rejects a manifest whose inputSchema root is not type "object"', async () => {
    const bad: ToolModule = {
      manifest: { name: 'b', description: 'd', inputSchema: { type: 'string' } },
      handler: async () => '',
    };
    const res = await loadTools('/tools', {
      readdir: async () => ['bad.mjs', 'good.mjs'],
      importModule: async (p) => (p.endsWith('good.mjs') ? goodModule : bad),
    });
    expect(res.tools.map((t) => t.file)).toEqual(['good.mjs']);
    expect(res.errors).toEqual([{ file: 'bad.mjs', message: expect.stringMatching(/type "object"/) }]);
  });

  it('returns empty when the directory does not exist', async () => {
    const res = await loadTools('/tools', {
      readdir: async () => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); },
      importModule: async () => goodModule,
    });
    expect(res).toEqual({ tools: [], errors: [] });
  });

  it('never imports a file listed in skipFiles', async () => {
    const imported: string[] = [];
    const res = await loadTools(
      '/tools',
      { readdir: async () => ['a.mjs', 'b.mjs'], importModule: async (p) => { imported.push(p); return goodModule; } },
      { skipFiles: new Set(['b.mjs']) },
    );
    expect(res.tools.map((t) => t.file)).toEqual(['a.mjs']);
    expect(imported.some((p) => p.endsWith('b.mjs'))).toBe(false);
  });

  it('converts a hung import into a per-file load error', async () => {
    const res = await loadTools(
      '/tools',
      { readdir: async () => ['hang.mjs'], importModule: () => new Promise<ToolModule>(() => { /* never resolves */ }) },
      { importTimeoutMs: 10 },
    );
    expect(res.tools).toEqual([]);
    expect(res.errors[0]).toEqual({ file: 'hang.mjs', message: expect.stringMatching(/timed out/) });
  });

  it('isolates multiple hung files concurrently — good tools still load', async () => {
    // Parallel import: two never-resolving files both time out at ~10ms (concurrently, not summed),
    // and the good file still loads. (If imports were sequential this would take 2× the timeout.)
    const res = await loadTools(
      '/tools',
      {
        readdir: async () => ['a_hang.mjs', 'b_hang.mjs', 'good.mjs'],
        importModule: async (p) =>
          p.endsWith('good.mjs') ? goodModule : new Promise<ToolModule>(() => { /* never resolves */ }),
      },
      { importTimeoutMs: 10 },
    );
    expect(res.tools.map((t) => t.file)).toEqual(['good.mjs']);
    expect(res.errors.map((e) => e.file).sort()).toEqual(['a_hang.mjs', 'b_hang.mjs']);
  });

  it('rejects a second file that reuses a tool name (first file alphabetically wins)', async () => {
    // Both modules declare name 'word_count' (goodModule already does).
    const dup: ToolModule = { manifest: { name: 'word_count', description: 'd2', inputSchema: { type: 'object' } }, handler: async () => '' };
    const res = await loadTools('/tools', {
      readdir: async () => ['b_dup.mjs', 'a_first.mjs'],
      importModule: async (p) => (p.endsWith('a_first.mjs') ? goodModule : dup),
    });
    // a_first.mjs sorts first and keeps the name; b_dup.mjs is rejected.
    expect(res.tools.map((t) => t.file)).toEqual(['a_first.mjs']);
    expect(res.errors).toEqual([{ file: 'b_dup.mjs', message: expect.stringMatching(/Duplicate tool name "word_count"/) }]);
  });

  it('rejects a manifest whose secrets field is not a string array', async () => {
    const badSecrets = { manifest: { name: 's', description: 'd', inputSchema: { type: 'object' }, secrets: 'KEY' }, handler: async () => '' };
    const res = await loadTools('/tools', {
      readdir: async () => ['s.mjs'],
      importModule: async () => badSecrets as unknown as ToolModule,
    });
    expect(res.tools).toEqual([]);
    expect(res.errors[0]).toEqual({ file: 's.mjs', message: expect.stringMatching(/secrets.*string array/) });
  });
});
