<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExitPlanModeDecision, ExitPlanModeRequest } from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';
import type { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';

/**
 * Inline exit-plan-mode block (SPEC-CP-023, SPEC-CP-032, REQ-CP-024/025/027/028).
 * Renders an `ExitPlanModeRequest` as a "Plan complete" card with a scrollable
 * plan preview + implement / revise / cancel actions (REQ-CP-024). The chosen
 * decision → `RespondToInlineBlockUseCase.respondExitPlanMode(decision)`
 * (SPEC-CP-017); **revise** carries the feedback text (`{kind:'revise'; feedback}`).
 * Escape → cancel (`null`). Arrow moves the focused action, Enter activates.
 *
 * Capability-gated identically to SPEC-CP-022 (EC-CP-6): when
 * `supportsInlineResponse === false` the block renders READ-ONLY + a
 * `NotificationPort.showInfo` note — never answerable, the callback is never
 * reached, no response lost. Gated on the capability flag, NEVER a provider
 * branch. `<script setup>`; plan body as `{{ }}` — NO `v-html`; no `obsidian` import.
 */
const props = defineProps<{
	request: ExitPlanModeRequest;
	respond: RespondToInlineBlockUseCase;
	supportsInlineResponse: boolean;
	notify: NotificationPort;
}>();

const emit = defineEmits<{ resolve: [] }>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const focusedAction = ref(0);
const revising = ref(false);
const feedbackDraft = ref('');

/** The three actions in focus order (implement / revise / cancel). */
const ACTION_COUNT = 3;

onMounted(() => {
	if (!props.supportsInlineResponse) {
		props.notify.showInfo(t('agent.chat.composer.inline.readOnlyNotice'));
		return;
	}
	root.value?.focus();
});

function decide(decision: ExitPlanModeDecision | null): void {
	props.respond.respondExitPlanMode(decision);
	emit('resolve');
}

function implement(): void {
	decide({ kind: 'implement' });
}

/** The explicit Cancel action resolves the cancel decision. */
function cancel(): void {
	decide({ kind: 'cancel' });
}

/** Escape dismisses the block — resolves `null` (SPEC-CP-023). */
function dismiss(): void {
	decide(null);
}

/** Open the feedback field; the revise decision commits when the field submits. */
function startRevise(): void {
	revising.value = true;
}

function commitRevise(): void {
	const feedback = feedbackDraft.value.trim();
	if (feedback === '') return;
	decide({ kind: 'revise', feedback });
}

function move(delta: number): void {
	focusedAction.value = Math.max(0, Math.min(focusedAction.value + delta, ACTION_COUNT - 1));
}

function activateFocused(): void {
	if (focusedAction.value === 0) implement();
	else if (focusedAction.value === 1) startRevise();
	else cancel();
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		event.preventDefault();
		// Escape inside the feedback field returns to the action list; a second
		// Escape (or Escape on the actions) cancels the block.
		if (revising.value) {
			revising.value = false;
			root.value?.focus();
			return;
		}
		dismiss();
		return;
	}
	if (revising.value) return;
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			move(1);
			return;
		case 'ArrowUp':
			event.preventDefault();
			move(-1);
			return;
		case 'Enter':
			if (event.isComposing) return;
			event.preventDefault();
			activateFocused();
			return;
		default:
			return;
	}
}

const isFocused = computed(() => (i: number) => i === focusedAction.value);
</script>

<template>
	<div
		ref="root"
		class="sp-inline-exit-plan"
		data-testid="inline-exit-plan"
		tabindex="0"
		@keydown="onKeydown"
	>
		<div class="sp-inline-exit-plan__title">
			{{ t('agent.chat.composer.inline.exitPlanTitle') }}
		</div>

		<div class="sp-inline-exit-plan__preview" data-testid="inline-exit-plan-preview">{{
			request.plan
		}}</div>

		<template v-if="supportsInlineResponse">
			<div class="sp-inline-exit-plan__actions">
				<button
					type="button"
					class="sp-inline-exit-plan__action"
					:class="{ 'sp-inline-exit-plan__action--focused': isFocused(0) }"
					data-testid="inline-exit-plan-implement"
					@click="implement"
				>{{ t('agent.chat.composer.inline.implement') }}</button>
				<button
					type="button"
					class="sp-inline-exit-plan__action"
					:class="{ 'sp-inline-exit-plan__action--focused': isFocused(1) }"
					data-testid="inline-exit-plan-revise"
					@click="startRevise"
				>{{ t('agent.chat.composer.inline.revise') }}</button>
				<button
					type="button"
					class="sp-inline-exit-plan__action"
					:class="{ 'sp-inline-exit-plan__action--focused': isFocused(2) }"
					data-testid="inline-exit-plan-cancel"
					@click="cancel"
				>{{ t('agent.chat.composer.inline.cancel') }}</button>
			</div>

			<input
				v-if="revising"
				v-model="feedbackDraft"
				class="sp-inline-exit-plan__feedback"
				data-testid="inline-exit-plan-feedback"
				type="text"
				:placeholder="t('agent.chat.composer.inline.revisePlaceholder')"
				@keydown.enter.prevent="commitRevise"
			/>

			<div class="sp-inline-exit-plan__hints">{{ t('agent.chat.composer.dropdown.hints') }}</div>
		</template>

		<div
			v-else
			class="sp-inline-exit-plan__readonly"
			data-testid="inline-exit-plan-readonly"
			role="note"
		>
			{{ t('agent.chat.composer.inline.readOnlyNotice') }}
		</div>
	</div>
</template>

<style scoped>
.sp-inline-exit-plan {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-inline-block-bg);
	outline: none;
}

.sp-inline-exit-plan__title {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-inline-exit-plan__preview {
	max-block-size: var(--sp-dropdown-max-h);
	overflow-y: auto;
	white-space: pre-wrap;
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	background: var(--sp-bg-secondary);
	border-radius: var(--sp-radius-sm);
	padding: var(--sp-space-2);
}

.sp-inline-exit-plan__actions {
	display: flex;
	gap: var(--sp-space-2);
}

.sp-inline-exit-plan__action {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-3);
	padding-block: var(--sp-space-1);
	cursor: pointer;
}

.sp-inline-exit-plan__action--focused {
	background: var(--sp-ask-item-focused-bg);
	border-color: var(--sp-ask-cursor);
}

.sp-inline-exit-plan__feedback {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding: var(--sp-space-2);
}

.sp-inline-exit-plan__hints,
.sp-inline-exit-plan__readonly {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
