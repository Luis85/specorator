import { beforeEach, describe, expect, it } from 'vitest'
import type { NotificationPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

type Severity = 'error' | 'warning' | 'success' | 'info'

interface NoticeEntry {
	severity: Severity
	message: string
	durationMs: number
}

interface Scenario {
	readonly port: NotificationPort
	readonly readNotices: () => NoticeEntry[]
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

		it('showError records severity=error with timeout 0', () => {
			scenario.port.showError('oops')
			expect(scenario.readNotices()).toEqual([{ severity: 'error', message: 'oops', durationMs: 0 }])
		})

		it('showWarning records severity=warning with 8000ms', () => {
			scenario.port.showWarning('heads up')
			expect(scenario.readNotices()).toEqual([
				{ severity: 'warning', message: 'heads up', durationMs: 8000 },
			])
		})

		it('showSuccess records severity=success with 4000ms', () => {
			scenario.port.showSuccess('done')
			expect(scenario.readNotices()).toEqual([
				{ severity: 'success', message: 'done', durationMs: 4000 },
			])
		})

		it('showInfo records severity=info with 4000ms', () => {
			scenario.port.showInfo('fyi')
			expect(scenario.readNotices()).toEqual([
				{ severity: 'info', message: 'fyi', durationMs: 4000 },
			])
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
		const notices: NoticeEntry[] = []
		const abort = new AbortController()
		window.addEventListener(
			'sp:notice',
			(event) => {
				notices.push((event as CustomEvent<NoticeEntry>).detail)
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
