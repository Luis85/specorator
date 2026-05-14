import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import OnboardingPersonaCard from '@/ui/components/OnboardingPersonaCard.vue'
import { OnboardingPersonaCardPO } from './OnboardingPersonaCard.po'

const EXAMPLE = "I'm a test persona."

describe('OnboardingPersonaCard', () => {
	function mountComponent(text = EXAMPLE) {
		const wrapper = mount(OnboardingPersonaCard, { props: { text } })
		return { wrapper, po: new OnboardingPersonaCardPO(wrapper) }
	}

	it('renders card text', () => {
		const { po } = mountComponent()
		expect(po.button.text()).toBe(EXAMPLE)
	})

	it('has aria-label with the example text', () => {
		const { po } = mountComponent()
		expect(po.button.attributes('aria-label')).toBe(`Use this example: ${EXAMPLE}`)
	})

	it('emits use with text when clicked', async () => {
		const { wrapper, po } = mountComponent()
		await po.click()
		expect(wrapper.emitted('use')?.[0]).toEqual([EXAMPLE])
	})
})
