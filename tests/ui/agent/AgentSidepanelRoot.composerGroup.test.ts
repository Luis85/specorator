/**
 * T-AUX-285 — `StatusPanel` and `ChatSidebar` (composer) share a single
 * bordered ancestor (`.sp-composer-group`) in `AgentSidepanelRoot.vue`.
 *
 * Satisfies REQ-AUX-011, spec §1.4. AttachmentStrip lives inside ChatInput
 * (CQ-AUX-18) and therefore inherits the group transitively — we assert via
 * `data-testid="agent-composer-group"` and `closest()` equality.
 */
import { describe, it, expect } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, h } from 'vue';

import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import { i18n } from '@/ui/i18n';
import { LOGGER_PORT, NOTIFICATION_PORT, VAULT_PORT } from '@/infrastructure/bridge/ports';
import type { LoggerPort, NotificationPort, VaultPort } from '@/domain/ports';

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

const StatusPanelStub = defineComponent({
	name: 'StatusPanelStub',
	render() {
		return h('div', { 'data-testid': 'status-panel' });
	},
});

const ChatSidebarStub = defineComponent({
	name: 'ChatSidebarStub',
	render() {
		return h('div', { 'data-testid': 'chat-sidebar' });
	},
});

const ChildStub = defineComponent({
	name: 'ChildStub',
	render() {
		return h('div', { 'data-testid': 'child-stub' });
	},
});

function mountRoot(): VueWrapper {
	setActivePinia(createPinia());
	return mount(AgentSidepanelRoot, {
		global: {
			plugins: [i18n],
			stubs: {
				StatusPanel: StatusPanelStub,
				ChatSidebar: ChatSidebarStub,
				MessageList: ChildStub,
				WelcomeGreeting: ChildStub,
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
		attachTo: document.body,
	});
}

describe('AgentSidepanelRoot composer-group (REQ-AUX-011)', () => {
	it('T-AUX-285: StatusPanel and ChatSidebar share a single `.sp-composer-group` ancestor', () => {
		const wrapper = mountRoot();
		const statusEl = wrapper.find('[data-testid="status-panel"]').element as HTMLElement;
		const sidebarEl = wrapper.find('[data-testid="chat-sidebar"]').element as HTMLElement;
		const statusGroup = statusEl.closest('.sp-composer-group');
		const sidebarGroup = sidebarEl.closest('.sp-composer-group');
		expect(statusGroup).not.toBeNull();
		expect(sidebarGroup).not.toBeNull();
		expect(statusGroup).toBe(sidebarGroup);
		// Also exposes a stable testid for downstream tests.
		expect(wrapper.find('[data-testid="agent-composer-group"]').exists()).toBe(true);
		wrapper.unmount();
	});
});
