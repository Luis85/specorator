/**
 * `SelectProviderUseCase` — resolve + activate a provider for the current thread
 * (P9, SPEC-PV-013/023, ADR-PV-001 §2/§3). Persists the selection device-local,
 * tears down the prior runtime, and constructs the active one through the widened
 * `(providerId) => Result<ChatRuntimePort>` factory.
 *
 * Contract invariants:
 *  - **Result-returning + never throws** across the port boundary (NFR-PV-005) — a
 *    no-key / no-CLI / transport-unavailable construction is a `Result.err`, surfaced
 *    as an honest non-blocking notice, never a throw (REQ-PV-011/100).
 *  - **Device-local selection only** — `activeProvider` persists via the read-modify-
 *    write `SettingsPort`, never `data.json`, never a secret (REQ-PV-004/102). The
 *    secret read for a key-needing provider happens INSIDE the runtime construction at
 *    the infra boundary, never here (REQ-PV-071).
 *  - **No cross-provider leakage** — the prior runtime is reset + cancelled before the
 *    next turn (REQ-PV-012, EC-PV-13).
 *  - **Capability-gated routing, never branched on the provider id** — routing reads
 *    the registry + the factory, never the id (NFR-PV-014, SPEC-PV-029).
 *
 * No `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import type { Result } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ChatRuntimePort, ProviderRegistryPort, SettingsPort } from '@/domain/ports';
import type { ChatRuntimeFactory } from '@/ui/chat/modalSeam';
import type { FeedbackService } from '@/application/shared/FeedbackService';

/** The honest, secret-free notice copy keys per construct-fail reason (REQ-PV-011/102). */
const CONSTRUCT_FAIL_NOTICE: Record<string, string> = {
	keyRequired: 'providers.notice.keyRequired',
	cliNotFound: 'providers.notice.cliNotFound',
	unavailable: 'providers.notice.unavailable',
};

export class SelectProviderUseCase {
	constructor(
		private readonly registry: ProviderRegistryPort,
		private readonly settings: SettingsPort,
		private readonly runtimeFactory: ChatRuntimeFactory,
		private readonly feedback: FeedbackService,
	) {}

	/**
	 * Select `id` for the current thread: tear down the prior runtime, persist
	 * `activeProvider` device-local, then construct the active runtime via the widened
	 * factory (REQ-PV-004/011/012). Returns the new runtime or the honest `err`.
	 */
	async select(
		id: ProviderId,
		priorRuntime: ChatRuntimePort | null,
	): Promise<Result<ChatRuntimePort>> {
		// (1) Tear down the prior provider's session (no cross-provider leakage).
		priorRuntime?.resetSession();
		priorRuntime?.cancel();

		// (2) Persist the selection device-local (read-modify-write; never `data.json`).
		const current = await this.settings.getSettings();
		await this.settings.saveSettings({ ...current, activeProvider: id });

		// (3) Construct the active runtime (the secret read happens inside, at the
		// infra boundary). A failed construct → an honest notice + the `err` returns.
		const constructed = this.runtimeFactory(id);
		if (!constructed.ok) {
			this.feedback.warn(this.noticeFor(constructed.error.message));
		}
		return constructed;
	}

	/**
	 * Resolve the owning provider for a model selection; auto-switch to it when it
	 * differs from the active provider (REQ-PV-060), else a no-op returning the prior
	 * runtime (REQ-PV-061).
	 */
	async selectForModel(
		model: string,
		priorRuntime: ChatRuntimePort | null,
	): Promise<Result<ChatRuntimePort>> {
		const current = await this.settings.getSettings();
		const owning = this.registry.resolveProviderForModel(model, current);
		const active = this.registry.resolveActiveProvider(current);
		// Same provider with a live runtime → no-op (keep streaming on it, REQ-PV-061).
		if (owning === active && priorRuntime !== null) {
			return { ok: true, value: priorRuntime };
		}
		return this.select(owning, priorRuntime);
	}

	/** Map a construct-fail reason to its honest, secret-free notice copy. */
	private noticeFor(reason: string): string {
		return CONSTRUCT_FAIL_NOTICE[reason] ?? 'providers.notice.unavailable';
	}
}
