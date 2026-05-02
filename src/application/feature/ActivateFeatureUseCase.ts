import { type Result } from '@/domain/shared/Result'
import { err } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { UseCase } from '../shared/UseCase'

export interface ActivateFeatureInput {
  readonly featureId: string
}

export class ActivateFeatureUseCase implements UseCase<ActivateFeatureInput, Feature> {
  constructor(private readonly repository: IFeatureRepository) {}

  async execute(input: ActivateFeatureInput): Promise<Result<Feature>> {
    const feature = await this.repository.findById(input.featureId)
    if (!feature) {
      return err(new Error(`Feature "${input.featureId}" not found`))
    }

    const activatedResult = feature.activate()
    if (!activatedResult.ok) return activatedResult

    const saveResult = await this.repository.save(activatedResult.value)
    if (!saveResult.ok) return saveResult

    return activatedResult
  }
}
