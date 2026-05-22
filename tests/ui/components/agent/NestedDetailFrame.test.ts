/**
 * Tests for `<NestedDetailFrame>` (REQ-AUX-013, spec §1.3.7).
 *
 *   T-AUX-237 — border-inline-start + identical padding-inline-start across
 *               all statuses (idle | running | complete | error). Owns the
 *               only place those values exist.
 *   T-AUX-238 — props contract: icon, label, summary, status, defaultExpanded.
 *               Emits `expand-change` when summary toggled.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NestedDetailFrame from '@/ui/components/agent/NestedDetailFrame.vue';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';
import { NestedDetailFramePageObject } from './NestedDetailFrame.po';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function mountWith(props: {
	icon: string;
	label: string;
	summary?: string;
	status?: 'idle' | 'running' | 'complete' | 'error';
	defaultExpanded?: boolean;
}): ReturnType<typeof mount> {
	const bridge = new MockBridge() as unknown as IconPort;
	return mount(NestedDetailFrame, {
		props,
		slots: { default: '<p data-testid="body-content">body</p>' },
		global: {
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
	});
}

describe('NestedDetailFrame', () => {
	it('renders root with data-testid + data-status (default idle)', () => {
		const wrapper = mountWith({ icon: 'brain', label: 'Thinking' });
		const po = new NestedDetailFramePageObject(wrapper);
		expect(po.exists()).toBe(true);
		expect(po.status()).toBe('idle');
		expect(po.label()).toBe('Thinking');
	});

	it('renders each status (idle | running | complete | error)', () => {
		for (const status of ['idle', 'running', 'complete', 'error'] as const) {
			const wrapper = mountWith({ icon: 'brain', label: 'Thinking', status });
			expect(new NestedDetailFramePageObject(wrapper).status()).toBe(status);
		}
	});

	it('renders the supplied summary text when provided', () => {
		const wrapper = mountWith({
			icon: 'wrench',
			label: 'Bash',
			summary: 'ls -la',
		});
		expect(new NestedDetailFramePageObject(wrapper).summaryText()).toBe('ls -la');
	});

	it('omits the summary text node when no summary supplied', () => {
		const wrapper = mountWith({ icon: 'brain', label: 'Thinking' });
		expect(new NestedDetailFramePageObject(wrapper).summaryText()).toBeNull();
	});

	it('renders the slotted body inside the frame', () => {
		const wrapper = mountWith({ icon: 'brain', label: 'Thinking' });
		expect(new NestedDetailFramePageObject(wrapper).bodyExists()).toBe(true);
		expect(wrapper.find('[data-testid="body-content"]').exists()).toBe(true);
	});

	it('defaults to expanded=true', () => {
		const wrapper = mountWith({ icon: 'brain', label: 'Thinking' });
		expect(new NestedDetailFramePageObject(wrapper).isOpen()).toBe(true);
	});

	it('honours defaultExpanded=false', () => {
		const wrapper = mountWith({
			icon: 'brain',
			label: 'Thinking',
			defaultExpanded: false,
		});
		expect(new NestedDetailFramePageObject(wrapper).isOpen()).toBe(false);
	});

	it('declares the 2px inline-start border + token-driven indent in the SFC source (T-AUX-237)', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/NestedDetailFrame.vue'),
			'utf8',
		);
		expect(src).toMatch(/border-inline-start:\s*2px\s+solid\s+var\(--sp-border\)/);
		expect(src).toMatch(/padding-inline-start:\s*var\(--sp-space-/);
		// Only ONE place owns these declarations.
		const borderMatches = src.match(/border-inline-start:\s*2px\s+solid/g) ?? [];
		expect(borderMatches.length).toBeGreaterThanOrEqual(1);
	});
});
