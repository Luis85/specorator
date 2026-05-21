<script setup lang="ts">
/**
 * `AttachmentStrip.vue` — chip strip above `ChatInput` showing the pending
 * draft attachments.
 *
 * Behaviour:
 *  - Renders a chip per `attachmentsStore.pending` entry with a remove button
 *    that calls `attachmentsStore.remove(label)`.
 *  - Listens for `paste` events on its root to push image/file attachments
 *    into the store (REQ-MPS-042).
 *  - Listens for `drop` events with the `application/x-obsidian-path`
 *    MIME marker to add `{ kind: 'vault', path }` attachments (REQ-MPS-043).
 *
 * Size-cap rejections are surfaced as a `NotificationPort.showWarning` via
 * the optional injected notification port; the chip is not added when the
 * store returns `ATTACHMENT_TOO_LARGE` (REQ-MPS-044).
 */
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { inject } from 'vue';
import { useAttachmentsStore } from '@/ui/stores/attachmentsStore';
import type { ChatTransportAttachment } from '@/domain/ports/ChatTransportPort';
import type { NotificationPort } from '@/domain/ports/NotificationPort';
import { NOTIFICATION_PORT } from '@/infrastructure/bridge/ports';

const { t } = useI18n();
const store = useAttachmentsStore();
const { pending } = storeToRefs(store);
const notifications = inject<NotificationPort | undefined>(NOTIFICATION_PORT, undefined);

async function fileToAttachment(file: File): Promise<ChatTransportAttachment> {
	const bytes = await file.arrayBuffer();
	const isImage = file.type.startsWith('image/');
	return {
		kind: isImage ? 'image' : 'file',
		mimeType: file.type,
		bytes,
		path: null,
		label: file.name,
		byteLength: file.size,
	};
}

async function pushFile(file: File): Promise<void> {
	const attachment = await fileToAttachment(file);
	const result = store.add(attachment);
	if (!result.ok) {
		notifications?.showWarning(t('attachment.tooLarge'));
	}
}

async function handlePaste(event: ClipboardEvent): Promise<void> {
	const items = event.clipboardData?.files;
	if (items === undefined || items.length === 0) return;
	for (const file of Array.from(items)) {
		await pushFile(file);
	}
}

function handleDragOver(event: DragEvent): void {
	if (event.dataTransfer === null) return;
	const hasVaultPath = Array.from(event.dataTransfer.types).includes(
		'application/x-obsidian-path',
	);
	const hasFiles = Array.from(event.dataTransfer.types).includes('Files');
	if (hasVaultPath || hasFiles) {
		event.preventDefault();
	}
}

async function handleDrop(event: DragEvent): Promise<void> {
	const dt = event.dataTransfer;
	if (dt === null) return;
	const vaultPath = dt.getData('application/x-obsidian-path');
	if (vaultPath !== '') {
		event.preventDefault();
		const label = vaultPath.split('/').pop() ?? vaultPath;
		store.add({
			kind: 'vault',
			mimeType: 'application/octet-stream',
			bytes: null,
			path: vaultPath,
			label,
			byteLength: 0,
		});
		return;
	}
	if (dt.files.length > 0) {
		event.preventDefault();
		for (const file of Array.from(dt.files)) {
			await pushFile(file);
		}
	}
}

function handleRemove(label: string): void {
	store.remove(label);
}
</script>

<template>
	<div
		class="sp-attachment-strip"
		:aria-label="t('attachment.stripAriaLabel')"
		data-testid="attachment-strip"
		@paste="handlePaste"
		@dragover="handleDragOver"
		@drop="handleDrop"
	>
		<span
			v-for="att in pending"
			:key="att.label"
			class="sp-attachment-strip__chip"
			:class="`sp-attachment-strip__chip--${att.kind}`"
			:data-testid="`attachment-chip-${att.label}`"
		>
			<span class="sp-attachment-strip__label">{{ att.label }}</span>
			<button
				type="button"
				class="sp-attachment-strip__remove"
				:aria-label="t('attachment.remove', { label: att.label })"
				:data-testid="`attachment-chip-remove-${att.label}`"
				@click="handleRemove(att.label ?? '')"
			>
				×
			</button>
		</span>
	</div>
</template>

<style scoped>
.sp-attachment-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
	min-height: 1.25rem;
}

.sp-attachment-strip__chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.125rem 0.375rem 0.125rem 0.5rem;
	border-radius: 999px;
	background: var(--background-secondary);
	border: 1px solid var(--background-modifier-border);
	font-size: 0.6875rem;
	color: var(--text-normal);
}

.sp-attachment-strip__chip--vault {
	background: var(--interactive-accent-translucent, var(--background-modifier-hover));
}

.sp-attachment-strip__label {
	font-family: var(--font-monospace);
}

.sp-attachment-strip__remove {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 1rem;
	height: 1rem;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: transparent;
	color: var(--text-muted);
	cursor: pointer;
	font-size: 0.875rem;
	line-height: 1;
}

.sp-attachment-strip__remove:hover {
	background: var(--background-modifier-hover);
	color: var(--text-normal);
}
</style>
