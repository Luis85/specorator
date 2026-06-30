import { launchLoopPrompt } from '../../../../src/features/quickActions/launchLoopPrompt';
import type { LoopDefinition } from '../../../../src/features/tasks/loops/loopTypes';

const launchMock = jest.fn();
jest.mock('../../../../src/features/quickActions/launchWithModelPicker', () => ({
  launchWithModelPicker: (...a: unknown[]) => launchMock(...a),
}));

const resolveMock = jest.fn();
jest.mock('../../../../src/features/chat/tabs/resolveOverrideTargetTab', () => ({
  resolveOverrideTargetTab: (...a: unknown[]) => resolveMock(...a),
}));

const noticeMock = jest.fn();
jest.mock('obsidian', () => ({ Notice: class { constructor(msg: string) { noticeMock(msg); } } }));

jest.mock('../../../../src/i18n/i18n', () => ({
  t: (key: string, vars?: Record<string, string>) => (vars?.name ? `${key}:${vars.name}` : key),
}));

const loop: LoopDefinition = {
  path: 'x.md',
  id: 'tdd',
  name: 'TDD',
  useWhen: 'w',
  approach: 'red-green',
  steps: '1. test',
  verify: 'green',
  notes: 'n',
};

function makePlugin(tabManager: unknown) {
  return {
    app: {},
    settings: {},
    getView: () => ({ getTabManager: () => tabManager }),
    activateView: jest.fn(),
  } as never;
}

beforeEach(() => jest.clearAllMocks());

describe('launchLoopPrompt', () => {
  it('opens the model picker keyed loop:<id> with a title', () => {
    launchLoopPrompt(makePlugin(null), loop);
    expect(launchMock).toHaveBeenCalledTimes(1);
    const [, launch] = launchMock.mock.calls[0];
    expect(launch.lastUsedKey).toBe('loop:tdd');
    expect(typeof launch.title).toBe('string');
    expect(launch.title.length).toBeGreaterThan(0);
  });

  it('on confirm seeds the loop body as a draft and does NOT send', async () => {
    const seedMock = jest.fn();
    const sendMock = jest.fn();
    const tab = {
      id: 't1',
      controllers: { inputController: { seedComposerDraft: seedMock, sendMessage: sendMock } },
    };
    const tabManager = { switchToTab: jest.fn().mockResolvedValue(undefined) };
    resolveMock.mockResolvedValue(tab);
    launchLoopPrompt(makePlugin(tabManager), loop);
    const [, launch] = launchMock.mock.calls[0];
    launch.onConfirm({ providerId: 'claude', model: 'sonnet' });
    await new Promise((r) => setImmediate(r));
    expect(resolveMock).toHaveBeenCalledWith(
      expect.anything(),
      tabManager,
      { providerId: 'claude', model: 'sonnet' },
    );
    expect(tabManager.switchToTab).toHaveBeenCalledWith('t1');
    expect(seedMock).toHaveBeenCalledTimes(1);
    expect(seedMock.mock.calls[0][0]).toContain('## Loop: TDD');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('notices and does not seed when at the tab limit', async () => {
    resolveMock.mockResolvedValue(null);
    const tabManager = { switchToTab: jest.fn() };
    launchLoopPrompt(makePlugin(tabManager), loop);
    const [, launch] = launchMock.mock.calls[0];
    launch.onConfirm({ providerId: 'claude', model: 'sonnet' });
    await new Promise((r) => setImmediate(r));
    expect(noticeMock).toHaveBeenCalled();
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
  });

  it('includes all non-empty loop sections in the seeded draft', async () => {
    const seedMock = jest.fn();
    const tab = {
      id: 't2',
      controllers: { inputController: { seedComposerDraft: seedMock, sendMessage: jest.fn() } },
    };
    const tabManager = { switchToTab: jest.fn().mockResolvedValue(undefined) };
    resolveMock.mockResolvedValue(tab);
    launchLoopPrompt(makePlugin(tabManager), loop);
    const [, launch] = launchMock.mock.calls[0];
    launch.onConfirm({ providerId: 'claude', model: 'sonnet' });
    await new Promise((r) => setImmediate(r));
    const draft: string = seedMock.mock.calls[0][0];
    expect(draft).toContain('### Approach');
    expect(draft).toContain('### Steps');
    expect(draft).toContain('### Verify');
    expect(draft).toContain('### Notes');
    // useWhen is selection-only and must never appear in the seeded text
    expect(draft).not.toContain('Use when');
  });

  it('seeds with keepExisting so an unsent draft in a reused tab is preserved', async () => {
    const seedMock = jest.fn();
    const tab = {
      id: 't3',
      controllers: { inputController: { seedComposerDraft: seedMock, sendMessage: jest.fn() } },
    };
    const tabManager = { switchToTab: jest.fn().mockResolvedValue(undefined) };
    resolveMock.mockResolvedValue(tab);
    launchLoopPrompt(makePlugin(tabManager), loop);
    const [, launch] = launchMock.mock.calls[0];
    launch.onConfirm({ providerId: 'claude', model: 'sonnet' });
    await new Promise((r) => setImmediate(r));
    expect(seedMock.mock.calls[0][1]).toEqual({ keepExisting: true });
  });

  it('notices and never opens the picker when the loop has no body sections', () => {
    const useWhenOnly: LoopDefinition = {
      path: 'y.md', id: 'empty', name: 'Empty',
      useWhen: 'context only', approach: '', steps: '', verify: '', notes: '',
    };
    launchLoopPrompt(makePlugin(null), useWhenOnly);
    expect(noticeMock).toHaveBeenCalledWith('loopLibrary.emptyBody');
    expect(launchMock).not.toHaveBeenCalled();
  });

  it('does not seed when the view is unavailable after activateView', async () => {
    const seedMock = jest.fn();
    const plugin = {
      app: {},
      settings: {},
      getView: jest.fn().mockReturnValue(null),
      activateView: jest.fn().mockResolvedValue(undefined),
    } as never;
    launchLoopPrompt(plugin, loop);
    const [, launch] = launchMock.mock.calls[0];
    launch.onConfirm({ providerId: 'claude', model: 'sonnet' });
    await new Promise((r) => setImmediate(r));
    expect(seedMock).not.toHaveBeenCalled();
    expect(noticeMock).not.toHaveBeenCalled();
  });
});
