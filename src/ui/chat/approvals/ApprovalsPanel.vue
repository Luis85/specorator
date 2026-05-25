<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import ApprovalRuleRow from './ApprovalRuleRow.vue';

/**
 * The minimal status/approvals surface (SPEC-AS-013, REQ-AS-040/041/043/050/051; NG2
 * defers the rich editor to P10). Presentational + LIVE — it re-renders on `mode`/
 * `rules` prop change (the surface owns the reactive view-model, SPEC-AS-016).
 * Shows the active mode under a localised title, the rule list as `ApprovalRuleRow`s
 * (re-emitting each row's `remove` up to the surface), and an empty notice when there
 * are no rules. Keyboard-navigable; each control carries an accessible name. No
 * `obsidian`/`v-html`. Claudian ground-truth: `status-panel.css`.
 */
const props = defineProps<{ mode: PermissionMode; rules: readonly ApprovalRule[] }>();
const emit = defineEmits<{ remove: [id: string] }>();

const { t } = useI18n();

const modeText = computed(() => t('agent.chat.approvals.mode', { mode: props.mode }));
const isEmpty = computed(() => props.rules.length === 0);

function onRemove(id: string): void {
	emit('remove', id);
}
</script>

<template>
	<section
		class="sp-approvals-panel"
		data-testid="approvals-panel"
		:aria-label="t('agent.chat.approvals.title')"
	>
		<h3 class="sp-approvals-panel__title">{{ t('agent.chat.approvals.title') }}</h3>
		<p class="sp-approvals-panel__mode" data-testid="approvals-mode">{{ modeText }}</p>

		<h4 class="sp-approvals-panel__heading">{{ t('agent.chat.approvals.rulesHeading') }}</h4>
		<p v-if="isEmpty" class="sp-approvals-panel__empty" data-testid="approvals-empty">
			{{ t('agent.chat.approvals.empty') }}
		</p>
		<ul v-else class="sp-approvals-panel__rules">
			<ApprovalRuleRow
				v-for="rule in rules"
				:key="rule.id"
				:rule="rule"
				@remove="onRemove"
			/>
		</ul>
	</section>
</template>

<style scoped>
.sp-approvals-panel {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
}

.sp-approvals-panel__title {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-approvals-panel__mode {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-approvals-panel__heading {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-approvals-panel__empty {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-approvals-panel__rules {
	display: flex;
	flex-direction: column;
	gap: var(--sp-approvals-row-gap);
	margin: 0;
	padding: 0;
	list-style: none;
}
</style>
