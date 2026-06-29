import type { TaskSpec } from '../model/taskTypes';

export interface LiveStripPatch {
  lastLedger: string | undefined;
  elapsedMs: number;
  attemptNumber: number;
  heartbeatAgeMs: number;
}

/**
 * Owns the per-task live heartbeat timestamps captured from `task:heartbeat`
 * events and computes the live-strip patch (elapsed + heartbeat age) for a card.
 * The live heartbeat is preferred over `frontmatter.heartbeat`, which only
 * updates at run transitions, so the rendered age keeps ticking mid-run.
 * Lifted out of `AgentBoardView`; the view owns the renderer + event wiring.
 */
export class AgentBoardLiveHeartbeatTracker {
  private readonly heartbeats = new Map<string, string>();

  record(taskId: string, at: string): void {
    this.heartbeats.set(taskId, at);
  }

  evict(taskId: string): void {
    this.heartbeats.delete(taskId);
  }

  computePatch(task: TaskSpec, lastLedger: string | undefined, now: number): LiveStripPatch {
    const startedAt = task.frontmatter.started ? Date.parse(task.frontmatter.started) : now;
    const liveHeartbeat = this.heartbeats.get(task.frontmatter.id);
    const heartbeatSource = liveHeartbeat ?? task.frontmatter.heartbeat;
    const heartbeatAt = heartbeatSource ? Date.parse(heartbeatSource) : now;
    const ledger = lastLedger
      ?? task.sections.ledger.split('\n').filter((line) => line.trim().length > 0).pop();
    return {
      lastLedger: ledger,
      elapsedMs: Math.max(0, now - startedAt),
      attemptNumber: task.frontmatter.attempts,
      heartbeatAgeMs: Math.max(0, now - heartbeatAt),
    };
  }
}
