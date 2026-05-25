/**
 * T-TC-025 (RED) — `UsageMeter.vue` declarative 240° SVG arc gauge
 * (TEST-TC-024/025/026/027 A legs).
 *
 * SPEC-TC-020. Renders a 240° arc as a declarative Vue-bound SVG `<path>` whose
 * `stroke-dasharray` is computed in-repo from `vm.percentage` (no chart lib,
 * NFR-TC-012; no `v-html`, NFR-TC-004) + a "{percentage}%" label (REQ-TC-024); a
 * usage update re-renders the arc + percentage (42% → 67%, REQ-TC-025);
 * `vm.warning` (`percentage > 80`) switches to the warning style + exposes a
 * `/compact` tooltip (REQ-TC-026); `role="img"` with `aria-label` (colour never
 * the sole signal, NFR-TC-009); rendered only on a `visible` slice (hidden when
 * usage null, EC-TC-7, REQ-TC-027). Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-TC-024/025/026/027, SPEC-TC-020, NFR-TC-004/009/012.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UsageMeter from '@/ui/chat/toolbar/UsageMeter.vue';
import { i18n } from '@/ui/i18n';
import type { UsageWidgetVm } from '@/application/chat/toolbar/buildToolbarViewModel';
import { UsageMeterPageObject } from './UsageMeter.po';

function mountUsage(vm: UsageWidgetVm) {
	const wrapper = mount(UsageMeter, {
		props: { vm },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new UsageMeterPageObject(wrapper) };
}

describe('UsageMeter (SPEC-TC-020)', () => {
	it('renders nothing on a hidden slice — usage null (EC-TC-7, REQ-TC-027)', () => {
		const { po } = mountUsage({ visibility: { kind: 'hidden' }, percentage: 0, warning: false });
		expect(po.exists()).toBe(false);
	});

	it('renders a declarative SVG arc + a percentage label (TEST-TC-024)', () => {
		const { po } = mountUsage({
			visibility: { kind: 'visible', enabled: true },
			percentage: 42,
			warning: false,
		});
		expect(po.exists()).toBe(true);
		expect(po.role()).toBe('img');
		expect(po.ariaLabel()).toContain('42');
		expect(po.arcExists()).toBe(true);
		expect(po.arcDashArray().length).toBeGreaterThan(0);
		expect(po.labelText()).toContain('42');
	});

	it('re-renders the arc + percentage on a usage update (42% → 67%, TEST-TC-025)', async () => {
		const { wrapper, po } = mountUsage({
			visibility: { kind: 'visible', enabled: true },
			percentage: 42,
			warning: false,
		});
		const before = po.arcDashArray();
		expect(po.labelText()).toContain('42');
		await wrapper.setProps({
			vm: { visibility: { kind: 'visible', enabled: true }, percentage: 67, warning: false },
		});
		expect(po.labelText()).toContain('67');
		expect(po.arcDashArray()).not.toBe(before);
	});

	it('applies the warning style + the /compact tooltip when percentage > 80 (TEST-TC-026)', () => {
		const { po } = mountUsage({
			visibility: { kind: 'visible', enabled: true },
			percentage: 92,
			warning: true,
		});
		expect(po.isWarning()).toBe(true);
		// Colour is never the sole signal — the title carries the /compact hint.
		expect(po.title().length).toBeGreaterThan(0);
	});

	it('no warning style at exactly 80% (warning strictly above)', () => {
		const { po } = mountUsage({
			visibility: { kind: 'visible', enabled: true },
			percentage: 80,
			warning: false,
		});
		expect(po.isWarning()).toBe(false);
	});
});
