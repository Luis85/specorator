import { describe, expect, it } from 'vitest';

import type { TaskSpec } from '@/features/tasks/model/taskTypes';
import { computeLiveStrip } from '@/features/tasks/ui/agentBoardLiveHeartbeat';
import { formatElapsed, staleTier } from '@/features/tasks/ui/vue/statusDot';

function makeTask(overrides: Partial<TaskSpec['frontmatter']> = {}, ledger = ''): TaskSpec {
  return {
    path: 'wo-1.md',
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id: 'wo-1',
      title: 'wo-1',
      status: 'running',
      priority: '2 - normal',
      created: '',
      updated: '',
      started: '2026-06-06T00:00:00.000Z',
      heartbeat: '2026-06-06T00:00:00.000Z',
      attempts: 2,
      ...overrides,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger, handoff: '' },
    body: '',
    raw: '',
  } as TaskSpec;
}

describe('computeLiveStrip', () => {
  const now = Date.parse('2026-06-06T00:05:00.000Z'); // 5 min after started

  it('uses the caller-resolved heartbeat source for the heartbeat age', () => {
    // The store overlay wins: the caller passes the live tick (1s before now).
    const patch = computeLiveStrip(makeTask(), '2026-06-06T00:04:59.000Z', undefined, now);
    expect(patch.heartbeatAgeMs).toBe(1_000);
    expect(patch.elapsedMs).toBe(5 * 60_000);
    expect(patch.attemptNumber).toBe(2);
    expect(staleTier(patch.heartbeatAgeMs)).toBe('green');
    expect(formatElapsed(patch.elapsedMs)).toBe('5m 0s');
  });

  it('falls back to the frontmatter heartbeat the caller passes when no overlay tick exists', () => {
    // No store overlay → caller passes frontmatter.heartbeat (5 min stale).
    const patch = computeLiveStrip(makeTask(), makeTask().frontmatter.heartbeat, undefined, now);
    expect(patch.heartbeatAgeMs).toBe(5 * 60_000);
    expect(staleTier(patch.heartbeatAgeMs)).toBe('red');
  });

  it('treats an absent heartbeat source as now (age 0)', () => {
    expect(computeLiveStrip(makeTask({ heartbeat: null }), null, undefined, now).heartbeatAgeMs).toBe(0);
  });

  it('prefers the ledger overlay message over the ledger section tail', () => {
    const patch = computeLiveStrip(makeTask({}, 'first\n\nignored tail'), null, 'overlay line', now);
    expect(patch.lastLedger).toBe('overlay line');
  });

  it('falls back to the last non-blank ledger line when no overlay message is given', () => {
    const patch = computeLiveStrip(makeTask({}, 'first\n\nlast line'), null, undefined, now);
    expect(patch.lastLedger).toBe('last line');
  });

  it('leaves lastLedger undefined when both the overlay and the ledger section are empty', () => {
    expect(computeLiveStrip(makeTask({}, ''), null, undefined, now).lastLedger).toBeUndefined();
  });
});
