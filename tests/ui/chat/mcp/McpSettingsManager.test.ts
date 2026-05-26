/**
 * T-MC-026 (RED) — `McpSettingsManager.vue` (TEST-MC-013/014/040/041 A legs).
 *
 * SPEC-MC-015, REQ-MC-013/014/040/041, NFR-MC-006/008. Presentational — props in
 * (`vm: McpViewModel`), events out. Renders nothing when `!vm.supported`, the
 * empty state + add/paste affordances when `empty-seam`, and one `McpServerRow`
 * per server when `live` (re-emitting each row's edit/remove/test/set-enabled).
 * Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import McpSettingsManager from '@/ui/chat/mcp/McpSettingsManager.vue';
import { i18n } from '@/ui/i18n';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import { McpSettingsManagerPageObject } from './McpSettingsManager.po';

const EMPTY_VM: McpViewModel = {
	kind: 'empty-seam',
	servers: [],
	enabledCount: 0,
	supported: true,
};

const LIVE_VM: McpViewModel = {
	kind: 'live',
	servers: [
		{ name: 'filesystem', type: 'stdio', enabled: true },
		{ name: 'remote', type: 'sse', enabled: false },
	],
	enabledCount: 1,
	supported: true,
};

function mountSettings(vm: McpViewModel) {
	const wrapper = mount(McpSettingsManager, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new McpSettingsManagerPageObject(wrapper) };
}

describe('McpSettingsManager (SPEC-MC-015)', () => {
	it('renders nothing when the capability is unsupported (TEST-MC-041)', () => {
		const { po } = mountSettings({ ...EMPTY_VM, supported: false });
		expect(po.exists()).toBe(false);
	});

	it('renders the empty state + add/paste affordances at empty-seam (TEST-MC-040)', () => {
		const { po } = mountSettings(EMPTY_VM);
		expect(po.exists()).toBe(true);
		expect(po.emptyShown()).toBe(true);
		expect(po.addExists()).toBe(true);
		expect(po.pasteExists()).toBe(true);
		expect(po.rowCount()).toBe(0);
	});

	it('renders one row per server at live (TEST-MC-013)', () => {
		const { po } = mountSettings(LIVE_VM);
		expect(po.emptyShown()).toBe(false);
		expect(po.rowCount()).toBe(2);
	});

	it('emits add/paste from the affordances (TEST-MC-040)', async () => {
		const { wrapper, po } = mountSettings(EMPTY_VM);
		await po.clickAdd();
		await po.clickPaste();
		expect(wrapper.emitted('add')).toBeTruthy();
		expect(wrapper.emitted('paste')).toBeTruthy();
	});

	it('re-emits a row set-enabled([name, enabled]) up to the surface (TEST-MC-014)', async () => {
		const { wrapper } = mountSettings(LIVE_VM);
		const rows = wrapper.findAllComponents({ name: 'McpServerRow' });
		expect(rows.length).toBe(2);
		rows[1].vm.$emit('set-enabled', true);
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted('set-enabled')?.[0]).toEqual(['remote', true]);
	});

	it('re-emits a row edit/remove/test with the server name (TEST-MC-013)', async () => {
		const { wrapper } = mountSettings(LIVE_VM);
		const rows = wrapper.findAllComponents({ name: 'McpServerRow' });
		rows[0].vm.$emit('edit');
		rows[0].vm.$emit('remove');
		rows[0].vm.$emit('test');
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted('edit')?.[0]).toEqual(['filesystem']);
		expect(wrapper.emitted('remove')?.[0]).toEqual(['filesystem']);
		expect(wrapper.emitted('test')?.[0]).toEqual(['filesystem']);
	});
});
