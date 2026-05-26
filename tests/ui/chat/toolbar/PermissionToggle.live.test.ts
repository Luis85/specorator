/**
 * T-AS-022 (RED) — `PermissionToggle.vue` live three-mode (TEST-AS-001/002/003/006/
 * 050/051 A legs).
 *
 * SPEC-AS-012, REQ-AS-001/002/003/006/050/051. When the optional live `mode` prop is
 * supplied the P6 honest-defer disabled seam is REPLACED by a live three-mode control
 * (`normal`/`plan`/`yolo` — the fixed invariant, CLAR-AS-002): keyboard-operable
 * (focus, Enter/Space activate, Arrow keys cycle the three, Escape closes),
 * `role="listbox"` with `aria-selected` per the live mode + an accessible name, NO
 * `aria-disabled`, NO `permission.deferred` notice; `plan` is shown via the "PLAN"
 * label; selecting a mode emits `set(mode)`; switching the prop re-derives the active
 * mode; cues are text + border (never colour-only). Queried by `data-testid` only
 * (ADR-009). Additivity: a mount WITHOUT `mode` keeps the P6 disabled seam (covered by
 * the existing `PermissionToggle.test.ts`).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PermissionToggle from '@/ui/chat/toolbar/PermissionToggle.vue';
import { i18n } from '@/ui/i18n';
import type { PermissionWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import { PermissionTogglePageObject } from './PermissionToggle.po';

const visibleVm: PermissionWidgetVm = {
	visibility: { kind: 'visible', enabled: false },
	plan: false,
	deferred: true,
};

function mountLive(mode: PermissionMode) {
	const wrapper = mount(PermissionToggle, {
		props: { vm: visibleVm, mode },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new PermissionTogglePageObject(wrapper) };
}

describe('PermissionToggle live three-mode (SPEC-AS-012)', () => {
	it('renders the three fixed mode options when a live mode is supplied (TEST-AS-001)', () => {
		const { po } = mountLive('normal');
		expect(po.toggleExists()).toBe(true);
		expect(po.optionFor('normal')).toBe(true);
		expect(po.optionFor('plan')).toBe(true);
		expect(po.optionFor('yolo')).toBe(true);
		expect(po.role()).toBe('listbox');
	});

	it('exposes the active mode to AT and removes the P6 disabled seam (TEST-AS-050/051)', () => {
		const { po } = mountLive('yolo');
		expect(po.ariaDisabled()).toBe('');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
		expect(po.selectedMode()).toBe('yolo');
	});

	it('replaces the control with the PLAN label when the live mode is plan (TEST-AS-003)', () => {
		const { po } = mountLive('plan');
		expect(po.planExists()).toBe(true);
		expect(po.planText()).toContain('PLAN');
		expect(po.toggleExists()).toBe(false);
	});

	it('emits set(mode) when a mode option is activated (TEST-AS-002)', async () => {
		const { wrapper, po } = mountLive('normal');
		await po.clickOption('yolo');
		const emitted = wrapper.emitted('set');
		expect(emitted).toBeTruthy();
		expect(emitted?.[0]).toEqual(['yolo']);
	});

	it('cycles the focused option with Arrow keys and activates with Enter (TEST-AS-050)', async () => {
		const { wrapper, po } = mountLive('normal');
		await po.pressArrowDown();
		await po.pressEnter();
		const emitted = wrapper.emitted('set');
		expect(emitted).toBeTruthy();
		// normal → ArrowDown → plan
		expect(emitted?.[0]).toEqual(['plan']);
	});

	it('re-derives the active mode when the prop changes (TEST-AS-006)', async () => {
		const { wrapper, po } = mountLive('normal');
		expect(po.selectedMode()).toBe('normal');
		await wrapper.setProps({ mode: 'yolo' });
		expect(po.selectedMode()).toBe('yolo');
	});
});
