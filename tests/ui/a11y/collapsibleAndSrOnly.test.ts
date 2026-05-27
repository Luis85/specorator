/**
 * T-AY-009 (RED -> verify) — collapsible `aria-expanded` flips + accessible name
 * (TEST-AY-011); icon-only controls expose an `.sr-only`/`aria-label` name with
 * zero visible footprint (TEST-AY-009 mount leg). SPEC-AY-005, SPEC-AY-007,
 * REQ-AY-009, REQ-AY-011, EC-AY-007.
 *
 * The RG-6 `.sr-only` clip technique file-read leg rides T-AY-003. This mount leg
 * asserts: (a) a collapsible header (`SpCollapsible`, reused by every rich block:
 * tool call / thinking / subagent / write-edit) exposes `aria-expanded` that
 * FLIPS on Enter/Space/click and an accessible name; and (b) icon-only controls
 * carry an accessible name via `aria-label` while their decorative glyph is
 * `aria-hidden="true"` (excluded from the accessibility tree). Verify-only: every
 * collapsible uses `SpCollapsible` (which already binds `aria-expanded` + a
 * dynamic `aria-label`), and every icon-only control already labels itself.
 * Queried by `data-testid` only (ADR-009).
 *
 * Traces: TEST-AY-011, TEST-AY-009, SPEC-AY-005, SPEC-AY-007, REQ-AY-009/011,
 * EC-AY-007.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { h } from 'vue';
import SpCollapsible from '@/ui/chat/SpCollapsible.vue';
import ToolCallBlock from '@/ui/chat/ToolCallBlock.vue';
import FileChips from '@/ui/chat/FileChips.vue';
import ImageThumb from '@/ui/chat/ImageThumb.vue';
import { i18n } from '@/ui/i18n';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import type { ToolCall } from '@/domain/chat/ToolCall';
import type { AttachedFileRef, AttachedImage } from '@/domain/chat/attachments';
import { SpCollapsiblePageObject } from '../chat/SpCollapsible.po';
import { ToolCallBlockPageObject } from '../chat/ToolCallBlock.po';
import { IconOnlyControlPageObject } from './collapsibleAndSrOnly.po';

function mountCollapsible() {
	const wrapper = mount(SpCollapsible, {
		props: { label: 'Tool call' },
		slots: { header: () => h('span', 'Header'), default: () => h('span', 'Body') },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new SpCollapsiblePageObject(wrapper) };
}

const toolCall: ToolCall = {
	id: 't1',
	name: 'Read',
	input: { file_path: 'src/a.ts' },
	status: 'completed',
	result: 'ok',
};

const file: AttachedFileRef = { path: 'notes/a.md', displayName: 'a' };
const image: AttachedImage = {
	path: 'img/a.png',
	mimeType: 'image/png',
	byteSize: 4,
	dataBase64: 'AAAA',
};

describe('collapsible aria-expanded (TEST-AY-011)', () => {
	it('starts collapsed with aria-expanded=false and an accessible name', () => {
		const { po } = mountCollapsible();
		expect(po.role()).toBe('button');
		expect(po.tabindex()).toBe('0');
		expect(po.ariaExpanded()).toBe('false');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
	});

	it('flips aria-expanded on click', async () => {
		const { po } = mountCollapsible();
		await po.clickHeader();
		expect(po.ariaExpanded()).toBe('true');
		await po.clickHeader();
		expect(po.ariaExpanded()).toBe('false');
	});

	it('flips aria-expanded on Enter and Space', async () => {
		const { po } = mountCollapsible();
		await po.pressEnter();
		expect(po.ariaExpanded()).toBe('true');
		await po.pressSpace();
		expect(po.ariaExpanded()).toBe('false');
	});

	it('a rich-render block (ToolCallBlock) exposes the collapsible aria-expanded + name', async () => {
		const wrapper = mount(ToolCallBlock, {
			props: { toolCall },
			global: { plugins: [i18n], provide: { [ICON_PORT as symbol]: staticIconPort } },
		});
		const po = new ToolCallBlockPageObject(wrapper);
		const collapsible = new SpCollapsiblePageObject(wrapper);
		expect(po.collapsibleAriaLabel().length).toBeGreaterThan(0);
		expect(collapsible.ariaExpanded()).toBe('false');
		await collapsible.clickHeader();
		expect(collapsible.ariaExpanded()).toBe('true');
	});
});

describe('icon-only control accessible names (TEST-AY-009 mount leg)', () => {
	it('file chip remove carries an aria-label + an aria-hidden decorative glyph', () => {
		const wrapper = mount(FileChips, { props: { files: [file] }, global: { plugins: [i18n] } });
		const po = new IconOnlyControlPageObject(wrapper);
		expect(po.exists('file-chip-remove')).toBe(true);
		expect(po.ariaLabel('file-chip-remove').length).toBeGreaterThan(0);
		expect(po.decorativeGlyphHidden('file-chip-remove')).toBe(true);
	});

	it('image thumb remove carries an aria-label + an aria-hidden decorative glyph', () => {
		const wrapper = mount(ImageThumb, {
			props: { image, resolveThumbSrc: () => 'blob:x' },
			global: { plugins: [i18n] },
		});
		const po = new IconOnlyControlPageObject(wrapper);
		expect(po.exists('image-thumb-remove')).toBe(true);
		expect(po.ariaLabel('image-thumb-remove').length).toBeGreaterThan(0);
		expect(po.decorativeGlyphHidden('image-thumb-remove')).toBe(true);
	});
});
