/**
 * T-MC-032 (RED) — `McpSelector.vue` EXPANDED (TEST-MC-050/051/082 A legs + EC-MC-1/8).
 *
 * SPEC-MC-018 (extends SPEC-TC-018). The P6 visible-empty seam EXPANDED to a live
 * list + toggle + count badge. Props become `vm: McpViewModel` (replacing the P6
 * `McpWidgetVm`): hidden when `!vm.supported`; at `empty-seam` the P6 seam is kept
 * byte-identical (the 🔌 shell + a count-0 badge + the `agent.chat.toolbar.mcp.empty`
 * "coming later" panel on open, REQ-MC-082); at `live` the dropdown lists every
 * server with its enabled toggle, the badge shows `enabledCount`, and toggling emits
 * `set-enabled:[name, enabled]` (REQ-MC-051). Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import McpSelector from '@/ui/chat/toolbar/McpSelector.vue';
import { i18n } from '@/ui/i18n';
import type { McpViewModel } from '@/application/chat/mcp/buildMcpViewModel';
import { McpSelectorPageObject } from './McpSelector.po';

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

function mountMcp(vm: McpViewModel) {
	const wrapper = mount(McpSelector, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new McpSelectorPageObject(wrapper) };
}

describe('McpSelector (SPEC-MC-018)', () => {
	it('renders nothing when the capability is unsupported (REQ-MC-041)', () => {
		const { po } = mountMcp({ ...EMPTY_VM, supported: false });
		expect(po.shellExists()).toBe(false);
	});

	it('keeps the P6 empty seam byte-identical at empty-seam (TEST-MC-082, EC-MC-1)', async () => {
		const { wrapper, po } = mountMcp(EMPTY_VM);
		expect(po.shellExists()).toBe(true);
		expect(po.badgeText()).toContain('0');
		expect(po.serverCount()).toBe(0);
		expect(po.emptyExists()).toBe(false);
		await po.clickShell();
		expect(po.emptyExists()).toBe(true);
		expect(po.emptyText().length).toBeGreaterThan(0);
		// Honest seam at empty: no live server listed, no set-enabled emitted.
		expect(wrapper.emitted('set-enabled')).toBeUndefined();
	});

	it('lists every server with its toggle + the count badge at live (TEST-MC-050)', async () => {
		const { po } = mountMcp(LIVE_VM);
		expect(po.shellExists()).toBe(true);
		expect(po.badgeText()).toContain('1');
		await po.clickShell();
		expect(po.serverCount()).toBe(2);
	});

	it('emits set-enabled([name, enabled]) when a server toggle changes (TEST-MC-051, EC-MC-8)', async () => {
		const { wrapper, po } = mountMcp(LIVE_VM);
		await po.clickShell();
		await po.toggleServerAt(1); // the disabled 'remote' → enabled
		expect(wrapper.emitted('set-enabled')?.[0]).toEqual(['remote', true]);
	});

	it('keeps the P6 aria-expanded on the shell (REQ-MC-070)', async () => {
		const { po } = mountMcp(LIVE_VM);
		expect(po.ariaExpanded()).toBe('false');
		await po.clickShell();
		expect(po.ariaExpanded()).toBe('true');
	});
});
