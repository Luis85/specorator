/**
 * T-TC-025 (RED) — `ToolbarStrip.vue` container (TEST-TC-001 A leg).
 *
 * SPEC-TC-012. Lays the leaf widgets in Claudian order (model · mode · permission
 * · thinking · service-tier · MCP · external grouped leading, the meter pinned
 * trailing), renders each leaf ONLY per its `vm.<widget>.visibility.kind ===
 * 'visible'' (a hidden widget's slot collapses — no dead button, REQ-TC-019/021),
 * and re-emits the four backed widget changes (`pick-model`/`set-mode`/
 * `set-reasoning`/`toggle-service-tier`) up (REQ-TC-001/003); the strip is the
 * only capability-reader. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-001/003, SPEC-TC-012, NFR-TC-006/008/009.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ToolbarStrip from '@/ui/chat/toolbar/ToolbarStrip.vue';
import { i18n } from '@/ui/i18n';
import type { ToolbarViewModel } from '@/application/chat/toolbar/buildToolbarViewModel';
import { ToolbarStripPageObject } from './ToolbarStrip.po';

const visible = { kind: 'visible', enabled: true } as const;

/** A full view-model with every widget visible (the maximal strip). */
function fullVm(): ToolbarViewModel {
	return {
		model: {
			visibility: visible,
			options: [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Beta' },
			],
			selectedId: 'a',
			emptyNotice: false,
		},
		mode: {
			visibility: visible,
			descriptor: {
				activeValue: 'accept',
				inactiveValue: 'default',
				activeLabel: 'Accept',
				inactiveLabel: 'Default',
			},
			activeValue: 'default',
		},
		permission: { visibility: { kind: 'visible', enabled: false }, plan: false, deferred: true },
		thinking: {
			visibility: visible,
			control: 'effort',
			options: [
				{ kind: 'effort', value: 'high' },
				{ kind: 'effort', value: 'low' },
			],
			selected: { kind: 'effort', value: 'high' },
		},
		serviceTier: {
			visibility: visible,
			descriptor: { activeValue: 'fast', inactiveValue: 'standard', label: 'Priority' },
			active: false,
		},
		mcp: { visibility: { kind: 'visible', enabled: false }, empty: true },
		external: { visibility: { kind: 'visible', enabled: false }, deferred: true },
		usage: { visibility: visible, percentage: 42, warning: false },
	};
}

function mountStrip(vm: ToolbarViewModel) {
	const wrapper = mount(ToolbarStrip, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ToolbarStripPageObject(wrapper) };
}

describe('ToolbarStrip (SPEC-TC-012)', () => {
	it('lays the eight widget regions in Claudian order (TEST-TC-001)', () => {
		const { po } = mountStrip(fullVm());
		expect(po.rootExists()).toBe(true);
		expect(po.widgetOrder()).toEqual([
			'toolbar-model',
			'toolbar-mode',
			'toolbar-permission',
			'toolbar-thinking',
			'toolbar-service-tier',
			'toolbar-mcp',
			'toolbar-external',
			'toolbar-usage',
		]);
	});

	it('collapses a hidden widget slot — no dead button (REQ-TC-019/021)', () => {
		const vm = fullVm();
		vm.serviceTier = { visibility: { kind: 'hidden' }, active: false };
		vm.mcp = { visibility: { kind: 'hidden' }, empty: true };
		const { po } = mountStrip(vm);
		expect(po.has('serviceTier')).toBe(false);
		expect(po.has('mcp')).toBe(false);
		// The backed + always-on widgets remain.
		expect(po.has('model')).toBe(true);
		expect(po.has('external')).toBe(true);
	});

	it('re-emits pick-model from the model child (REQ-TC-001/003)', async () => {
		const { wrapper, po } = mountStrip(fullVm());
		await po.clickModelButton();
		await po.clickModelOption(1);
		expect(wrapper.emitted('pick-model')?.[0]).toEqual(['b']);
	});

	it('re-emits set-mode from the mode child', async () => {
		const { wrapper, po } = mountStrip(fullVm());
		await po.clickMode();
		expect(wrapper.emitted('set-mode')?.[0]).toEqual(['accept']);
	});

	it('re-emits toggle-service-tier from the service-tier child', async () => {
		const { wrapper, po } = mountStrip(fullVm());
		await po.clickServiceTier();
		expect(wrapper.emitted('toggle-service-tier')?.[0]).toEqual([true]);
	});
});
