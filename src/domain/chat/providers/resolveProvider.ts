/**
 * Pure provider-resolution helpers (SPEC-PV-003). Ported from claudian
 * `ProviderRegistry.getEnabledProviderIds:117-123` + `resolveSettingsProviderId:133-150`
 * + `resolveProviderForModel:152-183`, with the throw-paths converted to total
 * returns (ADR-004). PURE over the descriptor table — no I/O, no class, no
 * `obsidian`/`node:*`/Vue. **No `switch (providerId)` / `if (provider === …)`**
 * (NFR-PV-014, SPEC-PV-029) — every decision gates on the descriptor data.
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type { ProviderDescriptor } from './ProviderDescriptor';
import { DEFAULT_CHAT_PROVIDER_ID } from './ProviderDescriptor';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

/**
 * The enabled descriptors, filtered by `isEnabled` + sorted ascending by
 * `blankTabOrder` (REQ-PV-002: opencode 10, codex 15, claude 20). Claude is always
 * present (its descriptor `isEnabled` is the constant `true`, REQ-PV-006). Returns
 * a FRESH array — never aliases the frozen table. Total.
 */
export function listEnabledProviders(
	descriptors: readonly ProviderDescriptor[],
	settings: PluginSettings,
): readonly ProviderDescriptor[] {
	return descriptors
		.filter((descriptor) => descriptor.isEnabled(settings))
		.sort((a, b) => a.blankTabOrder - b.blankTabOrder);
}

/**
 * The recorded `activeProvider` setting if it is registered AND its descriptor is
 * enabled, else `'claude'` (REQ-PV-003: default + fallback for an unknown/disabled
 * recorded selection, EC-PV-2/3). Total.
 */
export function resolveActiveProvider(
	descriptors: readonly ProviderDescriptor[],
	settings: PluginSettings,
): ProviderId {
	const recorded = descriptors.find((descriptor) => descriptor.id === settings.activeProvider);
	if (recorded?.isEnabled(settings) === true) {
		return recorded.id;
	}
	return DEFAULT_CHAT_PROVIDER_ID;
}

/**
 * The first descriptor whose `ownsModel(model)` is true, else
 * `resolveActiveProvider(...)` (which itself falls back to Claude, REQ-PV-060/061,
 * EC-PV-9). Total.
 */
export function resolveProviderForModel(
	descriptors: readonly ProviderDescriptor[],
	model: string,
	settings: PluginSettings,
): ProviderId {
	const owner = descriptors.find((descriptor) => descriptor.ownsModel(model));
	if (owner !== undefined) {
		return owner.id;
	}
	return resolveActiveProvider(descriptors, settings);
}
