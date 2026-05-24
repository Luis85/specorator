/**
 * R-RR-004 (RED) — `splitDiffHunks` pure transform.
 *
 * Ports claudian `splitIntoHunks` (`DiffRenderer.ts:23-73`): given a flat
 * `DiffLine[]` and a context window (default 3), group changed lines into hunks
 * showing only ±contextLines equal-context lines around each change; ranges that
 * overlap or are adjacent merge into one hunk. No changes → no hunks. Pure,
 * total, never throws.
 *
 * Traces: R-RR-004, SPEC-RR-015/029, REQ-RR-025/027, NFR-RR-003/005/013.
 */
import { describe, it, expect } from 'vitest';
import { splitDiffHunks } from '@/application/chat/splitDiffHunks';
import type { DiffLine } from '@/domain/chat/diff/Diff';

/** N equal context lines, numbered 1..N. */
function equalLines(count: number, offset = 0): DiffLine[] {
	return Array.from({ length: count }, (_, i) => ({
		type: 'equal' as const,
		text: `eq ${offset + i + 1}`,
		oldLineNum: offset + i + 1,
		newLineNum: offset + i + 1,
	}));
}

describe('splitDiffHunks (R-RR-004, parity splitIntoHunks)', () => {
	it('empty input → no hunks', () => {
		expect(splitDiffHunks([], 3)).toEqual([]);
	});

	it('all-equal (no changes) → no hunks', () => {
		expect(splitDiffHunks(equalLines(10), 3)).toEqual([]);
	});

	it('a single change keeps only ±3 equal-context lines around it', () => {
		const lines: DiffLine[] = [
			...equalLines(10), // 1..10
			{ type: 'insert', text: 'NEW', newLineNum: 11 }, // index 10
			...equalLines(10, 10), // 11..20 (indices 11..20)
		];
		const hunks = splitDiffHunks(lines, 3);
		expect(hunks.length).toBe(1);
		// 3 context before (indices 7,8,9), the change (index 10), 3 context after (11,12,13).
		expect(hunks[0].lines.length).toBe(7);
		expect(hunks[0].lines.map((l) => l.text)).toEqual([
			'eq 8',
			'eq 9',
			'eq 10',
			'NEW',
			'eq 11',
			'eq 12',
			'eq 13',
		]);
	});

	it('distant changes → multiple hunks', () => {
		const lines: DiffLine[] = [
			{ type: 'insert', text: 'A', newLineNum: 1 }, // index 0
			...equalLines(40, 1), // indices 1..40
			{ type: 'insert', text: 'B', newLineNum: 42 }, // index 41
		];
		const hunks = splitDiffHunks(lines, 3);
		expect(hunks.length).toBe(2);
		expect(hunks[0].lines.some((l) => l.text === 'A')).toBe(true);
		expect(hunks[1].lines.some((l) => l.text === 'B')).toBe(true);
		// Each hunk is bounded (change + up to 3 context each side), not the whole body.
		expect(hunks[0].lines.length).toBeLessThanOrEqual(7);
		expect(hunks[1].lines.length).toBeLessThanOrEqual(7);
	});

	it('adjacent/overlapping changes merge into one hunk', () => {
		const lines: DiffLine[] = [
			...equalLines(5), // 1..5
			{ type: 'delete', text: 'DEL', oldLineNum: 6 }, // index 5
			{ type: 'insert', text: 'INS', newLineNum: 6 }, // index 6
			...equalLines(5, 6), // indices 7..11
		];
		const hunks = splitDiffHunks(lines, 3);
		expect(hunks.length).toBe(1);
		expect(hunks[0].lines.some((l) => l.text === 'DEL')).toBe(true);
		expect(hunks[0].lines.some((l) => l.text === 'INS')).toBe(true);
	});

	it('two changes 5 apart with 3-context windows that touch merge into one hunk', () => {
		const lines: DiffLine[] = [
			{ type: 'insert', text: 'A', newLineNum: 1 }, // index 0
			...equalLines(5, 1), // indices 1..5
			{ type: 'insert', text: 'B', newLineNum: 7 }, // index 6
		];
		// A's window is [0..3], B's window is [3..6] → adjacent → merge.
		const hunks = splitDiffHunks(lines, 3);
		expect(hunks.length).toBe(1);
	});
});
