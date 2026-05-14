import type { InjectionKey } from 'vue'
import { inject } from 'vue'
import type { IFeatureService } from '@/application/feature/IFeatureService'

export const FEATURE_SERVICE_KEY: InjectionKey<IFeatureService> = Symbol('FeatureService')

export function useFeatureService(): IFeatureService {
  const service = inject(FEATURE_SERVICE_KEY)
  if (!service) throw new Error('FeatureService not provided')
  return service
}
