/**
 * T-CA-033 (RED) — `ImageThumb.vue` (TEST-CA-009/011).
 *
 * SPEC-CA-020. A single thumbnail binds `<img :src="resolveThumbSrc(image.path)">`
 * DECLARATIVELY (no `v-html`/`innerHTML`, REQ-CA-011) with `alt` = the basename;
 * a preview affordance emits `preview` (REQ-CA-008); a remove control emits
 * `remove` (REQ-CA-009). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CA-008/009/011, NFR-CA-002/003/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ImageThumb from '@/ui/chat/ImageThumb.vue';
import { i18n } from '@/ui/i18n';
import type { AttachedImage } from '@/domain/chat/attachments';
import { ImageThumbPageObject } from './ImageThumb.po';

const image: AttachedImage = {
	path: 'assets/diagram.png',
	mimeType: 'image/png',
	byteSize: 1024,
	dataBase64: 'AAAA',
};

function mountThumb() {
	const wrapper = mount(ImageThumb, {
		props: { image, resolveThumbSrc: (path: string) => `app://resource/${path}` },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ImageThumbPageObject(wrapper) };
}

describe('ImageThumb (SPEC-CA-020)', () => {
	it('binds :src declaratively via resolveThumbSrc (TEST-CA-011, no v-html)', () => {
		const { po } = mountThumb();
		expect(po.rootExists()).toBe(true);
		expect(po.imgSrc()).toBe('app://resource/assets/diagram.png');
	});

	it('the alt text is the basename', () => {
		const { po } = mountThumb();
		expect(po.imgAlt()).toBe('diagram.png');
	});

	it('opening the thumb emits preview with the image (REQ-CA-008)', async () => {
		const { wrapper, po } = mountThumb();
		await po.clickPreview();
		expect(wrapper.emitted('preview')).toEqual([[image]]);
	});

	it('Enter/Space on the preview affordance emits preview', async () => {
		const { wrapper, po } = mountThumb();
		await po.pressPreview('Enter');
		expect(wrapper.emitted('preview')).toEqual([[image]]);
	});

	it('the remove control is labelled and emits remove with the path (REQ-CA-009)', async () => {
		const { wrapper, po } = mountThumb();
		expect(po.removeAriaLabel().length).toBeGreaterThan(0);
		await po.clickRemove();
		expect(wrapper.emitted('remove')).toEqual([['assets/diagram.png']]);
	});
});
