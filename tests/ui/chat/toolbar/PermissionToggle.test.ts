/**
 * T-TC-023 (RED) — `PermissionToggle.vue` honest-defer seam
 * (TEST-TC-015/016 A legs).
 *
 * SPEC-TC-015. Shows the PLAN label in place of the toggle when `vm.plan`
 * (EC-TC-5/REQ-TC-015); else a DISABLED toggle (`enabled:false`); activating the
 * deferred control surfaces a non-blocking `permission.deferred` notice (via an
 * injected `notify?` stub) and PERSISTS NO RULE, writes no `data.json`, gates no
 * tool call (REQ-TC-016, EC-TC-9); `role="switch"` `aria-disabled` + accessible
 * name (REQ-TC-041). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-015/016/041, SPEC-TC-015/029, NFR-TC-004/006/011.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PermissionToggle from '@/ui/chat/toolbar/PermissionToggle.vue';
import { i18n } from '@/ui/i18n';
import type { PermissionWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { NotificationPort } from '@/domain/ports';
import { PermissionTogglePageObject } from './PermissionToggle.po';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

function mountPermission(vm: PermissionWidgetVm, notify?: NotificationPort) {
	const wrapper = mount(PermissionToggle, {
		props: { vm, notify },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new PermissionTogglePageObject(wrapper) };
}

const visibleVm: PermissionWidgetVm = {
	visibility: { kind: 'visible', enabled: false },
	plan: false,
	deferred: true,
};

describe('PermissionToggle (SPEC-TC-015)', () => {
	it('shows the PLAN label in place of the toggle when plan is active (EC-TC-5)', () => {
		const { po } = mountPermission({ ...visibleVm, plan: true });
		expect(po.planExists()).toBe(true);
		expect(po.planText()).toContain('PLAN');
		expect(po.toggleExists()).toBe(false);
	});

	it('shows a disabled switch with an accessible name when not in plan (TEST-TC-015/041)', () => {
		const { po } = mountPermission(visibleVm);
		expect(po.toggleExists()).toBe(true);
		expect(po.role()).toBe('switch');
		expect(po.ariaDisabled()).toBe('true');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
	});

	it('activating the deferred control surfaces a non-blocking notice, persists no rule (TEST-TC-016)', async () => {
		const notify = fakeNotify();
		const { wrapper, po } = mountPermission(visibleVm, notify);
		await po.click();
		// Honest seam: a non-blocking info notice, no emitted rule/set/persist event
		// (the widget declares no custom emits — only the native click is captured).
		expect(notify.showInfo).toHaveBeenCalledOnce();
		expect(wrapper.emitted('set')).toBeUndefined();
		expect(wrapper.emitted('toggle')).toBeUndefined();
	});
});
