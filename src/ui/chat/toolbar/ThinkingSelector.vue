<script setup lang="ts">
import { ref, computed, nextTick, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ThinkingWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ReasoningChoice } from '@/domain/chat/Reasoning';

/**
 * The thinking selector (SPEC-TC-016, REQ-TC-017/018/040). An effort/budget
 * keyboard listbox with the SAME a11y contract as `ModelSelector`. Presentational
 * — props in, events out. Rendered only on a `visible` slice (the strip gates it;
 * the component guards a `hidden` slice). The button shows the current choice:
 * effort → `effortLabel` + the localised level (High/Medium/Low); token-budget →
 * `budgetLabel` + the token amount. Opening (click OR Enter/Space, NOT hover-only)
 * lists `vm.options`; selecting emits `set(choice)`. No `obsidian`/`v-html`.
 * Claudian ground-truth: `ThinkingBudgetSelector`.
 */
const props = defineProps<{ vm: ThinkingWidgetVm }>();
const emit = defineEmits<{ set: [choice: ReasoningChoice] }>();

const { t } = useI18n();
const uid = useId();

const open = ref(false);
const activeIndex = ref(0);
const button = ref<HTMLButtonElement | null>(null);

const visible = computed(() => props.vm.visibility.kind === 'visible');
const options = computed(() => props.vm.options);

/** A human label for one reasoning choice (REQ-TC-017). */
function choiceLabel(choice: ReasoningChoice): string {
	if (choice.kind === 'effort') {
		return `${t('agent.chat.toolbar.thinking.effortLabel')}: ${t(`agent.chat.toolbar.thinking.effort.${choice.value}`)}`;
	}
	return `${t('agent.chat.toolbar.thinking.budgetLabel')}: ${String(choice.tokens)}`;
}

/** A stable key for the `v-for` (the effort token or the budget amount). */
function choiceKey(choice: ReasoningChoice): string {
	return choice.kind === 'effort' ? `effort:${choice.value}` : `budget:${String(choice.tokens)}`;
}

const buttonLabel = computed(() =>
	props.vm.selected === undefined
		? t('agent.chat.toolbar.thinking.label')
		: choiceLabel(props.vm.selected),
);

function optionId(index: number): string {
	return `${uid}-opt-${String(index)}`;
}

function indexOfSelected(): number {
	const selected = props.vm.selected;
	if (selected === undefined) return 0;
	const key = choiceKey(selected);
	const found = options.value.findIndex((o) => choiceKey(o) === key);
	return found === -1 ? 0 : found;
}

function openList(): void {
	activeIndex.value = indexOfSelected();
	open.value = true;
}

function closeList(restoreFocus: boolean): void {
	open.value = false;
	if (restoreFocus) void nextTick(() => button.value?.focus());
}

function onButtonClick(): void {
	if (open.value) closeList(false);
	else openList();
}

function onButtonKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
		event.preventDefault();
		openList();
	}
}

function selectAt(index: number): void {
	if (index < 0 || index >= options.value.length) return;
	emit('set', options.value[index]);
	closeList(true);
}

function onListKeydown(event: KeyboardEvent): void {
	const last = options.value.length - 1;
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			activeIndex.value = Math.min(activeIndex.value + 1, last);
			break;
		case 'ArrowUp':
			event.preventDefault();
			activeIndex.value = Math.max(activeIndex.value - 1, 0);
			break;
		case 'Home':
			event.preventDefault();
			activeIndex.value = 0;
			break;
		case 'End':
			event.preventDefault();
			activeIndex.value = last;
			break;
		case 'Enter':
		case ' ':
			event.preventDefault();
			selectAt(activeIndex.value);
			break;
		case 'Escape':
			event.preventDefault();
			closeList(true);
			break;
		default:
			break;
	}
}
</script>

<template>
	<div v-if="visible" class="sp-toolbar-thinking">
		<button
			ref="button"
			type="button"
			class="sp-toolbar-thinking__button"
			data-testid="toolbar-thinking"
			role="combobox"
			aria-haspopup="listbox"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-label="t('agent.chat.toolbar.thinking.open')"
			@click="onButtonClick"
			@keydown="onButtonKeydown"
		>
			<span dir="auto">{{ buttonLabel }}</span>
		</button>

		<ul
			v-if="open"
			class="sp-toolbar-thinking__list"
			role="listbox"
			:aria-activedescendant="optionId(activeIndex)"
			tabindex="-1"
			@keydown="onListKeydown"
		>
			<li
				v-for="(option, index) in options"
				:id="optionId(index)"
				:key="choiceKey(option)"
				class="sp-toolbar-thinking__option"
				:class="{ 'sp-toolbar-thinking__option--active': index === activeIndex }"
				data-testid="toolbar-thinking-option"
				role="option"
				:aria-selected="
					vm.selected !== undefined && choiceKey(option) === choiceKey(vm.selected) ? 'true' : 'false'
				"
				@click="selectAt(index)"
			>
				<span dir="auto">{{ choiceLabel(option) }}</span>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.sp-toolbar-thinking {
	position: relative;
	display: inline-flex;
}

.sp-toolbar-thinking__button {
	display: inline-flex;
	align-items: center;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-toolbar-thinking__list {
	position: absolute;
	inset-block-end: calc(var(--sp-toolbar-widget-h) + var(--sp-space-1));
	inset-inline-start: 0;
	z-index: var(--sp-z-dropdown);
	margin: 0;
	padding: var(--sp-space-1);
	list-style: none;
	min-inline-size: 12ch;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-surface-overlay);
	box-shadow: var(--sp-shadow-dropup);
}

.sp-toolbar-thinking__option {
	padding: var(--sp-space-1) var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
	color: var(--sp-text-normal);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-toolbar-thinking__option--active {
	background: var(--sp-bg-secondary);
}

.sp-toolbar-thinking__option[aria-selected='true'] {
	font-weight: var(--sp-font-weight-semibold);
}
</style>
