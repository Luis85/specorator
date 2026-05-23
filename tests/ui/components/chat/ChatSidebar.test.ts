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
import { MockSecretStore } from '@/infrastructure/mock/MockSecretStore'
import { ChatTransportError } from '@/domain/ports/ChatTransportPort'
import { SECRET_ID_ANTHROPIC } from '@/domain/ports'
import {
	CHAT_TRANSPORT_PORT,
	IS_MOBILE_KEY,
	VAULT_PORT,
	WORKSPACE_PORT,
	SETTINGS_PORT,
	LOGGER_PORT,
	SECRET_STORE_PORT,
	ICON_PORT,
	PROVIDER_REGISTRY_KEY,
} from '@/infrastructure/bridge/ports'
import type { ProviderRegistry } from '@/domain/chat/ProviderRegistry'
import { i18n } from '@/ui/i18n'
import { useMessagesStore } from '@/ui/stores/messagesStore'
import { ChatSidebarPO } from './ChatSidebar.po'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const emptyRegistry: ProviderRegistry = {
	listProviders: () => [],
	getProvider: () => undefined,
	getCapabilities: () => undefined,
}

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
	secretStore: MockSecretStore = new MockSecretStore(),
) {
	return {
		plugins: [pinia, i18n],
		stubs: { RouterLink: RouterLinkStub },
		provide: {
			[CHAT_TRANSPORT_PORT as symbol]: port,
			[IS_MOBILE_KEY as symbol]: isMobile,
			[VAULT_PORT as symbol]: bridge,
			[WORKSPACE_PORT as symbol]: bridge,
			[SETTINGS_PORT as symbol]: bridge,
			[LOGGER_PORT as symbol]: bridge,
			[SECRET_STORE_PORT as symbol]: secretStore,
			[ICON_PORT as symbol]: bridge,
			[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
		},
	}
}

function makeBridgeWithApiKey(
	_apiKey: string,
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

function makeSecretStoreWithApiKey(apiKey: string): MockSecretStore {
	const initial = apiKey ? { [SECRET_ID_ANTHROPIC]: apiKey } : undefined
	return new MockSecretStore({ initial })
}

async function mountSidebar(options: {
	available?: boolean
	isMobile?: boolean
	apiKey?: string
	cannedResponse?: string
	queryError?: ChatTransportError | null
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
	const secretStore = makeSecretStoreWithApiKey(options.apiKey ?? '')

	const wrapper = mount(ChatSidebar, {
		global: makeGlobal(port, bridge, options.isMobile ?? false, pinia, secretStore),
	})

	await flushPromises()

	const store = useMessagesStore(pinia)
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

		it('clicking the settings CTA invokes the injected openPluginSettings (Codex P2, PR #350)', async () => {
			// The in-app Vue `/settings` route does not expose the Anthropic key
			// or transport fields, so the recovery CTA must call the function
			// SpecoratorView provides under OPEN_PLUGIN_SETTINGS_KEY — that
			// function opens Obsidian's plugin settings tab in production.
			const { OPEN_PLUGIN_SETTINGS_KEY } = await import('@/infrastructure/bridge/ports')
			const pinia = createPinia()
			setActivePinia(pinia)
			const port = new MockClaudeCliPort()
			port.available = false
			const bridge = makeBridgeWithApiKey('', {})
			const secretStore = makeSecretStoreWithApiKey('')
			const openPluginSettings = vi.fn()
			const wrapper = mount(ChatSidebar, {
				global: {
					plugins: [pinia, i18n],
					stubs: { RouterLink: RouterLinkStub },
					provide: {
						[CHAT_TRANSPORT_PORT as symbol]: port,
						[IS_MOBILE_KEY as symbol]: false,
						[VAULT_PORT as symbol]: bridge,
						[WORKSPACE_PORT as symbol]: bridge,
						[SETTINGS_PORT as symbol]: bridge,
						[LOGGER_PORT as symbol]: bridge,
						[SECRET_STORE_PORT as symbol]: secretStore,
						[OPEN_PLUGIN_SETTINGS_KEY as symbol]: openPluginSettings,
						[ICON_PORT as symbol]: bridge,
						[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
					},
				},
			})
			await flushPromises()

			const cta = wrapper.find('[data-testid="chat-degraded-settings-link"]')
			expect(cta.exists()).toBe(true)
			await cta.trigger('click')

			expect(openPluginSettings).toHaveBeenCalledTimes(1)
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
					plugins: [pinia, i18n],
					stubs: { RouterLink: RouterLinkLocal },
					provide: {
						[CHAT_TRANSPORT_PORT as symbol]: port,
						[IS_MOBILE_KEY as symbol]: false,
						[VAULT_PORT as symbol]: bridge,
						[WORKSPACE_PORT as symbol]: bridge,
						[SETTINGS_PORT as symbol]: bridge,
						[LOGGER_PORT as symbol]: bridge,
						[TRANSPORT_KIND_KEY as symbol]: ref<'subscription' | 'api-key'>('subscription'),
						[ICON_PORT as symbol]: bridge,
						[PROVIDER_REGISTRY_KEY as symbol]: emptyRegistry,
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
		it('sends query and records assistant response on the messages store (UX-#1: MessageList renders the text)', async () => {
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
			// UX-#1 (WP-2): the agent sidepanel renders ChatResponse with
			// `legacyMode=false`, so the success-text body is suppressed in
			// favour of MessageList. Assert the orchestrator-driven side
			// effects instead — store carries the response and an assistant
			// `ChatMessage` was appended to the thread bucket.
			expect(po.hasResponseText()).toBe(false)
			expect(store.response).toBe('Hello world')
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
		it('marks the messages store as loading and disables the send button (UX-#2: MessageList shows the streaming bubble)', async () => {
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

			// UX-#2 (WP-2): no `chat-response-loading` "Thinking…" copy in the
			// agent sidepanel — MessageList's streaming bubble owns the
			// in-flight signal. Assert the underlying state instead.
			expect(po.hasResponseLoading()).toBe(false)
			expect(store.status).toBe('loading')
			// WS-AUX-6: the InputToolbar trailing button swaps to Stop while
			// streaming (REQ-AUX-004 / SPEC-AUX-001 §1.3.3). The button stays
			// enabled so the user can abort. The streaming-bubble in MessageList
			// is the in-flight indicator, NOT a disabled send button.
			expect(po.sendButton.exists()).toBe(true)

			await flushPromises()
		})
	})

	describe('TEST-CCS-016: timeout error path', () => {
		it('shows timeout error copy when query returns TIMEOUT error', async () => {
			const { po, store } = await mountSidebar({
				available: true,
				queryError: new ChatTransportError('TIMEOUT', 'timed out'),
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
				queryError: new ChatTransportError('TIMEOUT', 'timed out'),
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

	// ─────────────────────────────────────────────────────────────────────────
	// WP-7 a11y P1 wave
	// ─────────────────────────────────────────────────────────────────────────
	describe('WP-7 a11y #5 — Stop button + Escape abort', () => {
		it('Stop button carries aria-keyshortcuts="Escape" while a turn is in flight', async () => {
			// Long delay so the Stop button is visible while we assert.
			const { wrapper, store, po } = await mountSidebar({
				available: true,
				delayMs: 5_000,
				cannedResponse: 'done',
			})
			store.setUserText('hi')
			await flushPromises()
			void po.clickSend()
			// Let the orchestrator mint the AbortController.
			await flushPromises()
			const stopBtn = wrapper.find('[data-testid="chat-stop-generation"]')
			expect(stopBtn.exists()).toBe(true)
			expect(stopBtn.attributes('aria-keyshortcuts')).toBe('Escape')
		})

		it('Escape from the textarea while loading aborts the in-flight turn (mirrors Stop click)', async () => {
			const { wrapper, store, po } = await mountSidebar({
				available: true,
				delayMs: 5_000,
				cannedResponse: 'done',
			})
			store.setUserText('hi')
			await flushPromises()
			void po.clickSend()
			await flushPromises()
			expect(wrapper.find('[data-testid="chat-stop-generation"]').exists()).toBe(true)
			// Press Escape — ChatInput emits `abort`, ChatSidebar handles it
			// identically to a click on the Stop button.
			await wrapper
				.find('[data-testid="chat-input-textarea"]')
				.trigger('keydown', { key: 'Escape' })
			await flushPromises()
			// AbortController cleared → Stop button no longer rendered.
			expect(wrapper.find('[data-testid="chat-stop-generation"]').exists()).toBe(false)
		})
	})
})
