import { defineStore } from 'pinia';
import { ref } from 'vue';

import {
	ChatTransportError,
	type ChatTransportAttachment,
} from '@/domain/ports/ChatTransportPort';
import { err, ok, type Result } from '@/domain/shared/Result';

/** Single-attachment size cap per REQ-MPS-044. */
const FIVE_MB = 5 * 1024 * 1024;

/**
 * Pinia store for the per-turn draft attachments.
 *
 * `add` returns a `Result` so the UI can map `ATTACHMENT_TOO_LARGE` to a
 * non-blocking `NotificationPort.showWarning` instead of throwing. Vault
 * attachments are accepted regardless of byteLength because they are resolved
 * by the adapter and the size cap applies post-resolution.
 *
 * Satisfies REQ-MPS-042, REQ-MPS-043, REQ-MPS-044.
 */
export const useAttachmentsStore = defineStore('attachments', () => {
	const pending = ref<ReadonlyArray<ChatTransportAttachment>>([]);

	function add(a: ChatTransportAttachment): Result<void, ChatTransportError> {
		// Vault attachments defer the cap to the adapter (resolved bytes).
		if (a.kind !== 'vault' && a.byteLength > FIVE_MB) {
			return err(
				new ChatTransportError(
					'ATTACHMENT_TOO_LARGE',
					`Attachment ${a.label} (${a.byteLength} bytes) exceeds the 5 MB limit.`,
				),
			);
		}
		pending.value = [...pending.value, a];
		return ok(undefined);
	}

	function remove(label: string): void {
		pending.value = pending.value.filter((a) => a.label !== label);
	}

	function clear(): void {
		pending.value = [];
	}

	return { pending, add, remove, clear };
});
