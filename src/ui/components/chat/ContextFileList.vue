<script setup lang="ts">
/**
 * Context-file chip list rendered above the chat input. Manages a
 * visible-prefix + `+N more` overflow chip (UX #14, WP-8) so chips never
 * clip silently at narrow widths.
 *
 * Internationalised user-facing strings live in `chat.contextLabel`,
 * `chat.contextEmpty`, and `chat.contextOverflow` (UX #18, WP-8).
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContextFileEntry } from '@/ui/stores/messagesStore'
import ContextFileChip from './ContextFileChip.vue'

const props = defineProps<{
	files: ReadonlyArray<ContextFileEntry>
	disabled: boolean
}>()

const emit = defineEmits<{
	remove: [{ path: string }]
}>()

const { t } = useI18n()

/**
 * Cap how many chips render inline before the overflow chip takes over.
 * Six fits comfortably on a narrow sidepanel at the smallest realistic
 * width; remaining chips appear under the popover. The cap is internal,
 * not a prop, because the auto-collapse rule is a design decision rather
 * than a per-call concern.
 */
const VISIBLE_CHIP_LIMIT = 6

const overflowOpen = ref(false)

const visibleFiles = computed<readonly ContextFileEntry[]>(() => {
	if (props.files.length <= VISIBLE_CHIP_LIMIT) return props.files
	return props.files.slice(0, VISIBLE_CHIP_LIMIT)
})

const overflowFiles = computed<readonly ContextFileEntry[]>(() => {
	if (props.files.length <= VISIBLE_CHIP_LIMIT) return []
	return props.files.slice(VISIBLE_CHIP_LIMIT)
})

const hasOverflow = computed<boolean>(() => overflowFiles.value.length > 0)

function toggleOverflow(): void {
	overflowOpen.value = !overflowOpen.value
}

function handleOverflowBlur(event: FocusEvent): void {
	// Close when focus leaves the overflow region entirely (allow internal
	// focus moves between the trigger and the popover).
	const next = event.relatedTarget as Node | null
	const wrapper = event.currentTarget as HTMLElement | null
	if (wrapper !== null && next !== null && wrapper.contains(next)) return
	overflowOpen.value = false
}
</script>

<template>
	<section :aria-label="t('chat.contextLabel')" data-testid="context-file-list">
		<ul role="list" class="sp-chat__context-chips" :aria-label="t('chat.contextLabel')">
			<li v-for="file in visibleFiles" :key="file.path" role="listitem">
				<ContextFileChip
					:file="file"
					:disabled="disabled"
					@remove="emit('remove', { path: file.path })"
				/>
			</li>
			<li
				v-if="hasOverflow"
				role="listitem"
				class="sp-chat__context-overflow"
				@focusout="handleOverflowBlur"
			>
				<button
					type="button"
					class="sp-chat__chip sp-chat__chip--overflow"
					data-testid="context-chip-overflow"
					:aria-label="t('chat.contextOverflowAriaLabel', { count: overflowFiles.length })"
					:aria-expanded="overflowOpen"
					aria-haspopup="true"
					@click="toggleOverflow"
				>
					{{ t('chat.contextOverflow', { count: overflowFiles.length }) }}
				</button>
				<div
					v-if="overflowOpen"
					class="sp-chat__context-overflow-popover"
					data-testid="context-overflow-popover"
					role="list"
				>
					<div
						v-for="file in overflowFiles"
						:key="file.path"
						role="listitem"
						class="sp-chat__context-overflow-item"
					>
						<ContextFileChip
							:file="file"
							:disabled="disabled"
							@remove="emit('remove', { path: file.path })"
						/>
					</div>
				</div>
			</li>
		</ul>
		<p
			v-if="files.length === 0"
			class="sp-chat__context-empty"
			data-testid="context-file-empty"
		>
			{{ t('chat.contextEmpty') }}
		</p>
	</section>
</template>

<style scoped>
.sp-chat__context-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.375rem;
	list-style: none;
	margin: 0;
	padding: 0;
	min-width: 0;
}

.sp-chat__context-empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--text-muted);
}

.sp-chat__context-overflow {
	position: relative;
	display: inline-flex;
}

/*
 * UX #14 (WP-8): overflow chip mirrors the manual-chip chrome so the row
 * reads as a single uniform set; the popover floats below it without
 * pushing the input area.
 */
.sp-chat__chip--overflow {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	border-radius: 9999px;
	padding: 0.1rem 0.5rem;
	font-size: 0.8125rem;
	font-family: var(--font-text);
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	color: var(--text-normal);
	cursor: pointer;
}

.sp-chat__chip--overflow:hover,
.sp-chat__chip--overflow:focus {
	background: var(--interactive-hover);
}

.sp-chat__context-overflow-popover {
	position: absolute;
	top: calc(100% + 0.25rem);
	left: 0;
	z-index: 5;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 0.375rem;
	border-radius: 6px;
	background: var(--background-primary);
	border: 1px solid var(--background-modifier-border);
	box-shadow: var(--shadow-s, 0 4px 12px rgba(0, 0, 0, 0.15));
	min-width: 14rem;
	max-width: 22rem;
}
</style>
