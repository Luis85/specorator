/**
 * `ProviderConsentGate` — the one-time beyond-vault consent check before a provider's
 * first home-dir read (P9, SPEC-PV-014/024, ADR-PV-003 §2). Reads + records the
 * consent device-local; opens the modal seam on first need.
 *
 * Contract invariants:
 *  - **One-time** — a recorded `true` consents without a prompt; a recorded `false`
 *    declines without a re-prompt (REQ-PV-082, EC-PV-6). At most one modal open + one
 *    device-local write per first-need.
 *  - **Result-returning + never throws** across the port boundary (NFR-PV-005). A
 *    declining user gets `ok(false)` (the caller disables that provider's history
 *    honestly), never an `err`.
 *  - **Modal seam, never `window.confirm`** — the prompt opens through the injected
 *    `OpenProviderConsentFn`, which auto-declines (`false`) when its real Obsidian
 *    `Modal` launcher is absent (REQ-PV-113).
 *  - **Device-local, never a secret** — the record persists through `SettingsPort`
 *    keyed by `provider.homeFsConsent.<id>` (`homeFsConsentKey`), never `data.json`,
 *    never a secret value.
 *
 * A Claude-only user never invokes this gate (`readsHomeDir:false`, REQ-PV-114). No
 * `obsidian`, no `node:*`, no Vue (application layer, ADR-001).
 */
import type { Result } from '@/domain/shared/Result';
import { ok } from '@/domain/shared/Result';
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { SettingsPort } from '@/domain/ports';
import { homeFsConsentKey } from '@/domain/settings/PluginSettings';
import type { OpenProviderConsentFn } from '@/ui/chat/modalSeam';

export class ProviderConsentGate {
	constructor(
		private readonly settings: SettingsPort,
		private readonly openConsent: OpenProviderConsentFn,
	) {}

	/**
	 * Ensure beyond-vault consent for `id` (REQ-PV-082): a recorded consent returns it
	 * without a prompt; no record opens the consent modal once, records the outcome
	 * device-local, and returns it. Total — never throws.
	 */
	async ensureConsent(id: ProviderId): Promise<Result<boolean>> {
		const key = homeFsConsentKey(id);
		const current = await this.settings.getSettings();
		const recorded = current.homeFsConsent?.[key];
		if (recorded !== undefined) {
			// A prior accept (true) or decline (false) is honoured without a re-prompt.
			return ok(recorded);
		}

		const outcome = await this.openConsent(id);
		await this.settings.saveSettings({
			...current,
			homeFsConsent: { ...current.homeFsConsent, [key]: outcome },
		});
		return ok(outcome);
	}
}
