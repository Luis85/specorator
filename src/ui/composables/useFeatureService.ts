import type { InjectionKey } from 'vue'
import { inject } from 'vue'
import type { FeatureService } from '@/application/feature/FeatureService'

export const FEATURE_SERVICE_KEY: InjectionKey<FeatureService> = Symbol('FeatureService')

export function useFeatureService(): FeatureService {
  const service = inject(FEATURE_SERVICE_KEY)
  if (!service) throw new Error('FeatureService not provided')
  return service
}
