/**
 * T-CP-031 (RED) — `ComposerDropdown.vue` combobox/listbox + keyboard (TEST-CP-014).
 *
 * SPEC-CP-020, SPEC-CP-037. The shared slash/skills/mention drop-UP palette:
 * `role="listbox"`, rows `role="option"` + `aria-selected`; the listbox exposes
 * the active-descendant id (the textarea binds `aria-activedescendant`).
 * Slash/skills: built-ins first then provider entries (REQ-CP-003/004), Enter or
 * Tab confirm (REQ-CP-005), whitespace closes (EC-CP-2), Escape closes
 * text-unchanged (REQ-CP-008), `$` vs `/` prefix distinct (EC-CP-11). Mention `@`
 * with no matches → an empty-state line, the palette stays open (EC-CP-3b). Arrow
 * Up/Down move the highlight. No `v-html` (EC-CP-13). Queried by `data-testid`
 * only (ADR-009).
 *
 * Traces: REQ-CP-001/002/005/006/007/008/009/011/013, NFR-CP-003/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ComposerDropdown from '@/ui/chat/composer/ComposerDropdown.vue';
import type { PaletteEntry } from '@/ui/chat/composer/useComposerMode';
import type { CatalogEntry, MentionReferent } from '@/domain/ports';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { i18n } from '@/ui/i18n';
import { ComposerDropdownPageObject } from './ComposerDropdown.po';

type Mode = 'slash' | 'skills' | 'mention';

function mountDropdown(entries: PaletteEntry[], mode: Mode = 'slash') {
	const wrapper = mount(ComposerDropdown, {
		props: { entries, mode },
		global: { plugins: [i18n], provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new ComposerDropdownPageObject(wrapper) };
}

function keydown(init: { key: string; shiftKey?: boolean; isComposing?: boolean }): KeyboardEvent {
	return new KeyboardEvent('keydown', { cancelable: true, ...init });
}

const slashEntries: CatalogEntry[] = [
	{ kind: 'command', prefix: '/', name: 'clear', description: 'Clear', builtIn: true },
	{ kind: 'command', prefix: '/', name: 'new', description: 'New', builtIn: true },
	{ kind: 'command', prefix: '/', name: 'deploy', description: 'Deploy', builtIn: false },
];

const skillEntries: CatalogEntry[] = [
	{ kind: 'skill', prefix: '$', name: 'summarise', description: 'Summarise', builtIn: false },
];

const mentionEntries: MentionReferent[] = [
	{ kind: 'file', name: 'notes.md', mentionText: '@notes.md', detail: 'notes.md' },
	{ kind: 'subagent', name: 'reviewer', mentionText: '@reviewer', detail: 'Reviews diffs' },
];

describe('ComposerDropdown — ARIA (TEST-CP-014)', () => {
	it('renders a role=listbox palette with role=option rows', () => {
		const { po } = mountDropdown(slashEntries);
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('listbox');
		expect(po.optionCount()).toBe(3);
		expect(po.option(0).attributes('role')).toBe('option');
	});

	it('the first option is selected by default and advertises the active-descendant id', () => {
		const { po } = mountDropdown(slashEntries);
		expect(po.optionSelected(0)).toBe(true);
		expect(po.optionSelected(1)).toBe(false);
		expect(po.activeDescendant()).toBe(po.optionId(0));
	});

	it('each option carries a stable id (the textarea binds aria-activedescendant)', () => {
		const { po } = mountDropdown(slashEntries);
		expect(po.optionId(0)).not.toBe('');
		expect(po.optionId(0)).not.toBe(po.optionId(1));
	});

	it('exposes hints text as an aria-describedby target', () => {
		const { po } = mountDropdown(slashEntries);
		expect(po.hintsId()).not.toBe('');
	});
});

describe('ComposerDropdown — keyboard (TEST-CP-014)', () => {
	it('Arrow Down moves the highlight; aria-activedescendant follows', async () => {
		const { wrapper, po } = mountDropdown(slashEntries);
		const handled = wrapper.vm.handleKeydown(keydown({ key: 'ArrowDown' }));
		await wrapper.vm.$nextTick();
		expect(handled).toBe(true);
		expect(po.optionSelected(1)).toBe(true);
		expect(po.activeDescendant()).toBe(po.optionId(1));
	});

	it('Arrow Up from the top wraps to the last option', async () => {
		const { wrapper, po } = mountDropdown(slashEntries);
		wrapper.vm.handleKeydown(keydown({ key: 'ArrowUp' }));
		await wrapper.vm.$nextTick();
		expect(po.optionSelected(2)).toBe(true);
	});

	it('REQ-CP-005: Enter confirms the highlighted entry (emits confirm with the index)', () => {
		const { wrapper } = mountDropdown(slashEntries);
		wrapper.vm.handleKeydown(keydown({ key: 'ArrowDown' }));
		const handled = wrapper.vm.handleKeydown(keydown({ key: 'Enter' }));
		expect(handled).toBe(true);
		expect(wrapper.emitted('confirm')).toEqual([[1]]);
	});

	it('REQ-CP-005: Tab also confirms the highlighted entry', () => {
		const { wrapper } = mountDropdown(slashEntries);
		const handled = wrapper.vm.handleKeydown(keydown({ key: 'Tab' }));
		expect(handled).toBe(true);
		expect(wrapper.emitted('confirm')).toEqual([[0]]);
	});

	it('REQ-CP-008: Escape closes (emits close), text unchanged (no confirm)', () => {
		const { wrapper } = mountDropdown(slashEntries);
		const handled = wrapper.vm.handleKeydown(keydown({ key: 'Escape' }));
		expect(handled).toBe(true);
		expect(wrapper.emitted('close')).toHaveLength(1);
		expect(wrapper.emitted('confirm')).toBeUndefined();
	});

	it('clicking an option (mousedown) confirms it without stealing focus', async () => {
		const { wrapper, po } = mountDropdown(slashEntries);
		await po.clickOption(2);
		expect(wrapper.emitted('confirm')).toEqual([[2]]);
	});
});

describe('ComposerDropdown — slash/skills + mention rows (TEST-CP-014/017)', () => {
	it('REQ-CP-003: built-ins list before provider entries', () => {
		const { po } = mountDropdown(slashEntries);
		expect(po.optionText(0)).toContain('clear');
		expect(po.optionText(2)).toContain('deploy');
	});

	it('EC-CP-11: `$` skill prefix is rendered distinct from a `/` command', () => {
		const { po } = mountDropdown(skillEntries, 'skills');
		expect(po.optionText(0)).toContain('$');
		expect(po.optionText(0)).toContain('summarise');
	});

	it('EC-CP-11: a `/` command is rendered with the `/` prefix', () => {
		const { po } = mountDropdown(slashEntries, 'slash');
		expect(po.optionText(0)).toContain('/');
	});

	it('mention mode renders MentionRow rows (file single-line, subagent two-line)', () => {
		const { po } = mountDropdown(mentionEntries, 'mention');
		expect(po.optionCount()).toBe(2);
		expect(po.optionText(0)).toContain('notes.md');
		expect(po.optionText(1)).toContain('reviewer');
	});

	it('EC-CP-3b: mention with no matches → an empty-state line, palette stays open', () => {
		const { po } = mountDropdown([], 'mention');
		expect(po.exists()).toBe(true);
		expect(po.hasEmptyState()).toBe(true);
		expect(po.optionCount()).toBe(0);
	});

	it('EC-CP-13: a <script> in a command name renders verbatim as text (no v-html sink)', () => {
		const evil: CatalogEntry[] = [
			{ kind: 'command', prefix: '/', name: '<script>x</script>', builtIn: false },
		];
		const { po } = mountDropdown(evil, 'slash');
		expect(po.optionText(0)).toContain('<script>x</script>');
		expect(po.listbox.html()).not.toContain('<script>x</script>');
	});
});
