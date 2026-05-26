/**
 * T-PV-019 (RED) — `SelectProviderUseCase` (SPEC-PV-013/023/029).
 *
 * Drives the select/auto-switch matrix over the scriptable Mock registry +
 * runtime-registry factory + the in-memory settings:
 *  - `select(id, prior)` — (1) resets+cancels the prior runtime (no cross-provider
 *    leakage, REQ-PV-012, EC-PV-13); (2) persists `activeProvider` device-local via
 *    read-modify-write `saveSettings` (never `data.json`, REQ-PV-004); (3)
 *    `runtimeFactory(id)` → `ok` returns the runtime (a subsequent turn routes to it,
 *    TEST-PV-004/010); `err` → an honest notice (`keyRequired`/`cliNotFound`/
 *    `unavailable`, NO key substring) + returns the `err`, chat stays usable, no throw
 *    escapes (REQ-PV-011/100, EC-PV-4/5/8);
 *  - `selectForModel(model, prior)` — resolve the owning provider; auto-switch when it
 *    differs (REQ-PV-060), else no-op `ok(prior)` (REQ-PV-061);
 *  - the secret read happens INSIDE the runtime construction at the infra boundary,
 *    never in the use case (REQ-PV-071);
 *  - no `switch (providerId)` (NFR-PV-014).
 *
 * Traces: TEST-PV-004/010/011/012/060/071/100, SPEC-PV-013/023/029,
 * REQ-PV-004/010/011/012/060/061/071/100/102, NFR-PV-005/014, EC-PV-4/5/8/13.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SelectProviderUseCase } from '@/application/chat/providers/SelectProviderUseCase';
import { FeedbackService } from '@/application/shared/FeedbackService';
import { MockProviderRuntime } from '@/infrastructure/mock/MockProviderRuntime';
import { providerSecretKey } from '@/domain/ports';
import { fakeModulePorts, type FakePorts } from '../../../__fakes__/fake-ports';
import type { LoggerPort, NotificationPort, ProviderId } from '@/domain/ports';
import type { ChatRuntimeFactory } from '@/ui/chat/modalSeam';

function makeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

/** The widened factory body the Mock runtime registry exposes (the production seam). */
function factoryFor(ports: FakePorts): ChatRuntimeFactory {
	return (id: ProviderId) => ports.providerRuntimeRegistry.createChatRuntime(id);
}

/** Enable the non-Claude providers so resolve/select can activate them. */
async function enableAll(ports: FakePorts): Promise<void> {
	const current = await ports.settings.getSettings();
	await ports.settings.saveSettings({
		...current,
		enabledProviders: ['codex', 'opencode'],
	});
}

describe('SelectProviderUseCase (T-PV-019)', () => {
	let ports: FakePorts;
	let logger: LoggerPort;
	let notify: NotificationPort;
	let feedback: FeedbackService;
	let useCase: SelectProviderUseCase;

	beforeEach(async () => {
		ports = fakeModulePorts();
		logger = makeLogger();
		notify = makeNotify();
		feedback = new FeedbackService(logger, notify);
		await enableAll(ports);
		useCase = new SelectProviderUseCase(
			ports.providerRegistry,
			ports.settings,
			factoryFor(ports),
			feedback,
		);
	});

	describe('select — persist + construct (TEST-PV-004/010/011/100)', () => {
		it('persists activeProvider device-local + returns the constructed runtime (TEST-PV-004/010)', async () => {
			const result = await useCase.select('codex', null);

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value.providerId).toBe('codex');
			const saved = await ports.settings.getSettings();
			expect(saved.activeProvider).toBe('codex');
		});

		it('persists through SettingsPort, never a secret in the store (REQ-PV-004/102)', async () => {
			await useCase.select('codex', null);

			// The selection is device-local; no secret key crosses into the settings.
			const saved = await ports.settings.getSettings();
			expect(JSON.stringify(saved)).not.toContain(providerSecretKey('codex'));
			expect(ports.secretStore.getStoredKeys()).toEqual([]);
		});

		it('a construct err surfaces an honest notice + returns err; chat stays usable (TEST-PV-011/100, EC-PV-4)', async () => {
			ports.providerRuntimeRegistry.setProviderConstructMode('codex', 'no-key');

			const result = await useCase.select('codex', null);

			expect(result.ok).toBe(false);
			// The selection still persisted (the user chose codex; the turn just can't start yet).
			const saved = await ports.settings.getSettings();
			expect(saved.activeProvider).toBe('codex');
			// An honest notice fired with the reason, never throwing.
			expect(notify.showWarning).toHaveBeenCalledTimes(1);
		});

		it('the construct-err notice carries the honest reason, NO key/secret substring (REQ-PV-102, EC-PV-5)', async () => {
			ports.providerRuntimeRegistry.setProviderConstructMode('codex', 'no-key');
			ports.secretStore.seedSecret(providerSecretKey('codex'), 'sk-super-secret-value');

			await useCase.select('codex', null);

			const message = (notify.showWarning as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
			expect(message).toContain('keyRequired');
			expect(message).not.toContain('sk-super-secret-value');
		});

		it('an unavailable construct (no Node subprocess) returns err honestly (EC-PV-8, TEST-PV-100)', async () => {
			ports.providerRuntimeRegistry.setProviderConstructMode('opencode', 'unavailable');

			const result = await useCase.select('opencode', null);

			expect(result.ok).toBe(false);
			expect(notify.showWarning).toHaveBeenCalledTimes(1);
			const message = (notify.showWarning as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
			expect(message).toContain('unavailable');
		});
	});

	describe('select — tear down the prior runtime (TEST-PV-012, EC-PV-13)', () => {
		it('resets + cancels the prior runtime before constructing the next (no cross-provider leakage)', async () => {
			const prior = new MockProviderRuntime('claude');
			const resetSpy = vi.spyOn(prior, 'resetSession');
			const cancelSpy = vi.spyOn(prior, 'cancel');

			await useCase.select('codex', prior);

			expect(resetSpy).toHaveBeenCalledTimes(1);
			expect(cancelSpy).toHaveBeenCalledTimes(1);
		});

		it('a null prior runtime is a safe no-op (the first selection)', async () => {
			const result = await useCase.select('codex', null);
			expect(result.ok).toBe(true);
		});
	});

	describe('selectForModel — auto-switch (TEST-PV-060/061)', () => {
		it('auto-switches to the owning provider when the model differs from the active one (REQ-PV-060)', async () => {
			// Active is claude (default); a codex-owned model (gpt-/o<digit>) → switch to codex.
			const result = await useCase.selectForModel('gpt-5-codex', null);

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value.providerId).toBe('codex');
			const saved = await ports.settings.getSettings();
			expect(saved.activeProvider).toBe('codex');
		});

		it('is a no-op when the owning provider matches the active provider (REQ-PV-061)', async () => {
			// Active is claude; a claude-owned model → no switch, return the prior runtime.
			const prior = new MockProviderRuntime('claude');
			const result = await useCase.selectForModel('sonnet', prior);

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value).toBe(prior);
			// No re-persist happened (still the default claude).
			const saved = await ports.settings.getSettings();
			expect(saved.activeProvider).toBe('claude');
		});

		it('falls back to the active provider for an unowned model (REQ-PV-061, EC-PV-9)', async () => {
			const prior = new MockProviderRuntime('claude');
			const result = await useCase.selectForModel('totally-unknown-model', prior);

			expect(result.ok).toBe(true);
			if (result.ok) expect(result.value).toBe(prior);
		});
	});

	describe('never throws + capability-gated routing (NFR-PV-005/014)', () => {
		it('never throws across the port boundary even when construct fails', async () => {
			ports.providerRuntimeRegistry.setProviderConstructMode('codex', 'no-cli');
			await expect(useCase.select('codex', null)).resolves.toMatchObject({ ok: false });
		});

		it('contains no switch(providerId) / per-id branch (NFR-PV-014, SPEC-PV-029)', () => {
			const source = readFileSync(
				resolve(__dirname, '../../../../src/application/chat/providers/SelectProviderUseCase.ts'),
				'utf8',
			);
			expect(source).not.toMatch(/switch\s*\(\s*\w*[Pp]rovider/);
			expect(source).not.toMatch(/===\s*['"](?:claude|codex|opencode)['"]/);
		});
	});
});
