/**
 * Tests for `ApprovalRulesList.vue` — the Approvals section rendered by
 * `SpecoratorSettingTab` in the Obsidian settings pane (WS-9, T-MPS-140,
 * REQ-MPS-047, TST-MPS-31).
 *
 * Mounted as a standalone Vue island inside the settings tab. The component
 * reads `useApprovalRulesStore().rules` and emits a `remove` event with the
 * `ruleId`; the settings tab translates that into a host-side persistence
 * call.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ApprovalRulesList from '@/ui/components/settings/ApprovalRulesList.vue'
import { i18n } from '@/ui/i18n'
import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore'

function mountList() {
	return mount(ApprovalRulesList, {
		global: { plugins: [i18n] },
		 
		attachTo: document.body,
	})
}

describe('ApprovalRulesList.vue (T-MPS-140, REQ-MPS-047)', () => {
	beforeEach(() => {
		setActivePinia(createPinia())
	})

	it('renders the empty-state message when no rules exist', () => {
		const w = mountList()
		expect(w.find('[data-testid="approval-rules-list"]').exists()).toBe(true)
		expect(w.find('[data-testid="approval-rules-empty"]').exists()).toBe(true)
		expect(w.findAll('[data-testid^="approval-rule-row-"]').length).toBe(0)
	})

	it('renders one row per saved rule with the (provider, tool, scope) triple', () => {
		const store = useApprovalRulesStore()
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		store.addRule({ providerId: 'cursor', tool: 'Write', scope: 'src/*.ts' })
		const w = mountList()
		const rows = w.findAll('[data-testid^="approval-rule-row-"]')
		expect(rows.length).toBe(2)
		expect(rows[0].text()).toContain('claude')
		expect(rows[0].text()).toContain('Bash')
		expect(rows[0].text()).toContain('git')
		expect(rows[1].text()).toContain('cursor')
		expect(rows[1].text()).toContain('src/*.ts')
	})

	it('hides the empty-state once at least one rule exists', () => {
		const store = useApprovalRulesStore()
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		const w = mountList()
		expect(w.find('[data-testid="approval-rules-empty"]').exists()).toBe(false)
	})

	it('clicking the Remove button removes the rule from the store', async () => {
		const store = useApprovalRulesStore()
		const a = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/foo.ts' })
		const w = mountList()
		await w.find(`[data-testid="approval-rule-remove-${a.id}"]`).trigger('click')
		expect(store.rules.length).toBe(1)
		expect(store.rules.find((r) => r.id === a.id)).toBeUndefined()
	})

	it('emits a `remove` event with the rule id when the user clicks Remove (host persistence hook)', async () => {
		const store = useApprovalRulesStore()
		const rule = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		const w = mountList()
		await w.find(`[data-testid="approval-rule-remove-${rule.id}"]`).trigger('click')
		expect(w.emitted('remove')?.[0]).toEqual([rule.id])
	})

	it('the remove button is keyboard-accessible (real <button>, type=button)', () => {
		const store = useApprovalRulesStore()
		const rule = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		const w = mountList()
		const btn = w.find(`[data-testid="approval-rule-remove-${rule.id}"]`)
		expect(btn.element.tagName).toBe('BUTTON')
		expect(btn.attributes('type')).toBe('button')
	})

	it('TST-MPS-31: lists rules in insertion order so the most recent appear at the bottom', () => {
		const store = useApprovalRulesStore()
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' })
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'npm' })
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'docker' })
		const w = mountList()
		const rows = w.findAll('[data-testid^="approval-rule-row-"]')
		expect(rows[0].text()).toContain('git')
		expect(rows[1].text()).toContain('npm')
		expect(rows[2].text()).toContain('docker')
	})
})
