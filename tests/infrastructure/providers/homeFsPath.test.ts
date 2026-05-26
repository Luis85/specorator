/**
 * T-PV-013/014 — the pure `isInsideHomeRoot` path-escape check (SPEC-PV-007/028).
 * The single source of truth shared by the Mock home-fs (coverage-included) + the
 * real `node:fs` `HomeFileSystem` (coverage-excluded). Total — no I/O.
 *
 * Traces: TEST-PV-081/083; SPEC-PV-007/028; REQ-PV-081; EC-PV-7.
 */
import { describe, it, expect } from 'vitest';
import { isInsideHomeRoot } from '@/infrastructure/providers/homeFsPath';

describe('isInsideHomeRoot (TEST-PV-081, EC-PV-7)', () => {
	it('accepts a declared root itself', () => {
		expect(isInsideHomeRoot('.codex')).toBe(true);
		expect(isInsideHomeRoot('.claude')).toBe(true);
	});

	it('accepts a descendant of a declared root', () => {
		expect(isInsideHomeRoot('.codex/sessions/2026/turn.jsonl')).toBe(true);
		expect(isInsideHomeRoot('.claude/projects/a.json')).toBe(true);
	});

	it('normalises backslashes + collapses redundant separators', () => {
		expect(isInsideHomeRoot('.codex\\sessions\\t.jsonl')).toBe(true);
		expect(isInsideHomeRoot('.codex/./sessions//t.jsonl')).toBe(true);
	});

	it('rejects a `..` escape past the root', () => {
		expect(isInsideHomeRoot('.codex/../.ssh/id_rsa')).toBe(false);
		expect(isInsideHomeRoot('../outside.txt')).toBe(false);
		expect(isInsideHomeRoot('.codex/../../etc/passwd')).toBe(false);
	});

	it('rejects an unknown first segment', () => {
		expect(isInsideHomeRoot('.notes/secret.md')).toBe(false);
		expect(isInsideHomeRoot('Documents/a.txt')).toBe(false);
	});

	it('rejects an absolute path (POSIX + Windows)', () => {
		expect(isInsideHomeRoot('/etc/passwd')).toBe(false);
		expect(isInsideHomeRoot('C:/Windows/system32')).toBe(false);
	});

	it('rejects empty / dot-only paths', () => {
		expect(isInsideHomeRoot('')).toBe(false);
		expect(isInsideHomeRoot('.')).toBe(false);
		expect(isInsideHomeRoot('./')).toBe(false);
	});
});
