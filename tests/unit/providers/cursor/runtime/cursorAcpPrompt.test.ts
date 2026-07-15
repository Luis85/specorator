import type { PreparedChatTurn } from '@/core/runtime/types';
import { buildCursorAcpPromptBlocks } from '@/providers/cursor/runtime/cursorAcpPrompt';

function turn(prompt: string, images: Array<{ data: string; mediaType: string }> = []): PreparedChatTurn {
  return {
    isCompact: false,
    mcpMentions: new Set(),
    persistedContent: prompt,
    prompt,
    request: { text: prompt, images } as PreparedChatTurn['request'],
  };
}

describe('buildCursorAcpPromptBlocks', () => {
  it('emits the encoded turn prompt as a single text block', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('hello'), []);
    expect(blocks).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('appends image blocks from the request', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('look', [{ data: 'AAAA', mediaType: 'image/png' }]), []);
    expect(blocks[1]).toEqual({ data: 'AAAA', mimeType: 'image/png', type: 'image' });
  });

  it('bootstraps prior conversation context when history is passed (session/load fallback)', () => {
    const history = [
      { role: 'user', content: 'earlier question' },
      { role: 'assistant', content: 'earlier answer' },
    ] as never;
    const blocks = buildCursorAcpPromptBlocks(turn('follow-up'), history);
    const text = (blocks[0] as { text: string }).text;
    expect(text).toContain('earlier question');
    expect(text).toContain('follow-up');
  });

  it('prepends the bound-agent persona before the prompt', () => {
    const blocks = buildCursorAcpPromptBlocks(turn('do it'), [], 'You are the reviewer.');
    const text = (blocks[0] as { text: string }).text;
    expect(text.startsWith('You are the reviewer.')).toBe(true);
    expect(text).toContain('do it');
  });
});
