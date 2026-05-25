/**
 * T-CA-033 (RED) — `ImageContextBar.vue` (TEST-CA-007 A leg, TEST-CA-009/011).
 *
 * SPEC-CA-020. Renders one `ImageThumb` per `AttachedImage`, binding `:src` via
 * the injected `resolveThumbSrc` callback (the component never imports
 * `obsidian`). Opening a thumb emits `preview: [image]`; removing emits
 * `remove: [path]`. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CA-007/008/009/011, NFR-CA-002/003/005/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ImageContextBar from '@/ui/chat/ImageContextBar.vue';
import { i18n } from '@/ui/i18n';
import type { AttachedImage } from '@/domain/chat/attachments';
import { ImageContextBarPageObject } from './ImageContextBar.po';

const images: AttachedImage[] = [
	{ path: 'a/one.png', mimeType: 'image/png', byteSize: 10, dataBase64: 'AAA' },
	{ path: 'b/two.webp', mimeType: 'image/webp', byteSize: 20, dataBase64: 'BBB' },
];

function mountBar(list: readonly AttachedImage[] = images) {
	const wrapper = mount(ImageContextBar, {
		props: { images: list, resolveThumbSrc: (path: string) => `app://resource/${path}` },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ImageContextBarPageObject(wrapper) };
}

describe('ImageContextBar (SPEC-CA-020)', () => {
	it('renders one thumb per image with declarative :src (TEST-CA-007 A leg, TEST-CA-011)', () => {
		const { po } = mountBar();
		expect(po.rootExists()).toBe(true);
		expect(po.thumbCount()).toBe(2);
		expect(po.imgSrc(0)).toBe('app://resource/a/one.png');
		expect(po.imgSrc(1)).toBe('app://resource/b/two.webp');
	});

	it('the alt is the basename', () => {
		const { po } = mountBar();
		expect(po.imgAlt(0)).toBe('one.png');
	});

	it('the bar is labelled', () => {
		const { po } = mountBar();
		expect(po.rootAriaLabel().length).toBeGreaterThan(0);
	});

	it('opening a thumb emits preview with that image (REQ-CA-008)', async () => {
		const { wrapper, po } = mountBar();
		await po.clickPreview(1);
		expect(wrapper.emitted('preview')).toEqual([[images[1]]]);
	});

	it('removing a thumb emits remove with the path (TEST-CA-009, REQ-CA-009)', async () => {
		const { wrapper, po } = mountBar();
		await po.clickRemove(0);
		expect(wrapper.emitted('remove')).toEqual([['a/one.png']]);
	});

	it('renders an empty bar when there are no images', () => {
		const { po } = mountBar([]);
		expect(po.thumbCount()).toBe(0);
	});
});
