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
        // Quick Actions panel subscribes folder-scoped vault events on mount.
        on: vi.fn(() => ({})),
        offref: vi.fn(),
      },
    },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn() }) },
    // Quick-action store wiring: real QuickActionStorage over a stub adapter
    // (loadAll resolves to [] when the folder listing is empty).
    storage: { getAdapter: vi.fn(() => ({ listFilesRecursive: vi.fn().mockResolvedValue([]) })) },
    quickActionFavoritesCache: { refresh: vi.fn() },
    agentRosterStore: { list: vi.fn().mockResolvedValue([]) },
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([]) },
    vaultFileAdapter: {
      read: vi.fn().mockResolvedValue(''),
      stat: vi.fn().mockResolvedValue(null),
    },
  } as never;
}
