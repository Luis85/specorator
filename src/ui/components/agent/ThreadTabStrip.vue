<script setup lang="ts">
/**
 * `ThreadTabStrip.vue` — multi-thread switcher rendered at the top of the
 * agent sidepanel (SPEC-MPS-001 §8.1, design.md §A1 Flow 3).
 *
 * Reads `chatThreadsStore.chatThreads` + `activeThreadId` directly per the
 * spec contract (no props). Orders tabs by `lastUsedAt` descending so the
 * most-recently-used conversation is leftmost (REQ-MPS-018). Emits
 * `new-thread` and `rename` upward; activation dispatches `setActiveThreadId`
 * directly because the store action is a single-line in-memory mutation
 * with no side effects.
 *
 * Keyboard (NFR-MPS-009): roving tabindex — exactly one tab has
 * `tabindex="0"`, the rest carry `-1`. ArrowLeft/ArrowRight move focus (with
 * wrap), Home/End jump to the ends, Enter activates the focused tab. The
 * implementation lives here so `ThreadTab.vue` remains a pure
 * presentational unit reusable by future surfaces.
 *
 * Tab cap (REQ-MPS-025): the "+" button is disabled when the open-tab
 * count is at `settings.chatTabCap` (default 10). The composable that
 * wires `new-thread` to `chatThreadsStore.createThread` is responsible for
 * surfacing the `NotificationPort.showWarning` when the cap is hit through
 * other entry points (URI, command palette).
 *
 * Satisfies REQ-MPS-018, REQ-MPS-019, REQ-MPS-020, REQ-MPS-025,
 * NFR-MPS-005, NFR-MPS-009.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';
import ThreadTab from './ThreadTab.vue';
import ThreadHistoryMenu from './ThreadHistoryMenu.vue';
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue';

/**
 * Props supplied by the mount site (`AgentSidepanelRoot.vue`). The cap is
 * passed in rather than read from `SettingsPort` here so the strip stays
 * purely presentational and unit-testable without port wiring — REQ-MPS-025
 * defaults to 10.
 */
const props = withDefaults(
	defineProps<{
		chatTabCap?: number;
	}>(),
	{ chatTabCap: 10 },
);

const emit = defineEmits<{
	'new-thread': [];
	rename: [payload: { threadId: string; title: string }];
	'open-context-menu': [threadId: string];
	'open-history': [];
}>();

const { t } = useI18n();
const threadsStore = useChatThreadsStore();

/**
 * Tabs ordered by `lastUsedAt` descending (REQ-MPS-018). String compare on
 * ISO 8601 UTC timestamps is order-preserving — no `Date` construction
 * needed on the hot path.
 */
const orderedThreads = computed(() => {
	const arr = Array.from(threadsStore.chatThreads.values());
	arr.sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
	return arr;
});

const newThreadDisabled = computed(
	() => threadsStore.chatThreads.size >= props.chatTabCap,
);

/**
 * `threadId` that currently owns the roving `tabindex="0"`. Seeded to the
 * active thread on mount; reseeded when the active thread changes from
 * outside the strip.
 */
const focusedThreadId = ref<string | null>(null);

function ensureFocusSeeded(): void {
	if (focusedThreadId.value !== null) {
		if (threadsStore.chatThreads.has(focusedThreadId.value)) return;
	}
	const fromActive = threadsStore.activeThreadId;
	if (fromActive !== null) {
		focusedThreadId.value = fromActive;
		return;
	}
	if (orderedThreads.value.length === 0) {
		focusedThreadId.value = null;
		return;
	}
	focusedThreadId.value = orderedThreads.value[0].threadId;
}

ensureFocusSeeded();

watch(
	() => threadsStore.activeThreadId,
	(next) => {
		if (next !== null && next !== focusedThreadId.value) {
			focusedThreadId.value = next;
		}
	},
);

watch(
	() => orderedThreads.value.map((t) => t.threadId).join('|'),
	() => {
		ensureFocusSeeded();
	},
);

function tabIndexFor(threadId: string): number {
	return threadId === focusedThreadId.value ? 0 : -1;
}

/**
 * Map a thread to a `ThreadTabBadge` state (spec §3.4). MVP mapping: the
 * active thread shows `active`; every other tab shows `idle`. WS-AUX-5
 * extends this with `streaming` / `attention` once `messagesStore.status`
 * and approval-pending signals are surfaced per-thread.
 */
function badgeStateFor(
	threadId: string,
): 'active' | 'streaming' | 'attention' | 'idle' {
	return threadId === threadsStore.activeThreadId ? 'active' : 'idle';
}

async function focusThreadTab(threadId: string): Promise<void> {
	focusedThreadId.value = threadId;
	await nextTick();
	const el = document.querySelector<HTMLElement>(
		`[data-testid="thread-tab-${threadId}"]`,
	);
	el?.focus();
}

function handleActivate(threadId: string): void {
	threadsStore.setActiveThreadId(threadId);
	focusedThreadId.value = threadId;
}

function handleRename(payload: { threadId: string; title: string }): void {
	threadsStore.renameThread(payload.threadId, payload.title);
	emit('rename', payload);
}

function handleOpenContextMenu(threadId: string): void {
	emit('open-context-menu', threadId);
}

function handleNewThread(): void {
	if (newThreadDisabled.value) return;
	emit('new-thread');
}

/**
 * WS-AUX-9 (REQ-AUX-016, spec §1.4): the history `SpIconButton` toggles a
 * drop-up `<ThreadHistoryMenu>` listing every saved thread. The menu owns
 * its own store reads; this strip just toggles its visibility and forwards
 * rename/delete intents.
 */
const historyOpen = ref(false);

function toggleHistory(): void {
	historyOpen.value = !historyOpen.value;
	if (historyOpen.value) emit('open-history');
}

function closeHistory(): void {
	historyOpen.value = false;
}

function onHistorySelect(threadId: string): void {
	threadsStore.setActiveThreadId(threadId);
	closeHistory();
}

function onHistoryRename(payload: { threadId: string; title: string }): void {
	threadsStore.renameThread(payload.threadId, payload.title);
	emit('rename', payload);
}

function onHistoryDelete(threadId: string): void {
	emit('open-context-menu', threadId);
	closeHistory();
}

interface KeyboardContext {
	readonly ordered: ReadonlyArray<{ readonly threadId: string }>;
	readonly fromIdx: number;
	readonly fromId: string;
}

/** Resolve the keyboard-event context, or null when the event is irrelevant. */
function resolveKeyboardContext(event: KeyboardEvent): KeyboardContext | null {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return null;
	const tid = target.getAttribute('data-testid') ?? '';
	if (!tid.startsWith('thread-tab-')) return null;
	const fromId = tid.replace(/^thread-tab-/, '');
	const ordered = orderedThreads.value;
	const fromIdx = ordered.findIndex((t) => t.threadId === fromId);
	if (fromIdx === -1) return null;
	return { ordered, fromIdx, fromId };
}

/** Map an arrow/Home/End key to the threadId that should receive focus. */
function nextFocusTarget(key: string, ctx: KeyboardContext): string | null {
	const { ordered, fromIdx } = ctx;
	switch (key) {
		case 'ArrowRight':
			return ordered[(fromIdx + 1) % ordered.length].threadId;
		case 'ArrowLeft':
			return ordered[(fromIdx - 1 + ordered.length) % ordered.length].threadId;
		case 'Home':
			return ordered[0].threadId;
		case 'End':
			return ordered[ordered.length - 1].threadId;
		default:
			return null;
	}
}

/**
 * Strip-level keyboard handler. We rely on event bubbling from the
 * individual `role="tab"` elements rather than per-tab handlers so the
 * roving-tabindex contract stays in one place (NFR-MPS-009).
 */
async function onStripKeydown(event: KeyboardEvent): Promise<void> {
	const ctx = resolveKeyboardContext(event);
	if (ctx === null) return;

	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		handleActivate(ctx.fromId);
		return;
	}

	const targetId = nextFocusTarget(event.key, ctx);
	if (targetId === null) return;
	event.preventDefault();
	await focusThreadTab(targetId);
}
</script>

<template>
	<ul
		role="tablist"
		:aria-label="t('thread.tablistAriaLabel')"
		data-testid="thread-tab-strip"
		class="sp-thread-tab-strip"
		@keydown="onStripKeydown"
	>
		<ThreadTab
			v-for="(thread, index) in orderedThreads"
			:key="thread.threadId"
			:thread-id="thread.threadId"
			:title="thread.title"
			:active="thread.threadId === threadsStore.activeThreadId"
			:tab-index="tabIndexFor(thread.threadId)"
			:badge-state="badgeStateFor(thread.threadId)"
			:ordinal="index + 1"
			@activate="handleActivate"
			@rename="handleRename"
			@open-context-menu="handleOpenContextMenu"
		/>
		<li
			v-if="threadsStore.activeThreadId !== null"
			data-testid="thread-tab-active"
			aria-hidden="true"
			class="sp-thread-tab-strip__active-alias"
		/>
		<li class="sp-thread-tab-strip__new-wrap">
			<button
				type="button"
				data-testid="thread-tab-new"
				class="sp-thread-tab-strip__new-btn"
				:aria-label="t('thread.newAriaLabel')"
				:disabled="newThreadDisabled"
				@click="handleNewThread"
			>
				+
			</button>
		</li>
		<li class="sp-thread-tab-strip__history-wrap">
			<SpIconButton
				icon="history"
				:ariaLabel="t('agent.history.open')"
				data-testid="thread-history-toggle"
				@click="toggleHistory"
			/>
		</li>
	</ul>
	<ThreadHistoryMenu
		:open="historyOpen"
		@close="closeHistory"
		@select="onHistorySelect"
		@rename="onHistoryRename"
		@delete="onHistoryDelete"
	/>
</template>

<style scoped>
.sp-thread-tab-strip {
	display: flex;
	flex-wrap: nowrap;
	overflow-x: auto;
	gap: 0.25rem;
	list-style: none;
	margin: 0;
	padding: 0.25rem 0.5rem;
	border-bottom: 1px solid var(--sp-border);
	background: var(--sp-bg-secondary);
	flex-shrink: 0;
}

.sp-thread-tab-strip__active-alias {
	/* Off-screen sentinel used by tests to assert "an active tab exists". */
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
	pointer-events: none;
}

.sp-thread-tab-strip__new-wrap,
.sp-thread-tab-strip__history-wrap {
	display: inline-flex;
	align-items: center;
}

.sp-thread-tab-strip__history-wrap {
	margin-inline-start: auto;
}

.sp-thread-tab-strip__new-btn {
	border: 1px solid var(--sp-border);
	border-radius: 4px;
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	padding: 0 0.5rem;
	font-size: 0.9rem;
	line-height: 1.5rem;
	cursor: pointer;
}

.sp-thread-tab-strip__new-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.sp-thread-tab-strip__new-btn:hover:not(:disabled) {
	background: var(--sp-interactive-hover);
}
</style>
