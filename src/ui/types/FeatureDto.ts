import type { FeatureStatus } from '@/domain/feature/FeatureStatus'

/** Plain serialisable representation used by Pinia and Vue components. */
export interface FeatureDto {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly status: FeatureStatus
  readonly currentStep: number
  readonly createdAt: string
  readonly updatedAt: string
}

export function featureDtoFromDomain(feature: {
  toPlainObject(): {
    id: string
    slug: string
    title: string
    status: FeatureStatus
    currentStep: number
    createdAt: Date
    updatedAt: Date
  }
}): FeatureDto {
  const p = feature.toPlainObject()
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}
