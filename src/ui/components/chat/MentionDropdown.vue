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
 *
 * WS-AUX-8c: visual chrome (backdrop-blur, drop-up positioning, tokenised
 * surface) is delegated to `<SpDropdownPanel>`. `auto-focus="false"` keeps
 * focus on the textarea so the user can keep typing-to-filter while the
 * picker is open.
 */
import type { MentionCandidate } from '@/application/chat/vaultFileSearch'
import SpDropdownPanel from '@/ui/components/primitives/SpDropdownPanel.vue'

defineProps<{
	results: readonly MentionCandidate[]
	selectedIndex: number
}>()

const emit = defineEmits<{
	select: [candidate: MentionCandidate]
	hover: [index: number]
	/** Emitted when SpDropdownPanel requests close (Esc, outside click). */
	close: []
}>()

function handlePanelClose(): void {
	emit('close')
}
</script>

<template>
	<SpDropdownPanel
		v-if="results.length > 0"
		:open="true"
		anchor-mode="dropup"
		:auto-focus="false"
		:ariaLabel="'File mentions'"
		@close="handlePanelClose"
	>
		<ul
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
	</SpDropdownPanel>
</template>

<style scoped>
.sp-mention-dropdown {
	list-style: none;
	margin: 0;
	padding-block: var(--sp-space-1);
	padding-inline: 0;
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
}

.sp-mention-dropdown__item {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	cursor: pointer;
	color: var(--sp-text-normal);
	border-radius: var(--sp-radius-sm);
}

.sp-mention-dropdown__item--selected,
.sp-mention-dropdown__item:hover {
	background: var(--sp-interactive-hover);
}

.sp-mention-dropdown__name {
	font-weight: 600;
}

.sp-mention-dropdown__path {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-xs);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
</style>
