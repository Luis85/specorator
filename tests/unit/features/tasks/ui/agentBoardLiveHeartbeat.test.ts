import type { TaskSpec } from '@/features/tasks/model/taskTypes';
import { AgentBoardLiveHeartbeatTracker } from '@/features/tasks/ui/agentBoardLiveHeartbeat';

function makeTask(overrides: Partial<TaskSpec['frontmatter']> = {}, ledger = ''): TaskSpec {
  return {
    path: 'wo-1.md',
    frontmatter: {
      id: 'wo-1',
      status: 'running',
      started: '2026-06-06T00:00:00.000Z',
      heartbeat: '2026-06-06T00:00:00.000Z',
      attempts: 2,
      ...overrides,
    },
    sections: { ledger },
  } as unknown as TaskSpec;
}

describe('AgentBoardLiveHeartbeatTracker', () => {
  const now = Date.parse('2026-06-06T00:05:00.000Z'); // 5 min after started

  it('prefers a recorded live heartbeat over stale frontmatter', () => {
    const tracker = new AgentBoardLiveHeartbeatTracker();
    tracker.record('wo-1', '2026-06-06T00:04:59.000Z'); // 1s before now
    const patch = tracker.computePatch(makeTask(), undefined, now);
    expect(patch.heartbeatAgeMs).toBe(1_000);
    expect(patch.elapsedMs).toBe(5 * 60_000);
    expect(patch.attemptNumber).toBe(2);
  });

  it('falls back to frontmatter heartbeat when no live tick was recorded', () => {
    const tracker = new AgentBoardLiveHeartbeatTracker();
    const patch = tracker.computePatch(makeTask(), undefined, now);
    expect(patch.heartbeatAgeMs).toBe(5 * 60_000);
  });

  it('uses the last non-empty ledger line when no explicit lastLedger is passed', () => {
    const tracker = new AgentBoardLiveHeartbeatTracker();
    const patch = tracker.computePatch(makeTask({}, 'first\n\nlast line'), undefined, now);
    expect(patch.lastLedger).toBe('last line');
  });

  it('prefers an explicit lastLedger argument', () => {
    const tracker = new AgentBoardLiveHeartbeatTracker();
    const patch = tracker.computePatch(makeTask({}, 'ignored'), 'explicit', now);
    expect(patch.lastLedger).toBe('explicit');
  });

  it('stops preferring the live heartbeat after eviction', () => {
    const tracker = new AgentBoardLiveHeartbeatTracker();
    tracker.record('wo-1', '2026-06-06T00:04:59.000Z');
    tracker.evict('wo-1');
    const patch = tracker.computePatch(makeTask(), undefined, now);
    expect(patch.heartbeatAgeMs).toBe(5 * 60_000); // back to frontmatter
  });
});
