import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import { GetFeaturesUseCase } from './GetFeaturesUseCase'
import { CreateFeatureUseCase } from './CreateFeatureUseCase'
import { ActivateFeatureUseCase } from './ActivateFeatureUseCase'
import { ArchiveFeatureUseCase } from './ArchiveFeatureUseCase'
import { AdvanceFeatureStageUseCase } from './AdvanceFeatureStageUseCase'

export class FeatureService {
  constructor(private readonly repoFactory: () => Promise<IFeatureRepository>) {}

  async loadFeatures(): Promise<Result<Feature[]>> {
    return new GetFeaturesUseCase(await this.repoFactory()).execute()
  }

  async createFeature(title: string, area?: string): Promise<Result<Feature>> {
    return new CreateFeatureUseCase(await this.repoFactory()).execute({ title, area })
  }

  async activateFeature(featureId: string): Promise<Result<Feature>> {
    return new ActivateFeatureUseCase(await this.repoFactory()).execute({ featureId })
  }

  async archiveFeature(featureId: string): Promise<Result<Feature>> {
    return new ArchiveFeatureUseCase(await this.repoFactory()).execute({ featureId })
  }

  async advanceFeatureStage(featureId: string): Promise<Result<Feature>> {
    return new AdvanceFeatureStageUseCase(await this.repoFactory()).execute({ featureId })
  }
}
