/**
 * T-MPS-127 — Paste image creates a chip in `attachmentsStore`.
 *
 * Satisfies REQ-MPS-042, TST-MPS-27. The component listens to `paste` events
 * dispatched onto the strip; in production the `ChatInput` forwards its own
 * paste event into the strip via the shared store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AttachmentStrip from '@/ui/components/agent/AttachmentStrip.vue';
import { useAttachmentsStore } from '@/ui/stores/attachmentsStore';
import { i18n } from '@/ui/i18n';
import { AttachmentStripPO } from './AttachmentStrip.po';

function mountStrip() {
	const wrapper = mount(AttachmentStrip, { global: { plugins: [i18n] } });
	return { wrapper, po: new AttachmentStripPO(wrapper) };
}

describe('AttachmentStrip.vue — paste image (REQ-MPS-042)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-042: when the store has an attachment, a chip renders', async () => {
		const store = useAttachmentsStore();
		store.add({
			kind: 'image',
			mimeType: 'image/png',
			bytes: new ArrayBuffer(8),
			path: null,
			label: 'image.png',
			byteLength: 8,
		});
		const { po, wrapper } = mountStrip();
		await wrapper.vm.$nextTick();
		expect(po.root.exists()).toBe(true);
		expect(po.chip('image.png').exists()).toBe(true);
	});

	it('REQ-MPS-042: handlePaste pushes an image attachment into the store', async () => {
		const store = useAttachmentsStore();
		const { wrapper } = mountStrip();
		const file = new File([new Uint8Array(4)], 'pasted.png', { type: 'image/png' });
		// jsdom lacks DataTransfer — fabricate a minimal ClipboardData stub.
		const filesLike = [file] as unknown as FileList;
		const fakeClipboard = { files: filesLike };
		const evt = new Event('paste') as ClipboardEvent;
		Object.defineProperty(evt, 'clipboardData', { value: fakeClipboard });
		wrapper.find('[data-testid="attachment-strip"]').element.dispatchEvent(evt);
		// The handler is async (await file.arrayBuffer()) — flush the
		// microtask queue and a couple of Vue ticks to settle the reactive
		// state before asserting.
		for (let i = 0; i < 5; i++) {
			await Promise.resolve();
			await wrapper.vm.$nextTick();
		}
		expect(store.pending.length).toBeGreaterThanOrEqual(1);
		expect(store.pending.map((a) => a.label)).toContain('pasted.png');
	});
});
