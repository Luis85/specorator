<script setup lang="ts">
/**
 * MessageItem — single transcript turn (REQ-AUX-014, spec §1.4).
 *
 * Renders one chat message inside a `<MessageBubble>` shell, plus a small
 * role badge:
 *   - assistant → bot icon + resolved model name (or fallback label).
 *   - user      → user icon (no model name).
 *
 * When `showTimestamp === true`, the role badge also shows a relative time
 * stamp formatted with `Intl.RelativeTimeFormat` (no new dependency).
 *
 * Per-message actions (`copy`, `regenerate`, `edit`) are forwarded from the
 * embedded `<MessageActions>` to the host (`MessageList` / `ChatSidebar`).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ChatMessage } from '@/domain/chat/ChatMessage';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';
import MessageActions from './MessageActions.vue';
import MessageBubble from './MessageBubble.vue';
import SpIcon from '@/ui/components/primitives/SpIcon.vue';

interface MessageItemProps {
	message: ChatMessage;
	/** True iff this is the latest assistant turn (drives Regenerate). */
	isLatest?: boolean;
	/**
	 * Toggles the relative-time stamp next to the role badge. Default `false`.
	 * Plumbed from `PluginSettings.showMessageTimestamps` by the host.
	 */
	showTimestamp?: boolean;
	/**
	 * Assistant model display name for this turn (e.g. "claude-sonnet-4").
	 * Empty/absent → falls back to the localised "Claude" role label.
	 */
	modelName?: string;
	/** Optional override for the reference "now" instant — test seam only. */
	now?: Date;
}

const props = withDefaults(defineProps<MessageItemProps>(), {
	isLatest: false,
	showTimestamp: false,
	modelName: '',
	now: () => new Date(),
});

const emit = defineEmits<{
	copy: [payload: { messageId: string }];
	regenerate: [payload: { messageId: string }];
	edit: [payload: { messageId: string }];
}>();

defineOptions({ name: 'MessageItem' });

const { t } = useI18n();

const isAssistant = computed<boolean>(() => props.message.role === 'assistant');

const iconName = computed<string>(() => (isAssistant.value ? 'bot' : 'user'));

const roleLabel = computed<string>(() => {
	if (!isAssistant.value) return t('agent.roleUser');
	const model = props.modelName.trim();
	return model.length > 0 ? model : t('agent.roleAssistant');
});

/**
 * Relative-time formatter using the platform `Intl.RelativeTimeFormat`. We
 * pick the largest unit whose magnitude is ≥ 1 so the rendered label reads
 * naturally ("2 minutes ago", "yesterday", "3 days ago"). Falls back to the
 * raw ISO timestamp if the runtime lacks `Intl.RelativeTimeFormat`.
 */
function formatRelative(iso: string, reference: Date): string {
	const created = new Date(iso);
	if (Number.isNaN(created.getTime())) return iso;
	const diffMs = created.getTime() - reference.getTime();
	const diffSec = Math.round(diffMs / 1000);
	const RTF = (globalThis as { Intl?: typeof Intl }).Intl?.RelativeTimeFormat;
	if (typeof RTF !== 'function') return iso;
	const rtf = new RTF(undefined, { numeric: 'auto' });
	const abs = Math.abs(diffSec);
	if (abs < 60) return rtf.format(diffSec, 'second');
	if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
	if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
	if (abs < 2592000) return rtf.format(Math.round(diffSec / 86400), 'day');
	if (abs < 31536000) return rtf.format(Math.round(diffSec / 2592000), 'month');
	return rtf.format(Math.round(diffSec / 31536000), 'year');
}

const relativeTime = computed<string>(() =>
	formatRelative(props.message.createdAt, props.now),
);

function handleCopy(payload: { messageId: string }): void {
	emit('copy', payload);
}
function handleRegenerate(payload: { messageId: string }): void {
	emit('regenerate', payload);
}
function handleEdit(payload: { messageId: string }): void {
	emit('edit', payload);
}
</script>

<template>
	<article
		class="sp-agent-message sp-hover-host"
		:class="`sp-agent-message--${message.role}`"
		:data-testid="`agent-message-${message.role}`"
	>
		<header class="sp-agent-message__role" data-testid="agent-message-role">
			<SpIcon
				:name="iconName"
				:size="14"
				:aria-label="
					message.role === 'assistant' ? t('agent.roleAssistant') : t('agent.roleUser')
				"
				data-testid="agent-message-role-icon"
			/>
			<span class="sp-agent-message__role-label" data-testid="agent-message-role-label">
				{{ roleLabel }}
			</span>
			<time
				v-if="showTimestamp"
				class="sp-agent-message__timestamp"
				data-testid="agent-message-timestamp"
				:datetime="message.createdAt"
			>
				{{ relativeTime }}
			</time>
		</header>
		<MessageBubble :role="message.role">
			<div class="sp-agent-message__body" data-testid="agent-message-body">
				<MarkdownBlock
					v-if="message.text.length > 0"
					class="sp-agent-message__text"
					:text="message.text"
				/>
				<p v-else class="sp-agent-message__empty" data-testid="agent-message-empty">
					{{ t('agent.assistantEmpty') }}
				</p>
				<p
					v-if="message.truncated === true"
					class="sp-agent-message__trim-note"
					data-testid="agent-message-trim-note"
				>
					{{ t('agent.contextTrimmed') }}
				</p>
			</div>
			<template #actions>
				<MessageActions
					:message-id="message.id"
					:role="message.role"
					:is-latest="isLatest"
					@copy="handleCopy"
					@regenerate="handleRegenerate"
					@edit="handleEdit"
				/>
			</template>
		</MessageBubble>
	</article>
</template>

<style scoped>
.sp-agent-message {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1, 0.25rem);
	padding-block: var(--sp-space-2, 0.625rem);
	padding-inline: var(--sp-space-3, 0.75rem);
	border-radius: var(--sp-radius-md, 6px);
	background: var(--sp-bg-secondary);
	border: 1px solid var(--sp-border);
}

.sp-agent-message--user {
	background: var(--sp-bg-secondary-alt, var(--sp-bg-secondary));
}

.sp-agent-message__role {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1, 0.25rem);
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--sp-text-muted);
}

.sp-agent-message__role-label {
	text-transform: none;
	font-weight: 600;
}

.sp-agent-message__timestamp {
	margin-inline-start: auto;
	padding-inline-start: var(--sp-space-2, 0.5rem);
	font-size: 0.6875rem;
	font-weight: 500;
	color: var(--sp-text-faint, var(--sp-text-muted));
	text-transform: none;
	letter-spacing: normal;
}

.sp-agent-message__body {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1, 0.25rem);
}

.sp-agent-message__text {
	margin: 0;
	font-family: inherit;
	font-size: 0.875rem;
	color: var(--sp-text-normal);
	word-break: break-word;
}

.sp-agent-message__empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--sp-text-muted);
	font-style: italic;
}

.sp-agent-message__trim-note {
	margin: 0;
	font-size: 0.75rem;
	color: var(--sp-text-faint);
}
</style>
