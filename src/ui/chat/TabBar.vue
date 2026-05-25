<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { TabState } from '@/ui/stores/tabsStore';

/**
 * The multi-tab strip (SPEC-TS-020). A `role="tablist"` of numbered square badges
 * above the chat region: the 1-based number is visible text (the non-colour cue,
 * NFR-TS-010); a new-tab control and a per-badge close control drive
 * `tabsStore.openTab`/`closeTab`. Roving tabindex (NFR-TS-009): the active badge is
 * `tabindex="0"`, the rest `-1`; Arrow Left/Right move + activate, Home/End jump.
 * The border-colour state machine (active/streaming/attention/idle, REQ-TS-006/007)
 * resolves through the `--sp-tab-border-*` tokens keyed off `data-state` — no colour
 * literal here (NFR-TS-012). `<script setup>`; numbers as `{{ }}` text; no `v-html`.
 */
const { t } = useI18n();
const tabs = useTabsStore();

type BadgeState = 'active' | 'streaming' | 'attention' | 'idle';

/** Resolve a tab's badge state (REQ-TS-006/007). */
function badgeState(tab: TabState): BadgeState {
	if (tab.id === tabs.activeTabId) return 'active';
	if (tab.status === 'streaming') return 'streaming';
	if (tab.needsAttention) return 'attention';
	return 'idle';
}

const items = computed(() =>
	tabs.tabs.map((tab, index) => ({
		id: tab.id,
		number: index + 1,
		state: badgeState(tab),
		active: tab.id === tabs.activeTabId,
	})),
);

function onNew(): void {
	tabs.openTab();
}

function onSelect(id: string): void {
	tabs.switchTab(id);
}

function onClose(id: string): void {
	tabs.closeTab(id);
}

/** Roving-tabindex keyboard nav (NFR-TS-009). Arrow moves+activates; Home/End jump. */
function onKeydown(event: KeyboardEvent, index: number): void {
	const list = tabs.tabs;
	if (list.length === 0) return;
	const target = nextIndex(event.key, index, list.length);
	if (target === null) return;
	event.preventDefault();
	tabs.switchTab(list[target].id);
}

/** Map a roving-tabindex key to the target index, or `null` when not a nav key. */
function nextIndex(key: string, index: number, count: number): number | null {
	switch (key) {
		case 'ArrowRight':
			return Math.min(index + 1, count - 1);
		case 'ArrowLeft':
			return Math.max(index - 1, 0);
		case 'Home':
			return 0;
		case 'End':
			return count - 1;
		default:
			return null;
	}
}
</script>

<template>
	<div class="sp-tab-bar" data-testid="tab-bar" role="tablist" :aria-label="t('agent.chat.tabs.label')">
		<div
			v-for="(item, index) in items"
			:key="item.id"
			class="sp-tab"
			data-testid="tab-badge"
			role="tab"
			:data-state="item.state"
			:data-tab-index="item.number"
			:aria-selected="item.active ? 'true' : 'false'"
			:tabindex="item.active ? 0 : -1"
			@click="onSelect(item.id)"
			@keydown="onKeydown($event, index)"
		>
			<span class="sp-tab__number" data-testid="tab-number">{{ item.number }}</span>
			<button
				type="button"
				class="sp-tab__close"
				data-testid="tab-close"
				:aria-label="t('agent.chat.tabs.close')"
				tabindex="-1"
				@click.stop="onClose(item.id)"
			>
				<span aria-hidden="true">×</span>
			</button>
		</div>
		<button
			type="button"
			class="sp-tab-new"
			data-testid="tab-new"
			:aria-label="t('agent.chat.tabs.new')"
			@click="onNew"
		>
			<span aria-hidden="true">+</span>
		</button>
	</div>
</template>

<style scoped>
.sp-tab-bar {
	display: flex;
	align-items: center;
	gap: var(--sp-space-2);
	padding-block-end: var(--sp-space-2);
	border-block-end: 1px solid var(--sp-border);
	overflow-x: auto;
	scrollbar-width: thin;
}

.sp-tab {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--sp-space-1);
	inline-size: var(--sp-tab-size);
	block-size: var(--sp-tab-size);
	border: 2px solid var(--sp-tab-border-idle);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-primary);
	color: var(--sp-text-normal);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
	transition: border-color var(--sp-history-spin-duration, 0.15s) ease;
}

.sp-tab[data-state='active'] {
	border-color: var(--sp-tab-border-active);
}

.sp-tab[data-state='streaming'] {
	border-color: var(--sp-tab-border-streaming);
}

.sp-tab[data-state='attention'] {
	border-color: var(--sp-tab-border-attention);
}

.sp-tab__number {
	font-weight: var(--sp-font-weight-medium);
}

.sp-tab__close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 14px;
	block-size: 14px;
	border: none;
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
	opacity: 0;
}

.sp-tab:hover .sp-tab__close,
.sp-tab:focus-within .sp-tab__close {
	opacity: 1;
}

.sp-tab-new {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: var(--sp-tab-size);
	block-size: var(--sp-tab-size);
	border: 1px dashed var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
	.sp-tab {
		transition: none;
	}
}
</style>
