import {
  getToolName,
  getToolSummary,
  isBlockedToolResult,
} from '@/features/chat/rendering/toolCallViewModel';

describe('toolCallViewModel', () => {
  it('projects todo progress and file summaries', () => {
    expect(getToolName('TodoWrite', {
      todos: [{ status: 'completed' }, { status: 'pending' }],
    })).toBe('Tasks 1/2');
    expect(getToolSummary('Read', { file_path: '/vault/notes/a.md' })).toBe('a.md');
  });

  it('projects provider lifecycle summaries', () => {
    expect(getToolSummary('wait', { ids: ['a', 'b'], timeout_ms: 5000 }))
      .toBe('2 agents, 5s');
  });

  it('detects blocked text in strings and structured content', () => {
    expect(isBlockedToolResult('Requires approval from user')).toBe(true);
    expect(isBlockedToolResult([{ type: 'text', text: 'Access denied' }])).toBe(true);
    expect(isBlockedToolResult('deny permission', false)).toBe(false);
    expect(isBlockedToolResult('deny permission', true)).toBe(true);
  });
});
