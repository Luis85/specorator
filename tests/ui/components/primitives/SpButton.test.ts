/**
 * Tests for `<SpButton>` (REQ-AUX-017, spec §1.3.12).
 *
 *   T-AUX-101 — variants render the correct `data-variant` attr; `loading`
 *               drives `aria-busy="true"`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SpButton from '@/ui/components/primitives/SpButton.vue'
import { SpButtonPageObject } from './SpButton.po'

describe('SpButton', () => {
	it('defaults to variant="secondary" and type="button"', () => {
		const wrapper = mount(SpButton, { slots: { default: 'Go' } })
		const po = new SpButtonPageObject(wrapper)
		expect(po.variant()).toBe('secondary')
		expect(po.type()).toBe('button')
		expect(po.isLoading()).toBe(false)
		expect(po.isDisabled()).toBe(false)
	})

	it('renders each variant prop on data-variant', () => {
		for (const v of ['primary', 'secondary', 'ghost'] as const) {
			const wrapper = mount(SpButton, {
				props: { variant: v },
				slots: { default: 'X' },
			})
			expect(new SpButtonPageObject(wrapper).variant()).toBe(v)
		}
	})

	it('marks aria-busy and disables interaction when loading', () => {
		const wrapper = mount(SpButton, {
			props: { loading: true },
			slots: { default: 'X' },
		})
		const po = new SpButtonPageObject(wrapper)
		expect(po.isLoading()).toBe(true)
		expect(po.isDisabled()).toBe(true)
	})

	it('emits click with the MouseEvent when not disabled', async () => {
		const wrapper = mount(SpButton, { slots: { default: 'X' } })
		await new SpButtonPageObject(wrapper).click()
		const events = wrapper.emitted('click')
		expect(events).toHaveLength(1)
		expect(events?.[0]?.[0]).toBeInstanceOf(MouseEvent)
	})

	it('does not emit click when disabled', async () => {
		const wrapper = mount(SpButton, {
			props: { disabled: true },
			slots: { default: 'X' },
		})
		await new SpButtonPageObject(wrapper).click()
		expect(wrapper.emitted('click')).toBeUndefined()
	})

	it('respects type prop', () => {
		const wrapper = mount(SpButton, {
			props: { type: 'submit' },
			slots: { default: 'Submit' },
		})
		expect(new SpButtonPageObject(wrapper).type()).toBe('submit')
	})

	it('renders default slot content', () => {
		const wrapper = mount(SpButton, { slots: { default: 'Send message' } })
		expect(new SpButtonPageObject(wrapper).textContent()).toContain('Send message')
	})
})
