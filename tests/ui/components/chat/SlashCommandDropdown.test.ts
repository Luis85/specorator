/**
 * Tests for the slash-command dropdown component (PR-ASV-3, D-ASV-2). Covers
 * the three match-count branches (0, 1, many), the ARIA semantics
 * (`role="listbox"` / `role="option"` / `aria-selected`), and the `select`
 * + `highlight` emits.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';

import SlashCommandDropdown from '@/ui/components/chat/SlashCommandDropdown.vue';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { SlashCommandDropdownPO } from './SlashCommandDropdown.po';

const CLEAR: SlashCommand = Object.freeze({
	name: 'clear',
	description: 'Clear the input',
	kind: 'builtin',
	action: 'clear-input',
});

const NEW: SlashCommand = Object.freeze({
	name: 'new',
	description: 'Start a new conversation',
	kind: 'builtin',
	action: 'new-conversation',
});

const HELP: SlashCommand = Object.freeze({
	name: 'help',
	description: 'Show available commands',
	kind: 'builtin',
	action: 'help',
});

const mounted: VueWrapper[] = [];

function mountDropdown(props: { commands: readonly SlashCommand[]; selectedIndex: number }) {
	// WS-AUX-8c: SlashCommandDropdown now renders inside an `<SpDropdownPanel>`
	// which `<Teleport>`s to `document.body`. Attach the wrapper so the
	// teleported content lives under the real DOM tree, then query through
	// `document` in the PO. ADR-009 testid-only contract is preserved.
	const wrapper = mount(SlashCommandDropdown, {
		props,
		attachTo: document.body,
	});
	mounted.push(wrapper);
	return { wrapper, po: new SlashCommandDropdownPO(wrapper) };
}

afterEach(() => {
	// Teleport renders to body; without explicit unmount the nodes persist
	// between tests and `document.querySelector` returns stale results.
	while (mounted.length > 0) {
		mounted.pop()?.unmount();
	}
});

describe('SlashCommandDropdown', () => {
	describe('zero matches', () => {
		it('renders the empty placeholder and no list', () => {
			const { po } = mountDropdown({ commands: [], selectedIndex: -1 });
			expect(po.hasEmpty()).toBe(true);
			expect(po.hasList()).toBe(false);
			expect(po.emptyText().toLowerCase()).toContain('no matching');
		});
	});

	describe('single match', () => {
		it('renders one option with name and description', () => {
			const { po } = mountDropdown({ commands: [CLEAR], selectedIndex: 0 });
			expect(po.hasEmpty()).toBe(false);
			expect(po.hasList()).toBe(true);
			expect(po.items()).toHaveLength(1);
			expect(po.itemNameText('clear')).toContain('clear');
			expect(po.itemDescriptionText('clear')).toBe('Clear the input');
		});

		it('marks the only entry as aria-selected when selectedIndex=0', () => {
			const { po } = mountDropdown({ commands: [CLEAR], selectedIndex: 0 });
			expect(po.itemAriaSelected('clear')).toBe('true');
		});
	});

	describe('many matches', () => {
		it('renders one option per command in order', () => {
			const { po } = mountDropdown({
				commands: [CLEAR, NEW, HELP],
				selectedIndex: 0,
			});
			expect(po.items()).toHaveLength(3);
			expect(po.itemNameText('clear')).toContain('clear');
			expect(po.itemNameText('new')).toContain('new');
			expect(po.itemNameText('help')).toContain('help');
		});

		it('marks exactly one entry as aria-selected', () => {
			const { po } = mountDropdown({
				commands: [CLEAR, NEW, HELP],
				selectedIndex: 1,
			});
			expect(po.itemAriaSelected('clear')).toBe('false');
			expect(po.itemAriaSelected('new')).toBe('true');
			expect(po.itemAriaSelected('help')).toBe('false');
		});
	});

	describe('ARIA semantics', () => {
		it('root has role="listbox"', () => {
			const { po } = mountDropdown({ commands: [CLEAR], selectedIndex: 0 });
			expect(po.rootRole()).toBe('listbox');
		});

		it('each item has role="option"', () => {
			const { po } = mountDropdown({
				commands: [CLEAR, NEW, HELP],
				selectedIndex: 0,
			});
			for (const item of po.items()) {
				expect(item.attributes('role')).toBe('option');
			}
		});

		// WP-7 a11y #3 — combobox wiring requires deterministic ids on the
		// listbox and per-option so the textarea can reference them via
		// `aria-controls` and `aria-activedescendant`.
		it('listbox carries id="slash-command-dropdown" for aria-controls (WP-7 a11y #3)', () => {
			const { po } = mountDropdown({ commands: [CLEAR], selectedIndex: 0 });
			expect(po.root.attributes('id')).toBe('slash-command-dropdown');
		});

		it('each option carries id="slash-command-item-${index}" for aria-activedescendant (WP-7 a11y #3)', () => {
			// Codex P2 follow-up: index-based ids (not name-based) so duplicates
			// are impossible when two commands share a name (e.g. built-in /help
			// alongside vault `.claude/commands/help.md`).
			const { po } = mountDropdown({
				commands: [CLEAR, NEW, HELP],
				selectedIndex: 0,
			});
			expect(po.itemByName('clear').attributes('id')).toBe('slash-command-item-0');
			expect(po.itemByName('new').attributes('id')).toBe('slash-command-item-1');
			expect(po.itemByName('help').attributes('id')).toBe('slash-command-item-2');
		});
	});

	describe('vault-loaded source labels and argument hints', () => {
		const VAULT_CMD: SlashCommand = Object.freeze({
			name: 'review',
			description: 'Run a code review.',
			kind: 'vault-command',
			action: 'vault-prompt',
			body: 'Review prompt body.',
			argumentHint: '[path/to/file]',
		});

		const VAULT_SKILL: SlashCommand = Object.freeze({
			name: 'publish-release',
			description: 'Walk through a release.',
			kind: 'vault-skill',
			action: 'vault-prompt',
			body: 'Release prompt body.',
		});

		it('renders the (command) source label for vault commands', () => {
			const { po } = mountDropdown({ commands: [VAULT_CMD], selectedIndex: 0 });
			expect(po.itemSourceLabel('review')).toBe('(command)');
		});

		it('renders the (skill) source label for vault skills', () => {
			const { po } = mountDropdown({ commands: [VAULT_SKILL], selectedIndex: 0 });
			expect(po.itemSourceLabel('publish-release')).toBe('(skill)');
		});

		it('omits the source label for built-ins', () => {
			const { po } = mountDropdown({ commands: [CLEAR], selectedIndex: 0 });
			expect(po.itemSourceLabel('clear')).toBeNull();
		});

		it('renders the argument hint after the description', () => {
			const { po } = mountDropdown({ commands: [VAULT_CMD], selectedIndex: 0 });
			expect(po.itemHintText('review')).toBe('[path/to/file]');
		});

		it('omits the hint when argumentHint is absent', () => {
			const { po } = mountDropdown({ commands: [VAULT_SKILL], selectedIndex: 0 });
			expect(po.itemHintText('publish-release')).toBeNull();
		});
	});

	describe('emits', () => {
		it('emits "select" with the clicked command (mousedown)', async () => {
			const { wrapper, po } = mountDropdown({
				commands: [CLEAR, NEW],
				selectedIndex: 0,
			});
			await po.clickItem('new');
			const emitted = wrapper.emitted('select');
			expect(emitted).toBeTruthy();
			const first = (emitted as Array<[SlashCommand]>)[0];
			expect(first[0].name).toBe('new');
		});

		it('emits "highlight" with the hovered index', async () => {
			const { wrapper, po } = mountDropdown({
				commands: [CLEAR, NEW, HELP],
				selectedIndex: 0,
			});
			await po.hoverItem('help');
			const emitted = wrapper.emitted('highlight');
			expect(emitted).toBeTruthy();
			const first = (emitted as Array<[number]>)[0];
			expect(first[0]).toBe(2);
		});
	});
});
