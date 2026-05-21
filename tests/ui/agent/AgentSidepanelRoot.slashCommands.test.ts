/**
 * Tests for the slash-command dispatcher in `AgentSidepanelRoot.vue`
 * (PR-ASV-3, D-ASV-2). The root component owns the switch over
 * `SlashCommandAction` and wires each id to the matching store mutation,
 * header flow, inline help, or notification toast.
 *
 * The embedded `ChatSidebar` and `MessageList` are stubbed so the dispatch
 * surface can be exercised in isolation. Stubbing also frees us from wiring
 * the Claude-CLI / vault / settings ports that `ChatSidebar` would otherwise
 * require.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { defineComponent, h } from 'vue';

import AgentSidepanelRoot from '@/ui/agent/AgentSidepanelRoot.vue';
import { getChatStoresFacade } from '../../__fakes__/chatStoresFacade';
import { useNotificationStore } from '@/ui/stores/notificationStore';
import { i18n } from '@/ui/i18n';
import { LOGGER_PORT, NOTIFICATION_PORT } from '@/infrastructure/bridge/ports';
import type { LoggerPort, NotificationPort } from '@/domain/ports';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { AgentSidepanelRootSlashCommandsPO } from './AgentSidepanelRoot.slashCommands.po';

const ChatSidebarStub = defineComponent({
	name: 'ChatSidebarStub',
	emits: ['select-command'],
	setup(_, { emit }) {
		function emitCommand(command: SlashCommand): void {
			emit('select-command', command);
		}
		// expose method for tests via $.exposed isn't reliable across versions;
		// instead we render a hidden span with the trigger function attached.
		return () =>
			h('div', { 'data-testid': 'chat-sidebar-stub' }, [
				h(
					'button',
					{
						type: 'button',
						'data-testid': 'stub-emit-clear',
						onClick: () => {
							emitCommand({
								name: 'clear',
								description: 'Clear the input',
								kind: 'builtin',
								action: 'clear-input',
							});
						},
					},
					'emit clear',
				),
				h(
					'button',
					{
						type: 'button',
						'data-testid': 'stub-emit-new',
						onClick: () => {
							emitCommand({
								name: 'new',
								description: 'Start a new conversation',
								kind: 'builtin',
								action: 'new-conversation',
							});
						},
					},
					'emit new',
				),
				h(
					'button',
					{
						type: 'button',
						'data-testid': 'stub-emit-help',
						onClick: () => {
							emitCommand({
								name: 'help',
								description: 'Show available commands',
								kind: 'builtin',
								action: 'help',
							});
						},
					},
					'emit help',
				),
				h(
					'button',
					{
						type: 'button',
						'data-testid': 'stub-emit-advance',
						onClick: () => {
							emitCommand({
								name: 'advance-stage',
								description: 'Advance the active feature to the next stage (coming soon)',
								kind: 'builtin',
								action: 'advance-stage',
							});
						},
					},
					'emit advance',
				),
				h(
					'button',
					{
						type: 'button',
						'data-testid': 'stub-emit-vault-prompt',
						onClick: () => {
							emitCommand({
								name: 'draft',
								description: 'Draft a note.',
								kind: 'vault-command',
								action: 'vault-prompt',
								body: 'Draft prompt body',
							});
						},
					},
					'emit vault prompt',
				),
			]);
	},
});

const MessageListStub = defineComponent({
	name: 'MessageListStub',
	props: { threadId: { type: String, default: null } },
	render() {
		return h('div', { 'data-testid': 'message-list-stub' });
	},
});

const AppToastStub = defineComponent({
	name: 'AppToastStub',
	render() {
		return h('div', { 'data-testid': 'app-toast-stub' });
	},
});

function makeLoggerStub(): LoggerPort {
	return {
		debug: () => undefined,
		info: () => undefined,
		warn: () => undefined,
		error: () => undefined,
	};
}

function makeNotificationStub(): NotificationPort {
	return {
		showError: () => undefined,
		showWarning: () => undefined,
		showSuccess: () => undefined,
		showInfo: () => undefined,
	};
}

function mountRoot() {
	const pinia = createPinia();
	setActivePinia(pinia);
	const wrapper = mount(AgentSidepanelRoot, {
		global: {
			plugins: [pinia, i18n],
			stubs: {
				ChatSidebar: ChatSidebarStub,
				MessageList: MessageListStub,
				AppToast: AppToastStub,
				// WS-8 — these sidepanel chrome components need their own ports/
				// registries; the slash-command test does not exercise them so
				// they are stubbed to keep the harness focused.
				StatusPanel: { template: '<div data-testid="status-panel-stub" />' },
				AttachmentStrip: { template: '<div data-testid="attachment-strip-stub" />' },
				ProviderBadge: { template: '<div data-testid="provider-badge-stub" />' },
				ModelSelector: { template: '<div data-testid="model-selector-stub" />' },
			},
			provide: {
				[LOGGER_PORT as symbol]: makeLoggerStub(),
				[NOTIFICATION_PORT as symbol]: makeNotificationStub(),
			},
		},
	});
	const chatStore = getChatStoresFacade(pinia);
	const notificationStore = useNotificationStore(pinia);
	const po = new AgentSidepanelRootSlashCommandsPO(wrapper);
	return { wrapper, po, chatStore, notificationStore };
}

describe('AgentSidepanelRoot — slash command dispatch (PR-ASV-3)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('/clear', () => {
		it('clears userText without sending', async () => {
			const { wrapper, chatStore } = mountRoot();
			chatStore.setUserText('hello world');
			await wrapper.find('[data-testid="stub-emit-clear"]').trigger('click');
			expect(chatStore.userText).toBe('');
		});
	});

	describe('/new', () => {
		it('clears the active thread when not loading', async () => {
			const { wrapper, chatStore } = mountRoot();
			chatStore.upsertThread({
				threadId: 't1',
				sessionId: null,
				feature: null,
				logPath: '',
				transport: { provider: 'claude', mode: 'api' },
				title: '',
				forkParent: null,
				createdAt: '2026-05-16T00:00:00.000Z',
				lastUsedAt: '2026-05-16T00:00:00.000Z',
			});
			chatStore.setActiveThreadId('t1');
			chatStore.setUserText('hello');
			await wrapper.find('[data-testid="stub-emit-new"]').trigger('click');
			expect(chatStore.activeThreadId).toBeNull();
			expect(chatStore.userText).toBe('');
		});

		it('is a no-op when a turn is in flight (Codex P1 mid-flight guard)', async () => {
			const { wrapper, chatStore } = mountRoot();
			chatStore.upsertThread({
				threadId: 't2',
				sessionId: null,
				feature: null,
				logPath: '',
				transport: { provider: 'claude', mode: 'api' },
				title: '',
				forkParent: null,
				createdAt: '2026-05-16T00:00:00.000Z',
				lastUsedAt: '2026-05-16T00:00:00.000Z',
			});
			chatStore.setActiveThreadId('t2');
			chatStore.beginRequest(); // status = 'loading'
			await wrapper.find('[data-testid="stub-emit-new"]').trigger('click');
			expect(chatStore.activeThreadId).toBe('t2');
		});
	});

	describe('/help', () => {
		it('opens the inline help panel listing every built-in command', async () => {
			const { wrapper, po } = mountRoot();
			expect(po.hasHelpPanel()).toBe(false);
			await wrapper.find('[data-testid="stub-emit-help"]').trigger('click');
			expect(po.hasHelpPanel()).toBe(true);
			expect(po.helpItemByName('clear').exists()).toBe(true);
			expect(po.helpItemByName('new').exists()).toBe(true);
			expect(po.helpItemByName('advance-stage').exists()).toBe(true);
			expect(po.helpItemByName('help').exists()).toBe(true);
		});

		it('the help close button hides the panel', async () => {
			const { wrapper, po } = mountRoot();
			await wrapper.find('[data-testid="stub-emit-help"]').trigger('click');
			expect(po.hasHelpPanel()).toBe(true);
			await po.clickHelpClose();
			expect(po.hasHelpPanel()).toBe(false);
		});
	});

	describe('/advance-stage', () => {
		it('shows a "Not yet implemented" notice', async () => {
			const { wrapper, notificationStore } = mountRoot();
			expect(notificationStore.notices).toHaveLength(0);
			await wrapper.find('[data-testid="stub-emit-advance"]').trigger('click');
			expect(notificationStore.notices).toHaveLength(1);
			expect(notificationStore.notices[0].message.toLowerCase()).toContain('not yet implemented');
		});
	});

	describe('vault-prompt action (PR-ASV-3 follow-up)', () => {
		it('inserts the prompt body into userText and does not auto-send', async () => {
			const { wrapper, chatStore } = mountRoot();
			expect(chatStore.userText).toBe('');
			await wrapper.find('[data-testid="stub-emit-vault-prompt"]').trigger('click');
			expect(chatStore.userText).toBe('Draft prompt body');
			// Send is the user's next action; the dispatcher must not have
			// triggered an LLM request itself.
			expect(chatStore.status).not.toBe('loading');
		});
	});
});
