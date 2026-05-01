import type { Result } from '../shared/Result'
import type { Slug } from '../shared/Slug'
import type { Feature } from './Feature'

export interface IFeatureRepository {
  findAll(): Promise<Feature[]>
  findBySlug(slug: Slug): Promise<Feature | null>
  findById(id: string): Promise<Feature | null>
  save(feature: Feature): Promise<Result<void>>
  delete(id: string): Promise<Result<void>>
}
