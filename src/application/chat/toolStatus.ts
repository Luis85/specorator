/**
 * `isBlockedToolResult` — pure detection of a *blocked* (permission-denied) tool
 * result (R-RR-008, REQ-RR-020).
 *
 * Ports claudian `isBlockedToolResult` (`ToolCallRenderer.ts:810`): a tool whose
 * result text contains a denial phrase ("outside the vault" / "access denied" /
 * "user denied" / "approval", or — when the result is errored — "deny") is
 * `blocked` (orange shield-off), distinct from a generic `error`. The store maps
 * `status = isError ? 'error' : (isBlocked ? 'blocked' : 'completed')` so a
 * hook-denied tool renders blocked rather than green-completed.
 *
 * Pure, total, never throws (NFR-RR-003/005): a non-string `content` is flattened
 * to displayable text first, mirroring claudian `extractToolResultContent`. No
 * `obsidian`/Vue import.
 */
import { trySync } from '@/domain/shared/tryAsync';

const DENIAL_PHRASES = ['outside the vault', 'access denied', 'user denied', 'approval'] as const;

/**
 * `true` when the tool result is a permission/approval denial. Mirrors claudian
 * `isBlockedToolResult` (`:810`): match the always-blocking phrases regardless of
 * `isError`, plus "deny" only when the result is errored.
 */
export function isBlockedToolResult(content: unknown, isError?: boolean): boolean {
	const lower = flattenResultContent(content).toLowerCase();
	if (DENIAL_PHRASES.some((phrase) => lower.includes(phrase))) return true;
	if (isError === true && lower.includes('deny')) return true;
	return false;
}

/**
 * Flatten arbitrary result `content` to displayable lowercase-able text (mirrors
 * claudian `extractToolResultContent`): a string passes through; an array keeps
 * `{type:'text',text}` blocks joined by newlines, else a JSON dump; any other
 * value is JSON-stringified; `null`/`undefined` → `''`. Total, never throws.
 */
function flattenResultContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (content === null || content === undefined) return '';
	if (Array.isArray(content)) {
		const textParts = content.filter(isTextBlock).map((block) => block.text);
		if (textParts.length > 0) return textParts.join('\n');
		if (content.length > 0) return safeStringify(content);
		return '';
	}
	return safeStringify(content);
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
	if (block === null || typeof block !== 'object') return false;
	const record = block as Record<string, unknown>;
	return record.type === 'text' && typeof record.text === 'string';
}

/** JSON.stringify that never throws (circular refs degrade to `''`). */
function safeStringify(value: unknown): string {
	const result = trySync(() => JSON.stringify(value));
	return result.ok && typeof result.value === 'string' ? result.value : '';
}
