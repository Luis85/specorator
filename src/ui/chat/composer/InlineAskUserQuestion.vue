<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
	AskUserQuestionAnswer,
	AskUserQuestionRequest,
} from '@/domain/chat/inline';
import type { NotificationPort } from '@/domain/ports';
import type { RespondToInlineBlockUseCase } from '@/application/chat/composer/RespondToInlineBlockUseCase';

/**
 * Inline ask-user-question block (SPEC-CP-022, SPEC-CP-032, REQ-CP-022/023/027/028).
 * Renders an `AskUserQuestionRequest` IN PLACE OF the composer (REQ-CP-027). A
 * (possibly multi-question) block: Arrow navigates options, Left/Right or
 * Tab/Shift+Tab switch question tabs (REQ-CP-022), Enter selects/advances, Escape
 * cancels (resolve `null`). `allowCustomInput` offers a free-text field. On a
 * complete answer (every question id covered) →
 * `RespondToInlineBlockUseCase.respondAskUserQuestion(answer)` (SPEC-CP-017); the
 * parent dequeues on `resolve` (REQ-CP-027).
 *
 * Capability-gated (REQ-CP-028, SPEC-CP-032, EC-CP-6): when
 * `supportsInlineResponse === false` the block renders READ-ONLY + a non-blocking
 * `NotificationPort.showInfo` note — never answerable, the callback is never
 * reached, no response is lost. The gate is the capability flag (read from
 * `getCapabilities()` by the parent), NEVER a provider branch. `<script setup>`;
 * question/option text as `{{ }}` — NO `v-html`; no `obsidian` import.
 */
const props = defineProps<{
	request: AskUserQuestionRequest;
	respond: RespondToInlineBlockUseCase;
	supportsInlineResponse: boolean;
	notify: NotificationPort;
}>();

const emit = defineEmits<{ resolve: [] }>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const activeTab = ref(0);
const focusedOption = ref(0);
const customDraft = ref('');
const customFocused = ref(false);
// The accumulated answers, keyed by question id (a complete answer covers all).
const answers = ref<Record<string, string | { custom: string }>>({});

const questions = computed(() => props.request.questions);
const currentQuestion = computed(() => questions.value[activeTab.value]);
const allowCustom = computed(() => currentQuestion.value.allowCustomInput === true);
/** The custom-input row sits after the last option (the extra focusable item). */
const optionCount = computed(() => currentQuestion.value.options.length);
const maxFocus = computed(() => optionCount.value - 1 + (allowCustom.value ? 1 : 0));

/**
 * Whether `id` has a recorded answer. Uses `in` (not an indexed-access
 * `!== undefined`) so the check is type-safe without `noUncheckedIndexedAccess`
 * widening the Record value type.
 */
function isAnswered(id: string): boolean {
	return Object.prototype.hasOwnProperty.call(answers.value, id);
}

const isComplete = computed(() => questions.value.every((q) => isAnswered(q.id)));

onMounted(() => {
	if (!props.supportsInlineResponse) {
		props.notify.showInfo(t('agent.chat.composer.inline.readOnlyNotice'));
		return;
	}
	root.value?.focus();
});

/** Record the chosen option for the active question, then advance or submit. */
function selectOption(optionId: string): void {
	const q = currentQuestion.value;
	answers.value = { ...answers.value, [q.id]: optionId };
	advanceOrSubmit();
}

function commitCustom(): void {
	const q = currentQuestion.value;
	const text = customDraft.value.trim();
	if (text === '') return;
	answers.value = { ...answers.value, [q.id]: { custom: text } };
	customDraft.value = '';
	advanceOrSubmit();
}

/** Move to the next unanswered question, or submit when every question is covered. */
function advanceOrSubmit(): void {
	if (isComplete.value) {
		submit();
		return;
	}
	const next = questions.value.findIndex((q) => !isAnswered(q.id));
	if (next >= 0) switchTab(next);
}

function submit(): void {
	const answer: AskUserQuestionAnswer = {
		requestId: props.request.requestId,
		answers: { ...answers.value },
	};
	props.respond.respondAskUserQuestion(answer);
	emit('resolve');
}

function cancel(): void {
	props.respond.respondAskUserQuestion(null);
	emit('resolve');
}

function switchTab(index: number): void {
	const clamped = Math.max(0, Math.min(index, questions.value.length - 1));
	activeTab.value = clamped;
	focusedOption.value = 0;
	customFocused.value = false;
}

function move(delta: number): void {
	const next = Math.max(0, Math.min(focusedOption.value + delta, maxFocus.value));
	focusedOption.value = next;
	customFocused.value = allowCustom.value && next === optionCount.value;
}

/** Activate the focused row: an option selects; the custom row commits its text. */
function activateFocused(): void {
	if (allowCustom.value && focusedOption.value === optionCount.value) {
		commitCustom();
		return;
	}
	// focusedOption is clamped to maxFocus; the custom row is handled above, so any
	// remaining focus index addresses a real option.
	selectOption(currentQuestion.value.options[focusedOption.value].id);
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		event.preventDefault();
		cancel();
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
		case 'ArrowLeft':
			event.preventDefault();
			switchTab(activeTab.value - 1);
			return;
		case 'ArrowRight':
			event.preventDefault();
			switchTab(activeTab.value + 1);
			return;
		case 'Tab':
			event.preventDefault();
			switchTab(activeTab.value + (event.shiftKey ? -1 : 1));
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

function isTabAnswered(index: number): boolean {
	return isAnswered(questions.value[index].id);
}
</script>

<template>
	<div
		ref="root"
		class="sp-inline-ask"
		data-testid="inline-ask"
		tabindex="0"
		@keydown="onKeydown"
	>
		<div class="sp-inline-ask__title">{{ t('agent.chat.composer.inline.askTitle') }}</div>

		<div
			v-if="questions.length > 1"
			class="sp-inline-ask__tabs"
			role="tablist"
		>
			<span
				v-for="(q, qi) in questions"
				:key="q.id"
				class="sp-inline-ask__tab"
				:class="{ 'sp-inline-ask__tab--active': qi === activeTab }"
				:data-testid="`inline-ask-tab-${qi}`"
				role="tab"
				:aria-selected="qi === activeTab ? 'true' : 'false'"
				@click="switchTab(qi)"
			>{{ q.question }}<span v-if="isTabAnswered(qi)" aria-hidden="true"> ✓</span></span>
		</div>

		<div class="sp-inline-ask__content">
			<div class="sp-inline-ask__question">{{ currentQuestion.question }}</div>

			<template v-if="supportsInlineResponse">
				<ul class="sp-inline-ask__list" role="listbox">
					<li
						v-for="(option, oi) in currentQuestion.options"
						:key="option.id"
						class="sp-inline-ask__option"
						:class="{ 'sp-inline-ask__option--focused': oi === focusedOption && !customFocused }"
						:data-testid="`inline-ask-option-${oi}`"
						role="option"
						:aria-selected="oi === focusedOption && !customFocused ? 'true' : 'false'"
						@click="selectOption(option.id)"
						@mouseenter="focusedOption = oi"
					>
						<span class="sp-inline-ask__option-label">{{ option.label }}</span>
						<span
							v-if="option.description !== undefined && option.description !== ''"
							class="sp-inline-ask__option-desc"
						>{{ option.description }}</span>
					</li>
				</ul>

				<input
					v-if="allowCustom"
					v-model="customDraft"
					class="sp-inline-ask__custom"
					data-testid="inline-ask-custom"
					type="text"
					:placeholder="t('agent.chat.composer.inline.customPlaceholder')"
					@focus="customFocused = true"
					@blur="customFocused = false"
					@keydown.enter.prevent="commitCustom"
				/>

				<div class="sp-inline-ask__hints">{{ t('agent.chat.composer.dropdown.hints') }}</div>
			</template>

			<div
				v-else
				class="sp-inline-ask__readonly"
				data-testid="inline-ask-readonly"
				role="note"
			>
				<div class="sp-inline-ask__readonly-note">
					{{ t('agent.chat.composer.inline.readOnlyNotice') }}
				</div>
				<ul class="sp-inline-ask__list sp-inline-ask__list--readonly">
					<li
						v-for="option in currentQuestion.options"
						:key="option.id"
						class="sp-inline-ask__option sp-inline-ask__option--readonly"
					>{{ option.label }}</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<style scoped>
.sp-inline-ask {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-inline-block-bg);
	outline: none;
}

.sp-inline-ask__title {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-inline-ask__tabs {
	display: flex;
	flex-wrap: wrap;
	gap: var(--sp-space-1);
}

.sp-inline-ask__tab {
	padding-inline: var(--sp-space-2);
	padding-block: var(--sp-space-1);
	border-radius: var(--sp-radius-sm);
	color: var(--sp-text-muted);
	cursor: pointer;
}

.sp-inline-ask__tab--active {
	background: var(--sp-ask-item-focused-bg);
	color: var(--sp-text-normal);
}

.sp-inline-ask__question {
	font-weight: var(--sp-font-weight-medium);
}

.sp-inline-ask__list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
}

.sp-inline-ask__option {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	padding: var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
	cursor: pointer;
}

.sp-inline-ask__option--focused {
	background: var(--sp-ask-item-focused-bg);
	border-inline-start: 2px solid var(--sp-ask-cursor);
}

.sp-inline-ask__option--readonly {
	cursor: default;
	color: var(--sp-text-muted);
}

.sp-inline-ask__option-desc {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-inline-ask__custom {
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding: var(--sp-space-2);
}

.sp-inline-ask__hints,
.sp-inline-ask__readonly-note {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
