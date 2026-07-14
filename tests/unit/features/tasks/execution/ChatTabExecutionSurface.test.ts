import { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import type { TaskSpec } from '@/features/tasks/model/taskTypes';
import type SpecoratorPlugin from '@/main';

function makeTask(overrides: Partial<TaskSpec['frontmatter']> = {}): TaskSpec {
  return {
    path: 'Agent Board/tasks/wo-1.md',
    frontmatter: {
      type: 'specorator-work-order',
      schema_version: 1,
      id: 'wo-1',
      title: 'Some task',
      status: 'done',
      priority: '2 - normal',
      created: '2026-06-04T10:00:00Z',
      updated: '2026-06-04T11:00:00Z',
      provider: 'claude',
      model: 'opus',
      conversation_id: 'conv-1',
      attempts: 1,
      ...overrides,
    },
    sections: { objective: '', acceptanceCriteria: '', context: '', constraints: '', ledger: '', handoff: '' },
    body: '',
    raw: '',
  };
}

describe('ChatTabExecutionSurface.startTaskRun', () => {
  it('closes the work-order tab when the run handle is disposed', async () => {
    const closeTab = jest.fn(async () => true);
    const tabHandle = {
      conversationId: 'conv-1',
      sidepanelTabId: 'tab-work-order',
      subscribe: jest.fn(() => () => {}),
      sendFollowUp: jest.fn(async () => undefined),
      cancel: jest.fn(),
      terminal: Promise.resolve({ status: 'completed' as const, finalAssistantContent: 'done' }),
    };
    const view = {
      startTaskRunInFreshTab: jest.fn(async () => tabHandle),
      getTabManager: () => ({ closeTab }),
    };
    const plugin = {
      getView: () => view,
      activateView: jest.fn(async () => undefined),
    } as unknown as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);

    const handle = await surface.startTaskRun(makeTask(), { prompt: 'PROMPT' });
    await handle.dispose?.();

    expect(closeTab).toHaveBeenCalledWith('tab-work-order', true);
  });
});

describe('ChatTabExecutionSurface.requestCommitTurn', () => {
  it('delegates to SpecoratorView.injectCommitTurnForConversation with the work-order conversation', async () => {
    const injectSpy = jest.fn(async () => undefined);
    const plugin = {
      getView: () => ({ injectCommitTurnForConversation: injectSpy }),
      activateView: jest.fn(async () => undefined),
    } as unknown as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);

    await surface.requestCommitTurn(makeTask(), 'PROMPT');

    expect(injectSpy).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      fallbackProviderId: 'claude',
      fallbackModel: 'opus',
      prompt: 'PROMPT',
    });
  });

  it('activates the chat view when no view is currently present', async () => {
    const injectSpy = jest.fn(async () => undefined);
    let view: unknown = null;
    const plugin = {
      getView: () => view,
      activateView: jest.fn(async () => {
        view = { injectCommitTurnForConversation: injectSpy };
      }),
    } as unknown as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);

    await surface.requestCommitTurn(makeTask(), 'PROMPT');

    expect(plugin.activateView).toHaveBeenCalled();
    expect(injectSpy).toHaveBeenCalled();
  });

  it('passes null conversationId when work-order has no conversation_id', async () => {
    const injectSpy = jest.fn(async () => undefined);
    const plugin = {
      getView: () => ({ injectCommitTurnForConversation: injectSpy }),
      activateView: jest.fn(async () => undefined),
    } as unknown as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);

    await surface.requestCommitTurn(makeTask({ conversation_id: null }), 'PROMPT');

    expect(injectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: null, fallbackProviderId: 'claude', fallbackModel: 'opus' }),
    );
  });

  it('rejects when work-order has no provider', async () => {
    const plugin = {} as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);
    await expect(surface.requestCommitTurn(makeTask({ provider: undefined }), 'PROMPT')).rejects.toThrow(
      /provider/i,
    );
  });

  it('rejects when work-order has no model', async () => {
    const plugin = {} as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);
    await expect(surface.requestCommitTurn(makeTask({ model: undefined }), 'PROMPT')).rejects.toThrow(
      /model/i,
    );
  });

  it('rejects when chat view never becomes available', async () => {
    const plugin = {
      getView: () => null,
      activateView: jest.fn(async () => undefined),
    } as unknown as SpecoratorPlugin;
    const surface = new ChatTabExecutionSurface(plugin);
    await expect(surface.requestCommitTurn(makeTask(), 'PROMPT')).rejects.toThrow(/chat view/i);
  });
});
