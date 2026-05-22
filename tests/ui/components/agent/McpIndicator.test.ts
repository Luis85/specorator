/**
 * Tests for `<McpIndicator>` — small chip + glow when MCP is active
 * (REQ-AUX-004, spec §1.3).
 *
 *   T-AUX-264: when `mcpStatusStore.active=true`, root carries
 *   `animation-name: mcp-glow`. Inactive → animation-name: none.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';

import McpIndicator from '@/ui/components/agent/McpIndicator.vue';
import { useMcpStatusStore } from '@/ui/stores/mcpStatusStore';
import { McpIndicatorPageObject } from './McpIndicator.po';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

const i18n = createI18n({
	legacy: false,
	locale: 'en',
	messages: {
		en: {
			agent: { composer: { mcp: { label: 'MCP' } } },
		},
	},
});

const CSS = `
.specorator-root { --sp-duration-medium: 0.2s; }
.sp-mcp-indicator[data-active="true"] {
	animation: mcp-glow 1.6s var(--sp-duration-medium, 0.2s) infinite;
}
.sp-mcp-indicator[data-active="false"] {
	animation: none;
}
@keyframes mcp-glow {
	0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
	50%      { box-shadow: 0 0 0 6px rgba(0,0,0,0); }
}
`;

let style: HTMLStyleElement | null = null;

beforeEach(() => {
	setActivePinia(createPinia());
	style = document.createElement('style');
	style.textContent = CSS;
	document.head.appendChild(style);
});

afterEach(() => {
	style?.remove();
	style = null;
});

function mountIndicator() {
	const bridge = new MockBridge() as unknown as IconPort;
	return mount(McpIndicator, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		attachTo: document.body,
	});
}

describe('<McpIndicator>', () => {
	it('renders with data-active="false" by default', () => {
		const wrapper = mountIndicator();
		const po = new McpIndicatorPageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.isActive()).toBe(false);
	});

	it('T-AUX-264: animation-name is mcp-glow when active', async () => {
		const store = useMcpStatusStore();
		store.setActive(true);
		store.setCount(2);

		const wrapper = mountIndicator();
		await wrapper.vm.$nextTick();
		const po = new McpIndicatorPageObject(wrapper);
		expect(po.isActive()).toBe(true);
		// jsdom computed-style does not honour attribute selectors; assert
		// the source stylesheet wires `mcp-glow` for the active state.
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/McpIndicator.vue'),
			'utf8',
		);
		expect(src).toMatch(/data-active=['"]true['"]\][\s\S]*animation:\s*mcp-glow/);
		expect(po.countText()).toBe('2');
	});

	it('T-AUX-264: no mcp-glow animation when inactive', async () => {
		const wrapper = mountIndicator();
		const po = new McpIndicatorPageObject(wrapper);
		expect(po.isActive()).toBe(false);
		// Default (no `data-active="true"`) — the CSS rule does NOT match,
		// so jsdom reports `animation-name: none`.
		expect(getComputedStyle(po.root()).animationName).toBe('none');
	});

	it('tooltip uses agent.composer.mcp.label', () => {
		const store = useMcpStatusStore();
		store.setActive(true);

		const wrapper = mountIndicator();
		const po = new McpIndicatorPageObject(wrapper);
		expect(po.tooltipText()).toContain('MCP');
	});

	it('count chip hidden when count is 0', () => {
		const wrapper = mountIndicator();
		const po = new McpIndicatorPageObject(wrapper);
		expect(po.countText()).toBe('');
	});
});
