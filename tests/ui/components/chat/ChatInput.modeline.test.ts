/**
 * T-MPS-108 — ChatInput recognises `!` and `#` prefixes and updates
 * `chatInputModeStore` accordingly.
 *
 * Satisfies REQ-MPS-038, REQ-MPS-039.
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

function mountInput(modelValue = '') {
	const bridge = new MockBridge({});
	const wrapper = mount(ChatInput, {
		props: { modelValue, disabled: false, loading: false },
		global: {
			plugins: [i18n],
			provide: {
				[VAULT_PORT as symbol]: bridge,
			},
		},
	});
	return { wrapper, po: new ChatInputPO(wrapper) };
}

describe('ChatInput — modeline prefix detection', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-038: typing `!ls` sets bangBashMode=true', async () => {
		const { po } = mountInput();
		const store = useChatInputModeStore();
		await po.typeAndMoveCaret('!ls');
		expect(store.bangBashMode).toBe(true);
		expect(store.instructionMode).toBe(false);
	});

	it('REQ-MPS-039: typing `#be concise` sets instructionMode=true', async () => {
		const { po } = mountInput();
		const store = useChatInputModeStore();
		await po.typeAndMoveCaret('#be concise');
		expect(store.instructionMode).toBe(true);
		expect(store.bangBashMode).toBe(false);
	});

	it('REQ-MPS-038/039: plain text clears both modes', async () => {
		const { po } = mountInput();
		const store = useChatInputModeStore();
		await po.typeAndMoveCaret('!ls');
		await po.typeAndMoveCaret('hello');
		expect(store.bangBashMode).toBe(false);
		expect(store.instructionMode).toBe(false);
	});
});
