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
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import { useChatProviderStore } from '@/ui/stores/chatProviderStore';
import { useProviderRegistry } from '@/ui/composables/useProviderRegistry';
import { isExplicit, type ProviderId } from '@/domain/chat/ProviderSelection';

const { t } = useI18n();
const store = useChatProviderStore();
const { resolved } = storeToRefs(store);
const registry = useProviderRegistry();

const activeProviderId = computed<ProviderId | null>(() => {
	const r = resolved.value;
	if (r === 'degraded') return null;
	if (isExplicit(r)) return r.provider;
	return null;
});

const models = computed(() => {
	const id = activeProviderId.value;
	if (id === null) return [];
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
		<label class="sp-model-selector__label" :for="'model-selector-select'">
			{{ t('provider.model') }}
		</label>
		<select
			id="model-selector-select"
			v-model="selected"
			class="sp-model-selector__select"
			data-testid="model-selector-select"
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
	color: var(--text-muted);
}

.sp-model-selector__label {
	text-transform: uppercase;
	letter-spacing: 0.04em;
	font-weight: 600;
}

.sp-model-selector__select {
	padding: 0.125rem 0.375rem;
	border: 1px solid var(--background-modifier-border);
	border-radius: 4px;
	background: var(--background-primary);
	color: var(--text-normal);
	font-size: 0.75rem;
}
</style>
