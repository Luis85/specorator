/**
 * T-RR-002 (TEST-RR-003) — RED: the diff domain types match claudian-main
 * `diff.ts:5/12/18/27` + `tools.ts:4`.
 *
 * Asserts the exact shapes of `DiffLine`, `DiffStats`, `StructuredPatchHunk`,
 * `ToolUseResult` (claudian's `SDKToolUseResult`, SDK prefix dropped — domain
 * type), and `ToolDiffData`. The compile-time `Equals<>` asserts fail
 * `npx vue-tsc --noEmit -p tsconfig.lint.json` until T-RR-004 declares the
 * types under `src/domain/chat/diff/`.
 *
 * Traces: TEST-RR-003, SPEC-RR-002, SPEC-RR-003, REQ-RR-026; ADR-RR-001 §1.
 */
import { describe, it, expect } from 'vitest';
import type { DiffLine, DiffStats, ToolDiffData } from '@/domain/chat/diff/Diff';
import type { ToolUseResult, StructuredPatchHunk } from '@/domain/chat/diff/ToolUseResult';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- DiffLine (diff.ts:5) ----
const _diffLine: Equals<
	DiffLine,
	{ type: 'equal' | 'insert' | 'delete'; text: string; oldLineNum?: number; newLineNum?: number }
> = true;
void _diffLine;

// ---- DiffStats (diff.ts:12) ----
const _diffStats: Equals<DiffStats, { added: number; removed: number }> = true;
void _diffStats;

// ---- StructuredPatchHunk (diff.ts:18) ----
const _hunk: Equals<
	StructuredPatchHunk,
	{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }
> = true;
void _hunk;

// ---- ToolDiffData (tools.ts:4) ----
const _toolDiffData: Equals<
	ToolDiffData,
	{ filePath: string; diffLines: DiffLine[]; stats: DiffStats }
> = true;
void _toolDiffData;

describe('diff domain types (TEST-RR-003)', () => {
	it('DiffLine carries the discriminant + optional 1-based line numbers', () => {
		const insert: DiffLine = { type: 'insert', text: 'new', newLineNum: 1 };
		const del: DiffLine = { type: 'delete', text: 'old', oldLineNum: 1 };
		const eq: DiffLine = { type: 'equal', text: 'same', oldLineNum: 2, newLineNum: 2 };
		expect([insert.type, del.type, eq.type]).toEqual(['insert', 'delete', 'equal']);
	});

	it('DiffStats counts added/removed', () => {
		const stats: DiffStats = { added: 3, removed: 1 };
		expect(stats.added + stats.removed).toBe(4);
	});

	it('StructuredPatchHunk mirrors the SDK structuredPatch hunk', () => {
		const hunk: StructuredPatchHunk = {
			oldStart: 1,
			oldLines: 2,
			newStart: 1,
			newLines: 3,
			lines: [' a', '-b', '+c', '+d'],
		};
		expect(hunk.lines).toHaveLength(4);
	});

	it('ToolUseResult carries structuredPatch/filePath + the forward-compatible bag', () => {
		const result: ToolUseResult = {
			structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+x'] }],
			filePath: 'a/b.ts',
			extraVendorField: 42,
		};
		expect(result.filePath).toBe('a/b.ts');
		expect(result.extraVendorField).toBe(42);
	});

	it('ToolDiffData is the pre-computed Write/Edit diff payload', () => {
		const data: ToolDiffData = {
			filePath: 'a/b.ts',
			diffLines: [{ type: 'insert', text: 'x', newLineNum: 1 }],
			stats: { added: 1, removed: 0 },
		};
		expect(data.diffLines).toHaveLength(1);
	});
});
