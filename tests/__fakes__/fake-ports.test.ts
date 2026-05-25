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

	// T-CP-008 (TEST-CP-003/005/028 fake-ports leg): the factory exposes the three
	// P4 composer ports (mentionData / commandCatalog / shellExec) backed by the
	// MockBridge fixtures + scripted echo.
	it('exposes mentionData / commandCatalog / shellExec composer ports', async () => {
		const ports = fakeModulePorts()
		expect((await ports.mentionData.query('')).length).toBeGreaterThan(0)
		expect((await ports.commandCatalog.getEntries('command')).length).toBeGreaterThan(0)
		const run = await ports.shellExec.run({ command: 'echo fake' })
		expect(run.ok).toBe(true)
		if (run.ok) expect(run.value.exitCode).toBe(0)
	})

	// T-CA-007 (TEST-CA-021 fake-ports leg): the factory exposes a scriptable
	// `auxModel` member (the MockBridge aux port) so the re-pointed title/refine
	// tests (SPEC-CA-018) inject the aux stub instead of a runtime.
	it('exposes a scriptable auxModel member', async () => {
		const ports = fakeModulePorts()
		ports.auxModel.setAuxResponse('Fix the login bug')
		const result = await ports.auxModel.run('please fix login', { systemPrompt: 'sys' })
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.value).toBe('Fix the login bug')
		expect(ports.auxModel.lastPrompt).toBe('please fix login')
		expect(ports.auxModel.lastSystemPrompt).toBe('sys')
	})

	it('auxModel maps a scripted error / empty to err', async () => {
		const ports = fakeModulePorts()
		ports.auxModel.setAuxError()
		expect((await ports.auxModel.run('x')).ok).toBe(false)
		ports.auxModel.setAuxEmpty()
		expect((await ports.auxModel.run('x')).ok).toBe(false)
	})

	// T-CA-012 (TEST-CA-013/014/015 fake-ports leg): the factory exposes the two
	// P5 selection ports — a scriptable `selectionSource` (inert by default) and a
	// recording `selectionHighlight` — so multi-port tests (CaptureSelectionUseCase)
	// inject them from the shared seam.
	it('exposes a scriptable selectionSource member (inert by default)', () => {
		const ports = fakeModulePorts()
		expect(ports.selectionSource.getCurrentSelection()).toBeNull()
		expect(ports.selectionSource.supportsBrowserSelection).toBe(false)
		ports.selectionSource.setSelection({
			kind: 'editor',
			notePath: 'notes/a.md',
			selectedText: 'hi',
			startLine: 0,
			lineCount: 1,
		})
		const current = ports.selectionSource.getCurrentSelection()
		expect(current?.kind).toBe('editor')
	})

	it('exposes a recording selectionHighlight member', () => {
		const ports = fakeModulePorts()
		ports.selectionHighlight.show({
			kind: 'editor',
			notePath: 'notes/a.md',
			selectedText: 'hi',
			startLine: 0,
			lineCount: 1,
		})
		ports.selectionHighlight.clear()
		expect(ports.selectionHighlight.calls.map((c) => c.kind)).toEqual(['show', 'clear'])
	})

	// T-TC-009 (TEST-TC-003 fake-ports leg): the factory exposes a scriptable
	// `toolbarCatalog` member (the MockBridge toolbar catalog port) so the view-model
	// + widget tests inject a catalog without a real provider (SPEC-TC-008).
	it('exposes a scriptable toolbarCatalog member (default Claude-shaped)', () => {
		const ports = fakeModulePorts()
		const def = ports.toolbarCatalog.getCatalog('claude')
		expect(def.models.length).toBeGreaterThan(0)
		ports.toolbarCatalog.setToolbarCatalog({ models: [{ id: 'z', label: 'Z' }] })
		expect(ports.toolbarCatalog.getCatalog('claude').models).toEqual([{ id: 'z', label: 'Z' }])
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
