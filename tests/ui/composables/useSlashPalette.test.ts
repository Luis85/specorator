/**
 * Tests for the slash-command palette composable (PR-ASV-3, D-ASV-2). Covers
 * the state machine: open/close, query updates, matching, navigation
 * (including wrap-around), and selection.
 */
import { describe, it, expect } from 'vitest';

import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { useSlashPalette } from '@/ui/composables/useSlashPalette';

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
});
