<script setup lang="ts">
/**
 * Floating listbox that surfaces the `@`-mention search results beneath
 * `ChatInput`'s textarea (PR-ASV-4 / D-ASV-3). Stateless — receives the
 * candidate array and selected index from `useMentionPicker`; emits
 * `select` (mouse) and `hover` (mouse-over) back to the consumer. Keyboard
 * navigation is handled by `ChatInput.handleKeydown` because the textarea
 * keeps focus while the dropdown is open.
 *
 * ARIA: `role="listbox"` on the container, `role="option"` + `aria-
 * selected` per entry, matching the WAI-ARIA combobox pattern.
 */
import type { MentionCandidate } from '@/application/chat/vaultFileSearch'

defineProps<{
	results: readonly MentionCandidate[]
	selectedIndex: number
}>()

const emit = defineEmits<{
	select: [candidate: MentionCandidate]
	hover: [index: number]
}>()
</script>

<template>
	<ul
		v-if="results.length > 0"
		class="sp-mention-dropdown"
		role="listbox"
		aria-label="File mentions"
		data-testid="mention-dropdown"
	>
		<!--
			WP-7 A11y #3: per-option `id` exposed so `ChatInput`'s textarea can
			set `aria-activedescendant="mention-item-${index}"` on the highlighted
			row. Index-based ids dedupe basename-collisions (`specs/a/idea.md` +
			`specs/b/idea.md`) that a path-suffixed id would expose to the SR as
			two identical ids.
		-->
		<li
			v-for="(candidate, index) in results"
			:id="`mention-item-${index}`"
			:key="`${candidate.kind}:${candidate.path}`"
			class="sp-mention-dropdown__item"
			:class="{ 'sp-mention-dropdown__item--selected': index === selectedIndex }"
			role="option"
			:aria-selected="index === selectedIndex"
			:data-testid="`mention-option-${index}`"
			:data-kind="candidate.kind"
			@mousedown.prevent="emit('select', candidate)"
			@mouseenter="emit('hover', index)"
		>
			<span class="sp-mention-dropdown__name">
				<span v-if="candidate.kind === 'folder'" aria-hidden="true">📁 </span>
				<!-- PR-ASV-4-folders: folders render with a trailing slash so the
					user can distinguish e.g. `notes.md` (file) from `notes/`
					(folder) at a glance, mirroring the inline-token suffix
					inserted by `ChatInput.commitMention`. -->
				{{ candidate.kind === 'folder' ? `${candidate.name}/` : candidate.name }}
			</span>
			<span class="sp-mention-dropdown__path">{{ candidate.path }}</span>
		</li>
	</ul>
</template>

<style scoped>
.sp-mention-dropdown {
	list-style: none;
	margin: 0;
	padding: 0.25rem 0;
	border: 1px solid var(--background-modifier-border);
	border-radius: 6px;
	background: var(--background-primary);
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	max-height: 16rem;
	overflow-y: auto;
	font-family: var(--font-text);
	font-size: 0.8125rem;
}

.sp-mention-dropdown__item {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	padding: 0.3rem 0.75rem;
	cursor: pointer;
	color: var(--text-normal);
}

.sp-mention-dropdown__item--selected,
.sp-mention-dropdown__item:hover {
	background: var(--background-modifier-hover);
}

.sp-mention-dropdown__name {
	font-weight: 600;
}

.sp-mention-dropdown__path {
	color: var(--text-muted);
	font-size: 0.75rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
