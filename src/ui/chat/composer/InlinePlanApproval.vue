<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ApprovalDecision, ApprovalRequest } from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';
import type { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';

/**
 * Inline plan/tool-approval block (SPEC-CP-024, SPEC-CP-032, REQ-CP-026/027/028).
 * Renders an `ApprovalRequest` — the action `tool` + `context` (render-only) + the
 * decision options (Deny / Allow once / Always allow = deny/allow/allow-always).
 * The chosen decision → `RespondToInlineBlockUseCase.respondApproval(decision)`
 * (SPEC-CP-017). **P4 persists NO rule (NG3):** `'allow-always'` routes the
 * decision for the CURRENT request only — this component takes no
 * `SettingsPort`/history collaborator, so nothing is written; the rule store is P7.
 * Escape → cancel (`null`).
 *
 * Capability-gated identically (EC-CP-6): when `supportsInlineResponse === false`
 * the block renders READ-ONLY + a `NotificationPort.showInfo` note — never
 * answerable, the callback is never reached, no response lost. Gated on the
 * capability flag, NEVER a provider branch. `<script setup>`; context as `{{ }}`
 * — NO `v-html`; no `obsidian` import.
 */
const props = defineProps<{
	request: ApprovalRequest;
	respond: RespondToInlineBlockUseCase;
	supportsInlineResponse: boolean;
	notify: NotificationPort;
}>();

const emit = defineEmits<{ resolve: [] }>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const focusedOption = ref(0);

onMounted(() => {
	if (!props.supportsInlineResponse) {
		props.notify.showInfo(t('agent.chat.composer.inline.readOnlyNotice'));
		return;
	}
	root.value?.focus();
});

/** Route the decision for the CURRENT request — no rule persisted (NG3). */
function choose(decision: ApprovalDecision): void {
	props.respond.respondApproval(decision);
	emit('resolve');
}

/** Escape dismisses the block — resolves `null` (SPEC-CP-024). */
function dismiss(): void {
	props.respond.respondApproval(null);
	emit('resolve');
}

function move(delta: number): void {
	const len = props.request.options.length;
	if (len === 0) return;
	focusedOption.value = (focusedOption.value + delta + len) % len;
}

function activateFocused(): void {
	// `move` keeps focusedOption in [0, options.length) so the index is always valid.
	if (props.request.options.length === 0) return;
	choose(props.request.options[focusedOption.value].decision);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		event.preventDefault();
		dismiss();
		return;
	}
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
</script>

<template>
	<div
		ref="root"
		class="sp-inline-plan-approval"
		data-testid="inline-plan-approval"
		tabindex="0"
		@keydown="onKeydown"
	>
		<div class="sp-inline-plan-approval__tool">{{ request.tool }}</div>
		<div class="sp-inline-plan-approval__context" data-testid="inline-plan-approval-context">{{
			request.context
		}}</div>

		<template v-if="supportsInlineResponse">
			<div class="sp-inline-plan-approval__options">
				<button
					v-for="(option, i) in request.options"
					:key="option.decision"
					type="button"
					class="sp-inline-plan-approval__option"
					:class="{ 'sp-inline-plan-approval__option--focused': i === focusedOption }"
					:data-testid="`inline-plan-approval-option-${option.decision}`"
					@click="choose(option.decision)"
					@mouseenter="focusedOption = i"
				>{{ option.label }}</button>
			</div>
			<div class="sp-inline-plan-approval__hints">
				{{ t('agent.chat.composer.dropdown.hints') }}
			</div>
		</template>

		<div
			v-else
			class="sp-inline-plan-approval__readonly"
			data-testid="inline-plan-approval-readonly"
			role="note"
		>
			{{ t('agent.chat.composer.inline.readOnlyNotice') }}
		</div>
	</div>
</template>

<style scoped>
.sp-inline-plan-approval {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-inline-block-bg);
	outline: none;
}

.sp-inline-plan-approval__tool {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-inline-plan-approval__context {
	font-family: var(--sp-font-mono);
	font-size: var(--sp-font-size-sm);
	background: var(--sp-bg-secondary);
	border-radius: var(--sp-radius-sm);
	padding: var(--sp-space-2);
	white-space: pre-wrap;
}

.sp-inline-plan-approval__options {
	display: flex;
	gap: var(--sp-space-2);
}

.sp-inline-plan-approval__option {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-3);
	padding-block: var(--sp-space-1);
	cursor: pointer;
}

.sp-inline-plan-approval__option--focused {
	background: var(--sp-ask-item-focused-bg);
	border-color: var(--sp-ask-cursor);
}

.sp-inline-plan-approval__hints,
.sp-inline-plan-approval__readonly {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
