/**
 * Tests for `<WelcomeSuggestionChip>` (REQ-AUX-007, spec §1.3.5).
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/ui/i18n/locales/en'
import WelcomeSuggestionChip from '@/ui/components/agent/WelcomeSuggestionChip.vue'
import { WelcomeSuggestionChipPageObject } from './WelcomeSuggestionChip.po'
import type { LoggerPort } from '@/domain/ports'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

function makeI18n() {
	return createI18n({
		legacy: false,
		locale: 'en',
		fallbackLocale: 'en',
		messages: { en },
	})
}

function fakeLogger(): LoggerPort {
	return { debug() {}, info() {}, warn() {}, error() {} }
}

function mountChip(props: { id: string; label: string; icon?: string }) {
	const bridge = new MockBridge()
	return mount(WelcomeSuggestionChip, {
		props,
		global: {
			plugins: [makeI18n()],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
	})
}

describe('WelcomeSuggestionChip', () => {
	it('renders its label and emits `pick` with the chip id on click', async () => {
		const wrapper = mountChip({ id: 'slash', label: 'Slash commands' })
		const po = new WelcomeSuggestionChipPageObject(wrapper, 'slash')
		expect(po.labelText()).toBe('Slash commands')
		expect(po.ariaLabel()).toBe('Try: Slash commands')
		await po.click()
		expect(wrapper.emitted('pick')?.[0]?.[0]).toEqual({ id: 'slash' })
	})

	it('renders an SpIcon when the `icon` prop is set (QW-D)', () => {
		const wrapper = mountChip({
			id: 'findOrphans',
			label: 'Find orphan notes',
			icon: 'unplug',
		})
		// SpIcon stamps `data-testid="sp-icon"` on its host span and reflects
		// the requested Lucide name via `data-icon`. We assert presence + name
		// so consumers can't silently drop the icon slot.
		const icon = wrapper.find('[data-testid="sp-icon"]')
		expect(icon.exists()).toBe(true)
		expect(icon.attributes('data-icon')).toBe('unplug')
	})

	it('omits the icon span when `icon` is undefined', () => {
		const wrapper = mountChip({
			id: 'findOrphans',
			label: 'Find orphan notes',
		})
		expect(wrapper.find('[data-testid="sp-icon"]').exists()).toBe(false)
	})
})
