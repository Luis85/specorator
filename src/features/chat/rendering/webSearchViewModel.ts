import { normalizeWebSearchDisplayData } from './toolLabel';
import {
  hasStructuredWebSearchData,
  isPlaceholderWebSearchResult,
  shouldRenderWebSearchAction,
  type WebSearchExpandedData,
} from './webSearchExpandedHelpers';

export interface WebSearchLink {
  title: string;
  url: string;
}

export type WebSearchActionLine =
  | { kind: 'text'; text: string }
  | { kind: 'link'; title: string; url: string }
  | { kind: 'truncated'; text: string };

export type WebSearchSegment =
  | { type: 'links'; links: WebSearchLink[]; summary: string }
  | { type: 'actionLines'; lines: WebSearchActionLine[] }
  | { type: 'rawLines'; text: string; maxLines: number }
  | { type: 'empty'; text: string };

function parseWebSearchResult(result: string): { links: WebSearchLink[]; summary: string } | null {
  const linksMatch = result.match(/Links:\s*(\[[\s\S]*?\])(?:\n|$)/);
  if (!linksMatch) return null;

  try {
    const parsed = JSON.parse(linksMatch[1]) as WebSearchLink[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const linksEndIndex = result.indexOf(linksMatch[0]) + linksMatch[0].length;
    const summary = result.slice(linksEndIndex).trim();
    return { links: parsed.filter(link => link.title && link.url), summary };
  } catch {
    return null;
  }
}

function buildActionLines(data: WebSearchExpandedData): WebSearchActionLine[] {
  if (!hasStructuredWebSearchData(data)) return [];

  const lines: WebSearchActionLine[] = [];
  switch (data.actionType) {
    case 'open_page':
      lines.push({ kind: 'text', text: 'Open page' });
      lines.push(data.url
        ? { kind: 'link', title: data.url, url: data.url }
        : { kind: 'text', text: 'URL unavailable' });
      break;
    case 'find_in_page':
      lines.push({ kind: 'text', text: 'Find in page' });
      lines.push(data.url
        ? { kind: 'link', title: data.url, url: data.url }
        : { kind: 'text', text: 'URL unavailable' });
      if (data.pattern) {
        lines.push({ kind: 'text', text: `Pattern: ${data.pattern}` });
      }
      break;
    case 'search':
    default: {
      const primaryQuery = data.query || data.queries[0];
      lines.push({ kind: 'text', text: primaryQuery ? `Query: ${primaryQuery}` : 'Search web' });

      const alternateQueries = data.queries.filter(query => query !== primaryQuery);
      for (const query of alternateQueries.slice(0, 4)) {
        lines.push({ kind: 'text', text: `Alt query: ${query}` });
      }
      if (alternateQueries.length > 4) {
        lines.push({ kind: 'truncated', text: `... ${alternateQueries.length - 4} more queries` });
      }
      break;
    }
  }
  return lines;
}

/** Shared DOM-free projection consumed by both Vue and the remaining detached lifecycle renderer. */
export function buildWebSearchSegments(
  input: Record<string, unknown>,
  result: string | undefined,
): WebSearchSegment[] {
  const parsed = result ? parseWebSearchResult(result) : null;
  if (parsed && parsed.links.length > 0) {
    return [{ type: 'links', links: parsed.links, summary: parsed.summary }];
  }

  const data = normalizeWebSearchDisplayData(input);
  if (shouldRenderWebSearchAction(data, result)) {
    const lines = buildActionLines(data);
    if (lines.length > 0) {
      const segments: WebSearchSegment[] = [{ type: 'actionLines', lines }];
      if (result && !isPlaceholderWebSearchResult(result)) {
        segments.push({ type: 'rawLines', text: result, maxLines: 12 });
      }
      return segments;
    }
  }

  if (result) {
    return [{ type: 'rawLines', text: result, maxLines: 20 }];
  }

  const fallbackLines = buildActionLines(data);
  if (fallbackLines.length > 0) {
    return [{ type: 'actionLines', lines: fallbackLines }];
  }

  return [{ type: 'empty', text: 'No result' }];
}
