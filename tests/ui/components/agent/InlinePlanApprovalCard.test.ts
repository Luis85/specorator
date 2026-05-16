/**
 * Tests for `InlinePlanApprovalCard.vue` — inline plan-mode approval
 * card. PR-ASV-2-plan-mode (agent-sidepanel-v2 Increment 2).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import InlinePlanApprovalCard from '@/ui/components/agent/InlinePlanApprovalCard.vue';
import { i18n } from '@/ui/i18n';

function mountCard(props: { planMarkdown?: string; allowedPrompts?: readonly string[] } = {}) {
	return mount(InlinePlanApprovalCard, {
		global: { plugins: [i18n] },
		props: {
			planMarkdown: props.planMarkdown ?? 'Step 1: do thing.\nStep 2: do other thing.',
			allowedPrompts: props.allowedPrompts,
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
});
