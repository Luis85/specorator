/**
 * T-CA-017 (RED) — pure word-level `computeWordDiff` (SPEC-CA-011, ADR-CA-004 §3).
 * Tokenises both strings with `split(/(\s+)/)` (words + whitespace runs are
 * tokens, parity Claudian `InlineEditModal.ts:171`), computes the LCS over the
 * token arrays, and returns a single-row `ToolDiffData` whose `diffLines` are
 * word-granular `equal`/`insert`/`delete` ops feeding the UNCHANGED P2 `DiffView`.
 *
 * `filePath` is `''` (inline edit has no tool file); `stats` counts insert/delete
 * tokens. EC-CA-10: identical input → an all-equal no-op (`{added:0, removed:0}`);
 * empty inputs → an empty diff; never throws (NFR-CA-011, pure/total).
 *
 * Fails (RED) until T-CA-018 implements
 * `src/application/chat/inlineEdit/computeWordDiff.ts`.
 *
 * Traces: TEST-CA-023 (U leg), TEST-CA-023b, SPEC-CA-011, REQ-CA-023, NFR-CA-011,
 * EC-CA-10.
 */
import { describe, it, expect } from 'vitest';
import { computeWordDiff } from '@/application/chat/inlineEdit/computeWordDiff';
import type { DiffLine } from '@/domain/chat/diff/Diff';

function texts(lines: readonly DiffLine[], type: DiffLine['type']): string[] {
	return lines.filter((l) => l.type === type).map((l) => l.text);
}

describe('TEST-CA-023 computeWordDiff — REQ-CA-023 acceptance', () => {
	it('marks `bank` delete + `riverbank` insert, leaves The/was/steep equal', () => {
		const diff = computeWordDiff('The bank was steep', 'The riverbank was steep');

		expect(diff.filePath).toBe('');
		expect(texts(diff.diffLines, 'delete')).toContain('bank');
		expect(texts(diff.diffLines, 'insert')).toContain('riverbank');
		// The shared words survive as equal tokens (whitespace runs are tokens too).
		const equalWords = texts(diff.diffLines, 'equal');
		expect(equalWords).toContain('The');
		expect(equalWords).toContain('was');
		expect(equalWords).toContain('steep');
		// `bank`/`riverbank` are NOT equal tokens.
		expect(equalWords).not.toContain('bank');
		expect(equalWords).not.toContain('riverbank');
	});

	it('counts one inserted + one deleted word token in stats', () => {
		const diff = computeWordDiff('The bank was steep', 'The riverbank was steep');
		expect(diff.stats.added).toBe(1);
		expect(diff.stats.removed).toBe(1);
	});

	it('preserves the original/edited token sequence (no reordering)', () => {
		// Reconstructing the edited side from equal+insert tokens (in order) yields
		// the edited string; reconstructing original from equal+delete yields the original.
		const original = 'The bank was steep';
		const edited = 'The riverbank was steep';
		const diff = computeWordDiff(original, edited);
		const editedSide = diff.diffLines
			.filter((l) => l.type !== 'delete')
			.map((l) => l.text)
			.join('');
		const originalSide = diff.diffLines
			.filter((l) => l.type !== 'insert')
			.map((l) => l.text)
			.join('');
		expect(editedSide).toBe(edited);
		expect(originalSide).toBe(original);
	});
});

describe('TEST-CA-023b computeWordDiff — EC-CA-10 + edge cases', () => {
	it('identical input → all-equal no-op (added:0, removed:0)', () => {
		const s = 'The quick brown fox';
		const diff = computeWordDiff(s, s);
		expect(diff.stats).toEqual({ added: 0, removed: 0 });
		expect(diff.diffLines.every((l) => l.type === 'equal')).toBe(true);
		// The equal tokens reconstruct the original exactly.
		expect(diff.diffLines.map((l) => l.text).join('')).toBe(s);
	});

	it('empty inputs → empty diff', () => {
		expect(computeWordDiff('', '')).toEqual({
			filePath: '',
			diffLines: [],
			stats: { added: 0, removed: 0 },
		});
	});

	it('all-insert when original empty; all-delete when edited empty', () => {
		const inserted = computeWordDiff('', 'hello world');
		expect(texts(inserted.diffLines, 'delete')).toEqual([]);
		expect(inserted.diffLines.map((l) => l.text).join('')).toBe('hello world');
		expect(inserted.stats.removed).toBe(0);
		expect(inserted.stats.added).toBeGreaterThan(0);

		const deleted = computeWordDiff('hello world', '');
		expect(texts(deleted.diffLines, 'insert')).toEqual([]);
		expect(deleted.diffLines.map((l) => l.text).join('')).toBe('hello world');
		expect(deleted.stats.added).toBe(0);
		expect(deleted.stats.removed).toBeGreaterThan(0);
	});

	it('never throws (pure/total)', () => {
		expect(() => computeWordDiff('a', 'a b c d e f g')).not.toThrow();
		expect(() => computeWordDiff('   ', '')).not.toThrow();
	});
});
