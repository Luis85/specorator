/**
 * T-MPS-085 — `MessageActions.vue`: aria-labels per action. Satisfies
 * NFR-MPS-008. Each rendered button must expose a localised `aria-label` so
 * screen readers announce intent without depending on the visible text.
 *
 * WS-AUX-5 — buttons are now `<SpIconButton>` (icon-only); aria-label
 * surfaces via the rendered `<button>` exactly as before.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { MessageActionsPO } from './MessageActions.po';
import { mountMessageActions } from './messageActionsTestHelpers';

describe('MessageActions — a11y', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('exposes aria-label on the Copy button', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.copyButton.attributes('aria-label')).toBe('Copy message');
	});

	it('exposes aria-label on the Regenerate button', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'assistant',
			isLatest: true,
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.regenerateButton.attributes('aria-label')).toBe('Regenerate latest assistant reply');
	});

	it('exposes aria-label on the Edit button', () => {
		const wrapper = mountMessageActions({
			messageId: 'm-1',
			role: 'user',
			isLatest: false,
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.editButton.attributes('aria-label')).toBe('Edit and resend message');
	});
});
