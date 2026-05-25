<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { AttachedFileRef } from '@/domain/chat/attachments';

/**
 * The attached-file context chips (SPEC-CA-019, REQ-CA-001/003/005). Renders the
 * attached-file set as a row of removable chips. Each chip shows `displayName`
 * (basename-no-ext) and carries the wikilink form `[[path]]` on a declarative
 * `title` attribute (no raw HTML — NFR-CA-003); the chip is a button, so
 * Enter/Space activate `open` (REQ-CA-005). A labelled remove button (`aria-label`,
 * Enter/Space → `remove`, REQ-CA-003) sits at the chip end. The parent wires
 * `open` to `WorkspacePort.openFile(path)` so the component stays obsidian-free
 * (NFR-CA-002). Chips live in a labelled list (DESIGN-CA-001 A.5). No `v-html`;
 * no `window.confirm`/`alert`/`prompt`. Claudian ground-truth: `FileChipsView.ts`.
 */
defineProps<{ files: readonly AttachedFileRef[] }>();
const emit = defineEmits<{ remove: [path: string]; open: [path: string] }>();

const { t } = useI18n();

/** Enter/Space activate a button-role element (native `<button>` already does this on Enter/Space). */
function onLinkKeydown(event: KeyboardEvent, path: string): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		emit('open', path);
	}
}

function onRemoveKeydown(event: KeyboardEvent, path: string): void {
	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		emit('remove', path);
	}
}
</script>

<template>
	<ul class="sp-file-chips" data-testid="file-chips" :aria-label="t('agent.chat.context.files.label')">
		<li v-for="file in files" :key="file.path" class="sp-file-chips__chip" data-testid="file-chip">
			<button
				type="button"
				class="sp-file-chips__link"
				data-testid="file-chip-link"
				:title="`[[${file.path}]]`"
				:aria-label="t('agent.chat.context.files.open', { name: file.displayName })"
				@click="emit('open', file.path)"
				@keydown="onLinkKeydown($event, file.path)"
			>
				<span class="sp-file-chips__name" dir="auto">{{ file.displayName }}</span>
			</button>
			<button
				type="button"
				class="sp-file-chips__remove"
				data-testid="file-chip-remove"
				:aria-label="t('agent.chat.context.files.remove', { name: file.displayName })"
				@click="emit('remove', file.path)"
				@keydown="onRemoveKeydown($event, file.path)"
			>
				<span aria-hidden="true">×</span>
			</button>
		</li>
	</ul>
</template>

<style scoped>
.sp-file-chips {
	display: flex;
	flex-wrap: wrap;
	gap: var(--sp-context-bar-gap);
	margin: 0;
	padding: 0;
	list-style: none;
}

.sp-file-chips__chip {
	display: inline-flex;
	align-items: center;
	gap: var(--sp-space-1);
	border: 1px solid var(--sp-chip-border);
	border-radius: var(--sp-chip-radius);
	background: var(--sp-chip-bg);
	padding-inline: var(--sp-space-2);
}

.sp-file-chips__link {
	border: none;
	background: transparent;
	color: var(--sp-text-normal);
	font-size: var(--sp-font-size-sm);
	cursor: pointer;
	padding-block: var(--sp-space-1);
}

.sp-file-chips__name {
	unicode-bidi: plaintext;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	max-inline-size: 18ch;
}

.sp-file-chips__remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	border: none;
	background: transparent;
	color: var(--sp-text-muted);
	cursor: pointer;
	line-height: 1;
}

.sp-file-chips__remove:hover {
	color: var(--sp-text-normal);
}
</style>
