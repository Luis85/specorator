/**
 * T-CA-031 (RED) — `FileChips.vue` removable wikilink file chips
 * (TEST-CA-001/003 A legs, TEST-CA-005, TEST-CA-031 file leg).
 *
 * SPEC-CA-019. Renders one chip per `AttachedFileRef` showing `displayName`,
 * reads as the wikilink `[[path]]` via a declarative attribute (no raw HTML),
 * is keyboard-activatable (Enter/Space → `open`, REQ-CA-005), and has a labelled
 * remove control (Enter/Space → `remove`, REQ-CA-003). EC-CA-14: a `<script>` in
 * a path renders verbatim as text (no `v-html`/`innerHTML`). Queried by
 * `data-testid` only (ADR-009).
 *
 * Traces: REQ-CA-001/003/005, NFR-CA-002/003/005/008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileChips from '@/ui/chat/FileChips.vue';
import { i18n } from '@/ui/i18n';
import type { AttachedFileRef } from '@/domain/chat/attachments';
import { FileChipsPageObject } from './FileChips.po';

function mountChips(files: readonly AttachedFileRef[]) {
	const wrapper = mount(FileChips, {
		props: { files },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new FileChipsPageObject(wrapper) };
}

const files: AttachedFileRef[] = [
	{ path: 'notes/alpha.md', displayName: 'alpha' },
	{ path: 'folder/beta.canvas', displayName: 'beta' },
];

describe('FileChips (SPEC-CA-019)', () => {
	it('renders one chip per file showing the displayName (TEST-CA-001/003 A leg)', () => {
		const { po } = mountChips(files);
		expect(po.rootExists()).toBe(true);
		expect(po.chipCount()).toBe(2);
		expect(po.linkText(0)).toBe('alpha');
		expect(po.linkText(1)).toBe('beta');
	});

	it('exposes the wikilink [[path]] form declaratively (not raw HTML)', () => {
		const { po } = mountChips(files);
		expect(po.linkTitle(0)).toBe('[[notes/alpha.md]]');
	});

	it('the root is a labelled list/toolbar', () => {
		const { po } = mountChips(files);
		expect(po.rootAriaLabel().length).toBeGreaterThan(0);
	});

	it('Enter on a chip emits open with the path (TEST-CA-005, keyboard)', async () => {
		const { wrapper, po } = mountChips(files);
		await po.pressKeyLink(0, 'Enter');
		expect(wrapper.emitted('open')).toEqual([['notes/alpha.md']]);
	});

	it('Space on a chip emits open with the path (TEST-CA-005, keyboard)', async () => {
		const { wrapper, po } = mountChips(files);
		await po.pressKeyLink(1, ' ');
		expect(wrapper.emitted('open')).toEqual([['folder/beta.canvas']]);
	});

	it('clicking a chip emits open', async () => {
		const { wrapper, po } = mountChips(files);
		await po.clickLink(0);
		expect(wrapper.emitted('open')).toEqual([['notes/alpha.md']]);
	});

	it('the remove control is labelled and emits remove on click (REQ-CA-003)', async () => {
		const { wrapper, po } = mountChips(files);
		expect(po.removeAriaLabel(0).length).toBeGreaterThan(0);
		await po.clickRemove(0);
		expect(wrapper.emitted('remove')).toEqual([['notes/alpha.md']]);
	});

	it('Enter/Space on the remove control emits remove', async () => {
		const { wrapper, po } = mountChips(files);
		await po.pressKeyRemove(1, 'Enter');
		expect(wrapper.emitted('remove')).toEqual([['folder/beta.canvas']]);
	});

	it('EC-CA-14: a <script> in a path renders verbatim as text (no v-html/innerHTML)', () => {
		const malicious: AttachedFileRef[] = [
			{ path: 'x/<script>alert(1)</script>.md', displayName: '<script>alert(1)</script>' },
		];
		const { wrapper, po } = mountChips(malicious);
		// The displayName is shown as text…
		expect(po.linkText(0)).toContain('<script>alert(1)</script>');
		// …rendered escaped in the text node (no `v-html`/`innerHTML`)…
		expect(po.rootHtml()).toContain('&lt;script&gt;');
		// …and no live <script> ELEMENT was parsed into the DOM.
		expect(wrapper.find('script').exists()).toBe(false);
	});

	it('renders nothing-but-an-empty-root when there are no files', () => {
		const { po } = mountChips([]);
		expect(po.chipCount()).toBe(0);
	});
});
