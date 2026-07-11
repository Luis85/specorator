import { describe, expect, it } from 'vitest';

import { boardWorkOrderFolder } from '@/features/tasks/config/boardWorkOrderFolder';

describe('boardWorkOrderFolder', () => {
  it('falls back to the default when the configured folder is empty', () => {
    expect(boardWorkOrderFolder({ agentBoardWorkOrderFolder: '' })).toBe('Agent Board/tasks');
  });

  it('returns a custom configured folder unchanged', () => {
    expect(boardWorkOrderFolder({ agentBoardWorkOrderFolder: 'Work/Orders' })).toBe('Work/Orders');
  });

  it('strips leading and trailing slashes so the loader and the vault filter agree', () => {
    expect(boardWorkOrderFolder({ agentBoardWorkOrderFolder: '/Work/Orders/' })).toBe('Work/Orders');
    expect(boardWorkOrderFolder({ agentBoardWorkOrderFolder: '///a/b///' })).toBe('a/b');
  });
});
