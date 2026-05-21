/**
 * T-MPS-032 — `useProviderRegistry` composable.
 *
 * Satisfies REQ-MPS-006. The composable is the UI's single entry point for
 * provider metadata; it injects `PROVIDER_REGISTRY_KEY` and throws a clear
 * error when the registry was not provided so misconfigured tests fail loudly
 * rather than silently degrading to `undefined`.
 */
import { describe, it, expect } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import { PROVIDER_REGISTRY_KEY } from '@/infrastructure/bridge/ports'
import { useProviderRegistry } from '@/ui/composables/useProviderRegistry'
import { buildProviderRegistry } from '@/plugin/transport/buildProviderRegistry'

describe('useProviderRegistry() — REQ-MPS-006', () => {
  it('returns the registry provided under PROVIDER_REGISTRY_KEY', () => {
    const registry = buildProviderRegistry()
    let captured: ReturnType<typeof useProviderRegistry> | null = null
    const Probe = defineComponent({
      setup() {
        captured = useProviderRegistry()
        return () => h('div')
      },
    })
    mount(Probe, {
      global: { provide: { [PROVIDER_REGISTRY_KEY as symbol]: registry } },
    })
    expect(captured).toBe(registry)
  })

  it('throws when no registry was provided', () => {
    const Probe = defineComponent({
      setup() {
        useProviderRegistry()
        return () => h('div')
      },
    })
    expect(() => mount(Probe)).toThrow(/ProviderRegistry was not provided/)
  })
})
