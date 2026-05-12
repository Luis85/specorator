import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import { GetFeaturesUseCase } from './GetFeaturesUseCase'
import { CreateFeatureUseCase } from './CreateFeatureUseCase'
import { ActivateFeatureUseCase } from './ActivateFeatureUseCase'
import { ArchiveFeatureUseCase } from './ArchiveFeatureUseCase'
import { AdvanceFeatureStageUseCase } from './AdvanceFeatureStageUseCase'

export class FeatureService {
  constructor(private readonly repo: IFeatureRepository) {}

  loadFeatures(): Promise<Result<Feature[]>> {
    return new GetFeaturesUseCase(this.repo).execute()
  }

  createFeature(title: string, area?: string): Promise<Result<Feature>> {
    return new CreateFeatureUseCase(this.repo).execute({ title, area })
  }

  activateFeature(featureId: string): Promise<Result<Feature>> {
    return new ActivateFeatureUseCase(this.repo).execute({ featureId })
  }

  archiveFeature(featureId: string): Promise<Result<Feature>> {
    return new ArchiveFeatureUseCase(this.repo).execute({ featureId })
  }

  advanceFeatureStage(featureId: string): Promise<Result<Feature>> {
    return new AdvanceFeatureStageUseCase(this.repo).execute({ featureId })
  }
}
