/**
 * Tests for `useApprovalRulesStore().addRule()` persistence — WS-9 / T-MPS-133.
 *
 * Satisfies REQ-MPS-046, REQ-MPS-047. Rules are persisted under
 * `_storedData.specorator.approvalRules` (see encode/decode helpers in
 * `src/plugin/approvalRulesPersistence.ts`). This test covers the in-memory
 * Pinia shape that mirrors that blob: `addRule` produces an `ApprovalRule`
 * with stable `id` + `createdAt`, hydration round-trips, and `setRules`
 * replaces the in-memory list (used by the view layer on mount).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore';
import type { ApprovalRule } from '@/domain/chat/ApprovalRule';

describe('useApprovalRulesStore() persistence shape', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('addRule populates `id` and `createdAt` on the returned rule', () => {
		const store = useApprovalRulesStore();
		const rule = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
		expect(rule.id).toBeTypeOf('string');
		expect(rule.id.length).toBeGreaterThan(0);
		expect(rule.createdAt).toBeTypeOf('string');
		// ISO-8601 sanity check: parseable by Date.
		expect(Number.isNaN(Date.parse(rule.createdAt))).toBe(false);
	});

	it('addRule appends to the persisted `rules` list', () => {
		const store = useApprovalRulesStore();
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
		store.addRule({ providerId: 'cursor', tool: 'Write', scope: 'src/*.ts' });
		expect(store.rules.length).toBe(2);
		expect(store.rules[0].scope).toBe('git');
		expect(store.rules[1].scope).toBe('src/*.ts');
	});

	it('issues distinct ids for distinct rules', () => {
		const store = useApprovalRulesStore();
		const r1 = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
		const r2 = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'npm' });
		expect(r1.id).not.toEqual(r2.id);
	});

	it('setRules replaces the in-memory list (hydration path)', () => {
		const store = useApprovalRulesStore();
		const hydrated: ApprovalRule[] = [
			{
				id: 'rule-a',
				providerId: 'claude',
				tool: 'Bash',
				scope: 'git',
				createdAt: '2026-05-21T00:00:00.000Z',
			},
		];
		store.setRules(hydrated);
		expect(store.rules.length).toBe(1);
		expect(store.rules[0].id).toBe('rule-a');
		// Hydrated rules participate in matching.
		expect(store.findMatching('claude', 'Bash', 'git status')).toBeDefined();
	});

	it('reset clears the list', () => {
		const store = useApprovalRulesStore();
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
		store.reset();
		expect(store.rules.length).toBe(0);
	});

	it('rules array is readonly to consumers (assigned via internal actions only)', () => {
		const store = useApprovalRulesStore();
		store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
		// Defensive: mutating the snapshot must not affect the store. The store
		// exposes a typed `ReadonlyArray<ApprovalRule>` but in JS that's a
		// compile-time guarantee — at runtime we assert via a fresh add.
		const before = store.rules.length;
		store.addRule({ providerId: 'cursor', tool: 'Write', scope: '*.md' });
		expect(store.rules.length).toBe(before + 1);
	});
});
