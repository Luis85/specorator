<script setup lang="ts">
/**
 * `InlineApprovalCard.vue` — Claudian-parity tabbed approval widget
 * (WS-AUX-8a). Additive to `ApprovalCard.vue`; the MessageList swap-in
 * happens in WS-8b.
 *
 * Visual structure mirrors Claude Code's approval prompt:
 *   - horizontal tab-bar (one tab per resource — single-tab for now;
 *     forward-compatible with multi-resource batches),
 *   - body with title + selectable item list (single-select shows ✓,
 *     multi-select shows `[ ]` / `[✓]`),
 *   - actions row with three SpButtons (Allow once / Allow always / Deny;
 *     Deny is default-focused — safer side per SPEC-MPS-001 §8.4).
 *
 * The component emits three named events — `deny`, `allow-once`,
 * `allow-always` — and is idempotent (subsequent clicks after the first
 * decision are no-ops). Escape on the card root emits `deny`.
 */
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort'
import type { ProviderId } from '@/domain/chat/ProviderSelection'
import SpButton from '@/ui/components/primitives/SpButton.vue'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'

interface InlineApprovalCardProps {
	request: ChatTransportApprovalRequest
	providerId: ProviderId
	multiSelect?: boolean
}

const props = withDefaults(defineProps<InlineApprovalCardProps>(), {
	multiSelect: false,
})

const emit = defineEmits<{
	deny: []
	'allow-once': []
	'allow-always': []
}>()

defineOptions({ name: 'InlineApprovalCard', inheritAttrs: false })

const { t } = useI18n()

const resolved = ref(false)
const denyButtonRef = ref<InstanceType<typeof SpButton> | null>(null)

// Single-resource case today — one tab labelled with the tool/scope pair.
// Multi-resource batches will pass a richer prop in WS-8b.
const tabs = computed(() => [
	{
		id: 'primary',
		label: `${props.request.tool}: ${props.request.scope}`,
	},
])

const activeTabId = ref<string>('primary')

const items = computed(() => {
	if (props.request.previewText === null) return []
	return [
		{
			id: 'preview',
			label: props.request.previewText,
			selected: true,
		},
	]
})

function commitDeny(): void {
	if (resolved.value) return
	resolved.value = true
	emit('deny')
}

function commitAllowOnce(): void {
	if (resolved.value) return
	resolved.value = true
	emit('allow-once')
}

function commitAllowAlways(): void {
	if (resolved.value) return
	resolved.value = true
	emit('allow-always')
}

function handleKeydown(event: KeyboardEvent): void {
	if (resolved.value) return
	if (event.key === 'Escape') {
		event.preventDefault()
		commitDeny()
	}
}

onMounted(() => {
	// SPEC-MPS-001 §8.4: default focus on Deny (safer side).
	const inst = denyButtonRef.value as unknown as { $el?: HTMLElement } | null
	inst?.$el?.focus()
})
</script>

<template>
	<section
		class="sp-approval"
		data-testid="inline-approval-card"
		role="region"
		:aria-label="t('agent.approvalCard.ariaLabel')"
		tabindex="-1"
		@keydown="handleKeydown"
	>
		<div class="sp-approval__tab-bar" role="tablist">
			<button
				v-for="(tab, i) in tabs"
				:key="tab.id"
				type="button"
				role="tab"
				class="sp-approval__tab"
				:data-testid="`inline-approval-tab-${String(i)}`"
				:data-active="activeTabId === tab.id ? 'true' : 'false'"
				:aria-selected="activeTabId === tab.id ? 'true' : 'false'"
				@click="activeTabId = tab.id"
			>
				{{ tab.label }}
			</button>
		</div>

		<div class="sp-approval__body">
			<div class="sp-approval__title" data-testid="inline-approval-title">
				{{ t('agent.approvalCard.heading', { tool: request.tool, scope: request.scope }) }}
			</div>
			<ul v-if="items.length > 0" class="sp-approval__list">
				<li
					v-for="(item, i) in items"
					:key="item.id"
					class="sp-approval__item"
					:data-testid="`inline-approval-item-${String(i)}`"
					:data-selected="item.selected ? 'true' : 'false'"
				>
					<span class="sp-approval__cursor" aria-hidden="true">▌</span>
					<SpIcon
						v-if="!multiSelect"
						class="sp-approval__check"
						name="check"
						:size="14"
					/>
					<SpIcon
						v-else
						class="sp-approval__check"
						:name="item.selected ? 'check-square' : 'square'"
						:size="14"
					/>
					<span class="sp-approval__item-label">{{ item.label }}</span>
				</li>
			</ul>
		</div>

		<div class="sp-approval__actions" data-testid="inline-approval-actions">
			<SpButton
				ref="denyButtonRef"
				variant="secondary"
				data-testid="inline-approval-deny"
				:aria-label="t('agent.approvalCard.deny')"
				@click="commitDeny"
			>
				{{ t('agent.approvalCard.deny') }}
			</SpButton>
			<SpButton
				variant="secondary"
				data-testid="inline-approval-allow-once"
				:aria-label="t('agent.approvalCard.allowOnce')"
				@click="commitAllowOnce"
			>
				{{ t('agent.approvalCard.allowOnce') }}
			</SpButton>
			<SpButton
				variant="primary"
				data-testid="inline-approval-allow-always"
				:aria-label="t('agent.approvalCard.alwaysAllow')"
				@click="commitAllowAlways"
			>
				{{ t('agent.approvalCard.alwaysAllow') }}
			</SpButton>
		</div>
	</section>
</template>

<style scoped>
.sp-approval {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-3);
	margin-block: var(--sp-space-3);
	padding: var(--sp-space-4);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
}

.sp-approval__tab-bar {
	display: flex;
	gap: var(--sp-space-2);
	flex-wrap: wrap;
	border-block-end: 1px solid var(--sp-border);
	padding-block-end: var(--sp-space-2);
}

.sp-approval__tab {
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	border: 1px solid transparent;
	border-start-start-radius: var(--sp-radius-sm);
	border-start-end-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-muted);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}
.sp-approval__tab[data-active='true'] {
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	border-color: var(--sp-border);
}
.sp-approval__tab:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}

.sp-approval__body {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
}

.sp-approval__title {
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-md);
	font-weight: var(--sp-font-weight-medium);
}

.sp-approval__list {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	margin: 0;
	padding-inline-start: 0;
	list-style: none;
}

.sp-approval__item {
	display: inline-flex;
	align-items: flex-start;
	gap: var(--sp-space-2);
	padding-block: var(--sp-space-1);
	padding-inline: var(--sp-space-2);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-monospace, var(--sp-font-text));
	font-size: var(--sp-font-size-sm);
	white-space: pre-wrap;
}

.sp-approval__cursor {
	color: var(--sp-brand);
	flex: 0 0 auto;
}

.sp-approval__check {
	flex: 0 0 auto;
	color: var(--sp-text-muted);
}

.sp-approval__item[data-selected='true'] .sp-approval__check {
	color: var(--sp-brand);
}

.sp-approval__item-label {
	flex: 1 1 auto;
	min-width: 0;
}

.sp-approval__actions {
	display: flex;
	gap: var(--sp-space-2);
	flex-wrap: wrap;
}
</style>
