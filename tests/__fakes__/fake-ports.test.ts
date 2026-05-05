import { describe, expect, it } from 'vitest'
import { fakeModulePorts } from './fake-ports'

describe('fakeModulePorts', () => {
	it('returns the four narrow ports backed by one MockBridge', () => {
		const ports = fakeModulePorts()
		expect(ports.bridge).toBe(ports.settings)
		expect(ports.bridge).toBe(ports.vault)
		expect(ports.bridge).toBe(ports.workspace)
		expect(ports.bridge).toBe(ports.notifications)
	})

	it('mutations via one port are visible through the bridge ref', async () => {
		const ports = fakeModulePorts()
		await ports.vault.writeFile('specs/x/idea.md', '# x')
		// MockBridge.readFile returns Promise<string> directly (throws on miss);
		// it does NOT return a Result. See src/infrastructure/mock/MockBridge.ts.
		expect(await ports.bridge.readFile('specs/x/idea.md')).toBe('# x')
	})

	it('records notices via the notifications port', () => {
		const ports = fakeModulePorts()
		ports.notifications.showInfo('hi')
		expect(ports.bridge.getNotices()).toHaveLength(1)
	})
})
