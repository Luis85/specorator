/**
 * T-TC-023 (RED) — `ExternalContextControl.vue` honest-defer seam
 * (TEST-TC-023 A leg).
 *
 * SPEC-TC-019. Always renders a DISABLED paperclip-folder control; activating it
 * surfaces a non-blocking `external.deferred` notice and OPENS NO PICKER, adds no
 * path, writes no `externalContextPaths` (REQ-TC-023, EC-TC-9; no
 * `require('electron')`, no `FilePickerPort`). Queried by `data-testid` only
 * (ADR-009).
 *
 * Traces: REQ-TC-023, SPEC-TC-019/029, NFR-TC-004/006/011.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ExternalContextControl from '@/ui/chat/toolbar/ExternalContextControl.vue';
import { i18n } from '@/ui/i18n';
import type { ExternalWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import type { NotificationPort } from '@/domain/ports';
import { ExternalContextControlPageObject } from './ExternalContextControl.po';

function fakeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

function mountExternal(notify?: NotificationPort) {
	const vm: ExternalWidgetVm = { visibility: { kind: 'visible', enabled: false }, deferred: true };
	const wrapper = mount(ExternalContextControl, {
		props: { vm, notify },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ExternalContextControlPageObject(wrapper) };
}

describe('ExternalContextControl (SPEC-TC-019)', () => {
	it('always renders a disabled control with an accessible name (TEST-TC-023)', () => {
		const { po } = mountExternal();
		expect(po.exists()).toBe(true);
		expect(po.ariaDisabled()).toBe('true');
		expect(po.ariaLabel().length).toBeGreaterThan(0);
	});

	it('activating surfaces a non-blocking notice, opens no picker / writes no path (EC-TC-9)', async () => {
		const notify = fakeNotify();
		const { wrapper, po } = mountExternal(notify);
		await po.click();
		expect(notify.showInfo).toHaveBeenCalledOnce();
		// Honest seam: no emitted pick/add/path event (the widget declares no custom
		// emits — only the native click is captured).
		expect(wrapper.emitted('pick')).toBeUndefined();
		expect(wrapper.emitted('add')).toBeUndefined();
	});
});
