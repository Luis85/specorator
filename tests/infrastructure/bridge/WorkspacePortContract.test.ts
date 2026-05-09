import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkspacePort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Scenario {
	readonly port: WorkspacePort
	readonly readOpenedFile: () => string | null
}

interface Harness {
	readonly name: string
	readonly makeScenario: () => Scenario
}

function registerWorkspaceContract(harness: Harness): void {
	describe(`${harness.name} WorkspacePort contract`, () => {
		let scenario: Scenario

		beforeEach(() => {
			scenario = harness.makeScenario()
		})

		it('records the path passed to openFile', async () => {
			await scenario.port.openFile('specs/search/workflow-state.md')
			expect(scenario.readOpenedFile()).toBe('specs/search/workflow-state.md')
		})

		it('getActiveFile returns null initially', () => {
			expect(scenario.port.getActiveFile()).toBeNull()
		})

		it('unsubscriber returned by onActiveFileChanged can be called without error', () => {
			const unsub = scenario.port.onActiveFileChanged(() => {})
			expect(() => { unsub() }).not.toThrow()
		})
	})
}

registerWorkspaceContract({
	name: 'MockBridge',
	makeScenario: () => {
		const bridge = new MockBridge()
		return { port: bridge, readOpenedFile: () => bridge.getOpenedFile() }
	},
})

registerWorkspaceContract({
	name: 'LocalStorageBridge',
	makeScenario: () => {
		localStorage.clear()
		let openedFile: string | null = null
		const abort = new AbortController()
		window.addEventListener(
			'sp:open-file',
			(event) => {
				openedFile = (event as CustomEvent<{ path: string }>).detail.path
			},
			{ signal: abort.signal },
		)
		return {
			port: new LocalStorageBridge(),
			readOpenedFile: () => {
				abort.abort()
				return openedFile
			},
		}
	},
})
