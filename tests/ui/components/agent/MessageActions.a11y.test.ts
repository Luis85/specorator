/**
 * T-MPS-085 — `MessageActions.vue`: aria-labels per action. Satisfies
 * NFR-MPS-008. Each rendered button must expose a localised `aria-label` so
 * screen readers announce intent without depending on the visible text.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MessageActions from '@/ui/components/agent/MessageActions.vue';
import { i18n } from '@/ui/i18n';
import { MessageActionsPO } from './MessageActions.po';

describe('MessageActions — a11y', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('exposes aria-label on the Copy button', () => {
		const wrapper = mount(MessageActions, {
			global: { plugins: [i18n] },
			props: { messageId: 'm-1', role: 'assistant', isLatest: true },
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.copyButton.attributes('aria-label')).toBe('Copy message');
	});

	it('exposes aria-label on the Regenerate button', () => {
		const wrapper = mount(MessageActions, {
			global: { plugins: [i18n] },
			props: { messageId: 'm-1', role: 'assistant', isLatest: true },
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.regenerateButton.attributes('aria-label')).toBe(
			'Regenerate latest assistant reply',
		);
	});

	it('exposes aria-label on the Edit button', () => {
		const wrapper = mount(MessageActions, {
			global: { plugins: [i18n] },
			props: { messageId: 'm-1', role: 'user', isLatest: false },
		});
		const po = new MessageActionsPO(wrapper);
		expect(po.editButton.attributes('aria-label')).toBe('Edit and resend message');
	});
});
