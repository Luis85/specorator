import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { describe, expect, it, beforeEach } from 'vitest'
import { useFeatures } from '@/ui/composables/useFeatures'
import { FEATURE_SERVICE_KEY } from '@/ui/composables/useFeatureService'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { FeatureService } from '@/application/feature/FeatureService'

function makeService(bridge: MockBridge): FeatureService {
  return new FeatureService(async () => {
    const settings = await bridge.getSettings()
    return new FeatureRepository(bridge, bridge, () => settings)
  })
}

function harness(bridge: MockBridge) {
  let api!: ReturnType<typeof useFeatures>
  const Host = defineComponent({
    setup() {
      api = useFeatures()
      return () => h('div')
    },
  })
  mount(Host, {
    global: {
      plugins: [createPinia()],
      provide: {
        [FEATURE_SERVICE_KEY as unknown as symbol]: makeService(bridge),
      },
    },
  })
  return api
}

async function seedActiveFeature(bridge: MockBridge, title = 'Search') {
  const service = makeService(bridge)
  const created = await service.createFeature(title)
  if (!created.ok) throw created.error
  const activated = await service.activateFeature(created.value.id)
  if (!activated.ok) throw activated.error
  return activated.value
}

describe('useFeatures.advanceFeatureStage', () => {
  let bridge: MockBridge

  beforeEach(() => {
    bridge = new MockBridge()
  })

  it('advances current step and upserts the updated feature into the store', async () => {
    const seeded = await seedActiveFeature(bridge)
    const api = harness(bridge)

    await api.loadFeatures()
    await flushPromises()

    expect(api.items.value.find((f) => f.id === seeded.id)?.currentStep).toBe(1)

    await api.advanceFeatureStage(seeded.id)
    await flushPromises()

    const updated = api.items.value.find((f) => f.id === seeded.id)
    expect(updated?.currentStep).toBe(2)
    expect(api.error.value).toBeNull()
    // Stage file must be written for the new stage
    expect('specs/search/research.md' in bridge.getAllFiles()).toBe(true)
  })

  it('sets store.error and does not throw when the feature is missing', async () => {
    const api = harness(bridge)

    await api.advanceFeatureStage('nonexistent-id')
    await flushPromises()

    expect(api.error.value).toMatch(/not found/)
    expect(api.loading.value).toBe(false)
  })
})
