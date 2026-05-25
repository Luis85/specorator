import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'image-thumb',
	img: 'image-thumb-img',
	preview: 'image-thumb-preview',
	remove: 'image-thumb-remove',
} as const;

/** PageObject for `ImageThumb.vue` (SPEC-CA-020). Queries by `data-testid` only (ADR-009). */
export class ImageThumbPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	imgSrc(): string {
		return this.wrapper.get(this.byTid(TID.img)).attributes('src') ?? '';
	}

	imgAlt(): string {
		return this.wrapper.get(this.byTid(TID.img)).attributes('alt') ?? '';
	}

	previewAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.preview)).attributes('aria-label') ?? '';
	}

	removeAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.remove)).attributes('aria-label') ?? '';
	}

	async clickPreview(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.preview)).trigger('click');
	}

	async pressPreview(key: string): Promise<void> {
		await this.wrapper.get(this.byTid(TID.preview)).trigger('keydown', { key });
	}

	async clickRemove(): Promise<void> {
		await this.wrapper.get(this.byTid(TID.remove)).trigger('click');
	}
}
