/**
 * Tests for `<SpToggleSwitch>` (REQ-AUX-017, spec §1.3.13).
 *
 *   T-AUX-108 — v-model contract: emits `update:modelValue` with the toggled
 *               boolean; `aria-pressed` reflects the current state.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SpToggleSwitch from '@/ui/components/primitives/SpToggleSwitch.vue'
import { SpToggleSwitchPageObject } from './SpToggleSwitch.po'

describe('SpToggleSwitch', () => {
	it('reflects modelValue=false as aria-pressed="false"', () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Thinking' },
		})
		expect(new SpToggleSwitchPageObject(wrapper).ariaPressed()).toBe('false')
	})

	it('reflects modelValue=true as aria-pressed="true"', () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: true, label: 'Thinking' },
		})
		expect(new SpToggleSwitchPageObject(wrapper).ariaPressed()).toBe('true')
	})

	it('emits update:modelValue with the toggled boolean on click', async () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Thinking' },
		})
		await new SpToggleSwitchPageObject(wrapper).click()
		expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
	})

	it('toggles back to false from true on click', async () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: true, label: 'Thinking' },
		})
		await new SpToggleSwitchPageObject(wrapper).click()
		expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
	})

	it('toggles on Space and Enter keypress', async () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Thinking' },
		})
		const po = new SpToggleSwitchPageObject(wrapper)
		await po.pressKey('Enter')
		await po.pressKey(' ')
		const emissions = wrapper.emitted('update:modelValue')
		expect(emissions).toEqual([[true], [true]])
	})

	it('renders the visible label inline', () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Plan mode' },
		})
		expect(new SpToggleSwitchPageObject(wrapper).labelText()).toBe('Plan mode')
	})

	it('uses ariaLabel override when supplied; otherwise falls back to the label', () => {
		const overridden = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Plan', ariaLabel: 'Toggle plan mode' },
		})
		expect(new SpToggleSwitchPageObject(overridden).ariaLabel()).toBe('Toggle plan mode')

		const fallback = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Plan' },
		})
		expect(new SpToggleSwitchPageObject(fallback).ariaLabel()).toBe('Plan')
	})

	it('G4.2: applies the is-on class when modelValue=true (brand-fill active track)', () => {
		const off = mount(SpToggleSwitch, { props: { modelValue: false, label: 'Plan' } })
		expect(new SpToggleSwitchPageObject(off).hasOnClass()).toBe(false)
		const on = mount(SpToggleSwitch, { props: { modelValue: true, label: 'Plan' } })
		expect(new SpToggleSwitchPageObject(on).hasOnClass()).toBe(true)
	})

	it('does not emit when disabled', async () => {
		const wrapper = mount(SpToggleSwitch, {
			props: { modelValue: false, label: 'Plan', disabled: true },
		})
		await new SpToggleSwitchPageObject(wrapper).click()
		expect(wrapper.emitted('update:modelValue')).toBeUndefined()
	})
})
