export const FEATURE_STATUSES = ['draft', 'active', 'archived', 'abandoned'] as const
export type FeatureStatus = (typeof FEATURE_STATUSES)[number]

export function isFeatureStatus(value: unknown): value is FeatureStatus {
  return FEATURE_STATUSES.includes(value as FeatureStatus)
}
