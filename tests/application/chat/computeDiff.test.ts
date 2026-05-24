/**
 * TEST-RR-018 (U leg) — `computeDiff` pure transform.
 *
 * SPEC-RR-015: `computeDiff(toolUseResult, toolCall)` reproduces claudian
 * `structuredPatchToDiffLines` + `countLineChanges` + `extractDiffData` +
 * `diffFromToolInput` (`utils/diff.ts:9/33/130/147`). Pure, total, never throws —
 * empty diff on malformed (EC-RR-4) / absent (EC-RR-3) input. No new dependency.
 *
 * Traces: TEST-RR-018, SPEC-RR-015, REQ-RR-026, NFR-RR-003/005/013, EC-RR-3/4.
 */
import { describe, it, expect } from 'vitest';
import { computeDiff } from '@/application/chat/computeDiff';
import type { ToolUseResult } from '@/domain/chat/diff/ToolUseResult';

describe('computeDiff — structuredPatch path (TEST-RR-018)', () => {
	it('+3/-1 hunk -> ordered DiffLine[] with seeded 1-based line numbers + {added:3,removed:1}', () => {
		const result: ToolUseResult = {
			structuredPatch: [
				{
					oldStart: 1,
					oldLines: 2,
					newStart: 1,
					newLines: 4,
					lines: [' keep', '-gone', '+new1', '+new2', '+new3'],
				},
			],
		};
		const out = computeDiff(result, { name: 'Edit', input: { file_path: 'x.ts' } });

		expect(out.lines).toEqual([
			{ type: 'equal', text: 'keep', oldLineNum: 1, newLineNum: 1 },
			{ type: 'delete', text: 'gone', oldLineNum: 2 },
			{ type: 'insert', text: 'new1', newLineNum: 2 },
			{ type: 'insert', text: 'new2', newLineNum: 3 },
			{ type: 'insert', text: 'new3', newLineNum: 4 },
		]);
		expect(out.stats).toEqual({ added: 3, removed: 1 });
	});

	it('seeds line numbers from hunk.oldStart/newStart', () => {
		const result: ToolUseResult = {
			structuredPatch: [
				{ oldStart: 10, oldLines: 1, newStart: 20, newLines: 1, lines: [' same'] },
			],
		};
		const out = computeDiff(result, { name: 'Edit', input: {} });
		expect(out.lines).toEqual([{ type: 'equal', text: 'same', oldLineNum: 10, newLineNum: 20 }]);
	});

	it('preserves an empty line.text (slice yields "") for the component to render as a space', () => {
		const result: ToolUseResult = {
			structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+'] }],
		};
		const out = computeDiff(result, { name: 'Write', input: {} });
		expect(out.lines).toEqual([{ type: 'insert', text: '', newLineNum: 1 }]);
		expect(out.stats).toEqual({ added: 1, removed: 0 });
	});
});

describe('computeDiff — input fallback (TEST-RR-018)', () => {
	it('Edit with string old_string/new_string -> all-delete then all-insert', () => {
		const out = computeDiff(undefined, {
			name: 'Edit',
			input: { old_string: 'a\nb', new_string: 'a\nc\nd' },
		});
		expect(out.lines).toEqual([
			{ type: 'delete', text: 'a', oldLineNum: 1 },
			{ type: 'delete', text: 'b', oldLineNum: 2 },
			{ type: 'insert', text: 'a', newLineNum: 1 },
			{ type: 'insert', text: 'c', newLineNum: 2 },
			{ type: 'insert', text: 'd', newLineNum: 3 },
		]);
		expect(out.stats).toEqual({ added: 3, removed: 2 });
	});

	it('Write with string content -> all-insert lines + {added:N,removed:0}', () => {
		const out = computeDiff(undefined, {
			name: 'Write',
			input: { content: 'line1\nline2' },
		});
		expect(out.lines).toEqual([
			{ type: 'insert', text: 'line1', newLineNum: 1 },
			{ type: 'insert', text: 'line2', newLineNum: 2 },
		]);
		expect(out.stats).toEqual({ added: 2, removed: 0 });
	});

	it('falls back to input when structuredPatch is present but empty', () => {
		const out = computeDiff(
			{ structuredPatch: [] },
			{ name: 'Write', input: { content: 'only' } },
		);
		expect(out.lines).toEqual([{ type: 'insert', text: 'only', newLineNum: 1 }]);
		expect(out.stats).toEqual({ added: 1, removed: 0 });
	});
});

describe('computeDiff — degrade cases (EC-RR-3/4)', () => {
	it('absent structuredPatch + no usable input -> empty diff (EC-RR-3)', () => {
		const out = computeDiff(undefined, { name: 'Read', input: { file_path: 'x.ts' } });
		expect(out.lines).toEqual([]);
		expect(out.stats).toEqual({ added: 0, removed: 0 });
	});

	it('Edit without string old/new -> empty diff (EC-RR-3)', () => {
		const out = computeDiff(undefined, { name: 'Edit', input: { old_string: 42 } });
		expect(out.lines).toEqual([]);
		expect(out.stats).toEqual({ added: 0, removed: 0 });
	});

	it('malformed hunk (non-array lines) -> empty diff, no throw (EC-RR-4)', () => {
		const result = {
			structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: 'not-array' }],
		} as unknown as ToolUseResult;
		expect(() => computeDiff(result, { name: 'Write', input: {} })).not.toThrow();
		const out = computeDiff(result, { name: 'Write', input: {} });
		expect(out.lines).toEqual([]);
		expect(out.stats).toEqual({ added: 0, removed: 0 });
	});

	it('hunk with NaN/negative bounds still walks lines without throwing (EC-RR-4)', () => {
		const result: ToolUseResult = {
			structuredPatch: [
				{ oldStart: Number.NaN, oldLines: 1, newStart: -5, newLines: 1, lines: ['+x'] },
			],
		};
		expect(() => computeDiff(result, { name: 'Write', input: {} })).not.toThrow();
	});

	it('non-string line entries are skipped without throwing (EC-RR-4)', () => {
		const result = {
			structuredPatch: [
				{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [42, '+ok', null] },
			],
		} as unknown as ToolUseResult;
		const out = computeDiff(result, { name: 'Write', input: {} });
		expect(out.lines).toEqual([{ type: 'insert', text: 'ok', newLineNum: 1 }]);
		expect(out.stats).toEqual({ added: 1, removed: 0 });
	});
});
