import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { ok, type Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import { CreateFeatureUseCase } from './CreateFeatureUseCase'
import { ActivateFeatureUseCase } from './ActivateFeatureUseCase'
import { ArchiveFeatureUseCase } from './ArchiveFeatureUseCase'
import { AdvanceFeatureStageUseCase } from './AdvanceFeatureStageUseCase'

export class FeatureService {
  constructor(private readonly repo: IFeatureRepository) {}

  async loadFeatures(): Promise<Result<Feature[]>> {
    const features = await this.repo.findAll()
    return ok(features)
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
