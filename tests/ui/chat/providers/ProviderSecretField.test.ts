/**
 * T-PV-029 (RED) — `ProviderSecretField.vue` (TEST-PV-070/072/092/102/110 A legs).
 *
 * SPEC-PV-018, SPEC-PV-025, REQ-PV-070/072/092/102/110. The minimal masked
 * secret-entry field: props `providerId` + `available: boolean`; a masked
 * (`type="password"`) input; emits `save(value)` on submit (the wiring calls
 * SecretStorePort.setSecret); the stored value is NEVER echoed back into the DOM /
 * a notice / log / DTO (REQ-PV-102); when `available` is false the field is DISABLED
 * with the honest `providers.secret.unavailable` message (no plain-store fallback,
 * EC-PV-10). A11y: associated label / accessible name, masked, no `v-html`. Queried
 * by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderSecretField from '@/ui/chat/providers/ProviderSecretField.vue';
import { i18n } from '@/ui/i18n';
import type { ProviderId } from '@/domain/chat/ProviderId';
import { ProviderSecretFieldPageObject } from './ProviderSecretField.po';

function mountField(providerId: ProviderId, available: boolean) {
	const wrapper = mount(ProviderSecretField, {
		props: { providerId, available },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ProviderSecretFieldPageObject(wrapper) };
}

describe('ProviderSecretField (SPEC-PV-018)', () => {
	it('renders a masked password input when available (TEST-PV-070)', () => {
		const { po } = mountField('codex', true);
		expect(po.exists()).toBe(true);
		expect(po.inputExists()).toBe(true);
		expect(po.inputType()).toBe('password');
		expect(po.inputDisabled()).toBe(false);
	});

	it('carries an accessible name on the input (TEST-PV-110)', () => {
		const { po } = mountField('codex', true);
		expect(po.inputAriaLabel().length).toBeGreaterThan(0);
	});

	it('emits save(value) on submit (TEST-PV-070/092)', async () => {
		const { wrapper, po } = mountField('codex', true);
		await po.type('sk-secret-123');
		await po.clickSave();
		expect(wrapper.emitted('save')?.[0]).toEqual(['sk-secret-123']);
	});

	it('never echoes the typed value into the DOM value attribute / markup (TEST-PV-092/102)', async () => {
		const { po } = mountField('codex', true);
		await po.type('sk-super-secret');
		// The stored value must never be rendered back as a value attribute or text.
		expect(po.inputValueAttr()).not.toContain('sk-super-secret');
		expect(po.rootHtml()).not.toContain('sk-super-secret');
	});

	it('is disabled with the honest unavailable message when storage is unavailable (TEST-PV-072)', () => {
		const { po } = mountField('codex', false);
		expect(po.inputDisabled()).toBe(true);
		expect(po.saveDisabled()).toBe(true);
		expect(po.unavailableShown()).toBe(true);
		expect(po.unavailableText().length).toBeGreaterThan(0);
	});

	it('does not emit save when unavailable — no plain-store fallback (EC-PV-10)', async () => {
		const { wrapper, po } = mountField('codex', false);
		await po.clickSave();
		expect(wrapper.emitted('save')).toBeFalsy();
	});

	it('never uses v-html (TEST-PV-110)', () => {
		const { po } = mountField('codex', true);
		expect(po.rootHtml()).not.toContain('v-html');
	});
});
