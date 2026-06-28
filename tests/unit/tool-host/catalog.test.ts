import { buildCatalog } from '@/tool-host/catalog';
import type { LoadResult } from '@/tool-host/types';

describe('buildCatalog', () => {
  it('maps a load result to file/name/description/secrets plus errors', () => {
    const load: LoadResult = {
      tools: [{ file: 'a.mjs', manifest: { name: 'a', description: 'da', inputSchema: {}, secrets: ['K'] }, handler: async () => '' }],
      errors: [{ file: 'b.mjs', message: 'bad' }],
    };
    expect(buildCatalog(load)).toEqual({
      tools: [{ file: 'a.mjs', name: 'a', description: 'da', secrets: ['K'] }],
      errors: [{ file: 'b.mjs', message: 'bad' }],
    });
  });

  it('defaults secrets to an empty array when the manifest omits them', () => {
    const load: LoadResult = {
      tools: [{ file: 'c.mjs', manifest: { name: 'c', description: 'dc', inputSchema: {} }, handler: async () => '' }],
      errors: [],
    };
    expect(buildCatalog(load).tools[0].secrets).toEqual([]);
  });
});
