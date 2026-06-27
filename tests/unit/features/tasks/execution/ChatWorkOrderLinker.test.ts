import type { TFile } from 'obsidian';

import type { ChatMessage } from '@/core/types';
import {
  buildConversationSeed,
  buildMessageSeed,
  createWorkOrderFromSeed,
} from '@/features/tasks/commands/taskCommands';
import { ChatWorkOrderLinker } from '@/features/tasks/execution/ChatWorkOrderLinker';
import type SpecoratorPlugin from '@/main';
import { chatMessageText } from '@/utils/chatMessageText';

jest.mock('@/features/tasks/commands/taskCommands', () => ({
  createWorkOrderFromSeed: jest.fn(),
  buildMessageSeed: jest.fn(),
  buildConversationSeed: jest.fn(),
}));
jest.mock('@/utils/chatMessageText', () => ({
  chatMessageText: jest.fn(),
}));

const assistantMessage = { id: 'm1', role: 'assistant', currentNote: 'notes/n.md' } as unknown as ChatMessage;

describe('ChatWorkOrderLinker.promoteMessageToWorkOrder', () => {
  beforeEach(() => {
    (createWorkOrderFromSeed as jest.Mock).mockReset();
    (buildMessageSeed as jest.Mock).mockReset();
    (chatMessageText as jest.Mock).mockReset();
  });

  it('creates with reveal:none, then opens the detail modal via the board', async () => {
    const created = { path: 'Agent Board/tasks/task.md' } as TFile;
    const seed = { title: 'x', status: 'inbox' };
    (chatMessageText as jest.Mock).mockReturnValue('some message');
    (buildMessageSeed as jest.Mock).mockReturnValue(seed);
    (createWorkOrderFromSeed as jest.Mock).mockResolvedValue(created);
    const openWorkOrderInBoard = jest.fn().mockResolvedValue(undefined);
    const plugin = { openWorkOrderInBoard } as unknown as SpecoratorPlugin;

    const result = await new ChatWorkOrderLinker(plugin).promoteMessageToWorkOrder(assistantMessage, 'conv1');

    expect(createWorkOrderFromSeed).toHaveBeenCalledWith(
      plugin,
      seed,
      expect.objectContaining({ reveal: 'none' }),
    );
    expect(openWorkOrderInBoard).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('nothing to capture → no creation, no modal', async () => {
    (chatMessageText as jest.Mock).mockReturnValue('');
    const openWorkOrderInBoard = jest.fn();
    const plugin = { openWorkOrderInBoard } as unknown as SpecoratorPlugin;

    const result = await new ChatWorkOrderLinker(plugin).promoteMessageToWorkOrder(assistantMessage, 'conv1');

    expect(createWorkOrderFromSeed).not.toHaveBeenCalled();
    expect(openWorkOrderInBoard).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});

describe('ChatWorkOrderLinker.promoteActiveConversationToWorkOrder', () => {
  beforeEach(() => {
    (createWorkOrderFromSeed as jest.Mock).mockReset();
    (buildConversationSeed as jest.Mock).mockReset();
  });

  it('creates with reveal:none, then opens the detail modal via the board', async () => {
    const created = { path: 'Agent Board/tasks/task.md' } as TFile;
    const seed = { title: 'conv', status: 'inbox' };
    (buildConversationSeed as jest.Mock).mockReturnValue(seed);
    (createWorkOrderFromSeed as jest.Mock).mockResolvedValue(created);
    const openWorkOrderInBoard = jest.fn().mockResolvedValue(undefined);
    const plugin = {
      openWorkOrderInBoard,
      getActiveConversationSnapshot: () => ({ id: 'conv1', title: 'Conversation' }),
    } as unknown as SpecoratorPlugin;

    const result = await new ChatWorkOrderLinker(plugin).promoteActiveConversationToWorkOrder();

    expect(createWorkOrderFromSeed).toHaveBeenCalledWith(
      plugin,
      seed,
      expect.objectContaining({ reveal: 'none' }),
    );
    expect(openWorkOrderInBoard).toHaveBeenCalledWith(created);
    expect(result).toBe(created);
  });

  it('no active chat → no creation, no modal', async () => {
    const openWorkOrderInBoard = jest.fn();
    const plugin = {
      openWorkOrderInBoard,
      getActiveConversationSnapshot: () => null,
    } as unknown as SpecoratorPlugin;

    const result = await new ChatWorkOrderLinker(plugin).promoteActiveConversationToWorkOrder();

    expect(createWorkOrderFromSeed).not.toHaveBeenCalled();
    expect(openWorkOrderInBoard).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
