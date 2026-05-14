import { ok, err, type Result } from '@/domain/shared/Result'
import { tryAsync } from '@/domain/shared/tryAsync'
import { Slug } from '@/domain/shared/Slug'
import { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { FeedbackService } from '@/application/shared/FeedbackService'

export interface CreateFeatureInput {
  readonly title: string
  /** Optional 3–5 uppercase-letter area code (e.g. "DM" for dark-mode). Derived from slug if omitted. */
  readonly area?: string
}

export class CreateFeatureUseCase {
  constructor(
    private readonly repository: IFeatureRepository,
    private readonly feedback?: FeedbackService,
  ) {}

  async execute(input: CreateFeatureInput): Promise<Result<Feature>> {
    const slugResult = Slug.create(input.title)
    if (!slugResult.ok) return slugResult

    // findBySlug throws when the file exists but is malformed, so both the
    // "already exists" and "unreadable file" cases block creation safely.
    const existingResult = await tryAsync(() => this.repository.findBySlug(slugResult.value))
    if (!existingResult.ok) return existingResult
    if (existingResult.value) {
      return err(new Error(`A feature with slug "${slugResult.value.value}" already exists`))
    }

    const id = crypto.randomUUID()
    const featureResult = Feature.create(id, slugResult.value, input.title, input.area)
    if (!featureResult.ok) return featureResult

    const saveResult = await this.repository.save(featureResult.value)
    if (!saveResult.ok) return saveResult

    // REQ-AVS-005: when idea.md already existed, the repository preserved it.
    // Surface a notice so the user knows their handwritten file was kept.
    if (!saveResult.value.ideaCreated) {
      this.feedback?.info('Specorator: idea.md already exists — keeping your version.')
    }

    return ok(featureResult.value)
  }
}
