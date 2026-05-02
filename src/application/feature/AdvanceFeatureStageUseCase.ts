import { err, type Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { UseCase } from '../shared/UseCase'

export interface AdvanceFeatureStageInput {
  readonly featureId: string
}

/**
 * Advance a feature to the next workflow stage.
 * Creates the new stage artifact file (if absent) and updates workflow-state.md.
 */
export class AdvanceFeatureStageUseCase implements UseCase<AdvanceFeatureStageInput, Feature> {
  constructor(private readonly repository: IFeatureRepository) {}

  async execute(input: AdvanceFeatureStageInput): Promise<Result<Feature>> {
    const feature = await this.repository.findById(input.featureId)
    if (!feature) {
      return err(new Error(`Feature "${input.featureId}" not found`))
    }

    const advancedResult = feature.advanceStep()
    if (!advancedResult.ok) return advancedResult

    const advanced = advancedResult.value

    // Stage file is written before workflow-state so the operation is safe to
    // retry.  createStageFile is idempotent: if the file already exists it
    // returns ok without overwriting, so a retry after a failed save will find
    // the file present, skip the write, and re-attempt the save at the correct
    // currentStep.  If we saved first instead, a createStageFile failure would
    // leave currentStep already incremented; a retry would advance again and
    // permanently skip the missing artifact.
    if (!advanced.isComplete) {
      const fileResult = await this.repository.createStageFile(advanced, advanced.currentStep)
      if (!fileResult.ok) return fileResult
    }

    const saveResult = await this.repository.save(advanced)
    if (!saveResult.ok) return saveResult

    return advancedResult
  }
}
