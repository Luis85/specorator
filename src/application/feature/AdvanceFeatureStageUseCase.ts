import { err, type Result } from '@/domain/shared/Result'
import type { Feature } from '@/domain/feature/Feature'
import { getStepMeta } from '@/domain/feature/FeatureStep'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { FeedbackService } from '@/application/shared/FeedbackService'

export interface AdvanceFeatureStageInput {
  readonly featureId: string
}

/**
 * Advance a feature to the next workflow stage.
 * Creates the new stage artifact file (if absent) and updates workflow-state.md.
 */
export class AdvanceFeatureStageUseCase {
  constructor(
    private readonly repository: IFeatureRepository,
    private readonly feedback?: FeedbackService,
  ) {}

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

      // REQ-AVS-005: the repository preserved an existing stage file. Surface
      // a notice so the user knows their handwritten file was kept. Slug is
      // derived from the (now-current) step so the message names the file the
      // user actually finds untouched on disk.
      if (!fileResult.value.created) {
        const meta = getStepMeta(advanced.currentStep)
        if (meta !== undefined) {
          this.feedback?.info(
            `Specorator: ${meta.slug}.md already exists — keeping your version.`,
          )
        }
      }
    }

    const saveResult = await this.repository.save(advanced)
    if (!saveResult.ok) return saveResult

    return advancedResult
  }
}
