import { setIcon } from 'obsidian';

import { renderLinesExpanded } from './toolLinesExpanded';
import {
  buildWebSearchSegments,
  type WebSearchActionLine,
  type WebSearchSegment,
} from './webSearchViewModel';

function appendToolLink(parent: HTMLElement, title: string, url: string): void {
  const linkEl = parent.createEl('a', { cls: 'specorator-tool-link' });
  linkEl.setAttribute('href', url);
  linkEl.setAttribute('target', '_blank');
  linkEl.setAttribute('rel', 'noopener noreferrer');

  const iconEl = linkEl.createSpan({ cls: 'specorator-tool-link-icon' });
  setIcon(iconEl, 'external-link');
  linkEl.createSpan({ cls: 'specorator-tool-link-title', text: title });
}

function renderActionLine(parent: HTMLElement, line: WebSearchActionLine): void {
  if (line.kind === 'link') {
    appendToolLink(parent, line.title, line.url);
    return;
  }
  parent.createDiv({
    cls: line.kind === 'truncated' ? 'specorator-tool-truncated' : 'specorator-tool-line',
    text: line.text,
  });
}

function renderSegment(container: HTMLElement, segment: WebSearchSegment): void {
  if (segment.type === 'links') {
    const linksEl = container.createDiv({ cls: 'specorator-tool-lines' });
    for (const link of segment.links) {
      appendToolLink(linksEl, link.title, link.url);
    }
    if (segment.summary) {
      container.createDiv({
        cls: 'specorator-tool-web-summary',
        text: segment.summary.length > 800 ? `${segment.summary.slice(0, 800)}...` : segment.summary,
      });
    }
    return;
  }
  if (segment.type === 'actionLines') {
    const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
    for (const line of segment.lines) {
      renderActionLine(linesEl, line);
    }
    return;
  }
  if (segment.type === 'rawLines') {
    renderLinesExpanded(container, segment.text, segment.maxLines);
    return;
  }
  container.createDiv({ cls: 'specorator-tool-empty', text: segment.text });
}

/**
 * Detached lifecycle renderer retained for the still-imperative subagent
 * stream coordinator. Branching and parsing live in the shared DOM-free
 * projection also consumed by `WebSearchView.vue`.
 */
export function renderWebSearchExpanded(
  container: HTMLElement,
  input: Record<string, unknown>,
  result: string | undefined,
): void {
  for (const segment of buildWebSearchSegments(input, result)) {
    renderSegment(container, segment);
  }
}
