/**
 * Renders up to `maxLines` of a tool result as `.specorator-tool-line` rows,
 * stripping leading `N→` gutters and appending a truncation indicator when the
 * result is longer. The shared line renderer reused by every expanded tool view.
 */
export function renderLinesExpanded(
  container: HTMLElement,
  result: string,
  maxLines: number,
  hoverable = false,
): void {
  const lines = result.split(/\r?\n/);
  const truncated = lines.length > maxLines;
  const displayLines = truncated ? lines.slice(0, maxLines) : lines;

  const linesEl = container.createDiv({ cls: 'specorator-tool-lines' });
  for (const line of displayLines) {
    const stripped = line.replace(/^\s*\d+→/, '');
    const lineEl = linesEl.createDiv({ cls: 'specorator-tool-line' });
    if (hoverable) lineEl.addClass('hoverable');
    lineEl.setText(stripped || ' ');
  }

  if (truncated) {
    linesEl.createDiv({
      cls: 'specorator-tool-truncated',
      text: `... ${lines.length - maxLines} more lines`,
    });
  }
}
