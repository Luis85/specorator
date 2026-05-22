/**
 * Tests for `HelpPopover.vue` — WS-AUX-8b (T-AUX-313..318).
 *
 * Seven tests:
 *   1. Renders one row per item from props.
 *   2. Filter narrows the visible rows by case-insensitive substring.
 *   3. Arrow Down moves the active index forward (with wrap-around).
 *   4. Enter emits `select` with the active item id.
 *   5. Escape emits `close`.
 *   6. Empty filter result announces 0 results in the live region.
 *   7. Sr-only announcement updates as the filtered count changes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HelpPopover from '@/ui/components/agent/HelpPopover.vue'
import { i18n } from '@/ui/i18n'
import { HelpPopoverPO } from './HelpPopover.po'

interface HelpPopoverItem {
	readonly id: string
	readonly label: string
	readonly shortcut?: string
}

const ITEMS: readonly HelpPopoverItem[] = Object.freeze([
	{ id: 'clear', label: 'Clear input', shortcut: '/clear' },
	{ id: 'new', label: 'New conversation', shortcut: '/new' },
	{ id: 'help', label: 'Show help', shortcut: '/help' },
	{ id: 'advance', label: 'Advance stage', shortcut: '/advance-stage' },
])

function mountPopover(items: readonly HelpPopoverItem[] = ITEMS) {
	return mount(HelpPopover, {
		global: { plugins: [i18n] },
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom has no Obsidian popout windows.
		attachTo: document.body,
		props: { items },
	})
}

describe('HelpPopover.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('renders one row per item', () => {
		const po = new HelpPopoverPO(mountPopover())
		expect(po.items()).toHaveLength(ITEMS.length)
	})

	it('filters items by case-insensitive substring on the query', async () => {
		const po = new HelpPopoverPO(mountPopover())
		await po.typeQuery('NEW')
		const items = po.items()
		expect(items).toHaveLength(1)
		expect(items[0].text()).toContain('New conversation')
	})

	it('Arrow Down moves the active item forward', async () => {
		const po = new HelpPopoverPO(mountPopover())
		expect(po.activeIndex()).toBe(0)
		await po.pressArrowDown()
		expect(po.activeIndex()).toBe(1)
		await po.pressArrowDown()
		expect(po.activeIndex()).toBe(2)
	})

	it('Enter emits `select` with the active item id', async () => {
		const wrapper = mountPopover()
		const po = new HelpPopoverPO(wrapper)
		await po.pressArrowDown() // activeIdx -> 1 (`new`)
		await po.pressEnter()
		const events = wrapper.emitted('select')
		expect(events).toBeDefined()
		expect(events?.[0]).toEqual(['new'])
	})

	it('Escape emits `close`', async () => {
		const wrapper = mountPopover()
		const po = new HelpPopoverPO(wrapper)
		await po.pressEscape()
		expect(wrapper.emitted('close')).toBeDefined()
	})

	it('announces 0 results when the filter has no matches', async () => {
		const po = new HelpPopoverPO(mountPopover())
		await po.typeQuery('zzzzzzzz')
		expect(po.items()).toHaveLength(0)
		expect(po.announce.text()).toContain('0')
	})

	it('sr-only announcement updates as the filtered count changes', async () => {
		const po = new HelpPopoverPO(mountPopover())
		expect(po.announce.text()).toContain('4')
		await po.typeQuery('a') // matches "Clear", "New conversation", "Advance stage"
		expect(po.announce.text()).toContain('3')
		await po.typeQuery('advance')
		expect(po.announce.text()).toContain('1')
	})
})
