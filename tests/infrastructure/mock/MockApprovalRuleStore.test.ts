/**
 * T-AS-013 (RED) — scriptable Mock `ApprovalRuleStorePort` (SPEC-AS-008, ADR-AS-001 §4).
 *
 * The scriptable in-memory array store the `ApprovalManager` + panel tests inject
 * instead of a real provider:
 *   - `seedRules(rules)` pre-populates persisted rules (drives the matched-allow/deny
 *     + reload tests TEST-AS-020/021/032);
 *   - `loadRules`/`addRule` (dedupe by `ruleDedupeKey`, open item #2 — a duplicate
 *     triple is a no-op `ok(existing)`, an opposite-decision triple is appended) /
 *     `removeRule` (idempotent) / `clear` operate on the in-memory array, all
 *     `Promise<Result<…>>`;
 *   - `setFailMode('load' | 'save' | 'none')` forces `loadRules`/`addRule` to return
 *     `Result.err` so the fail-safe-to-prompt test (TEST-AS-054) runs deterministically;
 *   - total — never throws across the boundary (NFR-AS-010).
 * Exposed on `MockBridge` via a `get approvalRuleStore` accessor mirroring `auxModel`.
 *
 * Fails until T-AS-014 supplies `@/infrastructure/mock/MockApprovalRuleStore` +
 * `MockBridge.approvalRuleStore`.
 *
 * Traces: TEST-AS-020/021/030/032/033/053 (Mock backing), TEST-AS-054 (fail-inject
 * backing), SPEC-AS-008, REQ-AS-020/021/032/053/054, NFR-AS-010.
 */
import { describe, it, expect } from 'vitest';
import { MockApprovalRuleStore } from '@/infrastructure/mock/MockApprovalRuleStore';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { ruleDedupeKey, type ApprovalRule } from '@/domain/chat/approvals/ApprovalRule';
import type { ApprovalRuleStorePort } from '@/domain/ports';

function persisted(
	toolName: string,
	decision: 'allow' | 'deny',
	actionPattern?: string,
): ApprovalRule {
	return {
		id: `seed-${ruleDedupeKey({ toolName, actionPattern, decision })}`,
		toolName,
		...(actionPattern !== undefined ? { actionPattern } : {}),
		decision,
		lifetime: 'persisted',
		createdAt: 1,
	};
}

describe('MockApprovalRuleStore (TEST-AS-053 Mock backing)', () => {
	it('is an ApprovalRuleStorePort with four Result-typed methods', () => {
		const store: ApprovalRuleStorePort = new MockApprovalRuleStore();
		expect(typeof store.loadRules).toBe('function');
		expect(typeof store.addRule).toBe('function');
		expect(typeof store.removeRule).toBe('function');
		expect(typeof store.clear).toBe('function');
	});

	it('loadRules defaults to ok([]) on a fresh store (TEST-AS-032)', async () => {
		const store = new MockApprovalRuleStore();
		const res = await store.loadRules();
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toEqual([]);
	});

	it('seedRules pre-populates persisted rules that loadRules returns (TEST-AS-020/021)', async () => {
		const store = new MockApprovalRuleStore();
		store.seedRules([persisted('Bash', 'allow', 'git *'), persisted('Write', 'deny', '/x')]);
		const res = await store.loadRules();
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.value.map((r) => r.toolName)).toEqual(['Bash', 'Write']);
			expect(res.value.map((r) => r.decision)).toEqual(['allow', 'deny']);
		}
	});

	it('addRule mints id/createdAt and persists, returning the stored rule (TEST-AS-030)', async () => {
		const store = new MockApprovalRuleStore();
		const res = await store.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.value.id).toBeTruthy();
			expect(Number.isFinite(res.value.createdAt)).toBe(true);
			expect(res.value.toolName).toBe('Bash');
		}
		const load = await store.loadRules();
		expect(load.ok).toBe(true);
		if (load.ok) expect(load.value).toHaveLength(1);
	});

	it('addRule dedupes by ruleDedupeKey — a same-triple add is a no-op ok(existing)', async () => {
		const store = new MockApprovalRuleStore();
		const first = await store.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		const second = await store.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(first.ok && second.ok).toBe(true);
		if (first.ok && second.ok) expect(second.value.id).toBe(first.value.id);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toHaveLength(1);
	});

	it('addRule appends an opposite-decision rule for the same tool/pattern (deny-wins applies)', async () => {
		const store = new MockApprovalRuleStore();
		await store.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		await store.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'deny',
			lifetime: 'persisted',
		});
		const load = await store.loadRules();
		if (load.ok) expect(load.value.map((r) => r.decision)).toEqual(['allow', 'deny']);
	});

	it('removeRule drops the targeted id and is idempotent for a missing id (TEST-AS-033)', async () => {
		const store = new MockApprovalRuleStore();
		const added = await store.addRule({
			toolName: 'Bash',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(added.ok).toBe(true);
		if (!added.ok) return;
		const removed = await store.removeRule(added.value.id);
		expect(removed.ok).toBe(true);
		const again = await store.removeRule(added.value.id); // missing now — idempotent ok
		expect(again.ok).toBe(true);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toEqual([]);
	});

	it('clear empties the store', async () => {
		const store = new MockApprovalRuleStore();
		store.seedRules([persisted('Bash', 'allow')]);
		const cleared = await store.clear();
		expect(cleared.ok).toBe(true);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toEqual([]);
	});

	it("setFailMode('load') forces loadRules to Result.err (TEST-AS-054 fail-safe driver)", async () => {
		const store = new MockApprovalRuleStore();
		store.setFailMode('load');
		const res = await store.loadRules();
		expect(res.ok).toBe(false);
	});

	it("setFailMode('save') forces addRule to Result.err", async () => {
		const store = new MockApprovalRuleStore();
		store.setFailMode('save');
		const res = await store.addRule({ toolName: 'Bash', decision: 'allow', lifetime: 'persisted' });
		expect(res.ok).toBe(false);
	});

	it("setFailMode('none') restores ok behaviour", async () => {
		const store = new MockApprovalRuleStore();
		store.setFailMode('load');
		store.setFailMode('none');
		const res = await store.loadRules();
		expect(res.ok).toBe(true);
	});

	it('never throws across the boundary (total) — even after a forced fail mode', async () => {
		const store = new MockApprovalRuleStore();
		store.setFailMode('save');
		await expect(
			store.addRule({ toolName: 'Bash', decision: 'allow', lifetime: 'persisted' }),
		).resolves.toBeDefined();
	});
});

describe('MockBridge.approvalRuleStore (TEST-AS-053 Mock backing)', () => {
	it('exposes a scriptable ApprovalRuleStorePort via the approvalRuleStore accessor', async () => {
		const bridge = new MockBridge();
		expect(typeof bridge.approvalRuleStore.loadRules).toBe('function');
		bridge.approvalRuleStore.seedRules([persisted('Bash', 'allow', 'git *')]);
		const load = await bridge.approvalRuleStore.loadRules();
		expect(load.ok).toBe(true);
		if (load.ok) expect(load.value).toHaveLength(1);
	});

	it('returns the same stable instance across reads (the bridge IS the port)', () => {
		const bridge = new MockBridge();
		expect(bridge.approvalRuleStore).toBe(bridge.approvalRuleStore);
	});
});
