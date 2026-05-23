<script setup lang="ts">
/**
 * `ModelSelector.vue` — per-provider model dropdown shown in the agent
 * sidepanel header.
 *
 * Reads the active provider's `ProviderCapabilities.models` from the
 * `ProviderRegistry` (REQ-MPS-040). Per REQ-MPS-041 (TST-MPS-26) the selector
 * is hidden when the model list is empty or no explicit provider is
 * resolved.
 *
 * The picked model id is exposed via `chatProviderStore.selectedModel` for
 * the orchestrator to thread into `ChatTransportStreamOptions.model`.
 */
import { computed, inject, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports';
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry';
import { isExplicit, type ProviderId } from '@/domain/chat/ProviderSelection';

const { t } = useI18n();
const store = useChatProviderStore();
const { resolved } = storeToRefs(store);
// WS-AUX-6: ModelSelector now mounts inside InputToolbar which itself mounts
// inside ChatInput. ChatInput is reused in test contexts that do not provide
// a ProviderRegistry — degrade gracefully to "no models" instead of throwing.
const registry = inject<ProviderRegistry | null>(PROVIDER_REGISTRY_KEY, null);

const activeProviderId = computed<ProviderId | null>(() => {
	const r = resolved.value;
	if (r === 'degraded') return null;
	if (isExplicit(r)) return r.provider;
	return null;
});

const models = computed(() => {
	const id = activeProviderId.value;
	if (id === null || registry === null) return [];
	return registry.getCapabilities(id)?.models ?? [];
});

const selected = ref<string>(models.value[0]?.id ?? '');
// REQ-MPS-040 / WS-10: keep the store mirror in sync so the chat send path
// (TurnInputBuilder) can read the selection without reaching into the
// component. Seed eagerly so the first turn after mount carries the model.
store.setSelectedModel(selected.value);

watch(models, (next) => {
	if (next.length === 0) {
		selected.value = '';
		store.setSelectedModel('');
		return;
	}
	if (!next.some((m) => m.id === selected.value)) {
		selected.value = next[0]?.id ?? '';
	}
	store.setSelectedModel(selected.value);
});

watch(selected, (id) => {
	store.setSelectedModel(id);
});

const visible = computed(() => models.value.length > 0);
</script>

<template>
	<div v-if="visible" class="sp-model-selector" data-testid="model-selector">
		<!-- G5: drop the uppercase "MODEL" label for Claudian parity — the
		     brand-coloured select stands alone like "Opus" in the reference. -->
		<label
			id="model-selector-label"
			class="sp-model-selector__sr-label"
			:for="'model-selector-select'"
		>
			{{ t('provider.model') }}
		</label>
		<select
			id="model-selector-select"
			v-model="selected"
			class="sp-model-selector__select sp-model-selector__select--brand"
			data-testid="model-selector-select"
			aria-labelledby="model-selector-label"
		>
			<option
				v-for="m in models"
				:key="m.id"
				:value="m.id"
			>{{ m.label }}</option>
		</select>
	</div>
</template>

<style scoped>
.sp-model-selector {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.75rem;
	color: var(--sp-text-muted);
}

.sp-model-selector__sr-label {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.sp-model-selector__select {
	padding-block: 0.125rem;
	padding-inline: 0.25rem;
	border: 0;
	background: transparent;
	color: var(--sp-text-normal);
	font-size: 0.8125rem;
	font-weight: 500;
	cursor: pointer;
}

.sp-model-selector__select:hover {
	background: var(--sp-interactive-hover);
	border-radius: 4px;
}

/* G4.1 — brand-color emphasis on the active model name so the toolbar
 * gets the same brand splash as Claudian's "Opus" label. The dropdown
 * chevron stays in the platform default (neutral). */
.sp-model-selector__select--brand {
	color: var(--sp-brand);
	font-weight: 600;
}
</style>
