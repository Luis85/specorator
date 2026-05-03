import { computed } from 'vue'
import { useSettingsPort } from './useSettingsPort'
import { useVaultPort } from './useVaultPort'
import { useNotificationPort } from './useNotificationPort'
import { useFeatureStore } from '../stores/featureStore'
import { FeatureRepository } from '@/infrastructure/bridge/FeatureRepository'
import { GetFeaturesUseCase } from '@/application/feature/GetFeaturesUseCase'
import { CreateFeatureUseCase } from '@/application/feature/CreateFeatureUseCase'
import { ActivateFeatureUseCase } from '@/application/feature/ActivateFeatureUseCase'
import { AdvanceFeatureStageUseCase } from '@/application/feature/AdvanceFeatureStageUseCase'
import { ArchiveFeatureUseCase } from '@/application/feature/ArchiveFeatureUseCase'
import { tryAsync } from '@/domain/shared/tryAsync'
import { featureDtoFromDomain } from '../types/FeatureDto'
import type { FeatureDto } from '../types/FeatureDto'

export function useFeatures() {
  const settingsPort = useSettingsPort()
  const vault = useVaultPort()
  const notifications = useNotificationPort()
  const store = useFeatureStore()

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
      const settings = await settingsPort.getSettings()
      const repo = new FeatureRepository(vault, notifications, settings)
      const result = await new GetFeaturesUseCase(repo).execute()
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
      const settings = await settingsPort.getSettings()
      const repo = new FeatureRepository(vault, notifications, settings)
      const result = await new CreateFeatureUseCase(repo).execute({ title, area })
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
      const settings = await settingsPort.getSettings()
      const repo = new FeatureRepository(vault, notifications, settings)
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
      const settings = await settingsPort.getSettings()
      const repo = new FeatureRepository(vault, notifications, settings)
      const result = await new ArchiveFeatureUseCase(repo).execute({ featureId })
      if (result.ok) {
        store.upsert(featureDtoFromDomain(result.value))
      } else {
        store.setError(result.error.message)
      }
    })
  }

  async function advanceFeatureStage(featureId: string): Promise<void> {
    await withLoading(async () => {
      const settings = await settingsPort.getSettings()
      const repo = new FeatureRepository(vault, notifications, settings)
      const result = await new AdvanceFeatureStageUseCase(repo).execute({ featureId })
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
