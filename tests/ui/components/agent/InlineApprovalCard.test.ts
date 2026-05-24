/**
 * Tests for `InlineApprovalCard.vue` — Claudian-parity tabbed approval
 * widget (WS-AUX-8a). Additive to `ApprovalCard.vue`; MessageList swap-in
 * is WS-8b.
 *
 * Six tests:
 *   1. Title rendered from approval.description.
 *   2. Three buttons in order Deny / Allow once / Allow always.
 *   3. Deny click emits `deny`.
 *   4. Allow once click emits `allow-once`.
 *   5. Allow always click emits `allow-always`.
 *   6. Escape on the card emits `deny`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import InlineApprovalCard from '@/ui/components/agent/InlineApprovalCard.vue'
import { i18n } from '@/ui/i18n'
import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort'
import type { LoggerPort } from '@/domain/ports'
import { ICON_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { InlineApprovalCardPO } from './InlineApprovalCard.po'

function fakeLogger(): LoggerPort {
	return { debug() {}, info() {}, warn() {}, error() {} }
}

function mountCard(
	overrides: Partial<{
		request: ChatTransportApprovalRequest
		providerId: 'claude' | 'cursor'
	}> = {},
) {
	const request: ChatTransportApprovalRequest = overrides.request ?? {
		tool: 'Bash',
		scope: 'git status',
		previewText: '$ git status',
	}
	const bridge = new MockBridge()
	return mount(InlineApprovalCard, {
		global: {
			plugins: [i18n],
			provide: {
				[ICON_PORT as symbol]: bridge,
				[LOGGER_PORT as symbol]: fakeLogger(),
			},
		},
		 
		attachTo: document.body,
		props: {
			request,
			providerId: overrides.providerId ?? 'claude',
		},
	})
}

describe('InlineApprovalCard.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('renders the title derived from the approval request', () => {
		const po = new InlineApprovalCardPO(mountCard())
		expect(po.title().exists()).toBe(true)
		expect(po.title().text()).toContain('Bash')
	})

	it('renders Deny, Allow once, Allow always buttons in that DOM order', () => {
		const po = new InlineApprovalCardPO(mountCard())
		const buttons = po.actionsRow().findAll('[data-testid^="inline-approval-"]')
		const ids = buttons.map((b) => b.attributes('data-testid'))
		expect(ids).toEqual([
			'inline-approval-deny',
			'inline-approval-allow-once',
			'inline-approval-allow-always',
		])
	})

	it('Deny click emits the `deny` event', async () => {
		const po = new InlineApprovalCardPO(mountCard())
		await po.clickDeny()
		expect(po.wrapper.emitted('deny')).toBeDefined()
		expect(po.wrapper.emitted('deny')).toHaveLength(1)
	})

	it('Allow once click emits the `allow-once` event', async () => {
		const po = new InlineApprovalCardPO(mountCard())
		await po.clickAllowOnce()
		expect(po.wrapper.emitted('allow-once')).toBeDefined()
		expect(po.wrapper.emitted('allow-once')).toHaveLength(1)
	})

	it('Allow always click emits the `allow-always` event', async () => {
		const po = new InlineApprovalCardPO(mountCard())
		await po.clickAllowAlways()
		expect(po.wrapper.emitted('allow-always')).toBeDefined()
		expect(po.wrapper.emitted('allow-always')).toHaveLength(1)
	})

	it('Escape on the card root emits a `deny` event', async () => {
		const po = new InlineApprovalCardPO(mountCard())
		await po.root.trigger('keydown', { key: 'Escape' })
		expect(po.wrapper.emitted('deny')).toBeDefined()
		expect(po.wrapper.emitted('deny')).toHaveLength(1)
	})
})
