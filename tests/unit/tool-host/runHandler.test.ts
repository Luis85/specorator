import { runHandler } from '@/tool-host/runHandler';
import type { ToolHandlerCtx } from '@/tool-host/types';

const ctx = {} as ToolHandlerCtx;

describe('runHandler', () => {
  it('returns the normalized result of a successful handler', async () => {
    const res = await runHandler(async () => 'ok', {}, ctx, 1000);
    expect(res).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('returns isError when the handler throws', async () => {
    const res = await runHandler(async () => { throw new Error('nope'); }, {}, ctx, 1000);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/nope/);
  });

  it('returns isError when the handler exceeds the timeout', async () => {
    const slow = () => new Promise<string>((r) => setTimeout(() => r('late'), 50));
    const res = await runHandler(slow, {}, ctx, 5);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/timed out/i);
  });
});
