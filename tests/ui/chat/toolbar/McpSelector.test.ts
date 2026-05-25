/**
 * T-TC-023 (RED) — `McpSelector.vue` honest-defer seam (TEST-TC-021/022 A legs).
 *
 * SPEC-TC-018. Renders nothing on a `hidden` slice (`!supportsMcpTools`,
 * REQ-TC-021); else the shell shows the MCP icon + a count-0 badge, opening
 * reveals a VISIBLE-EMPTY `mcp.empty` "coming later" panel — LISTS NO SERVER,
 * toggles/connects nothing (REQ-TC-022, EC-TC-9). Queried by `data-testid` only
 * (ADR-009).
 *
 * Traces: REQ-TC-021/022, SPEC-TC-018/029, NFR-TC-004/006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import McpSelector from '@/ui/chat/toolbar/McpSelector.vue';
import { i18n } from '@/ui/i18n';
import type { McpWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import { McpSelectorPageObject } from './McpSelector.po';

function mountMcp(vm: McpWidgetVm) {
	const wrapper = mount(McpSelector, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new McpSelectorPageObject(wrapper) };
}

describe('McpSelector (SPEC-TC-018)', () => {
	it('renders nothing on a hidden slice (REQ-TC-021)', () => {
		const { po } = mountMcp({ visibility: { kind: 'hidden' }, empty: true });
		expect(po.shellExists()).toBe(false);
	});

	it('shows the shell with a count-0 badge when supported', () => {
		const { po } = mountMcp({ visibility: { kind: 'visible', enabled: false }, empty: true });
		expect(po.shellExists()).toBe(true);
		expect(po.buttonText()).toContain('0');
	});

	it('opening reveals the visible-empty coming-later panel; connects nothing (TEST-TC-022, EC-TC-9)', async () => {
		const { wrapper, po } = mountMcp({
			visibility: { kind: 'visible', enabled: false },
			empty: true,
		});
		expect(po.emptyExists()).toBe(false);
		await po.clickShell();
		expect(po.emptyExists()).toBe(true);
		expect(po.emptyText().length).toBeGreaterThan(0);
		// Honest seam: no emitted connect/toggle event (the widget declares no custom
		// emits — only the native click is captured).
		expect(wrapper.emitted('connect')).toBeUndefined();
		expect(wrapper.emitted('toggle')).toBeUndefined();
	});
});
