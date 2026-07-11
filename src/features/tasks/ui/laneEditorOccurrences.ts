import type { BoardConfig } from '../config/boardConfigTypes';
import type { TaskStatus } from '../model/taskTypes';

export interface StatusOccurrence {
  laneIndex: number;
  laneTitle: string;
}

// Maps each status to every VISIBLE lane that currently claims it. Only visible
// lanes participate in board routing (`resolveBoardLayout` filters by
// `lane.visible` before its first-wins lookup), so the duplicate hint must use
// the same filter — otherwise hiding the canonical lane would make routing move
// silently to the next visible owner while the editor kept naming the hidden one.
export function computeStatusOccurrences(
  config: BoardConfig,
): Map<TaskStatus, StatusOccurrence[]> {
  const map = new Map<TaskStatus, StatusOccurrence[]>();
  config.lanes.forEach((lane, laneIndex) => {
    if (!lane.visible) return;
    for (const status of lane.statuses) {
      const list = map.get(status) ?? [];
      list.push({ laneIndex, laneTitle: lane.title });
      map.set(status, list);
    }
  });
  return map;
}
