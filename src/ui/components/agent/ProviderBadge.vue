<script setup lang="ts">
/**
 * `ProviderBadge.vue` — compact pill showing the resolved provider/mode in
 * the agent sidepanel header. Clicking the badge toggles a popover that
 * mounts `ProviderMenu.vue`.
 *
 * Satisfies REQ-MPS-007 (UI surface), Design §A1 Flow 1.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { isExplicit } from '@/domain/chat/ProviderSelection';
import ProviderMenu from './ProviderMenu.vue';

const { t } = useI18n();
const store = useChatProviderStore();
const { resolved } = storeToRefs(store);

const open = ref(false);

const label = computed<string>(() => {
	const r = resolved.value;
	if (r === 'degraded') return 'degraded';
	if (isExplicit(r)) return `${r.provider}/${r.mode}`;
	return 'auto';
});

function toggle(): void {
	open.value = !open.value;
}
</script>

<template>
	<div class="sp-provider-badge" data-testid="provider-badge">
		<button
			type="button"
			class="sp-provider-badge__button"
			:aria-expanded="open"
			:aria-label="t('provider.badge')"
			data-testid="provider-badge-toggle"
			@click="toggle"
		>
			<span class="sp-provider-badge__label">{{ label }}</span>
		</button>
		<div v-if="open" class="sp-provider-badge__menu-wrap">
			<ProviderMenu />
		</div>
	</div>
</template>

<style scoped>
.sp-provider-badge {
	position: relative;
	display: inline-flex;
}

.sp-provider-badge__button {
	display: inline-flex;
	align-items: center;
	padding: 0.125rem 0.5rem;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	border-radius: 999px;
	font-size: 0.6875rem;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--text-normal);
	cursor: pointer;
}

.sp-provider-badge__button:hover {
	background: var(--background-modifier-hover);
}

.sp-provider-badge__menu-wrap {
	position: absolute;
	top: calc(100% + 0.25rem);
	right: 0;
	z-index: 6;
}
</style>
