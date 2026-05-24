/**
 * T-RR-025 (RED) — `SpCollapsible.vue` + `useCollapsible` (TEST-RR-010/011).
 *
 * SPEC-RR-024. The one reusable collapsible primitive: collapsed by default,
 * focusable `role="button"` header, toggle on click/Enter/Space (the keyboard
 * paths `preventDefault`), `aria-expanded` reflects state, a dynamic accessible
 * label `"<label> - click to expand"` / `"… - click to collapse"`. WCAG 2.2 AA
 * (NFR-RR-008). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-015/016/017/018, NFR-RR-008.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SpCollapsible from '@/ui/chat/SpCollapsible.vue';
import { SpCollapsiblePageObject } from './SpCollapsible.po';

function mountCollapsible(props: { label?: string } = {}) {
	const wrapper = mount(SpCollapsible, {
		props: { label: props.label ?? 'Read: a.ts' },
		slots: {
			header: '<span data-testid="slot-header">HEADER</span>',
			default: '<span data-testid="slot-body">BODY</span>',
		},
	});
	return { wrapper, po: new SpCollapsiblePageObject(wrapper) };
}

describe('SpCollapsible (TEST-RR-010/011)', () => {
	it('renders collapsed by default — header shown, body hidden (REQ-RR-018)', () => {
		const { po } = mountCollapsible();
		expect(po.exists()).toBe(true);
		expect(po.ariaExpanded()).toBe('false');
		expect(po.bodyVisible()).toBe(false);
	});

	it('the header is a focusable control (role=button, tabindex=0)', () => {
		const { po } = mountCollapsible();
		expect(po.role()).toBe('button');
		expect(po.tabindex()).toBe('0');
	});

	it('toggles open on click (aria-expanded true, body shown)', async () => {
		const { po } = mountCollapsible();
		await po.clickHeader();
		expect(po.ariaExpanded()).toBe('true');
		expect(po.bodyVisible()).toBe(true);
		await po.clickHeader();
		expect(po.ariaExpanded()).toBe('false');
	});

	it('toggles on Enter and prevents default (REQ-RR-015)', async () => {
		const { po } = mountCollapsible();
		const event = await po.pressEnter();
		expect(event.defaultPrevented).toBe(true);
		expect(po.ariaExpanded()).toBe('true');
	});

	it('toggles on Space and prevents default (REQ-RR-015)', async () => {
		const { po } = mountCollapsible();
		const event = await po.pressSpace();
		expect(event.defaultPrevented).toBe(true);
		expect(po.ariaExpanded()).toBe('true');
	});

	it('exposes a dynamic accessible label that flips with state', async () => {
		const { po } = mountCollapsible({ label: 'Read: a.ts' });
		expect(po.ariaLabel()).toBe('Read: a.ts - click to expand');
		await po.clickHeader();
		expect(po.ariaLabel()).toBe('Read: a.ts - click to collapse');
	});
});
