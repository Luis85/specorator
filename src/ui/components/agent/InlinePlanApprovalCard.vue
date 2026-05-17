<script setup lang="ts">
/**
 * Inline plan-approval card (PR-ASV-2-plan-mode, agent-sidepanel-v2).
 * Inspired by Claudian's `InlinePlanApproval.ts` + `InlineExitPlanMode.ts`
 * (https://github.com/YishenTu/claudian) — three keyboard-navigable
 * options for the user to dispatch on a plan the model surfaced via
 * `ExitPlanMode`:
 *
 *   - **Implement** — accept the plan as-is
 *   - **Revise** — expand a textarea, type feedback, dispatch as revision
 *   - **Cancel** — reject without further action
 *
 * Keyboard: ArrowDown/Up navigate (wrap-around), Enter commits, Escape
 * cancels. Inside the revise textarea Enter commits the revision (and
 * Esc returns focus to the row list without cancelling the whole card).
 *
 * Idempotent: once a decision is emitted, subsequent commits are no-ops
 * (mirrors Claudian's `resolved` guard).
 */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PlanDecision } from '@/domain/chat/PlanApproval';

const props = defineProps<{
	/** Plan content as markdown. Rendered into the card body. */
	planMarkdown: string;
	/** Optional permissions the model is requesting. */
	allowedPrompts?: readonly string[];
}>();

const emit = defineEmits<{
	decide: [decision: PlanDecision];
}>();

const { t } = useI18n();

type RowKey = 'implement' | 'revise' | 'cancel';
const rows: readonly RowKey[] = ['implement', 'revise', 'cancel'] as const;

const focusedRow = ref<RowKey>('implement');
const reviseExpanded = ref(false);
const reviseText = ref('');
const resolved = ref(false);
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);

/**
 * Tracks whether the revise textarea is currently inside an IME composition
 * session. Driven by the W3C `compositionstart` / `compositionend` events
 * (see ChatInput.vue for the full rationale — Safari's confirm-Enter path
 * reports `event.isComposing === false` while composition is still active).
 */
const isImeComposing = ref(false);

function handleCompositionStart(): void {
	isImeComposing.value = true;
}

function handleCompositionEnd(): void {
	isImeComposing.value = false;
}

function commit(decision: PlanDecision): void {
	if (resolved.value) return;
	resolved.value = true;
	emit('decide', decision);
}

function moveSelection(delta: number): void {
	if (reviseExpanded.value) return;
	const idx = rows.indexOf(focusedRow.value);
	const next = (idx + delta + rows.length) % rows.length;
	focusedRow.value = rows[next];
}

async function expandRevise(): Promise<void> {
	reviseExpanded.value = true;
	await nextTick();
	textareaEl.value?.focus();
}

function collapseRevise(): void {
	reviseExpanded.value = false;
	focusedRow.value = 'revise';
	rootEl.value?.focus();
}

function handleRowKeydown(event: KeyboardEvent): void {
	if (resolved.value) return;
	if (event.key === 'ArrowDown') {
		event.preventDefault();
		moveSelection(1);
		return;
	}
	if (event.key === 'ArrowUp') {
		event.preventDefault();
		moveSelection(-1);
		return;
	}
	if (event.key === 'Escape') {
		event.preventDefault();
		commit({ type: 'cancel' });
		return;
	}
	if (event.key === 'Enter') {
		event.preventDefault();
		void handleRowEnter();
	}
}

async function handleRowEnter(): Promise<void> {
	if (focusedRow.value === 'implement') {
		commit({ type: 'implement' });
	} else if (focusedRow.value === 'revise') {
		await expandRevise();
	} else {
		commit({ type: 'cancel' });
	}
}

function handleReviseKeydown(event: KeyboardEvent): void {
	if (resolved.value) return;
	// IME-composition guard. See ChatInput.vue for the full rationale: tracking
	// composition state via the W3C events covers every browser's IME path
	// (including Safari's buggy confirm-Enter) with no deprecated APIs.
	if (event.isComposing || isImeComposing.value) return;
	if (event.key === 'Escape') {
		event.preventDefault();
		collapseRevise();
		return;
	}
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		const text = reviseText.value.trim();
		if (text.length === 0) return;
		commit({ type: 'revise', text });
	}
}

function handleClick(row: RowKey): void {
	focusedRow.value = row;
	if (row === 'implement') commit({ type: 'implement' });
	else if (row === 'revise') void expandRevise();
	else commit({ type: 'cancel' });
}

const rowCursor = (row: RowKey) => (focusedRow.value === row ? '›' : ' ');

const hasPermissions = computed(
	() => props.allowedPrompts !== undefined && props.allowedPrompts.length > 0,
);

onBeforeUnmount(() => {
	if (!resolved.value) {
		resolved.value = true;
		emit('decide', { type: 'cancel' });
	}
});
</script>

<template>
	<section
		ref="rootEl"
		class="sp-plan-approval"
		data-testid="agent-plan-approval"
		role="region"
		:aria-label="t('agent.planApprovalAriaLabel')"
		tabindex="0"
		@keydown="handleRowKeydown"
	>
		<header class="sp-plan-approval__header" data-testid="agent-plan-approval-header">
			<span class="sp-plan-approval__icon" aria-hidden="true">📋</span>
			<span>{{ t('agent.planApprovalHeading') }}</span>
		</header>
		<pre
			class="sp-plan-approval__plan"
			data-testid="agent-plan-approval-plan"
		>{{ planMarkdown }}</pre>
		<p
			v-if="hasPermissions"
			class="sp-plan-approval__permissions"
			data-testid="agent-plan-approval-permissions"
		>
			{{ t('agent.planApprovalPermissions', { tools: (allowedPrompts ?? []).join(', ') }) }}
		</p>
		<ul class="sp-plan-approval__rows" role="list">
			<li
				v-for="row in rows"
				:key="row"
				class="sp-plan-approval__row"
				:class="{ 'sp-plan-approval__row--focused': focusedRow === row }"
				:data-testid="`agent-plan-approval-row-${row}`"
				role="button"
				tabindex="-1"
				@click="handleClick(row)"
			>
				<span class="sp-plan-approval__cursor" aria-hidden="true">{{ rowCursor(row) }}</span>
				<span class="sp-plan-approval__label">{{ t(`agent.planApproval.${row}`) }}</span>
			</li>
		</ul>
		<textarea
			v-if="reviseExpanded"
			ref="textareaEl"
			v-model="reviseText"
			class="sp-plan-approval__revise"
			data-testid="agent-plan-approval-revise"
			:placeholder="t('agent.planApprovalRevisePlaceholder')"
			rows="3"
			@keydown.stop="handleReviseKeydown"
			@compositionstart="handleCompositionStart"
			@compositionend="handleCompositionEnd"
		/>
	</section>
</template>

<style scoped>
.sp-plan-approval {
	margin: 0.5rem 0;
	padding: 0.75rem;
	border: 1px solid var(--interactive-accent);
	border-radius: 6px;
	background: var(--background-secondary);
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.sp-plan-approval:focus {
	outline: none;
	box-shadow: 0 0 0 2px var(--interactive-accent);
}

.sp-plan-approval__header {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8125rem;
	font-weight: 600;
	color: var(--text-normal);
}

.sp-plan-approval__plan {
	margin: 0;
	padding: 0.5rem 0.625rem;
	background: var(--background-primary);
	border-radius: 4px;
	font-family: inherit;
	font-size: 0.8125rem;
	white-space: pre-wrap;
	max-height: 240px;
	overflow-y: auto;
}

.sp-plan-approval__permissions {
	margin: 0;
	font-size: 0.75rem;
	color: var(--text-muted);
}

.sp-plan-approval__rows {
	margin: 0;
	padding: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.sp-plan-approval__row {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.25rem 0.375rem;
	border-radius: 3px;
	cursor: pointer;
	font-size: 0.8125rem;
	color: var(--text-normal);
}

.sp-plan-approval__row:hover {
	background: var(--interactive-hover);
}

.sp-plan-approval__row--focused {
	background: var(--background-modifier-border);
}

.sp-plan-approval__cursor {
	font-family: var(--font-monospace, ui-monospace, monospace);
	width: 0.75rem;
	color: var(--interactive-accent);
}

.sp-plan-approval__label {
	font-weight: 500;
}

.sp-plan-approval__revise {
	width: 100%;
	padding: 0.375rem 0.5rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
	font-family: inherit;
	font-size: 0.8125rem;
	resize: vertical;
}
</style>
