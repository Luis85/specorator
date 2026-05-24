/**
 * Diff render types (SPEC-RR-003). Mirrors claudian-main `diff.ts:5/12` +
 * `tools.ts:4`. Pure data: no `obsidian`, no `node:*`, no class.
 */

/**
 * One rendered diff line. Line numbers are 1-based and optional (seeded by
 * `computeDiff`, SPEC-RR-015). `text` is a string (may be empty; rendered as a
 * single space — parity `DiffRenderer.ts:131`).
 */
export interface DiffLine {
	type: 'equal' | 'insert' | 'delete';
	text: string;
	oldLineNum?: number;
	newLineNum?: number;
}

/** Added/removed line counts. Both are non-negative integers (SPEC-RR-003). */
export interface DiffStats {
	added: number;
	removed: number;
}

/**
 * Pre-computed diff data attached to a Write/Edit `ToolCall` (claudian
 * tools.ts:4). Produced ONLY by `computeDiff` (SPEC-RR-015); the component
 * never constructs it.
 */
export interface ToolDiffData {
	filePath: string;
	diffLines: DiffLine[];
	stats: DiffStats;
}
