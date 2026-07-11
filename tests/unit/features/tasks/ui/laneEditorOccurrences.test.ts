import type { BoardConfig, BoardLaneConfig } from '../../../../../src/features/tasks/config/boardConfigTypes';
import { computeStatusOccurrences } from '../../../../../src/features/tasks/ui/laneEditorOccurrences';

function lane(id: string, statuses: string[], visible = true): BoardLaneConfig {
  return {
    id,
    title: id,
    statuses: statuses as BoardLaneConfig['statuses'],
    visible,
    definitionOfReady: [],
    definitionOfDone: [],
    collapsible: false,
    collapsed: false,
  };
}

function config(lanes: BoardLaneConfig[]): BoardConfig {
  return { schemaVersion: 1, lanes };
}

describe('computeStatusOccurrences', () => {
  it('maps a status to every visible lane that claims it, in order', () => {
    const occ = computeStatusOccurrences(config([lane('a', ['ready']), lane('b', ['ready'])]));
    expect(occ.get('ready')).toEqual([
      { laneIndex: 0, laneTitle: 'a' },
      { laneIndex: 1, laneTitle: 'b' },
    ]);
  });

  it('excludes hidden lanes so the duplicate hint matches routing (visible-only)', () => {
    // resolveBoardLayout filters by lane.visible before its first-wins lookup;
    // a hidden second owner must NOT be surfaced as a duplicate.
    const occ = computeStatusOccurrences(config([lane('a', ['ready']), lane('b', ['ready'], false)]));
    expect(occ.get('ready')).toEqual([{ laneIndex: 0, laneTitle: 'a' }]);
  });

  it('records the lane once per status it claims (multi-status lane)', () => {
    const occ = computeStatusOccurrences(config([lane('a', ['ready', 'running'])]));
    expect(occ.get('ready')).toEqual([{ laneIndex: 0, laneTitle: 'a' }]);
    expect(occ.get('running')).toEqual([{ laneIndex: 0, laneTitle: 'a' }]);
  });

  it('returns no entry for a status no visible lane claims', () => {
    const occ = computeStatusOccurrences(config([lane('a', ['ready'], false)]));
    expect(occ.get('ready')).toBeUndefined();
  });
});
