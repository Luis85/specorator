/**
 * T-PV-027 (RED) — `ProviderChooser.vue` (TEST-PV-001/002/006/090/110/113/114 A legs).
 *
 * SPEC-PV-016, REQ-PV-001/002/003/004/006/090/110/113/114. The minimal provider
 * selection surface: renders NOTHING when `showChooser` is false (single-Claude
 * byte-identical P8, EC-PV-1, TEST-PV-006/114); when true, lists the enabled
 * providers in blank-tab order with display name + icon + active marker, emitting
 * `select(id)` on activate (TEST-PV-001/002/090). A11y: an accessible name, the
 * active provider announced; state cues text + icon, never colour-only
 * (TEST-PV-110); no `v-html` (TEST-PV-113). Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderChooser from '@/ui/chat/providers/ProviderChooser.vue';
import { i18n } from '@/ui/i18n';
import type { ProviderOptionVM } from '@/application/chat/providers/buildProviderViewModel';
import { ProviderChooserPageObject } from './ProviderChooser.po';

// Blank-tab order: opencode (10), codex (15), claude (20). The view-model already
// sorts; the chooser renders the list in the given order.
const THREE_OPTIONS: readonly ProviderOptionVM[] = [
	{ id: 'opencode', displayNameKey: 'agent.chat.providers.name.opencode', isActive: false, isDefault: false },
	{ id: 'codex', displayNameKey: 'agent.chat.providers.name.codex', isActive: true, isDefault: false },
	{ id: 'claude', displayNameKey: 'agent.chat.providers.name.claude', isActive: false, isDefault: true },
];

const CLAUDE_ONLY: readonly ProviderOptionVM[] = [
	{ id: 'claude', displayNameKey: 'agent.chat.providers.name.claude', isActive: true, isDefault: true },
];

function mountChooser(options: readonly ProviderOptionVM[], showChooser: boolean) {
	const wrapper = mount(ProviderChooser, {
		props: { options, showChooser },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ProviderChooserPageObject(wrapper) };
}

describe('ProviderChooser (SPEC-PV-016)', () => {
	it('renders nothing when showChooser is false — byte-identical P8 (TEST-PV-006/114)', () => {
		const { po } = mountChooser(CLAUDE_ONLY, false);
		expect(po.exists()).toBe(false);
	});

	it('lists the enabled providers in blank-tab order when showChooser is true (TEST-PV-001/002)', () => {
		const { po } = mountChooser(THREE_OPTIONS, true);
		expect(po.exists()).toBe(true);
		expect(po.optionCount()).toBe(3);
		expect(po.optionText(0)).toContain('Opencode');
		expect(po.optionText(1)).toContain('Codex');
		expect(po.optionText(2)).toContain('Claude');
	});

	it('marks exactly the active provider (TEST-PV-090)', () => {
		const { po } = mountChooser(THREE_OPTIONS, true);
		expect(po.activeMarkerCount()).toBe(1);
	});

	it('renders a provider icon per option (TEST-PV-090)', () => {
		const { po } = mountChooser(THREE_OPTIONS, true);
		expect(po.iconCount()).toBe(3);
	});

	it('emits select(id) when an option is clicked (TEST-PV-001/004)', async () => {
		const { wrapper, po } = mountChooser(THREE_OPTIONS, true);
		await po.clickOption(0);
		expect(wrapper.emitted('select')?.[0]).toEqual(['opencode']);
	});

	it('emits select(id) on keyboard activate (TEST-PV-110)', async () => {
		const { wrapper, po } = mountChooser(THREE_OPTIONS, true);
		await po.pressOption(1, 'Enter');
		expect(wrapper.emitted('select')?.[0]).toEqual(['codex']);
	});

	it('carries an accessible name on the chooser (TEST-PV-110)', () => {
		const { po } = mountChooser(THREE_OPTIONS, true);
		expect(po.accessibleName().length).toBeGreaterThan(0);
	});

	it('never uses v-html (TEST-PV-113)', () => {
		const { po } = mountChooser(THREE_OPTIONS, true);
		expect(po.rootHtml()).not.toContain('v-html');
	});
});
