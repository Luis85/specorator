import { ok, err, type Result } from '@/domain/shared/Result'
import { Slug } from '@/domain/shared/Slug'
import { Feature } from '@/domain/feature/Feature'
import type { IFeatureRepository } from '@/domain/feature/IFeatureRepository'
import type { UseCase } from '../shared/UseCase'

export interface CreateFeatureInput {
  readonly title: string
  /** Optional 3–5 uppercase-letter area code (e.g. "DM" for dark-mode). Derived from slug if omitted. */
  readonly area?: string
}

export class CreateFeatureUseCase implements UseCase<CreateFeatureInput, Feature> {
  constructor(private readonly repository: IFeatureRepository) {}

  async execute(input: CreateFeatureInput): Promise<Result<Feature>> {
    const slugResult = Slug.create(input.title)
    if (!slugResult.ok) return slugResult

    // findBySlug throws when the file exists but is malformed, so both the
    // "already exists" and "unreadable file" cases block creation safely.
    let existing: Feature | null
    try {
      existing = await this.repository.findBySlug(slugResult.value)
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)))
    }
    if (existing) {
      return err(new Error(`A feature with slug "${slugResult.value}" already exists`))
    }

    const id = crypto.randomUUID()
    const featureResult = Feature.create(id, slugResult.value, input.title, input.area)
    if (!featureResult.ok) return featureResult

    const saveResult = await this.repository.save(featureResult.value)
    if (!saveResult.ok) return saveResult

    return ok(featureResult.value)
  }
}
