/**
 * T-AS-024 (RED) — `ApprovalRuleRow.vue` (TEST-AS-041/042/051 A legs).
 *
 * SPEC-AS-014, REQ-AS-041/042/050/051. One rule row shows tool · `actionPattern ?? '*'`
 * · the localised decision (`agent.chat.approvals.decision.allow|deny`) · lifetime
 * (`agent.chat.approvals.lifetime.session|persisted`), each as TEXT (not colour-alone,
 * NFR-AS-013). A **persisted** rule carries a focusable remove button with an accessible
 * name (`agent.chat.approvals.remove`) emitting `remove(rule.id)` on click; a **session**
 * rule has no remove control. Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalRuleRow from '@/ui/chat/approvals/ApprovalRuleRow.vue';
import { i18n } from '@/ui/i18n';
import type { ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';
import { ApprovalRuleRowPageObject } from './ApprovalRuleRow.po';

function mountRow(rule: ApprovalRule) {
	const wrapper = mount(ApprovalRuleRow, {
		props: { rule },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ApprovalRuleRowPageObject(wrapper) };
}

const persistedRule: ApprovalRule = {
	id: 'rule-1',
	toolName: 'Bash',
	actionPattern: 'git *',
	decision: 'allow',
	lifetime: 'persisted',
	createdAt: 1,
};

const sessionRule: ApprovalRule = {
	id: 'session-rule-1',
	toolName: 'Write',
	decision: 'deny',
	lifetime: 'session',
	createdAt: 2,
};

describe('ApprovalRuleRow (SPEC-AS-014)', () => {
	it('renders tool, pattern, decision and lifetime as text (TEST-AS-041)', () => {
		const { po } = mountRow(persistedRule);
		const text = po.text();
		expect(text).toContain('Bash');
		expect(text).toContain('git *');
		expect(text).toContain('allow');
		expect(text).toContain('persisted');
	});

	it('renders the match-all pattern as * when actionPattern is absent (TEST-AS-041)', () => {
		const { po } = mountRow(sessionRule);
		expect(po.text()).toContain('*');
		expect(po.text()).toContain('Write');
		expect(po.text()).toContain('deny');
		expect(po.text()).toContain('session');
	});

	it('a persisted rule carries a focusable remove button emitting remove(id) (TEST-AS-042/051)', async () => {
		const { wrapper, po } = mountRow(persistedRule);
		expect(po.hasRemove()).toBe(true);
		expect(po.removeAriaLabel().length).toBeGreaterThan(0);
		await po.clickRemove();
		expect(wrapper.emitted('remove')?.[0]).toEqual(['rule-1']);
	});

	it('a session rule has no remove control (TEST-AS-042)', () => {
		const { po } = mountRow(sessionRule);
		expect(po.hasRemove()).toBe(false);
	});
});
