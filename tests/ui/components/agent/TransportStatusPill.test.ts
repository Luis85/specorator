/**
 * Tests for `<TransportStatusPill>` — surfaces transport health
 * (connecting/degraded/offline) at the top of the message list.
 *
 * Satisfies REQ-AUX-016, spec §1.3.10, §1.6.
 *   T-AUX-289: renders per-kind microcopy with `{provider}` interpolation.
 *   T-AUX-290: emits `retry` on retry-button click (for `degraded`/`offline`).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';

import TransportStatusPill from '@/ui/components/agent/TransportStatusPill.vue';
import { TransportStatusPillPageObject } from './TransportStatusPill.po';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

const i18n = createI18n({
	legacy: false,
	locale: 'en',
	messages: {
		en: {
			agent: {
				transport: {
					connecting: 'Connecting to {provider}.',
					degraded: '{provider} is slow to respond.',
					offline: '{provider} is unreachable.',
					retry: 'Retry',
				},
			},
		},
	},
});

function mountPill(props: {
	kind: 'connecting' | 'degraded' | 'offline';
	providerLabel: string;
	diagnostic?: string;
}) {
	const bridge = new MockBridge() as unknown as IconPort;
	const wrapper = mount(TransportStatusPill, {
		props,
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		attachTo: document.body,
	});
	return { wrapper, po: new TransportStatusPillPageObject(wrapper) };
}

describe('<TransportStatusPill>', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	afterEach(() => {
		while (document.body.firstChild !== null) {
			document.body.removeChild(document.body.firstChild);
		}
	});

	it('T-AUX-289: connecting kind renders connecting microcopy', () => {
		const { po } = mountPill({ kind: 'connecting', providerLabel: 'Claude · CLI' });
		expect(po.exists()).toBe(true);
		expect(po.kind()).toBe('connecting');
		expect(po.text()).toBe('Connecting to Claude · CLI.');
	});

	it('T-AUX-289: degraded kind renders degraded microcopy', () => {
		const { po } = mountPill({ kind: 'degraded', providerLabel: 'Codex · API' });
		expect(po.kind()).toBe('degraded');
		expect(po.text()).toBe('Codex · API is slow to respond.');
	});

	it('T-AUX-289: offline kind renders offline microcopy', () => {
		const { po } = mountPill({ kind: 'offline', providerLabel: 'Cursor · CLI' });
		expect(po.kind()).toBe('offline');
		expect(po.text()).toBe('Cursor · CLI is unreachable.');
	});

	it('T-AUX-290: clicking retry emits `retry`', async () => {
		const { wrapper, po } = mountPill({ kind: 'degraded', providerLabel: 'Claude · CLI' });
		expect(po.hasRetry()).toBe(true);
		await po.clickRetry();
		expect(wrapper.emitted('retry')).toBeTruthy();
		expect(wrapper.emitted('retry')?.length).toBe(1);
	});

	it('connecting kind hides retry button', () => {
		const { po } = mountPill({ kind: 'connecting', providerLabel: 'Claude · CLI' });
		expect(po.hasRetry()).toBe(false);
	});

	it('offline kind shows retry button', () => {
		const { po } = mountPill({ kind: 'offline', providerLabel: 'Claude · CLI' });
		expect(po.hasRetry()).toBe(true);
	});
});
