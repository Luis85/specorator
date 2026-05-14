import type { Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'

export interface IFeatureService {
  loadFeatures(): Promise<Result<Feature[]>>
  createFeature(title: string, area?: string): Promise<Result<Feature>>
  activateFeature(featureId: string): Promise<Result<Feature>>
  archiveFeature(featureId: string): Promise<Result<Feature>>
  advanceFeatureStage(featureId: string): Promise<Result<Feature>>
}
