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
 * agent-sidepanel-v2/idea.md. Slash-command palette, `@`-file mentions, and
 * streaming land in Increment 2+.
 */
import { computed } from 'vue';
import { useChatStore } from '@/ui/stores/chatStore';
import { useNotificationStore } from '@/ui/stores/notificationStore';
import { onMounted, onUnmounted } from 'vue';
import AppToast from '@/ui/components/common/AppToast.vue';
import ErrorBoundary from '@/ui/components/ErrorBoundary.vue';
import AgentSidepanelHeader from '@/ui/components/agent/AgentSidepanelHeader.vue';
import MessageList from '@/ui/components/agent/MessageList.vue';
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue';

const store = useChatStore();
const notificationStore = useNotificationStore();

const activeThreadId = computed(() => store.activeThreadId);
const activeFeature = computed(() => {
	const tid = store.activeThreadId;
	if (tid === null) return null;
	return store.chatThreads.get(tid)?.feature ?? null;
});

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
	store.setActiveThreadId(null);
	store.clearResponse();
	store.setUserText('');
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
				@new-conversation="handleNewConversation"
			/>
			<div class="sp-agent__body">
				<MessageList :thread-id="activeThreadId" />
				<ChatSidebar />
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
</style>
