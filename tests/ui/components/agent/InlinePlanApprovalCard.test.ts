/**
 * Tests for `InlinePlanApprovalCard.vue` — inline plan-mode approval
 * card. PR-ASV-2-plan-mode (agent-sidepanel-v2 Increment 2).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import InlinePlanApprovalCard from '@/ui/components/agent/InlinePlanApprovalCard.vue';
import { i18n } from '@/ui/i18n';
import { InlinePlanApprovalCardPO } from './InlinePlanApprovalCard.po';

function mountCard(
	props: {
		planMarkdown?: string;
		allowedPrompts?: readonly string[];
		/**
		 * UX #12 (WP-8). Tests default to `false` (legacy auto-cancel on
		 * unmount) so the existing keyboard/click assertions keep their
		 * semantics. Opt-in tests for the persistence path pass `true` to
		 * exercise the new "unmount = transient hide" behaviour.
		 */
		persistOnUnmount?: boolean;
	} = {},
) {
	return mount(InlinePlanApprovalCard, {
		global: { plugins: [i18n] },
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom test runner has no Obsidian popout windows.
		attachTo: document.body,
		props: {
			planMarkdown: props.planMarkdown ?? 'Step 1: do thing.\nStep 2: do other thing.',
			allowedPrompts: props.allowedPrompts,
			persistOnUnmount: props.persistOnUnmount ?? false,
		},
	});
}

describe('InlinePlanApprovalCard', () => {
	it('renders the heading, plan text, and three action rows', () => {
		const w = mountCard();
		expect(w.find('[data-testid="agent-plan-approval-header"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-plan-approval-plan"]').text()).toContain('Step 1');
		expect(w.find('[data-testid="agent-plan-approval-row-implement"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-plan-approval-row-revise"]').exists()).toBe(true);
		expect(w.find('[data-testid="agent-plan-approval-row-cancel"]').exists()).toBe(true);
	});

	it('renders the permissions list when allowedPrompts is non-empty', () => {
		const w = mountCard({ allowedPrompts: ['Bash', 'Write'] });
		const el = w.find('[data-testid="agent-plan-approval-permissions"]');
		expect(el.exists()).toBe(true);
		expect(el.text()).toContain('Bash');
		expect(el.text()).toContain('Write');
	});

	it('hides the permissions row when allowedPrompts is undefined', () => {
		const w = mountCard();
		expect(w.find('[data-testid="agent-plan-approval-permissions"]').exists()).toBe(false);
	});

	it('hides the permissions row when allowedPrompts is empty', () => {
		const w = mountCard({ allowedPrompts: [] });
		expect(w.find('[data-testid="agent-plan-approval-permissions"]').exists()).toBe(false);
	});

	it('emits decide({implement}) when Enter fires on the implement row', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval"]').trigger('keydown', { key: 'Enter' });
		expect(w.emitted('decide')?.[0]).toEqual([{ type: 'implement' }]);
	});

	it('emits decide({cancel}) when Escape fires on the card', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval"]').trigger('keydown', { key: 'Escape' });
		expect(w.emitted('decide')?.[0]).toEqual([{ type: 'cancel' }]);
	});

	it('wraps selection on ArrowUp from the first row to the last row', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval"]').trigger('keydown', { key: 'ArrowUp' });
		await nextTick();
		expect(w.find('[data-testid="agent-plan-approval-row-cancel"]').classes()).toContain(
			'sp-plan-approval__row--focused',
		);
	});

	it('clicking implement directly emits decide({implement})', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-implement"]').trigger('click');
		expect(w.emitted('decide')?.[0]).toEqual([{ type: 'implement' }]);
	});

	it('clicking cancel emits decide({cancel})', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-cancel"]').trigger('click');
		expect(w.emitted('decide')?.[0]).toEqual([{ type: 'cancel' }]);
	});

	it('clicking revise expands the textarea without emitting', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-revise"]').trigger('click');
		await nextTick();
		expect(w.find('[data-testid="agent-plan-approval-revise"]').exists()).toBe(true);
		expect(w.emitted('decide')).toBeUndefined();
	});

	it('Enter in the revise textarea emits decide({revise, text})', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-revise"]').trigger('click');
		await nextTick();
		const ta = w.find('[data-testid="agent-plan-approval-revise"]');
		await ta.setValue('use TypeScript instead');
		await ta.trigger('keydown', { key: 'Enter' });
		expect(w.emitted('decide')?.[0]).toEqual([
			{ type: 'revise', text: 'use TypeScript instead' },
		]);
	});

	it('Enter in the revise textarea with empty text is a no-op', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-revise"]').trigger('click');
		await nextTick();
		const ta = w.find('[data-testid="agent-plan-approval-revise"]');
		await ta.setValue('   ');
		await ta.trigger('keydown', { key: 'Enter' });
		expect(w.emitted('decide')).toBeUndefined();
	});

	it('IME composition Enter in the textarea is ignored', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-revise"]').trigger('click');
		await nextTick();
		const ta = w.find('[data-testid="agent-plan-approval-revise"]');
		await ta.setValue('日本語');
		await ta.trigger('keydown', { key: 'Enter', isComposing: true });
		expect(w.emitted('decide')).toBeUndefined();
	});

	it('decisions are idempotent — second commit is a no-op', async () => {
		const w = mountCard();
		await w.find('[data-testid="agent-plan-approval-row-implement"]').trigger('click');
		await w.find('[data-testid="agent-plan-approval-row-cancel"]').trigger('click');
		expect(w.emitted('decide')).toHaveLength(1);
	});

	it('unmounting before a decision emits cancel', () => {
		const w = mountCard();
		w.unmount();
		expect(w.emitted('decide')?.[0]).toEqual([{ type: 'cancel' }]);
	});

	describe('UX #12 (WP-8) — persistOnUnmount=true treats unmount as transient hide', () => {
		it('emits pending-changed(true) on mount', () => {
			const w = mountCard({ persistOnUnmount: true });
			expect(w.emitted('pending-changed')?.[0]).toEqual([true]);
		});

		it('does NOT emit decide on unmount when persistOnUnmount=true', () => {
			const w = mountCard({ persistOnUnmount: true });
			w.unmount();
			expect(w.emitted('decide')).toBeUndefined();
		});

		it('emits pending-changed(false) after a real decision', async () => {
			const w = mountCard({ persistOnUnmount: true });
			await w.find('[data-testid="agent-plan-approval-row-implement"]').trigger('click');
			const events = w.emitted('pending-changed')!;
			expect(events[events.length - 1]).toEqual([false]);
		});
	});

	describe('UX #19 (WP-8) — plan body renders through MarkdownBlock', () => {
		it('renders the plan markdown via MarkdownBlock instead of a raw <pre>', () => {
			const w = mountCard({ planMarkdown: 'Step **one** is bold.' });
			const plan = w.find('[data-testid="agent-plan-approval-plan"]');
			expect(plan.exists()).toBe(true);
			// MarkdownBlock emits the formatted HTML; bold markdown should
			// render as a <strong> element.
			expect(plan.find('strong').exists()).toBe(true);
			expect(plan.find('strong').text()).toBe('one');
		});
	});

	// ─────────────────────────────────────────────────────────────────────────
	// WP-7 a11y P1 wave — A11y #2
	// ─────────────────────────────────────────────────────────────────────────
	// jsdom test runner has no Obsidian popout windows, so the
	// `obsidianmd/prefer-active-doc` and `prefer-create-el` rules don't apply
	// to the focus assertions and synthetic-button helpers below.
	/* eslint-disable obsidianmd/prefer-active-doc, obsidianmd/prefer-create-el */
	describe('WP-7 a11y #2 — focus and radiogroup semantics', () => {
		it('focuses the card root on mount', async () => {
			const w = mountCard();
			await nextTick();
			const root = w.find('[data-testid="agent-plan-approval"]').element as HTMLElement;
			expect(document.activeElement).toBe(root);
		});

		it('rows expose role="radio" inside a role="radiogroup" container', () => {
			const po = new InlinePlanApprovalCardPO(mountCard());
			expect(po.radiogroupExists()).toBe(true);
			expect(po.rowRole('implement')).toBe('radio');
			expect(po.rowRole('revise')).toBe('radio');
			expect(po.rowRole('cancel')).toBe('radio');
		});

		it('marks the focused row with aria-checked="true" and the others false', async () => {
			const po = new InlinePlanApprovalCardPO(mountCard());
			expect(po.rowAriaChecked('implement')).toBe('true');
			expect(po.rowAriaChecked('revise')).toBe('false');
			expect(po.rowAriaChecked('cancel')).toBe('false');

			await po.root.trigger('keydown', { key: 'ArrowDown' });
			await nextTick();
			expect(po.rowAriaChecked('implement')).toBe('false');
			expect(po.rowAriaChecked('revise')).toBe('true');
		});

		it('sets tabindex="0" only on the focused row (active-descendant model)', () => {
			const po = new InlinePlanApprovalCardPO(mountCard());
			expect(po.rowTabindex('implement')).toBe('0');
			expect(po.rowTabindex('revise')).toBe('-1');
			expect(po.rowTabindex('cancel')).toBe('-1');
		});

		it('publishes aria-activedescendant on the focus owner, not the radiogroup (Codex P2 round-5)', async () => {
			// Codex P2 round-5 on PR #402: `aria-activedescendant` must live
			// on the DOM-focused element so assistive tech publishes the
			// active option correctly. The `<section>` owns focus and
			// keydown; the `<ul role="radiogroup">` is purely a semantic
			// grouping. ArrowUp/Down updates the pointer on the section,
			// not the ul.
			const po = new InlinePlanApprovalCardPO(mountCard());
			expect(po.rootAriaActiveDescendant()).toBe('agent-plan-approval-row-implement');
			expect(po.radiogroupAriaActiveDescendant()).toBeUndefined();

			await po.root.trigger('keydown', { key: 'ArrowDown' });
			await nextTick();
			expect(po.rootAriaActiveDescendant()).toBe('agent-plan-approval-row-revise');
			expect(po.radiogroupAriaActiveDescendant()).toBeUndefined();
		});

		it('restores focus to the previously-focused element on decide', async () => {
			// Mount a separate "previous" element that owns focus before the
			// card mounts. Decide → focus must return to it.
			const previous = document.createElement('button');
			previous.setAttribute('data-testid', 'prev-focus');
			document.body.appendChild(previous);
			previous.focus();
			expect(document.activeElement).toBe(previous);

			const w = mountCard();
			await nextTick();
			// Card auto-focuses on mount; previous lost focus to root.
			await w.find('[data-testid="agent-plan-approval-row-implement"]').trigger('click');
			await nextTick();
			expect(document.activeElement).toBe(previous);
			document.body.removeChild(previous);
		});

		it('restores focus on Escape cancel', async () => {
			const previous = document.createElement('button');
			document.body.appendChild(previous);
			previous.focus();
			const w = mountCard();
			await nextTick();
			await w.find('[data-testid="agent-plan-approval"]').trigger('keydown', { key: 'Escape' });
			await nextTick();
			expect(document.activeElement).toBe(previous);
			document.body.removeChild(previous);
		});
	});
	/* eslint-enable obsidianmd/prefer-active-doc, obsidianmd/prefer-create-el */
});
