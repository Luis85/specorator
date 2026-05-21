/**
 * Tests for `ApprovalCard.vue` — inline approval surface for
 * tool-permission requests (WS-9, T-MPS-135/136, REQ-MPS-045 / REQ-MPS-046,
 * TST-MPS-30).
 *
 * Three buttons; default focus on Deny (safer side per
 * SPEC-MPS-001 §8.4). Decisions emit `{ kind: 'deny' | 'allow-once' | 'always' }`.
 * "Always allow" additionally calls `approvalRulesStore.addRule` before
 * emitting.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ApprovalCard from '@/ui/components/agent/ApprovalCard.vue'
import { i18n } from '@/ui/i18n'
import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore'
import type { ChatTransportApprovalRequest } from '@/domain/ports/ChatTransportPort'
import { ApprovalCardPO } from './ApprovalCard.po'

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
	return mount(ApprovalCard, {
		global: { plugins: [i18n] },
		// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom has no Obsidian popout windows.
		attachTo: document.body,
		props: {
			request,
			providerId: overrides.providerId ?? 'claude',
		},
	})
}

describe('ApprovalCard.vue', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	describe('T-MPS-135 — renders three buttons + emits decisions', () => {
		it('renders the approval-card root with three action buttons', () => {
			const po = new ApprovalCardPO(mountCard())
			expect(po.root.exists()).toBe(true)
			expect(po.denyButton.exists()).toBe(true)
			expect(po.allowOnceButton.exists()).toBe(true)
			expect(po.alwaysAllowButton.exists()).toBe(true)
		})

		it('renders the preview text when present', () => {
			const po = new ApprovalCardPO(
				mountCard({
					request: {
						tool: 'Write',
						scope: 'src/foo.ts',
						previewText: 'export const FOO = 1',
					},
				}),
			)
			expect(po.previewBlock.exists()).toBe(true)
			expect(po.previewBlock.text()).toContain('export const FOO = 1')
		})

		it('omits the preview block when previewText is null', () => {
			const po = new ApprovalCardPO(
				mountCard({
					request: { tool: 'Bash', scope: 'ls', previewText: null },
				}),
			)
			expect(po.previewBlock.exists()).toBe(false)
		})

		it('Deny click emits decision { kind: "deny" }', async () => {
			const po = new ApprovalCardPO(mountCard())
			await po.clickDeny()
			expect(po.wrapper.emitted('decision')?.[0]).toEqual([{ kind: 'deny' }])
		})

		it('Allow once click emits decision { kind: "allow-once" }', async () => {
			const po = new ApprovalCardPO(mountCard())
			await po.clickAllowOnce()
			expect(po.wrapper.emitted('decision')?.[0]).toEqual([{ kind: 'allow-once' }])
		})

		it('decisions are idempotent — a second click is a no-op', async () => {
			const po = new ApprovalCardPO(mountCard())
			await po.clickDeny()
			await po.clickAllowOnce()
			expect(po.wrapper.emitted('decision')).toHaveLength(1)
		})

		it('focuses the Deny button on mount (safer default)', async () => {
			const w = mountCard()
			await nextTick()
			const denyEl = w.find('[data-testid="approval-action-deny"]').element as HTMLElement
			// eslint-disable-next-line obsidianmd/prefer-active-doc -- jsdom test runner has no Obsidian popout windows.
			expect(document.activeElement).toBe(denyEl)
			w.unmount()
		})

		it('Escape on the card emits a deny decision', async () => {
			const po = new ApprovalCardPO(mountCard())
			await po.root.trigger('keydown', { key: 'Escape' })
			expect(po.wrapper.emitted('decision')?.[0]).toEqual([{ kind: 'deny' }])
		})
	})

	describe('T-MPS-136 — "Always allow" persists a rule + emits always (TST-MPS-30)', () => {
		it('adds a matching rule to the approvalRulesStore', async () => {
			const store = useApprovalRulesStore()
			const po = new ApprovalCardPO(
				mountCard({
					request: { tool: 'Bash', scope: 'git status', previewText: null },
					providerId: 'claude',
				}),
			)
			await po.clickAlwaysAllow()
			expect(store.rules.length).toBe(1)
			expect(store.rules[0].providerId).toBe('claude')
			expect(store.rules[0].tool).toBe('Bash')
			expect(store.rules[0].scope).toBe('git status')
		})

		it('emits decision { kind: "always" } after persisting the rule', async () => {
			const po = new ApprovalCardPO(mountCard())
			await po.clickAlwaysAllow()
			expect(po.wrapper.emitted('decision')?.[0]).toEqual([{ kind: 'always' }])
		})

		it('a second matching request would be auto-resolvable via findMatching (TST-MPS-30)', async () => {
			const store = useApprovalRulesStore()
			const po = new ApprovalCardPO(
				mountCard({
					request: { tool: 'Bash', scope: 'git', previewText: null },
					providerId: 'claude',
				}),
			)
			await po.clickAlwaysAllow()
			// The store-level matcher now finds a rule for any `git`-prefixed command.
			expect(store.findMatching('claude', 'Bash', 'git status')).toBeDefined()
			expect(store.findMatching('claude', 'Bash', 'git push')).toBeDefined()
		})

		it('does NOT add a rule when the user clicks Allow once', async () => {
			const store = useApprovalRulesStore()
			const po = new ApprovalCardPO(mountCard())
			await po.clickAllowOnce()
			expect(store.rules.length).toBe(0)
		})

		it('does NOT add a rule when the user clicks Deny', async () => {
			const store = useApprovalRulesStore()
			const po = new ApprovalCardPO(mountCard())
			await po.clickDeny()
			expect(store.rules.length).toBe(0)
		})
	})
})
