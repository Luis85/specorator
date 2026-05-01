import { ok, type Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { UseCase } from '../shared/UseCase'

export class GetFeaturesUseCase implements UseCase<void, Feature[]> {
  constructor(private readonly repository: IFeatureRepository) {}

  async execute(): Promise<Result<Feature[]>> {
    const features = await this.repository.findAll()
    return ok(features)
  }
}
