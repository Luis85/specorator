/**
 * `useProviderRegistry` — Vue composable exposing the runtime
 * `ProviderRegistry` (REQ-MPS-006) provided by `SpecoratorView` /
 * `AgentSidepanelView` under `PROVIDER_REGISTRY_KEY`.
 *
 * Throws when no registry was provided so misconfigured callers fail loudly
 * — matching the other ADR-008 narrow-port composables (see
 * `useCommunityPluginPort`).
 */
import { inject } from 'vue'
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry'
import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports'

export function useProviderRegistry(): ProviderRegistry {
  const registry = inject(PROVIDER_REGISTRY_KEY)
  if (!registry) {
    throw new Error(
      'ProviderRegistry was not provided. Call app.provide(PROVIDER_REGISTRY_KEY, registry) before mounting the app.',
    )
  }
  return registry
}
