import type { DiffLine, DiffStats } from '@/domain/chat/diff/Diff';
import type { StructuredPatchHunk, ToolUseResult } from '@/domain/chat/diff/ToolUseResult';
import type { ToolCall } from '@/domain/chat/ToolCall';

/**
 * `computeDiff` — derive a Write/Edit diff from a tool's typed result, or its
 * input as a fallback (SPEC-RR-015).
 *
 * Reproduces claudian-main `structuredPatchToDiffLines` + `countLineChanges` +
 * `extractDiffData` + `diffFromToolInput` (`utils/diff.ts:9/33/130/147`) for the
 * P2 common path. The niche unified-diff / apply-patch parsers
 * (`parseApplyPatchDiffs`/`parseFileUpdateChangeDiffs`) are **deferred** with the
 * specialised renderers (CLAR-RR-005) — **no new runtime dependency** is added
 * (NFR-RR-013).
 *
 * **Pure, total, never throws** (NFR-RR-003/005): malformed bounds / non-string
 * lines / absent structuredPatch all degrade to an empty diff (EC-RR-3/4) rather
 * than faulting. No `obsidian`/Vue import.
 */
export interface ComputedDiff {
	lines: DiffLine[];
	stats: DiffStats;
}

const EMPTY: ComputedDiff = { lines: [], stats: { added: 0, removed: 0 } };

/** A finite, non-negative integer is a usable line-number seed (EC-RR-4 guard). */
function isUsableSeed(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Walk one structuredPatch hunk into ordered diff lines (parity `:9`). */
function hunkToLines(hunk: StructuredPatchHunk): DiffLine[] {
	// Malformed bounds (missing/negative/NaN) → drop the whole hunk (EC-RR-4).
	if (!isUsableSeed(hunk.oldStart) || !isUsableSeed(hunk.newStart)) return [];
	if (!Array.isArray(hunk.lines)) return [];

	const lines: DiffLine[] = [];
	let oldLineNum = hunk.oldStart;
	let newLineNum = hunk.newStart;

	for (const line of hunk.lines) {
		// Non-string entries carry no prefix → skip them (EC-RR-4), never throw.
		if (typeof line !== 'string') continue;
		const prefix = line[0];
		const text = line.slice(1);
		if (prefix === '+') {
			lines.push({ type: 'insert', text, newLineNum: newLineNum++ });
		} else if (prefix === '-') {
			lines.push({ type: 'delete', text, oldLineNum: oldLineNum++ });
		} else {
			lines.push({ type: 'equal', text, oldLineNum: oldLineNum++, newLineNum: newLineNum++ });
		}
	}

	return lines;
}

/** Count insert/delete lines (parity `countLineChanges`, `:33`). */
function countChanges(lines: DiffLine[]): DiffStats {
	let added = 0;
	let removed = 0;
	for (const line of lines) {
		if (line.type === 'insert') added++;
		else if (line.type === 'delete') removed++;
	}
	return { added, removed };
}

/** Diff from the structuredPatch hunks, if present and non-empty (parity `:130/135`). */
function fromStructuredPatch(toolUseResult: ToolUseResult | undefined): DiffLine[] | null {
	const patch = toolUseResult?.structuredPatch;
	if (!Array.isArray(patch) || patch.length === 0) return null;
	const lines: DiffLine[] = [];
	for (const hunk of patch) {
		lines.push(...hunkToLines(hunk));
	}
	return lines;
}

/** Diff from the tool input when no structuredPatch is usable (parity `diffFromToolInput`, `:147`). */
function fromToolInput(toolCall: Pick<ToolCall, 'name' | 'input'>): DiffLine[] {
	if (toolCall.name === 'Edit') {
		const oldStr = toolCall.input.old_string;
		const newStr = toolCall.input.new_string;
		if (typeof oldStr === 'string' && typeof newStr === 'string') {
			const lines: DiffLine[] = [];
			let oldLineNum = 1;
			for (const text of oldStr.split('\n')) {
				lines.push({ type: 'delete', text, oldLineNum: oldLineNum++ });
			}
			let newLineNum = 1;
			for (const text of newStr.split('\n')) {
				lines.push({ type: 'insert', text, newLineNum: newLineNum++ });
			}
			return lines;
		}
	}

	if (toolCall.name === 'Write') {
		const content = toolCall.input.content;
		if (typeof content === 'string') {
			return content.split('\n').map((text, i) => ({
				type: 'insert' as const,
				text,
				newLineNum: i + 1,
			}));
		}
	}

	return [];
}

export function computeDiff(
	toolUseResult: ToolUseResult | undefined,
	toolCall: Pick<ToolCall, 'name' | 'input'>,
): ComputedDiff {
	const fromPatch = fromStructuredPatch(toolUseResult);
	const lines = fromPatch ?? fromToolInput(toolCall);
	if (lines.length === 0) return EMPTY;
	return { lines, stats: countChanges(lines) };
}
