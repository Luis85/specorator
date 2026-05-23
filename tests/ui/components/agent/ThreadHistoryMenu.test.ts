/**
 * Tests for `ThreadHistoryMenu.vue` — WS-AUX-9 (T-AUX-331, T-AUX-332, T-AUX-333).
 *
 * Seven tests:
 *   1. Renders empty-state copy when there are no threads.
 *   2. Renders one row per thread, ordered by `lastUsedAt` desc.
 *   3. Active thread row carries `data-active="true"` (drives the 2px accent border).
 *   4. Clicking a non-active row emits `select` with the thread id.
 *   5. Rows wrap their hover actions in HoverActions (icons render).
 *   6. Clicking "delete" emits `delete` with the thread id.
 *   7. Closed menu (open=false) does not render the panel.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ThreadHistoryMenu from '@/ui/components/agent/ThreadHistoryMenu.vue'
import { i18n } from '@/ui/i18n'
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore'
import { ThreadHistoryMenuPO } from './ThreadHistoryMenu.po'
import type { LoggerPort } from '@/domain/ports'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

function fakeLogger(): LoggerPort {
	return { debug() {}, info() {}, warn() {}, error() {} }
}

function mountMenu(open = true) {
	const bridge = new MockBridge()
	return mount(ThreadHistoryMenu, {
		props: { open },
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom has no Obsidian popout windows.
		attachTo: document.body,
	})
}

function seedThreads(
	ids: ReadonlyArray<{ id: string; title: string; lastUsedAt: string }>,
): void {
	const store = useChatThreadsStore()
	for (const { id, title, lastUsedAt } of ids) {
		store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'api' },
			logPath: `chats/${id}.md`,
			threadId: id,
			now: lastUsedAt,
		})
		store.renameThread(id, title)
	}
}

describe('ThreadHistoryMenu.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		// Clean up any previously teleported portal nodes from prior cases.
		while (document.body.firstChild) {
			document.body.removeChild(document.body.firstChild)
		}
	})

	it('renders the empty-state copy when there are no threads', () => {
		const po = new ThreadHistoryMenuPO(mountMenu())
		expect(po.root()).not.toBeNull()
		expect(po.empty()).not.toBeNull()
	})

	it('renders one row per thread, ordered by lastUsedAt desc', () => {
		seedThreads([
			{ id: 't-old', title: 'Older talk', lastUsedAt: '2026-05-01T10:00:00Z' },
			{ id: 't-new', title: 'Newer talk', lastUsedAt: '2026-05-22T10:00:00Z' },
			{ id: 't-mid', title: 'Mid talk', lastUsedAt: '2026-05-15T10:00:00Z' },
		])
		const po = new ThreadHistoryMenuPO(mountMenu())
		const rows = po.rows()
		expect(rows).toHaveLength(3)
		expect(rows[0].dataset.testid).toBe('thread-history-row-t-new')
		expect(rows[1].dataset.testid).toBe('thread-history-row-t-mid')
		expect(rows[2].dataset.testid).toBe('thread-history-row-t-old')
	})

	it('marks the active thread row with data-active="true"', () => {
		seedThreads([
			{ id: 't-a', title: 'A', lastUsedAt: '2026-05-22T10:00:00Z' },
			{ id: 't-b', title: 'B', lastUsedAt: '2026-05-21T10:00:00Z' },
		])
		const store = useChatThreadsStore()
		store.setActiveThreadId('t-b')
		const po = new ThreadHistoryMenuPO(mountMenu())
		const activeRow = po.row('t-b')
		const otherRow = po.row('t-a')
		expect(activeRow?.dataset.active).toBe('true')
		expect(otherRow?.dataset.active).toBe('false')
	})

	it('emits select(threadId) when a row is clicked', async () => {
		seedThreads([
			{ id: 't-a', title: 'A', lastUsedAt: '2026-05-22T10:00:00Z' },
		])
		const wrapper = mountMenu()
		const po = new ThreadHistoryMenuPO(wrapper)
		const row = po.row('t-a')
		row?.click()
		const events = wrapper.emitted('select')
		expect(events).toBeDefined()
		expect(events?.[0]).toEqual(['t-a'])
	})

	it('rows wrap hover actions so rename + delete icons render', () => {
		seedThreads([
			{ id: 't-a', title: 'A', lastUsedAt: '2026-05-22T10:00:00Z' },
		])
		const po = new ThreadHistoryMenuPO(mountMenu())
		expect(po.renameButton()).not.toBeNull()
		expect(po.deleteButton()).not.toBeNull()
	})

	it('emits delete(threadId) when the trash icon is clicked', () => {
		seedThreads([
			{ id: 't-a', title: 'A', lastUsedAt: '2026-05-22T10:00:00Z' },
		])
		const wrapper = mountMenu()
		const po = new ThreadHistoryMenuPO(wrapper)
		po.deleteButton()?.click()
		const events = wrapper.emitted('delete')
		expect(events).toBeDefined()
		expect(events?.[0]).toEqual(['t-a'])
	})

	it('does not render the panel when open=false', () => {
		const po = new ThreadHistoryMenuPO(mountMenu(false))
		expect(po.root()).toBeNull()
	})
})
