import { createMockEl } from '@test/helpers/mockElement';
import { type App, setIcon } from 'obsidian';

import { renderExpandedContent, setToolIcon } from '@/features/chat/rendering/ToolCallRenderer';

jest.mock('obsidian', () => ({
  setIcon: jest.fn(),
}));

const mockApp = {
  workspace: { openLinkText: jest.fn() },
  metadataCache: { getFirstLinkpathDest: jest.fn(() => null) },
  vault: { getAbstractFileByPath: jest.fn(() => null) },
} as unknown as App;

describe('detached tool content renderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders raw lines for a read result', () => {
    const container = createMockEl();

    renderExpandedContent(mockApp, container, 'Read', 'first\nsecond');

    expect(Array.from(
      container.querySelectorAll('.specorator-tool-line') as unknown as HTMLElement[],
      el => el.textContent,
    ))
      .toEqual(['first', 'second']);
  });

  it('uses the shared web-search projection', () => {
    const container = createMockEl();

    renderExpandedContent(
      mockApp,
      container,
      'WebSearch',
      'Search complete',
      { actionType: 'search', query: 'obsidian' },
    );

    expect(container.querySelector('.specorator-tool-line')?.textContent).toBe('Query: obsidian');
  });

  it('renders the MCP marker through the shared icon adapter', () => {
    const el = createMockEl();

    setToolIcon(el, 'mcp__server__tool');

    expect(el.children[0]?.tagName).toBe('SVG');
    expect(setIcon).not.toHaveBeenCalled();
  });
});
