/**
 * T-MC-026 (RED) — `McpServerRow.vue` (TEST-MC-013/014/070 A legs).
 *
 * SPEC-MC-015, REQ-MC-013/014/070, NFR-MC-006/008. Presentational — props in
 * (`server: McpServerVm`), events out (`edit`/`remove`/`test`/`set-enabled`).
 * Renders the name, the transport type, an enabled toggle, and the
 * edit/remove/test actions, each a focusable control with an accessible name.
 * Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import McpServerRow from '@/ui/chat/mcp/McpServerRow.vue';
import { i18n } from '@/ui/i18n';
import type { McpServerVm } from '@/application/chat/mcp/buildMcpViewModel';
import { McpServerRowPageObject } from './McpServerRow.po';

const SERVER: McpServerVm = {
	name: 'filesystem',
	type: 'stdio',
	enabled: true,
	description: 'Local files',
};

function mountRow(server: McpServerVm) {
	const wrapper = mount(McpServerRow, {
		props: { server },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new McpServerRowPageObject(wrapper) };
}

describe('McpServerRow (SPEC-MC-015)', () => {
	it('renders the name and the transport type (TEST-MC-013)', () => {
		const { po } = mountRow(SERVER);
		expect(po.exists()).toBe(true);
		expect(po.nameText()).toContain('filesystem');
		expect(po.typeText().toLowerCase()).toContain('stdio');
	});

	it('reflects the enabled state on the toggle (TEST-MC-014)', () => {
		const { po } = mountRow(SERVER);
		expect(po.enabledChecked()).toBe(true);
		const { po: off } = mountRow({ ...SERVER, enabled: false });
		expect(off.enabledChecked()).toBe(false);
	});

	it('emits set-enabled when the toggle changes (TEST-MC-014)', async () => {
		const { wrapper, po } = mountRow(SERVER);
		await po.toggleEnabled();
		expect(wrapper.emitted('set-enabled')?.[0]).toEqual([false]);
	});

	it('emits edit/remove/test on the action controls (TEST-MC-013)', async () => {
		const { wrapper, po } = mountRow(SERVER);
		await po.clickEdit();
		await po.clickRemove();
		await po.clickTest();
		expect(wrapper.emitted('edit')).toBeTruthy();
		expect(wrapper.emitted('remove')).toBeTruthy();
		expect(wrapper.emitted('test')).toBeTruthy();
	});

	it('gives each control an accessible name carrying the server name (TEST-MC-070)', () => {
		const { po } = mountRow(SERVER);
		expect(po.enabledAriaLabel()).toContain('filesystem');
		expect(po.editAriaLabel()).toContain('filesystem');
		expect(po.removeAriaLabel()).toContain('filesystem');
		expect(po.testAriaLabel()).toContain('filesystem');
	});
});
