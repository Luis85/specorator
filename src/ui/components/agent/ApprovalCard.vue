<script setup lang="ts">
/**
 * Inline `ApprovalCard.vue` — replaces the blocking-modal approval pattern
 * with three keyboard-navigable buttons rendered as part of the message
 * stream (WS-9, SPEC-MPS-001 §8.4, REQ-MPS-045 / REQ-MPS-046).
 *
 *   - **Deny** — focused by default (safer side per spec). Emits
 *     `{ kind: 'deny' }`.
 *   - **Allow once** — emits `{ kind: 'allow-once' }`. No rule persisted.
 *   - **Always allow** — calls `useApprovalRulesStore.addRule(...)` for the
 *     `(providerId, tool, scope)` triple, then emits `{ kind: 'always' }`.
 *
 * Idempotent: once a decision is emitted, subsequent clicks are no-ops.
 * Escape on the card root commits a `'deny'` decision so a keyboard-only
 * user can dismiss without clicking.
 *
 * The component is pure UI — the consumer (orchestrator wiring +
 * `MessageList.vue`) translates the decision into the boolean that the
 * `ChatTransportStreamOptions.approveTool` resolver returns.
 */
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort'
import type { ProviderId } from '@/domain/chat/ProviderSelection'
import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore'

interface Decision {
	readonly kind: 'deny' | 'allow-once' | 'always'
}

const props = defineProps<{
	request: ChatTransportApprovalRequest
	providerId: ProviderId
}>()

const emit = defineEmits<{
	decision: [decision: Decision]
}>()

const { t } = useI18n()

const resolved = ref(false)
const denyButtonEl = ref<HTMLButtonElement | null>(null)
const rules = useApprovalRulesStore()

function commit(decision: Decision): void {
	if (resolved.value) return
	resolved.value = true
	if (decision.kind === 'always') {
		rules.addRule({
			providerId: props.providerId,
			tool: props.request.tool,
			scope: props.request.scope,
		})
	}
	emit('decision', decision)
}

function handleKeydown(event: KeyboardEvent): void {
	if (resolved.value) return
	if (event.key === 'Escape') {
		event.preventDefault()
		commit({ kind: 'deny' })
	}
}

onMounted(() => {
	// SPEC-MPS-001 §8.4: default focus on Deny (safer side).
	denyButtonEl.value?.focus()
})
</script>

<template>
	<section
		class="sp-approval-card"
		data-testid="approval-card"
		role="region"
		:aria-label="t('agent.approvalCard.ariaLabel')"
		@keydown="handleKeydown"
	>
		<header class="sp-approval-card__header">
			<span class="sp-approval-card__icon" aria-hidden="true">!</span>
			<span class="sp-approval-card__title">{{
				t('agent.approvalCard.heading', { tool: request.tool, scope: request.scope })
			}}</span>
		</header>
		<pre
			v-if="request.previewText !== null"
			class="sp-approval-card__preview"
			data-testid="approval-card-preview"
			>{{ request.previewText }}</pre
		>
		<div class="sp-approval-card__actions">
			<button
				ref="denyButtonEl"
				type="button"
				class="sp-approval-card__btn sp-approval-card__btn--deny"
				data-testid="approval-action-deny"
				@click="commit({ kind: 'deny' })"
			>
				{{ t('agent.approvalCard.deny') }}
			</button>
			<button
				type="button"
				class="sp-approval-card__btn sp-approval-card__btn--allow-once"
				data-testid="approval-action-allow-once"
				@click="commit({ kind: 'allow-once' })"
			>
				{{ t('agent.approvalCard.allowOnce') }}
			</button>
			<button
				type="button"
				class="sp-approval-card__btn sp-approval-card__btn--always"
				data-testid="approval-action-always-allow"
				@click="commit({ kind: 'always' })"
			>
				{{ t('agent.approvalCard.alwaysAllow') }}
			</button>
		</div>
	</section>
</template>

<style scoped>
.sp-approval-card {
	margin: 0.5rem 0;
	padding: 0.75rem;
	border: 1px solid var(--background-modifier-error-border, var(--interactive-accent));
	border-radius: 6px;
	background: var(--background-secondary);
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-approval-card__header {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-approval-card__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	border-radius: 50%;
	background: var(--background-modifier-error, var(--interactive-accent));
	color: var(--text-on-accent, #fff);
	font-weight: 700;
}

.sp-approval-card__title {
	color: var(--text-normal);
}

.sp-approval-card__preview {
	margin: 0;
	padding: 0.5rem 0.625rem;
	background: var(--background-primary);
	border-radius: 4px;
	font-family: var(--font-monospace, ui-monospace, monospace);
	font-size: 0.8125rem;
	max-height: 240px;
	overflow: auto;
	white-space: pre-wrap;
}

.sp-approval-card__actions {
	display: flex;
	gap: 0.375rem;
	flex-wrap: wrap;
}

.sp-approval-card__btn {
	padding: 0.375rem 0.625rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	font-size: 0.8125rem;
	cursor: pointer;
	background: var(--background-primary);
	color: var(--text-normal);
}

.sp-approval-card__btn:focus {
	outline: none;
	box-shadow: 0 0 0 2px var(--interactive-accent);
}

.sp-approval-card__btn--deny {
	border-color: var(--background-modifier-error-border, var(--interactive-accent));
}
</style>
