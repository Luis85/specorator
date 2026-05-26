/**
 * T-AS-015 (RED leg) — browser-`localStorage` `ApprovalRuleStorePort` (SPEC-AS-009,
 * ADR-AS-001 §4).
 *
 * The GitHub Pages demo persists approval rules across a reload with no Obsidian
 * runtime (REQ-AS-053), under the same stable key as the Obsidian device-local store
 * (`'specorator:approval-rules'`). Load-or-default; all `Result`-typed; never throws
 * across the boundary (NFR-AS-010). Exposed on `LocalStorageBridge` via a
 * `get approvalRuleStore` accessor mirroring `toolbarCatalog`.
 *
 * Fails until T-AS-015 supplies
 * `@/infrastructure/localstorage/LocalStorageApprovalRuleStore` +
 * `LocalStorageBridge.approvalRuleStore`.
 *
 * Traces: TEST-AS-053 (LocalStorage round-trip leg), SPEC-AS-009, REQ-AS-053,
 * NFR-AS-010.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalStorageApprovalRuleStore } from '@/infrastructure/localstorage/LocalStorageApprovalRuleStore';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import type { ApprovalRuleStorePort } from '@/domain/ports';

describe('LocalStorageApprovalRuleStore (TEST-AS-053 LocalStorage round-trip leg)', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('is an ApprovalRuleStorePort with four Result-typed methods', () => {
		const store: ApprovalRuleStorePort = new LocalStorageApprovalRuleStore();
		expect(typeof store.loadRules).toBe('function');
		expect(typeof store.addRule).toBe('function');
		expect(typeof store.removeRule).toBe('function');
		expect(typeof store.clear).toBe('function');
	});

	it('loadRules defaults to ok([]) on an empty store (load-or-default)', async () => {
		const store = new LocalStorageApprovalRuleStore();
		const res = await store.loadRules();
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toEqual([]);
	});

	it('addRule then loadRules round-trips a rule across a fresh store instance (REQ-AS-053)', async () => {
		const writer = new LocalStorageApprovalRuleStore();
		const added = await writer.addRule({
			toolName: 'Bash',
			actionPattern: 'git *',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(added.ok).toBe(true);
		// A new instance reads the same browser-localStorage key (parity reload).
		const reader = new LocalStorageApprovalRuleStore();
		const load = await reader.loadRules();
		expect(load.ok).toBe(true);
		if (load.ok) {
			expect(load.value).toHaveLength(1);
			expect(load.value[0].toolName).toBe('Bash');
		}
	});

	it('addRule dedupes a same-triple add (no-op ok(existing))', async () => {
		const store = new LocalStorageApprovalRuleStore();
		const first = await store.addRule({ toolName: 'Bash', decision: 'allow', lifetime: 'persisted' });
		const second = await store.addRule({
			toolName: 'Bash',
			decision: 'allow',
			lifetime: 'persisted',
		});
		expect(first.ok && second.ok).toBe(true);
		if (first.ok && second.ok) expect(second.value.id).toBe(first.value.id);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toHaveLength(1);
	});

	it('removeRule drops the id and is idempotent for a missing id', async () => {
		const store = new LocalStorageApprovalRuleStore();
		const added = await store.addRule({ toolName: 'Bash', decision: 'allow', lifetime: 'persisted' });
		if (!added.ok) return;
		expect((await store.removeRule(added.value.id)).ok).toBe(true);
		expect((await store.removeRule(added.value.id)).ok).toBe(true);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toEqual([]);
	});

	it('clear empties the persisted set', async () => {
		const store = new LocalStorageApprovalRuleStore();
		await store.addRule({ toolName: 'Bash', decision: 'allow', lifetime: 'persisted' });
		expect((await store.clear()).ok).toBe(true);
		const load = await store.loadRules();
		if (load.ok) expect(load.value).toEqual([]);
	});

	it('loadRules load-or-defaults a corrupt blob to ok([]) (never throws)', async () => {
		localStorage.setItem('specorator:approval-rules', '{not valid json');
		const store = new LocalStorageApprovalRuleStore();
		const res = await store.loadRules();
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.value).toEqual([]);
	});
});

describe('LocalStorageBridge.approvalRuleStore (TEST-AS-053 LocalStorage backing)', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('exposes a functional ApprovalRuleStorePort via the approvalRuleStore accessor', async () => {
		const bridge = new LocalStorageBridge();
		expect(typeof bridge.approvalRuleStore.loadRules).toBe('function');
		await bridge.approvalRuleStore.addRule({
			toolName: 'Write',
			actionPattern: '/notes',
			decision: 'allow',
			lifetime: 'persisted',
		});
		const load = await bridge.approvalRuleStore.loadRules();
		expect(load.ok).toBe(true);
		if (load.ok) expect(load.value).toHaveLength(1);
	});
});
