export const FEATURE_STEPS = [
  'vision',
  'problem-scope',
  'research',
  'design',
  'requirements',
  'architecture',
  'tasks',
  'implementation',
  'qa',
  'review',
  'ship',
] as const

export type FeatureStepSlug = (typeof FEATURE_STEPS)[number]

export const FEATURE_STEP_COUNT = FEATURE_STEPS.length

export interface FeatureStepMeta {
  readonly number: number
  readonly slug: FeatureStepSlug
  readonly fileName: string
}

export function getStepMeta(stepNumber: number): FeatureStepMeta | undefined {
  const slug = FEATURE_STEPS[stepNumber - 1]
  if (!slug) return undefined
  return {
    number: stepNumber,
    slug,
    fileName: `${String(stepNumber).padStart(2, '0')}-${slug}.md`,
  }
}

export function getAllStepMeta(): FeatureStepMeta[] {
  return FEATURE_STEPS.map((slug, idx) => ({
    number: idx + 1,
    slug,
    fileName: `${String(idx + 1).padStart(2, '0')}-${slug}.md`,
  }))
}
