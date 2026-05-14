import type { Result } from '../shared/Result'
import type { Slug } from '../shared/Slug'
import type { Feature } from './Feature'

export interface IFeatureRepository {
  findAll(): Promise<Feature[]>
  findBySlug(slug: Slug): Promise<Feature | null>
  findById(id: string): Promise<Feature | null>
  /**
   * Create or update a feature's workflow-state.md. Creates idea.md on first
   * save. Returns `{ ideaCreated }` — `false` indicates an existing idea.md was
   * preserved (REQ-AVS-005), and the application layer should emit a notice.
   */
  save(feature: Feature): Promise<Result<{ ideaCreated: boolean }>>
  /**
   * Create the stage artifact file for stepNumber if it does not already
   * exist. Returns `{ created: false }` when an existing file was preserved
   * (REQ-AVS-005); application-layer callers translate that into a notice.
   */
  createStageFile(feature: Feature, stepNumber: number): Promise<Result<{ created: boolean }>>
  delete(id: string): Promise<Result<void>>
}
