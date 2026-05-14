import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import OnboardingStep1Welcome from '@/ui/components/OnboardingStep1Welcome.vue'
import { OnboardingStep1WelcomePO } from './OnboardingStep1Welcome.po'

describe('OnboardingStep1Welcome', () => {
	function mountComponent() {
		const wrapper = mount(OnboardingStep1Welcome)
		return { wrapper, po: new OnboardingStep1WelcomePO(wrapper) }
	}

	it('renders the welcome heading', () => {
		const { po } = mountComponent()
		expect(po.heading.text()).toBe('Welcome to Specorator.')
	})

	it('emits next when CTA is clicked', async () => {
		const { wrapper, po } = mountComponent()
		await po.clickCta()
		expect(wrapper.emitted('next')).toHaveLength(1)
	})
})
