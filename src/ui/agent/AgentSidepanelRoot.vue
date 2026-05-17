<script setup lang="ts">
/**
 * Root component mounted by `AgentSidepanelView` (`VIEW_TYPE = 'specorator-agent'`).
 *
 * Single-purpose surface: no router, no nav tabs. Hosts the agent chat shell
 * (header + message history + input). The existing `ChatSidebar.vue` engine
 * is reused verbatim for its send/proposal/transport handling — this root
 * adds the new conversation header, the multi-turn message history, and any
 * sidepanel-only chrome on top.
 *
 * Lifts the chat into its own Obsidian `ItemView` per IDEA-ASV-001 / specs/
 * agent-sidepanel-v2/idea.md. Slash-command palette landed in PR-ASV-3.
 *
 * WP-8 changes:
 *   - UX #4: `/help` was a drawer above `MessageList` that pushed history
 *     offscreen on a narrow sidepanel. It now renders as a popover
 *     anchored to the chat header so the conversation stays visible.
 *   - UX #11: `MessageList` now emits `tile-action` when the user clicks an
 *     empty-state starter tile; the root pre-fills `messagesStore.userText`
 *     with a matching prompt fragment.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import { useMessagesStore } from '@/ui/stores/messagesStore';
import { useChatReset } from '@/ui/composables/useChatReset';
import { useNotificationStore } from '@/ui/stores/notificationStore';
import { onMounted, onUnmounted } from 'vue';
import AppToast from '@/ui/components/common/AppToast.vue';
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue';
import AgentSidepanelHeader from '@/ui/components/agent/AgentSidepanelHeader.vue';
import MessageList from '@/ui/components/agent/MessageList.vue';
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue';
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import { BUILT_IN_SLASH_COMMANDS } from '@/application/chat/builtInSlashCommands';

const threadsStore = useChatThreadsStore();
const messagesStore = useMessagesStore();
const chatReset = useChatReset();
const notificationStore = useNotificationStore();
const { t } = useI18n();

const activeThreadId = computed(() => threadsStore.activeThreadId);
const isRequestInFlight = computed(() => messagesStore.status === 'loading');
const activeFeature = computed(() => {
	const tid = threadsStore.activeThreadId;
	if (tid === null) return null;
	return threadsStore.chatThreads.get(tid)?.feature ?? null;
});

/**
 * Whether the inline `/help` popover is open. Toggled by the `'help'` slash
 * command (PR-ASV-3, D-ASV-2). Lives on the root rather than `ChatSidebar`
 * because the help popover is a sidepanel-level affordance, anchored to
 * the header — UX #4 (WP-8).
 */
const helpOpen = ref(false);

const helpCommands = computed<readonly SlashCommand[]>(() => BUILT_IN_SLASH_COMMANDS);

function onNotice(e: Event): void {
	const { message, durationMs } = (
		e as CustomEvent<{
			severity: 'error' | 'warning' | 'success' | 'info';
			message: string;
			durationMs: number;
		}>
	).detail;
	notificationStore.addNotice(message, durationMs);
}

function handleNewConversation(): void {
	// Codex P1 (PR #369, second review): block the reset while a turn is in
	// flight. Without this guard the user can click "New conversation" mid-
	// request — `handleSend()` keeps running and `applySuccessfulTurn` then
	// writes its result against the cleared thread id, leaving the proposal/
	// message output inaccessible while the next conversation starts with
	// stale content. The header button is also disabled when loading; this
	// is the defence-in-depth check in case a future entry point (URI
	// action, keyboard shortcut, command palette) invokes the handler
	// directly.
	if (messagesStore.status === 'loading') return;
	// WP-3 (Arch #4): the previous multi-action sequence
	// (clearThreadMessages → clearThreadProposals → setActiveThreadId(null) →
	// clearResponse → setUserText('')) forgot to call `resetStreaming()`,
	// leaving mid-stream residual state across thread rotations — UX
	// review #15. `useChatReset().resetForNewConversation` is the single
	// source of truth for "new conversation"; it unconditionally drops the
	// streaming-turn slots as part of the cross-store sequence.
	chatReset.resetForNewConversation(threadsStore.activeThreadId);
}

/**
 * Dispatch a slash-command selection emitted by `ChatSidebar` (PR-ASV-3,
 * D-ASV-2). The action ids form a closed switch — every variant of
 * `SlashCommandAction` must have a branch. Future work (vault / SDK commands)
 * will introduce new action ids that need branches here.
 */
function handleSelectCommand(command: SlashCommand): void {
	switch (command.action) {
		case 'clear-input':
			messagesStore.setUserText('');
			return;
		case 'new-conversation':
			// Mirror the header button's guard rail so the keyboard-driven
			// dispatch can't strand an in-flight response on a cleared thread
			// (Codex P1, PR #369 second review).
			if (messagesStore.status === 'loading') return;
			handleNewConversation();
			return;
		case 'help':
			helpOpen.value = true;
			return;
		case 'advance-stage':
			notificationStore.addNotice('Not yet implemented in v2', 4000);
			return;
		case 'vault-prompt':
			// Vault-loaded command/skill: insert the prompt body into the
			// chat textarea for the user to review/edit before sending. We
			// do NOT auto-send — the body is a template, not a final prompt.
			if (command.body !== undefined) {
				messagesStore.setUserText(command.body);
			}
			return;
	}
}

function closeHelp(): void {
	helpOpen.value = false;
}

/**
 * UX #11 (WP-8). Empty-state tile pre-fills the chat textarea with a
 * matching prompt fragment so the user can edit and send. We do NOT
 * auto-send — Cmd/Ctrl+Enter remains the user's commit gesture.
 */
function handleEmptyTileAction(key: 'slash' | 'mention' | 'send' | 'escape'): void {
	switch (key) {
		case 'slash':
			messagesStore.setUserText('/');
			return;
		case 'mention':
			messagesStore.setUserText('@');
			return;
		case 'send':
		case 'escape':
			// Informational tiles — no textarea pre-fill needed.
			return;
	}
}

onMounted(() => {
	window.addEventListener('sp:notice', onNotice);
});

onUnmounted(() => {
	window.removeEventListener('sp:notice', onNotice);
});
</script>

<template>
	<div class="sp-agent" data-testid="agent-sidepanel">
		<ErrorBoundary>
			<div class="sp-agent__header-wrap">
				<AgentSidepanelHeader
					:active-feature="activeFeature"
					:has-active-thread="activeThreadId !== null"
					:request-in-flight="isRequestInFlight"
					@new-conversation="handleNewConversation"
				/>
				<!--
          UX #4 (WP-8): /help renders as a popover anchored under the
          header instead of a drawer that pushes the message list
          offscreen. The popover floats on top of the chat surface so
          the conversation stays visible; clicking outside closes it.
        -->
				<div
					v-if="helpOpen"
					class="sp-agent__help"
					role="dialog"
					:aria-label="t('agent.help.openAriaLabel')"
					data-testid="agent-help-panel"
				>
					<header class="sp-agent__help-header">
						<span class="sp-agent__help-title" data-testid="agent-help-title">
							{{ t('agent.help.heading') }}
						</span>
						<button
							type="button"
							class="sp-agent__help-close"
							data-testid="agent-help-close"
							:aria-label="t('agent.help.closeAriaLabel')"
							@click="closeHelp"
						>
							{{ t('agent.help.close') }}
						</button>
					</header>
					<ul class="sp-agent__help-list" data-testid="agent-help-list">
						<li
							v-for="command in helpCommands"
							:key="command.name"
							class="sp-agent__help-item"
							:data-testid="`agent-help-item-${command.name}`"
						>
							<span class="sp-agent__help-name">/{{ command.name }}</span>
							<span class="sp-agent__help-description">{{ command.description }}</span>
						</li>
					</ul>
				</div>
			</div>
			<div class="sp-agent__body">
				<MessageList :thread-id="activeThreadId" @tile-action="handleEmptyTileAction" />
				<ChatSidebar @select-command="handleSelectCommand" />
			</div>
		</ErrorBoundary>
		<AppToast />
	</div>
</template>

<style scoped>
.sp-agent {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
}

.sp-agent__header-wrap {
	position: relative;
	flex-shrink: 0;
}

.sp-agent__body {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

/*
 * UX #4 (WP-8): /help is a popover, not a drawer. It floats over the
 * chat surface anchored to the header so the message list stays in view
 * even on a narrow sidepanel. `position: absolute` against
 * `.sp-agent__header-wrap` keeps the popover scoped to the header
 * column; the dropdown shadow distinguishes it from inline content.
 */
.sp-agent__help {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	z-index: 6;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	box-shadow: var(--shadow-s, 0 4px 12px rgba(0, 0, 0, 0.15));
	max-height: 60vh;
	overflow-y: auto;
}

.sp-agent__help-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
}

.sp-agent__help-title {
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-agent__help-close {
	font-size: 0.75rem;
	font-weight: 500;
	padding: 0.2rem 0.5rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-primary);
	color: var(--text-normal);
	cursor: pointer;
}

.sp-agent__help-close:hover {
	background: var(--interactive-hover);
}

.sp-agent__help-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-agent__help-item {
	display: flex;
	gap: 0.5rem;
	font-size: 0.8125rem;
	color: var(--text-normal);
}

.sp-agent__help-name {
	font-weight: 600;
	min-width: 7rem;
}

.sp-agent__help-description {
	color: var(--text-muted);
}
</style>
