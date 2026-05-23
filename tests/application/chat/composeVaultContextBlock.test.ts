/**
 * QW-B — Tests for `composeVaultContextBlock`.
 *
 * Pure helper that snapshots the Obsidian workspace's active-note path and
 * current editor selection into a `<vault-context>` block prepended to the
 * stage-aware `systemPromptSuffix`. The block is only emitted when at least
 * one signal is present; an empty pair yields an empty string so the suffix
 * stays clean.
 *
 * QW-C extends the helper with an optional `vaultGreeting` row carrying
 * `vaultName` and `markdownFileCount` — emitted only on the first turn of a
 * thread to anchor the agent's mental model of the workspace.
 */
import { describe, it, expect } from 'vitest';
import { composeVaultContextBlock } from '@/application/chat/composeVaultContextBlock';

describe('composeVaultContextBlock', () => {
	it('returns an empty string when all inputs are null', () => {
		expect(composeVaultContextBlock(null, null)).toBe('');
		expect(
			composeVaultContextBlock({
				activeFilePath: null,
				activeSelection: null,
				vaultGreeting: null,
			}),
		).toBe('');
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

describe('composeVaultContextBlock — QW-C vault greeting', () => {
	it('emits greeting first, then active-note, then selection on first turn', () => {
		const out = composeVaultContextBlock({
			activeFilePath: 'specs/foo/idea.md',
			activeSelection: 'snippet',
			vaultGreeting: { vaultName: 'My Vault', markdownFileCount: 12 },
		});
		expect(out).toBe(
			[
				'<vault-context>',
				'Vault: My Vault (12 notes)',
				'Active note: specs/foo/idea.md',
				'Selection:',
				'```',
				'snippet',
				'```',
				'</vault-context>',
			].join('\n'),
		);
	});

	it('emits the greeting row alone when no active path or selection', () => {
		const out = composeVaultContextBlock({
			activeFilePath: null,
			activeSelection: null,
			vaultGreeting: { vaultName: 'Notes', markdownFileCount: 3 },
		});
		expect(out).toBe(
			[
				'<vault-context>',
				'Vault: Notes (3 notes)',
				'</vault-context>',
			].join('\n'),
		);
	});

	it('omits the greeting row on follow-up turns (vaultGreeting=null) even with path/selection', () => {
		const out = composeVaultContextBlock({
			activeFilePath: 'a.md',
			activeSelection: 'sel',
			vaultGreeting: null,
		});
		expect(out).not.toContain('Vault:');
		expect(out).toContain('Active note: a.md');
		expect(out).toContain('sel');
	});

	it.each([
		[0, '0 notes'],
		[1, '1 note'],
		[2, '2 notes'],
		[42, '42 notes'],
	])('pluralises %i as "%s"', (count, expected) => {
		const out = composeVaultContextBlock({
			activeFilePath: null,
			activeSelection: null,
			vaultGreeting: { vaultName: 'V', markdownFileCount: count },
		});
		expect(out).toContain(`Vault: V (${expected})`);
	});
});
