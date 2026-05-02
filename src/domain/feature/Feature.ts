import { ok, err, type Result } from '../shared/Result'
import type { Slug } from '../shared/Slug'
import type { FeatureStatus } from './FeatureStatus'
import { FEATURE_STEP_COUNT } from './FeatureStep'

export interface FeatureProps {
  readonly id: string
  readonly slug: Slug
  readonly title: string
  readonly area?: string
  readonly status: FeatureStatus
  readonly currentStep: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface FeaturePlainObject {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly area: string
  readonly status: FeatureStatus
  readonly currentStep: number
  readonly createdAt: Date
  readonly updatedAt: Date
}

export class Feature {
  private constructor(private readonly props: FeatureProps) {}

  static create(id: string, slug: Slug, title: string, area?: string): Result<Feature> {
    if (!title.trim()) {
      return err(new Error('Feature title cannot be empty'))
    }
    const now = new Date()
    return ok(
      new Feature({
        id,
        slug,
        title: title.trim(),
        area: area?.toUpperCase().trim() || '',
        status: 'draft',
        currentStep: 1,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }

  static reconstitute(props: FeatureProps): Feature {
    return new Feature(props)
  }

  get id(): string { return this.props.id }
  get slug(): Slug { return this.props.slug }
  get title(): string { return this.props.title }
  get area(): string { return this.props.area ?? '' }
  get status(): FeatureStatus { return this.props.status }
  get currentStep(): number { return this.props.currentStep }
  get createdAt(): Date { return this.props.createdAt }
  get updatedAt(): Date { return this.props.updatedAt }
  get isComplete(): boolean { return this.props.currentStep > FEATURE_STEP_COUNT }

  activate(): Result<Feature> {
    if (this.props.status !== 'draft') {
      return err(new Error(`Cannot activate a feature with status "${this.props.status}"`))
    }
    return ok(new Feature({ ...this.props, status: 'active', updatedAt: new Date() }))
  }

  advanceStep(): Result<Feature> {
    if (this.props.status !== 'active') {
      return err(new Error('Can only advance steps on an active feature'))
    }
    if (this.isComplete) {
      return err(new Error('Feature has already completed all steps'))
    }
    return ok(new Feature({ ...this.props, currentStep: this.props.currentStep + 1, updatedAt: new Date() }))
  }

  archive(): Result<Feature> {
    if (this.props.status === 'archived') {
      return err(new Error('Feature is already archived'))
    }
    return ok(new Feature({ ...this.props, status: 'archived', updatedAt: new Date() }))
  }

  abandon(): Result<Feature> {
    if (this.props.status === 'abandoned') {
      return err(new Error('Feature is already abandoned'))
    }
    return ok(new Feature({ ...this.props, status: 'abandoned', updatedAt: new Date() }))
  }

  toPlainObject(): FeaturePlainObject {
    return {
      id: this.props.id,
      slug: this.props.slug.toString(),
      title: this.props.title,
      area: this.props.area ?? '',
      status: this.props.status,
      currentStep: this.props.currentStep,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    }
  }
}
