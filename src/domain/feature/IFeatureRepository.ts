import type { Result } from '../shared/Result'
import type { Slug } from '../shared/Slug'
import type { Feature } from './Feature'

export interface IFeatureRepository {
  findAll(): Promise<Feature[]>
  findBySlug(slug: Slug): Promise<Feature | null>
  findById(id: string): Promise<Feature | null>
  /** Create or update a feature's workflow-state.md. Creates idea.md on first save. */
  save(feature: Feature): Promise<Result<void>>
  /** Create the stage artifact file for stepNumber if it does not already exist. */
  createStageFile(feature: Feature, stepNumber: number): Promise<Result<void>>
  delete(id: string): Promise<Result<void>>
}
