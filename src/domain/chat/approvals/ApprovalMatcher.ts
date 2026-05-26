/**
 * The pure approval matcher (P7, SPEC-AS-004/026, ADR-AS-001 §3). Ported verbatim
 * from claudian-main `core/security/ApprovalManager.ts`
 * (`getActionPattern:13`/`getActionDescription:35`/`matchesRulePattern:60`/
 * `isPathPrefixMatch:116`/`matchesBashPrefix:132`). No class, no `obsidian`, no
 * `node:*`, no Vue, no I/O — string comparison only (NFR-AS-002), **total (never
 * throws)** for any input (NFR-AS-009).
 */

/** Tool-name constants (parity claudian `core/tools/toolNames`) — local to the matcher. */
export const TOOL_BASH = 'Bash';
export const TOOL_READ = 'Read';
export const TOOL_WRITE = 'Write';
export const TOOL_EDIT = 'Edit';
export const TOOL_NOTEBOOK_EDIT = 'NotebookEdit';
export const TOOL_GLOB = 'Glob';
export const TOOL_GREP = 'Grep';

/**
 * Derive the action pattern from the tool + its input (REQ-AS-010). Bash → trimmed
 * command (or `''` when absent); Read/Write/Edit → `file_path` or `null`;
 * NotebookEdit → `notebook_path ?? file_path` or `null`; Glob/Grep → `pattern` or
 * `null`; default → `JSON.stringify(input)`. Total — returns `string | null`,
 * never throws.
 */
// eslint-disable-next-line complexity -- per-tool dispatch ported verbatim from claudian ApprovalManager.getActionPattern; complexity is the tool table itself, not incidental branching (SPEC-AS-026).
export function getActionPattern(toolName: string, input: Record<string, unknown>): string | null {
	switch (toolName) {
		case TOOL_BASH:
			return typeof input.command === 'string' ? input.command.trim() : '';
		case TOOL_READ:
		case TOOL_WRITE:
		case TOOL_EDIT:
			return typeof input.file_path === 'string' && input.file_path ? input.file_path : null;
		case TOOL_NOTEBOOK_EDIT:
			if (typeof input.notebook_path === 'string' && input.notebook_path) {
				return input.notebook_path;
			}
			return typeof input.file_path === 'string' && input.file_path ? input.file_path : null;
		case TOOL_GLOB:
			return typeof input.pattern === 'string' && input.pattern ? input.pattern : null;
		case TOOL_GREP:
			return typeof input.pattern === 'string' && input.pattern ? input.pattern : null;
		default:
			return JSON.stringify(input);
	}
}

/**
 * A human-readable description for the inline prompt (REQ-AS-015): "Run command:
 * …" (Bash), "Read file: …", "Write to file: …", "Edit file: …", "Search files
 * matching: …" (Glob), "Search content matching: …" (Grep), else "{tool}:
 * {pattern}". A `null` pattern renders as `(unknown)`. Total.
 */
export function getActionDescription(toolName: string, input: Record<string, unknown>): string {
	const pattern = getActionPattern(toolName, input) ?? '(unknown)';
	switch (toolName) {
		case TOOL_BASH:
			return `Run command: ${pattern}`;
		case TOOL_READ:
			return `Read file: ${pattern}`;
		case TOOL_WRITE:
			return `Write to file: ${pattern}`;
		case TOOL_EDIT:
			return `Edit file: ${pattern}`;
		case TOOL_GLOB:
			return `Search files matching: ${pattern}`;
		case TOOL_GREP:
			return `Search content matching: ${pattern}`;
		default:
			return `${toolName}: ${pattern}`;
	}
}

/**
 * Whether `rulePattern` matches `actionPattern` for `toolName` (REQ-AS-011..014).
 * Pure + total — never throws. The exact Claudian semantics (SPEC-AS-026):
 * - No rule pattern (`undefined`/empty) → match-all `true`.
 * - Null action pattern + a content rule → `false` (the null-action guard).
 * - Both `\`→`/` normalised before comparison.
 * - `'*'` → `true`; exact (post-normalise) → `true`.
 * - Bash: exact OR explicit wildcard (`"foo:*"` colon form / `"foo*"`/`"foo *"`
 *   suffix form); a bare prefix without a wildcard never matches.
 * - File tools (Read/Write/Edit/NotebookEdit): path-prefix with path-segment
 *   boundaries (`/a/b` ⊃ `/a/b/c`, ¬ `/a/bc`; trailing `/` = subtree).
 * - Other tools (Glob/Grep/…): simple prefix.
 */
// eslint-disable-next-line complexity -- per-tool-family match dispatch ported verbatim from claudian ApprovalManager.matchesRulePattern; complexity is the security match table itself (SPEC-AS-026).
export function matchesRulePattern(
	toolName: string,
	actionPattern: string | null,
	rulePattern: string | undefined,
): boolean {
	// No rule pattern (absent or empty) means match all.
	if (rulePattern === undefined || rulePattern === '') return true;

	// Null action pattern means we can't determine the action — don't match.
	if (actionPattern === null) return false;

	const normalizedAction = actionPattern.replace(/\\/g, '/');
	const normalizedRule = rulePattern.replace(/\\/g, '/');

	// Wildcard matches everything.
	if (normalizedRule === '*') return true;

	// Exact match.
	if (normalizedAction === normalizedRule) return true;

	// Bash: only exact (handled above) or explicit wildcard patterns are allowed.
	// This is intentional — Bash commands require explicit wildcards for security.
	if (toolName === TOOL_BASH) {
		// CC format "npm:*" — the colon is a separator, not part of the prefix.
		if (normalizedRule.endsWith(':*')) {
			const prefix = normalizedRule.slice(0, -2);
			return matchesBashPrefix(normalizedAction, prefix);
		}
		// Space/suffix wildcard "git *" / "git*".
		if (normalizedRule.endsWith('*')) {
			const prefix = normalizedRule.slice(0, -1);
			return matchesBashPrefix(normalizedAction, prefix);
		}
		// No wildcard present and the exact match failed above — reject.
		return false;
	}

	// File tools: prefix match with path-segment boundary awareness.
	if (
		toolName === TOOL_READ ||
		toolName === TOOL_WRITE ||
		toolName === TOOL_EDIT ||
		toolName === TOOL_NOTEBOOK_EDIT
	) {
		return isPathPrefixMatch(normalizedAction, normalizedRule);
	}

	// Other tools: allow simple prefix matching.
	if (normalizedAction.startsWith(normalizedRule)) return true;

	return false;
}

function isPathPrefixMatch(actionPath: string, approvedPath: string): boolean {
	if (!actionPath.startsWith(approvedPath)) {
		return false;
	}

	if (approvedPath.endsWith('/')) {
		return true;
	}

	if (actionPath.length === approvedPath.length) {
		return true;
	}

	return actionPath.charAt(approvedPath.length) === '/';
}

function matchesBashPrefix(action: string, prefix: string): boolean {
	if (action === prefix) {
		return true;
	}

	if (prefix.endsWith(' ')) {
		return action.startsWith(prefix);
	}

	return action.startsWith(`${prefix} `);
}
