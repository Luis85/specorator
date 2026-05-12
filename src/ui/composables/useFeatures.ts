import { computed } from 'vue'
import { useFeatureStore } from '../stores/featureStore'
import { featureDtoFromDomain } from '../types/FeatureDto'
import type { FeatureDto } from '../types/FeatureDto'
import { useFeatureService } from './useFeatureService'
import { tryAsync } from '@/domain/shared/tryAsync'

export function useFeatures() {
  const store = useFeatureStore()
  const service = useFeatureService()

  async function withLoading<T>(fn: () => Promise<T>): Promise<T | undefined> {
    store.setLoading(true)
    store.setError(null)
    const result = await tryAsync(fn)
    store.setLoading(false)
    if (result.ok) return result.value
    store.setError(result.error.message)
    return undefined
  }

  async function loadFeatures(): Promise<void> {
    await withLoading(async () => {
      const result = await service.loadFeatures()
      if (result.ok) {
        store.setItems(result.value.map(featureDtoFromDomain))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function createFeature(
    title: string,
    area?: string,
  ): Promise<FeatureDto | undefined> {
    return withLoading(async () => {
      const result = await service.createFeature(title, area)
      if (result.ok) {
        const dto = featureDtoFromDomain(result.value)
        store.upsert(dto)
        return dto
      }
      store.setError(result.error.message)
      return undefined
    })
  }

  async function activateFeature(featureId: string): Promise<void> {
    await withLoading(async () => {
      const result = await service.activateFeature(featureId)
      if (result.ok) {
        store.upsert(featureDtoFromDomain(result.value))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function archiveFeature(featureId: string): Promise<void> {
    await withLoading(async () => {
      const result = await service.archiveFeature(featureId)
      if (result.ok) {
        store.upsert(featureDtoFromDomain(result.value))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function advanceFeatureStage(featureId: string): Promise<void> {
    await withLoading(async () => {
      const result = await service.advanceFeatureStage(featureId)
      if (result.ok) {
        store.upsert(featureDtoFromDomain(result.value))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  return {
    items: computed(() => store.items),
    activeItems: computed(() => store.activeItems),
    draftItems: computed(() => store.draftItems),
    loading: computed(() => store.loading),
    error: computed(() => store.error),
    loadFeatures,
    createFeature,
    activateFeature,
    archiveFeature,
    advanceFeatureStage,
  }
}
