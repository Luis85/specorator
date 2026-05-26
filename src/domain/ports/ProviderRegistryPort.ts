/**
 * `ProviderRegistryPort` (P9, SPEC-PV-004, ADR-PV-001 §1). The narrow read-only
 * registry surface over the frozen `PROVIDER_DESCRIPTORS` (SPEC-PV-002) + the pure
 * `resolveProvider` helpers (SPEC-PV-003). One port for one consumer kind (the
 * chooser view-model + the select use case); its own `PROVIDER_REGISTRY_PORT` key +
 * `useProviderRegistryPort()` composable, no aggregate (ADR-008, NFR-PV-006).
 *
 * **Pure synchronous reads — no I/O, no `Promise`, total (never throws).** The
 * runtime CONSTRUCTION is the widened `CHAT_RUNTIME_FACTORY` (SPEC-PV-005), NOT this
 * port. No `obsidian`/`node:*`/Vue import.
 */
import type { ProviderId } from '@/domain/chat/ProviderId';
import type {
	ProviderDescriptor,
	ProviderCapabilities,
} from '@/domain/chat/providers/ProviderDescriptor';
import type { PluginSettings } from '@/domain/settings/PluginSettings';

export interface ProviderRegistryPort {
	/** Every registered descriptor (REQ-PV-001). Total. */
	listRegisteredProviders(): readonly ProviderDescriptor[];
	/** The enabled descriptors, blank-tab-ordered; Claude always present (REQ-PV-002/006). Total. */
	listEnabledProviders(settings: PluginSettings): readonly ProviderDescriptor[];
	/** The descriptor for `id` (REQ-PV-001). Total — the union is closed, never undefined. */
	getDescriptor(id: ProviderId): ProviderDescriptor;
	/** The display-name i18n key for `id` (REQ-PV-090). Total. */
	getDisplayNameKey(id: ProviderId): string;
	/** The frozen capability bag for `id` (REQ-PV-013/020..023). Total. */
	getCapabilities(id: ProviderId): ProviderCapabilities;
	/** The active provider: recorded-if-enabled, else claude (REQ-PV-003, EC-PV-2/3). Total. */
	resolveActiveProvider(settings: PluginSettings): ProviderId;
	/** The owning provider for a model, else the active/claude fallback (REQ-PV-060/061, EC-PV-9). Total. */
	resolveProviderForModel(model: string, settings: PluginSettings): ProviderId;
}
