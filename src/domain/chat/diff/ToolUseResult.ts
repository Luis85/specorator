/**
 * Typed source of a tool's `toolUseResult` for Write/Edit tools (SPEC-RR-002).
 *
 * Mirrors claudian-main `diff.ts:18/27` (`StructuredPatchHunk`,
 * `SDKToolUseResult`) with the SDK prefix dropped — this is a domain type, not
 * an SDK leak (ADR-RR-001 §1). Pure data: no `obsidian`, no `node:*`, no class.
 *
 * The `[key: string]: unknown` index keeps `ToolUseResult` permissive for
 * non-diff tools, so typing `StreamChunk.tool_result.toolUseResult?:
 * ToolUseResult` does NOT narrow away any P1 value — it is a tighten, not a
 * breaking change (the only edit to a declared P1 union member).
 */

/** A single hunk from the SDK's structuredPatch format (claudian diff.ts:18). */
export interface StructuredPatchHunk {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	/** Each line prefixed by '+', '-', or ' ' (unified-diff convention). */
	lines: string[];
}

/**
 * Typed shape of a tool's `toolUseResult` for Write/Edit tools (claudian
 * diff.ts:27).
 *
 * Per-field rules:
 * - `structuredPatch`: optional; when present an array of hunks. Absent/empty →
 *   no diff (EC-RR-3). `computeDiff` tolerates missing/negative/`NaN` bounds and
 *   non-string lines without throwing (EC-RR-4).
 * - `filePath`: optional string; falls back to `toolCall.input.file_path` then
 *   `'file'` (parity `utils/diff.ts:131/136`).
 * - `[key: string]: unknown`: open bag — keeps the type forward-compatible for
 *   non-Write/Edit tools (parity claudian diff.ts:30).
 */
export interface ToolUseResult {
	structuredPatch?: StructuredPatchHunk[];
	filePath?: string;
	[key: string]: unknown;
}
