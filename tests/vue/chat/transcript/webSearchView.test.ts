import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WebSearchView from '@/features/chat/ui/vue/transcript/blocks/WebSearchView.vue';

beforeEach(() => {
  vi.clearAllMocks();
});

function mountView(input: Record<string, unknown>, result?: string) {
  return render(WebSearchView, { props: { input, result } });
}

describe('WebSearchView', () => {
  it('renders parsed result links + trailing summary, taking priority over the action card', async () => {
    const { container } = mountView(
      { query: 'obsidian plugin api' },
      'Links: [{"title":"Obsidian API","url":"https://docs.obsidian.md"}]\n\nThe official docs.'
    );
    await flushPromises();

    const links = container.querySelectorAll('.specorator-tool-link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://docs.obsidian.md');
    expect(links[0].querySelector('.specorator-tool-link-title')?.textContent).toBe('Obsidian API');
    expect(container.querySelector('.specorator-tool-web-summary')?.textContent).toBe('The official docs.');
    // No action-card line should also render alongside the links.
    expect(container.querySelector('.specorator-tool-line')).toBeNull();
  });

  it('truncates a long summary to 800 chars with an ellipsis', async () => {
    const longSummary = 'x'.repeat(900);
    const { container } = mountView(
      {},
      `Links: [{"title":"A","url":"https://a.com"}]\n\n${longSummary}`
    );
    await flushPromises();

    const summary = container.querySelector('.specorator-tool-web-summary')?.textContent ?? '';
    expect(summary).toHaveLength(803);
    expect(summary.endsWith('...')).toBe(true);
  });

  it('renders the open_page action card with a link when a placeholder result is present', async () => {
    const { container } = mountView(
      { actionType: 'open_page', url: 'https://example.com/docs' },
      'Search complete'
    );
    await flushPromises();

    const lines = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['Open page']);
    const links = container.querySelectorAll('.specorator-tool-link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com/docs');
  });

  it('renders "URL unavailable" for open_page with no url', async () => {
    const { container } = mountView({ actionType: 'open_page' }, undefined);
    await flushPromises();

    const lines = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['Open page', 'URL unavailable']);
  });

  it('renders find_in_page with url link + pattern line', async () => {
    const { container } = mountView(
      { actionType: 'find_in_page', url: 'https://example.com/docs', pattern: 'tools' },
      'Search complete'
    );
    await flushPromises();

    const lines = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['Find in page', 'Pattern: tools']);
    expect(container.querySelectorAll('.specorator-tool-link')).toHaveLength(1);
  });

  it('renders search action card with primary + alt queries, capped at 4 with a truncation footer', async () => {
    const { container } = mountView({
      actionType: 'search',
      query: 'primary query',
      queries: ['primary query', 'alt 1', 'alt 2', 'alt 3', 'alt 4', 'alt 5'],
    });
    await flushPromises();

    const lines = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(lines).toEqual(['Query: primary query', 'Alt query: alt 1', 'Alt query: alt 2', 'Alt query: alt 3', 'Alt query: alt 4']);
    expect(container.querySelector('.specorator-tool-truncated')?.textContent).toBe('... 1 more queries');
  });

  it('renders the action card followed by raw result lines for open_page with a non-placeholder result', async () => {
    // open_page/find_in_page always prefer the action card ahead of any raw
    // result (unlike "search", which only shows the card when the result is
    // absent or a placeholder — see the next two tests).
    const { container } = mountView(
      { actionType: 'open_page', url: 'https://example.com' },
      'raw result line 1\nraw result line 2'
    );
    await flushPromises();

    const lineGroups = Array.from(container.querySelectorAll('.specorator-tool-lines'));
    expect(lineGroups).toHaveLength(2);
    const allLineTexts = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(allLineTexts).toEqual(['Open page', 'raw result line 1', 'raw result line 2']);
  });

  it('skips the action card for a "search" actionType when a non-placeholder result is present', async () => {
    // shouldRenderWebSearchAction only fires ahead of the result for
    // open_page/find_in_page, or when the result is absent/a placeholder.
    const { container } = mountView(
      { actionType: 'search', query: 'q' },
      'raw result line 1\nraw result line 2'
    );
    await flushPromises();

    const lineGroups = Array.from(container.querySelectorAll('.specorator-tool-lines'));
    expect(lineGroups).toHaveLength(1);
    const allLineTexts = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(allLineTexts).toEqual(['raw result line 1', 'raw result line 2']);
  });

  it('renders the search action card when the result is only a placeholder', async () => {
    const { container } = mountView({ actionType: 'search', query: 'q' }, 'Search complete');
    await flushPromises();

    const allLineTexts = Array.from(container.querySelectorAll('.specorator-tool-line')).map(el => el.textContent);
    expect(allLineTexts).toEqual(['Query: q']);
  });

  it('renders raw result lines (20-line cap) when there is no structured input', async () => {
    const manyLines = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n');
    const { container } = mountView({}, manyLines);
    await flushPromises();

    expect(container.querySelectorAll('.specorator-tool-line')).toHaveLength(20);
    expect(container.querySelector('.specorator-tool-truncated')?.textContent).toBe('... 5 more lines');
  });

  it('renders "No result" when there is no result and no structured input', async () => {
    const { container } = mountView({}, undefined);
    await flushPromises();

    expect(container.querySelector('.specorator-tool-empty')?.textContent).toBe('No result');
  });
});
