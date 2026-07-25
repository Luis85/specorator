import { registerTeamChatDmFileEvents } from '@/features/teamChat/teamChatFileEvents';

/**
 * Fix 2 (Round-62): the Team Chat mirror of SpecoratorView's vault/workspace wiring
 * that keeps the ACTIVE DM tab's file-context cache fresh. create/delete/rename dirty
 * BOTH the file and folder cache; modify dirties only the file cache; file-open re-runs
 * the active tab's current-note attach. Everything null-guards the active tab / its
 * fileContextManager (empty roster, or a DM tab not yet initialized) — never a throw.
 */
describe('registerTeamChatDmFileEvents', () => {
  function makeFcm() {
    return {
      markFileCacheDirty: jest.fn(),
      markFolderCacheDirty: jest.fn(),
      handleFileOpen: jest.fn(),
    };
  }

  function harness(activeTab: unknown) {
    const vaultHandlers: Record<string, (file?: unknown) => void> = {};
    const wsHandlers: Record<string, (file?: unknown) => void> = {};
    const registered: unknown[] = [];
    const plugin = {
      app: {
        vault: {
          on: jest.fn((event: string, handler: (file?: unknown) => void) => {
            vaultHandlers[event] = handler;
            return { event };
          }),
        },
        workspace: {
          on: jest.fn((event: string, handler: (file?: unknown) => void) => {
            wsHandlers[event] = handler;
            return { event };
          }),
        },
      },
    } as never;
    registerTeamChatDmFileEvents(plugin, () => activeTab as never, (ref) => registered.push(ref));
    return { vaultHandlers, wsHandlers, registered };
  }

  it('marks file AND folder cache dirty on create/delete/rename of the active DM tab', () => {
    const fcm = makeFcm();
    const { vaultHandlers } = harness({ ui: { fileContextManager: fcm } });

    for (const event of ['create', 'delete', 'rename'] as const) {
      fcm.markFileCacheDirty.mockClear();
      fcm.markFolderCacheDirty.mockClear();
      vaultHandlers[event]({ path: 'a.md' });
      expect(fcm.markFileCacheDirty).toHaveBeenCalledTimes(1);
      expect(fcm.markFolderCacheDirty).toHaveBeenCalledTimes(1);
    }
  });

  it('marks ONLY the file cache dirty on modify (folders unchanged by an in-place edit)', () => {
    const fcm = makeFcm();
    const { vaultHandlers } = harness({ ui: { fileContextManager: fcm } });

    vaultHandlers['modify']({ path: 'a.md' });

    expect(fcm.markFileCacheDirty).toHaveBeenCalledTimes(1);
    expect(fcm.markFolderCacheDirty).not.toHaveBeenCalled();
  });

  it('calls handleFileOpen on the active DM tab for a file-open', () => {
    const fcm = makeFcm();
    const { wsHandlers } = harness({ ui: { fileContextManager: fcm } });
    const file = { path: 'note.md' };

    wsHandlers['file-open'](file);

    expect(fcm.handleFileOpen).toHaveBeenCalledWith(file);
  });

  it('ignores a null file-open (no handleFileOpen)', () => {
    const fcm = makeFcm();
    const { wsHandlers } = harness({ ui: { fileContextManager: fcm } });

    wsHandlers['file-open'](null);

    expect(fcm.handleFileOpen).not.toHaveBeenCalled();
  });

  it('no-ops without throwing when no DM tab is active (empty roster)', () => {
    const { vaultHandlers, wsHandlers } = harness(null);

    expect(() => {
      vaultHandlers['create']({ path: 'a.md' });
      vaultHandlers['modify']({ path: 'a.md' });
      wsHandlers['file-open']({ path: 'a.md' });
    }).not.toThrow();
  });

  it('no-ops without throwing when the active tab has no fileContextManager', () => {
    const { vaultHandlers } = harness({ ui: { fileContextManager: null } });

    expect(() => vaultHandlers['create']({ path: 'a.md' })).not.toThrow();
  });

  it('registers every vault + workspace ref through registerEvent (ItemView auto-disposes on unload)', () => {
    const { registered } = harness({ ui: { fileContextManager: makeFcm() } });
    // create, delete, rename, modify, file-open
    expect(registered).toHaveLength(5);
  });
});
