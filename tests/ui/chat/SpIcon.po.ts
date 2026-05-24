import type { VueWrapper } from '@vue/test-utils';

const TID = {
	root: 'sp-icon',
} as const;

/** PageObject for `SpIcon.vue` (SPEC-RR-025). Queries by `data-testid` only (ADR-009). */
export class SpIconPageObject {
	constructor(private readonly wrapper: VueWrapper) {}

	private byTid(tid: string): string {
		return `[data-testid="${tid}"]`;
	}

	exists(): boolean {
		return this.wrapper.find(this.byTid(TID.root)).exists();
	}

	get root() {
		return this.wrapper.get(this.byTid(TID.root));
	}

	/** The rendered SVG element count under the icon root. */
	svgCount(): number {
		return this.wrapper.findAll('svg').length;
	}

	/** Tag names of the immediate SVG children (path/polyline/line/circle). */
	shapeTags(): string[] {
		const svg = this.wrapper.find('svg');
		if (!svg.exists()) return [];
		return Array.from(svg.element.children).map((c) => c.tagName.toLowerCase());
	}

	ariaHidden(): string {
		return this.root.attributes('aria-hidden') ?? '';
	}

	html(): string {
		return this.root.html();
	}
}
