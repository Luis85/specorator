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
 *
 * WP-8 changes:
 *   - UX #19: plan markdown renders through `MarkdownBlock` (delegates to
 *     the project's markdown port) instead of a literal `<pre>` block.
 *   - UX #12: closing the sidepanel mid-plan no longer silently cancels.
 *     The parent persists pending plans via the optional `persistKey` +
 *     `pending-changed` emit so unresolved plans re-surface on remount.
 *     When the host explicitly sets `persistOnUnmount` (the default),
 *     unmount is treated as "card disappeared from view" — NOT a
 *     decision; the plan is preserved as pending for the next mount. The
 *     prior behaviour (`onBeforeUnmount` auto-cancel) is reserved for
 *     the test-only `persistOnUnmount={false}` path that doesn't have a
 *     persistence host.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PlanDecision } from '@/domain/chat/PlanApproval';
import MarkdownBlock from '@/ui/components/agent/MarkdownBlock.vue';

const props = withDefaults(
	defineProps<{
		/** Plan content as markdown. Rendered into the card body via MarkdownBlock. */
		planMarkdown: string;
		/** Optional permissions the model is requesting. */
		allowedPrompts?: readonly string[];
		/**
		 * UX #12 (WP-8). When `true` (default), unmount without an explicit
		 * decision is treated as a transient hide — the parent is informed via
		 * `pending-changed` so it can persist the plan and re-surface it on
		 * remount. When `false`, unmount auto-cancels (legacy behaviour for
		 * tests that don't wire a persistence host).
		 */
		persistOnUnmount?: boolean;
	}>(),
	{
		allowedPrompts: undefined,
		persistOnUnmount: true,
	},
);

const emit = defineEmits<{
	decide: [decision: PlanDecision];
	/**
	 * Emitted on mount with `true` and on resolve / unmount-cancel with
	 * `false`. Parents persist the boolean via `ApprovalPort` so unresolved
	 * plans re-surface on remount (UX #12, WP-8).
	 */
	'pending-changed': [pending: boolean];
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
 * WP-7 A11y #2: capture the previously-focused element on mount so we can
 * restore focus to it after the user decides. Without this, focus drops to
 * `<body>` and a keyboard-only user is stranded between the card unmounting
 * and the next mount cycle landing focus somewhere useful.
 */
const previouslyFocusedEl = ref<HTMLElement | null>(null);

function commit(decision: PlanDecision): void {
	if (resolved.value) return;
	resolved.value = true;
	restorePreviousFocus();
	emit('decide', decision);
	emit('pending-changed', false);
}

function restorePreviousFocus(): void {
	const el = previouslyFocusedEl.value;
	if (el === null) return;
	previouslyFocusedEl.value = null;
	// `focus()` is a no-op for detached / display:none elements; that's
	// fine — we only attempt restoration.
	if (typeof el.focus === 'function') el.focus();
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
	if (event.isComposing || event.keyCode === 229) return;
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

onMounted(() => {
	// WP-7 A11y #2: capture current focus owner BEFORE we steal focus so we
	// can return to it on decide. `document.activeElement` is the textarea
	// the user was typing in nine times out of ten.
	const active =
		typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
	previouslyFocusedEl.value = active;
	// Auto-focus the card root so ArrowDown/Up/Enter operate without an
	// explicit Tab step from the textarea (per a11y review #2).
	rootEl.value?.focus();
	// UX #12 (WP-8): tell the host the card is awaiting a decision so it can
	// persist the pending plan and re-surface it on a future remount.
	emit('pending-changed', true);
});

onBeforeUnmount(() => {
	if (resolved.value) return;
	if (props.persistOnUnmount) {
		// UX #12 (WP-8): unmount is a transient hide, not a decision. The
		// parent has already stashed the pending plan via the on-mount
		// `pending-changed` emit; do nothing else here. Focus restoration
		// happens once the user actually decides (via commit()).
		return;
	}
	// Legacy fallback (e.g. tests without a persistence host) — preserves
	// the prior "auto-cancel on unmount" semantics. WP-7 A11y #2 still
	// applies: restore focus to whoever owned it before we mounted.
	resolved.value = true;
	restorePreviousFocus();
	emit('decide', { type: 'cancel' });
	emit('pending-changed', false);
});
</script>

<template>
	<section
		ref="rootEl"
		class="sp-plan-approval"
		data-testid="agent-plan-approval"
		role="region"
		:aria-label="t('agent.planApprovalAriaLabel')"
		:aria-activedescendant="`agent-plan-approval-row-${focusedRow}`"
		tabindex="0"
		@keydown="handleRowKeydown"
	>
		<header class="sp-plan-approval__header" data-testid="agent-plan-approval-header">
			<span class="sp-plan-approval__icon" aria-hidden="true">📋</span>
			<span>{{ t('agent.planApprovalHeading') }}</span>
		</header>
		<!--
      UX #19 (WP-8): plan body is markdown; render through the project's
      MarkdownBlock so headings/lists/code render properly instead of as a
      literal `<pre>` block.
    -->
		<div
			class="sp-plan-approval__plan"
			data-testid="agent-plan-approval-plan"
		>
			<MarkdownBlock :text="planMarkdown" />
		</div>
		<p
			v-if="hasPermissions"
			class="sp-plan-approval__permissions"
			data-testid="agent-plan-approval-permissions"
		>
			{{ t('agent.planApprovalPermissions', { tools: (allowedPrompts ?? []).join(', ') }) }}
		</p>
		<!--
			WP-7 A11y #2: radiogroup + radio semantics so the row list matches the
			WAI-ARIA APG arrow-keys pattern. The root `<section>` owns keydown
			and DOM focus (via previous-focus capture); per the ARIA spec,
			`aria-activedescendant` must live on the focused element to publish
			the active option to assistive tech, so it sits on the `<section>`
			(not the radiogroup `<ul>`) — Codex P2 round-5 on PR #402.
		-->
		<ul
			class="sp-plan-approval__rows"
			role="radiogroup"
			:aria-label="t('agent.planApprovalAriaLabel')"
		>
			<li
				v-for="row in rows"
				:id="`agent-plan-approval-row-${row}`"
				:key="row"
				class="sp-plan-approval__row"
				:class="{ 'sp-plan-approval__row--focused': focusedRow === row }"
				:data-testid="`agent-plan-approval-row-${row}`"
				role="radio"
				:aria-checked="focusedRow === row"
				:tabindex="focusedRow === row ? 0 : -1"
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
