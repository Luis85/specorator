<script setup lang="ts">
/**
 * `ThreadHistoryMenu.vue` — drop-up menu surfacing the user's saved
 * conversation threads (WS-AUX-9, T-AUX-333, spec §1.4).
 *
 * Reads from `chatThreadsStore` (ordered by `lastUsedAt` desc) and renders
 * each thread row inside an `.sp-hover-host` wrapper so the `<HoverActions>`
 * primitive can reveal the rename / delete icons on hover or keyboard focus
 * (ADR-AUX-003). The active row gets a 2px inline-start accent border via
 * the `data-active` selector.
 *
 * The menu is presentational: rename + delete actions emit upward so the
 * host (`AgentSidepanelRoot.vue` via `ThreadTabStrip`) can drive the store
 * mutation + ConfirmModalPort + VaultPort.deleteFile side effects.
 *
 * Microcopy lives under `agent.history.*` (en/de locales).
 */
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore'
import SpDropdownPanel from '@/ui/components/primitives/SpDropdownPanel.vue'
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'
import HoverActions from '@/ui/components/primitives/HoverActions.vue'

interface ThreadHistoryMenuProps {
	open: boolean
}

defineProps<ThreadHistoryMenuProps>()

const emit = defineEmits<{
	close: []
	select: [threadId: string]
	rename: [payload: { threadId: string; title: string }]
	delete: [threadId: string]
}>()

defineOptions({ name: 'ThreadHistoryMenu' })

const { t } = useI18n()
const threadsStore = useChatThreadsStore()

/** Threads ordered by `lastUsedAt` descending — most-recent first (spec §1.4). */
const orderedThreads = computed(() => {
	const arr = Array.from(threadsStore.chatThreads.values())
	arr.sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1))
	return arr
})

const renamingThreadId = ref<string | null>(null)
const renameDraft = ref<string>('')

async function startRename(threadId: string, currentTitle: string): Promise<void> {
	renamingThreadId.value = threadId
	renameDraft.value = currentTitle
	await nextTick()
	const el = document.querySelector<HTMLInputElement>(
		'[data-testid="thread-history-rename-input"]',
	)
	el?.focus()
	el?.select()
}

function commitRename(): void {
	const id = renamingThreadId.value
	if (id === null) return
	const title = renameDraft.value.trim()
	if (title.length > 0) {
		emit('rename', { threadId: id, title })
	}
	renamingThreadId.value = null
}

function cancelRename(): void {
	renamingThreadId.value = null
}

function onRenameKey(ev: KeyboardEvent): void {
	if (ev.key === 'Enter') {
		ev.preventDefault()
		commitRename()
	} else if (ev.key === 'Escape') {
		ev.preventDefault()
		cancelRename()
	}
}

function handleSelect(threadId: string): void {
	if (renamingThreadId.value === threadId) return
	emit('select', threadId)
}

function handleDelete(threadId: string): void {
	emit('delete', threadId)
}
</script>

<template>
	<SpDropdownPanel
		:open="open"
		anchor-mode="dropup"
		:ariaLabel="t('agent.history.open')"
		:auto-focus="true"
		@close="emit('close')"
	>
		<div class="sp-thread-history" data-testid="thread-history-menu">
			<h3 class="sp-thread-history__title">{{ t('agent.history.sectionTitle') }}</h3>
			<p
				v-if="orderedThreads.length === 0"
				class="sp-thread-history__empty"
				data-testid="thread-history-empty"
			>
				{{ t('agent.history.empty') }}
			</p>
			<ul
				v-else
				class="sp-thread-history__list"
				role="listbox"
				data-testid="thread-history-list"
			>
				<li
					v-for="thread in orderedThreads"
					:key="thread.threadId"
					class="sp-thread-history__row sp-hover-host"
					role="option"
					:data-testid="`thread-history-row-${thread.threadId}`"
					:data-active="thread.threadId === threadsStore.activeThreadId ? 'true' : 'false'"
					:aria-selected="thread.threadId === threadsStore.activeThreadId ? 'true' : 'false'"
					@click="handleSelect(thread.threadId)"
				>
					<SpIcon name="message-square" :size="14" class="sp-thread-history__icon" />
					<template v-if="renamingThreadId === thread.threadId">
						<input
							v-model="renameDraft"
							type="text"
							class="sp-thread-history__rename-input"
							data-testid="thread-history-rename-input"
							:ariaLabel="t('agent.history.renameInputAriaLabel')"
							@keydown="onRenameKey"
							@blur="commitRename"
							@click.stop
						/>
					</template>
					<template v-else>
						<span class="sp-thread-history__label">
							{{ thread.title || t('thread.defaultTitle') }}
						</span>
						<HoverActions placement="block-end-inline-end">
							<SpIconButton
								icon="pencil"
								:ariaLabel="t('agent.history.rename')"
								data-testid="thread-history-rename"
								@click.stop="startRename(thread.threadId, thread.title)"
							/>
							<SpIconButton
								icon="trash-2"
								:ariaLabel="t('agent.history.delete')"
								data-testid="thread-history-delete"
								@click.stop="handleDelete(thread.threadId)"
							/>
						</HoverActions>
					</template>
				</li>
			</ul>
		</div>
	</SpDropdownPanel>
</template>

<style scoped>
.sp-thread-history {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	min-inline-size: 240px;
}

.sp-thread-history__title {
	margin: 0;
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	font-weight: 600;
	color: var(--sp-text-muted);
}

.sp-thread-history__empty {
	margin: 0;
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-thread-history__list {
	margin: 0;
	padding-inline-start: 0;
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
	max-block-size: 50vh;
	overflow-y: auto;
}

.sp-thread-history__row {
	position: relative;
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	padding-block: var(--sp-space-2);
	padding-inline: var(--sp-space-3);
	border-radius: var(--sp-radius-sm);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
	border-inline-start: 2px solid transparent;
}

.sp-thread-history__row[data-active='true'] {
	border-inline-start-color: var(--sp-brand);
	background: var(--sp-bg-secondary);
}

.sp-thread-history__row:hover {
	background: var(--sp-interactive-hover);
}

.sp-thread-history__icon {
	flex: 0 0 auto;
	color: var(--sp-text-muted);
}

.sp-thread-history__label {
	flex: 1 1 auto;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.sp-thread-history__rename-input {
	flex: 1 1 auto;
	padding-block: var(--sp-space-1);
	padding-inline: var(--sp-space-2);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	font-family: var(--sp-font-text);
	font-size: var(--sp-font-size-sm);
}
</style>
