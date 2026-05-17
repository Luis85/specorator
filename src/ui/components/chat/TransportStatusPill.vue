<script setup lang="ts">
/**
 * TransportStatusPill — small inline status pill rendered in the chat
 * sidebar footer to surface that the subscription transport is active.
 *
 * Satisfies SPEC-ASM-001 §7.1 (REQ-ASM-002, REQ-ASM-055, NFR-ASM-008).
 * Plain-language copy per DESIGN-ASM-001 §B3:
 *   chat.subscription.statusPill = "Using your installed Claude tool."
 *
 * Render contract:
 *   - kind === 'subscription' → renders the pill.
 *   - any other kind ('api-key' | 'degraded' | 'auto') → renders nothing.
 *
 * The component is purely presentational; the parent (ChatSidebar)
 * binds `kind` from the `TRANSPORT_KIND_KEY` injection.
 */
import { useI18n } from 'vue-i18n'
import type { TransportKind } from '@/domain/chat/TransportKind'

defineProps<{
	kind: TransportKind
}>()

const { t } = useI18n()
</script>

<template>
	<span
		v-if="kind === 'subscription'"
		class="sp-chat__transport-pill"
		data-testid="chat-transport-status"
		role="status"
		aria-live="polite"
	>
		<span
			aria-hidden="true"
			class="sp-chat__transport-glyph"
			data-testid="chat-transport-status-glyph"
		>▶</span>
		<span class="sp-chat__transport-text">{{ t('chat.subscription.statusPill') }}</span>
	</span>
</template>

<style scoped>
/*
 * UX #20 (WP-8): pill differentiation. The transport pill carries the `▶`
 * leading glyph and a faint-blend background so it stands apart from the
 * resume (`↻`, accent) and starting (`⌛`, muted-border) pills.
 */
.sp-chat__transport-pill {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 9999px;
	padding: 0.15rem 0.625rem;
	background: var(--background-secondary-alt, var(--background-secondary));
	color: var(--text-faint, var(--text-muted));
	font-family: var(--font-text);
	font-size: 0.8125rem;
	line-height: 1.2;
}

.sp-chat__transport-glyph {
	display: inline-block;
	font-size: 0.875rem;
	line-height: 1;
}

.sp-chat__transport-text {
	font-weight: 500;
}
</style>
