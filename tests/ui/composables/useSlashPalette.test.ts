/**
 * Tests for the slash-command palette composable (PR-ASV-3, D-ASV-2). Covers
 * the state machine: open/close, query updates, matching, navigation
 * (including wrap-around), and selection.
 */
import { describe, it, expect, vi } from 'vitest';
import { nextTick } from 'vue';

import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { useSlashPalette } from '@/ui/composables/useSlashPalette';
import { fakeModulePorts } from '@/../tests/__fakes__/fake-ports';

const FIXTURE_COMMANDS: readonly SlashCommand[] = Object.freeze([
	Object.freeze({
		name: 'clear',
		description: 'Clear the input',
		kind: 'builtin' as const,
		action: 'clear-input' as const,
	}),
	Object.freeze({
		name: 'new',
		description: 'Start a new conversation',
		kind: 'builtin' as const,
		action: 'new-conversation' as const,
	}),
	Object.freeze({
		name: 'help',
		description: 'Show available commands',
		kind: 'builtin' as const,
		action: 'help' as const,
	}),
]);

describe('useSlashPalette', () => {
	it('starts closed with no matches and no selection', () => {
		const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
		expect(palette.isOpen.value).toBe(false);
		expect(palette.query.value).toBe('');
		expect(palette.matchedCommands.value).toEqual([]);
		expect(palette.selectedIndex.value).toBe(-1);
	});

	describe('open()', () => {
		it('opens the palette and seeds the selection at 0', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			expect(palette.isOpen.value).toBe(true);
			expect(palette.query.value).toBe('');
			expect(palette.selectedIndex.value).toBe(0);
		});

		it('with an empty query matches every command', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			expect(palette.matchedCommands.value).toHaveLength(FIXTURE_COMMANDS.length);
		});

		it('filters by case-insensitive substring on name', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('CLE');
			expect(palette.matchedCommands.value.map((c) => c.name)).toEqual(['clear']);
		});

		it('filters by case-insensitive substring on description', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('conversation');
			expect(palette.matchedCommands.value.map((c) => c.name)).toEqual(['new']);
		});

		it('clamps selection to -1 when no commands match', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('xyzzy');
			expect(palette.matchedCommands.value).toEqual([]);
			expect(palette.selectedIndex.value).toBe(-1);
		});
	});

	describe('close()', () => {
		it('clears query, selection, and isOpen', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('cle');
			palette.close();
			expect(palette.isOpen.value).toBe(false);
			expect(palette.query.value).toBe('');
			expect(palette.selectedIndex.value).toBe(-1);
			expect(palette.matchedCommands.value).toEqual([]);
		});
	});

	describe('setQuery()', () => {
		it('updates the filter and resets selection to 0', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			palette.navigate(2); // move off index 0
			expect(palette.selectedIndex.value).toBe(2);
			palette.setQuery('new');
			expect(palette.matchedCommands.value.map((c) => c.name)).toEqual(['new']);
			expect(palette.selectedIndex.value).toBe(0);
		});

		it('is a no-op when the palette is closed', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.setQuery('help');
			expect(palette.isOpen.value).toBe(false);
			expect(palette.query.value).toBe('');
		});
	});

	describe('navigate()', () => {
		it('moves the selection forward by `delta`', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			palette.navigate(1);
			expect(palette.selectedIndex.value).toBe(1);
			palette.navigate(1);
			expect(palette.selectedIndex.value).toBe(2);
		});

		it('wraps from the last index back to the first', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			palette.navigate(FIXTURE_COMMANDS.length - 1); // land on last index
			expect(palette.selectedIndex.value).toBe(FIXTURE_COMMANDS.length - 1);
			palette.navigate(1);
			expect(palette.selectedIndex.value).toBe(0);
		});

		it('wraps from the first index back to the last on negative delta', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			expect(palette.selectedIndex.value).toBe(0);
			palette.navigate(-1);
			expect(palette.selectedIndex.value).toBe(FIXTURE_COMMANDS.length - 1);
		});

		it('is a no-op when the palette is closed', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.navigate(1);
			expect(palette.selectedIndex.value).toBe(-1);
		});

		it('is a no-op when there are zero matches', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('xyzzy');
			palette.navigate(1);
			expect(palette.selectedIndex.value).toBe(-1);
		});
	});

	describe('select()', () => {
		it('returns the highlighted command', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			expect(palette.select()?.name).toBe('clear');
			palette.navigate(1);
			expect(palette.select()?.name).toBe('new');
		});

		it('returns null when the palette is closed', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			expect(palette.select()).toBeNull();
		});

		it('returns null when there are no matches', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('xyzzy');
			expect(palette.select()).toBeNull();
		});

		it('does not perform any side-effects (caller-driven dispatch)', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			palette.select();
			// Still open after select() — the caller is expected to close().
			expect(palette.isOpen.value).toBe(true);
		});
	});

	describe('reopen after close', () => {
		it('re-seeds selection to 0 after close → open', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			palette.navigate(2);
			palette.close();
			palette.open('');
			expect(palette.selectedIndex.value).toBe(0);
		});
	});

	describe('default registry', () => {
		it('uses BUILT_IN_SLASH_COMMANDS when no override is supplied', () => {
			const palette = useSlashPalette();
			palette.open('');
			const names = palette.matchedCommands.value.map((c) => c.name);
			expect(names).toContain('clear');
			expect(names).toContain('new');
			expect(names).toContain('help');
			expect(names).toContain('advance-stage');
		});
	});

	describe('vault-loaded commands', () => {
		it('built-ins are searchable immediately after open()', () => {
			const ports = fakeModulePorts();
			// Seed a vault command — but assert built-ins are present
			// BEFORE we await any vault read. Built-ins must not block on
			// the async vault scan.
			void ports.vault.writeFile(
				'.claude/commands/audit.md',
				'---\ndescription: Audit something.\n---\n\nAudit body.',
			);
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			palette.open('');
			// At the synchronous tick, only built-ins are loaded.
			const names = palette.matchedCommands.value.map((c) => c.name);
			expect(names).toEqual(['clear', 'new', 'help']);
		});

		it('vault commands appear after refreshVaultCommands() resolves', async () => {
			const ports = fakeModulePorts();
			await ports.vault.writeFile(
				'.claude/commands/audit.md',
				'---\ndescription: Audit something.\n---\n\nAudit body.',
			);
			await ports.vault.writeFile(
				'.claude/skills/publish-release.md',
				'---\ndescription: Walk a release.\n---\n\nRelease body.',
			);
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			palette.open('');
			await palette.refreshVaultCommands();
			await nextTick();
			const names = palette.matchedCommands.value.map((c) => c.name).sort();
			expect(names).toContain('audit');
			expect(names).toContain('publish-release');
		});

		it('classifies vault commands and skills via kind', async () => {
			const ports = fakeModulePorts();
			await ports.vault.writeFile(
				'.claude/commands/cmd-one.md',
				'---\ndescription: A command.\n---\n\nBody.',
			);
			await ports.vault.writeFile(
				'.claude/skills/skill-one.md',
				'---\ndescription: A skill.\n---\n\nBody.',
			);
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			await palette.refreshVaultCommands();
			palette.open('');
			const byName = new Map(palette.matchedCommands.value.map((c) => [c.name, c]));
			expect(byName.get('cmd-one')?.kind).toBe('vault-command');
			expect(byName.get('skill-one')?.kind).toBe('vault-skill');
		});

		it('vault commands use action="vault-prompt" and carry the body', async () => {
			const ports = fakeModulePorts();
			await ports.vault.writeFile(
				'.claude/commands/draft.md',
				'---\ndescription: Draft.\n---\n\nDraft this content.',
			);
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			await palette.refreshVaultCommands();
			palette.open('draft');
			const entry = palette.matchedCommands.value.find((c) => c.name === 'draft');
			expect(entry?.action).toBe('vault-prompt');
			expect(entry?.body).toContain('Draft this content');
		});

		it('reopen picks up vault writes that happened while closed', async () => {
			const ports = fakeModulePorts();
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			palette.open('');
			await palette.refreshVaultCommands();
			expect(palette.matchedCommands.value.map((c) => c.name)).not.toContain('late');
			palette.close();

			// New vault file appears between sessions.
			await ports.vault.writeFile(
				'.claude/commands/late.md',
				'---\ndescription: Late arrival.\n---\n\nLate body.',
			);

			palette.open('');
			await palette.refreshVaultCommands();
			expect(palette.matchedCommands.value.map((c) => c.name)).toContain('late');
		});

		it('falls back to built-ins only when no VaultPort is supplied', () => {
			const palette = useSlashPalette({ commands: FIXTURE_COMMANDS });
			palette.open('');
			expect(palette.matchedCommands.value.map((c) => c.name)).toEqual(['clear', 'new', 'help']);
		});

		it('swallows a vault read error without blocking the palette', async () => {
			const ports = fakeModulePorts();
			ports.vault.listFiles = vi.fn().mockRejectedValue(new Error('boom'));
			const palette = useSlashPalette({
				commands: FIXTURE_COMMANDS,
				vault: ports.vault,
				logger: ports.logger,
			});
			palette.open('');
			await palette.refreshVaultCommands();
			// Built-ins still searchable; no throw.
			expect(palette.matchedCommands.value.map((c) => c.name)).toEqual(['clear', 'new', 'help']);
		});
	});
});
