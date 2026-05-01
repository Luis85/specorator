import { type Result, err } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { UseCase } from '../shared/UseCase'

export interface ArchiveFeatureInput {
  readonly featureId: string
}

export class ArchiveFeatureUseCase implements UseCase<ArchiveFeatureInput, Feature> {
  constructor(private readonly repository: IFeatureRepository) {}

  async execute(input: ArchiveFeatureInput): Promise<Result<Feature>> {
    const feature = await this.repository.findById(input.featureId)
    if (!feature) {
      return err(new Error(`Feature "${input.featureId}" not found`))
    }

    const archivedResult = feature.archive()
    if (!archivedResult.ok) return archivedResult

    const saveResult = await this.repository.save(archivedResult.value)
    if (!saveResult.ok) return saveResult

    return archivedResult
  }
}
