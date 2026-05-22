/**
 * `[data-provider]` plumbing tests for `AgentSidepanelRoot.vue`
 * (REQ-AUX-006, ADR-AUX-002). The root must:
 *
 *   1. Carry the `specorator-root` class so the `--sp-*` token layer applies.
 *   2. Write `data-provider="<id>"` derived from `chatProviderStore`
 *      whenever an explicit provider is resolved. The attribute is absent
 *      while the resolution is `'degraded'` (no provider selected).
 *   3. Update the attribute in place when the resolution changes — the
 *      template root's element reference must stay identical across swaps.
 *
 * The embedded child surfaces are stubbed because this test exercises only
 * the root-element plumbing, not the chat engine.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia, type Pinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';

import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { i18n } from '@/ui/i18n';
import { LOGGER_PORT, NOTIFICATION_PORT, VAULT_PORT } from '@/infrastructure/bridge/ports';
import type { LoggerPort, NotificationPort, VaultPort } from '@/domain/ports';
import { AgentSidepanelRootDataProviderPO } from './AgentSidepanelRoot.dataProvider.po';

const noopLogger: LoggerPort = {
	debug: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	error: () => undefined,
};
const noopNotifications: NotificationPort = {
	showError: () => undefined,
	showWarning: () => undefined,
	showSuccess: () => undefined,
	showInfo: () => undefined,
};
const noopVault: VaultPort = {
	readFile: async () => '',
	writeFile: async () => undefined,
	deleteFile: async () => undefined,
	listFiles: async () => [],
	listFolders: async () => [],
	fileExists: async () => false,
	createFolder: async () => undefined,
};

const ChildStub = defineComponent({
	name: 'ChildStub',
	render() {
		return h('div', { 'data-testid': 'child-stub' });
	},
});

function mountRoot(): { wrapper: VueWrapper; po: AgentSidepanelRootDataProviderPO; pinia: Pinia } {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(AgentSidepanelRoot, {
		global: {
			plugins: [pinia, i18n],
			stubs: {
				ChatSidebar: ChildStub,
				MessageList: ChildStub,
				StatusPanel: ChildStub,
				AttachmentStrip: ChildStub,
				ProviderBadge: ChildStub,
				ModelSelector: ChildStub,
				AppToast: ChildStub,
				A11yAnnouncer: ChildStub,
				AgentSidepanelHeader: ChildStub,
				ThreadTabStrip: ChildStub,
			},
			provide: {
				[LOGGER_PORT as symbol]: noopLogger,
				[NOTIFICATION_PORT as symbol]: noopNotifications,
				[VAULT_PORT as symbol]: noopVault,
			},
		},
	});
	return { wrapper, po: new AgentSidepanelRootDataProviderPO(wrapper), pinia };
}

describe('AgentSidepanelRoot — [data-provider] plumbing (REQ-AUX-006)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('carries the specorator-root class so --sp-* tokens apply', () => {
		const { po } = mountRoot();
		expect(po.hasSpecoratorRootClass()).toBe(true);
	});

	it('omits data-provider while the resolved selection is degraded', () => {
		const { po } = mountRoot();
		// Default state of `chatProviderStore` is `resolved = 'degraded'`.
		expect(po.dataProvider()).toBeNull();
	});

	it('writes data-provider when an explicit provider resolves', async () => {
		const { po, pinia } = mountRoot();
		const providerStore = useChatProviderStore(pinia);
		providerStore.setResolved({ provider: 'claude', mode: 'cli' });
		await nextTick();
		expect(po.dataProvider()).toBe('claude');
	});

	it('updates data-provider in place without remounting the root element', async () => {
		const { po, pinia } = mountRoot();
		const providerStore = useChatProviderStore(pinia);
		providerStore.setResolved({ provider: 'claude', mode: 'cli' });
		await nextTick();
		const firstEl = po.rootEl;
		expect(po.dataProvider()).toBe('claude');

		providerStore.setResolved({ provider: 'cursor', mode: 'api' });
		await nextTick();
		expect(po.dataProvider()).toBe('cursor');
		// Same DOM node — Vue must not have re-created the root.
		expect(po.rootEl).toBe(firstEl);
	});
});
