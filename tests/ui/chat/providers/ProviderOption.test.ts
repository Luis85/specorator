/**
 * T-PV-027 (RED) — `ProviderOption.vue` (TEST-PV-090/110/113 A legs).
 *
 * SPEC-PV-016, REQ-PV-090/110/113. One provider row: provider icon + display name +
 * the active/default marker; emits `select` on click and on keyboard activate
 * (Enter/Space). A11y: an accessible name, the active provider announced
 * (`aria-current`), state cues are text + icon (never colour-only); no `v-html`.
 * Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderOption from '@/ui/chat/providers/ProviderOption.vue';
import { i18n } from '@/ui/i18n';
import type { ProviderOptionVM } from '@/application/chat/providers/buildProviderViewModel';
import { ProviderOptionPageObject } from './ProviderOption.po';

const CLAUDE_OPTION: ProviderOptionVM = {
	id: 'claude',
	displayNameKey: 'agent.chat.providers.name.claude',
	isActive: true,
	isDefault: true,
};

const CODEX_OPTION: ProviderOptionVM = {
	id: 'codex',
	displayNameKey: 'agent.chat.providers.name.codex',
	isActive: false,
	isDefault: false,
};

function mountOption(option: ProviderOptionVM) {
	const wrapper = mount(ProviderOption, {
		props: { option },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ProviderOptionPageObject(wrapper) };
}

describe('ProviderOption (SPEC-PV-016)', () => {
	it('renders the provider display name + icon (TEST-PV-090)', () => {
		const { po } = mountOption(CODEX_OPTION);
		expect(po.exists()).toBe(true);
		expect(po.text()).toContain('Codex');
		expect(po.iconExists()).toBe(true);
		expect(po.iconLabel().length).toBeGreaterThan(0);
	});

	it('announces the active provider with aria-current + a text marker (TEST-PV-110)', () => {
		const { po } = mountOption(CLAUDE_OPTION);
		expect(po.ariaCurrent()).toBe('true');
		// non-colour cue: an explicit active marker element exists
		expect(po.activeMarkerShown()).toBe(true);
	});

	it('does not announce aria-current when inactive (TEST-PV-110)', () => {
		const { po } = mountOption(CODEX_OPTION);
		expect(po.ariaCurrent()).not.toBe('true');
		expect(po.activeMarkerShown()).toBe(false);
	});

	it('carries an accessible name (TEST-PV-110)', () => {
		const { po } = mountOption(CODEX_OPTION);
		expect(po.accessibleName()).toContain('Codex');
	});

	it('emits select on click (TEST-PV-090)', async () => {
		const { wrapper, po } = mountOption(CODEX_OPTION);
		await po.click();
		expect(wrapper.emitted('select')).toBeTruthy();
	});

	it('emits select on Enter/Space activate (TEST-PV-110)', async () => {
		const { wrapper, po } = mountOption(CODEX_OPTION);
		await po.press('Enter');
		await po.press(' ');
		expect(wrapper.emitted('select')?.length).toBe(2);
	});

	it('never uses v-html (TEST-PV-113)', () => {
		const { po } = mountOption(CODEX_OPTION);
		expect(po.html()).not.toContain('v-html');
	});
});
