<script setup lang="ts">
/**
 * `BashHistoryList.vue` — agent sidepanel status-panel child.
 *
 * Renders the cap-50 FIFO of `BashEntry` records from `statusPanelStore`
 * (REQ-MPS-031). Each row carries `data-testid="bash-row-{id}"` and a
 * collapsible body controlled by the toggle button (REQ-MPS-032).
 */
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useStatusPanelStore } from '@/ui/stores/statusPanelStore';

const { t } = useI18n();
const store = useStatusPanelStore();
const { bashHistory } = storeToRefs(store);

const expanded = ref<Map<string, boolean>>(new Map());

function isExpanded(id: string): boolean {
	return expanded.value.get(id) === true;
}

function toggle(id: string): void {
	const next = new Map(expanded.value);
	next.set(id, !isExpanded(id));
	expanded.value = next;
}
</script>

<template>
	<div class="sp-status__bash" data-testid="bash-history">
		<h3 class="sp-status__heading">{{ t('status.bashHeading') }}</h3>
		<p
			v-if="bashHistory.length === 0"
			class="sp-status__empty"
			data-testid="bash-history-empty"
		>
			{{ t('status.bashEmpty') }}
		</p>
		<ul v-else class="sp-status__bash-list">
			<li
				v-for="entry in bashHistory"
				:key="entry.id"
				class="sp-status__bash-row"
				:data-testid="`bash-row-${entry.id}`"
			>
				<button
					type="button"
					class="sp-status__bash-toggle"
					:data-testid="`bash-row-toggle-${entry.id}`"
					:aria-controls="`bash-row-body-${entry.id}`"
					:aria-expanded="isExpanded(entry.id)"
					@click="toggle(entry.id)"
				>
					<span class="sp-status__bash-cmd">{{ entry.command }}</span>
					<span
						v-if="entry.exitCode !== null"
						class="sp-status__bash-exit"
						:class="{ 'sp-status__bash-exit--fail': entry.exitCode !== 0 }"
					>
						exit {{ entry.exitCode }}
					</span>
				</button>
				<div
					v-if="isExpanded(entry.id)"
					:id="`bash-row-body-${entry.id}`"
					class="sp-status__bash-body"
				>
					<pre class="sp-status__bash-output">{{ entry.output }}</pre>
					<p
						v-if="entry.truncated"
						class="sp-status__bash-truncated"
					>{{ t('status.bashTruncated') }}</p>
				</div>
			</li>
		</ul>
	</div>
</template>

<style scoped>
.sp-status__bash {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sp-status__heading {
	margin: 0;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
	color: var(--sp-text-muted);
	letter-spacing: 0.05em;
}

.sp-status__empty {
	margin: 0;
	font-size: 0.8125rem;
	color: var(--sp-text-muted);
	font-style: italic;
}

.sp-status__bash-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.sp-status__bash-row {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.sp-status__bash-toggle {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
	padding: 0.25rem 0.375rem;
	background: transparent;
	border: 0;
	border-radius: 4px;
	cursor: pointer;
	font-family: var(--font-monospace);
	font-size: 0.8125rem;
	color: var(--sp-text-normal);
	text-align: start;
}

.sp-status__bash-toggle:hover {
	background: var(--sp-interactive-hover);
}

.sp-status__bash-cmd {
	flex: 1 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sp-status__bash-exit {
	font-size: 0.6875rem;
	color: var(--sp-text-muted);
}

.sp-status__bash-exit--fail {
	color: var(--sp-error, #c25);
}

.sp-status__bash-body {
	padding: 0.375rem 0.5rem;
	background: var(--sp-bg-secondary);
	border-radius: 4px;
}

.sp-status__bash-output {
	margin: 0;
	font-family: var(--font-monospace);
	font-size: 0.75rem;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--sp-text-normal);
}

.sp-status__bash-truncated {
	margin: 0.25rem 0 0;
	font-size: 0.6875rem;
	color: var(--sp-text-muted);
	font-style: italic;
}
</style>
