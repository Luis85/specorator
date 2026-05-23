/**
 * G2.2 (RALPH G2) — `AgentSidepanelRoot` only mounts `ThreadTabStrip` when
 * the user has more than one open thread. Single-thread sessions get no
 * tab strip at all, matching Claudian's empty-header parity.
 *
 * The strip pops into view automatically once a second thread is created.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, h } from 'vue';

import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { i18n } from '@/ui/i18n';
import {
	ICON_PORT,
	LOGGER_PORT,
	NOTIFICATION_PORT,
	VAULT_PORT,
} from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type {
	ChatThreadRecord,
} from '@/domain/chat/ChatThreadRecord';
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

const ChildStub = defineComponent({
	name: 'ChildStub',
	render() {
		return h('div', { 'data-testid': 'child-stub' });
	},
});

function makeThread(threadId: string): ChatThreadRecord {
	return {
		threadId,
		sessionId: null,
		feature: null,
		logPath: `specs/_chat/${threadId}.md`,
		transport: { provider: 'claude', mode: 'cli' },
		title: threadId,
		forkParent: null,
		createdAt: '2026-05-14T00:00:00.000Z',
		lastUsedAt: '2026-05-14T00:00:00.000Z',
	};
}

function mountRoot(): VueWrapper {
	return mount(AgentSidepanelRoot, {
		global: {
			plugins: [i18n],
			stubs: {
				StatusPanel: ChildStub,
				ChatSidebar: ChildStub,
				MessageList: ChildStub,
				WelcomeGreeting: ChildStub,
				AppToast: ChildStub,
				A11yAnnouncer: ChildStub,
				FloatingNavSidebar: ChildStub,
				// Note: AgentSidepanelHeader is NOT stubbed because it owns the
				// `#tabStrip` named slot; G2.2 asserts that the strip is or
				// isn't rendered into that slot based on thread count.
			},
			provide: {
				[LOGGER_PORT as symbol]: noopLogger,
				[NOTIFICATION_PORT as symbol]: noopNotifications,
				[VAULT_PORT as symbol]: noopVault,
				[ICON_PORT as symbol]: new MockBridge(),
			},
		},
		attachTo: document.body,
	});
}

describe('AgentSidepanelRoot tab-strip visibility (G2.2)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('does NOT mount ThreadTabStrip when there are zero threads', () => {
		const wrapper = mountRoot();
		expect(wrapper.find('[data-testid="thread-tab-strip"]').exists()).toBe(
			false,
		);
		wrapper.unmount();
	});

	it('does NOT mount ThreadTabStrip when there is exactly one thread', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		const wrapper = mountRoot();
		expect(wrapper.find('[data-testid="thread-tab-strip"]').exists()).toBe(
			false,
		);
		wrapper.unmount();
	});

	it('mounts ThreadTabStrip as soon as a second thread exists', async () => {
		const store = useChatThreadsStore();
		store.upsertThread(makeThread('t1'));
		store.upsertThread(makeThread('t2'));
		const wrapper = mountRoot();
		expect(wrapper.find('[data-testid="thread-tab-strip"]').exists()).toBe(
			true,
		);
		wrapper.unmount();
	});
});
