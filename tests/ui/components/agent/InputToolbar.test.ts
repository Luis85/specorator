/**
 * Tests for `<InputToolbar>` (REQ-AUX-004, spec §1.3.3).
 *
 *   T-AUX-267: source order matches model · mode · permission · thinking · mcp ·
 *              context-meter · send (children carry the matching data-testid).
 *   T-AUX-268: send/stop swap on streaming — when messagesStore.status is
 *              'loading', the trailing button renders `icon="square"` and emits
 *              `stop`; otherwise renders `icon="send"` and emits `send`.
 *   T-AUX-269: narrow-pane wraps to two rows (asserted via data-narrow).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

import InputToolbar from '@/ui/components/agent/InputToolbar.vue';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { i18n } from '@/ui/i18n';
import { ICON_PORT, LOGGER_PORT, PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry';
import { InputToolbarPageObject } from './InputToolbar.po';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

const emptyRegistry: ProviderRegistry = {
	listProviders: () => [],
	getProvider: () => undefined,
	getCapabilities: () => undefined,
};

function mountToolbar(opts?: { narrow?: boolean }) {
	const bridge = new MockBridge() as unknown as IconPort;
	return mount(InputToolbar, {
		props: { narrow: opts?.narrow ?? false },
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
				[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
			},
		},
		attachTo: document.body,
	});
}

describe('<InputToolbar>', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('T-AUX-267: children render in REQ-AUX-004 normative source order', () => {
		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.childOrder()).toEqual([
			'input-toolbar-model',
			'input-toolbar-mode',
			'input-toolbar-permission',
			'input-toolbar-thinking',
			'input-toolbar-mcp',
			'input-toolbar-context-meter',
			'input-toolbar-send',
		]);
	});

	it('T-AUX-268: idle status renders send icon and emits send on click', async () => {
		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.sendIcon()).toBe('send');
		await wrapper.get('[data-testid="input-toolbar-send"] button').trigger('click');
		expect(wrapper.emitted('send')?.length ?? 0).toBeGreaterThan(0);
		expect(wrapper.emitted('stop')).toBeUndefined();
	});

	it('T-AUX-268: streaming status renders stop icon and emits stop on click', async () => {
		const messages = useMessagesStore();
		messages.beginRequest();

		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.sendIcon()).toBe('square');
		await wrapper.get('[data-testid="input-toolbar-send"] button').trigger('click');
		expect(wrapper.emitted('stop')?.length ?? 0).toBeGreaterThan(0);
		expect(wrapper.emitted('send')).toBeUndefined();
	});

	it('T-AUX-269: narrow prop flips data-narrow="true" on the root', () => {
		const wrapper = mountToolbar({ narrow: true });
		const po = new InputToolbarPageObject(wrapper);
		expect(po.isNarrow()).toBe(true);
	});

	it('T-AUX-269: default narrow=false', () => {
		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.isNarrow()).toBe(false);
	});

	it('send button has accessible name from agent.composer.send.*', () => {
		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.sendAriaLabel()).toBe('Send');
	});

	it('streaming send button has stop accessible name', () => {
		const messages = useMessagesStore();
		messages.beginRequest();
		const wrapper = mountToolbar();
		const po = new InputToolbarPageObject(wrapper);
		expect(po.sendAriaLabel()).toBe('Stop generation');
	});
});
