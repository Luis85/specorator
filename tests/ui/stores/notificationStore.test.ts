import { setActivePinia, createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationStore } from '@/ui/stores/notificationStore'

describe('notificationStore.addNotice', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('removes the notice after durationMs when positive', () => {
		const store = useNotificationStore()
		store.addNotice('hi', 4000)
		expect(store.notices).toHaveLength(1)
		vi.advanceTimersByTime(4000)
		expect(store.notices).toHaveLength(0)
	})

	it('keeps the notice indefinitely when durationMs is 0 (sticky, matches Obsidian Notice)', () => {
		const store = useNotificationStore()
		store.addNotice('error stays', 0)
		expect(store.notices).toHaveLength(1)
		vi.advanceTimersByTime(60_000)
		expect(store.notices).toHaveLength(1)
	})

	it('keeps the notice indefinitely when durationMs is negative', () => {
		const store = useNotificationStore()
		store.addNotice('still here', -1)
		vi.advanceTimersByTime(60_000)
		expect(store.notices).toHaveLength(1)
	})

	it('dismissNotice removes the matching sticky notice', () => {
		const store = useNotificationStore()
		store.addNotice('error A', 0)
		store.addNotice('error B', 0)
		const stickyA = store.notices[0]
		store.dismissNotice(stickyA.id)
		expect(store.notices).toHaveLength(1)
		expect(store.notices[0].message).toBe('error B')
	})

	it('clearAll removes every notice', () => {
		const store = useNotificationStore()
		store.addNotice('one', 0)
		store.addNotice('two', 0)
		store.addNotice('three', 0)
		store.clearAll()
		expect(store.notices).toHaveLength(0)
	})
})
