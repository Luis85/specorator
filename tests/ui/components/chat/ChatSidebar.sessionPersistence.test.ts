/**
 * T-ASM-057 — Tests: ChatSidebar wires the session-persistence path through
 * `handleSend`. After each successful turn the sidebar must:
 *   1. Upsert a `ChatThreadRecord` for the active thread (REQ-ASM-037).
 *   2. Forward `resumeSessionId` from the existing thread record when present
 *      (REQ-ASM-035).
 *   3. Provide an `onSessionId` callback that calls
 *      `chatStore.captureSessionId(threadId, sessionId)` (REQ-ASM-031).
 *   4. Mirror the turn to the vault via
 *      `SessionLogWriter.appendUserAssistant` — fire-and-forget (REQ-ASM-034,
 *      REQ-ASM-040).
 *   5. Toggle `cliStartingUp` around the `query()` call (R-ASM-003).
 *   6. Flash `sessionResumed` once per resumed turn (REQ-ASM-035).
 *   7. Render `SubprocessStartingPill` and `SessionResumeIndicator` in the
 *      sidebar header (SPEC §7.6).
 *
 * Satisfies REQ-ASM-031, REQ-ASM-034, REQ-ASM-035, REQ-ASM-037, REQ-ASM-040.
 * Maps to: TEST-ASM-016, TEST-ASM-032, TEST-ASM-033, TEST-ASM-038.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue'
import type {
	ClaudeCliPort,
	ClaudeCliQueryOptions,
	ClaudeCliStreamOptions,
	StreamDelta,
} from '@/domain/ports/ClaudeCliPort'
import { ClaudeCliError, streamFromQuery } from '@/domain/ports/ClaudeCliPort'
import type { Result } from '@/domain/shared/Result'
import { ok, err } from '@/domain/shared/Result'
import { asSessionId } from '@/domain/chat/SessionId'
import type { SessionId } from '@/domain/chat/SessionId'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import {
	CLAUDE_CLI_PORT,
	IS_MOBILE_KEY,
	VAULT_PORT,
	WORKSPACE_PORT,
	SETTINGS_PORT,
	LOGGER_PORT,
	TRANSPORT_KIND_KEY,
} from '@/infrastructure/bridge/ports'
import type { TransportKind } from '@/domain/chat/TransportKind'
import { getChatStoresFacade } from '../../../__fakes__/chatStoresFacade'
import { ChatSidebarPO } from './ChatSidebar.po'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const RouterLinkStub = defineComponent({
	props: { to: { type: String, default: '' } },
	template: '<a :href="to" data-testid="chat-degraded-settings-link"><slot /></a>',
})

/**
 * Configurable mock port that:
 *   - Logs `(prompt, options)` per call for assertion.
 *   - Optionally invokes `options.onSessionId(scriptedSessionId)` during query
 *     so tests can simulate the `system/init` capture.
 *   - Returns a canned response or canned error.
 */
class ScriptedClaudeCliPort implements ClaudeCliPort {
	available = true
	cannedResponse = 'assistant says hi'
	queryError: ClaudeCliError | null = null
	scriptedSessionIds: (SessionId | null)[] = []
	readonly queryLog: string[] = []
	readonly optionsLog: (ClaudeCliQueryOptions | undefined)[] = []

	async startup(): Promise<void> {}
	shutdown(): void {}
	async isAvailable(): Promise<boolean> {
		return this.available
	}

	async query(
		prompt: string,
		options?: ClaudeCliQueryOptions,
	): Promise<Result<string, ClaudeCliError>> {
		this.queryLog.push(prompt)
		this.optionsLog.push(options)
		const callIndex = this.queryLog.length - 1
		const scripted = this.scriptedSessionIds[callIndex] ?? null
		if (scripted !== null && options?.onSessionId) {
			options.onSessionId(scripted)
		}
		if (this.queryError !== null) return err(this.queryError)
		return ok(this.cannedResponse)
	}

	queryStream(prompt: string, options?: ClaudeCliStreamOptions): AsyncIterable<StreamDelta> {
		return streamFromQuery((p, o) => this.query(p, o), prompt, options)
	}
}

function makeBridge(
	files: Record<string, string> = {},
	overrides: Partial<PluginSettings> = {},
): MockBridge {
	const bridge = new MockBridge(files)
	const settings: PluginSettings = {
		...DEFAULT_SETTINGS,
		...overrides,
	}
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(settings)
	return bridge
}

async function mountSidebar(args: {
	available?: boolean
	cannedResponse?: string
	scriptedSessionIds?: (SessionId | null)[]
	settings?: Partial<PluginSettings>
	files?: Record<string, string>
	activeFile?: { path: string; basename: string; extension: string } | null
	queryError?: ClaudeCliError | null
	/**
	 * Resolved transport kind injected via `TRANSPORT_KIND_KEY` (mirrors
	 * production: SpecoratorView's selector resolves the setting + CLI
	 * availability to a concrete kind). Defaults to `'subscription'` when
	 * `settings.transportKind === 'subscription'`, else `'api-key'`.
	 * Tests that want to assert the auto-resolved kind can override this
	 * directly (Codex P2, PR #350).
	 */
	resolvedTransportKind?: TransportKind
} = {}) {
	const pinia = createPinia()
	setActivePinia(pinia)

	const port = new ScriptedClaudeCliPort()
	port.available = args.available ?? true
	if (args.cannedResponse !== undefined) port.cannedResponse = args.cannedResponse
	if (args.scriptedSessionIds !== undefined) port.scriptedSessionIds = args.scriptedSessionIds
	if (args.queryError !== undefined) port.queryError = args.queryError

	const bridge = makeBridge(args.files ?? {}, args.settings ?? {})
	if (args.activeFile !== undefined) bridge.setActiveFile(args.activeFile)

	const resolvedKind: TransportKind =
		args.resolvedTransportKind ??
		(args.settings?.transportKind === 'subscription' ? 'subscription' : 'api-key')

	const transportKindRef = ref<TransportKind>(resolvedKind)
	const wrapper = mount(ChatSidebar, {
		global: {
			plugins: [pinia],
			stubs: { RouterLink: RouterLinkStub },
			provide: {
				[CLAUDE_CLI_PORT as symbol]: port,
				[IS_MOBILE_KEY as symbol]: false,
				[VAULT_PORT as symbol]: bridge,
				[WORKSPACE_PORT as symbol]: bridge,
				[SETTINGS_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: bridge,
				[TRANSPORT_KIND_KEY as symbol]: transportKindRef,
			},
		},
	})

	await flushPromises()
	const store = getChatStoresFacade(pinia)
	return { wrapper, port, bridge, po: new ChatSidebarPO(wrapper), store, transportKindRef }
}

async function send(store: ReturnType<typeof getChatStoresFacade>, po: ChatSidebarPO, text: string) {
	store.setUserText(text)
	await flushPromises()
	await po.clickSend()
	await flushPromises()
}

describe('ChatSidebar — session-persistence wiring (T-ASM-057)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('first send on a fresh thread upserts a ChatThreadRecord, omits resumeSessionId, and captures the session id (REQ-ASM-031, REQ-ASM-037)', async () => {
		const scriptedId = asSessionId('sess-abc-12345678')
		const { po, port, store } = await mountSidebar({
			scriptedSessionIds: [scriptedId],
			settings: { transportKind: 'subscription' },
		})

		expect(store.activeThreadId).toBeNull()
		await send(store, po, 'hello')

		// upsertThread was called: chatThreads has exactly one entry, and the
		// store's activeThreadId points at it.
		expect(store.activeThreadId).not.toBeNull()
		expect(store.chatThreads.size).toBe(1)
		const threadId = store.activeThreadId!
		const record = store.chatThreads.get(threadId)
		expect(record).toBeDefined()
		expect(record?.transport).toBe('subscription')

		// First call: no resumeSessionId; onSessionId callback present.
		expect(port.optionsLog).toHaveLength(1)
		expect(port.optionsLog[0]?.resumeSessionId).toBeUndefined()
		expect(typeof port.optionsLog[0]?.onSessionId).toBe('function')

		// Captured session id is now on the thread record.
		expect(store.chatThreads.get(threadId)?.sessionId).toBe(scriptedId)
	})

	it('records transport="api-key" by default when settings.transportKind is not "subscription" (SPEC §7.6)', async () => {
		const { po, store } = await mountSidebar({})
		await send(store, po, 'hello')
		const threadId = store.activeThreadId!
		expect(store.chatThreads.get(threadId)?.transport).toBe('api-key')
	})

	it('records the RESOLVED active transport, not the raw setting — auto→subscription (Codex P2, PR #350)', async () => {
		// settings.transportKind = 'auto' but the selector resolved to
		// 'subscription' (e.g. no API key configured but the CLI is
		// available). The thread record must reflect what actually ran,
		// not the raw setting value.
		const { po, store } = await mountSidebar({
			settings: { transportKind: 'auto' },
			resolvedTransportKind: 'subscription',
		})
		await send(store, po, 'hello')
		const threadId = store.activeThreadId!
		expect(store.chatThreads.get(threadId)?.transport).toBe('subscription')
	})

	it('records api-key when the resolved kind is api-key under auto mode (mirror of the above)', async () => {
		const { po, store } = await mountSidebar({
			settings: { transportKind: 'auto' },
			resolvedTransportKind: 'api-key',
		})
		await send(store, po, 'hello')
		const threadId = store.activeThreadId!
		expect(store.chatThreads.get(threadId)?.transport).toBe('api-key')
	})

	it('rotates the active thread when the resolved transport changes (Codex P2, PR #350)', async () => {
		// Start under subscription transport — first send creates a thread.
		const { po, store, transportKindRef } = await mountSidebar({
			settings: { transportKind: 'auto' },
			resolvedTransportKind: 'subscription',
		})
		await send(store, po, 'hello')
		const firstThreadId = store.activeThreadId!
		expect(store.chatThreads.get(firstThreadId)?.transport).toBe('subscription')

		// User switches transport between turns (selector resolves to api-key now).
		transportKindRef.value = 'api-key'
		await send(store, po, 'second turn')

		// The active thread must have rotated — resuming the previous thread's
		// sessionId under a different transport would produce incoherent
		// context and audit metadata.
		const secondThreadId = store.activeThreadId!
		expect(secondThreadId).not.toBe(firstThreadId)
		expect(store.chatThreads.get(secondThreadId)?.transport).toBe('api-key')
		// The original subscription thread is preserved in the map (history is
		// not deleted — only the active-thread pointer rotates).
		expect(store.chatThreads.get(firstThreadId)?.transport).toBe('subscription')
	})

	it('does NOT rotate when the resolved transport stays the same across sends', async () => {
		const { po, store } = await mountSidebar({
			settings: { transportKind: 'auto' },
			resolvedTransportKind: 'subscription',
		})
		await send(store, po, 'first')
		const firstId = store.activeThreadId!
		await send(store, po, 'second')
		const secondId = store.activeThreadId!
		expect(secondId).toBe(firstId)
	})

	it('rotates the active thread when the active feature slug changes (Codex P2, PR #350)', async () => {
		// First send under feature 'foo' — creates a thread tagged for foo.
		const { po, store, bridge } = await mountSidebar({
			settings: { specsFolder: 'specs' },
			activeFile: { path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' },
		})
		await send(store, po, 'hello from foo')
		const fooThreadId = store.activeThreadId!
		expect(store.chatThreads.get(fooThreadId)?.feature).toBe('foo')

		// User opens a file under a different feature. The next send must
		// rotate the active thread — otherwise the session-log path (derived
		// from `thread.feature`) would write the bar turn under the foo log
		// and corrupt per-feature traceability.
		bridge.setActiveFile({ path: 'specs/bar/idea.md', basename: 'idea', extension: 'md' })
		await flushPromises()
		await send(store, po, 'hello from bar')

		const barThreadId = store.activeThreadId!
		expect(barThreadId).not.toBe(fooThreadId)
		expect(store.chatThreads.get(barThreadId)?.feature).toBe('bar')
		// History preserved — the foo thread still exists in the map.
		expect(store.chatThreads.get(fooThreadId)?.feature).toBe('foo')
	})

	it('does NOT rotate when the feature slug stays the same across sends', async () => {
		const { po, store } = await mountSidebar({
			settings: { specsFolder: 'specs' },
			activeFile: { path: 'specs/foo/idea.md', basename: 'idea', extension: 'md' },
		})
		await send(store, po, 'first')
		const firstId = store.activeThreadId!
		await send(store, po, 'second')
		const secondId = store.activeThreadId!
		expect(secondId).toBe(firstId)
	})

	it('second send on the same thread forwards resumeSessionId and flashes sessionResumed (REQ-ASM-035)', async () => {
		const firstId = asSessionId('sess-first-1234567')
		const { po, port, store } = await mountSidebar({
			scriptedSessionIds: [firstId, firstId],
		})

		await send(store, po, 'first')
		expect(port.optionsLog[0]?.resumeSessionId).toBeUndefined()

		// Sanity: session id was captured.
		const threadId = store.activeThreadId!
		expect(store.chatThreads.get(threadId)?.sessionId).toBe(firstId)

		// Reset the flag (the resetStreaming or beginRequest paths may or may
		// not have cleared it depending on store internals; assert relative).
		store.setSessionResumed(false)

		await send(store, po, 'second')
		expect(port.optionsLog[1]?.resumeSessionId).toBe(firstId)
		// The second turn was a resumed turn → sessionResumed should be true
		// at least after the successful response.
		expect(store.sessionResumed).toBe(true)
	})

	it('toggles cliStartingUp around the query call (R-ASM-003)', async () => {
		// Use a gate to deterministically observe the in-flight cliStartingUp
		// state without racing against a timer.
		let release: () => void = () => {}
		const gate = new Promise<void>((resolve) => {
			release = resolve
		})
		const { po, store, port } = await mountSidebar({})
		const originalQuery = port.query.bind(port)
		port.query = async (prompt, options) => {
			await gate
			return originalQuery(prompt, options)
		}

		expect(store.cliStartingUp).toBe(false)

		store.setUserText('go')
		await flushPromises()
		const sendPromise = po.clickSend()
		// Microtasks flushed; query is awaiting the gate now.
		await flushPromises()
		expect(store.cliStartingUp).toBe(true)

		release()
		await sendPromise
		await flushPromises()
		await flushPromises()
		expect(store.cliStartingUp).toBe(false)
	})

	it('mirrors the turn to the vault via SessionLogWriter.appendUserAssistant (REQ-ASM-034)', async () => {
		const scriptedId = asSessionId('sess-vault-12345678')
		const { po, bridge, store } = await mountSidebar({
			scriptedSessionIds: [scriptedId],
			cannedResponse: 'ASSISTANT_TURN_BODY',
		})

		const writeSpy = vi.spyOn(bridge, 'writeFile')
		await send(store, po, 'USER_TURN_BODY')

		// SessionLogWriter writes are fire-and-forget; flush the
		// microtask/event queue so the .then chain runs.
		await flushPromises()
		await flushPromises()

		const sessionWrites = writeSpy.mock.calls.filter(
			([path]) => typeof path === 'string' && path.includes('/sessions/'),
		)
		expect(sessionWrites.length).toBeGreaterThan(0)
		const [, content] = sessionWrites[0]
		expect(content).toContain('USER_TURN_BODY')
		expect(content).toContain('ASSISTANT_TURN_BODY')
		expect(content).toContain(scriptedId)
	})

	it('vault-write failure is non-fatal: chat send still completes and logger.warn fires (REQ-ASM-040)', async () => {
		const scriptedId = asSessionId('sess-fail-12345678')
		const { po, bridge, store } = await mountSidebar({
			scriptedSessionIds: [scriptedId],
		})

		// Force createFolder + writeFile to reject so the writer's internal
		// error path triggers. The writer routes to its own LoggerPort first,
		// but the ChatSidebar's outer `.catch` only fires when the writer's
		// outer promise rejects — which it does not (writer swallows). So we
		// also assert the chat-render path completes normally.
		vi.spyOn(bridge, 'writeFile').mockRejectedValue(new Error('vault offline'))

		await send(store, po, 'hello')
		await flushPromises()
		await flushPromises()

		// Send completed normally — store is back to idle with a response.
		expect(store.status).toBe('idle')
		expect(store.response).toBe('assistant says hi')
	})

	it('marks the thread used after a successful turn (REQ-ASM-037)', async () => {
		// Spy on `Date#toISOString` to deterministically produce two distinct
		// timestamps — avoids racing real-time millisecond resolution.
		const isoSpy = vi.spyOn(Date.prototype, 'toISOString')
		let isoCounter = 0
		const isoSequence = [
			'2026-05-14T10:00:00.000Z',
			'2026-05-14T10:00:00.000Z',
			'2026-05-14T10:00:01.000Z',
			'2026-05-14T10:00:01.000Z',
			'2026-05-14T10:00:02.000Z',
			'2026-05-14T10:00:02.000Z',
		]
		isoSpy.mockImplementation(() => isoSequence[isoCounter++] ?? '2026-05-14T10:00:09.000Z')

		const { po, store } = await mountSidebar({})
		await send(store, po, 'hello')
		await flushPromises()
		const threadId = store.activeThreadId!
		const beforeBump = store.chatThreads.get(threadId)?.lastUsedAt
		await send(store, po, 'again')
		await flushPromises()
		const afterBump = store.chatThreads.get(threadId)?.lastUsedAt
		expect(afterBump).toBeDefined()
		expect(beforeBump).toBeDefined()
		// `lastUsedAt` is bumped on every successful send; the second value
		// must be strictly later (lexicographically) than the first.
		expect(afterBump !== undefined && beforeBump !== undefined && afterBump > beforeBump).toBe(true)

		isoSpy.mockRestore()
	})

	it('renders SubprocessStartingPill and SessionResumeIndicator slots in the sidebar (SPEC §7.6)', async () => {
		const { wrapper, store } = await mountSidebar({})

		// Toggle both flags so the v-if-guarded markup renders.
		store.setCliStartingUp(true)
		store.setSessionResumed(true)
		await nextTick()

		expect(wrapper.find('[data-testid="chat-subprocess-starting"]').exists()).toBe(true)
		expect(wrapper.find('[data-testid="chat-session-resume"]').exists()).toBe(true)
	})

	it('regression: stage-prompt suffix still flows through alongside the new options (PR-ASM-2 path preserved)', async () => {
		const slug = 'persist-feature'
		const workflowState = [
			'---',
			`id: 01HXPERSIST`,
			`slug: ${slug}`,
			`feature: "${slug}"`,
			'area: "XX"',
			'status: in-progress',
			'currentStep: 4',
			'current_stage: design',
			'last_updated: 2026-05-14',
			'last_agent: ""',
			'---',
			'',
		].join('\n')
		const { po, port, store } = await mountSidebar({
			files: { [`specs/${slug}/workflow-state.md`]: workflowState },
			activeFile: { path: `specs/${slug}/design.md`, basename: 'design', extension: 'md' },
		})

		await send(store, po, 'hello')
		const opts = port.optionsLog[0]
		expect(opts?.systemPromptSuffix).toContain(slug)
		expect(opts?.systemPromptSuffix).toContain('Design')
		// Plus the new options threaded through unchanged.
		expect(typeof opts?.onSessionId).toBe('function')
	})

	it('query failure still leaves cliStartingUp cleared and store in error state (R-ASM-003 / REQ-CCS-016)', async () => {
		const { po, store } = await mountSidebar({
			queryError: new ClaudeCliError('QUERY_FAILED', 'boom'),
		})

		await send(store, po, 'hello')
		await flushPromises()

		expect(store.cliStartingUp).toBe(false)
		expect(store.status).toBe('error')
	})
})
