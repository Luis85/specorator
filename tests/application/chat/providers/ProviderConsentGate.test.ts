/**
 * T-PV-021 (RED) — `ProviderConsentGate` (SPEC-PV-014/024).
 *
 * The one-time beyond-vault consent check before a provider's first home-dir read,
 * over the in-memory Mock settings + a stubbed `openConsent`:
 *  - a recorded `true` → `ok(true)` with NO prompt (the consented path, REQ-PV-082,
 *    EC-PV-6);
 *  - absent/`false` → `openConsent(id)` ONCE via the modal seam, record the boolean
 *    outcome device-local (so the prompt never repeats), return it;
 *  - a declining user → `ok(false)` (the caller disables that provider's history
 *    honestly) AND the decline persists (no re-prompt, EC-PV-6);
 *  - the auto-decline fallback when the launcher is absent (`useOpenProviderConsent`
 *    → `false`, REQ-PV-113) — modelled by an auto-declining `openConsent`;
 *  - never throws across the port boundary (NFR-PV-005).
 *
 * Traces: TEST-PV-082, SPEC-PV-014/024, REQ-PV-082/113/114, NFR-PV-003/005, EC-PV-6.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderConsentGate } from '@/application/chat/providers/ProviderConsentGate';
import { homeFsConsentKey } from '@/domain/settings/PluginSettings';
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports';
import type { OpenProviderConsentFn } from '@/ui/chat/modalSeam';

describe('ProviderConsentGate (T-PV-021)', () => {
	let ports: FakePorts;

	beforeEach(() => {
		ports = fakeModulePorts();
	});

	async function seedConsent(id: 'codex' | 'opencode', value: boolean): Promise<void> {
		const current = await ports.settings.getSettings();
		await ports.settings.saveSettings({
			...current,
			homeFsConsent: { ...current.homeFsConsent, [homeFsConsentKey(id)]: value },
		});
	}

	it('a recorded true → ok(true) with NO prompt (consented path, EC-PV-6)', async () => {
		await seedConsent('codex', true);
		const openConsent = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(false));
		const gate = new ProviderConsentGate(ports.settings, openConsent);

		const result = await gate.ensureConsent('codex');

		expect(result).toEqual({ ok: true, value: true });
		expect(openConsent).not.toHaveBeenCalled();
	});

	it('no record → opens the consent modal once, records the accept, returns ok(true)', async () => {
		const openConsent = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(true));
		const gate = new ProviderConsentGate(ports.settings, openConsent);

		const result = await gate.ensureConsent('codex');

		expect(result).toEqual({ ok: true, value: true });
		expect(openConsent).toHaveBeenCalledTimes(1);
		expect(openConsent).toHaveBeenCalledWith('codex');
		// The accept persisted device-local (so a second call never re-prompts).
		const saved = await ports.settings.getSettings();
		expect(saved.homeFsConsent?.[homeFsConsentKey('codex')]).toBe(true);
	});

	it('a declining user → ok(false) and the decline persists (no re-prompt, EC-PV-6)', async () => {
		const openConsent = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(false));
		const gate = new ProviderConsentGate(ports.settings, openConsent);

		const first = await gate.ensureConsent('opencode');
		expect(first).toEqual({ ok: true, value: false });

		const saved = await ports.settings.getSettings();
		expect(saved.homeFsConsent?.[homeFsConsentKey('opencode')]).toBe(false);

		// A second call honours the recorded decline without re-prompting.
		const second = await gate.ensureConsent('opencode');
		expect(second).toEqual({ ok: true, value: false });
		expect(openConsent).toHaveBeenCalledTimes(1);
	});

	it('the auto-decline launcher (absent → false) → ok(false), recorded (REQ-PV-113)', async () => {
		const autoDecline = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(false));
		const gate = new ProviderConsentGate(ports.settings, autoDecline);

		const result = await gate.ensureConsent('codex');

		expect(result).toEqual({ ok: true, value: false });
		expect(autoDecline).toHaveBeenCalledTimes(1);
	});

	it('records consent per-provider without clobbering another provider record', async () => {
		await seedConsent('codex', true);
		const openConsent = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(false));
		const gate = new ProviderConsentGate(ports.settings, openConsent);

		await gate.ensureConsent('opencode'); // declines opencode

		const saved = await ports.settings.getSettings();
		expect(saved.homeFsConsent?.[homeFsConsentKey('codex')]).toBe(true);
		expect(saved.homeFsConsent?.[homeFsConsentKey('opencode')]).toBe(false);
	});

	it('never throws across the port boundary', async () => {
		const openConsent = vi.fn<OpenProviderConsentFn>(() => Promise.resolve(true));
		const gate = new ProviderConsentGate(ports.settings, openConsent);
		await expect(gate.ensureConsent('codex')).resolves.toMatchObject({ ok: true });
	});
});
