import type { TaskPriority, TaskStatus } from '../../model/taskTypes';

// The live-strip presentation helpers live in the shared live-heartbeat module
// (also home to the pure `computeLiveStrip`); re-exported here so the Vue board
// components import their strip/dot helpers from a single module.
export {
  formatElapsed,
  staleAriaLabel,
  staleGlyph,
  type StaleTier,
  staleTier,
} from '../agentBoardLiveHeartbeat';

export const LIVE_STATUSES: ReadonlySet<TaskStatus> = new Set(['running', 'needs_input', 'needs_approval']);

/** Status-dot class list the board CSS keys the per-status color + live pulse off. */
export function statusDotClass(status: TaskStatus): string {
  const live = LIVE_STATUSES.has(status) ? ' specorator-agent-board-card-status-dot--live' : '';
  return `specorator-agent-board-card-status-dot specorator-agent-board-card-status-dot--${status}${live}`;
}

const PRIORITY_TOTAL_BARS = 3;

/**
 * Priority → { filled-bar count, modifier suffix } for the card's ascending
 * priority bars + label.
 */
const PRIORITY_META: Record<TaskPriority, { bars: number; modifier: string }> = {
  '0 - urgent': { bars: 3, modifier: 'urgent' },
  '1 - high': { bars: 3, modifier: 'high' },
  '2 - normal': { bars: 2, modifier: 'normal' },
  '3 - low': { bars: 1, modifier: 'low' },
};

export interface PriorityBars {
  modifier: string;
  filled: boolean[];
}

/**
 * Resolves the priority modifier class and the ascending filled/empty bar
 * flags for the card's priority meter. An unrecognized (legacy /
 * hand-authored) priority falls back to normal styling so one bad value can't
 * abort the render; the label still shows the raw value at the call site.
 */
export function priorityBars(priority: TaskPriority): PriorityBars {
  const meta =
    (PRIORITY_META as Record<string, { bars: number; modifier: string }>)[priority] ??
    PRIORITY_META['2 - normal'];
  return {
    modifier: meta.modifier,
    filled: Array.from({ length: PRIORITY_TOTAL_BARS }, (_unused, index) => index + 1 <= meta.bars),
  };
}
