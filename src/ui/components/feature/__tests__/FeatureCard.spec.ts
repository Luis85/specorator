import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/ui/i18n'
import type { FeatureDto } from '@/ui/types/FeatureDto'
import FeatureCard from '../FeatureCard.vue'

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
  return mount(FeatureCard, {
    props: { feature },
    global: {
      plugins: [i18n],
    },
  })
}

describe('FeatureCard', () => {
  it('renders idea-stage progress', () => {
    const wrapper = mountCard(makeFeature({ currentStep: 1 }))

    expect(wrapper.text()).toContain('Step 1 of 12')
    expect(wrapper.find('.sp-progress-bar__fill').attributes('style')).toContain('width: 0%;')
  })

  it('renders mid-stage progress', () => {
    const wrapper = mountCard(makeFeature({ currentStep: 7 }))

    expect(wrapper.text()).toContain('Step 7 of 12')
    expect(wrapper.find('.sp-progress-bar__fill').attributes('style')).toContain('width: 50%;')
  })

  it('renders final-stage progress without exceeding the total', () => {
    const wrapper = mountCard(makeFeature({ currentStep: 12 }))

    expect(wrapper.text()).toContain('Step 12 of 12')
    expect(wrapper.find('.sp-progress-bar__fill').attributes('style')).toContain(
      'width: 91.66666666666666%;',
    )
  })

  it('renders complete instead of an out-of-range step', () => {
    const wrapper = mountCard(makeFeature({ currentStep: 13 }))

    expect(wrapper.text()).toContain('Complete')
    expect(wrapper.text()).not.toContain('Step 13 of 12')
    expect(wrapper.find('.sp-progress-bar__fill').attributes('style')).toContain('width: 100%;')
  })

  it('renders archived terminal state without step progress text', () => {
    const wrapper = mountCard(makeFeature({ status: 'archived', currentStep: 13 }))

    expect(wrapper.text()).toContain('Archived')
    expect(wrapper.text()).not.toContain('Step 13 of 12')
  })

  it('renders abandoned terminal state without step progress text', () => {
    const wrapper = mountCard(makeFeature({ status: 'abandoned', currentStep: 13 }))

    expect(wrapper.text()).toContain('Abandoned')
    expect(wrapper.text()).not.toContain('Step 13 of 12')
  })
})
