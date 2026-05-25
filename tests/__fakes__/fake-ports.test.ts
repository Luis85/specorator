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

	// T-TS-009 (TEST-TS-011 A leg): the factory exposes a `providerHistory` member
	// (a MockHistoryStore over a fresh Map) with mutations visible across the
	// factory's ports.
	it('exposes a providerHistory member backed by an in-memory store', async () => {
		const ports = fakeModulePorts()
		expect(ports.providerHistory.providerId).toBe('claude')
		const empty = await ports.providerHistory.listSessions()
		expect(empty.ok).toBe(true)
		if (empty.ok) expect(empty.value).toEqual([])
	})

	it('providerHistory mutations are visible across the factory ports', async () => {
		const ports = fakeModulePorts()
		ports.providerHistory.seedConversations([
			{
				version: 1,
				meta: {
					id: 'c1',
					title: 't',
					titleManual: false,
					createdAt: 1,
					updatedAt: 2,
					providerId: 'claude',
					sessionId: 'sess-1',
				},
				messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1 }],
				providerState: { providerSessionId: 'sess-1' },
			},
		])
		const list = await ports.providerHistory.listSessions()
		expect(list.ok).toBe(true)
		if (list.ok) expect(list.value.map((m) => m.id)).toEqual(['c1'])
	})
})
