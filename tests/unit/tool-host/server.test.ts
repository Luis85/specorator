import { buildToolHandlers } from '@/tool-host/server';
import type { LoadedTool, ToolHandlerCtx } from '@/tool-host/types';

const ctx = { logger: { info() {}, warn() {}, error() {} } } as unknown as ToolHandlerCtx;

const tool: LoadedTool = {
  file: 'wc.mjs',
  manifest: { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
  handler: async (input) => String((input.text as string).split(' ').length),
};

describe('buildToolHandlers', () => {
  it('lists registered tools with their JSON Schema', async () => {
    const { listTools } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await listTools();
    expect(res.tools).toEqual([
      { name: 'word_count', description: 'd', inputSchema: { type: 'object' } },
    ]);
  });

  it('routes a CallTool request to the matching handler', async () => {
    const { callTool } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await callTool({ params: { name: 'word_count', arguments: { text: 'a b c' } } });
    expect(res).toEqual({ content: [{ type: 'text', text: '3' }] });
  });

  it('returns isError for an unknown tool name', async () => {
    const { callTool } = buildToolHandlers([tool], () => ctx, 1000);
    const res = await callTool({ params: { name: 'missing', arguments: {} } });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/unknown tool/i);
  });
});
