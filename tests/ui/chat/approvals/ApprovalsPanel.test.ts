/**
 * T-AS-024 (RED) — `ApprovalsPanel.vue` (TEST-AS-040/041/042/043/050/051 A legs).
 *
 * SPEC-AS-013, REQ-AS-040/041/042/043/050/051. The minimal status/approvals surface:
 * shows the active mode (`agent.chat.approvals.mode` "Mode: {mode}") under a localised
 * title, renders one `ApprovalRuleRow` per `rules` entry, re-emits each row's `remove`
 * up, shows `agent.chat.approvals.empty` when `rules` is empty, and re-renders on
 * `mode`/`rules` change (live). Queried by `data-testid` only (ADR-009).
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ApprovalsPanel from '@/ui/chat/approvals/ApprovalsPanel.vue';
import { i18n } from '@/ui/i18n';
import type { ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';
import type { PermissionMode } from '@/domain/chat/PermissionMode';
import { ApprovalsPanelPageObject } from './ApprovalsPanel.po';

const RULES: readonly ApprovalRule[] = [
	{ id: 'r1', toolName: 'Bash', actionPattern: 'git *', decision: 'allow', lifetime: 'persisted', createdAt: 1 },
	{ id: 'r2', toolName: 'Write', decision: 'deny', lifetime: 'session', createdAt: 2 },
];

function mountPanel(mode: PermissionMode, rules: readonly ApprovalRule[]) {
	const wrapper = mount(ApprovalsPanel, {
		props: { mode, rules },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ApprovalsPanelPageObject(wrapper) };
}

describe('ApprovalsPanel (SPEC-AS-013)', () => {
	it('shows the active mode (TEST-AS-040)', () => {
		const { po } = mountPanel('yolo', RULES);
		expect(po.exists()).toBe(true);
		expect(po.modeText()).toContain('yolo');
	});

	it('renders one rule row per rule (TEST-AS-041)', () => {
		const { po } = mountPanel('normal', RULES);
		expect(po.ruleCount()).toBe(2);
		expect(po.emptyShown()).toBe(false);
	});

	it('shows the empty notice when there are no rules (TEST-AS-041)', () => {
		const { po } = mountPanel('normal', []);
		expect(po.emptyShown()).toBe(true);
		expect(po.ruleCount()).toBe(0);
	});

	it('re-emits a row remove(id) up to the surface (TEST-AS-042)', async () => {
		const { wrapper, po } = mountPanel('normal', RULES);
		await po.clickRemoveAt(0); // only the persisted rule carries a remove control
		expect(wrapper.emitted('remove')?.[0]).toEqual(['r1']);
	});

	it('re-renders live on a rules/mode prop change (TEST-AS-043)', async () => {
		const { wrapper, po } = mountPanel('normal', RULES);
		expect(po.ruleCount()).toBe(2);
		await wrapper.setProps({ mode: 'plan', rules: [] });
		expect(po.ruleCount()).toBe(0);
		expect(po.emptyShown()).toBe(true);
		expect(po.modeText()).toContain('plan');
	});
});
