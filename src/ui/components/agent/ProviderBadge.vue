<script setup lang="ts">
/**
 * `ProviderBadge.vue` — compact pill showing the resolved provider/mode in
 * the agent surface. Reads the `agent.provider.label` + `agent.provider.mode`
 * copy table (REQ-AUX-016, spec §1.6) — never the raw `claude/cli` token.
 *
 * Unknown ids fall back to a title-cased humanisation so the badge never
 * crashes on a provider that lacks copy.
 *
 * Clicking the badge opens `<ProviderMenu>` inside an `<SpDropdownPanel>`.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { isExplicit } from '@/domain/chat/ProviderSelection';
import ProviderMenu from './ProviderMenu.vue';
import SpDropdownPanel from '@/ui/components/primitives/SpDropdownPanel.vue';

const { t } = useI18n({ useScope: 'global' });
const store = useChatProviderStore();
const { resolved } = storeToRefs(store);

const open = ref(false);

interface ResolvedParts {
	readonly providerId: string | null;
	readonly providerLabel: string;
	readonly modeLabel: string;
	readonly isDegraded: boolean;
}

/** Title-case a hyphen or whitespace-separated slug. */
function humanise(slug: string): string {
	return slug
		.split(/[-_\s]+/)
		.filter((part) => part.length > 0)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
		.join(' ');
}

function resolveLabel(key: string, fallback: string): string {
	const value = t(key);
	// vue-i18n returns the key itself when missing — treat that as "no copy".
	if (!value || value === key) return fallback;
	return value;
}

const parts = computed<ResolvedParts>(() => {
	const r = resolved.value;
	if (r === 'degraded') {
		return { providerId: null, providerLabel: 'degraded', modeLabel: '', isDegraded: true };
	}
	if (isExplicit(r)) {
		const providerKey = `agent.provider.label.${r.provider}`;
		const modeKey = `agent.provider.mode.${r.mode}`;
		return {
			providerId: r.provider,
			providerLabel: resolveLabel(providerKey, humanise(r.provider)),
			modeLabel: resolveLabel(modeKey, humanise(r.mode)),
			isDegraded: false,
		};
	}
	return { providerId: null, providerLabel: 'auto', modeLabel: '', isDegraded: false };
});

const label = computed<string>(() => {
	const p = parts.value;
	if (p.isDegraded) return p.providerLabel;
	if (p.modeLabel === '') return p.providerLabel;
	return `${p.providerLabel} · ${p.modeLabel}`;
});

function toggle(): void {
	open.value = !open.value;
}

function close(): void {
	open.value = false;
}
</script>

<template>
	<div
		class="sp-provider-badge"
		data-testid="provider-badge"
		:data-provider="parts.providerId ?? undefined"
	>
		<button
			type="button"
			class="sp-provider-badge__button"
			:aria-expanded="open"
			:aria-label="t('provider.badge')"
			data-testid="provider-badge-toggle"
			@click="toggle"
		>
			<span class="sp-provider-badge__label" data-testid="provider-badge-label">{{ label }}</span>
		</button>
		<SpDropdownPanel
			:open="open"
			anchor-mode="dropdown"
			:aria-label="t('provider.menuAriaLabel')"
			@close="close"
		>
			<ProviderMenu />
		</SpDropdownPanel>
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
	padding-block: var(--sp-space-1);
	padding-inline: var(--sp-space-3);
	background: var(--sp-bg-secondary);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-pill);
	font-size: var(--sp-font-size-xs);
	font-weight: 600;
	letter-spacing: 0.04em;
	color: var(--sp-text-normal);
	cursor: pointer;
}

.sp-provider-badge__button:hover {
	background: var(--sp-interactive-hover);
}

.sp-provider-badge__button:focus-visible {
	outline: none;
	box-shadow: var(--sp-shadow-focus-ring);
}
</style>
