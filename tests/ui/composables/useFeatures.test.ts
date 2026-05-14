import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { useFeatures } from '@/ui/composables/useFeatures'
import { FEATURE_SERVICE_KEY } from '@/ui/composables/useFeatureService'
import type { IFeatureService } from '@/application/feature/IFeatureService'
import { ok, err, type Result } from '@/domain/shared/Result'
import { Feature } from '@/domain/feature/Feature'
import { Slug } from '@/domain/shared/Slug'

function makeStubFeature(id = 'f1', title = 'Stub'): Feature {
  const slugResult = Slug.create(id)
  const slug = slugResult.ok ? slugResult.value : Slug.reconstitute('stub')
  const now = new Date()
  return Feature.reconstitute({
    id,
    slug,
    title,
    status: 'active',
    currentStep: 1,
    createdAt: now,
    updatedAt: now,
  })
}

function makeStubService(overrides: Partial<IFeatureService> = {}): IFeatureService {
  return {
    loadFeatures: vi.fn(async () => ok([]) as Result<Feature[]>),
    createFeature: vi.fn(async () => ok(makeStubFeature())),
    activateFeature: vi.fn(async () => ok(makeStubFeature())),
    archiveFeature: vi.fn(async () => ok(makeStubFeature())),
    advanceFeatureStage: vi.fn(async () => ok(makeStubFeature())),
    ...overrides,
  }
}

function harness(service: IFeatureService) {
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
        [FEATURE_SERVICE_KEY as unknown as symbol]: service,
      },
    },
  })
  return api
}

describe('useFeatures', () => {
  it('loadFeatures populates items via the stub-returned ok path', async () => {
    const service = makeStubService({
      loadFeatures: vi.fn(async () => ok([makeStubFeature('f1', 'Feature 1')])),
    })
    const api = harness(service)

    await api.loadFeatures()
    await flushPromises()

    expect(api.items.value.length).toBe(1)
    expect(api.items.value[0].id).toBe('f1')
    expect(api.error.value).toBeNull()
  })

  it('advanceFeatureStage upserts the updated feature', async () => {
    const service = makeStubService({
      advanceFeatureStage: vi.fn(async () => ok(makeStubFeature('f1', 'After Advance'))),
    })
    const api = harness(service)

    await api.advanceFeatureStage('f1')
    await flushPromises()

    const updated = api.items.value.find((f) => f.id === 'f1')
    expect(updated?.title).toBe('After Advance')
    expect(api.error.value).toBeNull()
  })

  it('sets store.error when advanceFeatureStage returns err', async () => {
    const service = makeStubService({
      advanceFeatureStage: vi.fn(async () => err(new Error('not found')) as Result<Feature>),
    })
    const api = harness(service)

    await api.advanceFeatureStage('missing')
    await flushPromises()

    expect(api.error.value).toMatch(/not found/)
    expect(api.loading.value).toBe(false)
  })

  it('sets store.error when loadFeatures returns err', async () => {
    const service = makeStubService({
      loadFeatures: vi.fn(async () => err(new Error('vault error')) as Result<Feature[]>),
    })
    const api = harness(service)

    await api.loadFeatures()
    await flushPromises()

    expect(api.error.value).toMatch(/vault error/)
    expect(api.items.value.length).toBe(0)
    expect(api.loading.value).toBe(false)
  })
})
