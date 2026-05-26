/**
 * The shared descriptor-table `ProviderRegistryPort` impl (P9, SPEC-PV-008). A
 * single class over the frozen `PROVIDER_DESCRIPTORS` (SPEC-PV-002) + the pure
 * `resolveProvider` helpers (SPEC-PV-003). The SAME impl is shared across the
 * three bridges — the table is plain data, no I/O — so it lives at
 * `src/infrastructure/providers/**` (coverage-included, NOT under `obsidian/**`).
 *
 * **Capability-gated, never branched on the provider id** (NFR-PV-014,
 * SPEC-PV-029): every read indexes the descriptor table or delegates to a pure
 * helper — no provider-id branch anywhere in this reader. Total —
 * never throws (the union is closed, so `getDescriptor` is always defined). No
 * `obsidian`/`node:*`/Vue import.
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ProviderDescriptor,
	ProviderCapabilities,
	ProviderRegistryPort,
} from '@/domain/ports';
import {
	PROVIDER_DESCRIPTORS,
	listEnabledProviders,
	resolveActiveProvider,
	resolveProviderForModel,
} from '@/domain/chat/providers';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

export class ProviderRegistry implements ProviderRegistryPort {
	private readonly byId: ReadonlyMap<ProviderId, ProviderDescriptor> = new Map(
		PROVIDER_DESCRIPTORS.map((descriptor) => [descriptor.id, descriptor]),
	);

	listRegisteredProviders(): readonly ProviderDescriptor[] {
		return PROVIDER_DESCRIPTORS;
	}

	listEnabledProviders(settings: PluginSettings): readonly ProviderDescriptor[] {
		return listEnabledProviders(PROVIDER_DESCRIPTORS, settings);
	}

	getDescriptor(id: ProviderId): ProviderDescriptor {
		// The union is closed and the table holds every member, so the lookup is
		// always defined; the non-null assertion is the closed-union post-condition
		// (SPEC-PV-004 — `getDescriptor` is total, never undefined).
		const descriptor = this.byId.get(id);
		if (descriptor === undefined) {
			// Unreachable for the closed `ProviderId` union; fall back to the first
			// frozen descriptor (Claude) so the read stays total even if the union
			// ever widens without a matching descriptor.
			return PROVIDER_DESCRIPTORS[0];
		}
		return descriptor;
	}

	getDisplayNameKey(id: ProviderId): string {
		return this.getDescriptor(id).displayNameKey;
	}

	getCapabilities(id: ProviderId): ProviderCapabilities {
		return this.getDescriptor(id).capabilities;
	}

	resolveActiveProvider(settings: PluginSettings): ProviderId {
		return resolveActiveProvider(PROVIDER_DESCRIPTORS, settings);
	}

	resolveProviderForModel(model: string, settings: PluginSettings): ProviderId {
		return resolveProviderForModel(PROVIDER_DESCRIPTORS, model, settings);
	}
}
