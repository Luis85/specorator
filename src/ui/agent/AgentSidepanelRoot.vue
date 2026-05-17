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
 */
import { computed, ref } from 'vue';
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

const activeThreadId = computed(() => threadsStore.activeThreadId);
const isRequestInFlight = computed(() => messagesStore.status === 'loading');
const activeFeature = computed(() => {
	const tid = threadsStore.activeThreadId;
	if (tid === null) return null;
	return threadsStore.chatThreads.get(tid)?.feature ?? null;
});

/**
 * Whether the inline `/help` panel is open. Toggled by the `'help'` slash
 * command (PR-ASV-3, D-ASV-2). Lives on the root rather than `ChatSidebar`
 * because the help panel is a sidepanel-level affordance — it sits above the
 * chat surface, not inside the input area.
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
			<AgentSidepanelHeader
				:active-feature="activeFeature"
				:has-active-thread="activeThreadId !== null"
				:request-in-flight="isRequestInFlight"
				@new-conversation="handleNewConversation"
			/>
			<div
				v-if="helpOpen"
				class="sp-agent__help"
				role="region"
				aria-label="Slash command help"
				data-testid="agent-help-panel"
			>
				<header class="sp-agent__help-header">
					<span class="sp-agent__help-title" data-testid="agent-help-title">
						Available slash commands
					</span>
					<button
						type="button"
						class="sp-agent__help-close"
						data-testid="agent-help-close"
						aria-label="Close help"
						@click="closeHelp"
					>
						Close
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
			<div class="sp-agent__body">
				<MessageList :thread-id="activeThreadId" />
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

.sp-agent__body {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

.sp-agent__help {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	padding: 0.75rem 1rem;
	background: var(--background-secondary);
	border-bottom: 1px solid var(--background-modifier-border);
	flex-shrink: 0;
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
