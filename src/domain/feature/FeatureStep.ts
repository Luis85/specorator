export const FEATURE_STEPS = [
	'idea',
	'research',
	'requirements',
	'design',
	'spec',
	'tasks',
	'implementation-log',
	'test-plan',
	'test-report',
	'review',
	'release-notes',
	'retrospective',
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
	return { number: stepNumber, slug, fileName: `${slug}.md` }
}

export function getAllStepMeta(): FeatureStepMeta[] {
	return FEATURE_STEPS.map((slug, idx) => ({
		number: idx + 1,
		slug,
		fileName: `${slug}.md`,
	}))
}
