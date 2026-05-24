import { isValidTodoItem } from '@/domain/chat/TodoItem';

/**
 * `toolPresentation` — pure presentation heuristics for a tool call's header
 * (SPEC-RR-014).
 *
 * Reproduces claudian-main `getToolName`/`getToolSummary`/`getToolLabel`
 * (`ToolCallRenderer.ts:60/79/119`) + `fileNameOnly` (`:181`) for the P2 common
 * path (the niche apply-patch / web / skill summaries are deferred with their
 * specialised renderers — CLAR-RR-005). Every function is **pure, total, and
 * never throws** (NFR-RR-003/005): a missing or non-string input degrades to
 * `''` (summary) or `name` (label) rather than faulting, mirroring the blessed
 * P1 `safeMarkdownRender` seam. No `obsidian`/Vue import.
 */

const TOOL_READ = 'Read';
const TOOL_WRITE = 'Write';
const TOOL_EDIT = 'Edit';
const TOOL_BASH = 'Bash';
const TOOL_GLOB = 'Glob';
const TOOL_GREP = 'Grep';
const TOOL_LS = 'LS';
const TOOL_TODO_WRITE = 'TodoWrite';

/**
 * Read a string field, degrading any non-string (or empty string) to `fallback`
 * (SPEC-RR-014: "missing/non-string inputs degrade to `''`/`name`"). This is
 * stricter than claudian's `getInputText` (`:56`), which stringifies numbers and
 * booleans; the spec contract makes non-string inputs a degrade case, not a
 * coercion, so a malformed value never reaches the rendered header.
 */
function inputText(input: Record<string, unknown>, key: string, fallback = ''): string {
	const value = input[key];
	if (typeof value === 'string' && value !== '') return value;
	return fallback;
}

/** Last path segment, backslash-normalised (parity `fileNameOnly`, `ToolCallRenderer.ts:181`). */
export function fileNameOnly(filePath: string): string {
	if (!filePath) return '';
	const normalized = filePath.replace(/\\/g, '/');
	return normalized.split('/').pop() ?? normalized;
}

/** Collapse a path to `.../<last two segments>` once it is deeper than three (parity `:243`). */
function shortenPath(filePath: string): string {
	if (!filePath) return '';
	const normalized = filePath.replace(/\\/g, '/');
	const parts = normalized.split('/');
	if (parts.length <= 3) return normalized;
	return '.../' + parts.slice(-2).join('/');
}

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength) + '...';
}

/** Completed / total counts over the guard-filtered `input.todos` (EC-RR-6 tolerant). */
function todoCounts(input: Record<string, unknown>): { completed: number; total: number } {
	const raw = input.todos;
	if (!Array.isArray(raw)) return { completed: 0, total: 0 };
	const valid = raw.filter(isValidTodoItem);
	const completed = valid.filter((todo) => todo.status === 'completed').length;
	return { completed, total: valid.length };
}

/**
 * Monospace header name (parity `getToolName`, `:60`). `TodoWrite` becomes
 * `"Tasks N/M"` (or `"Tasks"` when there are no valid todos, REQ-RR-023); every
 * other tool returns its `name` verbatim.
 */
export function toolName(name: string, input: Record<string, unknown>): string {
	if (name === TOOL_TODO_WRITE) {
		const { completed, total } = todoCounts(input);
		return total > 0 ? `Tasks ${completed}/${total}` : 'Tasks';
	}
	return name;
}

/**
 * Header summary (parity `getToolSummary`, `:79`). File tools show the filename,
 * `Bash` the (≤60 char) command, `Glob`/`Grep` the pattern, `LS` the directory
 * name, `TodoWrite` and everything else `''`.
 */
export function toolSummary(name: string, input: Record<string, unknown>): string {
	switch (name) {
		case TOOL_READ:
		case TOOL_WRITE:
		case TOOL_EDIT:
			return fileNameOnly(inputText(input, 'file_path'));
		case TOOL_BASH:
			return truncate(inputText(input, 'command'), 60);
		case TOOL_GLOB:
		case TOOL_GREP:
			return inputText(input, 'pattern');
		case TOOL_LS:
			return fileNameOnly(inputText(input, 'path', '.'));
		case TOOL_TODO_WRITE:
			return '';
		default:
			return '';
	}
}

/** File-tool label suffix: `<shortPath>` or the per-tool fallback (parity `:121`). */
function fileToolLabel(prefix: string, input: Record<string, unknown>): string {
	return `${prefix}: ${shortenPath(inputText(input, 'file_path')) || 'file'}`;
}

/** Pattern-tool label suffix (parity `:131`). */
function patternToolLabel(prefix: string, input: Record<string, unknown>, fallback: string): string {
	return `${prefix}: ${inputText(input, 'pattern', fallback)}`;
}

/** TodoWrite label: `Tasks (N/M)`, or `Tasks` when there are no valid todos (parity `:144`). */
function todoWriteLabel(input: Record<string, unknown>): string {
	const { completed, total } = todoCounts(input);
	return total > 0 ? `Tasks (${completed}/${total})` : 'Tasks';
}

/**
 * Single descriptive phrase for the collapsible region's ARIA accessible name
 * (parity `getToolLabel`, `:119`). Default → `name`.
 */
export function toolLabel(name: string, input: Record<string, unknown>): string {
	switch (name) {
		case TOOL_READ:
		case TOOL_WRITE:
		case TOOL_EDIT:
			return fileToolLabel(name, input);
		case TOOL_BASH:
			return `Bash: ${truncate(inputText(input, 'command', 'command'), 40)}`;
		case TOOL_GLOB:
			return patternToolLabel('Glob', input, 'files');
		case TOOL_GREP:
			return patternToolLabel('Grep', input, 'pattern');
		case TOOL_LS:
			return `LS: ${shortenPath(inputText(input, 'path')) || '.'}`;
		case TOOL_TODO_WRITE:
			return todoWriteLabel(input);
		default:
			return name;
	}
}
