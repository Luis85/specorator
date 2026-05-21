/**
 * T-MPS-075 — `ThreadTab.vue` component contract.
 *
 * Satisfies REQ-MPS-018 (highlight + selection), REQ-MPS-020 (double-click
 * rename), NFR-MPS-009 (keyboard navigation primitives — focus, Enter,
 * Escape). The strip-level keyboard semantics (Arrow keys) are exercised
 * in `ThreadTabStrip.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';

import ThreadTab from '@/ui/components/agent/ThreadTab.vue';
import { i18n } from '@/ui/i18n';
import { ThreadTabPO } from './ThreadTab.po';

function mountTab(props: {
	threadId: string;
	title: string;
	active: boolean;
	tabIndex?: number;
}) {
	const wrapper = mount(ThreadTab, {
		global: { plugins: [i18n] },
		props,
	});
	return { wrapper, po: new ThreadTabPO(wrapper, props.threadId) };
}

describe('ThreadTab', () => {
	describe('rendering + active highlight (REQ-MPS-018)', () => {
		it('renders the tab root with the matching data-testid', () => {
			const { po } = mountTab({
				threadId: 't1',
				title: 'Pricing notes',
				active: false,
			});
			expect(po.root.exists()).toBe(true);
		});

		it('renders the title text when title is non-empty', () => {
			const { po } = mountTab({
				threadId: 't1',
				title: 'Pricing notes',
				active: false,
			});
			expect(po.label.text()).toBe('Pricing notes');
		});

		it('falls back to the localised default title when title is empty', () => {
			const { po } = mountTab({
				threadId: 't1',
				title: '',
				active: false,
			});
			expect(po.label.text()).toBe('New thread');
		});

		it('marks the tab aria-selected="true" when active', () => {
			const { po } = mountTab({ threadId: 't1', title: 'A', active: true });
			expect(po.isActive()).toBe(true);
		});

		it('marks the tab aria-selected="false" when not active', () => {
			const { po } = mountTab({ threadId: 't1', title: 'A', active: false });
			expect(po.isActive()).toBe(false);
		});

		it('carries role="tab"', () => {
			const { po } = mountTab({ threadId: 't1', title: 'A', active: false });
			expect(po.root.attributes('role')).toBe('tab');
		});
	});

	describe('activation (REQ-MPS-018)', () => {
		it('emits "activate" with the threadId on click', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: false,
			});
			await po.click();
			expect(wrapper.emitted('activate')).toEqual([['t1']]);
		});
	});

	describe('inline rename (REQ-MPS-020)', () => {
		it('shows the rename input after double-click on the label', async () => {
			const { po } = mountTab({ threadId: 't1', title: 'A', active: true });
			expect(po.renameInput.exists()).toBe(false);
			await po.doubleClickLabel();
			expect(po.renameInput.exists()).toBe(true);
		});

		it('emits "rename" with the trimmed new title on Enter', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: true,
			});
			await po.doubleClickLabel();
			await po.submitRename('Pricing notes');
			expect(wrapper.emitted('rename')).toEqual([
				[{ threadId: 't1', title: 'Pricing notes' }],
			]);
		});

		it('cancels the rename on Escape without emitting', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: true,
			});
			await po.doubleClickLabel();
			await po.cancelRename();
			expect(wrapper.emitted('rename')).toBeUndefined();
			expect(po.renameInput.exists()).toBe(false);
		});

		it('does not emit "rename" when the submitted title is empty', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: true,
			});
			await po.doubleClickLabel();
			await po.submitRename('   ');
			expect(wrapper.emitted('rename')).toBeUndefined();
		});
	});

	describe('context menu trigger (REQ-MPS-020, REQ-MPS-022, REQ-MPS-023)', () => {
		it('renders a context-menu button with data-testid', () => {
			const { po } = mountTab({ threadId: 't1', title: 'A', active: false });
			expect(po.contextMenuButton.exists()).toBe(true);
		});

		it('emits "open-context-menu" with the threadId when clicked', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: false,
			});
			await po.openContextMenu();
			expect(wrapper.emitted('open-context-menu')).toEqual([['t1']]);
		});

		it('emits "open-context-menu" on right-click (contextmenu event)', async () => {
			const { wrapper, po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: false,
			});
			await po.rightClick();
			expect(wrapper.emitted('open-context-menu')).toEqual([['t1']]);
		});
	});

	describe('keyboard focus primitive (NFR-MPS-009)', () => {
		it('uses roving tabIndex provided by the parent strip', () => {
			const { po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: false,
				tabIndex: -1,
			});
			expect(po.root.attributes('tabindex')).toBe('-1');
		});

		it('reflects tabIndex 0 when explicitly focused by the strip', () => {
			const { po } = mountTab({
				threadId: 't1',
				title: 'A',
				active: true,
				tabIndex: 0,
			});
			expect(po.root.attributes('tabindex')).toBe('0');
		});
	});
});
