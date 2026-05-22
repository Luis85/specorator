/**
 * Tests for `<SpIconButton>` (REQ-AUX-001, REQ-AUX-018, spec §1.3.12).
 *
 *   T-AUX-105 — `ariaLabel` is required at the type level and surfaces as
 *               the rendered button's `aria-label`.
 *   T-AUX-106 — composes SpIcon; size/loading wired.
 */
import { describe, expect, it, expectTypeOf } from 'vitest'
import { mount } from '@vue/test-utils'
import SpIconButton from '@/ui/components/primitives/SpIconButton.vue'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import type { IconPort, LoggerPort } from '@/domain/ports'
import { SpIconButtonPageObject } from './SpIconButton.po'

function fakeLogger(): LoggerPort {
	return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
}

function mountWith(props: {
	icon: string
	ariaLabel: string
	variant?: 'primary' | 'secondary' | 'ghost'
	disabled?: boolean
	loading?: boolean
	size?: number
}): ReturnType<typeof mount> {
	const bridge = new MockBridge() as unknown as IconPort
	return mount(SpIconButton, {
		props,
		global: {
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
	})
}

describe('SpIconButton', () => {
	it('requires ariaLabel at the type level', () => {
		type Props = InstanceType<typeof SpIconButton>['$props']
		expectTypeOf<Props['ariaLabel']>().toEqualTypeOf<string>()
		expectTypeOf<Props['icon']>().toEqualTypeOf<string>()
	})

	it('renders aria-label from ariaLabel prop', () => {
		const wrapper = mountWith({ icon: 'send', ariaLabel: 'Send message' })
		const po = new SpIconButtonPageObject(wrapper)
		expect(po.ariaLabel()).toBe('Send message')
	})

	it('renders the supplied Lucide icon name on the inner SpIcon', () => {
		const wrapper = mountWith({ icon: 'square', ariaLabel: 'Stop' })
		const po = new SpIconButtonPageObject(wrapper)
		expect(po.iconName()).toBe('square')
	})

	it('defaults to variant="ghost" and surfaces it on data-variant', () => {
		const wrapper = mountWith({ icon: 'send', ariaLabel: 'Send' })
		expect(new SpIconButtonPageObject(wrapper).variant()).toBe('ghost')
	})

	it('swaps to spinner icon while loading and marks aria-busy', () => {
		const wrapper = mountWith({ icon: 'send', ariaLabel: 'Send', loading: true })
		const po = new SpIconButtonPageObject(wrapper)
		expect(po.isLoading()).toBe(true)
		expect(po.isDisabled()).toBe(true)
		expect(po.iconName()).toBe('loader-circle')
	})

	it('emits click when enabled', async () => {
		const wrapper = mountWith({ icon: 'send', ariaLabel: 'Send' })
		await new SpIconButtonPageObject(wrapper).click()
		const events = wrapper.emitted('click')
		expect(events).toHaveLength(1)
	})

	it('does not emit click when disabled', async () => {
		const wrapper = mountWith({ icon: 'send', ariaLabel: 'Send', disabled: true })
		await new SpIconButtonPageObject(wrapper).click()
		expect(wrapper.emitted('click')).toBeUndefined()
	})
})
