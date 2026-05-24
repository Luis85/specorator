/**
 * TEST-RR-021 (U leg) — `resolveSubagentLifecycle` + `consolidateSubagent` pure
 * transform (Claude Task/Agent path only — Codex/Opencode deferred P9).
 *
 * SPEC-RR-017: classify a subagent's sync-vs-async mode and (for async) its
 * lifecycle status (pending->running->completed/error->orphaned), and consolidate
 * a spawn + matched async_subagent_result into one logical subagent. Pure, total;
 * a non-Claude shape degrades to {mode:'sync'}.
 *
 * Traces: TEST-RR-021, SPEC-RR-017, REQ-RR-021b, NFR-RR-003/005, EC-RR-11.
 */
import { describe, it, expect } from 'vitest';
import {
	resolveSubagentLifecycle,
	consolidateSubagent,
} from '@/application/chat/resolveSubagentLifecycle';
import type { SubagentInfo } from '@/domain/chat/Subagent';

function spawn(overrides: Partial<SubagentInfo> = {}): SubagentInfo {
	return {
		id: 's1',
		description: 'Subagent task',
		status: 'running',
		toolCalls: [],
		...overrides,
	};
}

describe('resolveSubagentLifecycle — sync vs async (TEST-RR-021)', () => {
	it('a subagent without async markers is sync', () => {
		expect(resolveSubagentLifecycle(spawn())).toEqual({ mode: 'sync' });
	});

	it('mode:"async" marker -> async', () => {
		const out = resolveSubagentLifecycle(spawn({ mode: 'async', asyncStatus: 'running' }));
		expect(out).toEqual({ mode: 'async', asyncStatus: 'running' });
	});

	it('an agentId correlation marker -> async', () => {
		const out = resolveSubagentLifecycle(spawn({ agentId: 'agent-7' }));
		expect(out.mode).toBe('async');
	});

	it('an explicitly sync subagent stays sync even with nested tools', () => {
		const out = resolveSubagentLifecycle(
			spawn({ mode: 'sync', toolCalls: [{ id: 't1', name: 'Read', input: {}, status: 'running' }] }),
		);
		expect(out).toEqual({ mode: 'sync' });
	});
});

describe('resolveSubagentLifecycle — asyncStatus ladder (TEST-RR-021)', () => {
	it('async with no run yet -> pending', () => {
		const out = resolveSubagentLifecycle(spawn({ mode: 'async' }));
		expect(out).toEqual({ mode: 'async', asyncStatus: 'pending' });
	});

	it('async with active nested tools -> running', () => {
		const out = resolveSubagentLifecycle(
			spawn({
				mode: 'async',
				toolCalls: [{ id: 't1', name: 'Read', input: {}, status: 'running' }],
			}),
		);
		expect(out).toEqual({ mode: 'async', asyncStatus: 'running' });
	});

	it('async with completed asyncStatus is preserved', () => {
		const out = resolveSubagentLifecycle(spawn({ mode: 'async', asyncStatus: 'completed' }));
		expect(out).toEqual({ mode: 'async', asyncStatus: 'completed' });
	});

	it('async with error asyncStatus is preserved', () => {
		const out = resolveSubagentLifecycle(spawn({ mode: 'async', asyncStatus: 'error' }));
		expect(out).toEqual({ mode: 'async', asyncStatus: 'error' });
	});

	it('async with orphaned asyncStatus is preserved (EC-RR-11)', () => {
		const out = resolveSubagentLifecycle(spawn({ mode: 'async', asyncStatus: 'orphaned' }));
		expect(out).toEqual({ mode: 'async', asyncStatus: 'orphaned' });
	});
});

describe('consolidateSubagent (TEST-RR-021)', () => {
	it('merges a spawn + completed async result into one subagent', () => {
		const merged = consolidateSubagent(spawn({ mode: 'async', agentId: 'a1', startedAt: 100 }), {
			status: 'completed',
			result: 'all done',
		});
		expect(merged.mode).toBe('async');
		expect(merged.status).toBe('completed');
		expect(merged.asyncStatus).toBe('completed');
		expect(merged.result).toBe('all done');
		expect(typeof merged.completedAt).toBe('number');
		// spawn identity preserved
		expect(merged.id).toBe('s1');
		expect(merged.agentId).toBe('a1');
	});

	it('merges a spawn + error async result -> error status, empty result kept (EC-RR-10)', () => {
		const merged = consolidateSubagent(spawn({ mode: 'async', agentId: 'a1' }), {
			status: 'error',
		});
		expect(merged.status).toBe('error');
		expect(merged.asyncStatus).toBe('error');
		expect(merged.result).toBeUndefined();
	});

	it('with no async result -> orphaned (spawn with no result by turn end, EC-RR-11)', () => {
		const merged = consolidateSubagent(spawn({ mode: 'async', agentId: 'a1' }));
		expect(merged.asyncStatus).toBe('orphaned');
	});

	it('does not mutate the spawn input', () => {
		const original = spawn({ mode: 'async', agentId: 'a1' });
		const snapshot = JSON.stringify(original);
		consolidateSubagent(original, { status: 'completed', result: 'x' });
		expect(JSON.stringify(original)).toBe(snapshot);
	});
});
