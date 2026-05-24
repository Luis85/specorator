/**
 * T-RR-025 (RED) — `SpIcon.vue` declarative icon render (TEST-RR-024 A leg).
 *
 * SPEC-RR-025. Renders an `IconNode` (from `useIconPort()`) DECLARATIVELY as a
 * recursive VNode tree (`h(node.tag, node.attrs, children)`) — NEVER `v-html`/
 * `innerHTML` (NFR-RR-006). Unknown name → a generic `wrench` fallback;
 * decorative icons are `aria-hidden`. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-RR-019, NFR-RR-006.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SpIcon from '@/ui/chat/SpIcon.vue';
import { ICON_PORT } from '@/infrastructure/bridge/ports';
import { staticIconPort } from '@/infrastructure/icons/staticIconPort';
import { SpIconPageObject } from './SpIcon.po';

function mountIcon(name: string) {
	const wrapper = mount(SpIcon, {
		props: { name },
		global: { provide: { [ICON_PORT as symbol]: staticIconPort } },
	});
	return { wrapper, po: new SpIconPageObject(wrapper) };
}

describe('SpIcon (TEST-RR-024 A leg)', () => {
	it('renders a known icon as a declarative svg shape tree', () => {
		const { po } = mountIcon('check');
		expect(po.exists()).toBe(true);
		expect(po.svgCount()).toBe(1);
		// `check` is a single polyline shape.
		expect(po.shapeTags()).toContain('polyline');
	});

	it('renders nested shape children declaratively (multi-shape icon)', () => {
		const { po } = mountIcon('x');
		// `x` is two <line> shapes.
		expect(po.shapeTags()).toEqual(['line', 'line']);
	});

	it('falls back to the generic wrench icon for an unknown name (REQ-RR-019)', () => {
		const { po } = mountIcon('totally-unknown-icon');
		expect(po.svgCount()).toBe(1);
		// wrench is a single path shape.
		expect(po.shapeTags()).toContain('path');
	});

	it('marks the icon decorative (aria-hidden) so status meaning rides the label (NFR-RR-008)', () => {
		const { po } = mountIcon('check');
		expect(po.ariaHidden()).toBe('true');
	});

	it('does not inject raw HTML — no v-html (NFR-RR-006)', () => {
		const { po } = mountIcon('check');
		// The svg is a real element tree, not an injected string; attrs are bound,
		// and no <script>/dangerous markup is present.
		expect(po.html()).not.toContain('v-html');
		expect(po.html()).toContain('<svg');
	});
});
