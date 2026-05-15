/**
 * T-CCS-026 — Tests: ChatSidebar — panel variants, send flow, empty-message guard, timeout path.
 * Satisfies REQ-CCS-004, REQ-CCS-012, REQ-CCS-013, REQ-CCS-014, REQ-CCS-015, REQ-CCS-016,
 * REQ-CCS-018, REQ-CCS-019, REQ-CCS-020, SPEC-CCS-001 §7.2.
 * Maps to: TEST-CCS-004, TEST-CCS-012–TEST-CCS-016, TEST-CCS-018–TEST-CCS-020.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent } from 'vue'
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import {
	CLAUDE_CLI_PORT,
	IS_MOBILE_KEY,
	VAULT_PORT,
	WORKSPACE_PORT,
	SETTINGS_PORT,
	LOGGER_PORT,
} from '@/infrastructure/bridge/ports'
import { useChatStore } from '@/ui/stores/chatStore'
import { ChatSidebarPO } from './ChatSidebar.po'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

// Stub RouterLink to avoid vue-router missing in tests
const RouterLinkStub = defineComponent({
	props: ['to'],
	template: '<a :href="to" data-testid="chat-degraded-settings-link"><slot /></a>',
})

function makeGlobal(
	port: MockClaudeCliPort,
	bridge: MockBridge,
	isMobile: boolean,
	pinia: ReturnType<typeof createPinia>,
) {
	return {
		plugins: [pinia],
		stubs: { RouterLink: RouterLinkStub },
		provide: {
			[CLAUDE_CLI_PORT as symbol]: port,
			[IS_MOBILE_KEY as symbol]: isMobile,
			[VAULT_PORT as symbol]: bridge,
			[WORKSPACE_PORT as symbol]: bridge,
			[SETTINGS_PORT as symbol]: bridge,
			[LOGGER_PORT as symbol]: bridge,
		},
	}
}

function makeBridgeWithApiKey(
	apiKey: string,
	files: Record<string, string> = {},
	overrides: Partial<PluginSettings> = {},
): MockBridge {
	const bridge = new MockBridge(files)
	const settings: PluginSettings = {
		...DEFAULT_SETTINGS,
		anthropicApiKey: apiKey,
		...overrides,
	}
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(settings)
	return bridge
}

async function mountSidebar(options: {
	available?: boolean
	isMobile?: boolean
	apiKey?: string
	cannedResponse?: string
	queryError?: ClaudeCliError | null
	delayMs?: number
	files?: Record<string, string>
	settings?: Partial<PluginSettings>
}) {
	const pinia = createPinia()
	setActivePinia(pinia)

	const port = new MockClaudeCliPort()
	port.available = options.available ?? false
	if (options.cannedResponse !== undefined) port.cannedResponse = options.cannedResponse
	if (options.queryError !== undefined) port.queryError = options.queryError
	if (options.delayMs !== undefined) port.delayMs = options.delayMs

	const bridge = makeBridgeWithApiKey(
		options.apiKey ?? '',
		options.files ?? {},
		options.settings ?? {},
	)

	const wrapper = mount(ChatSidebar, {
		global: makeGlobal(port, bridge, options.isMobile ?? false, pinia),
	})

	await flushPromises()

	const store = useChatStore(pinia)
	return { wrapper, port, bridge, po: new ChatSidebarPO(wrapper), store }
}

describe('ChatSidebar', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	describe('TEST-CCS-020: mobile degradation state', () => {
		it('renders mobile degraded heading when IS_MOBILE_KEY=true', async () => {
			const { po } = await mountSidebar({ isMobile: true })
			expect(po.hasDegradedHeading()).toBe(true)
			expect(po.degradedHeadingText()).toContain('Chat is available on desktop only')
		})

		it('does not render textarea when mobile', async () => {
			const { po } = await mountSidebar({ isMobile: true })
			expect(po.hasTextarea()).toBe(false)
		})
	})

	describe('TEST-CCS-018: API key missing degraded state', () => {
		it('renders "Chat is not set up yet" heading when key empty and unavailable', async () => {
			const { po } = await mountSidebar({ available: false, apiKey: '' })
			expect(po.hasDegradedHeading()).toBe(true)
			expect(po.degradedHeadingText()).toContain('Chat is not set up yet')
		})

		it('shows settings link when API key is missing', async () => {
			const { po } = await mountSidebar({ available: false, apiKey: '' })
			expect(po.hasSettingsLink()).toBe(true)
		})

		it('does not render textarea when API key missing', async () => {
			const { po } = await mountSidebar({ available: false, apiKey: '' })
			expect(po.hasTextarea()).toBe(false)
		})
	})

	describe('TEST-CCS-019: SDK unavailable degraded state', () => {
		it('renders "AI assistant is not available" heading when unavailable but key present', async () => {
			const { po } = await mountSidebar({ available: false, apiKey: 'sk-ant-not-empty' })
			expect(po.hasDegradedHeading()).toBe(true)
			expect(po.degradedHeadingText()).toContain('AI assistant is not available right now')
		})
	})

	describe('subscription-transport degraded copy (Codex P2 fix)', () => {
		it('shows CLI-install guidance when transport=subscription, available=false, regardless of apiKeyMissing', async () => {
			const { ref, defineComponent } = await import('vue')
			const { TRANSPORT_KIND_KEY } = await import('@/infrastructure/bridge/ports')
			const pinia = createPinia()
			setActivePinia(pinia)
			const port = new MockClaudeCliPort()
			port.available = false
			// Empty API key — would otherwise trigger the api-key copy.
			const bridge = makeBridgeWithApiKey('', {})
			const RouterLinkLocal = defineComponent({
				props: ['to'],
				template: '<a :href="to" data-testid="chat-degraded-settings-link"><slot /></a>',
			})
			const wrapper = mount(ChatSidebar, {
				global: {
					plugins: [pinia],
					stubs: { RouterLink: RouterLinkLocal },
					provide: {
						[CLAUDE_CLI_PORT as symbol]: port,
						[IS_MOBILE_KEY as symbol]: false,
						[VAULT_PORT as symbol]: bridge,
						[WORKSPACE_PORT as symbol]: bridge,
						[SETTINGS_PORT as symbol]: bridge,
						[LOGGER_PORT as symbol]: bridge,
						[TRANSPORT_KIND_KEY as symbol]: ref<'subscription' | 'api-key'>('subscription'),
					},
				},
			})
			await flushPromises()
			const po = new ChatSidebarPO(wrapper)

			expect(po.hasDegradedHeading()).toBe(true)
			// Subscription failures must NOT show the "add Anthropic key" copy.
			expect(po.degradedHeadingText()).not.toContain('Chat is not set up yet')
			expect(po.degradedHeadingText()).toContain('Claude CLI is not available')
		})
	})

	describe('TEST-CCS-004: ready state', () => {
		it('renders textarea and send button when available=true', async () => {
			const { po } = await mountSidebar({ available: true })
			expect(po.hasTextarea()).toBe(true)
			expect(po.hasSendButton()).toBe(true)
		})
	})

	describe('TEST-CCS-013: send message and receive response', () => {
		it('sends query and renders response text', async () => {
			const { po, port, store } = await mountSidebar({
				available: true,
				cannedResponse: 'Hello world',
			})

			// Set userText in store directly and click send
			store.setUserText('What next?')
			await flushPromises()
			await po.clickSend()
			await flushPromises()

			expect(port.queryLog).toHaveLength(1)
			expect(po.hasResponseText()).toBe(true)
			expect(po.responseTextContent()).toContain('Hello world')
		})
	})

	describe('TEST-CCS-015: empty/whitespace message guard', () => {
		it('does not call query when store.userText is empty', async () => {
			const { po, port } = await mountSidebar({ available: true })
			// userText is empty by default
			await po.clickSend()
			await flushPromises()
			expect(port.queryLog).toHaveLength(0)
		})
	})

	describe('TEST-CCS-014: loading state', () => {
		it('shows loading indicator while request in flight', async () => {
			const { po, store } = await mountSidebar({
				available: true,
				delayMs: 50,
			})

			store.setUserText('hello')
			await flushPromises()

			// Trigger click without waiting for flushPromises
			void po.clickSend()
			// Give Vue one tick to update the DOM
			await new Promise((r) => setTimeout(r, 0)) // eslint-disable-line obsidianmd/prefer-active-window-timers

			expect(po.hasResponseLoading()).toBe(true)
			expect(po.isSendButtonDisabled()).toBe(true)

			await flushPromises()
		})
	})

	describe('TEST-CCS-016: timeout error path', () => {
		it('shows timeout error copy when query returns TIMEOUT error', async () => {
			const { po, store } = await mountSidebar({
				available: true,
				queryError: new ClaudeCliError('TIMEOUT', 'timed out'),
			})

			store.setUserText('hello')
			await flushPromises()
			await po.clickSend()
			await flushPromises()

			expect(po.hasResponseError()).toBe(true)
			expect(po.responseErrorContent()).toContain('That took too long')
		})

		it('retains userText after timeout error', async () => {
			const { po, store } = await mountSidebar({
				available: true,
				queryError: new ClaudeCliError('TIMEOUT', 'timed out'),
			})

			store.setUserText('my question')
			await flushPromises()
			await po.clickSend()
			await flushPromises()

			expect(store.userText).toBe('my question')
		})
	})

	describe('TEST-CCS-012: trimmed-success state', () => {
		it('shows trim notice when buildPrompt returns truncated=true', async () => {
			const largeContent = 'a'.repeat(210_000)
			const { po, store, bridge } = await mountSidebar({
				available: true,
				cannedResponse: 'trimmed response',
				files: { 'big-file.md': largeContent },
			})

			// Set the active file to the large file so it gets included
			bridge.setActiveFile({ path: 'big-file.md', basename: 'big-file', extension: 'md' })
			await flushPromises()

			store.setUserText('summarize')
			await flushPromises()
			await po.clickSend()
			await flushPromises()

			expect(po.hasTrimNotice()).toBe(true)
		})
	})
})
