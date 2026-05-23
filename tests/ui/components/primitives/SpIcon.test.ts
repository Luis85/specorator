/**
 * Tests for `<SpIcon>` (REQ-AUX-001, REQ-AUX-018, spec §1.3.1).
 *
 *   T-AUX-028 — calls iconPort.setIcon(el, name) on mount.
 *   T-AUX-029 — falls back to textContent = ariaLabel ?? name when the
 *               icon does not resolve.
 *   T-AUX-030 — warns once per missing-icon name via LoggerPort.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SpIcon from '@/ui/components/primitives/SpIcon.vue'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import type { IconPort, LoggerPort } from '@/domain/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { SpIconPageObject } from './SpIcon.po'
import { __resetSpIconWarnedNames } from '@/ui/components/primitives/SpIcon.vue'

function fakeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

beforeEach(() => {
	__resetSpIconWarnedNames()
})

describe('SpIcon', () => {
	it('calls iconPort.setIcon(el, name) on mount', () => {
		const setIcon = vi.fn()
		const iconPort: IconPort = { setIcon }
		const wrapper = mount(SpIcon, {
			props: { name: 'send' },
			global: {
				provide: {
					[ICON_PORT as symbol]: iconPort,
					[LOGGER_PORT as symbol]: fakeLogger(),
				},
			},
		})
		expect(setIcon).toHaveBeenCalledTimes(1)
		const [el, name] = setIcon.mock.calls[0] as [HTMLElement, string]
		expect(el).toBe(wrapper.element)
		expect(name).toBe('send')
	})

	it('writes textContent = ariaLabel when the icon does not resolve', () => {
		const bridge = new MockBridge()
		bridge.markIconAsMissing('missing-x')
		const wrapper = mount(SpIcon, {
			props: { name: 'missing-x', ariaLabel: 'Missing' },
			global: {
				provide: {
					[ICON_PORT as symbol]: bridge as unknown as IconPort,
					[LOGGER_PORT as symbol]: fakeLogger(),
				},
			},
		})
		const po = new SpIconPageObject(wrapper)
		expect(po.hasSvgChild()).toBe(false)
		expect(po.textContent()).toBe('Missing')
	})

	it('falls back to the icon name when ariaLabel is omitted', () => {
		const bridge = new MockBridge()
		bridge.markIconAsMissing('missing-y')
		const wrapper = mount(SpIcon, {
			props: { name: 'missing-y' },
			global: {
				provide: {
					[ICON_PORT as symbol]: bridge as unknown as IconPort,
					[LOGGER_PORT as symbol]: fakeLogger(),
				},
			},
		})
		const po = new SpIconPageObject(wrapper)
		expect(po.textContent()).toBe('missing-y')
	})

	it('warns exactly once per missing-icon name across multiple mounts', () => {
		const bridge = new MockBridge()
		bridge.markIconAsMissing('missing-z')
		const logger = fakeLogger()
		const provide = {
			[ICON_PORT as symbol]: bridge as unknown as IconPort,
			[LOGGER_PORT as symbol]: logger,
		}
		mount(SpIcon, { props: { name: 'missing-z' }, global: { provide } })
		mount(SpIcon, { props: { name: 'missing-z' }, global: { provide } })
		expect(logger.warn).toHaveBeenCalledTimes(1)
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('missing-z'),
			expect.anything(),
		)
	})

	it('sets aria-hidden when ariaLabel is omitted and clears it when provided', () => {
		const setIcon = vi.fn()
		const iconPort: IconPort = { setIcon }
		const provide = {
			[ICON_PORT as symbol]: iconPort,
			[LOGGER_PORT as symbol]: fakeLogger(),
		}
		const hiddenWrapper = mount(SpIcon, { props: { name: 'send' }, global: { provide } })
		const hiddenPo = new SpIconPageObject(hiddenWrapper)
		expect(hiddenPo.ariaHidden()).toBe('true')
		expect(hiddenPo.ariaLabel()).toBeNull()

		const labelledWrapper = mount(SpIcon, {
			props: { name: 'send', ariaLabel: 'Send' },
			global: { provide },
		})
		const labelledPo = new SpIconPageObject(labelledWrapper)
		expect(labelledPo.ariaLabel()).toBe('Send')
		expect(labelledPo.ariaHidden()).toBe('false')
	})
})
