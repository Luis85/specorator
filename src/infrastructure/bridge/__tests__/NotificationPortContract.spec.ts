import { beforeEach, describe, expect, it } from 'vitest'
import type { NotificationPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Scenario {
	readonly port: NotificationPort
	readonly readNotices: () => Array<{ message: string; durationMs: number }>
}

interface Harness {
	readonly name: string
	readonly makeScenario: () => Scenario
}

function registerNotificationContract(harness: Harness): void {
	describe(`${harness.name} NotificationPort contract`, () => {
		let scenario: Scenario

		beforeEach(() => {
			scenario = harness.makeScenario()
		})

		it('records messages with the default 4000ms duration', () => {
			scenario.port.showNotice('hello')
			expect(scenario.readNotices()).toEqual([{ message: 'hello', durationMs: 4000 }])
		})
	})
}

registerNotificationContract({
	name: 'MockBridge',
	makeScenario: () => {
		const bridge = new MockBridge()
		return { port: bridge, readNotices: () => bridge.getNotices() }
	},
})

registerNotificationContract({
	name: 'LocalStorageBridge',
	makeScenario: () => {
		localStorage.clear()
		const notices: Array<{ message: string; durationMs: number }> = []
		const abort = new AbortController()
		window.addEventListener(
			'sp:notice',
			(event) => {
				notices.push((event as CustomEvent<{ message: string; durationMs: number }>).detail)
			},
			{ signal: abort.signal },
		)
		return {
			port: new LocalStorageBridge(),
			readNotices: () => {
				abort.abort()
				return notices
			},
		}
	},
})
