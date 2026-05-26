<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';

/**
 * One approval-rule row (SPEC-AS-014, REQ-AS-041/042/050/051). Presentational —
 * props in, `remove:[id]` out. Shows tool · `actionPattern ?? '*'` · the localised
 * decision · the localised lifetime, each as TEXT (not colour-alone, NFR-AS-013); the
 * allow/deny badge carries a text label AND a `--sp-approvals-decision-allow|deny`
 * token tint so the decision survives forced-colors. A **persisted** rule carries a
 * focusable remove button (accessible name `agent.chat.approvals.remove`) emitting
 * `remove(rule.id)` on click/Enter/Space; a **session** rule is listed but has no
 * remove control (it is inherently ephemeral). No `obsidian`/`v-html`.
 */
const props = defineProps<{ rule: ApprovalRule }>();
const emit = defineEmits<{ remove: [id: string] }>();

const { t } = useI18n();

const pattern = computed(() => props.rule.actionPattern ?? '*');
const decisionLabel = computed(() => t(`agent.chat.approvals.decision.${props.rule.decision}`));
const lifetimeLabel = computed(() => t(`agent.chat.approvals.lifetime.${props.rule.lifetime}`));
const isPersisted = computed(() => props.rule.lifetime === 'persisted');
const removeLabel = computed(() =>
	t('agent.chat.approvals.remove', { tool: props.rule.toolName, pattern: pattern.value }),
);

function onRemove(): void {
	emit('remove', props.rule.id);
}
</script>

<template>
	<li class="sp-approvals-rule" data-testid="approvals-rule">
		<span class="sp-approvals-rule__tool" dir="auto">{{ rule.toolName }}</span>
		<span class="sp-approvals-rule__pattern" dir="auto">{{ pattern }}</span>
		<span
			class="sp-approvals-rule__decision"
			:class="`sp-approvals-rule__decision--${rule.decision}`"
			>{{ decisionLabel }}</span
		>
		<span class="sp-approvals-rule__lifetime">{{ lifetimeLabel }}</span>
		<button
			v-if="isPersisted"
			type="button"
			class="sp-approvals-rule__remove"
			data-testid="approvals-rule-remove"
			:aria-label="removeLabel"
			@click="onRemove"
		>
			×
		</button>
	</li>
</template>

<style scoped>
.sp-approvals-rule {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
}

.sp-approvals-rule__tool {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-approvals-rule__pattern {
	font-family: var(--sp-font-mono);
	color: var(--sp-text-muted);
}

.sp-approvals-rule__decision {
	border-radius: var(--sp-radius-sm);
	padding-inline: var(--sp-space-1);
}

.sp-approvals-rule__decision--allow {
	color: var(--sp-approvals-decision-allow);
}

.sp-approvals-rule__decision--deny {
	color: var(--sp-approvals-decision-deny);
}

.sp-approvals-rule__lifetime {
	color: var(--sp-text-muted);
}

.sp-approvals-rule__remove {
	margin-inline-start: auto;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}
</style>
