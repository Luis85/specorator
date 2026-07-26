import { buildTeamChatCallbacks } from '@/features/teamChat/teamChatCallbacksFactory';
import type SpecoratorPlugin from '@/main';

/**
 * The menu actions are fire-and-forget from Vue's side, but their engine work is async and
 * can genuinely fail — a thread-map read, a tab persist/destroy, a workspace activate.
 * Detached with a bare `void`, a rejection was BOTH an unhandled promise and a menu click
 * that silently did nothing. Every detached action must land in the leaf's error log instead.
 */

const closeAgentDmTab = jest.fn();
const activateLibrary = jest.fn();

jest.mock('@/features/teamChat/teamChatDmActions', () => ({
  closeAgentDmTab: (...args: unknown[]) => closeAgentDmTab(...args),
  clampRailWidth: (width: number) => width,
  fillComposer: jest.fn(),
}));
jest.mock('@/features/library/activateLibrary', () => ({
  activateLibrary: (...args: unknown[]) => activateLibrary(...args),
}));
jest.mock('@/features/chat/tabs/tabUi', () => ({ openEditedFile: jest.fn() }));

function makeHost() {
  const error = jest.fn();
  const host = {
    plugin: { logger: { scope: () => ({ error }) } } as unknown as SpecoratorPlugin,
    getTabManager: () => null,
    addObserver: () => () => undefined,
    openAgentDm: jest.fn(),
    getRailGeometry: () => ({ collapsed: false, width: 260 }),
    setRailGeometry: jest.fn(),
  };
  return { host, error };
}

/** Detached work resolves on a later microtask than the callback's own return. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('buildTeamChatCallbacks — detached action failures', () => {
  beforeEach(() => jest.clearAllMocks());

  it('logs instead of leaking an unhandled rejection when closing a DM fails', async () => {
    closeAgentDmTab.mockRejectedValue(new Error('thread map unreadable'));
    const { host, error } = makeHost();

    expect(() => buildTeamChatCallbacks(host).onCloseDm('roster:a')).not.toThrow();
    await settle();

    expect(error).toHaveBeenCalledWith('closeAgentDmTab failed', expect.any(Error));
  });

  it('logs instead of leaking an unhandled rejection when opening the Library fails', async () => {
    activateLibrary.mockRejectedValue(new Error('no leaf'));
    const { host, error } = makeHost();

    buildTeamChatCallbacks(host).onEditAgent('roster:a');
    await settle();

    expect(error).toHaveBeenCalledWith('openLibrary failed', expect.any(Error));
  });

  it('stays silent on the happy path', async () => {
    closeAgentDmTab.mockResolvedValue(true);
    const { host, error } = makeHost();

    buildTeamChatCallbacks(host).onCloseDm('roster:a');
    await settle();

    expect(error).not.toHaveBeenCalled();
  });
});
