/**
 * `ProviderRegistry` — domain-layer contract for the per-(provider, mode)
 * adapter table.
 *
 * Satisfies REQ-MPS-006, NFR-MPS-003. The registry is the single addressable
 * source of `ProviderEntry` records for the UI (model pickers, capability
 * tooltips) and the selector (mode-disabled reasons). It carries no secret
 * material: keys and tokens live behind `SecretStorePort` only.
 *
 * The interface is implementation-free in WS-2. WS-3's
 * `buildProviderRegistry` wires concrete `ChatTransportPort` instances into
 * `ProviderEntry` records at plugin startup. UI / selector consumers depend
 * on this interface only.
 *
 * Domain layer (ADR-008): no `obsidian` / `child_process` imports.
 */
import type { SlashCommand } from './SlashCommand'
import type { ProviderId } from './ProviderSelection'
import type { ProviderCapabilities } from './ProviderCapabilities'

/**
 * Per-provider metadata bundle. Exposes the provider's user-facing label,
 * its declared `ProviderCapabilities`, and the slash-command palette
 * entries it contributes (empty when no provider-specific commands are
 * exposed).
 *
 * NFR-MPS-003: no secret-bearing fields. The registry must never carry
 * API keys, tokens, or other credentials; consumers retrieve those via
 * `SecretStorePort` at the moment of need.
 */
export interface ProviderEntry {
  readonly id: ProviderId
  readonly label: string
  readonly capabilities: ProviderCapabilities
  /** Empty when no provider-specific slash commands are exposed. */
  slashCommands(): ReadonlyArray<SlashCommand>
}

/**
 * Read-only registry of provider entries. Resolved once at plugin startup
 * by `buildProviderRegistry` (WS-3) and provided via dependency injection
 * to consumers.
 */
export interface ProviderRegistry {
  /** All registered providers in deterministic order. */
  listProviders(): ReadonlyArray<ProviderEntry>
  /** Lookup by id; `undefined` for an unknown provider. */
  getProvider(id: ProviderId): ProviderEntry | undefined
  /** Convenience accessor for the capability record of a known provider. */
  getCapabilities(id: ProviderId): ProviderCapabilities | undefined
}
