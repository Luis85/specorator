/**
 * Tests for `<CompactBoundary>` (spec §1.4).
 *
 * Token-driven divider + chevron icon marker for SDK-emitted history
 * compaction events. Replaces the literal `--- compact ---` ASCII divider
 * previously rendered inline in MessageList.
 */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import CompactBoundary from '@/ui/components/agent/CompactBoundary.vue';
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { IconPort, LoggerPort } from '@/domain/ports';
import { CompactBoundaryPageObject } from './CompactBoundary.po';

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

function mountWith(props: { label: string }): ReturnType<typeof mount> {
	const bridge = new MockBridge() as unknown as IconPort;
	return mount(CompactBoundary, {
		props,
		global: {
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
	});
}

describe('CompactBoundary', () => {
	it('renders root with data-testid', () => {
		const wrapper = mountWith({ label: 'Compacted earlier turns' });
		const po = new CompactBoundaryPageObject(wrapper);
		expect(po.exists()).toBe(true);
	});

	it('renders the supplied label', () => {
		const wrapper = mountWith({ label: 'Compacted earlier turns' });
		expect(new CompactBoundaryPageObject(wrapper).label()).toBe('Compacted earlier turns');
	});

	it('renders a chevron icon via SpIcon', () => {
		const wrapper = mountWith({ label: 'Compact' });
		expect(new CompactBoundaryPageObject(wrapper).iconExists()).toBe(true);
	});

	it('uses the --sp-compact token in the shipped stylesheet', async () => {
		const fs = await import('node:fs/promises');
		const path = await import('node:path');
		const src = await fs.readFile(
			path.resolve(__dirname, '../../../../src/ui/components/agent/CompactBoundary.vue'),
			'utf8',
		);
		expect(src).toMatch(/var\(--sp-compact\)/);
		// Uses logical-property rule (background lives on the lines).
		expect(src).not.toMatch(/background-color:\s*var\(--background-modifier-border\)/);
	});

	it('has role="status" on the root element', () => {
		const wrapper = mountWith({ label: 'Compact' });
		expect(new CompactBoundaryPageObject(wrapper).root().getAttribute('role')).toBe('status');
	});
});
