import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import { err, ok, type Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import type { IFeatureService } from './IFeatureService'
import type { FeedbackService } from '@/application/shared/FeedbackService'
import { CreateFeatureUseCase } from './CreateFeatureUseCase'
import { AdvanceFeatureStageUseCase } from './AdvanceFeatureStageUseCase'

export class FeatureService implements IFeatureService {
  constructor(
    private readonly repo: IFeatureRepository,
    private readonly feedback?: FeedbackService,
  ) {}

  async loadFeatures(): Promise<Result<Feature[]>> {
    const features = await this.repo.findAll()
    return ok(features)
  }

  createFeature(title: string, area?: string): Promise<Result<Feature>> {
    return new CreateFeatureUseCase(this.repo, this.feedback).execute({ title, area })
  }

  activateFeature(featureId: string): Promise<Result<Feature>> {
    return this.executeTransition(featureId, (f) => f.activate())
  }

  archiveFeature(featureId: string): Promise<Result<Feature>> {
    return this.executeTransition(featureId, (f) => f.archive())
  }

  advanceFeatureStage(featureId: string): Promise<Result<Feature>> {
    return new AdvanceFeatureStageUseCase(this.repo, this.feedback).execute({ featureId })
  }

  private async executeTransition(
    featureId: string,
    transition: (f: Feature) => Result<Feature>,
  ): Promise<Result<Feature>> {
    const feature = await this.repo.findById(featureId)
    if (!feature) {
      return err(new Error(`Feature "${featureId}" not found`))
    }

    const transitionResult = transition(feature)
    if (!transitionResult.ok) return transitionResult

    const saveResult = await this.repo.save(transitionResult.value)
    if (!saveResult.ok) return saveResult

    return ok(transitionResult.value)
  }
}
