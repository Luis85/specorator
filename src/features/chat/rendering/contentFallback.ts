/** Renders plain text into a tool-result row — the shared fallback used by the
 * tool renderers when there is no specialized view for a result. */
export function contentFallback(container: HTMLElement, text: string): void {
  const resultRow = container.createDiv({ cls: 'specorator-tool-result-row' });
  const resultText = resultRow.createSpan({ cls: 'specorator-tool-result-text' });
  resultText.setText(text);
}
