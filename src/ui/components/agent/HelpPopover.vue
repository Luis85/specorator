<script setup lang="ts">
/**
 * `HelpPopover.vue` — searchable, keyboard-navigable command palette
 * (WS-AUX-8b, T-AUX-313..318). Replaces the static `/help` list rendered
 * inline by `AgentSidepanelRoot.vue` with a Claudian-parity popover:
 *
 *   - search input filters items by case-insensitive `query.includes`,
 *   - Arrow Up / Down move the active item within the filtered list,
 *   - Enter emits `select(id)` with the active item id,
 *   - Esc emits `close()`,
 *   - a polite live region announces the result count for screen readers.
 *
 * Pure UI: items are passed in by the host so the component stays decoupled
 * from `SlashCommand` typing. The host translates `select(id)` into the
 * matching action (e.g. via `BUILT_IN_SLASH_COMMANDS`).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

interface HelpPopoverItem {
	readonly id: string
	readonly label: string
	readonly shortcut?: string
}

const props = defineProps<{
	items: readonly HelpPopoverItem[]
}>()

const emit = defineEmits<{
	select: [id: string]
	close: []
}>()

defineOptions({ name: 'HelpPopover', inheritAttrs: false })

const { t } = useI18n()

const query = ref('')
const activeIdx = ref(0)
const searchInputEl = ref<HTMLInputElement | null>(null)

const filtered = computed<readonly HelpPopoverItem[]>(() => {
	const q = query.value.trim().toLowerCase()
	if (q.length === 0) return props.items
	return props.items.filter((it) => it.label.toLowerCase().includes(q))
})

watch(filtered, () => {
	// Clamp the active index when the filtered set shrinks so the cursor
	// never points past the last visible row.
	if (activeIdx.value >= filtered.value.length) {
		activeIdx.value = Math.max(0, filtered.value.length - 1)
	}
})

function onKey(event: KeyboardEvent): void {
	if (event.key === 'ArrowDown') {
		event.preventDefault()
		if (filtered.value.length === 0) return
		activeIdx.value = (activeIdx.value + 1) % filtered.value.length
	} else if (event.key === 'ArrowUp') {
		event.preventDefault()
		if (filtered.value.length === 0) return
		activeIdx.value =
			(activeIdx.value - 1 + filtered.value.length) % filtered.value.length
	} else if (event.key === 'Enter') {
		event.preventDefault()
		const target = filtered.value[activeIdx.value]
		if (target !== undefined) emit('select', target.id)
	} else if (event.key === 'Escape') {
		event.preventDefault()
		emit('close')
	}
}

onMounted(async () => {
	await nextTick()
	searchInputEl.value?.focus()
})
</script>

<template>
	<div
		class="sp-help-popover"
		role="dialog"
		:aria-label="t('agent.help.openAriaLabel')"
		data-testid="help-popover"
	>
		<input
			ref="searchInputEl"
			v-model="query"
			class="sp-help-popover__search"
			type="text"
			:placeholder="t('agent.help.search.placeholder')"
			:aria-label="t('agent.help.search.placeholder')"
			data-testid="help-search"
			@keydown="onKey"
		/>
		<ul class="sp-help-popover__list" role="listbox" data-testid="help-list">
			<li
				v-for="(item, i) in filtered"
				:key="item.id"
				role="option"
				class="sp-help-popover__item"
				data-testid="help-item"
				:data-active="i === activeIdx ? 'true' : 'false'"
				:aria-selected="i === activeIdx ? 'true' : 'false'"
				@mouseenter="activeIdx = i"
				@click="emit('select', item.id)"
			>
				<span class="sp-help-popover__label">{{ item.label }}</span>
				<span v-if="item.shortcut" class="sp-help-popover__hint">{{ item.shortcut }}</span>
			</li>
		</ul>
		<div
			aria-live="polite"
			class="sp-sr-only"
			data-testid="help-announce"
		>
			{{ t('agent.help.results.count', { count: filtered.length }) }}
		</div>
	</div>
</template>

<style scoped>
.sp-help-popover {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary-alt, var(--sp-bg-secondary));
	backdrop-filter: blur(20px);
	-webkit-backdrop-filter: blur(20px);
	box-shadow: var(--sp-shadow-popover, 0 8px 24px rgba(0, 0, 0, 0.2));
	max-block-size: 60vh;
	overflow: hidden;
}

.sp-help-popover__search {
	inline-size: 100%;
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
}

.sp-help-popover__search:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}

.sp-help-popover__list {
	margin: 0;
	padding-inline-start: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	overflow-y: auto;
	min-block-size: 0;
}

.sp-help-popover__item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--sp-space-2);
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	border-radius: var(--sp-radius-sm);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-help-popover__item[data-active='true'] {
	background: var(--sp-bg-primary);
	color: var(--sp-text-accent, var(--sp-text-normal));
}

.sp-help-popover__hint {
	color: var(--sp-text-muted);
	font-family: var(--sp-font-monospace, var(--sp-font-text));
	font-size: var(--sp-font-size-xs);
}

.sp-sr-only {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}
</style>
