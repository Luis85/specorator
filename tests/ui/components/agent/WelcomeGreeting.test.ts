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

function mountAt(hour: number) {
	// QW-D — the chip set now embeds `<SpIcon>` which requires the
	// ICON_PORT + LOGGER_PORT injections. Wire a MockBridge so the icon
	// host renders without throwing in jsdom.
	const bridge = new MockBridge()
	const wrapper = mount(WelcomeGreeting, {
		props: { hourOverride: hour },
		global: {
			plugins: [makeI18n()],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
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

	it('lays out as a 4-row grid with greeting-group at row 2 and chips at row 4 (G3)', () => {
		// G3 (RALPH AUX): the greeting now FILLS the empty transcript area.
		// The DOM contract is: greeting-group precedes the chips strip and
		// both are direct children of the section root. jsdom does not parse
		// `grid-template-rows`, so the visual gate (Storybook + Playwright)
		// still pins the actual row geometry; here we lock in the structural
		// invariant the parent flex wrapper relies on.
		const { po } = mountAt(10)
		const root = po.rootEl
		const children = Array.from(root.children) as HTMLElement[]
		const groupIdx = children.indexOf(po.groupEl)
		const chipsIdx = children.indexOf(po.suggestionsEl)
		expect(groupIdx).toBeGreaterThanOrEqual(0)
		expect(chipsIdx).toBeGreaterThan(groupIdx)
		// The greeting-group wraps BOTH the title and subtitle so they
		// share the vertically centred row.
		expect(po.groupEl.contains(po.titleEl)).toBe(true)
	})

	it('renders the four vault-investigation chips with their localized labels', () => {
		// QW-D — chips are now wired to the new vault tools (Glob/Grep/Read).
		// Verify each label text matches the i18n source so the localized
		// surface tracks the source of truth, not a hardcoded string.
		const { po } = mountAt(10)
		expect(po.suggestionChipCount()).toBe(4)
		expect(po.suggestionLabel('findOrphans')).toBe(
			en.welcome.chips.findOrphans.label,
		)
		expect(po.suggestionLabel('summarizeActive')).toBe(
			en.welcome.chips.summarizeActive.label,
		)
		expect(po.suggestionLabel('projectsTag')).toBe(
			en.welcome.chips.projectsTag.label,
		)
		expect(po.suggestionLabel('brokenLinks')).toBe(
			en.welcome.chips.brokenLinks.label,
		)
	})

	it('emits `suggestion-pick` with the full prompt text on chip click', async () => {
		// QW-D — clicking a chip must carry the full prompt body so the
		// parent (AgentSidepanelRoot) can pre-fill the composer textarea
		// verbatim. Without this the user would just see the short label
		// in the input, defeating the whole point of the refresh.
		const { wrapper, po } = mountAt(10)
		await po.clickSuggestion('findOrphans')
		const events = wrapper.emitted('suggestion-pick')
		expect(events).toBeTruthy()
		expect(events?.[0]?.[0]).toEqual({
			id: 'findOrphans',
			prompt: en.welcome.chips.findOrphans.prompt,
		})
	})

	it('emits the matching prompt for each chip id', async () => {
		// `summarizeActive.prompt` contains the vue-i18n linked-message escape
		// `{'@'}` so the source string differs from the rendered string by one
		// character. We normalise here rather than in the component so the
		// asserted contract is "what the user sees in their composer".
		const renderedSummarize = en.welcome.chips.summarizeActive.prompt.replace(
			"{'@'}",
			'@',
		)
		const { wrapper, po } = mountAt(10)
		await po.clickSuggestion('summarizeActive')
		await po.clickSuggestion('projectsTag')
		await po.clickSuggestion('brokenLinks')
		const events = wrapper.emitted('suggestion-pick')
		expect(events?.[0]?.[0]).toEqual({
			id: 'summarizeActive',
			prompt: renderedSummarize,
		})
		expect(events?.[1]?.[0]).toEqual({
			id: 'projectsTag',
			prompt: en.welcome.chips.projectsTag.prompt,
		})
		expect(events?.[2]?.[0]).toEqual({
			id: 'brokenLinks',
			prompt: en.welcome.chips.brokenLinks.prompt,
		})
	})
})
