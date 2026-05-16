<script setup lang="ts">
/**
 * Header for the dedicated agent sidepanel. Single-purpose: identifies the
 * surface ("Specorator Agent"), shows which feature the active thread is
 * scoped to (or "No feature in focus"), and exposes a "New conversation"
 * action that clears the active thread so the next send mints a fresh
 * `ChatThreadRecord` (`ChatSidebar.resolveActiveThread` rotates on
 * `activeThreadId === null`).
 *
 * Visual reference: header strip from Claudian's `ClaudianView` shell
 * (https://github.com/YishenTu/claudian) translated to Vue 3 SFC + ADR-008
 * narrow-port discipline (no Obsidian imports here).
 */
import { useI18n } from 'vue-i18n';

defineProps<{
	/** Current active thread's `feature` slug, or `null` when no thread / no feature. */
	activeFeature: string | null;
	/** Whether a thread is currently selected. Drives the "New conversation" button's enabled state. */
	hasActiveThread: boolean;
}>();

const emit = defineEmits<{
	'new-conversation': [];
}>();

const { t } = useI18n();

function handleNewConversation(): void {
	emit('new-conversation');
}
</script>

<template>
	<header class="sp-agent-header" data-testid="agent-header">
		<div class="sp-agent-header__title-row">
			<span class="sp-agent-header__title" data-testid="agent-header-title">
				{{ t('agent.title') }}
			</span>
			<button
				type="button"
				class="sp-agent-header__action"
				data-testid="agent-header-new-conversation"
				:disabled="!hasActiveThread"
				:aria-label="t('agent.newConversationAriaLabel')"
				@click="handleNewConversation"
			>
				{{ t('agent.newConversation') }}
			</button>
		</div>
		<p
			v-if="activeFeature !== null"
			class="sp-agent-header__feature"
			data-testid="agent-header-feature"
		>
			{{ t('agent.featureScope', { slug: activeFeature }) }}
		</p>
		<p
			v-else
			class="sp-agent-header__feature sp-agent-header__feature--muted"
			data-testid="agent-header-feature-empty"
		>
			{{ t('agent.noFeatureInFocus') }}
		</p>
	</header>
</template>

<style scoped>
.sp-agent-header {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.75rem 1rem;
	border-bottom: 1px solid var(--background-modifier-border);
	background: var(--background-secondary);
	flex-shrink: 0;
}

.sp-agent-header__title-row {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 0.5rem;
}

.sp-agent-header__title {
	font-size: 0.9375rem;
	font-weight: 700;
	color: var(--text-normal);
	letter-spacing: 0.01em;
}

.sp-agent-header__action {
	font-size: 0.75rem;
	font-weight: 500;
	padding: 0.25rem 0.625rem;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	background: var(--background-primary);
	color: var(--text-normal);
	cursor: pointer;
	transition:
		background-color 0.15s,
		border-color 0.15s;
}

.sp-agent-header__action:hover:not(:disabled) {
	background: var(--interactive-hover);
}

.sp-agent-header__action:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.sp-agent-header__feature {
	margin: 0;
	font-size: 0.75rem;
	color: var(--text-muted);
}

.sp-agent-header__feature--muted {
	font-style: italic;
}
</style>
