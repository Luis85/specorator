/**
 * T-MPS-128 — Drag-drop a vault file → `{ kind: 'vault', path }` chip.
 *
 * Satisfies REQ-MPS-043, TST-MPS-28.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import AttachmentStrip from '@/ui/components/agent/AttachmentStrip.vue';
import { useAttachmentsStore } from '@/ui/stores/attachmentsStore';
import { i18n } from '@/ui/i18n';

function mountStrip() {
	return mount(AttachmentStrip, { global: { plugins: [i18n] } });
}

describe('AttachmentStrip.vue — drag-drop vault file (REQ-MPS-043)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('REQ-MPS-043: dropping a vault payload creates a vault-kind chip', async () => {
		const store = useAttachmentsStore();
		const wrapper = mountStrip();
		const root = wrapper.find('[data-testid="attachment-strip"]')
			.element as HTMLElement;
		// jsdom lacks DataTransfer — fabricate a minimal stub matching the API.
		const fakeDt = {
			types: ['application/x-obsidian-path'],
			files: { length: 0 } as unknown as FileList,
			getData: (type: string): string =>
				type === 'application/x-obsidian-path' ? 'specs/foo/spec.md' : '',
		};
		const evt = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
		Object.defineProperty(evt, 'dataTransfer', { value: fakeDt });
		root.dispatchEvent(evt);
		await wrapper.vm.$nextTick();
		const vault = store.pending.find((a) => a.kind === 'vault');
		expect(vault).toBeDefined();
		expect(vault?.path).toBe('specs/foo/spec.md');
		expect(vault?.label).toContain('spec.md');
	});
});
