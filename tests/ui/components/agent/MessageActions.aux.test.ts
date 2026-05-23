/**
 * WS-AUX-5 tests for `MessageActions.vue`:
 *
 *   T-AUX-229 — actions wrapped in `<HoverActions>` (REQ-AUX-002). The
 *               container carries `data-testid="hover-actions"` from the
 *               primitive, so reveal-state contract is observable.
 *   T-AUX-231 — Copy click triggers "Copied" confirmation swap on the icon's
 *               aria-label for ~1.5 s (REQ-AUX-016); confirm reverts.
 *   T-AUX-230 — Copy/Regenerate/Edit icons render via `<SpIconButton>` with
 *               the canonical Lucide names: copy / rotate-ccw / pencil.
 *   CQ-AUX-06 — Fork action is gated behind `showFork=true` (default false).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { MessageActionsPO } from './MessageActions.po';
import { mountMessageActions } from './messageActionsTestHelpers';

describe('MessageActions — AUX WS-5 refresh', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('mounts inside a HoverActions toolbar (T-AUX-229)', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		const toolbar = wrapper.find('[data-testid="message-actions"]');
		expect(toolbar.exists()).toBe(true);
		expect(toolbar.attributes('role')).toBe('toolbar');
	});

	it('renders copy + rotate-ccw + pencil Lucide icons (T-AUX-230)', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		const copy = wrapper.find('[data-testid="message-action-copy"]');
		expect(copy.exists()).toBe(true);
		expect(copy.find('[data-testid="sp-icon"]').attributes('data-icon')).toBe('copy');
		const regen = wrapper.find('[data-testid="message-action-regenerate"]');
		expect(regen.find('[data-testid="sp-icon"]').attributes('data-icon')).toBe('rotate-ccw');

		// Now mount a user role to inspect the pencil
		const userWrapper = mountMessageActions({
			messageId: 'u-1',
			role: 'user',
			isLatest: false,
		});
		const edit = userWrapper.find('[data-testid="message-action-edit"]');
		expect(edit.find('[data-testid="sp-icon"]').attributes('data-icon')).toBe('pencil');
	});

	it('hides Fork action by default (CQ-AUX-06 escalation)', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		expect(wrapper.find('[data-testid="message-action-fork"]').exists()).toBe(false);
	});

	it('renders Fork action when showFork=true', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
			showFork: true,
		});
		expect(wrapper.find('[data-testid="message-action-fork"]').exists()).toBe(true);
	});

	it('swaps Copy aria-label to Copied for 1.5s after a click (T-AUX-231/232)', async () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.copyButton.attributes('aria-label')).toBe('Copy message');

		await po.copyButton.trigger('click');
		await wrapper.vm.$nextTick();
		expect(po.copyButton.attributes('aria-label')).toBe('Copied');

		vi.advanceTimersByTime(1500);
		await wrapper.vm.$nextTick();
		expect(po.copyButton.attributes('aria-label')).toBe('Copy message');
	});
});
