<script setup lang="ts">
/**
 * `ProviderMenu.vue` — flat menu over (provider, mode) cells.
 *
 * Renders one row per cell — even those disabled by `modeDisabledReason`,
 * which carry `aria-disabled="true"` and a tooltip with the reason string
 * (Design §A1 Flow 1 step 7, NFR-MPS-009). Click handlers dispatch
 * `chatProviderStore.setActiveSelection`.
 *
 * Satisfies REQ-MPS-007 (UI surface).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { useProviderRegistry } from '@/ui/composables/useProviderRegistry';
import type { ProviderMode } from '@/domain/chat/ProviderSelection';
import { trySync } from '@/domain/shared/tryAsync';

const { t } = useI18n();
const registry = useProviderRegistry();
const store = useChatProviderStore();

interface MenuRow {
	readonly providerId: string;
	readonly label: string;
	readonly mode: ProviderMode;
	readonly disabledReason: string | null;
}

const rows = computed<MenuRow[]>(() => {
	const out: MenuRow[] = [];
	for (const entry of registry.listProviders()) {
		for (const mode of (['api', 'cli'] as const)) {
			const supported = entry.capabilities.modes.includes(mode);
			if (!supported) continue;
			out.push({
				providerId: entry.id,
				label: entry.label,
				mode,
				disabledReason: entry.capabilities.modeDisabledReason[mode],
			});
		}
	}
	return out;
});

function isDisabled(row: MenuRow): boolean {
	return row.disabledReason !== null;
}

function pick(row: MenuRow): void {
	if (isDisabled(row)) return;
	// Validation guard — disabled rows are filtered above, but `trySync` still
	// neutralises any registry mismatch so a malformed `row.providerId` cannot
	// crash the click handler.
	trySync(() => {
		store.setActiveSelection({
			provider: row.providerId as 'claude' | 'cursor',
			mode: row.mode,
		});
	}, 'ProviderMenu.pick');
}
</script>

<template>
	<ul
		class="sp-provider-menu"
		role="menu"
		:aria-label="t('provider.menuAriaLabel')"
		data-testid="provider-menu"
	>
		<li
			v-for="row in rows"
			:key="`${row.providerId}-${row.mode}`"
			class="sp-provider-menu__item"
			role="menuitem"
			:aria-disabled="isDisabled(row) ? 'true' : 'false'"
			:title="row.disabledReason ?? undefined"
			:data-testid="`provider-menu-item-${row.providerId}-${row.mode}`"
			@click="pick(row)"
		>
			<span class="sp-provider-menu__label">{{ row.label }}</span>
			<span class="sp-provider-menu__mode">{{ row.mode }}</span>
		</li>
	</ul>
</template>

<style scoped>
.sp-provider-menu {
	list-style: none;
	margin: 0;
	padding: 0.25rem 0;
	border: 1px solid var(--sp-border);
	border-radius: 6px;
	background: var(--sp-bg-primary);
	min-width: 12rem;
	box-shadow: var(--shadow-s, 0 4px 12px rgba(0, 0, 0, 0.12));
}

.sp-provider-menu__item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.375rem 0.75rem;
	font-size: 0.8125rem;
	cursor: pointer;
}

.sp-provider-menu__item[aria-disabled='true'] {
	color: var(--sp-text-muted);
	cursor: not-allowed;
}

.sp-provider-menu__item:not([aria-disabled='true']):hover {
	background: var(--sp-interactive-hover);
}

.sp-provider-menu__mode {
	font-size: 0.6875rem;
	color: var(--sp-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
}
</style>
