<script setup lang="ts">
/**
 * `ThreadTab.vue` — single tab in the multi-thread switcher strip.
 *
 * Owns the per-tab UI state (active highlight, inline rename, context-menu
 * trigger) and emits intent events to the parent `ThreadTabStrip.vue`. The
 * strip — not this component — owns the underlying `chatThreadsStore`
 * mutation so the tab stays a pure presentational unit and can be reused
 * by future surfaces (e.g. a command-palette thread picker).
 *
 * Keyboard model (NFR-MPS-009): the strip implements roving tabindex; this
 * component reads `tabIndex` from props (`-1` for non-focused tabs, `0` for
 * the one the strip currently focuses) and lets the strip own ArrowLeft /
 * ArrowRight / Home / End handling. Enter activation comes through the
 * regular click handler (browsers synthesise `click` on Enter for
 * `role="tab"`-bearing elements when focused).
 *
 * Satisfies REQ-MPS-018, REQ-MPS-020, REQ-MPS-022, REQ-MPS-023.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
	defineProps<{
		/** `ChatThreadRecord.threadId` of the represented thread. */
		threadId: string;
		/** Current title; `''` falls back to the localised "New thread" label. */
		title: string;
		/** Whether this tab represents the active thread. */
		active: boolean;
		/**
		 * Roving tabindex value supplied by `ThreadTabStrip.vue`. `0` for the
		 * tab the strip currently focuses, `-1` for the rest (NFR-MPS-009).
		 */
		tabIndex?: number;
	}>(),
	{ tabIndex: -1 },
);

const emit = defineEmits<{
	activate: [threadId: string];
	rename: [payload: { threadId: string; title: string }];
	'open-context-menu': [threadId: string];
}>();

const { t } = useI18n();

/** Whether the tab is currently in inline-rename mode (REQ-MPS-020). */
const renaming = ref(false);
/** Buffered input value while renaming; committed on Enter, dropped on Escape. */
const renameDraft = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

const displayedTitle = computed(() =>
	props.title === '' ? t('thread.defaultTitle') : props.title,
);

function handleClick(): void {
	// Suppress the activate emit while editing so a click inside the rename
	// input doesn't double-fire as both `input.click` and `tab.click` and
	// reset the rename buffer.
	if (renaming.value) return;
	emit('activate', props.threadId);
}

async function handleDblClickLabel(): Promise<void> {
	renameDraft.value = props.title;
	renaming.value = true;
	await nextTick();
	renameInputRef.value?.focus();
	renameInputRef.value?.select();
}

function commitRename(): void {
	const next = renameDraft.value.trim();
	if (next === '') {
		// Empty input is treated as a cancel — REQ-MPS-020 requires a title
		// payload; an empty string would create an indistinguishable tab.
		renaming.value = false;
		return;
	}
	emit('rename', { threadId: props.threadId, title: next });
	renaming.value = false;
}

function cancelRename(): void {
	renaming.value = false;
}

function onRenameKeydown(event: KeyboardEvent): void {
	if (event.key === 'Enter') {
		event.preventDefault();
		commitRename();
	} else if (event.key === 'Escape') {
		event.preventDefault();
		cancelRename();
	}
}

function onContextMenuButton(): void {
	emit('open-context-menu', props.threadId);
}

function onRightClick(event: MouseEvent): void {
	// Don't let the OS-level menu hijack the click — surface our own menu
	// via the parent so the modal-confirmation rules apply.
	event.preventDefault();
	emit('open-context-menu', props.threadId);
}

// Defensive: if the parent yanks active status mid-rename (e.g. user
// switched threads via keyboard), drop the rename buffer so the next
// focus-in starts clean.
watch(
	() => props.active,
	(isActive) => {
		if (!isActive) renaming.value = false;
	},
);
</script>

<template>
	<li
		role="tab"
		:aria-selected="active ? 'true' : 'false'"
		:tabindex="tabIndex"
		:data-testid="`thread-tab-${threadId}`"
		class="sp-thread-tab"
		:class="{ 'sp-thread-tab--active': active }"
		@click="handleClick"
		@contextmenu="onRightClick"
	>
		<span
			v-if="!renaming"
			:data-testid="`thread-tab-${threadId}-label`"
			class="sp-thread-tab__label"
			:title="displayedTitle"
			@dblclick.stop="handleDblClickLabel"
		>
			{{ displayedTitle }}
		</span>
		<input
			v-else
			ref="renameInputRef"
			v-model="renameDraft"
			type="text"
			:data-testid="`thread-tab-${threadId}-rename-input`"
			class="sp-thread-tab__rename-input"
			:aria-label="t('thread.renameInputAriaLabel')"
			@click.stop
			@keydown="onRenameKeydown"
			@blur="commitRename"
		/>
		<button
			v-if="!renaming"
			type="button"
			:data-testid="`thread-tab-${threadId}-context-menu`"
			class="sp-thread-tab__menu-btn"
			:aria-label="t('thread.action.rename')"
			@click.stop="onContextMenuButton"
		>
			⋯
		</button>
	</li>
</template>

<style scoped>
.sp-thread-tab {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.25rem 0.5rem;
	border-radius: 4px;
	background: var(--background-secondary);
	color: var(--text-muted);
	cursor: pointer;
	font-size: 0.8125rem;
	max-width: 12rem;
	transition: background-color 0.15s, color 0.15s;
}

.sp-thread-tab:hover {
	background: var(--background-modifier-active-hover);
}

.sp-thread-tab--active {
	color: var(--text-normal);
	border-bottom: 2px solid var(--text-accent);
}

.sp-thread-tab:focus-visible {
	outline: 2px solid var(--text-accent);
	outline-offset: 1px;
}

.sp-thread-tab__label {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-thread-tab__rename-input {
	flex: 1;
	font-size: 0.8125rem;
	background: var(--background-primary);
	color: var(--text-normal);
	border: 1px solid var(--background-modifier-border);
	border-radius: 3px;
	padding: 0 0.25rem;
	min-width: 0;
}

.sp-thread-tab__menu-btn {
	border: none;
	background: transparent;
	color: var(--text-muted);
	cursor: pointer;
	padding: 0 0.25rem;
	border-radius: 3px;
}

.sp-thread-tab__menu-btn:hover {
	background: var(--background-modifier-hover);
	color: var(--text-normal);
}
</style>
