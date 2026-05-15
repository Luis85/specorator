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
		{{ t('chat.subscription.statusPill') }}
	</span>
</template>

<style scoped>
.sp-chat__transport-pill {
	display: inline-flex;
	align-items: center;
	border-radius: 9999px;
	padding: 0.15rem 0.625rem;
	background: var(--background-modifier-border);
	color: var(--text-muted);
	font-family: var(--font-text);
	font-size: 0.8125rem;
	line-height: 1.2;
}
</style>
