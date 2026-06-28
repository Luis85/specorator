import { setIcon } from 'obsidian';

import { normalizeWebSearchDisplayData } from './toolLabel';
import { renderLinesExpanded } from './toolLinesExpanded';
import { isPlaceholderWebSearchResult, shouldRenderWebSearchAction } from './webSearchExpandedHelpers';

interface WebSearchLink {
  title: string;
  url: string;
}

function appendToolLink(parent: HTMLElement, title: string, url: string): void {
  const linkEl = parent.createEl('a', { cls: 'specorator-tool-link' });
  linkEl.setAttribute('href', url);
  linkEl.setAttribute('target', '_blank');
  linkEl.setAttribute('rel', 'noopener noreferrer');

  const iconEl = linkEl.createSpan({ cls: 'specorator-tool-link-icon' });
  setIcon(iconEl, 'external-link');

  linkEl.createSpan({ cls: 'specorator-tool-link-title', text: title });
}

function parseWebSearchResult(result: string): { links: WebSearchLink[]; summary: string } | null {
  const linksMatch = result.match(/Links:\s*(\[[\s\S]*?\])(?:\n|$)/);
  if (!linksMatch) return null;

  try {
    const parsed = JSON.parse(linksMatch[1]) as WebSearchLink[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const linksEndIndex = result.indexOf(linksMatch[0]) + linksMatch[0].length;
    const summary = result.slice(linksEndIndex).trim();
    return { links: parsed.filter(l => l.title && l.url), summary };
  } catch {
    return null;
  }
}

function renderWebSearchActionExpanded(container: HTMLElement, input: Record<string, unknown>): boolean {
  const data = normalizeWebSearchDisplayData(input);
  const hasStructuredData = Boolean(data.actionType || data.query || data.queries.length || data.url || data.pattern);
  if (!hasStructuredData) {
    return false;
  }

  const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });

  switch (data.actionType) {
    case 'open_page':
      linesEl.createDiv({ cls: 'specorator-tool-line', text: 'Open page' });
      if (data.url) {
        appendToolLink(linesEl, data.url, data.url);
      } else {
        linesEl.createDiv({ cls: 'specorator-tool-line', text: 'URL unavailable' });
      }
      return true;

    case 'find_in_page':
      linesEl.createDiv({ cls: 'specorator-tool-line', text: 'Find in page' });
      if (data.url) {
        appendToolLink(linesEl, data.url, data.url);
      } else {
        linesEl.createDiv({ cls: 'specorator-tool-line', text: 'URL unavailable' });
      }
      if (data.pattern) {
        linesEl.createDiv({ cls: 'specorator-tool-line', text: `Pattern: ${data.pattern}` });
      }
      return true;

    case 'search':
    default: {
      const primaryQuery = data.query || data.queries[0];
      linesEl.createDiv({
        cls: 'specorator-tool-line',
        text: primaryQuery ? `Query: ${primaryQuery}` : 'Search web',
      });

      const alternateQueries = data.queries.filter(query => query !== primaryQuery);
      for (const query of alternateQueries.slice(0, 4)) {
        linesEl.createDiv({ cls: 'specorator-tool-line', text: `Alt query: ${query}` });
      }
      if (alternateQueries.length > 4) {
        linesEl.createDiv({
          cls: 'specorator-tool-truncated',
          text: `... ${alternateQueries.length - 4} more queries`,
        });
      }
      return true;
    }
  }
}

function renderWebSearchParsedLinks(
  container: HTMLElement,
  parsed: { links: WebSearchLink[]; summary: string },
): void {
  const linksEl = container.createDiv({ cls: 'specorator-tool-lines' });
  for (const link of parsed.links) appendToolLink(linksEl, link.title, link.url);
  if (!parsed.summary) return;
  const summaryEl = container.createDiv({ cls: 'specorator-tool-web-summary' });
  summaryEl.setText(parsed.summary.length > 800 ? parsed.summary.slice(0, 800) + '...' : parsed.summary);
}

// Renders the action card and, when present, non-placeholder result lines below it.
function renderWebSearchActionFirst(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string | undefined,
): boolean {
  if (!renderWebSearchActionExpanded(container, input)) return false;
  if (result && !isPlaceholderWebSearchResult(result)) renderLinesExpanded(container, result, 12);
  return true;
}

export function renderWebSearchExpanded(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string | undefined,
): void {
  const parsed = result ? parseWebSearchResult(result) : null;
  if (parsed && parsed.links.length > 0) {
    renderWebSearchParsedLinks(container, parsed);
    return;
  }

  const data = normalizeWebSearchDisplayData(input);
  if (shouldRenderWebSearchAction(data, result) && renderWebSearchActionFirst(container, input, result)) {
    return;
  }

  if (result) {
    renderLinesExpanded(container, result, 20);
    return;
  }

  if (renderWebSearchActionExpanded(container, input)) return;

  container.createDiv({ cls: 'specorator-tool-empty', text: 'No result' });
}
