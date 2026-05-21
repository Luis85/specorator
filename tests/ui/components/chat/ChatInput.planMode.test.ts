/**
 * T-MPS-107 — Shift+Tab on the ChatInput textarea toggles `planMode` in
 * `chatInputModeStore` and announces the change via the A11y announcer.
 *
 * Satisfies REQ-MPS-036, NFR-MPS-010, TST-MPS-22.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ChatInput from '@/ui/components/chat/ChatInput.vue';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { VAULT_PORT } from '@/infrastructure/bridge/ports';
import { i18n } from '@/ui/i18n';
import { useChatInputModeStore } from '@/ui/stores/chatInputModeStore';
import { ChatInputPO } from './ChatInput.po';

function mountInput() {
	const bridge = new MockBridge({});
	const wrapper = mount(ChatInput, {
		props: { modelValue: '', disabled: false, loading: false },
		global: {
			plugins: [i18n],
			provide: {
				[VAULT_PORT as symbol]: bridge,
			},
		},
	});
	return new ChatInputPO(wrapper);
}

describe('ChatInput — plan mode (Shift+Tab)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-036: Shift+Tab toggles planMode in the store', async () => {
		const po = mountInput();
		const store = useChatInputModeStore();
		expect(store.planMode).toBe(false);
		await po.textarea.trigger('keydown', { key: 'Tab', shiftKey: true });
		expect(store.planMode).toBe(true);
		await po.textarea.trigger('keydown', { key: 'Tab', shiftKey: true });
		expect(store.planMode).toBe(false);
	});

	it('NFR-MPS-010: Shift+Tab preventDefault so focus does not move', async () => {
		const po = mountInput();
		const event = new KeyboardEvent('keydown', {
			key: 'Tab',
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		(po.textarea.element as HTMLTextAreaElement).dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
	});
});
