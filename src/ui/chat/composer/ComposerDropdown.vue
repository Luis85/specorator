<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PaletteEntry } from '@/ui/chat/composer/useComposerMode';
import type { CatalogEntry, MentionReferent } from '@/domain/ports';
import MentionRow from '@/ui/chat/composer/MentionRow.vue';

/**
 * The shared drop-UP palette for slash / skills / mention (SPEC-CP-020). One
 * component; the row content varies by `mode`. WCAG 2.2 AA combobox/listbox
 * (SPEC-CP-037): the palette is `role="listbox"`, rows are `role="option"` with
 * `aria-selected`; the listbox advertises the highlighted option's id via
 * `aria-activedescendant` (the TEXTAREA — owned by `ChatComposer` — mirrors it +
 * keeps DOM focus, so the user types the filter). Navigation moves the highlight,
 * never DOM focus. Names / paths / descriptions are `{{ }}` text — NO `v-html`
 * (NFR-CP-003, EC-CP-13). The keyboard is driven through the exposed
 * `handleKeydown` (the composer forwards the textarea keydown); it returns `true`
 * when it consumed the event so the composer suppresses the P1 send.
 */
const props = defineProps<{
	entries: PaletteEntry[];
	mode: 'slash' | 'skills' | 'mention';
}>();

const emit = defineEmits<{ confirm: [index: number]; close: [] }>();

const { t } = useI18n();

const activeIndex = ref(0);

// A per-instance id base so option ids are unique across multiple mounts.
const uid = `composer-dropdown-${Math.random().toString(36).slice(2, 8)}`;
const listboxId = `${uid}-listbox`;
const hintsId = `${uid}-hints`;

function optionDomId(i: number): string {
	return `${uid}-option-${i}`;
}

// Keep the highlight in range when the entry list changes (filter/req-guard).
watch(
	() => props.entries.length,
	(len) => {
		if (activeIndex.value >= len) activeIndex.value = Math.max(0, len - 1);
	},
);

const activeDescendant = computed(() =>
	props.entries.length > 0 ? optionDomId(activeIndex.value) : undefined,
);

const isMention = computed(() => props.mode === 'mention');

/** The slash/skills display label: the prefix + the command/skill name (EC-CP-11). */
function commandLabel(entry: CatalogEntry): string {
	return `${entry.prefix}${entry.name}`;
}

function isMentionEntry(entry: PaletteEntry): entry is MentionReferent {
	return 'mentionText' in entry;
}

function move(delta: number): void {
	const len = props.entries.length;
	if (len === 0) return;
	activeIndex.value = (activeIndex.value + delta + len) % len;
}

function confirmActive(): void {
	if (props.entries.length === 0) return;
	emit('confirm', activeIndex.value);
}

/** Mouse selection: `mousedown` (not `click`) so the textarea never loses focus. */
function onOptionMousedown(i: number, event: MouseEvent): void {
	event.preventDefault();
	activeIndex.value = i;
	emit('confirm', i);
}

/**
 * Returns `true` when the event was consumed (the composer then suppresses the
 * P1 send / newline). Arrow Up/Down move the highlight; Enter or Tab confirm
 * (REQ-CP-005); Escape closes text-unchanged (REQ-CP-008). IME-Enter is not a
 * confirm (mirrors the P1 send contract).
 */
function handleKeydown(event: KeyboardEvent): boolean {
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			move(1);
			return true;
		case 'ArrowUp':
			event.preventDefault();
			move(-1);
			return true;
		case 'Enter':
			if (event.isComposing) return false;
			event.preventDefault();
			confirmActive();
			return true;
		case 'Tab':
			event.preventDefault();
			confirmActive();
			return true;
		case 'Escape':
			event.preventDefault();
			emit('close');
			return true;
		default:
			return false;
	}
}

defineExpose({ handleKeydown });
</script>

<template>
	<div class="sp-composer-dropdown">
		<ul
			:id="listboxId"
			class="sp-composer-dropdown__list"
			data-testid="composer-dropdown"
			role="listbox"
			:aria-activedescendant="activeDescendant"
			:aria-describedby="hintsId"
		>
			<li
				v-for="(entry, i) in entries"
				:id="optionDomId(i)"
				:key="optionDomId(i)"
				class="sp-composer-dropdown__option"
				:class="{ 'sp-composer-dropdown__option--active': i === activeIndex }"
				:data-testid="`composer-dropdown-option-${i}`"
				role="option"
				:aria-selected="i === activeIndex ? 'true' : 'false'"
				@mousedown="onOptionMousedown(i, $event)"
				@mouseenter="activeIndex = i"
			>
				<MentionRow v-if="isMention && isMentionEntry(entry)" :referent="entry" />
				<span v-else-if="!isMentionEntry(entry)" class="sp-composer-dropdown__command">
					<span class="sp-composer-dropdown__command-name">{{ commandLabel(entry) }}</span>
					<span
						v-if="entry.description !== undefined && entry.description !== ''"
						class="sp-composer-dropdown__command-desc"
					>{{ entry.description }}</span>
				</span>
			</li>
		</ul>
		<div
			v-if="entries.length === 0 && isMention"
			class="sp-composer-dropdown__empty"
			data-testid="composer-dropdown-empty"
			role="note"
		>
			{{ t('agent.chat.composer.mention.empty') }}
		</div>
		<div :id="hintsId" class="sp-composer-dropdown__hints" data-testid="composer-dropdown-hints">
			{{ t('agent.chat.composer.dropdown.hints') }}
		</div>
	</div>
</template>

<style scoped>
.sp-composer-dropdown {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-primary);
	box-shadow: var(--sp-dropdown-shadow);
	max-block-size: var(--sp-dropdown-max-h);
	overflow: hidden;
}

.sp-composer-dropdown__list {
	list-style: none;
	margin: 0;
	padding: var(--sp-space-1);
	overflow-y: auto;
	min-block-size: 0;
}

.sp-composer-dropdown__option {
	display: flex;
	align-items: center;
	padding: var(--sp-space-2);
	border-radius: var(--sp-radius-sm);
	cursor: pointer;
}

.sp-composer-dropdown__option--active {
	background: var(--sp-option-selected-bg);
}

.sp-composer-dropdown__command {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	min-inline-size: 0;
}

.sp-composer-dropdown__command-desc {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-composer-dropdown__empty {
	padding: var(--sp-space-2);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-composer-dropdown__hints {
	padding: var(--sp-space-1) var(--sp-space-2);
	border-block-start: 1px solid var(--sp-border);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}
</style>
