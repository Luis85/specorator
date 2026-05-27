/**
 * T-AY-007 (RED -> verify) — focus-visible ring reachability + keyboard
 * operability + accessible names across the toolbar / composer / chat controls
 * (TEST-AY-007 mount leg + TEST-AY-008). SPEC-AY-007, SPEC-AY-008, REQ-AY-007/008.
 *
 * The RG-5 file-read leg (`:focus-visible` + `--sp-focus-ring`, no bare `:focus`)
 * rides T-AY-003. This mount leg asserts (a) each audited interactive control
 * matches the RG-5 focus-visible target selector (so the keyboard ring reaches
 * it — a custom control carries `tabindex`/`role`), and (b) every audited control
 * exposes a non-empty accessible name (visible label, `aria-label`, or `.sr-only`)
 * — REQ-AY-008. The mouse-`:focus`-shows-no-stray-ring counter-metric (EC-AY-006)
 * is the RG-5 `:focus-visible` discipline, asserted structurally in T-AY-003 (the
 * rule never uses bare `:focus`). Queried by `data-testid` only (ADR-009).
 *
 * Traces: TEST-AY-007, TEST-AY-008, SPEC-AY-007, SPEC-AY-008, REQ-AY-007/008,
 * NFR-AY-001, EC-AY-005, EC-AY-006.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabBar from '@/ui/chat/TabBar.vue';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import FileChips from '@/ui/chat/FileChips.vue';
import ImageThumb from '@/ui/chat/ImageThumb.vue';
import ServiceTierToggle from '@/ui/chat/toolbar/ServiceTierToggle.vue';
import PermissionToggle from '@/ui/chat/toolbar/PermissionToggle.vue';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { ok } from '@/domain/shared/Result';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { AttachedFileRef, AttachedImage } from '@/domain/chat/attachments';
import { KeyboardAndLabelsPageObject } from './keyboardAndLabels.po';

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

describe('keyboard operability + accessible names (TEST-AY-007/008)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('TabBar controls (badge, close, new) are focus-reachable with accessible names', () => {
		bindStore();
		const wrapper = mount(TabBar, { global: { plugins: [i18n] } });
		const po = new KeyboardAndLabelsPageObject(wrapper);
		// The badge is a role=tab carrying tabindex (roving) -> matches RG-5.
		expect(po.isFocusReachable('tab-badge')).toBe(true);
		expect(po.accessibleName('tab-badge').length).toBeGreaterThan(0);
		// Close + new are native buttons -> match RG-5; both carry aria-label.
		expect(po.isFocusReachable('tab-close')).toBe(true);
		expect(po.accessibleName('tab-close').length).toBeGreaterThan(0);
		expect(po.isFocusReachable('tab-new')).toBe(true);
		expect(po.accessibleName('tab-new').length).toBeGreaterThan(0);
	});

	it('composer textarea, attach, and send are focus-reachable with accessible names', () => {
		const wrapper = mount(ChatComposer, {
			props: { isStreaming: false },
			global: { plugins: [i18n] },
		});
		const po = new KeyboardAndLabelsPageObject(wrapper);
		// The textarea is a native textarea -> matches RG-5; placeholder is set.
		expect(po.isFocusReachable('composer-textarea')).toBe(true);
		// The paperclip + send are icon-only buttons -> need a non-empty aria-label.
		expect(po.isFocusReachable('composer-attach')).toBe(true);
		expect(po.accessibleName('composer-attach').length).toBeGreaterThan(0);
		expect(po.isFocusReachable('composer-send')).toBe(true);
		expect(po.accessibleName('composer-send').length).toBeGreaterThan(0);
	});

	it('file chip link + remove are focus-reachable with accessible names', () => {
		const wrapper = mount(FileChips, { props: { files: [file] }, global: { plugins: [i18n] } });
		const po = new KeyboardAndLabelsPageObject(wrapper);
		expect(po.isFocusReachable('file-chip-link')).toBe(true);
		expect(po.accessibleName('file-chip-link').length).toBeGreaterThan(0);
		expect(po.isFocusReachable('file-chip-remove')).toBe(true);
		expect(po.accessibleName('file-chip-remove').length).toBeGreaterThan(0);
	});

	it('image thumb preview + remove are focus-reachable with accessible names', () => {
		const wrapper = mount(ImageThumb, {
			props: { image, resolveThumbSrc: () => 'blob:x' },
			global: { plugins: [i18n] },
		});
		const po = new KeyboardAndLabelsPageObject(wrapper);
		expect(po.isFocusReachable('image-thumb-preview')).toBe(true);
		expect(po.accessibleName('image-thumb-preview').length).toBeGreaterThan(0);
		expect(po.isFocusReachable('image-thumb-remove')).toBe(true);
		expect(po.accessibleName('image-thumb-remove').length).toBeGreaterThan(0);
	});

	it('toolbar switches expose role + accessible name and are focus-reachable', () => {
		const tier = mount(ServiceTierToggle, {
			props: {
				vm: {
					visibility: { kind: 'visible', enabled: true },
					descriptor: { activeValue: 'fast', inactiveValue: 'standard', label: 'Priority' },
					active: false,
				},
			},
			global: { plugins: [i18n] },
		});
		const tierPo = new KeyboardAndLabelsPageObject(tier);
		expect(tierPo.isFocusReachable('toolbar-service-tier')).toBe(true);
		expect(tierPo.accessibleName('toolbar-service-tier').length).toBeGreaterThan(0);

		const perm = mount(PermissionToggle, {
			props: {
				vm: { visibility: { kind: 'visible', enabled: true }, plan: false, deferred: true },
				mode: 'normal',
			},
			global: { plugins: [i18n] },
		});
		const permPo = new KeyboardAndLabelsPageObject(perm);
		// The live listbox is tabindex=0 -> matches RG-5; options are role=option.
		expect(permPo.isFocusReachable('toolbar-permission')).toBe(true);
		expect(permPo.accessibleName('toolbar-permission').length).toBeGreaterThan(0);
		expect(permPo.isFocusReachable('toolbar-permission-option')).toBe(true);
		expect(permPo.accessibleNameAt('toolbar-permission-option', 0).length).toBeGreaterThan(0);
	});
});
