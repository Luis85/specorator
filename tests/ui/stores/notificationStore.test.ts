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
})
