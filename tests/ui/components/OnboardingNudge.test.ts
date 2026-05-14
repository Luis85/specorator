import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import OnboardingNudge from '@/ui/components/OnboardingNudge.vue'
import { OnboardingNudgePO } from './OnboardingNudge.po'

describe('OnboardingNudge', () => {
	function mountComponent(props: { message: string; actionLabel?: string; dismissible?: boolean }) {
		const wrapper = mount(OnboardingNudge, { props })
		return { wrapper, po: new OnboardingNudgePO(wrapper) }
	}

	it('renders the message', () => {
		const { po } = mountComponent({ message: 'Hello nudge' })
		expect(po.nudge.text()).toContain('Hello nudge')
	})

	it('shows action button when actionLabel is provided', () => {
		const { po } = mountComponent({ message: 'msg', actionLabel: 'Do it' })
		expect(po.action.exists()).toBe(true)
		expect(po.action.text()).toBe('Do it')
	})

	it('hides action button when no actionLabel', () => {
		const { po } = mountComponent({ message: 'msg' })
		expect(po.action.exists()).toBe(false)
	})

	it('shows dismiss button when dismissible', () => {
		const { po } = mountComponent({ message: 'msg', dismissible: true })
		expect(po.dismiss.exists()).toBe(true)
	})

	it('emits action when action clicked', async () => {
		const { wrapper, po } = mountComponent({ message: 'msg', actionLabel: 'Go' })
		await po.clickAction()
		expect(wrapper.emitted('action')).toHaveLength(1)
	})

	it('emits dismiss when dismiss clicked', async () => {
		const { wrapper, po } = mountComponent({ message: 'msg', dismissible: true })
		await po.clickDismiss()
		expect(wrapper.emitted('dismiss')).toHaveLength(1)
	})
})
