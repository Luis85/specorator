import { createMockEl, type MockElement } from '@test/helpers/mockElement';
import { type App,setIcon } from 'obsidian';

import type { ToolCallInfo } from '@/core/types';
import {
  addSubagentToolCall,
  createAsyncSubagentBlock,
  createSubagentBlock,
  finalizeAsyncSubagent,
  finalizeSubagentBlock,
  markAsyncSubagentOrphaned,
  updateAsyncSubagentRunning,
  updateSubagentToolResult,
} from '@/features/chat/rendering/SubagentRenderer';

const mockApp = {
  workspace: { openLinkText: jest.fn() },
  metadataCache: { getFirstLinkpathDest: jest.fn(() => null) },
  vault: { getAbstractFileByPath: jest.fn(() => null) },
} as unknown as App;

const getTextByClass = (el: MockElement, cls: string): string[] => {
  const results: string[] = [];
  const visit = (node: MockElement) => {
    if (node.hasClass(cls)) {
      results.push(node.textContent);
    }
    node.children.forEach(visit);
  };
  visit(el);
  return results;
};

describe('Sync Subagent Renderer', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  describe('createSubagentBlock', () => {
    it('should start collapsed by default', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(state.info.isExpanded).toBe(false);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
    });

    it('should set aria-expanded to false by default', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(state.headerEl.getAttribute('aria-expanded')).toBe('false');
    });

    it('should hide content by default', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect((state.contentEl as any).style.display).toBe('none');
    });

    it('should set correct ARIA attributes for accessibility', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(state.headerEl.getAttribute('role')).toBe('button');
      expect(state.headerEl.getAttribute('tabindex')).toBe('0');
      expect(state.headerEl.getAttribute('aria-expanded')).toBe('false');
      expect(state.headerEl.getAttribute('aria-label')).toContain('click to expand');
    });

    it('should toggle expand/collapse on header click', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      // Initially collapsed
      expect(state.info.isExpanded).toBe(false);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
      expect((state.contentEl as any).style.display).toBe('none');

      // Trigger click
      (state.headerEl as any).click();

      // Should be expanded
      expect(state.info.isExpanded).toBe(true);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);
      expect((state.contentEl as any).hasClass('specorator-hidden')).toBe(false);

      // Click again to collapse
      (state.headerEl as any).click();
      expect(state.info.isExpanded).toBe(false);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
      expect((state.contentEl as any).style.display).toBe('none');
    });

    it('should update aria-expanded on toggle', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      // Initially collapsed
      expect(state.headerEl.getAttribute('aria-expanded')).toBe('false');

      // Expand
      (state.headerEl as any).click();
      expect(state.headerEl.getAttribute('aria-expanded')).toBe('true');

      // Collapse
      (state.headerEl as any).click();
      expect(state.headerEl.getAttribute('aria-expanded')).toBe('false');
    });

    it('should show description in label', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'My task description' });

      expect(state.labelEl.textContent).toBe('My task description');
    });

    it('should not show a tool count badge in the header', () => {
      const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(getTextByClass(state.wrapperEl as any, 'specorator-subagent-count')).toEqual([]);
    });
  });

});

describe('keyboard navigation', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  it('should support keyboard navigation (Enter/Space) on createSubagentBlock', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    // Simulate keydown event
    const keydownHandlers: Array<(e: any) => void> = [];
    const originalAddEventListener = state.headerEl.addEventListener;
    state.headerEl.addEventListener = (event: string, handler: (e: any) => void) => {
      if (event === 'keydown') {
        keydownHandlers.push(handler);
      }
      originalAddEventListener.call(state.headerEl, event, handler);
    };

    // Re-check - the handler should already be registered
    // We need to dispatch a keydown event
    const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
    (state.headerEl as any).dispatchEvent({ type: 'keydown', ...enterEvent });

    // The handler should have been called and expanded
    expect(state.info.isExpanded).toBe(true);
    expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);

    // Space to collapse
    const spaceEvent = { key: ' ', preventDefault: jest.fn() };
    (state.headerEl as any).dispatchEvent({ type: 'keydown', ...spaceEvent });

    expect(state.info.isExpanded).toBe(false);
    expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
  });

});

describe('Async Subagent Renderer', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  describe('inline display behavior', () => {
    it('should start collapsed', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(state.info.isExpanded).toBe(false);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(false);
    });

    it('should have aria-label indicating expand action', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      expect(state.headerEl.getAttribute('aria-label')).toContain('click to expand');
    });

    it('should expand content when header is clicked', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      // Initially collapsed
      expect(state.info.isExpanded).toBe(false);

      // Trigger click to expand
      (state.headerEl as any).click();

      expect(state.info.isExpanded).toBe(true);
      expect((state.wrapperEl as any).hasClass('expanded')).toBe(true);
    });

    it('should toggle expansion on repeated clicks', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

      // Click to expand
      (state.headerEl as any).click();
      expect(state.info.isExpanded).toBe(true);

      // Click to collapse
      (state.headerEl as any).click();
      expect(state.info.isExpanded).toBe(false);
    });

    it('should expand when Enter key is pressed', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test' });

      const enterEvent = { key: 'Enter', preventDefault: jest.fn() };
      (state.headerEl as any).dispatchEvent({ type: 'keydown', ...enterEvent });

      expect(state.info.isExpanded).toBe(true);
    });

    it('should expand when Space key is pressed', () => {
      const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test' });

      const spaceEvent = { key: ' ', preventDefault: jest.fn() };
      (state.headerEl as any).dispatchEvent({ type: 'keydown', ...spaceEvent });

      expect(state.info.isExpanded).toBe(true);
    });
  });

  it('shows label immediately and initializing status text', () => {
    const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Background job' });

    expect(state.labelEl.textContent).toBe('Background job');
    expect(state.statusTextEl.textContent).toBe('Initializing');
    expect((state.wrapperEl as any).getClasses()).toEqual(expect.arrayContaining(['async', 'pending']));
  });

  it('shows prompt in content and keeps label visible while running', () => {
    const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-2', { description: 'Background job', prompt: 'Do the work' });

    updateAsyncSubagentRunning(state, 'agent-xyz');

    expect(state.labelEl.textContent).toBe('Background job');
    expect(state.statusTextEl.textContent).toBe('Running in background');
    const contentText = getTextByClass(state.contentEl as any, 'specorator-subagent-prompt-text')[0];
    expect(contentText).toContain('Do the work');
    expect((state.wrapperEl as any).getClasses()).toEqual(expect.arrayContaining(['running', 'async']));
  });

  it('finalizes to completed and reveals description', () => {
    const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-3', { description: 'Background job' });
    state.info.toolCalls.push(
      {
        id: 'tool-1',
        name: 'Read',
        input: { file_path: 'a.md' },
        status: 'completed',
        result: 'A',
        isExpanded: false,
      },
      {
        id: 'tool-2',
        name: 'Grep',
        input: { pattern: 'x' },
        status: 'completed',
        result: 'B',
        isExpanded: false,
      }
    );
    updateAsyncSubagentRunning(state, 'agent-complete');

    (setIcon as jest.Mock).mockClear();
    finalizeAsyncSubagent(state, 'all done', false);

    expect(state.labelEl.textContent).toBe('Background job');
    expect(state.statusTextEl.textContent).toBe('');
    expect((state.wrapperEl as any).hasClass('done')).toBe(true);
    const contentText = getTextByClass(state.contentEl as any, 'specorator-subagent-result-output')[0];
    expect(contentText).toBe('all done');
    const lastIcon = (setIcon as jest.Mock).mock.calls.pop();
    expect(lastIcon?.[1]).toBe('check');
  });

  it('finalizes to error and truncates error message', () => {
    const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-4', { description: 'Background job' });
    updateAsyncSubagentRunning(state, 'agent-error');

    (setIcon as jest.Mock).mockClear();
    finalizeAsyncSubagent(state, 'failure happened', true);

    expect(state.statusTextEl.textContent).toBe('Error');
    expect((state.wrapperEl as any).hasClass('error')).toBe(true);
    const contentText = getTextByClass(state.contentEl as any, 'specorator-subagent-result-output')[0];
    expect(contentText).toBe('failure happened');
    const lastIcon = (setIcon as jest.Mock).mock.calls.pop();
    expect(lastIcon?.[1]).toBe('x');
  });

  it('marks async subagent as orphaned', () => {
    const state = createAsyncSubagentBlock(mockApp, parentEl as any, 'task-5', { description: 'Background job' });

    markAsyncSubagentOrphaned(state);

    expect(state.statusTextEl.textContent).toBe('Orphaned');
    expect((state.wrapperEl as any).hasClass('orphaned')).toBe(true);
    const contentText = getTextByClass(state.contentEl as any, 'specorator-subagent-result-output')[0];
    expect(contentText).toContain('Conversation ended before task completed');
  });

});

describe('addSubagentToolCall', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  it('adds tool call to state without rendering a header count', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    const toolCall: ToolCallInfo = {
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'test.md' },
      status: 'running',
      isExpanded: false,
    };

    addSubagentToolCall(state, toolCall);

    expect(state.info.toolCalls).toHaveLength(1);
    expect(getTextByClass(state.wrapperEl as any, 'specorator-subagent-count')).toEqual([]);
  });

  it('clears previous content and renders new tool item', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    const toolCall1: ToolCallInfo = {
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'test.md' },
      status: 'running',
      isExpanded: false,
    };
    addSubagentToolCall(state, toolCall1);

    const toolCall2: ToolCallInfo = {
      id: 'tool-2',
      name: 'Grep',
      input: { pattern: 'test' },
      status: 'running',
      isExpanded: false,
    };
    addSubagentToolCall(state, toolCall2);

    expect(state.info.toolCalls).toHaveLength(2);
    expect(getTextByClass(state.wrapperEl as any, 'specorator-subagent-count')).toEqual([]);
  });

  it('merges repeated tool IDs instead of duplicating tool rows', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    addSubagentToolCall(state, {
      id: 'tool-1',
      name: 'Write',
      input: {},
      status: 'running',
      isExpanded: false,
    });

    addSubagentToolCall(state, {
      id: 'tool-1',
      name: 'Write',
      input: { file_path: 'notes.md' },
      status: 'running',
      isExpanded: false,
    });

    expect(state.info.toolCalls).toHaveLength(1);
    expect(state.info.toolCalls[0]).toEqual(
      expect.objectContaining({
        id: 'tool-1',
        input: { file_path: 'notes.md' },
      })
    );
    expect(getTextByClass(state.wrapperEl as any, 'specorator-subagent-count')).toEqual([]);
    expect(getTextByClass(state.toolsContainerEl as any, 'specorator-subagent-tool-name')).toEqual(['Write']);
    expect(getTextByClass(state.toolsContainerEl as any, 'specorator-subagent-tool-summary')).toEqual(['notes.md']);
  });
});

describe('updateSubagentToolResult', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  it('updates tool call status in state', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    const toolCall: ToolCallInfo = {
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'test.md' },
      status: 'running',
      isExpanded: false,
    };
    addSubagentToolCall(state, toolCall);

    const updatedToolCall: ToolCallInfo = {
      ...toolCall,
      status: 'completed',
      result: 'File contents here',
    };
    updateSubagentToolResult(state, 'tool-1', updatedToolCall);

    expect(state.info.toolCalls[0].status).toBe('completed');
  });

  it('does not update tool call for non-matching tool ID', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    const toolCall: ToolCallInfo = {
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'test.md' },
      status: 'running',
      isExpanded: false,
    };
    addSubagentToolCall(state, toolCall);

    updateSubagentToolResult(state, 'tool-999', { ...toolCall, id: 'tool-999', status: 'completed' });

    expect(state.info.toolCalls[0].status).toBe('running');
  });
});

describe('finalizeSubagentBlock', () => {
  let parentEl: MockElement;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl('div');
  });

  it('sets status to completed and adds done class', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    (setIcon as jest.Mock).mockClear();
    finalizeSubagentBlock(state, 'All done', false);

    expect(state.info.status).toBe('completed');
    expect(state.info.result).toBe('All done');
    expect((state.wrapperEl as any).hasClass('done')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'check');
  });

  it('sets status to error and adds error class', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    (setIcon as jest.Mock).mockClear();
    finalizeSubagentBlock(state, 'Something failed', true);

    expect(state.info.status).toBe('error');
    expect(state.info.result).toBe('Something failed');
    expect((state.wrapperEl as any).hasClass('error')).toBe(true);
    expect(setIcon).toHaveBeenCalledWith(expect.anything(), 'x');
  });

  it('keeps tool history and shows result section text', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    // Add a tool call first to populate content
    addSubagentToolCall(state, {
      id: 'tool-1',
      name: 'Read',
      input: { file_path: 'test.md' },
      status: 'running',
      isExpanded: false,
    });

    finalizeSubagentBlock(state, 'Done', false);

    const doneText = getTextByClass(state.contentEl as any, 'specorator-subagent-result-output')[0];
    expect(doneText).toBe('Done');
  });

  it('shows ERROR text when isError is true', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    finalizeSubagentBlock(state, 'Error occurred', true);

    const errorText = getTextByClass(state.contentEl as any, 'specorator-subagent-result-output')[0];
    expect(errorText).toBe('Error occurred');
  });

  it('does not restore a tool count badge after finalization', () => {
    const state = createSubagentBlock(mockApp, parentEl as any, 'task-1', { description: 'Test task' });

    addSubagentToolCall(state, {
      id: 'tool-1',
      name: 'Read',
      input: {},
      status: 'running',
      isExpanded: false,
    });
    addSubagentToolCall(state, {
      id: 'tool-2',
      name: 'Grep',
      input: {},
      status: 'running',
      isExpanded: false,
    });

    finalizeSubagentBlock(state, 'Done', false);

    expect(getTextByClass(state.wrapperEl as any, 'specorator-subagent-count')).toEqual([]);
  });
});
