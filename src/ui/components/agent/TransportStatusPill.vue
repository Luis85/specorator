<script setup lang="ts">
/**
 * `TransportStatusPill.vue` — small pill surfacing transport health
 * (connecting / degraded / offline) at the top of the message list.
 *
 * Spec §1.3.10 / §1.6 — agent.transport.* microcopy.
 * Satisfies REQ-AUX-016.
 *
 * Purely presentational. The parent (`MessageList.vue`) reads the dormant
 * `ChatDegradedState` / transport status and derives `kind` + `providerLabel`
 * (already resolved via the copy table). Emits `retry` for degraded/offline
 * kinds so the host can re-arm the transport.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import SpIcon from '@/ui/components/primitives/SpIcon.vue';

type TransportStatusKind = 'connecting' | 'degraded' | 'offline';

interface TransportStatusPillProps {
	kind: TransportStatusKind;
	providerLabel: string;
	diagnostic?: string;
}

const props = defineProps<TransportStatusPillProps>();

const emit = defineEmits<{
	retry: [];
}>();

const { t } = useI18n();

const text = computed<string>(() => {
	const key = `agent.transport.${props.kind}`;
	return t(key, { provider: props.providerLabel });
});

const iconName = computed<string>(() => {
	switch (props.kind) {
		case 'connecting':
			return 'loader-2';
		case 'degraded':
			return 'alert-triangle';
		case 'offline':
			return 'wifi-off';
		default:
			return 'circle';
	}
});

const showRetry = computed<boolean>(() => props.kind !== 'connecting');

function onRetry(): void {
	emit('retry');
}
</script>

<template>
	<div
		class="sp-transport-pill"
		:class="`sp-transport-pill--${kind}`"
		:data-kind="kind"
		data-testid="transport-status-pill"
		role="status"
		aria-live="polite"
	>
		<SpIcon :name="iconName" :size="12" class="sp-transport-pill__icon" />
		<span class="sp-transport-pill__text" data-testid="transport-status-pill-text">{{ text }}</span>
		<span
			v-if="diagnostic"
			class="sp-transport-pill__diagnostic"
			data-testid="transport-status-pill-diagnostic"
		>{{ diagnostic }}</span>
		<button
			v-if="showRetry"
			type="button"
			class="sp-transport-pill__retry"
			data-testid="transport-status-pill-retry"
			@click="onRetry"
		>
			{{ t('agent.transport.retry') }}
		</button>
	</div>
</template>

<style scoped>
.sp-transport-pill {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-2, 0.375rem);
	padding-block: var(--sp-space-1, 0.25rem);
	padding-inline: var(--sp-space-3, 0.625rem);
	border: 1px solid var(--sp-border, var(--sp-border));
	border-radius: var(--sp-radius-pill, 9999px);
	background: var(--sp-bg-secondary, var(--sp-bg-secondary));
	color: var(--sp-text-muted, var(--sp-text-muted));
	font-size: var(--sp-font-size-xs, 0.75rem);
	line-height: 1.2;
	max-inline-size: 100%;
}

.sp-transport-pill--connecting {
	color: var(--sp-text-muted, var(--sp-text-muted));
}

.sp-transport-pill--degraded {
	border-color: var(--sp-warning, #d4a017);
	color: var(--sp-warning, #d4a017);
}

.sp-transport-pill--offline {
	border-color: var(--sp-danger, #c0392b);
	color: var(--sp-danger, #c0392b);
}

.sp-transport-pill__icon {
	flex: 0 0 auto;
}

.sp-transport-pill__text {
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-transport-pill__diagnostic {
	color: var(--sp-text-faint, var(--sp-text-faint));
	font-style: italic;
}

.sp-transport-pill__retry {
	margin-inline-start: var(--sp-space-1, 0.25rem);
	padding-block: 0;
	padding-inline: var(--sp-space-2, 0.375rem);
	border: 1px solid currentColor;
	border-radius: var(--sp-radius-sm, 3px);
	background: transparent;
	color: inherit;
	font: inherit;
	cursor: pointer;
}

.sp-transport-pill__retry:hover,
.sp-transport-pill__retry:focus-visible {
	background: var(--sp-bg-hover, var(--sp-interactive-hover));
	outline: none;
}
</style>
