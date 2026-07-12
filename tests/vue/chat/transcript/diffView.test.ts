import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { DiffLine } from '@/core/types/diff';
import type { ToolDiffData } from '@/core/types/tools';
import DiffView from '@/features/chat/ui/vue/transcript/blocks/DiffView.vue';

/**
 * Parity twin of `diff.characterization.test.ts`: reproduces the same
 * `renderDiffStats`/`renderDiffContent` DOM contracts via `DiffView.vue`.
 */
function makeDiffData(diffLines: DiffLine[], stats = { added: 0, removed: 0 }): ToolDiffData {
  return { filePath: 'file.ts', diffLines, stats };
}

describe('DiffView', () => {
  describe('part="diff" (default)', () => {
    it('caps an all-insert new-file diff at 20 lines with a "... N more lines" separator', () => {
      const diffLines: DiffLine[] = Array.from({ length: 25 }, (_, i) => ({
        type: 'insert' as const,
        text: `line ${i}`,
        newLineNum: i + 1,
      }));
      const { container } = render(DiffView, { props: { diffData: makeDiffData(diffLines) } });

      const root = container.querySelector('.specorator-write-edit-diff') as HTMLElement;
      expect(root).not.toBeNull();
      const hunks = root.querySelectorAll(':scope > .specorator-diff-hunk');
      expect(hunks).toHaveLength(1);
      const lines = hunks[0].querySelectorAll('.specorator-diff-line');
      expect(lines).toHaveLength(20);
      expect(lines[0].classList.contains('specorator-diff-insert')).toBe(true);
      expect(lines[0].querySelector('.specorator-diff-prefix')?.textContent).toBe('+');
      expect(lines[0].querySelector('.specorator-diff-text')?.textContent).toBe('line 0');

      const separator = root.querySelector(':scope > .specorator-diff-separator');
      expect(separator?.textContent).toBe('... 5 more lines');
    });

    it('does NOT cap an all-insert diff at exactly the cap (20 lines)', () => {
      const diffLines: DiffLine[] = Array.from({ length: 20 }, (_, i) => ({
        type: 'insert' as const,
        text: `line ${i}`,
        newLineNum: i + 1,
      }));
      const { container } = render(DiffView, { props: { diffData: makeDiffData(diffLines) } });

      expect(container.querySelector('.specorator-diff-separator')).toBeNull();
      expect(container.querySelectorAll('.specorator-diff-line')).toHaveLength(20);
    });

    it('renders "No changes" when there are no changed lines', () => {
      const diffLines: DiffLine[] = [
        { type: 'equal', text: 'a', oldLineNum: 1, newLineNum: 1 },
        { type: 'equal', text: 'b', oldLineNum: 2, newLineNum: 2 },
      ];
      const { container } = render(DiffView, { props: { diffData: makeDiffData(diffLines) } });

      expect(container.querySelector('.specorator-diff-no-changes')?.textContent).toBe('No changes');
    });

    it('renders an empty text line as a bare space', () => {
      const diffLines: DiffLine[] = [{ type: 'insert', text: '', newLineNum: 1 }];
      const { container } = render(DiffView, { props: { diffData: makeDiffData(diffLines) } });

      expect(container.querySelector('.specorator-diff-text')?.textContent).toBe(' ');
    });

    it('separates multiple hunks with a bare "..." divider and renders equal/insert/delete classes + prefixes', () => {
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
      const { container } = render(DiffView, { props: { diffData: makeDiffData(diffLines) } });

      const hunks = container.querySelectorAll(':scope > .specorator-write-edit-diff > .specorator-diff-hunk');
      expect(hunks).toHaveLength(2);
      const separators = container.querySelectorAll(
        ':scope > .specorator-write-edit-diff > .specorator-diff-separator'
      );
      expect(separators).toHaveLength(1);
      expect(separators[0].textContent).toBe('...');

      const firstHunkLine = hunks[0].querySelector('.specorator-diff-line') as HTMLElement;
      expect(firstHunkLine.classList.contains('specorator-diff-delete')).toBe(true);
      expect(firstHunkLine.querySelector('.specorator-diff-prefix')?.textContent).toBe('-');

      const equalLine = hunks[0].querySelector('.specorator-diff-equal') as HTMLElement;
      expect(equalLine.querySelector('.specorator-diff-prefix')?.textContent).toBe(' ');
    });
  });

  describe('part="stats"', () => {
    it('renders only +N when removed is 0', () => {
      const { container } = render(DiffView, {
        props: { diffData: makeDiffData([], { added: 3, removed: 0 }), part: 'stats' },
      });
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('.added')?.textContent).toBe('+3');
      expect(container.querySelector('.removed')).toBeNull();
    });

    it('renders only -N when added is 0', () => {
      const { container } = render(DiffView, {
        props: { diffData: makeDiffData([], { added: 0, removed: 5 }), part: 'stats' },
      });
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('.removed')?.textContent).toBe('-5');
    });

    it('renders +N, a bare space separator, then -N when both are present', () => {
      const { container } = render(DiffView, {
        props: { diffData: makeDiffData([], { added: 2, removed: 4 }), part: 'stats' },
      });
      const spans = container.querySelectorAll('span');
      expect(spans).toHaveLength(3);
      expect(spans[0].className).toBe('added');
      expect(spans[0].textContent).toBe('+2');
      expect(spans[1].className).toBe('');
      expect(spans[1].textContent).toBe(' ');
      expect(spans[2].className).toBe('removed');
      expect(spans[2].textContent).toBe('-4');
    });

    it('renders nothing when both are 0', () => {
      const { container } = render(DiffView, {
        props: { diffData: makeDiffData([], { added: 0, removed: 0 }), part: 'stats' },
      });
      expect(container.querySelectorAll('span')).toHaveLength(0);
    });

    it('does not render the .specorator-write-edit-diff host when part="stats"', () => {
      const { container } = render(DiffView, {
        props: { diffData: makeDiffData([], { added: 1, removed: 0 }), part: 'stats' },
      });
      expect(container.querySelector('.specorator-write-edit-diff')).toBeNull();
    });
  });
});
