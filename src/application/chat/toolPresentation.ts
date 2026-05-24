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
const TOOL_WEB_SEARCH = 'WebSearch';
const TOOL_WEB_FETCH = 'WebFetch';
const TOOL_ENTER_PLAN_MODE = 'EnterPlanMode';
const TOOL_EXIT_PLAN_MODE = 'ExitPlanMode';

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

/** A trimmed non-empty string field, or `''` (parity web-search `normalize…` reads). */
function trimmedField(input: Record<string, unknown>, key: string): string {
	const value = input[key];
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : '';
}

interface WebSearchData {
	actionType: string;
	query: string;
	url: string;
	pattern: string;
}

/**
 * Derive the WebSearch action shape (parity `normalizeWebSearchDisplayData`,
 * `ToolCallRenderer.ts:276`). Total: missing fields → `''`; the action type is
 * inferred from which fields are present when not given explicitly.
 */
function normalizeWebSearch(input: Record<string, unknown>): WebSearchData {
	const firstQuery = Array.isArray(input.queries)
		? (input.queries.find((q): q is string => typeof q === 'string' && q.trim() !== '')?.trim() ?? '')
		: '';
	const query = trimmedField(input, 'query') || firstQuery;
	const url = trimmedField(input, 'url');
	const pattern = trimmedField(input, 'pattern');
	const explicit = trimmedField(input, 'actionType');
	const actionType =
		explicit ||
		(url && pattern ? 'find_in_page' : url ? 'open_page' : query ? 'search' : '');
	return { actionType, query, url, pattern };
}

/** One-line WebSearch summary (parity `getWebSearchSummary`, `ToolCallRenderer.ts:298`). */
function webSearchSummary(input: Record<string, unknown>, maxLength: number): string {
	const data = normalizeWebSearch(input);
	switch (data.actionType) {
		case 'open_page':
			return truncate(`Open ${data.url || 'page'}`, maxLength);
		case 'find_in_page': {
			const target = data.pattern ? `Find "${data.pattern}"` : 'Find in page';
			const suffix = data.url ? ` in ${data.url}` : '';
			return truncate(target + suffix, maxLength);
		}
		case 'search':
			return truncate(data.query, maxLength);
		default:
			return truncate(data.query || data.url || data.pattern, maxLength);
	}
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
 * `"Tasks N/M"` (or `"Tasks"` when there are no valid todos, REQ-RR-023);
 * `EnterPlanMode`/`ExitPlanMode` become their phrase labels (R-RR-005, `:70`);
 * every other tool returns its `name` verbatim.
 */
export function toolName(name: string, input: Record<string, unknown>): string {
	if (name === TOOL_TODO_WRITE) {
		const { completed, total } = todoCounts(input);
		return total > 0 ? `Tasks ${completed}/${total}` : 'Tasks';
	}
	if (name === TOOL_ENTER_PLAN_MODE) return 'Entering plan mode';
	if (name === TOOL_EXIT_PLAN_MODE) return 'Plan complete';
	return name;
}

/**
 * Header summary (parity `getToolSummary`, `:79`). File tools show the filename,
 * `Bash` the (≤60 char) command, `Glob`/`Grep` the pattern, `LS` the directory
 * name, `WebFetch` the (≤60 char) url, `WebSearch` the action one-liner
 * (R-RR-005), `TodoWrite` and everything else `''`. The niche apply_patch /
 * write_stdin / skill / agent-lifecycle summaries stay deferred (CLAR-RR-005).
 */
/** Summary for the web tools (parity `:94-97`), split out to keep `toolSummary` simple. */
function webToolSummary(name: string, input: Record<string, unknown>): string {
	if (name === TOOL_WEB_SEARCH) return webSearchSummary(input, 60);
	if (name === TOOL_WEB_FETCH) return truncate(inputText(input, 'url'), 60);
	return '';
}

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
		default:
			return webToolSummary(name, input);
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
 * The MCP-tool marker icon name (R-RR-003). Claudian signals MCP tools with the
 * `MCP_ICON_MARKER` sentinel and draws a custom plug SVG (`appendMcpIcon`); we
 * have no custom SVG seam, so we return the real lucide `plug` icon — the closest
 * faithful glyph Obsidian's `setIcon` resolves. `iconNodeMap` carries a matching
 * placeholder so Mock/demo stay recognisable.
 */
const MCP_ICON = 'plug';

/**
 * Real lucide icon NAME per tool (parity `getToolIcon`, `core/tools/toolIcons.ts:36-70`).
 * The `IconPort` resolves the name to a declarative `IconNode`; the Obsidian
 * backing passes it straight to `setIcon`, so production gets the correct,
 * distinct glyph for each tool — never touching the DOM in the UI (NFR-RR-006).
 * Pure, total: any `mcp__*` tool returns the MCP marker icon, every other
 * unknown tool falls back to `wrench` (the `SpIcon` fallback also covers it).
 */
const TOOL_ICONS: Readonly<Record<string, string>> = {
	[TOOL_READ]: 'file-text',
	[TOOL_WRITE]: 'file-plus',
	[TOOL_EDIT]: 'file-pen',
	NotebookEdit: 'file-pen',
	[TOOL_BASH]: 'terminal',
	[TOOL_GLOB]: 'folder-search',
	[TOOL_GREP]: 'search',
	[TOOL_LS]: 'list',
	[TOOL_TODO_WRITE]: 'list-checks',
	Task: 'bot',
	Agent: 'bot',
	WebSearch: 'globe',
	WebFetch: 'download',
	Skill: 'zap',
	AskUserQuestion: 'help-circle',
};

export function toolIcon(name: string): string {
	if (name.startsWith('mcp__')) return MCP_ICON;
	return TOOL_ICONS[name] ?? 'wrench';
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
