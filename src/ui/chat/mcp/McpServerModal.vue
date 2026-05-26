<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { McpServerConfig } from '@/domain/chat/mcp/McpTypes';
import { parseClipboardConfig } from '@/domain/chat/mcp/McpConfigParser';
import type { McpServerDraft } from '@/application/chat/mcp/McpServerManager';

/**
 * The add/edit MCP-server form (SPEC-MC-016/023, REQ-MC-010/011/012/042/043/070).
 * Presentational — props in (`input?` = edit, absent = add; `existingNames` for
 * the duplicate check), events out (`submit:[draft]` / `cancel`). The config field
 * is parsed through the PURE `parseClipboardConfig` (SPEC-MC-004) on Save: a
 * malformed paste shows `parseError` and submits nothing (REQ-MC-004); a format-2
 * paste needs a name; a name that is empty or already in `existingNames` (excluding
 * the edited server's own name) shows the name error and blocks Save — the existing
 * server is never overwritten (REQ-MC-011). All DOM is declarative Vue (no
 * `v-html`/`window.prompt`, NFR-MC-007); Escape cancels; fields are labelled
 * (REQ-MC-070). No server config value appears in any error (REQ-MC-072). No
 * `obsidian` import. Claudian ground-truth: `McpServerModal`.
 */
const props = defineProps<{
	input?: McpServerDraft;
	existingNames?: readonly string[];
}>();
const emit = defineEmits<{
	submit: [draft: McpServerDraft];
	cancel: [];
}>();

const { t } = useI18n();

const isEdit = computed(() => props.input !== undefined);
const name = ref(props.input?.name ?? '');
const configText = ref(props.input ? JSON.stringify(props.input.config, null, 2) : '');
const description = ref(props.input?.description ?? '');
const contextSaving = ref(props.input?.contextSaving ?? false);

const nameError = ref('');
const parseError = ref('');

const nameInput = ref<HTMLInputElement | null>(null);

onMounted(() => {
	nameInput.value?.focus();
});

const otherNames = computed(() =>
	(props.existingNames ?? []).filter((n) => n !== props.input?.name),
);

function onSave(): void {
	nameError.value = '';
	parseError.value = '';

	const parsed = parseClipboardConfig(configText.value);
	if (!parsed.ok) {
		parseError.value = t('agent.chat.mcp.modal.parseError', { reason: parsed.error.message });
		return;
	}
	// `parseClipboardConfig` only returns `ok` with at least one server (it errs on an
	// empty/invalid doc), so the first entry is the parsed server (SPEC-MC-004).
	const first = parsed.value.servers[0];

	// A parse that carried a name (format 1/3/4) seeds the name when the field is blank;
	// a format-2 (needsName) paste leaves it for the user (REQ-MC-043).
	const resolvedName = name.value.trim() !== '' ? name.value.trim() : first.name;

	if (resolvedName === '') {
		nameError.value = t('agent.chat.mcp.modal.nameRequired');
		nameInput.value?.focus();
		return;
	}
	if (otherNames.value.includes(resolvedName)) {
		nameError.value = t('agent.chat.mcp.modal.nameDuplicate', { name: resolvedName });
		nameInput.value?.focus();
		return;
	}

	const config: McpServerConfig = first.config;
	emit('submit', {
		name: resolvedName,
		config,
		description: description.value.trim() === '' ? undefined : description.value.trim(),
		contextSaving: contextSaving.value,
	});
}

function onCancel(): void {
	emit('cancel');
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		event.preventDefault();
		onCancel();
	}
}
</script>

<template>
	<div
		class="sp-mcp-modal"
		data-testid="mcp-server-modal"
		role="dialog"
		aria-modal="true"
		:aria-label="isEdit ? t('agent.chat.mcp.modal.editTitle') : t('agent.chat.mcp.modal.addTitle')"
		@keydown="onKeydown"
	>
		<h3 class="sp-mcp-modal__title">
			{{ isEdit ? t('agent.chat.mcp.modal.editTitle') : t('agent.chat.mcp.modal.addTitle') }}
		</h3>

		<label class="sp-mcp-modal__field">
			<span class="sp-mcp-modal__label">{{ t('agent.chat.mcp.modal.nameLabel') }}</span>
			<input
				ref="nameInput"
				v-model="name"
				type="text"
				data-testid="mcp-modal-name"
				:aria-invalid="nameError !== '' ? 'true' : undefined"
			/>
		</label>
		<p
			v-if="nameError !== ''"
			class="sp-mcp-modal__error"
			data-testid="mcp-modal-name-error"
			role="alert"
		>
			{{ nameError }}
		</p>

		<label class="sp-mcp-modal__field">
			<span class="sp-mcp-modal__label">{{ t('agent.chat.mcp.modal.configLabel') }}</span>
			<textarea
				v-model="configText"
				data-testid="mcp-modal-config"
				rows="6"
				:placeholder="t('agent.chat.mcp.modal.configPlaceholder')"
			></textarea>
		</label>
		<p
			v-if="parseError !== ''"
			class="sp-mcp-modal__error"
			data-testid="mcp-modal-parse-error"
			role="alert"
		>
			{{ parseError }}
		</p>

		<label class="sp-mcp-modal__field">
			<span class="sp-mcp-modal__label">{{ t('agent.chat.mcp.modal.descriptionLabel') }}</span>
			<input v-model="description" type="text" data-testid="mcp-modal-description" />
		</label>

		<label class="sp-mcp-modal__checkbox">
			<input v-model="contextSaving" type="checkbox" data-testid="mcp-modal-context-saving" />
			<span>{{ t('agent.chat.mcp.modal.contextSavingLabel') }}</span>
		</label>

		<div class="sp-mcp-modal__actions">
			<button type="button" data-testid="mcp-modal-cancel" @click="onCancel">
				{{ t('agent.chat.mcp.modal.cancel') }}
			</button>
			<button type="button" data-testid="mcp-modal-save" @click="onSave">
				{{ t('agent.chat.mcp.modal.save') }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.sp-mcp-modal {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-2);
	padding: var(--sp-space-3);
}

.sp-mcp-modal__title {
	margin: 0;
	font-size: var(--sp-font-size-md);
	font-weight: var(--sp-font-weight-semibold);
}

.sp-mcp-modal__field {
	display: flex;
	flex-direction: column;
	gap: var(--sp-space-1);
}

.sp-mcp-modal__label {
	font-size: var(--sp-font-size-sm);
	color: var(--sp-text-muted);
}

.sp-mcp-modal__checkbox {
	display: flex;
	align-items: center;
	gap: var(--sp-space-1);
	font-size: var(--sp-font-size-sm);
}

.sp-mcp-modal__error {
	margin: 0;
	font-size: var(--sp-font-size-sm);
	color: var(--sp-mcp-status-error);
}

.sp-mcp-modal__actions {
	display: flex;
	justify-content: flex-end;
	gap: var(--sp-space-2);
}
</style>
