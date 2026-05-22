/**
 * Tests for `<WelcomeSuggestionChip>` (REQ-AUX-007, spec §1.3.5).
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/ui/i18n/locales/en'
import WelcomeSuggestionChip from '@/ui/components/agent/WelcomeSuggestionChip.vue'
import { WelcomeSuggestionChipPageObject } from './WelcomeSuggestionChip.po'

function makeI18n() {
	return createI18n({
		legacy: false,
		locale: 'en',
		fallbackLocale: 'en',
		messages: { en },
	})
}

describe('WelcomeSuggestionChip', () => {
	it('renders its label and emits `pick` with the chip id on click', async () => {
		const wrapper = mount(WelcomeSuggestionChip, {
			props: { id: 'slash', label: 'Slash commands' },
			global: { plugins: [makeI18n()] },
		})
		const po = new WelcomeSuggestionChipPageObject(wrapper, 'slash')
		expect(po.labelText()).toBe('Slash commands')
		expect(po.ariaLabel()).toBe('Try: Slash commands')
		await po.click()
		expect(wrapper.emitted('pick')?.[0]?.[0]).toEqual({ id: 'slash' })
	})
})
