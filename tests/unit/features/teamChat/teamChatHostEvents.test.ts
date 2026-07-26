import { registerTeamChatDmHostEvents } from '@/features/teamChat/teamChatHostEvents';

// The Shift+Tab handler delegates to the shared `toggleTabPlanMode` (used by the
// sidebar's view-level handler too); mock it so this suite tests the WIRING/guards,
// not the toggle internals (those are locked in tabShared.toggleTabPlanMode.test.ts).
jest.mock('@/features/chat/tabs/tabShared', () => ({
  toggleTabPlanMode: jest.fn(),
}));
import { toggleTabPlanMode } from '@/features/chat/tabs/tabShared';

const mockToggle = toggleTabPlanMode as jest.Mock;

/**
 * Round-65: the Team Chat DM host events, folding Round-62/64's file-context vault
 * wiring together with the mention click-away (Fix #1) and the Shift+Tab plan-mode
 * toggle (Fix #3) — the view-level parity the reused composer advertises but Team Chat
 * never wired. One helper, ONE disposer (dispose-and-recreate per onOpen, dispose on
 * onClose) so a re-entrant onOpen can't leak the prior listeners.
 */
describe('registerTeamChatDmHostEvents', () => {
  beforeEach(() => mockToggle.mockClear());

  function makeFcm() {
    return {
      markFileCacheDirty: jest.fn(),
      markFolderCacheDirty: jest.fn(),
      handleFileOpen: jest.fn(),
      containsElement: jest.fn().mockReturnValue(false),
      hideMentionDropdown: jest.fn(),
    };
  }

  function makeTarget() {
    const handlers: Record<string, (ev: unknown) => void> = {};
    const addEventListener = jest.fn((type: string, handler: (ev: unknown) => void) => {
      handlers[type] = handler;
    });
    const removeEventListener = jest.fn();
    return { handlers, addEventListener, removeEventListener };
  }

  function harness(activeTab: unknown) {
    const vaultHandlers: Record<string, (file?: unknown) => void> = {};
    const wsHandlers: Record<string, (file?: unknown) => void> = {};
    const registered: unknown[] = [];
    const vaultOffref = jest.fn();
    const wsOffref = jest.fn();
    const plugin = {
      app: {
        vault: {
          on: jest.fn((event: string, handler: (file?: unknown) => void) => {
            vaultHandlers[event] = handler;
            return { event, scope: 'vault' };
          }),
          offref: vaultOffref,
        },
        workspace: {
          on: jest.fn((event: string, handler: (file?: unknown) => void) => {
            wsHandlers[event] = handler;
            return { event, scope: 'workspace' };
          }),
          offref: wsOffref,
        },
      },
    } as never;
    const doc = makeTarget();
    const container = makeTarget();
    const containerEl = { ...container, ownerDocument: doc } as unknown as HTMLElement;
    const dispose = registerTeamChatDmHostEvents(
      plugin,
      () => activeTab as never,
      containerEl,
      (ref) => registered.push(ref),
    );
    return { vaultHandlers, wsHandlers, registered, dispose, vaultOffref, wsOffref, doc, container };
  }

  // ---- File-context cache freshness (folded Round-62/64) ---------------------

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

  // ---- Mention click-away (Fix #1) ------------------------------------------

  it('hides the mention dropdown on a document click OUTSIDE the dropdown and input', () => {
    const fcm = makeFcm();
    const inputEl = { tag: 'input' };
    const { doc } = harness({ ui: { fileContextManager: fcm }, dom: { inputEl } });

    doc.handlers['click']({ target: { tag: 'elsewhere' } });

    expect(fcm.hideMentionDropdown).toHaveBeenCalledTimes(1);
  });

  it('does NOT hide when the click is INSIDE the mention dropdown', () => {
    const fcm = makeFcm();
    fcm.containsElement.mockReturnValue(true);
    const { doc } = harness({ ui: { fileContextManager: fcm }, dom: { inputEl: {} } });

    doc.handlers['click']({ target: { tag: 'in-dropdown' } });

    expect(fcm.hideMentionDropdown).not.toHaveBeenCalled();
  });

  it('does NOT hide when the click target is the composer input element', () => {
    const fcm = makeFcm();
    const inputEl = { tag: 'input' };
    const { doc } = harness({ ui: { fileContextManager: fcm }, dom: { inputEl } });

    doc.handlers['click']({ target: inputEl });

    expect(fcm.hideMentionDropdown).not.toHaveBeenCalled();
  });

  it('no-ops on a document click when no DM tab is active / no fileContextManager', () => {
    const noTab = harness(null);
    const noFcm = harness({ ui: { fileContextManager: null }, dom: { inputEl: {} } });

    expect(() => noTab.doc.handlers['click']({ target: {} })).not.toThrow();
    expect(() => noFcm.doc.handlers['click']({ target: {} })).not.toThrow();
  });

  // ---- Shift+Tab plan-mode toggle (Fix #3) ----------------------------------

  it('toggles plan mode for the active DM tab on Shift+Tab (and consumes the event)', () => {
    const activeTab = { ui: { fileContextManager: makeFcm() }, dom: { inputEl: {} } };
    const { container } = harness(activeTab);
    const preventDefault = jest.fn();

    container.handlers['keydown']({ key: 'Tab', shiftKey: true, isComposing: false, preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(mockToggle).toHaveBeenCalledTimes(1);
    expect(mockToggle.mock.calls[0][0]).toBe(activeTab);
  });

  it('ignores a plain Tab without Shift (no toggle, no preventDefault)', () => {
    const { container } = harness({ ui: { fileContextManager: makeFcm() }, dom: { inputEl: {} } });
    const preventDefault = jest.fn();

    container.handlers['keydown']({ key: 'Tab', shiftKey: false, isComposing: false, preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('ignores Shift+Tab while an IME composition is active (isComposing)', () => {
    const { container } = harness({ ui: { fileContextManager: makeFcm() }, dom: { inputEl: {} } });
    const preventDefault = jest.fn();

    container.handlers['keydown']({ key: 'Tab', shiftKey: true, isComposing: true, preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('consumes Shift+Tab but does not toggle when no DM tab is active', () => {
    const { container } = harness(null);
    const preventDefault = jest.fn();

    container.handlers['keydown']({ key: 'Tab', shiftKey: true, isComposing: false, preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1); // consumed (matches SpecoratorView)
    expect(mockToggle).not.toHaveBeenCalled();
  });

  // ---- Re-entrant-safe disposal (one disposer for all wirings) ---------------

  it('returns a disposer that offrefs every vault/workspace ref AND removes both DOM listeners', () => {
    const { dispose, registered, vaultOffref, wsOffref, doc, container } = harness({
      ui: { fileContextManager: makeFcm() },
      dom: { inputEl: {} },
    });

    expect(typeof dispose).toBe('function');
    dispose();

    // 4 vault events + 1 workspace event, each released on its OWN emitter.
    expect(vaultOffref).toHaveBeenCalledTimes(4);
    expect(wsOffref).toHaveBeenCalledTimes(1);
    const offrefdRefs = [...vaultOffref.mock.calls, ...wsOffref.mock.calls].map((call) => call[0]);
    expect(offrefdRefs).toEqual(expect.arrayContaining(registered));
    expect(offrefdRefs).toHaveLength(registered.length);

    // The click (document) + keydown (container) DOM listeners are removed too, so a
    // re-entrant onOpen that re-registers nets +0 listeners (no accumulation).
    expect(doc.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(container.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('after dispose, the removed DOM handlers are the exact ones that were registered', () => {
    const { dispose, doc, container } = harness({ ui: { fileContextManager: makeFcm() }, dom: { inputEl: {} } });
    const clickHandler = doc.handlers['click'];
    const keydownHandler = container.handlers['keydown'];

    dispose();

    expect(doc.removeEventListener).toHaveBeenCalledWith('click', clickHandler);
    expect(container.removeEventListener).toHaveBeenCalledWith('keydown', keydownHandler);
  });
});
