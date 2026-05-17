/**
 * T-ASM-040 — Tests: ChatSidebar threads the stage-aware system-prompt suffix
 * into ClaudeCliPort.query via `options.systemPromptSuffix`.
 *
 * Satisfies REQ-ASM-013, REQ-ASM-014, REQ-ASM-018, REQ-ASM-019, REQ-ASM-054.
 * Maps to: TEST-ASM-020, TEST-ASM-021, TEST-ASM-024, TEST-ASM-048.
 *
 * Inspection point: MockClaudeCliPort.optionsLog (parallel to queryLog).
 * The MockClaudeCliPort logs `(prompt, options)` per call so we can assert the
 * assembled preamble independently from the CCS-context-+-userText prompt body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent } from 'vue'
import ChatSidebar from '@/ui/components/chat/ChatSidebar.vue'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
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

const RouterLinkStub = defineComponent({
	props: ['to'],
	template: '<a :href="to" data-testid="chat-degraded-settings-link"><slot /></a>',
})

/**
 * Minimal valid workflow-state.md frontmatter parseable by
 * `parseWorkflowStateFrontmatter`. `loadWorkflowStateSnapshot` requires
 * non-empty `slug`, `status`, and either `current_stage` or `currentStep`.
 */
function workflowState({ slug, stage, status = 'in-progress' }: {
	slug: string
	stage: string
	status?: string
}): string {
	return [
		'---',
		`id: 01HX${slug.toUpperCase()}`,
		`slug: ${slug}`,
		`feature: "${slug}"`,
		'area: "XX"',
		`status: ${status}`,
		'currentStep: 4',
		`current_stage: ${stage}`,
		'last_updated: 2026-05-14',
		'last_agent: ""',
		'---',
		'',
	].join('\n')
}

function makeBridge(
	files: Record<string, string>,
	settings: Partial<PluginSettings>,
): MockBridge {
	const bridge = new MockBridge(files)
	const merged: PluginSettings = {
		...DEFAULT_SETTINGS,
		...settings,
	}
	vi.spyOn(bridge, 'getSettings').mockResolvedValue(merged)
	return bridge
}

async function mountSidebar(args: {
	files?: Record<string, string>
	settings?: Partial<PluginSettings>
	activeFile?: { path: string; basename: string; extension: string } | null
	cannedResponse?: string
}) {
	const pinia = createPinia()
	setActivePinia(pinia)

	const port = new MockClaudeCliPort()
	port.available = true
	port.cannedResponse = args.cannedResponse ?? 'ok'

	const bridge = makeBridge(args.files ?? {}, args.settings ?? {})
	if (args.activeFile !== undefined) bridge.setActiveFile(args.activeFile)

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
			},
		},
	})

	await flushPromises()
	const store = useChatStore(pinia)
	return { wrapper, port, bridge, po: new ChatSidebarPO(wrapper), store }
}

async function send(store: ReturnType<typeof useChatStore>, po: ChatSidebarPO, text: string) {
	store.setUserText(text)
	await flushPromises()
	await po.clickSend()
	await flushPromises()
}

describe('ChatSidebar — stage-aware system prompt wiring (T-ASM-040 / TEST-ASM-048)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('no active file → systemPromptSuffix is empty (REQ-ASM-014)', async () => {
		const { po, port, store } = await mountSidebar({
			activeFile: null,
		})
		await send(store, po, 'hello')

		expect(port.optionsLog).toHaveLength(1)
		expect(port.optionsLog[0]?.systemPromptSuffix).toBe('')
	})

	it('active file not under specsFolder → systemPromptSuffix is empty (REQ-ASM-014)', async () => {
		const { po, port, store } = await mountSidebar({
			activeFile: { path: 'notes/random.md', basename: 'random', extension: 'md' },
		})
		await send(store, po, 'hello')

		expect(port.optionsLog[0]?.systemPromptSuffix).toBe('')
	})

	it('active feature with valid workflow-state → suffix contains slug, stage display name, and description (REQ-ASM-013, REQ-ASM-018, TEST-ASM-020)', async () => {
		const slug = 'demo-feature'
		const { po, port, store } = await mountSidebar({
			files: {
				[`specs/${slug}/workflow-state.md`]: workflowState({ slug, stage: 'design' }),
			},
			activeFile: { path: `specs/${slug}/design.md`, basename: 'design', extension: 'md' },
		})
		await send(store, po, 'help me')

		const suffix = port.optionsLog[0]?.systemPromptSuffix ?? ''
		expect(suffix).toContain(slug)
		expect(suffix).toContain('Design')
		expect(suffix).toContain('architectural and UX design')
	})

	it('unknown stage → systemPromptSuffix falls back to empty (REQ-ASM-015)', async () => {
		const slug = 'odd-feature'
		const { po, port, store } = await mountSidebar({
			files: {
				[`specs/${slug}/workflow-state.md`]: workflowState({
					slug,
					stage: 'not-a-real-stage',
				}),
			},
			activeFile: { path: `specs/${slug}/idea.md`, basename: 'idea', extension: 'md' },
		})
		await send(store, po, 'hi')

		expect(port.optionsLog[0]?.systemPromptSuffix).toBe('')
	})

	it('vault read error → falls back to empty suffix; send still completes (REQ-ASM-015, NFR-ASM)', async () => {
		const slug = 'missing-feature'
		const { po, port, bridge, store } = await mountSidebar({
			activeFile: { path: `specs/${slug}/idea.md`, basename: 'idea', extension: 'md' },
		})
		// No file seeded → readFile rejects. loadWorkflowStateSnapshot must catch + warn + return null.
		const warnSpy = vi.spyOn(bridge, 'warn')

		await send(store, po, 'hi')

		expect(port.queryLog).toHaveLength(1)
		expect(port.optionsLog[0]?.systemPromptSuffix).toBe('')
		expect(warnSpy).toHaveBeenCalled()
	})

	it('malformed workflow-state → falls back to empty suffix; send still completes (REQ-ASM-015)', async () => {
		const slug = 'bad-feature'
		const { po, port, store } = await mountSidebar({
			files: {
				[`specs/${slug}/workflow-state.md`]: '---\nnot: valid\n---\n',
			},
			activeFile: { path: `specs/${slug}/idea.md`, basename: 'idea', extension: 'md' },
		})
		await send(store, po, 'hi')

		expect(port.queryLog).toHaveLength(1)
		expect(port.optionsLog[0]?.systemPromptSuffix).toBe('')
	})

	it('concatenation order: stage preamble lives in systemPromptSuffix, CCS preamble + userText live in prompt (REQ-ASM-054, TEST-ASM-048)', async () => {
		const slug = 'order-feature'
		const fileBody = 'CONTEXT_FILE_BODY_TOKEN'
		const userText = 'USER_TEXT_TOKEN'
		const { po, port, bridge, store } = await mountSidebar({
			files: {
				[`specs/${slug}/workflow-state.md`]: workflowState({ slug, stage: 'spec' }),
				[`specs/${slug}/spec.md`]: fileBody,
			},
		})
		// Active file is the spec.md → also auto-included as context file
		bridge.setActiveFile({ path: `specs/${slug}/spec.md`, basename: 'spec', extension: 'md' })
		await flushPromises()

		await send(store, po, userText)

		const sentPrompt = port.queryLog[0]
		const suffix = port.optionsLog[0]?.systemPromptSuffix ?? ''

		// Stage preamble references the slug + display name; never bleeds into prompt body.
		expect(suffix).toContain(slug)
		expect(suffix).toContain('Specification')
		expect(suffix).not.toContain(userText)
		expect(suffix).not.toContain(fileBody)

		// Prompt body: CCS preamble + file body precede the user text.
		const preambleIdx = sentPrompt.indexOf('The following files are provided for context:')
		const fileIdx = sentPrompt.indexOf(fileBody)
		const userIdx = sentPrompt.indexOf(userText)
		expect(preambleIdx).toBeGreaterThanOrEqual(0)
		expect(fileIdx).toBeGreaterThan(preambleIdx)
		expect(userIdx).toBeGreaterThan(fileIdx)
	})

	it('stage advance between two sends produces two distinct preambles (REQ-ASM-019, TEST-ASM-024)', async () => {
		const slug = 'advancing-feature'
		const ideaContent = workflowState({ slug, stage: 'idea' })
		const designContent = workflowState({ slug, stage: 'design' })

		const { po, port, bridge, store } = await mountSidebar({
			files: {
				[`specs/${slug}/workflow-state.md`]: ideaContent,
			},
			activeFile: { path: `specs/${slug}/idea.md`, basename: 'idea', extension: 'md' },
		})

		await send(store, po, 'first send')
		const first = port.optionsLog[0]?.systemPromptSuffix ?? ''
		expect(first).toContain('Idea')

		// Simulate stage advance: rewrite workflow-state.md in the in-memory vault.
		await bridge.writeFile(`specs/${slug}/workflow-state.md`, designContent)

		await send(store, po, 'second send')
		const second = port.optionsLog[1]?.systemPromptSuffix ?? ''
		expect(second).toContain('Design')
		expect(second).not.toBe(first)
	})

	it('honours non-default specsFolder from settings (REQ-ASM-011)', async () => {
		const slug = 'alt-folder-feature'
		const { po, port, store } = await mountSidebar({
			settings: { specsFolder: 'features' },
			files: {
				[`features/${slug}/workflow-state.md`]: workflowState({ slug, stage: 'requirements' }),
			},
			activeFile: {
				path: `features/${slug}/requirements.md`,
				basename: 'requirements',
				extension: 'md',
			},
		})
		await send(store, po, 'hi')

		const suffix = port.optionsLog[0]?.systemPromptSuffix ?? ''
		expect(suffix).toContain(slug)
		expect(suffix).toContain('Requirements')
	})
})
