import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/ui/i18n'
import type { FeatureDto } from '@/ui/types/FeatureDto'
import FeatureCard from '@/ui/components/feature/FeatureCard.vue'
import { FeatureCardPageObject } from './FeatureCard.po'

function makeFeature(overrides: Partial<FeatureDto> = {}): FeatureDto {
	return {
		id: 'feature-1',
		slug: 'feature-1',
		title: 'Feature 1',
		status: 'active',
		currentStep: 1,
		createdAt: '2026-05-02T00:00:00.000Z',
		updatedAt: '2026-05-02T00:00:00.000Z',
		...overrides,
	}
}

function mountCard(feature: FeatureDto) {
	const wrapper = mount(FeatureCard, {
		props: { feature },
		global: { plugins: [i18n] },
	})
	return new FeatureCardPageObject(wrapper)
}

describe('FeatureCard', () => {
	it('renders idea-stage progress', () => {
		const po = mountCard(makeFeature({ currentStep: 1 }))
		expect(po.stepLabelText).toContain('Step 1 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 0%;')
	})

	it('renders mid-stage progress', () => {
		const po = mountCard(makeFeature({ currentStep: 7 }))
		expect(po.stepLabelText).toContain('Step 7 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 50%;')
	})

	it('renders final-stage progress without exceeding the total', () => {
		const po = mountCard(makeFeature({ currentStep: 12 }))
		expect(po.stepLabelText).toContain('Step 12 of 12')
		expect(po.progressFill.attributes('style')).toContain(
			'width: 91.66666666666666%;',
		)
	})

	it('renders complete instead of an out-of-range step', () => {
		const po = mountCard(makeFeature({ currentStep: 13 }))
		expect(po.stepLabelText).toContain('Complete')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
		expect(po.progressFill.attributes('style')).toContain('width: 100%;')
	})

	it('renders archived terminal state without step progress text', () => {
		const po = mountCard(makeFeature({ status: 'archived', currentStep: 13 }))
		expect(po.stepLabelText).toContain('Archived')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
	})

	it('renders abandoned terminal state without step progress text', () => {
		const po = mountCard(makeFeature({ status: 'abandoned', currentStep: 13 }))
		expect(po.stepLabelText).toContain('Abandoned')
		expect(po.stepLabelText).not.toContain('Step 13 of 12')
	})

	describe('advance step button', () => {
		it('renders for active features that have not completed all stages', () => {
			const po = mountCard(makeFeature({ status: 'active', currentStep: 3 }))
			expect(po.hasAdvanceStepButton()).toBe(true)
		})

		it('does not render for draft features', () => {
			const po = mountCard(makeFeature({ status: 'draft', currentStep: 1 }))
			expect(po.hasAdvanceStepButton()).toBe(false)
		})

		it('does not render once the feature is complete', () => {
			const po = mountCard(makeFeature({ status: 'active', currentStep: 13 }))
			expect(po.hasAdvanceStepButton()).toBe(false)
		})

		it('does not render for archived or abandoned features', () => {
			const archived = mountCard(makeFeature({ status: 'archived', currentStep: 4 }))
			const abandoned = mountCard(makeFeature({ status: 'abandoned', currentStep: 4 }))
			expect(archived.hasAdvanceStepButton()).toBe(false)
			expect(abandoned.hasAdvanceStepButton()).toBe(false)
		})

		it('emits advance-step with the feature id when clicked', async () => {
			const po = mountCard(makeFeature({ id: 'feat-42', status: 'active', currentStep: 2 }))
			await po.clickAdvanceStep()
			expect(po.emitted('advance-step')).toEqual([['feat-42']])
		})
	})
})
