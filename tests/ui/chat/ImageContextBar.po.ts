import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'image-context-bar',
	thumb: 'image-thumb',
	img: 'image-thumb-img',
	preview: 'image-thumb-preview',
	remove: 'image-thumb-remove',
} as const;

/** PageObject for `ImageContextBar.vue` (SPEC-CA-020). Queries by `data-testid` only (ADR-009). */
export class ImageContextBarPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	rootExists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	rootAriaLabel(): string {
		return this.wrapper.get(this.byTid(TID.root)).attributes('aria-label') ?? '';
	}

	thumbCount(): number {
		return this.wrapper.findAll(this.byTid(TID.thumb)).length;
	}

	imgSrc(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.img))[index].attributes('src') ?? '';
	}

	imgAlt(index: number): string {
		return this.wrapper.findAll(this.byTid(TID.img))[index].attributes('alt') ?? '';
	}

	async clickPreview(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.preview))[index].trigger('click');
	}

	async clickRemove(index: number): Promise<void> {
		await this.wrapper.findAll(this.byTid(TID.remove))[index].trigger('click');
	}
}
