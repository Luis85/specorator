/**
 * R-RR-008 (P2) — `isBlockedToolResult` pure helper.
 *
 * Ports claudian `isBlockedToolResult` (`ToolCallRenderer.ts:810`): a tool whose
 * result text matches a denial phrase ("outside the vault" / "access denied" /
 * "user denied" / "approval", or an errored result containing "deny") is a
 * *blocked* tool (orange shield-off), distinct from a generic `error`. The store
 * applies it so a hook-denied tool renders `blocked`, not green-completed
 * (REQ-RR-020). Pure, total, never throws.
 *
 * Traces: REQ-RR-020, SPEC-RR-018.
 */
import { describe, it, expect } from 'vitest';
import { isBlockedToolResult } from '@/application/chat/toolStatus';

describe('isBlockedToolResult (R-RR-008, REQ-RR-020)', () => {
	it('flags an "outside the vault" denial', () => {
		expect(isBlockedToolResult('Path is outside the vault root.')).toBe(true);
	});

	it('flags an "access denied" denial', () => {
		expect(isBlockedToolResult('Error: access denied for this path')).toBe(true);
	});

	it('flags a "user denied" denial', () => {
		expect(isBlockedToolResult('The user denied this tool call.')).toBe(true);
	});

	it('flags an "approval" message', () => {
		expect(isBlockedToolResult('This action requires approval.')).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(isBlockedToolResult('OUTSIDE THE VAULT')).toBe(true);
	});

	it('flags an errored result containing "deny" only when isError', () => {
		expect(isBlockedToolResult('would deny that', true)).toBe(true);
		expect(isBlockedToolResult('would deny that', false)).toBe(false);
	});

	it('does not flag an ordinary successful result', () => {
		expect(isBlockedToolResult('file contents here')).toBe(false);
	});

	it('does not flag an ordinary error result', () => {
		expect(isBlockedToolResult('ENOENT: no such file', true)).toBe(false);
	});

	it('is total — degrades on non-string content without throwing', () => {
		expect(() => isBlockedToolResult(undefined)).not.toThrow();
		expect(isBlockedToolResult(undefined)).toBe(false);
		expect(isBlockedToolResult({ nested: 'access denied' })).toBe(true);
		expect(isBlockedToolResult(null)).toBe(false);
	});
});
