/**
 * Tests for `useApprovalRulesStore().findMatching()` — WS-9 / T-MPS-132.
 *
 * Satisfies REQ-MPS-046 (persistent per-(provider, tool, scope) approvals).
 * `findMatching` semantics per SPEC-MPS-001 §7.5:
 *   - exact `(providerId, tool)` match;
 *   - `scope` matches via glob (`*` and `**`) for non-Bash tools;
 *   - Bash tool: `scope` is interpreted as a command-name prefix
 *     (e.g. `git` matches `git status`, `git push`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useApprovalRulesStore } from '@/ui/stores/approvalRulesStore';

describe('useApprovalRulesStore().findMatching()', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('exact match on (provider, tool, scope)', () => {
		it('returns the rule when provider, tool, and scope match exactly', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/foo.ts' });
			const match = store.findMatching('claude', 'Write', 'src/foo.ts');
			expect(match).toBeDefined();
			expect(match?.scope).toBe('src/foo.ts');
		});

		it('returns undefined when provider differs', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/foo.ts' });
			expect(store.findMatching('cursor', 'Write', 'src/foo.ts')).toBeUndefined();
		});

		it('returns undefined when tool differs', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/foo.ts' });
			expect(store.findMatching('claude', 'Edit', 'src/foo.ts')).toBeUndefined();
		});
	});

	describe('glob match on `scope` for non-Bash tools', () => {
		it('`*` matches a single path segment', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/*.ts' });
			expect(store.findMatching('claude', 'Write', 'src/foo.ts')).toBeDefined();
			// `*` does not cross path separators.
			expect(store.findMatching('claude', 'Write', 'src/sub/foo.ts')).toBeUndefined();
		});

		it('`**` matches across path separators', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Edit', scope: 'src/**/*.ts' });
			expect(store.findMatching('claude', 'Edit', 'src/foo.ts')).toBeDefined();
			expect(store.findMatching('claude', 'Edit', 'src/a/b/c.ts')).toBeDefined();
		});

		it('non-matching glob returns undefined', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/*.ts' });
			expect(store.findMatching('claude', 'Write', 'tests/foo.ts')).toBeUndefined();
		});

		it('escapes regex metacharacters that are NOT glob wildcards', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'a.b.c' });
			// The dots must be literal, not wildcards.
			expect(store.findMatching('claude', 'Write', 'a.b.c')).toBeDefined();
			expect(store.findMatching('claude', 'Write', 'aXbXc')).toBeUndefined();
		});
	});

	describe('Bash tool: scope is a command-name prefix', () => {
		it('`git` rule matches `git status`', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'git status')).toBeDefined();
		});

		it('`git` rule matches `git push --force`', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'git push --force')).toBeDefined();
		});

		it('`git` rule matches a bare `git` command', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'git')).toBeDefined();
		});

		it('`git` rule does NOT match `github-cli status` (prefix must be a whole command name)', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'github-cli status')).toBeUndefined();
		});

		it('`git` rule does NOT match unrelated tools', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'rm -rf /')).toBeUndefined();
		});
	});

	describe('multiple rules', () => {
		it('returns the first matching rule', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/*.ts' });
			store.addRule({ providerId: 'claude', tool: 'Write', scope: 'src/foo.ts' });
			const match = store.findMatching('claude', 'Write', 'src/foo.ts');
			expect(match).toBeDefined();
		});

		it('returns undefined when no rule matches', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			store.addRule({ providerId: 'cursor', tool: 'Write', scope: 'src/*.ts' });
			expect(store.findMatching('claude', 'Edit', 'src/foo.ts')).toBeUndefined();
		});
	});

	describe('removeRule', () => {
		it('removes a rule by id', () => {
			const store = useApprovalRulesStore();
			const rule = store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			expect(store.findMatching('claude', 'Bash', 'git status')).toBeDefined();
			store.removeRule(rule.id);
			expect(store.findMatching('claude', 'Bash', 'git status')).toBeUndefined();
		});

		it('is a no-op for unknown ids', () => {
			const store = useApprovalRulesStore();
			store.addRule({ providerId: 'claude', tool: 'Bash', scope: 'git' });
			store.removeRule('nonexistent');
			expect(store.rules.length).toBe(1);
		});
	});
});
