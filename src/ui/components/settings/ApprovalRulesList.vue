<script setup lang="ts">
/**
 * `ApprovalRulesList.vue` — the Approvals section rendered inside the
 * Obsidian settings tab (WS-9, T-MPS-141, REQ-MPS-047).
 *
 * Lists every saved `ApprovalRule` with the `(providerId, tool, scope)`
 * triple and a per-row Remove button. Removing a rule mutates
 * `approvalRulesStore` and emits a `remove` event so the host
 * (`SpecoratorSettingTab`) can mirror the change to
 * `_storedData.specorator.approvalRules`.
 */
import { useI18n } from 'vue-i18n'

import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore'

const emit = defineEmits<{
	remove: [ruleId: string]
}>()

const { t } = useI18n()
const rules = useApprovalRulesStore()

function handleRemove(ruleId: string): void {
	rules.removeRule(ruleId)
	emit('remove', ruleId)
}
</script>

<template>
	<section class="sp-approval-rules-list" data-testid="approval-rules-list">
		<header class="sp-approval-rules-list__header">
			{{ t('settings.approvalRules.heading') }}
		</header>
		<p
			v-if="rules.rules.length === 0"
			class="sp-approval-rules-list__empty"
			data-testid="approval-rules-empty"
		>
			{{ t('settings.approvalRules.empty') }}
		</p>
		<ul v-else class="sp-approval-rules-list__rows" role="list">
			<li
				v-for="rule in rules.rules"
				:key="rule.id"
				class="sp-approval-rules-list__row"
				:data-testid="`approval-rule-row-${rule.id}`"
			>
				<span class="sp-approval-rules-list__triple">
					<span class="sp-approval-rules-list__cell sp-approval-rules-list__cell--provider">{{
						rule.providerId
					}}</span>
					<span class="sp-approval-rules-list__cell sp-approval-rules-list__cell--tool">{{
						rule.tool
					}}</span>
					<code class="sp-approval-rules-list__cell sp-approval-rules-list__cell--scope">{{
						rule.scope
					}}</code>
				</span>
				<button
					type="button"
					class="sp-approval-rules-list__remove"
					:data-testid="`approval-rule-remove-${rule.id}`"
					:aria-label="t('settings.approvalRules.removeAriaLabel', { scope: rule.scope })"
					@click="handleRemove(rule.id)"
				>
					{{ t('settings.approvalRules.remove') }}
				</button>
			</li>
		</ul>
	</section>
</template>

<style scoped>
.sp-approval-rules-list {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
	margin: 0.75rem 0;
}

.sp-approval-rules-list__header {
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-approval-rules-list__empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--text-muted);
	font-style: italic;
}

.sp-approval-rules-list__rows {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-approval-rules-list__row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	padding: 0.375rem 0.5rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
}

.sp-approval-rules-list__triple {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	align-items: baseline;
	font-size: 0.8125rem;
}

.sp-approval-rules-list__cell {
	color: var(--text-normal);
}

.sp-approval-rules-list__cell--provider {
	font-weight: 600;
}

.sp-approval-rules-list__cell--tool {
	color: var(--text-muted);
}

.sp-approval-rules-list__cell--scope {
	font-family: var(--font-monospace, ui-monospace, monospace);
}

.sp-approval-rules-list__remove {
	padding: 0.25rem 0.5rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
	color: var(--text-normal);
	font-size: 0.75rem;
	cursor: pointer;
}

.sp-approval-rules-list__remove:hover {
	background: var(--background-modifier-hover);
}

.sp-approval-rules-list__remove:focus {
	outline: none;
	box-shadow: 0 0 0 2px var(--interactive-accent);
}
</style>
