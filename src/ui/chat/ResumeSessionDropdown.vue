<script setup lang="ts">
import { ref, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConversationMeta } from '@/domain/ports';
import { useProviderHistoryPort } from '@/ui/composables/useProviderHistoryPort';
import { useTabsStore } from '@/ui/stores/tabsStore';
import { useConfirmDelete } from '@/ui/chat/modalSeam';
import { ListConversationsUseCase } from '@/application/threads/ListConversationsUseCase';
import { ResumeConversationUseCase } from '@/application/threads/ResumeConversationUseCase';
import { RenameConversationUseCase } from '@/application/threads/RenameConversationUseCase';
import { DeleteConversationUseCase } from '@/application/threads/DeleteConversationUseCase';

/**
 * The drop-UP blurred history menu (SPEC-TS-022). Opens from a control near the
 * composer: title + relative-date rows, newest-`updatedAt` first (the use case
 * sorts); a quiet empty line; selecting a row resumes into the active tab via the
 * P2 block path (collapsed by default — REQ-TS-014). Inline rename →
 * `RenameConversationUseCase` (titleManual:true). Delete → the plugin-owned
 * `DeleteConfirmModal` seam (NEVER `window.confirm`, NFR-TS-007) →
 * `DeleteConversationUseCase`. A `pending` row spins (reduced-motion honoured);
 * `failed` silently keeps the fallback. Keyboard: Arrow Up/Down move the
 * `aria-activedescendant`, Enter resumes, Escape closes + focus returns to the
 * opener (REQ-TS-015). `<script setup>`; titles/dates as `{{ }}` text; no `v-html`;
 * no `obsidian` import.
 */
const { t } = useI18n();
const history = useProviderHistoryPort();
const tabs = useTabsStore();
const confirmDelete = useConfirmDelete();

const list = new ListConversationsUseCase(history);
const resume = new ResumeConversationUseCase(history);
const rename = new RenameConversationUseCase(history);
const del = new DeleteConversationUseCase(history);

const open = ref(false);
const metas = ref<ConversationMeta[]>([]);
const selectedIndex = ref(-1);
const renamingId = ref<string | null>(null);
const renameValue = ref('');
const opener = ref<HTMLButtonElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const activeDescendant = computed(() =>
	selectedIndex.value >= 0 && selectedIndex.value < metas.value.length
		? `history-row-${metas.value[selectedIndex.value].id}`
		: undefined,
);

async function refresh(): Promise<void> {
	const result = await list.execute();
	metas.value = result.ok ? result.value : [];
}

async function toggle(): Promise<void> {
	open.value = !open.value;
	if (open.value) {
		selectedIndex.value = -1;
		await refresh();
		await nextTick(() => listEl.value?.focus());
	}
}

function close(): void {
	open.value = false;
	renamingId.value = null;
	void nextTick(() => opener.value?.focus());
}

async function onSelectRow(meta: ConversationMeta): Promise<void> {
	const result = await resume.execute(meta.id);
	if (!result.ok) {
		open.value = false;
		return;
	}
	const activeId = tabs.activeTabId;
	if (activeId !== null) {
		tabs.loadIntoTab(activeId, {
			conversationId: result.value.conversationId,
			title: result.value.title,
			messages: result.value.messages,
			sessionId: result.value.sessionId,
		});
	}
	open.value = false;
}

async function onDelete(meta: ConversationMeta): Promise<void> {
	const confirmed = await confirmDelete(t('agent.chat.history.deleteConfirm'));
	if (!confirmed) return;
	await del.execute(meta.id);
	await refresh();
}

function startRename(meta: ConversationMeta): void {
	renamingId.value = meta.id;
	renameValue.value = meta.title;
}

async function commitRename(meta: ConversationMeta): Promise<void> {
	const next = renameValue.value.trim();
	renamingId.value = null;
	if (next.length === 0) return;
	await rename.execute(meta.id, next);
	await refresh();
}

function move(delta: number): void {
	if (metas.value.length === 0) return;
	const next = selectedIndex.value + delta;
	selectedIndex.value = Math.min(Math.max(next, 0), metas.value.length - 1);
}

function onListKeydown(event: KeyboardEvent): void {
	switch (event.key) {
		case 'ArrowDown':
			event.preventDefault();
			move(selectedIndex.value < 0 ? metas.value.length : 1);
			break;
		case 'ArrowUp':
			event.preventDefault();
			move(-1);
			break;
		case 'Enter':
			event.preventDefault();
			if (selectedIndex.value >= 0) void onSelectRow(metas.value[selectedIndex.value]);
			break;
		case 'Escape':
			event.preventDefault();
			close();
			break;
		default:
			break;
	}
}

/** A coarse relative date (no message content, NFR-TS-013). */
function relativeDate(updatedAt: number): string {
	const deltaMs = Date.now() - updatedAt;
	const minutes = Math.round(deltaMs / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	return `${days}d ago`;
}

function isPending(meta: ConversationMeta): boolean {
	const tab = tabs.tabs.find((c) => c.conversationId === meta.id);
	return tab?.titleStatus === 'pending';
}
</script>

<template>
	<div class="sp-history">
		<button
			ref="opener"
			type="button"
			class="sp-history__opener"
			data-testid="history-open"
			:aria-label="t('agent.chat.history.open')"
			:aria-expanded="open ? 'true' : 'false'"
			@click="toggle"
		>
			<span aria-hidden="true">⌃</span>
		</button>
		<div
			v-if="open"
			ref="listEl"
			class="sp-history__list"
			data-testid="history-list"
			role="listbox"
			tabindex="0"
			:aria-label="t('agent.chat.history.open')"
			:aria-activedescendant="activeDescendant"
			@keydown="onListKeydown"
		>
			<p v-if="metas.length === 0" class="sp-history__empty" data-testid="history-empty">
				{{ t('agent.chat.history.empty') }}
			</p>
			<div
				v-for="(meta, index) in metas"
				:id="`history-row-${meta.id}`"
				:key="meta.id"
				class="sp-history__row"
				data-testid="history-row"
				role="option"
				:aria-selected="index === selectedIndex ? 'true' : 'false'"
				@click="onSelectRow(meta)"
			>
				<template v-if="renamingId === meta.id">
					<input
						class="sp-history__rename-input"
						data-testid="history-rename-input"
						:value="renameValue"
						@click.stop
						@input="renameValue = ($event.target as HTMLInputElement).value"
						@keydown.enter.stop.prevent="commitRename(meta)"
						@keydown.esc.stop.prevent="renamingId = null"
					/>
				</template>
				<template v-else>
					<span class="sp-history__title">{{ meta.title || t('agent.chat.history.empty') }}</span>
					<span class="sp-history__date">{{ relativeDate(meta.updatedAt) }}</span>
					<span
						v-if="isPending(meta)"
						class="sp-history__spinner"
						data-testid="history-spinner"
						aria-hidden="true"
					/>
					<button
						type="button"
						class="sp-history__action"
						data-testid="history-rename"
						:aria-label="t('agent.chat.history.rename')"
						@click.stop="startRename(meta)"
					>
						<span aria-hidden="true">✎</span>
					</button>
					<button
						type="button"
						class="sp-history__action sp-history__action--delete"
						data-testid="history-delete"
						:aria-label="t('agent.chat.history.delete')"
						@click.stop="onDelete(meta)"
					>
						<span aria-hidden="true">🗑</span>
					</button>
				</template>
			</div>
		</div>
	</div>
</template>

<style scoped>
.sp-history {
	position: relative;
}

.sp-history__opener {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 28px;
	block-size: 28px;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}

.sp-history__list {
	position: absolute;
	inset-block-end: calc(100% + var(--sp-space-2));
	inset-inline-start: 0;
	min-inline-size: 240px;
	max-block-size: 320px;
	overflow-y: auto;
	padding: var(--sp-space-2);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-primary);
	backdrop-filter: blur(var(--sp-history-blur, 8px));
	outline: none;
}

.sp-history__empty {
	padding: var(--sp-space-3);
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-history__row {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	block-size: var(--sp-history-row-h, 44px);
	padding-inline: var(--sp-space-3);
	border-radius: var(--sp-radius-sm);
	cursor: pointer;
}

.sp-history__row[aria-selected='true'],
.sp-history__row:hover {
	background: var(--sp-bg-secondary);
}

.sp-history__title {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-history__date {
	color: var(--sp-text-muted);
	font-size: var(--sp-font-size-sm);
}

.sp-history__rename-input {
	flex: 1;
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-sm);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding: var(--sp-space-1) var(--sp-space-2);
}

.sp-history__action {
	border: none;
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}

.sp-history__action--delete:hover {
	color: var(--sp-history-delete, var(--sp-error));
}

.sp-history__spinner {
	inline-size: 12px;
	block-size: 12px;
	border: 2px solid var(--sp-border);
	border-block-start-color: var(--sp-accent);
	border-radius: var(--sp-radius-full);
	animation: spin var(--sp-history-spin-duration, 0.8s) linear infinite;
}

@media (prefers-reduced-motion: reduce) {
	.sp-history__spinner {
		animation: none;
	}
}
</style>
