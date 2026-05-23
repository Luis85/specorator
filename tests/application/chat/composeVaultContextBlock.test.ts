/**
 * QW-B — Tests for `composeVaultContextBlock`.
 *
 * Pure helper that snapshots the Obsidian workspace's active-note path and
 * current editor selection into a `<vault-context>` block prepended to the
 * stage-aware `systemPromptSuffix`. The block is only emitted when at least
 * one signal is present; an empty pair yields an empty string so the suffix
 * stays clean.
 */
import { describe, it, expect } from 'vitest';
import { composeVaultContextBlock } from '@/application/chat/composeVaultContextBlock';

describe('composeVaultContextBlock', () => {
	it('returns an empty string when both inputs are null', () => {
		expect(composeVaultContextBlock(null, null)).toBe('');
	});

	it('emits only the Active-note row when selection is null', () => {
		const out = composeVaultContextBlock('specs/foo/idea.md', null);
		expect(out).toBe(
			'<vault-context>\nActive note: specs/foo/idea.md\n</vault-context>',
		);
	});

	it('emits only the Selection row when activePath is null, fenced', () => {
		const out = composeVaultContextBlock(null, 'hello world');
		expect(out).toBe(
			'<vault-context>\nSelection:\n```\nhello world\n```\n</vault-context>',
		);
	});

	it('emits both rows in the expected order when both are present', () => {
		const out = composeVaultContextBlock('a/b.md', 'pick me');
		expect(out).toBe(
			[
				'<vault-context>',
				'Active note: a/b.md',
				'Selection:',
				'```',
				'pick me',
				'```',
				'</vault-context>',
			].join('\n'),
		);
	});

	it('uses a 4-backtick fence when the selection contains triple-backticks', () => {
		const selection = 'before\n```\ninside\n```\nafter';
		const out = composeVaultContextBlock(null, selection);
		expect(out).toBe(
			[
				'<vault-context>',
				'Selection:',
				'````',
				'before',
				'```',
				'inside',
				'```',
				'after',
				'````',
				'</vault-context>',
			].join('\n'),
		);
	});

	it('preserves embedded newlines in the selection verbatim', () => {
		const selection = 'line1\nline2\n\nline4';
		const out = composeVaultContextBlock('p.md', selection);
		expect(out).toContain('line1\nline2\n\nline4');
		// The block boundary must follow immediately after the closing fence.
		expect(out.endsWith('```\n</vault-context>')).toBe(true);
	});
});
