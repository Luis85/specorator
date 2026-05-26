/**
 * T-MC-030 (RED) — `McpTestModal.vue` (TEST-MC-016/030..034/044 A legs).
 *
 * SPEC-MC-017/028, REQ-MC-016/023/030..034/044/070/072, NFR-MC-006/007/008. The
 * test-result modal driven by the injected `McpClientPort`: running spinner →
 * the five SPEC-MC-028 states (success+per-tool toggles / partial empty list /
 * timeout / error / unavailable). A per-tool toggle emits `set-tool-disabled`; a
 * polite live region announces the running → result transition; no secret value
 * renders. Driven by the scriptable Mock client. Queried by `data-testid` only.
 */
import { describe, it, expect } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import McpTestModal from '@/ui/chat/mcp/McpTestModal.vue';
import { i18n } from '@/ui/i18n';
import { MCP_CLIENT_PORT } from '@/infrastructure/bridge/ports';
import { MockMcpClient, type MockMcpClientMode } from '@/infrastructure/mock/MockMcpClient';
import type { ManagedMcpServer } from '@/domain/chat/mcp/McpTypes';
import { McpTestModalPageObject } from './McpTestModal.po';

const SERVER: ManagedMcpServer = {
	name: 'filesystem',
	config: { command: 'mcp-fs', env: { TOKEN: 'super-secret-value' } },
	enabled: true,
	contextSaving: false,
};

function mountModal(mode: MockMcpClientMode, server: ManagedMcpServer = SERVER) {
	const client = new MockMcpClient();
	client.setClientMode(mode);
	const wrapper = mount(McpTestModal, {
		props: { server },
		global: {
			plugins: [i18n],
			provide: { [MCP_CLIENT_PORT as symbol]: client },
		},
	});
	return { wrapper, po: new McpTestModalPageObject(wrapper), client };
}

describe('McpTestModal (SPEC-MC-017/028)', () => {
	it('shows the running spinner before the probe resolves (TEST-MC-044)', () => {
		const { po } = mountModal('success');
		expect(po.exists()).toBe(true);
		expect(po.runningShown()).toBe(true);
	});

	it('renders success + the per-tool list (TEST-MC-030)', async () => {
		const { po } = mountModal('success');
		await flushPromises();
		expect(po.runningShown()).toBe(false);
		expect(po.successShown()).toBe(true);
		expect(po.toolCount()).toBe(2);
	});

	it('emits set-tool-disabled when a tool toggle changes (TEST-MC-016)', async () => {
		const { wrapper, po } = mountModal('success');
		await flushPromises();
		await po.toggleToolAt(0);
		const emitted = wrapper.emitted('set-tool-disabled')?.[0];
		expect(emitted?.[0]).toBe('echo');
		expect(emitted?.[1]).toBe(true);
	});

	it('renders partial as success with an empty tool list (TEST-MC-032)', async () => {
		const { po } = mountModal('partial');
		await flushPromises();
		expect(po.successShown()).toBe(true);
		expect(po.toolCount()).toBe(0);
		expect(po.errorShown()).toBe(false);
	});

	it('renders the timeout state (TEST-MC-031)', async () => {
		const { po } = mountModal('timeout');
		await flushPromises();
		expect(po.errorShown()).toBe(true);
		expect(po.errorText().toLowerCase()).toContain('timeout');
	});

	it('renders the error state with the friendly message (TEST-MC-033)', async () => {
		const { po } = mountModal('error');
		await flushPromises();
		expect(po.errorShown()).toBe(true);
		expect(po.errorText().length).toBeGreaterThan(0);
	});

	it('renders the unavailable state (TEST-MC-034)', async () => {
		const { po } = mountModal('unavailable');
		await flushPromises();
		expect(po.unavailableShown()).toBe(true);
	});

	it('announces the running -> result transition via a live region (TEST-MC-070)', async () => {
		const { po } = mountModal('success');
		await flushPromises();
		expect(po.liveRegionText().length).toBeGreaterThan(0);
	});

	it('never renders a server secret (env/auth value) (TEST-MC-072)', async () => {
		const { wrapper } = mountModal('error');
		await flushPromises();
		expect(wrapper.html()).not.toContain('super-secret-value');
	});

	it('emits close on the close control (TEST-MC-044)', async () => {
		const { wrapper, po } = mountModal('success');
		await flushPromises();
		await po.clickClose();
		expect(wrapper.emitted('close')).toBeTruthy();
	});
});
