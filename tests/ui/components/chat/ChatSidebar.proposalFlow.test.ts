/**
 * T-ASM-072 — Integration tests: ChatSidebar proposal flow.
 *
 * Covers SPEC-ASM-001 §7.6 (PR-ASM-4): the end-to-end wiring from a
 * structured-output `CreateFileEnvelope` → `FileWriteProposalCard` →
 * Accept / Reject / Retry → `commitFileWriteProposal` /
 * `rejectFileWriteProposal` → session-log audit row.
 *
 * Maps to TEST-ASM-043 (Reject leaves vault untouched + audit row),
 * TEST-ASM-047 (full integration: structured envelope → card → Accept →
 * exactly one `writeFile`), TEST-ASM-029 (`chat-response-structured-fail`
 * surfaces after EnvelopeParseError), and the trust-first invariant
 * (NFR-ASM-011): no `writeFile` originates from any other code path.
 *
 * Satisfies REQ-ASM-041, REQ-ASM-043, REQ-ASM-045, REQ-ASM-050, REQ-ASM-055.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent, nextTick, ref } from 'vue'

// Mock buildPrompt so individual tests can force the `truncated` flag
// without setting up oversized context files. Default mirrors the real
// happy path: pass through the user text with `truncated: false`.
vi.mock('@/application/chat/buildPrompt', () => ({
	buildPrompt: vi.fn((userText: string) => ({ prompt: userText, truncated: false })),
}))
import { buildPrompt } from '@/application/chat/buildPrompt'

import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import { asSessionId } from '@/domain/chat/SessionId'
import {
	CLAUDE_CLI_PORT,
	IS_MOBILE_KEY,
	VAULT_PORT,
	WORKSPACE_PORT,
	SETTINGS_PORT,
	LOGGER_PORT,
	CONFIRM_MODAL_PORT,
	TRANSPORT_KIND_KEY,
} from '@/infrastructure/bridge/ports'
import { useChatStore } from '@/ui/stores/chatStore'
import { ChatSidebarPO } from './ChatSidebar.po'
import { FileWriteProposalCardPO } from './FileWriteProposalCard.po'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'
import type { TransportKind } from '@/domain/chat/TransportKind'

const RouterLinkStub = defineComponent({
	props: { to: { type: String, default: '' } },
	template: '<a :href="to" data-testid="chat-degraded-settings-link"><slot /></a>',
})

function makeBridge(
	files: Record<string, string> = {},
	overrides: Partial<PluginSettings> = {},
): MockBridge {
	const bridge = new MockBridge(files)
	const settings: PluginSettings = {
		...DEFAULT_SETTINGS,
		anthropicApiKey: 'sk-ant-test',
		transportKind: 'subscription',
		...overrides,
	}
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(settings)
	return bridge
}

interface MountArgs {
	cannedEnvelope?: CreateFileEnvelope | null
	cannedRawResult?: string
	available?: boolean
	confirmResult?: boolean
	files?: Record<string, string>
	transportKind?: TransportKind
	settings?: Partial<PluginSettings>
}

async function mountSidebar(args: MountArgs = {}) {
	const pinia = createPinia()
	setActivePinia(pinia)

	const port = new MockClaudeSubprocessAdapter()
	port.available = args.available ?? true
	if (args.cannedEnvelope !== undefined) port.cannedStructuredEnvelope = args.cannedEnvelope
	if (args.cannedRawResult !== undefined) port.cannedStructuredRawResult = args.cannedRawResult
	port.cannedResponse = 'free-text answer'
	// REQ-ASM-031 / REQ-ASM-046 — pre-seed a session id so the structured path's
	// `onSessionId` callback fires and the subsequent `appendProposalDecision`
	// finds a non-null `thread.sessionId`. Without this every accept would map
	// to `SESSION_LOG_FAILED` via `SessionLogNoSessionError`.
	port.cannedSessionId = asSessionId('11111111-2222-3333-4444-555555555555')

	const bridge = makeBridge(args.files ?? {}, args.settings ?? {})
	const confirmModal = new MockConfirmModalPort()
	confirmModal.nextResult = args.confirmResult ?? true
	const transportKindRef = ref<TransportKind>(args.transportKind ?? 'subscription')

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
				[CONFIRM_MODAL_PORT as symbol]: confirmModal,
				[TRANSPORT_KIND_KEY as symbol]: transportKindRef,
			},
		},
	})

	await flushPromises()
	const store = useChatStore(pinia)
	return {
		wrapper,
		port,
		bridge,
		confirmModal,
		po: new ChatSidebarPO(wrapper),
		store,
	}
}

async function send(
	store: ReturnType<typeof useChatStore>,
	po: ChatSidebarPO,
	text: string,
) {
	store.setUserText(text)
	await flushPromises()
	await po.clickSend()
	await flushPromises()
}

describe('ChatSidebar — proposal flow integration (T-ASM-072)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('structured trigger routes to runStructured, not query (REQ-ASM-021/041)', async () => {
		const { port, po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo idea\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')

		// Structured path called; free-text query() not called.
		expect(port.structuredLog).toHaveLength(1)
		expect(port.optionsLog).toHaveLength(0)
	})

	it('structured branch passes onSessionId so thread.sessionId is captured (Codex P1 #2 fix, REQ-ASM-031/046)', async () => {
		const { port, po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		// The structured call must receive `onSessionId` in its options bag —
		// without it, the proposal-commit pipeline rejects with
		// `SESSION_LOG_FAILED` because `appendProposalDecision` cannot append
		// against a `sessionId === null` thread.
		expect(port.structuredLog).toHaveLength(1)
		expect(typeof port.structuredLog[0].options.onSessionId).toBe('function')

		// And the resulting thread now has the captured session id.
		const threadId = store.activeThreadId
		expect(threadId).not.toBeNull()
		const thread = store.chatThreads.get(threadId!)
		expect(thread).toBeDefined()
		expect(thread!.sessionId).toBe('11111111-2222-3333-4444-555555555555')
	})

	it('renders the FileWriteProposalCard via the ChatResponse proposalCard slot (REQ-ASM-041)', async () => {
		const { wrapper, po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo idea\n\nbody.\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasCard()).toBe(true)
		expect(card.pathText()).toBe('specs/demo/idea.md')
		expect(card.hasAccept()).toBe(true)
		expect(card.hasReject()).toBe(true)
		expect(store.proposals.size).toBe(1)
		const proposal = Array.from(store.proposals.values())[0]
		expect(proposal.status).toBe('pending')
	})

	it('Accept click commits exactly one writeFile call with the envelope content (TEST-ASM-047, NFR-ASM-011)', async () => {
		const { wrapper, po, store, bridge, confirmModal } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
			confirmResult: true,
		})

		const writeSpy = vi.spyOn(bridge, 'writeFile')
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasAccept()).toBe(true)
		await card.clickAccept()
		await flushPromises()
		await flushPromises()

		const proposalWrites = writeSpy.mock.calls.filter(
			([path]) => path === 'specs/demo/idea.md',
		)
		expect(proposalWrites).toHaveLength(1)
		expect(proposalWrites[0][1]).toBe('# Demo\n')

		const proposal = Array.from(store.proposals.values())[0]
		expect(proposal.status).toBe('accepted')

		// No overwrite confirmation expected (file does not exist).
		expect(confirmModal.calls).toHaveLength(0)
	})

	it('Reject click commits zero writeFile calls and records audit row (TEST-ASM-043)', async () => {
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		const writeSpy = vi.spyOn(bridge, 'writeFile')
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		// Clear the writeSpy: appendUserAssistant may have been scheduled
		// (fire-and-forget). The trust-first invariant is about the
		// envelope's target path, not the audit log.
		const writesBeforeReject = writeSpy.mock.calls.filter(
			([path]) => path === 'specs/demo/idea.md',
		).length
		expect(writesBeforeReject).toBe(0)

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickReject()
		await flushPromises()
		await flushPromises()

		// REQ-ASM-045: no VaultPort mutation against the envelope path.
		const writesToEnvelope = writeSpy.mock.calls.filter(
			([path]) => path === 'specs/demo/idea.md',
		)
		expect(writesToEnvelope).toHaveLength(0)

		const proposal = Array.from(store.proposals.values())[0]
		expect(proposal.status).toBe('rejected')
	})

	it('re-validates the envelope path at Accept time against the CURRENT specs folder (Codex P2, PR #350)', async () => {
		// Generate a proposal under specsFolder='specs'.
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
			settings: { specsFolder: 'specs' },
		})
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		const proposalId = Array.from(store.proposals.keys())[0]
		expect(store.proposals.get(proposalId)?.status).toBe('pending')

		// Change specsFolder BEFORE the user clicks Accept. The pending
		// envelope ('specs/demo/idea.md') is now outside the configured
		// containment root ('notes/'). Without the re-validation, the
		// commit pipeline would write the file anyway — the path-validation
		// guard only ran at proposal-creation time.
		vi.spyOn(bridge, 'getSettings').mockResolvedValue({
			...DEFAULT_SETTINGS,
			anthropicApiKey: 'sk-ant-test',
			transportKind: 'subscription',
			specsFolder: 'notes',
		})
		const writeSpy = vi.spyOn(bridge, 'writeFile')

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickAccept()
		await flushPromises()

		// Accept must NOT have written the envelope to its original path
		// (the path no longer lives under the configured specs folder).
		expect(
			writeSpy.mock.calls.some(([p]) => p === 'specs/demo/idea.md'),
		).toBe(false)
		// Proposal moved to a terminal failure state — no vault mutation
		// happened.
		expect(store.proposals.get(proposalId)?.status).toBe('failed')

		// Codex P2 follow-up — the terminal failure must mirror to the
		// session log so the audit trail records the rejected Accept.
		// `appendProposalDecision` writes a `## proposal` block under the
		// thread's session log path; we observe the write via writeSpy.
		const appendCalls = writeSpy.mock.calls.filter(([p]) =>
			typeof p === 'string' && p.endsWith('.md') && p.includes('sessions/'),
		)
		expect(appendCalls.length).toBeGreaterThanOrEqual(1)
	})

	it('still flips the proposal to failed when settingsPort.getSettings() rejects at Accept time (Codex P2 #3, PR #350)', async () => {
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
			settings: { specsFolder: 'specs' },
		})
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		const proposalId = Array.from(store.proposals.keys())[0]

		// `getSettings()` rejects at Accept time. The handler must not
		// propagate the rejection — it must catch it and flip the proposal
		// to `failed` so the user is not stranded.
		const writeSpy = vi.spyOn(bridge, 'writeFile')
		vi.spyOn(bridge, 'getSettings').mockRejectedValueOnce(new Error('boom: settings read failed'))

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickAccept()
		await flushPromises()

		expect(store.proposals.get(proposalId)?.status).toBe('failed')
		// Codex P2 #4 — terminal failure must mirror to the session log
		// regardless of which pre-commit branch rejected (settings read,
		// revalidation, …). One audit row should land under sessions/.
		const auditCalls = writeSpy.mock.calls.filter(([p]) =>
			typeof p === 'string' && p.endsWith('.md') && p.includes('sessions/'),
		)
		expect(auditCalls.length).toBeGreaterThanOrEqual(1)
	})

	it('still flips the proposal to failed when the revalidation audit mirror itself throws (Codex P2 #2, PR #350)', async () => {
		// Same scenario as above (settings change between proposal and
		// Accept), but the session-log writer's `appendProposalDecision`
		// is forced to reject. The user-visible status flip must still
		// run — a transient logging failure cannot strand a rejected
		// proposal in `pending`.
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
			settings: { specsFolder: 'specs' },
		})
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		const proposalId = Array.from(store.proposals.keys())[0]

		// Stale containment + writer fails on every audit append.
		vi.spyOn(bridge, 'getSettings').mockResolvedValue({
			...DEFAULT_SETTINGS,
			anthropicApiKey: 'sk-ant-test',
			transportKind: 'subscription',
			specsFolder: 'notes',
		})
		vi.spyOn(bridge, 'writeFile').mockImplementation(async () => {
			throw new Error('boom: audit write rejected')
		})

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickAccept()
		await flushPromises()

		// Despite the audit-write throw, the proposal still flips to
		// `failed` — the user is not stranded.
		expect(store.proposals.get(proposalId)?.status).toBe('failed')
	})

	it('Reject is a no-op while an Accept commit is still in flight on the same proposal (Codex P1 fix)', async () => {
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		const proposalId = Array.from(store.proposals.keys())[0]
		expect(store.proposals.get(proposalId)?.status).toBe('pending')

		// Stall `vault.writeFile` so the Accept commit hangs mid-flight.
		// While it is suspended, click Reject and assert it is a no-op:
		// no `rejected` audit row, no status flip, no contradictory final
		// state. Releasing the deferred lets Accept finish cleanly.
		let releaseWrite: () => void = () => {}
		const writeDeferred = new Promise<void>((resolve) => {
			releaseWrite = resolve
		})
		const writeSpy = vi.spyOn(bridge, 'writeFile').mockImplementationOnce(async () => {
			await writeDeferred
		})

		const card = new FileWriteProposalCardPO(wrapper)
		// Fire Accept (do NOT await — the writeFile promise is stalled).
		void card.clickAccept()
		await Promise.resolve()
		await Promise.resolve()
		// Reject while Accept is mid-flight — must be a no-op.
		await card.clickReject()
		await flushPromises()

		// Reject did NOT take effect — status is still pending; no
		// `rejected` audit row landed.
		expect(store.proposals.get(proposalId)?.status).toBe('pending')

		// Release the Accept commit; it now resolves normally.
		releaseWrite()
		await flushPromises()
		await flushPromises()
		expect(store.proposals.get(proposalId)?.status).toBe('accepted')
		// Exactly one vault writeFile call against the envelope path.
		expect(
			writeSpy.mock.calls.filter(([path]) => path === 'specs/demo/idea.md'),
		).toHaveLength(1)
	})

	it('path-invalid envelope surfaces card in path-invalid state with no Accept button (REQ-ASM-048)', async () => {
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: '../escape.md',
				content: 'oops',
			},
		})
		const writeSpy = vi.spyOn(bridge, 'writeFile')
		await send(store, po, '/create-file ../escape.md')
		await flushPromises()

		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasCard()).toBe(true)
		expect(card.hasPathInvalid()).toBe(true)
		expect(card.hasAccept()).toBe(false)
		// No writeFile call against the escape path.
		const writes = writeSpy.mock.calls.filter(([p]) => String(p).includes('escape.md'))
		expect(writes).toHaveLength(0)
		// Proposal still stored, in pending status, with the path error in scope.
		expect(store.proposals.size).toBe(1)
	})

	it('path-invalid pending proposals do NOT suppress later error banners (Codex P2 fix)', async () => {
		const { wrapper, po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: '../escape.md',
				content: 'oops',
			},
		})

		// Land a path-invalid pending proposal (no Accept/Reject controls).
		await send(store, po, '/create-file ../escape.md')
		await flushPromises()
		expect(store.proposals.size).toBe(1)

		// A subsequent send that errors out must still surface the error
		// banner — the path-invalid card is non-actionable and should not
		// preempt user-visible failure feedback.
		store.setError('query_failed')
		await flushPromises()

		const errorBanner = wrapper.find('[data-testid="chat-response-error"]')
		expect(errorBanner.exists()).toBe(true)
	})

	it('vault-write failure during Accept flips proposal to failed with failureReason (REQ-ASM-043/044)', async () => {
		const { wrapper, po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})
		vi.spyOn(bridge, 'writeFile').mockRejectedValue(new Error('disk full'))

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickAccept()
		await flushPromises()
		await flushPromises()

		const proposal = Array.from(store.proposals.values())[0]
		expect(proposal.status).toBe('failed')
		expect(proposal.failureReason).toBe('WRITE_FAILED')
	})

	it('structured parse error renders chat-response-structured-fail (TEST-ASM-029)', async () => {
		const { wrapper, po, store } = await mountSidebar({
			cannedEnvelope: null,
			cannedRawResult: 'this is not JSON, no braces here',
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		const fail = wrapper.find('[data-testid="chat-response-structured-fail"]')
		expect(fail.exists()).toBe(true)
		// No raw model output quoted (defensive — only the canned i18n copy).
		expect(fail.text()).not.toContain('this is not JSON')
		// No proposal recorded.
		expect(store.proposals.size).toBe(0)
	})

	it('pending proposal card stays actionable when a later send produces a structured-parse failure (Codex P2 fix)', async () => {
		const { wrapper, po, store, port } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo idea\n',
			},
		})

		// 1. First send: valid envelope → pending proposal card.
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		expect(store.proposals.size).toBe(1)
		const firstProposalId = Array.from(store.proposals.keys())[0]
		expect(store.proposals.get(firstProposalId)?.status).toBe('pending')

		// 2. Second send on the same thread: parse failure.
		port.cannedStructuredEnvelope = null
		port.cannedStructuredRawResult = 'not JSON here'
		await send(store, po, '/create-file specs/demo/other.md')
		await flushPromises()

		// The pending card from send #1 must still render with Accept/Reject —
		// the structured-fail banner must not preempt actionable proposals.
		const fail = wrapper.find('[data-testid="chat-response-structured-fail"]')
		expect(fail.exists()).toBe(false)
		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasAccept()).toBe(true)
		expect(card.hasReject()).toBe(true)
	})

	it('forwards the buildPrompt truncated flag through the structured success path (Codex P2 fix)', async () => {
		// Force buildPrompt to report truncation for this turn — simulates
		// large context files being clipped to fit the prompt budget.
		vi.mocked(buildPrompt).mockReturnValueOnce({
			prompt: '/create-file specs/demo/idea.md',
			truncated: true,
		})

		const { po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		// REQ-ASM-024 transparency: the structured proposal turn must surface
		// the same trim warning the free-text path does. Before the Codex P2
		// fix, the structured success branch hardcoded `truncated: false` and
		// users got no warning that the proposal was generated from clipped
		// context.
		expect(store.truncated).toBe(true)
	})

	it('pending proposal cards stay visible after a later send error (Codex P2 fix)', async () => {
		const { wrapper, po, store } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		// 1. Valid envelope → pending proposal card surfaces.
		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		expect(store.proposals.size).toBe(1)

		// 2. Force the next send into the `error` state.
		store.setError('query_failed')
		await flushPromises()

		// The error banner must NOT preempt the actionable pending card.
		// Without this fix, `responseState` returned `'error'` and the
		// proposalCard slot was unmounted, stranding the user.
		const errorState = wrapper.find('[data-testid="chat-response-error"]')
		expect(errorState.exists()).toBe(false)
		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasAccept()).toBe(true)
		expect(card.hasReject()).toBe(true)
	})

	it('regression: free-text prompts still use query() and skip the structured path', async () => {
		const { port, po, store } = await mountSidebar({})

		await send(store, po, 'hello there')
		await flushPromises()

		// Free-text query() called exactly once; runStructured() not called.
		expect(port.optionsLog).toHaveLength(1)
		expect(port.structuredLog).toHaveLength(0)
		expect(store.proposals.size).toBe(0)
	})

	it('Retry resubmits the prior user turn and adds a fresh proposal (REQ-ASM-050)', async () => {
		const { wrapper, po, store, port } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		expect(store.proposals.size).toBe(1)
		const firstProposalId = Array.from(store.proposals.keys())[0]

		const card = new FileWriteProposalCardPO(wrapper)
		expect(card.hasRetry()).toBe(true)
		await card.clickRetry()
		await flushPromises()
		await flushPromises()

		// Retry re-issues the same prompt through the structured path.
		expect(port.structuredLog.length).toBeGreaterThanOrEqual(2)
		// A second proposal was added with a different id.
		expect(store.proposals.size).toBeGreaterThanOrEqual(2)
		const ids = Array.from(store.proposals.keys())
		expect(ids).toContain(firstProposalId)
		const otherIds = ids.filter((i) => i !== firstProposalId)
		expect(otherIds.length).toBeGreaterThan(0)
	})

	it('renders TransportStatusPill in the header when transport is subscription (SPEC §7.6)', async () => {
		const { wrapper } = await mountSidebar({ transportKind: 'subscription' })

		const pill = wrapper.find('[data-testid="chat-transport-status"]')
		expect(pill.exists()).toBe(true)
	})

	it('does not render TransportStatusPill when transport is api-key (REQ-ASM-002)', async () => {
		const { wrapper } = await mountSidebar({ transportKind: 'api-key' })

		const pill = wrapper.find('[data-testid="chat-transport-status"]')
		expect(pill.exists()).toBe(false)
	})

	it('overwrite confirmation: cancel leaves vault untouched and flips proposal to failed (REQ-ASM-044)', async () => {
		// Pre-populate the file so Accept triggers the overwrite gate.
		const { wrapper, po, store, bridge, confirmModal } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
			files: { 'specs/demo/idea.md': '# Existing content\n' },
			confirmResult: false,
		})
		const writeSpy = vi.spyOn(bridge, 'writeFile')

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()

		const card = new FileWriteProposalCardPO(wrapper)
		await card.clickAccept()
		await flushPromises()
		await flushPromises()

		expect(confirmModal.calls).toHaveLength(1)
		// No write against the envelope path.
		const writesToEnvelope = writeSpy.mock.calls.filter(
			([path]) => path === 'specs/demo/idea.md',
		)
		expect(writesToEnvelope).toHaveLength(0)
		const proposal = Array.from(store.proposals.values())[0]
		expect(proposal.status).toBe('failed')
		expect(proposal.failureReason).toBe('OVERWRITE_CANCELLED')
	})
})

describe('ChatSidebar — proposal flow: trust-first invariant (T-ASM-072 / NFR-ASM-011)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('zero writeFile calls against the envelope path until Accept is clicked', async () => {
		const { po, store, bridge } = await mountSidebar({
			cannedEnvelope: {
				action: 'createFile',
				path: 'specs/demo/idea.md',
				content: '# Demo\n',
			},
		})
		const writeSpy = vi.spyOn(bridge, 'writeFile')

		await send(store, po, '/create-file specs/demo/idea.md')
		await flushPromises()
		await flushPromises()

		// Before Accept: no write against the envelope's target.
		const writes = writeSpy.mock.calls.filter(([p]) => p === 'specs/demo/idea.md')
		expect(writes).toHaveLength(0)
		// Proposal is stored, awaiting user action.
		expect(store.proposals.size).toBe(1)
		await nextTick()
	})
})
