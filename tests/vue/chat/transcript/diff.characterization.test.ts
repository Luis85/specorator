import { beforeEach, describe, expect, it } from 'vitest';

import type { DiffLine } from '@/core/types/diff';
import { renderDiffContent, renderDiffStats } from '@/features/chat/rendering/DiffRenderer';

/**
 * Characterization test: locks the exact DOM contract of the legacy
 * `renderDiffStats`/`renderDiffContent` pure-DOM helpers (classes, prefixes,
 * separators, the new-file display cap, the no-changes state) so
 * `DiffView.vue` can be built to reproduce it exactly. Deleted alongside the
 * legacy renderer in a later cleanup task; its Vue parity twin
 * (`diffView.test.ts`) remains.
 */
describe('renderDiffStats characterization (DOM contract lock)', () => {
  let statsEl: HTMLElement;

  beforeEach(() => {
    statsEl = document.createElement('div');
  });

  it('renders only +N when removed is 0', () => {
    renderDiffStats(statsEl, { added: 3, removed: 0 });
    expect(statsEl.children).toHaveLength(1);
    expect(statsEl.children[0].className).toBe('added');
    expect(statsEl.children[0].textContent).toBe('+3');
  });

  it('renders only -N when added is 0', () => {
    renderDiffStats(statsEl, { added: 0, removed: 5 });
    expect(statsEl.children).toHaveLength(1);
    expect(statsEl.children[0].className).toBe('removed');
    expect(statsEl.children[0].textContent).toBe('-5');
  });

  it('renders +N, a bare space separator, then -N when both are present', () => {
    renderDiffStats(statsEl, { added: 2, removed: 4 });
    expect(statsEl.children).toHaveLength(3);
    expect(statsEl.children[0].className).toBe('added');
    expect(statsEl.children[0].textContent).toBe('+2');
    expect(statsEl.children[1].className).toBe('');
    expect(statsEl.children[1].textContent).toBe(' ');
    expect(statsEl.children[2].className).toBe('removed');
    expect(statsEl.children[2].textContent).toBe('-4');
  });

  it('renders nothing when both are 0', () => {
    renderDiffStats(statsEl, { added: 0, removed: 0 });
    expect(statsEl.children).toHaveLength(0);
  });
});

describe('renderDiffContent characterization (DOM contract lock)', () => {
  let containerEl: HTMLElement;

  beforeEach(() => {
    containerEl = document.createElement('div');
  });

  it('caps an all-insert new-file diff at 20 lines with a "... N more lines" separator', () => {
    const diffLines: DiffLine[] = Array.from({ length: 25 }, (_, i) => ({
      type: 'insert' as const,
      text: `line ${i}`,
      newLineNum: i + 1,
    }));

    renderDiffContent(containerEl, diffLines);

    const hunks = containerEl.querySelectorAll(':scope > .specorator-diff-hunk');
    expect(hunks).toHaveLength(1);
    const lines = hunks[0].querySelectorAll('.specorator-diff-line');
    expect(lines).toHaveLength(20);
    expect(lines[0].classList.contains('specorator-diff-insert')).toBe(true);
    expect(lines[0].querySelector('.specorator-diff-prefix')?.textContent).toBe('+');
    expect(lines[0].querySelector('.specorator-diff-text')?.textContent).toBe('line 0');
    expect(lines[19].querySelector('.specorator-diff-text')?.textContent).toBe('line 19');

    const separator = containerEl.querySelector(':scope > .specorator-diff-separator');
    expect(separator?.textContent).toBe('... 5 more lines');
    // No "no-changes" placeholder and exactly one hunk + one separator as direct children.
    expect(containerEl.children).toHaveLength(2);
  });

  it('does NOT cap an all-insert diff at exactly the cap (20 lines)', () => {
    const diffLines: DiffLine[] = Array.from({ length: 20 }, (_, i) => ({
      type: 'insert' as const,
      text: `line ${i}`,
      newLineNum: i + 1,
    }));

    renderDiffContent(containerEl, diffLines);

    expect(containerEl.querySelector('.specorator-diff-separator')).toBeNull();
    const lines = containerEl.querySelectorAll('.specorator-diff-line');
    expect(lines).toHaveLength(20);
  });

  it('renders "No changes" when there are no changed lines', () => {
    const diffLines: DiffLine[] = [
      { type: 'equal', text: 'a', oldLineNum: 1, newLineNum: 1 },
      { type: 'equal', text: 'b', oldLineNum: 2, newLineNum: 2 },
    ];

    renderDiffContent(containerEl, diffLines);

    const noChanges = containerEl.querySelector('.specorator-diff-no-changes');
    expect(noChanges?.textContent).toBe('No changes');
    expect(containerEl.children).toHaveLength(1);
  });

  it('renders an empty text line as a bare space', () => {
    const diffLines: DiffLine[] = [{ type: 'insert', text: '', newLineNum: 1 }];

    renderDiffContent(containerEl, diffLines);

    const line = containerEl.querySelector('.specorator-diff-line');
    expect(line?.querySelector('.specorator-diff-text')?.textContent).toBe(' ');
  });

  it('separates multiple hunks with a bare "..." divider and renders equal/insert/delete classes + prefixes', () => {
    // Two far-apart changes (beyond 2*contextLines apart) so they land in separate hunks.
    const diffLines: DiffLine[] = [
      { type: 'delete', text: 'removed at top', oldLineNum: 1 },
      ...Array.from({ length: 10 }, (_, i) => ({
        type: 'equal' as const,
        text: `context ${i}`,
        oldLineNum: i + 2,
        newLineNum: i + 1,
      })),
      { type: 'insert', text: 'added at bottom', newLineNum: 12 },
    ];

    renderDiffContent(containerEl, diffLines);

    const hunks = containerEl.querySelectorAll(':scope > .specorator-diff-hunk');
    expect(hunks).toHaveLength(2);
    const separators = containerEl.querySelectorAll(':scope > .specorator-diff-separator');
    expect(separators).toHaveLength(1);
    expect(separators[0].textContent).toBe('...');

    const firstHunkLine = hunks[0].querySelector('.specorator-diff-line') as HTMLElement;
    expect(firstHunkLine.classList.contains('specorator-diff-delete')).toBe(true);
    expect(firstHunkLine.querySelector('.specorator-diff-prefix')?.textContent).toBe('-');

    const secondHunkLine = hunks[1].querySelector(
      '.specorator-diff-line:last-child'
    ) as HTMLElement;
    expect(secondHunkLine.classList.contains('specorator-diff-insert')).toBe(true);
    expect(secondHunkLine.querySelector('.specorator-diff-prefix')?.textContent).toBe('+');

    const equalLine = hunks[0].querySelector('.specorator-diff-equal') as HTMLElement;
    expect(equalLine.querySelector('.specorator-diff-prefix')?.textContent).toBe(' ');
  });
});
