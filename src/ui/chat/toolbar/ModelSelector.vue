<script setup lang="ts">
import { ref, computed, nextTick, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ModelWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The model selector (SPEC-TC-013, REQ-TC-010/011/012/040; P9 SPEC-PV-017,
 * REQ-PV-062). A grouped, keyboard-operable listbox. Presentational — props in,
 * events out. The button (`role="combobox"`) shows the selected model's label, or
 * the persisted id when it is not in the option list (empty-catalog degrade, EC-TC-3).
 * Opening (click OR Enter/Space, NOT hover-only — REQ-TC-040) renders `vm.options` as
 * a `role="listbox"` with `role="presentation"` group separators where `option.group`
 * differs; each option is `role="option"` `aria-selected`. Arrow up/down move
 * `aria-activedescendant`, Home/End jump, Enter/Space select → emit `pick`, Escape
 * closes + restores button focus.
 *
 * P9: the OPTIONAL `providerId` prop selects a per-provider picker variant from the
 * data-driven `PICKER_VARIANT` map (e.g. the `opencode-model-picker` shape) — a pure
 * lookup, never a provider-id branch (NFR-PV-014); a provider with no variant (or an
 * absent prop) renders byte-identical P6 (NFR-PV-001). No `obsidian`/`v-html`. Claudian
 * ground-truth: `ModelSelector.updateDisplay`/`renderOptions` + `opencode-model-picker.css`.
 */
const props = defineProps<{ vm: ModelWidgetVm; providerId?: ProviderId }>();
const emit = defineEmits<{ pick: [id: string] }>();

const { t } = useI18n();
const uid = useId();

/**
 * The per-provider picker `data-testid` variant (data-driven, REQ-PV-062). A provider
 * absent from the map keeps the plain P6 picker (no variant testid) — adding a variant
 * is a map entry, never a branch (NFR-PV-014, SPEC-PV-029).
 */
const PICKER_VARIANT: Partial<Record<ProviderId, string>> = {
	opencode: 'opencode-model-picker',
};

const pickerVariant = computed<string | undefined>(() =>
	props.providerId === undefined ? undefined : PICKER_VARIANT[props.providerId],
);

const open = ref(false);
const activeIndex = ref(0);
const button = ref<HTMLButtonElement | null>(null);

const options = computed(() => props.vm.options);

/** The display label for the selected model — falls back to the raw id (EC-TC-3). */
const buttonLabel = computed(() => {
	const id = props.vm.selectedId;
	if (id === undefined) return t('agent.chat.toolbar.model.label');
	const match = options.value.find((o) => o.id === id);
	return match?.label ?? id;
});

function optionId(index: number): string {
	return `${uid}-opt-${String(index)}`;
}

/** True when this option starts a new group (vs the previous option's group). */
function startsGroup(index: number): boolean {
	if (index === 0) return false;
	return options.value[index].group !== options.value[index - 1].group;
}

function indexOfSelected(): number {
	const id = props.vm.selectedId;
	const found = options.value.findIndex((o) => o.id === id);
	return found === -1 ? 0 : found;
}

function openList(): void {
	if (options.value.length === 0) {
		open.value = true;
		return;
	}
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
	emit('pick', options.value[index].id);
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
	<div
		class="sp-toolbar-model"
		:class="pickerVariant ? `sp-toolbar-model--${pickerVariant}` : undefined"
	>
		<span
			v-if="pickerVariant"
			:data-testid="pickerVariant"
			class="sp-toolbar-model__variant"
			aria-hidden="true"
		/>
		<button
			ref="button"
			type="button"
			class="sp-toolbar-model__button"
			data-testid="toolbar-model"
			role="combobox"
			aria-haspopup="listbox"
			:aria-expanded="open ? 'true' : 'false'"
			:aria-label="t('agent.chat.toolbar.model.open')"
			@click="onButtonClick"
			@keydown="onButtonKeydown"
		>
			<span class="sp-toolbar-model__label" dir="auto">{{ buttonLabel }}</span>
		</button>

		<ul
			v-if="open"
			class="sp-toolbar-model__list"
			role="listbox"
			:aria-activedescendant="options.length > 0 ? optionId(activeIndex) : undefined"
			tabindex="-1"
			@keydown="onListKeydown"
		>
			<li
				v-if="vm.emptyNotice || options.length === 0"
				class="sp-toolbar-model__empty"
				data-testid="toolbar-model-empty"
				role="presentation"
			>
				{{ t('agent.chat.toolbar.model.empty') }}
			</li>
			<template v-for="(option, index) in options" :key="option.id">
				<li
					v-if="startsGroup(index)"
					class="sp-toolbar-model__group"
					role="presentation"
					aria-hidden="true"
				>
					{{ option.group }}
				</li>
				<li
					:id="optionId(index)"
					class="sp-toolbar-model__option"
					:class="{ 'sp-toolbar-model__option--active': index === activeIndex }"
					data-testid="toolbar-model-option"
					role="option"
					:aria-selected="option.id === vm.selectedId ? 'true' : 'false'"
					@click="selectAt(index)"
				>
					<span dir="auto">{{ option.label }}</span>
				</li>
			</template>
		</ul>
	</div>
</template>

<style scoped>
.sp-toolbar-model {
	position: relative;
	display: inline-flex;
}

.sp-toolbar-model__button {
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

.sp-toolbar-model__list {
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

.sp-toolbar-model__group {
	padding: var(--sp-space-1) var(--sp-space-2);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-toolbar-model__option {
	padding: var(--sp-space-1) var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
	color: var(--sp-text-normal);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-toolbar-model__option--active {
	background: var(--sp-bg-secondary);
}

.sp-toolbar-model__option[aria-selected='true'] {
	font-weight: var(--sp-font-weight-semibold);
}

.sp-toolbar-model__empty {
	padding: var(--sp-space-1) var(--sp-space-2);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
