/**
 * Tests for `<WelcomeGreeting>` (REQ-AUX-007, spec §1.3.5).
 *
 *   T-AUX-209 — greeting variant is selected by hour band.
 *   T-AUX-210 — greeting uses the Copernicus serif stack via --sp-font-serif.
 *   T-AUX-211/212/214 — chips render labels + click bubbles `suggestion-pick`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/ui/i18n/locales/en'
import WelcomeGreeting from '@/ui/components/agent/WelcomeGreeting.vue'
import { WelcomeGreetingPageObject } from './WelcomeGreeting.po'

function makeI18n() {
	return createI18n({
		legacy: false,
		locale: 'en',
		fallbackLocale: 'en',
		messages: { en },
	})
}

function mountAt(hour: number) {
	const wrapper = mount(WelcomeGreeting, {
		props: { hourOverride: hour },
		global: { plugins: [makeI18n()] },
	})
	return { wrapper, po: new WelcomeGreetingPageObject(wrapper) }
}

describe('WelcomeGreeting', () => {
	it('picks the morning band at hour 7', () => {
		const { po } = mountAt(7)
		expect(po.timeBand()).toBe('morning')
		expect(po.titleText()).toBe(en.welcome.greeting.morning)
	})

	it('picks the afternoon band at hour 14', () => {
		const { po } = mountAt(14)
		expect(po.timeBand()).toBe('afternoon')
		expect(po.titleText()).toBe(en.welcome.greeting.afternoon)
	})

	it('picks the evening band at hour 20', () => {
		const { po } = mountAt(20)
		expect(po.timeBand()).toBe('evening')
		expect(po.titleText()).toBe(en.welcome.greeting.evening)
	})

	it('picks the night band at hour 2', () => {
		const { po } = mountAt(2)
		expect(po.timeBand()).toBe('night')
		expect(po.titleText()).toBe(en.welcome.greeting.night)
	})

	it('greeting heading is a semantic h2 carrying the welcome-greeting-title testid', () => {
		// The spec §1.3.5 contract is that the heading uses `--sp-font-serif`
		// (verified at the Storybook + Playwright tier in WS-AUX-10 since
		// jsdom does not parse scoped CSS). At the unit level we lock in the
		// semantic element + testid hook the visual gate keys off.
		const { po } = mountAt(10)
		expect(po.titleEl.tagName.toLowerCase()).toBe('h2')
		expect(po.rootEl.getAttribute('data-testid')).toBe('welcome-greeting')
	})

	it('renders the default suggestion chips and emits `suggestion-pick` on click', async () => {
		const { wrapper, po } = mountAt(10)
		expect(po.suggestionChipCount()).toBe(4)
		await po.clickSuggestion('slash')
		const events = wrapper.emitted('suggestion-pick')
		expect(events).toBeTruthy()
		expect(events?.[0]?.[0]).toEqual({ id: 'slash' })
	})
})
