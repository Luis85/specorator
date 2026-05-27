/**
 * T-AY-006 (RED -> verify) — forced-colors border controls exist in the mounted
 * surfaces (TEST-AY-006 mount leg). SPEC-AY-006, REQ-AY-006, NFR-AY-009.
 *
 * RG-4 in `accessibility.css` adds a `currentColor` border under
 * `forced-colors: active` to the background-cue-only controls (toggle switch,
 * state pills, file/image chips, tab badges, selected dropdown option). The
 * forced-colors *appearance* is the human TEST-AY-017 leg; this asserts the RG-4
 * selectors target REAL mounted controls, not dead selectors — each listed
 * control is present in the rendered DOM, and RG-4 enumerates a selector that
 * matches it. Queried by `data-testid` only (ADR-009).
 *
 * Traces: TEST-AY-006, SPEC-AY-006, REQ-AY-006, NFR-AY-009.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabBar from '@/ui/chat/TabBar.vue';
import ServiceTierToggle from '@/ui/chat/toolbar/ServiceTierToggle.vue';
import FileChips from '@/ui/chat/FileChips.vue';
import ImageThumb from '@/ui/chat/ImageThumb.vue';
import PermissionToggle from '@/ui/chat/toolbar/PermissionToggle.vue';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { ok } from '@/domain/shared/Result';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { AttachedFileRef, AttachedImage } from '@/domain/chat/attachments';
import { ForcedColorsControlsPageObject } from './forcedColorsControls.po';

const CSS_PATH = resolve(__dirname, '../../../src/ui/styles/accessibility.css');

/** Collect the body of the RG-4 forced-colors-border `@media` block. */
function rg4Block(): string {
	const css = readFileSync(CSS_PATH, 'utf8');
	const marker = css.indexOf('RG-4 - forced-colors border guarantee');
	expect(marker, 'RG-4 section marker present in accessibility.css').toBeGreaterThan(-1);
	const open = css.indexOf('@media', marker);
	// Walk balanced braces from the first `{` after the at-rule.
	const firstBrace = css.indexOf('{', open);
	let depth = 0;
	let end = firstBrace;
	for (let i = firstBrace; i < css.length; i++) {
		if (css[i] === '{') depth++;
		else if (css[i] === '}') {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	return css.slice(firstBrace, end + 1);
}

function bindStore(maxTabs = 3) {
	const store = useTabsStore();
	store.bindTabDeps({
		createRuntime: () => new MockChatRuntime([]),
		createRunner: (): ChatTurnRunner => ({
			run: vi.fn().mockResolvedValue(ok(undefined)),
			cancel: vi.fn(),
		}),
		notifyStartFailure: () => undefined,
		notifyInfo: () => undefined,
		history: new MockHistoryStore(),
		generateTitle: () => Promise.resolve(ok('title')),
		getMaxTabs: () => maxTabs,
	});
	return store;
}

const file: AttachedFileRef = { path: 'notes/a.md', displayName: 'a' };
const image: AttachedImage = {
	path: 'img/a.png',
	mimeType: 'image/png',
	byteSize: 4,
	dataBase64: 'AAAA',
};

describe('forced-colors RG-4 controls (TEST-AY-006 mount leg)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('tab badges carry .sp-tab + a data-state state pill (RG-4 .sp-tab / [data-state])', () => {
		bindStore();
		const wrapper = mount(TabBar, { global: { plugins: [i18n] } });
		const po = new ForcedColorsControlsPageObject(wrapper);
		expect(po.exists('tab-badge')).toBe(true);
		expect(po.classOf('tab-badge')).toContain('sp-tab');
		expect(po.dataState('tab-badge').length).toBeGreaterThan(0);
	});

	it('the service-tier toggle switch is a role=switch control (RG-4 toggle switch)', () => {
		const wrapper = mount(ServiceTierToggle, {
			props: {
				vm: {
					visibility: { kind: 'visible', enabled: true },
					descriptor: { activeValue: 'fast', inactiveValue: 'standard', label: 'Priority' },
					active: false,
				},
			},
			global: { plugins: [i18n] },
		});
		const po = new ForcedColorsControlsPageObject(wrapper);
		expect(po.exists('toolbar-service-tier')).toBe(true);
		expect(po.role('toolbar-service-tier')).toBe('switch');
	});

	it('file chips render as RG-4 chip controls', () => {
		const wrapper = mount(FileChips, { props: { files: [file] }, global: { plugins: [i18n] } });
		const po = new ForcedColorsControlsPageObject(wrapper);
		expect(po.exists('file-chip')).toBe(true);
	});

	it('image thumbs render as RG-4 chip controls', () => {
		const wrapper = mount(ImageThumb, {
			props: { image, resolveThumbSrc: () => 'blob:x' },
			global: { plugins: [i18n] },
		});
		const po = new ForcedColorsControlsPageObject(wrapper);
		expect(po.exists('image-thumb')).toBe(true);
	});

	it('the permission toggle exposes a selected role=option (RG-4 selected dropdown option)', () => {
		const wrapper = mount(PermissionToggle, {
			props: {
				vm: { visibility: { kind: 'visible', enabled: true }, plan: false, deferred: true },
				mode: 'normal',
			},
			global: { plugins: [i18n] },
		});
		const po = new ForcedColorsControlsPageObject(wrapper);
		expect(po.exists('toolbar-permission-option')).toBe(true);
		// At least one option is the selected option RG-4 targets.
		const count = po.count('toolbar-permission-option');
		const selected = Array.from({ length: count }).some(
			(_, i) =>
				po.roleAt('toolbar-permission-option', i) === 'option' &&
				po.ariaSelectedAt('toolbar-permission-option', i) === 'true',
		);
		expect(selected).toBe(true);
	});

	it('RG-4 enumerates a selector matching every mounted background-cue-only control', () => {
		const block = rg4Block();
		// state pills + tab badges + selected dropdown option already match real DOM.
		expect(block).toContain('[data-state]');
		expect(block).toContain('.sp-tab');
		expect(block).toContain('[role="option"][aria-selected="true"]');
		// the toggle switch is a role=switch in the real DOM (ServiceTier/Mode/Permission).
		expect(block).toContain('[role="switch"]');
		// the file/image chips carry these real classes in the real DOM.
		expect(block).toContain('.sp-file-chips__chip');
		expect(block).toContain('.sp-image-thumb');
	});
});
