import { describe, expect, it } from 'vitest';

import { staleTier, statusDotClass } from '@/features/tasks/ui/vue/statusDot';

// Characterization: these strings/thresholds are the byte-exact parity target
// for the later cutover from AgentBoardRenderer.applyStatusDot / staleTier.
describe('statusDotClass', () => {
  it('a live status carries the base, status, and --live classes', () => {
    const cls = statusDotClass('running');
    expect(cls).toContain('specorator-agent-board-card-status-dot');
    expect(cls).toContain('specorator-agent-board-card-status-dot--running');
    expect(cls).toContain('specorator-agent-board-card-status-dot--live');
  });

  it('a non-live status carries base + status classes and NO --live suffix', () => {
    const cls = statusDotClass('ready');
    expect(cls).toContain('specorator-agent-board-card-status-dot');
    expect(cls).toContain('specorator-agent-board-card-status-dot--ready');
    expect(cls).not.toContain('--live');
  });
});

describe('staleTier', () => {
  it('locks the boundary values (green < 60s ≤ amber < 300s ≤ red)', () => {
    expect(staleTier(0)).toBe('green');
    expect(staleTier(60_000)).toBe('amber');
    expect(staleTier(300_000)).toBe('red');
  });
});
