/**
 * T-MPS-125 — `attachmentsStore.add` rejects attachments larger than 5 MB.
 *
 * Satisfies REQ-MPS-044, TST-MPS-29.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAttachmentsStore } from '@/ui/stores/attachmentsStore';
import type { ChatTransportAttachment } from '@/domain/ports/ChatTransportPort';

const FIVE_MB = 5 * 1024 * 1024;

function makeAttachment(label: string, byteLength: number): ChatTransportAttachment {
	return {
		kind: 'image',
		mimeType: 'image/png',
		bytes: new ArrayBuffer(0),
		path: null,
		label,
		byteLength,
	};
}

describe('useAttachmentsStore() — size cap', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('starts with an empty pending list', () => {
		const store = useAttachmentsStore();
		expect(store.pending).toEqual([]);
	});

	it('REQ-MPS-044: accepts an attachment at the 5 MB boundary', () => {
		const store = useAttachmentsStore();
		const result = store.add(makeAttachment('ok.png', FIVE_MB));
		expect(result.ok).toBe(true);
		expect(store.pending).toHaveLength(1);
	});

	it('REQ-MPS-044, TST-MPS-29: rejects > 5 MB with ATTACHMENT_TOO_LARGE', () => {
		const store = useAttachmentsStore();
		const result = store.add(makeAttachment('huge.png', FIVE_MB + 1));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.errorCode).toBe('ATTACHMENT_TOO_LARGE');
		}
		expect(store.pending).toEqual([]);
	});

	it('remove(label) drops one entry; clear empties the list', () => {
		const store = useAttachmentsStore();
		store.add(makeAttachment('a.png', 10));
		store.add(makeAttachment('b.png', 10));
		store.remove('a.png');
		expect(store.pending.map((p) => p.label)).toEqual(['b.png']);
		store.clear();
		expect(store.pending).toEqual([]);
	});
});
