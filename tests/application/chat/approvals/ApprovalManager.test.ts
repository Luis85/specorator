/**
 * TEST-AS-003/004/020/021/023/025/030/031/032/033/052/054 — the `ApprovalManager`
 * decision-flow use case (SPEC-AS-010/023/027/028).
 *
 * Drives the full matrix over the scriptable `MockApprovalRuleStore` + a scripted
 * `PermissionMode`:
 *  - `decide(action, mode)` is mode-gate-FIRST — `yolo` → `ok('allow')` with NO rule
 *    lookup (EC-AS-3); `plan` → `ok('prompt')` (the surface routes edits to the P4
 *    exit-plan gate, the manager defers); `normal`/absent → load → match;
 *  - load `store.loadRules()` is awaited; on `err` → log (no rule content) + a
 *    non-blocking notice + `ok('prompt')` — NEVER auto-allow (EC-AS-6, fail-safe);
 *  - match over persisted ∪ session via `matchesRulePattern`: any matching `deny` →
 *    `ok('deny')` (deny-wins, EC-AS-5/11), else any matching `allow` → `ok('allow')`
 *    (EC-AS-20), else `ok('prompt')` (no match → the P4 block, EC-AS-1);
 *  - `applyDecision(action, decision)` — `'allow'`/`'deny'` → in-memory SESSION rule
 *    keyed by `ruleDedupeKey`; `'allow-always'`/`'deny-always'` → `store.addRule(...)`
 *    (the `{`-leading JSON-fallback pattern stored WITHOUT `actionPattern`, EC-AS-16);
 *    `null` → no rule (cancel, EC-AS-12); a persist `err` surfaces the notice but the
 *    returned decision still stands;
 *  - `listRules()` returns persisted ∪ session, `Result`-typed;
 *  - the manager reads `mode` + the matcher with ZERO `if (providerId === 'claude')`
 *    branch and NEVER throws across the boundary.
 *
 * Traces: TEST-AS-003/004/020/021/023/025/030/031/032/033/052/054, SPEC-AS-010/023/027/028,
 * REQ-AS-004/005/020..025/030/031/052/054, NFR-AS-004/009, EC-AS-1/3/5/6/10/11/12/16/20.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalManager } from '@/application/chat/approvals/ApprovalManager';
import type { ApprovalAction } from '@/application/chat/approvals/ApprovalManager';
import { FeedbackService } from '@/application/shared/FeedbackService';
import { MockApprovalRuleStore } from '@/infrastructure/mock/MockApprovalRuleStore';
import type { ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';
import type { LoggerPort, NotificationPort } from '@/domain/ports';
import { isOk } from '@/domain/shared/Result';

const STORE_ERROR = 'Could not read your approval rules — asking for this action.';

function makeLogger(): LoggerPort {
	return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeNotify(): NotificationPort {
	return {
		showError: vi.fn(),
		showWarning: vi.fn(),
		showSuccess: vi.fn(),
		showInfo: vi.fn(),
	};
}

function persistedRule(
	partial: Pick<ApprovalRule, 'toolName' | 'decision'> &
		Partial<Pick<ApprovalRule, 'actionPattern' | 'id' | 'createdAt'>>,
): ApprovalRule {
	return {
		id: partial.id ?? `seed-${partial.toolName}-${partial.decision}-${partial.actionPattern ?? '*'}`,
		toolName: partial.toolName,
		actionPattern: partial.actionPattern,
		decision: partial.decision,
		lifetime: 'persisted',
		createdAt: partial.createdAt ?? 1,
	};
}

describe('ApprovalManager', () => {
	let store: MockApprovalRuleStore;
	let logger: LoggerPort;
	let notify: NotificationPort;
	let feedback: FeedbackService;
	let manager: ApprovalManager;

	beforeEach(() => {
		store = new MockApprovalRuleStore();
		logger = makeLogger();
		notify = makeNotify();
		feedback = new FeedbackService(logger, notify);
		manager = new ApprovalManager(store, feedback, STORE_ERROR);
	});

	const bashGitStatus: ApprovalAction = { toolName: 'Bash', actionPattern: 'git status' };

	describe('decide — mode gate FIRST', () => {
		it('yolo → ok(allow) with NO rule lookup, even with a matching deny rule (TEST-AS-004, EC-AS-3)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'deny' })]);
			const loadSpy = vi.spyOn(store, 'loadRules');

			const result = await manager.decide(bashGitStatus, 'yolo');

			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('allow');
			expect(loadSpy).not.toHaveBeenCalled();
		});

		it('plan → ok(prompt): the manager defers, the surface routes edits to the P4 exit-plan gate', async () => {
			const loadSpy = vi.spyOn(store, 'loadRules');
			const result = await manager.decide(
				{ toolName: 'Edit', actionPattern: '/a/b.md' },
				'plan',
			);
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
			expect(loadSpy).not.toHaveBeenCalled();
		});

		it('normal → continues to load + match', async () => {
			const loadSpy = vi.spyOn(store, 'loadRules');
			await manager.decide(bashGitStatus, 'normal');
			expect(loadSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('decide — load + match (deny-wins)', () => {
		it('no rule + normal → ok(prompt) (TEST-AS-021, EC-AS-1)', async () => {
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
		});

		it('a matching persisted allow rule → ok(allow) (TEST-AS-020, EC-AS-20)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'allow' })]);
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('allow');
		});

		it('a matching persisted deny rule → ok(deny) (TEST-AS-021)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'deny' })]);
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('deny');
		});

		it('conflicting allow + deny match → deny-wins → ok(deny) (TEST-AS-023, EC-AS-5)', async () => {
			store.seedRules([
				persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'allow' }),
				persistedRule({ toolName: 'Bash', actionPattern: 'git status', decision: 'deny' }),
			]);
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('deny');
		});

		it('a rule for a DIFFERENT tool does not match → ok(prompt)', async () => {
			store.seedRules([persistedRule({ toolName: 'Write', actionPattern: '/a/b', decision: 'allow' })]);
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
		});

		it('a match-all (absent pattern) allow rule for the tool → ok(allow)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', decision: 'allow' })]);
			const result = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('allow');
		});

		it('bash "git *" does NOT match "github" → ok(prompt) (EC-AS-7)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'allow' })]);
			const result = await manager.decide({ toolName: 'Bash', actionPattern: 'github' }, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
		});

		it('file rule "/a/b" does NOT match "/a/bc.md" → ok(prompt) (EC-AS-8)', async () => {
			store.seedRules([persistedRule({ toolName: 'Write', actionPattern: '/a/b', decision: 'allow' })]);
			const result = await manager.decide({ toolName: 'Write', actionPattern: '/a/bc.md' }, 'normal');
			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
		});
	});

	describe('decide — fail-safe-to-prompt', () => {
		it('store loadRules err → ok(prompt) + a non-blocking notice, never auto-allows (TEST-AS-054, EC-AS-6)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git *', decision: 'allow' })]);
			store.setFailMode('load');

			const result = await manager.decide(bashGitStatus, 'normal');

			expect(isOk(result)).toBe(true);
			if (isOk(result)) expect(result.value).toBe('prompt');
			expect(notify.showInfo).toHaveBeenCalledWith(STORE_ERROR);
		});

		it('logs the load failure but NOT any rule content', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'secret-token', decision: 'allow' })]);
			store.setFailMode('load');

			await manager.decide(bashGitStatus, 'normal');

			const logged = JSON.stringify((logger.error as ReturnType<typeof vi.fn>).mock.calls);
			expect(logged).not.toContain('secret-token');
		});

		it('never throws across the boundary even on a forced store fault', async () => {
			store.setFailMode('load');
			await expect(manager.decide(bashGitStatus, 'normal')).resolves.toBeDefined();
		});
	});

	describe('applyDecision', () => {
		it('allow → upserts an in-memory SESSION rule that the next decide auto-allows (TEST-AS-031)', async () => {
			const applied = await manager.applyDecision(bashGitStatus, 'allow');
			expect(isOk(applied)).toBe(true);
			if (isOk(applied)) expect(applied.value).toBe('allow');

			// session rule lives in manager memory — the store is untouched
			const stored = await store.loadRules();
			expect(isOk(stored)).toBe(true);
			if (isOk(stored)) expect(stored.value).toHaveLength(0);

			const next = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(next)).toBe(true);
			if (isOk(next)) expect(next.value).toBe('allow');
		});

		it('deny → a session deny rule the next decide auto-denies', async () => {
			await manager.applyDecision(bashGitStatus, 'deny');
			const next = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(next)).toBe(true);
			if (isOk(next)) expect(next.value).toBe('deny');
		});

		it('allow-always → persists a rule via store.addRule (TEST-AS-030)', async () => {
			const addSpy = vi.spyOn(store, 'addRule');
			const applied = await manager.applyDecision(bashGitStatus, 'allow-always');
			expect(isOk(applied)).toBe(true);
			if (isOk(applied)) expect(applied.value).toBe('allow');

			expect(addSpy).toHaveBeenCalledTimes(1);
			expect(addSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					toolName: 'Bash',
					actionPattern: 'git status',
					decision: 'allow',
					lifetime: 'persisted',
				}),
			);
			const stored = await store.loadRules();
			if (isOk(stored)) expect(stored.value).toHaveLength(1);
		});

		it('deny-always → persists a deny rule via store.addRule', async () => {
			const applied = await manager.applyDecision(bashGitStatus, 'deny-always');
			expect(isOk(applied)).toBe(true);
			if (isOk(applied)) expect(applied.value).toBe('deny');
			const stored = await store.loadRules();
			if (isOk(stored)) {
				expect(stored.value).toHaveLength(1);
				expect(stored.value[0]?.decision).toBe('deny');
			}
		});

		it('duplicate allow-always for the same action dedupes → one rule (EC-AS-10)', async () => {
			await manager.applyDecision(bashGitStatus, 'allow-always');
			await manager.applyDecision(bashGitStatus, 'allow-always');
			const stored = await store.loadRules();
			if (isOk(stored)) expect(stored.value).toHaveLength(1);
		});

		it('a {-leading JSON-fallback action pattern is persisted WITHOUT actionPattern (EC-AS-16, NFR-AS-002)', async () => {
			const addSpy = vi.spyOn(store, 'addRule');
			const jsonAction: ApprovalAction = {
				toolName: 'SomeTool',
				actionPattern: '{"secret":"token"}',
			};
			await manager.applyDecision(jsonAction, 'allow-always');

			const arg = addSpy.mock.calls[0]?.[0];
			expect(arg?.actionPattern).toBeUndefined();
			expect(JSON.stringify(arg)).not.toContain('token');
		});

		it('null (cancel) → no rule persisted, no session rule (TEST-AS-025, EC-AS-12)', async () => {
			const addSpy = vi.spyOn(store, 'addRule');
			const applied = await manager.applyDecision(bashGitStatus, null);
			expect(isOk(applied)).toBe(true);
			if (isOk(applied)) expect(applied.value).toBeNull();
			expect(addSpy).not.toHaveBeenCalled();

			const next = await manager.decide(bashGitStatus, 'normal');
			if (isOk(next)) expect(next.value).toBe('prompt');
		});

		it('a persist err surfaces the notice but the returned decision still stands', async () => {
			store.setFailMode('save');
			const applied = await manager.applyDecision(bashGitStatus, 'allow-always');
			expect(isOk(applied)).toBe(true);
			if (isOk(applied)) expect(applied.value).toBe('allow');
			expect(notify.showInfo).toHaveBeenCalledWith(STORE_ERROR);
		});
	});

	describe('listRules', () => {
		it('returns persisted ∪ session rules (Result-typed)', async () => {
			store.seedRules([persistedRule({ toolName: 'Write', actionPattern: '/a/b', decision: 'allow' })]);
			await manager.applyDecision(bashGitStatus, 'allow');

			const listed = await manager.listRules();
			expect(isOk(listed)).toBe(true);
			if (isOk(listed)) {
				expect(listed.value).toHaveLength(2);
				const lifetimes = listed.value.map((r) => r.lifetime).sort();
				expect(lifetimes).toEqual(['persisted', 'session']);
			}
		});

		it('a store load err surfaces as err', async () => {
			store.setFailMode('load');
			const listed = await manager.listRules();
			expect(listed.ok).toBe(false);
		});
	});

	describe('session rules merge into decide alongside persisted', () => {
		it('a persisted allow + a session deny for the same action → deny-wins (EC-AS-11)', async () => {
			store.seedRules([persistedRule({ toolName: 'Bash', actionPattern: 'git status', decision: 'allow' })]);
			await manager.applyDecision(bashGitStatus, 'deny');
			const next = await manager.decide(bashGitStatus, 'normal');
			expect(isOk(next)).toBe(true);
			if (isOk(next)) expect(next.value).toBe('deny');
		});

		it('re-reads the store on every decide (no stale snapshot, EC-AS-20)', async () => {
			const loadSpy = vi.spyOn(store, 'loadRules');
			await manager.decide(bashGitStatus, 'normal');
			await manager.decide(bashGitStatus, 'normal');
			expect(loadSpy).toHaveBeenCalledTimes(2);
		});
	});
});
