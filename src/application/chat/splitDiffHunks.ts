import type { DiffLine } from '@/domain/chat/diff/Diff';

/**
 * `splitDiffHunks` — group a flat `DiffLine[]` into hunks of ±contextLines equal
 * lines around each change (R-RR-004).
 *
 * Ports claudian-main `splitIntoHunks` (`DiffRenderer.ts:23-73`): each changed
 * line (`insert`/`delete`) anchors a context window of `contextLines` equal lines
 * on each side; windows that overlap or are adjacent merge into one hunk. The
 * `DiffView` renders the hunks with a `...` separator between them, eliding the
 * distant equal-context body (claudian shows compact hunks, not the whole file).
 *
 * **Pure, total, never throws** (NFR-RR-003/005): an empty or all-equal input
 * yields no hunks; no new runtime dependency (NFR-RR-013). No `obsidian`/Vue
 * import.
 */
export interface DiffHunk {
	lines: DiffLine[];
}

interface Range {
	start: number;
	end: number;
}

export function splitDiffHunks(diffLines: DiffLine[], contextLines = 3): DiffHunk[] {
	if (diffLines.length === 0) return [];

	// Indices of every changed (non-equal) line.
	const changedIndices: number[] = [];
	for (let i = 0; i < diffLines.length; i++) {
		if (diffLines[i].type !== 'equal') changedIndices.push(i);
	}
	if (changedIndices.length === 0) return [];

	// Grow each change into a context range, merging adjacent/overlapping ranges
	// (parity DiffRenderer.ts:40-50). `start <= prev.end + 1` merges touching ranges.
	const ranges: Range[] = [];
	for (const idx of changedIndices) {
		const start = Math.max(0, idx - contextLines);
		const end = Math.min(diffLines.length - 1, idx + contextLines);
		const prev = ranges[ranges.length - 1];
		if (ranges.length > 0 && start <= prev.end + 1) {
			prev.end = Math.max(prev.end, end);
		} else {
			ranges.push({ start, end });
		}
	}

	return ranges.map((range) => ({ lines: diffLines.slice(range.start, range.end + 1) }));
}
