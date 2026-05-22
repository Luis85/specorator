<script setup lang="ts">
/**
 * Floating palette anchored under `ChatInput`'s textarea (PR-ASV-3, D-ASV-2).
 * Renders the matched `SlashCommand` list with keyboard navigation hooks and
 * ARIA listbox semantics. The component is purely presentational: it does NOT
 * own the open/close state nor the trigger detection — those live in
 * `useSlashPalette` (state) and `ChatInput.vue` (textarea integration).
 *
 * Visual reference: Claudian's `SlashCommandDropdown.ts`
 * (https://github.com/YishenTu/claudian) rendered with Vue 3 SFCs instead of
 * imperative DOM (ADR-003). No `obsidian` import — composes with the narrow
 * ports (ADR-008).
 *
 * WS-AUX-8c: visual chrome (backdrop-blur, drop-up positioning, tokenised
 * surface) is delegated to `<SpDropdownPanel>`. The textarea retains focus
 * via `:auto-focus="false"` so typing-to-filter and arrow-key navigation
 * keep working while the dropdown is open.
 */
import type { SlashCommand } from '@/domain/chat/SlashCommand';
import SpDropdownPanel from '@/ui/components/primitives/SpDropdownPanel.vue';

const props = defineProps<{
	/** Matched commands to render. Empty array = "no matches" placeholder. */
	commands: readonly SlashCommand[];
	/** Index of the highlighted command. `-1` when empty. */
	selectedIndex: number;
}>();

const emit = defineEmits<{
	/**
	 * Emitted when the user clicks an entry or hovers over it. The parent is
	 * expected to dispatch the action AND close the palette (the dropdown does
	 * not own state — see `useSlashPalette`).
	 */
	select: [command: SlashCommand];
	/** Emitted when the user mouses over an entry; parent updates the highlight. */
	highlight: [index: number];
	/** Emitted when SpDropdownPanel requests close (Esc, outside click). */
	close: [];
}>();

function handleClick(command: SlashCommand): void {
	emit('select', command);
}

function handleMouseEnter(index: number): void {
	emit('highlight', index);
}

function isSelected(index: number): boolean {
	return index === props.selectedIndex;
}

function sourceLabel(command: SlashCommand): string | null {
	if (command.kind === 'vault-command') return 'command';
	if (command.kind === 'vault-skill') return 'skill';
	return null;
}

function handlePanelClose(): void {
	emit('close');
}
</script>

<template>
	<!--
		WP-7 A11y #3: the listbox now exposes a deterministic `id` (referenced
		by `ChatInput`'s textarea via `aria-controls`) and each option exposes
		`id="slash-command-item-${name}"` so the textarea can bind
		`aria-activedescendant` to the highlighted entry. SRs announce
		"<option name>, listbox" as the user arrows.
	-->
	<SpDropdownPanel
		:open="true"
		anchor-mode="dropup"
		:auto-focus="false"
		:ariaLabel="'Slash commands'"
		@close="handlePanelClose"
	>
		<div
			id="slash-command-dropdown"
			class="sp-slash-dropdown"
			role="listbox"
			aria-label="Slash commands"
			data-testid="slash-command-dropdown"
		>
			<p
				v-if="commands.length === 0"
				class="sp-slash-dropdown__empty"
				data-testid="slash-command-empty"
			>
				No matching commands
			</p>
			<ul v-else class="sp-slash-dropdown__list" data-testid="slash-command-list">
				<li
					v-for="(command, index) in commands"
					:id="`slash-command-item-${index}`"
					:key="command.name"
					class="sp-slash-dropdown__item"
					:class="{ 'sp-slash-dropdown__item--selected': isSelected(index) }"
					role="option"
					:aria-selected="isSelected(index)"
					:data-testid="`slash-command-item-${command.name}`"
					@mousedown.prevent="handleClick(command)"
					@mouseenter="handleMouseEnter(index)"
				>
					<span class="sp-slash-dropdown__name" data-testid="slash-command-name">
						/{{ command.name }}
						<span
							v-if="sourceLabel(command) !== null"
							class="sp-slash-dropdown__source"
							:data-testid="`slash-command-source-${command.name}`"
						>
							({{ sourceLabel(command) }})
						</span>
					</span>
					<span class="sp-slash-dropdown__description" data-testid="slash-command-description">
						{{ command.description
						}}<template v-if="command.argumentHint">
							<span
								class="sp-slash-dropdown__hint"
								:data-testid="`slash-command-hint-${command.name}`"
								>{{ command.argumentHint }}</span
							></template
						>
					</span>
				</li>
			</ul>
		</div>
	</SpDropdownPanel>
</template>

<style scoped>
.sp-slash-dropdown__list {
	list-style: none;
	margin: 0;
	padding-block: var(--sp-space-1);
	padding-inline: 0;
}

.sp-slash-dropdown__item {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	cursor: pointer;
	transition: background-color 0.1s;
	border-radius: var(--sp-radius-sm);
}

.sp-slash-dropdown__item--selected {
	background: var(--sp-interactive-hover);
}

.sp-slash-dropdown__name {
	font-family: var(--sp-font-monospace, var(--font-monospace, monospace));
	font-size: var(--sp-font-size-sm);
	font-weight: 600;
	color: var(--sp-text-normal);
}

.sp-slash-dropdown__source {
	margin-inline-start: var(--sp-space-1);
	font-size: var(--sp-font-size-xs);
	font-weight: 400;
	color: var(--sp-text-muted);
}

.sp-slash-dropdown__hint {
	color: var(--sp-text-faint, var(--sp-text-muted));
	font-style: italic;
	margin-inline-start: var(--sp-space-1);
}

.sp-slash-dropdown__description {
	font-size: var(--sp-font-size-xs);
	color: var(--sp-text-muted);
}

.sp-slash-dropdown__empty {
	margin: 0;
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
	font-style: italic;
}
</style>
