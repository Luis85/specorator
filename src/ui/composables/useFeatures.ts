import { computed } from 'vue'
import { useBridge } from './useBridge'
import { useFeatureStore } from '../stores/featureStore'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { GetFeaturesUseCase } from '@/application/feature/GetFeaturesUseCase'
import { CreateFeatureUseCase } from '@/application/feature/CreateFeatureUseCase'
import { ActivateFeatureUseCase } from '@/application/feature/ActivateFeatureUseCase'
import { ArchiveFeatureUseCase } from '@/application/feature/ArchiveFeatureUseCase'
import { featureDtoFromDomain } from '../types/FeatureDto'
import type { FeatureDto } from '../types/FeatureDto'

export function useFeatures() {
  const bridge = useBridge()
  const store = useFeatureStore()

  async function withLoading<T>(fn: () => Promise<T>): Promise<T | undefined> {
    store.setLoading(true)
    store.setError(null)
    try {
      return await fn()
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      store.setLoading(false)
    }
  }

  async function loadFeatures(): Promise<void> {
    await withLoading(async () => {
      const settings = await bridge.getSettings()
      const repo = new FeatureRepository(bridge, settings)
      const result = await new GetFeaturesUseCase(repo).execute()
      if (result.ok) {
        store.setItems(result.value.map(featureDtoFromDomain))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function createFeature(title: string): Promise<FeatureDto | undefined> {
    return withLoading(async () => {
      const settings = await bridge.getSettings()
      const repo = new FeatureRepository(bridge, settings)
      const result = await new CreateFeatureUseCase(repo).execute({ title })
      if (result.ok) {
        const dto = featureDtoFromDomain(result.value)
        store.upsert(dto)
        return dto
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function activateFeature(featureId: string): Promise<void> {
    await withLoading(async () => {
      const settings = await bridge.getSettings()
      const repo = new FeatureRepository(bridge, settings)
      const result = await new ActivateFeatureUseCase(repo).execute({ featureId })
      if (result.ok) {
        store.upsert(featureDtoFromDomain(result.value))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function archiveFeature(featureId: string): Promise<void> {
    await withLoading(async () => {
      const settings = await bridge.getSettings()
      const repo = new FeatureRepository(bridge, settings)
      const result = await new ArchiveFeatureUseCase(repo).execute({ featureId })
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
  }
}
