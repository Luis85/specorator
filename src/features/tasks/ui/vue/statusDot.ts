import type { TaskStatus } from '../../model/taskTypes';

export const LIVE_STATUSES: ReadonlySet<TaskStatus> = new Set(['running', 'needs_input', 'needs_approval']);

/** Parity with AgentBoardRenderer.applyStatusDot. */
export function statusDotClass(status: TaskStatus): string {
  const live = LIVE_STATUSES.has(status) ? ' specorator-agent-board-card-status-dot--live' : '';
  return `specorator-agent-board-card-status-dot specorator-agent-board-card-status-dot--${status}${live}`;
}

export type StaleTier = 'green' | 'amber' | 'red';

/** Parity with AgentBoardRenderer.staleTier. */
export function staleTier(ageMs: number): StaleTier {
  if (ageMs < 60_000) return 'green';
  if (ageMs < 300_000) return 'amber';
  return 'red';
}
