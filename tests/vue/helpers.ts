import { vi } from 'vitest';

/**
 * Fake SpecoratorPlugin covering every backend surface the Library panels
 * touch on mount.
 */
export function makePlugin() {
  return {
    settings: {},
    app: {
      vault: {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        getMarkdownFiles: vi.fn().mockReturnValue([]),
        read: vi.fn().mockResolvedValue(''),
      },
    },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
    agentRosterStore: { list: vi.fn().mockResolvedValue([]) },
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([]) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue(''),
      stat: vi.fn().mockResolvedValue(null),
    },
  } as never;
}
