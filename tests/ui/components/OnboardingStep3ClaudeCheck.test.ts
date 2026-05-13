import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import OnboardingStep3ClaudeCheck from '@/ui/components/OnboardingStep3ClaudeCheck.vue'
import { CLAUDE_CLI_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { OnboardingStep3ClaudeCheckPO } from './OnboardingStep3ClaudeCheck.po'
import type { ClaudeCliPort } from '@/domain/ports'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function makePort(available: boolean | 'throw'): ClaudeCliPort {
	return {
		isAvailable: available === 'throw'
			? vi.fn().mockRejectedValue(new Error('boom'))
			: vi.fn().mockResolvedValue(available),
	}
}

describe('OnboardingStep3ClaudeCheck', () => {
	function mountComponent(port?: ClaudeCliPort) {
		const provide: Record<symbol, unknown> = {
			[LOGGER_PORT as symbol]: mockLogger,
		}
		if (port !== undefined) {
			provide[CLAUDE_CLI_PORT as symbol] = port
		}
		const wrapper = mount(OnboardingStep3ClaudeCheck, {
			global: { plugins: [createTestingPinia()], provide },
		})
		return { wrapper, po: new OnboardingStep3ClaudeCheckPO(wrapper) }
	}

	it('shows checking state initially', () => {
		const { po } = mountComponent(makePort(true))
		expect(po.statusMessage.text()).toContain('Checking')
		expect(po.continueBtn.exists()).toBe(false)
	})

	it('shows ready state when CLI is available', async () => {
		const { po } = mountComponent(makePort(true))
		await flushPromises()
		expect(po.statusMessage.text()).toContain('ready')
		expect(po.continueBtn.exists()).toBe(true)
	})

	it('shows not-ready state when CLI is unavailable', async () => {
		const { po } = mountComponent(makePort(false))
		await flushPromises()
		expect(po.statusMessage.text()).toContain('Claude installed')
	})

	it('shows unknown state when port is not provided', async () => {
		const { po } = mountComponent(undefined)
		await flushPromises()
		expect(po.statusMessage.text()).toContain("couldn't check")
	})

	it('shows unknown state when port throws', async () => {
		const { po } = mountComponent(makePort('throw'))
		await flushPromises()
		expect(po.statusMessage.text()).toContain("couldn't check")
	})

	it('emits next with claudeStatus when continue clicked', async () => {
		const { wrapper, po } = mountComponent(makePort(true))
		await flushPromises()
		await po.clickContinue()
		expect(wrapper.emitted('next')?.[0]).toEqual([{ claudeStatus: 'ready' }])
	})
})
