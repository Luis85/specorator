/**
 * T-RR-031 (RED) — `DiffView.vue` per-line declarative diff render (TEST-RR-019, EC-RR-5).
 *
 * SPEC-RR-029. Renders each `DiffLine` as per-line declarative spans: a 16px
 * centred monospace prefix gutter (`+`/`−`/space) + a text span (`text || ' '`,
 * parity `DiffRenderer.ts:131`). Insert → `--sp-diff-insert-bg`, delete →
 * `--sp-diff-delete-bg`, equal muted — background-highlight only, NO
 * strikethrough/`text-decoration` (REQ-RR-025). An all-insert new file with
 * `diffLines.length > NEW_FILE_DISPLAY_CAP` (= 20) shows the first 20 + a
 * "... N more lines" footer (EC-RR-5). NO `v-html` (NFR-RR-006). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-025/027, NFR-RR-006/007.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DiffView from '@/ui/chat/DiffView.vue';
import type { ToolDiffData } from '@/domain/chat/diff/Diff';
import { DiffViewPageObject } from './DiffView.po';

function mountDiff(diffData: ToolDiffData) {
	const wrapper = mount(DiffView, { props: { diffData } });
	return { wrapper, po: new DiffViewPageObject(wrapper) };
}

const mixed: ToolDiffData = {
	filePath: 'src/a.ts',
	diffLines: [
		{ type: 'equal', text: 'const x = 1;', oldLineNum: 1, newLineNum: 1 },
		{ type: 'delete', text: 'const y = 2;', oldLineNum: 2 },
		{ type: 'insert', text: 'const y = 3;', newLineNum: 2 },
		{ type: 'insert', text: 'const z = 4;', newLineNum: 3 },
	],
	stats: { added: 2, removed: 1 },
};

describe('DiffView (TEST-RR-019)', () => {
	it('renders one declarative line per DiffLine with a prefix gutter + text span', () => {
		const { po } = mountDiff(mixed);
		expect(po.exists()).toBe(true);
		expect(po.lineCount()).toBe(4);
		expect(po.lineTexts()).toEqual(['const x = 1;', 'const y = 2;', 'const y = 3;', 'const z = 4;']);
		expect(po.lineTypes()).toEqual(['equal', 'delete', 'insert', 'insert']);
	});

	it('uses +/-/space gutter prefixes per line type', () => {
		const { po } = mountDiff(mixed);
		const gutters = po.gutters();
		expect(gutters[0].trim()).toBe('');
		// SPEC-RR-029 uses the U+2212 minus sign (−) for deletes, not ASCII '-'.
		expect(gutters[1]).toContain('−');
		expect(gutters[2]).toContain('+');
		expect(gutters[3]).toContain('+');
	});

	it('renders an empty line.text as a single space (parity DiffRenderer.ts:131)', () => {
		const { po } = mountDiff({
			filePath: 'f',
			diffLines: [{ type: 'insert', text: '', newLineNum: 1 }],
			stats: { added: 1, removed: 0 },
		});
		// The empty text is rendered as a single space (`text || ' '`), parity DiffRenderer.ts:131.
		expect(po.lineRawTexts()).toEqual([' ']);
	});

	it('does NOT use strikethrough/text-decoration markup for deletes (REQ-RR-025)', () => {
		const { po } = mountDiff(mixed);
		expect(po.html()).not.toContain('text-decoration');
		expect(po.html().toLowerCase()).not.toContain('<del');
		expect(po.html().toLowerCase()).not.toContain('<s>');
	});

	it('EC-RR-5: caps an all-insert new file at NEW_FILE_DISPLAY_CAP (20) + a "... N more lines" footer', () => {
		const diffLines = Array.from({ length: 25 }, (_, i) => ({
			type: 'insert' as const,
			text: `line ${i + 1}`,
			newLineNum: i + 1,
		}));
		const { po } = mountDiff({ filePath: 'big.ts', diffLines, stats: { added: 25, removed: 0 } });
		expect(po.lineCount()).toBe(20);
		expect(po.moreExists()).toBe(true);
		expect(po.moreText()).toContain('5');
		expect(po.moreText()).toContain('more lines');
	});

	it('does not cap a mixed diff (the cap is for all-insert new files only)', () => {
		const diffLines = Array.from({ length: 25 }, (_, i) =>
			i % 2 === 0
				? { type: 'insert' as const, text: `+${i}`, newLineNum: i }
				: { type: 'equal' as const, text: `=${i}`, oldLineNum: i, newLineNum: i },
		);
		const { po } = mountDiff({ filePath: 'm.ts', diffLines, stats: { added: 13, removed: 0 } });
		// The 25-line all-context-around-changes body collapses to hunks (R-RR-004).
		expect(po.moreExists()).toBe(false);
	});
});

describe('DiffView — hunking + context elision (R-RR-004)', () => {
	/** N equal context lines. */
	function equalLines(count: number, offset = 0) {
		return Array.from({ length: count }, (_, i) => ({
			type: 'equal' as const,
			text: `eq ${offset + i + 1}`,
			oldLineNum: offset + i + 1,
			newLineNum: offset + i + 1,
		}));
	}

	it('two distant changes render as two hunks separated by a "..." row, not the whole body', () => {
		const diffLines = [
			{ type: 'insert' as const, text: 'A', newLineNum: 1 },
			...equalLines(40, 1),
			{ type: 'insert' as const, text: 'B', newLineNum: 42 },
		];
		const { po } = mountDiff({ filePath: 'far.ts', diffLines, stats: { added: 2, removed: 0 } });
		// The 40 equal middle lines are elided — only ±3 context around each change shows.
		expect(po.lineCount()).toBeLessThan(diffLines.length);
		expect(po.separatorCount()).toBe(1);
		const texts = po.lineTexts();
		expect(texts).toContain('A');
		expect(texts).toContain('B');
		expect(texts).not.toContain('eq 20');
	});

	it('adjacent changes render as a single hunk with no separator', () => {
		const diffLines = [
			...equalLines(5),
			{ type: 'delete' as const, text: 'DEL', oldLineNum: 6 },
			{ type: 'insert' as const, text: 'INS', newLineNum: 6 },
			...equalLines(5, 6),
		];
		const { po } = mountDiff({ filePath: 'near.ts', diffLines, stats: { added: 1, removed: 1 } });
		expect(po.separatorCount()).toBe(0);
		const texts = po.lineTexts();
		expect(texts).toContain('DEL');
		expect(texts).toContain('INS');
	});

	it('an all-insert new file keeps the NEW_FILE_DISPLAY_CAP path (no hunk separators)', () => {
		const diffLines = Array.from({ length: 25 }, (_, i) => ({
			type: 'insert' as const,
			text: `line ${i + 1}`,
			newLineNum: i + 1,
		}));
		const { po } = mountDiff({ filePath: 'big.ts', diffLines, stats: { added: 25, removed: 0 } });
		expect(po.lineCount()).toBe(20);
		expect(po.moreExists()).toBe(true);
		expect(po.separatorCount()).toBe(0);
	});
});
