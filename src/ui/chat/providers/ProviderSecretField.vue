<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProviderId } from '@/domain/chat/ProviderId';

/**
 * The minimal masked secret-entry field (SPEC-PV-018, SPEC-PV-025,
 * REQ-PV-070/072/092/102/110). Presentational — props in, `save(value)` out (the
 * wiring calls `SecretStorePort.setSecret(providerSecretKey(id), value)`). The input
 * is masked (`type="password"`); the typed value lives only in a local ref and is
 * cleared on save — it is NEVER echoed back into the DOM value attribute, a notice,
 * a log, a store, or a DTO (NFR-PV-002, REQ-PV-102). When `available` is false the
 * field is DISABLED with the honest `providers.secret.unavailable` message — there
 * is no plain-store fallback (EC-PV-10). A11y: an associated accessible name + a
 * visible focus ring. No `obsidian`/`v-html`.
 */
const props = defineProps<{ providerId: ProviderId; available: boolean }>();
const emit = defineEmits<{ save: [value: string] }>();

const { t } = useI18n();

// The typed secret is held transiently here ONLY; it never crosses into a DTO/store
// and is cleared the moment it is emitted (REQ-PV-102, NFR-PV-002).
const draft = ref('');

const inputLabel = computed(() => t('agent.chat.providers.secret.label'));
const placeholder = computed(() => t('agent.chat.providers.secret.placeholder'));
const saveLabel = computed(() => t('agent.chat.providers.secret.save'));
const unavailableMessage = computed(() => t('agent.chat.providers.secret.unavailable'));

const canSave = computed(() => props.available && draft.value.length > 0);

function onSave(): void {
	if (!props.available || draft.value.length === 0) return;
	emit('save', draft.value);
	draft.value = '';
}
</script>

<template>
	<form class="sp-provider-secret" data-testid="provider-secret-field" @submit.prevent="onSave">
		<label class="sp-provider-secret__label" :for="`secret-${providerId}`">{{ inputLabel }}</label>
		<input
			:id="`secret-${providerId}`"
			v-model="draft"
			type="password"
			class="sp-provider-secret__input"
			data-testid="provider-secret-input"
			:placeholder="placeholder"
			:aria-label="inputLabel"
			:disabled="!available"
			autocomplete="off"
		/>
		<button
			type="button"
			class="sp-provider-secret__save"
			data-testid="provider-secret-save"
			:disabled="!canSave"
			:aria-label="saveLabel"
			@click="onSave"
		>
			{{ saveLabel }}
		</button>
		<p
			v-if="!available"
			class="sp-provider-secret__unavailable"
			data-testid="provider-secret-unavailable"
			role="status"
		>
			{{ unavailableMessage }}
		</p>
	</form>
</template>

<style scoped>
.sp-provider-secret {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--sp-space-2);
}

.sp-provider-secret__label {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-provider-secret__input {
	flex: 1 1 16ch;
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
}

.sp-provider-secret__input:disabled {
	color: var(--sp-text-muted);
	cursor: not-allowed;
}

.sp-provider-secret__save {
	block-size: var(--sp-toolbar-widget-h);
	border: 1px solid var(--sp-border);
	border-radius: var(--sp-radius-md);
	background: var(--sp-bg-secondary);
	color: var(--sp-text-normal);
	padding-inline: var(--sp-space-2);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
}

.sp-provider-secret__save:disabled {
	color: var(--sp-text-muted);
	cursor: not-allowed;
}

.sp-provider-secret__unavailable {
	flex: 1 1 100%;
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}
</style>
