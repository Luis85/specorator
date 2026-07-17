import { asSwitchResult, loadedSwitchResult } from '@test/helpers/conversationSwitch';
import { createMockEl } from '@test/helpers/mockElement';
import { Menu, Notice } from 'obsidian';

import { ConversationController, type ConversationControllerDeps } from '@/features/chat/controllers/ConversationController';
import { ChatState } from '@/features/chat/state/ChatState';
import { deriveEditedFilesFromMessages } from '@/features/chat/utils/editedFiles';
import { confirm } from '@/shared/modals/ConfirmModal';

jest.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/features/chat/utils/editedFiles', () => ({
  ...jest.requireActual('@/features/chat/utils/editedFiles'),
  deriveEditedFilesFromMessages: jest.fn(() => [{ path: 'derived.md', changeKind: 'created' }]),
}));

const mockNotice = Notice as jest.Mock;

function createMockDeps(overrides: Partial<ConversationControllerDeps> = {}): ConversationControllerDeps {
  const state = new ChatState();
  const inputEl = { value: '', focus: jest.fn() } as unknown as HTMLTextAreaElement;
  const messagesEl = createMockEl();

  const fileContextManager = {
    resetForNewConversation: jest.fn(),
    resetForLoadedConversation: jest.fn(),
    autoAttachActiveFile: jest.fn(),
    setCurrentNote: jest.fn(),
    getCurrentNotePath: jest.fn().mockReturnValue(null),
  };

  return {
    plugin: {
      createConversation: jest.fn().mockResolvedValue({
        id: 'new-conv',
        title: 'New Conversation',
        messages: [],
        sessionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
      switchConversation: jest.fn().mockResolvedValue(asSwitchResult({
        id: 'switched-conv',
        title: 'Switched Conversation',
        messages: [],
        sessionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })),
      getConversationById: jest.fn().mockResolvedValue(null),
      getConversationSync: jest.fn().mockReturnValue(null),
      getConversationList: jest.fn().mockReturnValue([]),
      findEmptyConversation: jest.fn().mockResolvedValue(null),
      updateConversation: jest.fn().mockResolvedValue(undefined),
      renameConversation: jest.fn().mockResolvedValue(undefined),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
      agentService: {
        getSessionId: jest.fn().mockResolvedValue(null),
        setSessionId: jest.fn(),
      },
      settings: {
        userName: '',
        enableAutoTitleGeneration: true,
        permissionMode: 'yolo',
      },
    } as any,
    state,
    setTranscriptGreeting: jest.fn(),
    setTranscriptLoading: jest.fn(),
    setTranscriptHydrationError: jest.fn(),
    emitTranscript: jest.fn(),
    emitComposer: jest.fn(),
    subagentManager: {
      orphanAllActive: jest.fn(),
      clear: jest.fn(),
    } as any,
    getMessagesEl: () => messagesEl as any,
    getInputEl: () => inputEl,
    getFileContextManager: () => fileContextManager as any,
    getImageContextManager: () => ({
      clearImages: jest.fn(),
    }) as any,
    getMcpServerSelector: () => ({
      clearEnabled: jest.fn(),
      getEnabledServers: jest.fn().mockResolvedValue(new Set()),
      setEnabledServers: jest.fn(),
    }) as any,
    getExternalContextSelector: () => ({
      getExternalContexts: jest.fn().mockReturnValue([]),
      setExternalContexts: jest.fn(),
      clearExternalContexts: jest.fn(),
    }) as any,
    clearQueuedMessage: jest.fn(),
    clearRetryableTurn: jest.fn(),
    getStatusPanel: () => ({
      remount: jest.fn(),
    }) as any,
    consumePendingHydrationError: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('ConversationController', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    (Menu as typeof Menu & { instances: unknown[] }).instances.length = 0;
    deps = createMockDeps();
    controller = new ConversationController(deps);
  });

  describe('edited files list', () => {
    function conversationWithEdit() {
      return {
        id: 'c1',
        title: 't',
        sessionId: null,
        createdAt: 1,
        updatedAt: 1,
        messages: [{
          id: 'm',
          role: 'assistant',
          content: '',
          timestamp: 1,
          toolCalls: [{ id: 'w', name: 'Write', input: { file_path: 'a.md' }, status: 'completed' }],
        }],
      } as any;
    }

    it('rebuilds the list from the transcript on load when enabled', async () => {
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue(conversationWithEdit());
      deps.state.currentConversationId = 'c1';

      await controller.loadActive();

      expect(deriveEditedFilesFromMessages as jest.Mock).toHaveBeenCalled();
      expect(deps.state.editedFiles).toEqual([{ path: 'derived.md', changeKind: 'created' }]);
    });

    it('clears the list and skips the rebuild when showAgentEditedFiles is disabled', async () => {
      (deps.plugin as any).settings.showAgentEditedFiles = false;
      deps.state.recordEditedFile({ path: 'stale.md', changeKind: 'edited' });
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue(conversationWithEdit());
      deps.state.currentConversationId = 'c1';
      (deriveEditedFilesFromMessages as jest.Mock).mockClear();

      await controller.loadActive();

      expect(deriveEditedFilesFromMessages as jest.Mock).not.toHaveBeenCalled();
      expect(deps.state.editedFiles).toEqual([]);
    });
  });

  describe('Queue Management', () => {
    describe('Creating new conversation', () => {
      it('should clear queued message on new conversation', async () => {
        deps.state.queuedMessage = { content: 'test', images: undefined, editorContext: null, canvasContext: null };
        deps.state.isStreaming = false;

        await controller.createNew();

        expect(deps.clearQueuedMessage).toHaveBeenCalled();
      });

      it('drops the retained retryable turn on new conversation', async () => {
        deps.state.isStreaming = false;

        await controller.createNew();

        expect(deps.clearRetryableTurn).toHaveBeenCalled();
      });

      it('should not create new conversation while streaming', async () => {
        deps.state.isStreaming = true;

        await controller.createNew();

        expect(deps.plugin.createConversation).not.toHaveBeenCalled();
      });

      it('should save current conversation before creating new one', async () => {
        deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];
        deps.state.currentConversationId = 'old-conv';

        await controller.createNew();

        expect(deps.plugin.updateConversation).toHaveBeenCalledWith('old-conv', expect.any(Object));
      });

      it('should reset file context for new conversation', async () => {
        const fileContextManager = deps.getFileContextManager()!;

        await controller.createNew();

        expect(fileContextManager.resetForNewConversation).toHaveBeenCalled();
        expect(fileContextManager.autoAttachActiveFile).toHaveBeenCalled();
      });

      it('should clear todos for new conversation', async () => {
        deps.state.currentTodos = [
          { content: 'Existing todo', status: 'pending', activeForm: 'Doing existing todo' }
        ];
        expect(deps.state.currentTodos).not.toBeNull();

        await controller.createNew();

        expect(deps.state.currentTodos).toBeNull();
      });

      it('should reset to entry point state (null conversationId) instead of creating conversation', async () => {
        // Entry point model: createNew() resets to blank state without creating conversation
        // Conversation is created lazily on first message send
        await controller.createNew();

        expect(deps.plugin.findEmptyConversation).not.toHaveBeenCalled();
        expect(deps.plugin.createConversation).not.toHaveBeenCalled();
        expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
        expect(deps.state.currentConversationId).toBeNull();
      });

      it('should clear messages and reset state when creating new', async () => {
        deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];
        deps.state.currentConversationId = 'old-conv';

        const clearMessagesSpy = jest.spyOn(deps.state, 'clearMessages');

        await controller.createNew();

        expect(clearMessagesSpy).toHaveBeenCalled();
        expect(deps.state.currentConversationId).toBeNull();

        clearMessagesSpy.mockRestore();
      });
    });

    describe('Switching conversations', () => {
      it('should clear queued message on conversation switch', async () => {
        deps.state.currentConversationId = 'old-conv';
        deps.state.queuedMessage = { content: 'test', images: undefined, editorContext: null, canvasContext: null };

        await controller.switchTo('new-conv');

        await controller.whenHydrated();

        expect(deps.clearQueuedMessage).toHaveBeenCalled();
      });

      it('drops the retained retryable turn on conversation switch', async () => {
        // The InputController is per-tab, not per-conversation, so a stale
        // last-turn submission must be cleared on switch — otherwise a
        // reloaded/persisted runtime-error card could retry the previous
        // conversation's turn.
        deps.state.currentConversationId = 'old-conv';

        await controller.switchTo('new-conv');
        await controller.whenHydrated();

        expect(deps.clearRetryableTurn).toHaveBeenCalled();
      });

      it('should not switch while streaming', async () => {
        deps.state.isStreaming = true;
        deps.state.currentConversationId = 'old-conv';

        await controller.switchTo('new-conv');

        await controller.whenHydrated();

        expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
      });

      it('should not switch to current conversation when the transcript is already loaded', async () => {
        deps.state.currentConversationId = 'same-conv';
        deps.state.messages = [
          { id: 'm1', role: 'user', content: 'hello', timestamp: Date.now() },
        ];

        await controller.switchTo('same-conv');

        await controller.whenHydrated();

        expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
      });

      it('retains the current conversation until target hydration succeeds', async () => {
        const currentMessage = {
          id: 'old-message',
          role: 'user' as const,
          content: 'keep this visible',
          timestamp: Date.now(),
        };
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [currentMessage];
        (deps.plugin.switchConversation as jest.Mock).mockRejectedValue(
          new Error('history read failed'),
        );

        await controller.switchTo('new-conv');

        // Phase A is non-destructive: title binding and messages stay on the
        // last known-good conversation while the target loads.
        expect(deps.state.currentConversationId).toBe('old-conv');
        expect(deps.state.messages).toEqual([currentMessage]);

        await controller.whenHydrated();

        expect(deps.state.currentConversationId).toBe('old-conv');
        expect(deps.state.messages).toEqual([currentMessage]);
        expect(deps.setTranscriptLoading).toHaveBeenLastCalledWith(null);
      });

      it('restores the outgoing composer draft when hydration cannot commit', async () => {
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [{ id: 'm1', role: 'user', content: 'hi', timestamp: Date.now() }];
        deps.getInputEl().value = 'draft text';
        const fileCtx = deps.getFileContextManager()!;
        fileCtx.getAttachedFiles = jest.fn(() => new Set(['note.md']));
        fileCtx.getAttachedFolders = jest.fn(() => new Set(['folder/']));
        fileCtx.setAttachedFiles = jest.fn();
        fileCtx.setAttachedFolders = jest.fn();

        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue({
          conversation: { id: 'new-conv', title: 'New', messages: [], createdAt: 0, lastActiveAt: 0 },
          hydration: { kind: 'empty', reason: 'no-store', sourceRef: null },
        });

        await controller.switchTo('new-conv');
        await controller.whenHydrated();

        expect(deps.getInputEl().value).toBe('draft text');
        expect(fileCtx.setAttachedFiles).toHaveBeenCalledWith(['note.md']);
        expect(fileCtx.setAttachedFolders).toHaveBeenCalledWith(['folder/']);
        expect(deps.setTranscriptHydrationError).toHaveBeenCalledWith({
          code: 'store-missing',
          message: expect.stringContaining('not available'),
        });
      });

      it('does not restart a live hydration when the same target is selected twice', async () => {
        let resolveHydration!: (value: ReturnType<typeof asSwitchResult>) => void;
        const hydration = new Promise<ReturnType<typeof asSwitchResult>>((resolve) => {
          resolveHydration = resolve;
        });
        (deps.plugin.switchConversation as jest.Mock).mockReturnValue(hydration);
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [
          { id: 'old', role: 'user', content: 'old', timestamp: Date.now() },
        ];

        await controller.switchTo('new-conv');
        await controller.switchTo('new-conv');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        expect(deps.plugin.switchConversation).toHaveBeenCalledTimes(1);

        resolveHydration(loadedSwitchResult({
          id: 'new-conv',
          title: 'Loaded Conversation',
          messages: [
            { id: 'new', role: 'assistant', content: 'loaded', timestamp: Date.now() },
          ],
          sessionId: 'session-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, [
          { id: 'new', role: 'assistant', content: 'loaded', timestamp: Date.now() },
        ]));
        await controller.whenHydrated();

        expect(deps.state.currentConversationId).toBe('new-conv');
        expect(deps.state.messages[0]?.content).toBe('loaded');
      });

      it('does not rebind the tab when New Chat is clicked mid-hydration', async () => {
        let resolveHydration!: (value: ReturnType<typeof loadedSwitchResult>) => void;
        const hydration = new Promise<ReturnType<typeof loadedSwitchResult>>((resolve) => {
          resolveHydration = resolve;
        });
        (deps.plugin.switchConversation as jest.Mock).mockReturnValue(hydration);
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [
          { id: 'old', role: 'user', content: 'old', timestamp: Date.now() },
        ];

        // Start a history selection; its Phase-B hydration is still in flight.
        await controller.switchTo('new-conv');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        // User clicks New Chat before hydration resolves — the tab goes blank.
        await controller.createNew();
        expect(deps.state.currentConversationId).toBeNull();
        expect(deps.state.messages).toHaveLength(0);
        // The hydration spinner (shown by switchTo's Phase A) must be cleared, or
        // it stays stuck over the blank New Chat once the aborted load's finally
        // skips its own setTranscriptLoading(null).
        expect(deps.setTranscriptLoading).toHaveBeenLastCalledWith(null);

        // The late hydration must NOT rebind the tab to the old selection.
        resolveHydration(loadedSwitchResult({
          id: 'new-conv',
          title: 'Loaded Conversation',
          messages: [{ id: 'new', role: 'assistant', content: 'loaded', timestamp: Date.now() }],
          sessionId: 'session-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }, [
          { id: 'new', role: 'assistant', content: 'loaded', timestamp: Date.now() },
        ]));
        await controller.whenHydrated();

        expect(deps.state.currentConversationId).toBeNull();
        expect(deps.state.messages).toHaveLength(0);
      });

      it('clears the abandoned switch draft on New Chat so the next switch captures the current composer', async () => {
        const hydration = new Promise<ReturnType<typeof loadedSwitchResult>>(() => {});
        (deps.plugin.switchConversation as jest.Mock).mockReturnValue(hydration);
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [{ id: 'old', role: 'user', content: 'old', timestamp: Date.now() }];

        // A switch captures the composer draft ("draft-A") while hydrating.
        deps.getInputEl().value = 'draft-A';
        await controller.switchTo('new-conv');
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect((controller as unknown as { pendingSwitchDraft: unknown }).pendingSwitchDraft).not.toBeNull();

        // New Chat abandons that switch: the captured draft has no target and must
        // be dropped so the next switchTo re-captures rather than restoring "draft-A".
        await controller.createNew();
        expect((controller as unknown as { pendingSwitchDraft: unknown }).pendingSwitchDraft).toBeNull();

        // The user types a fresh draft, then switches again and that load fails to
        // commit — the restored draft must be the CURRENT one, never the stale "draft-A".
        deps.getInputEl().value = 'draft-B';
        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue({
          conversation: { id: 'conv-2', title: 'X', messages: [], createdAt: 0, lastActiveAt: 0 },
          hydration: { kind: 'empty', reason: 'no-store', sourceRef: null },
        });
        await controller.switchTo('conv-2');
        await controller.whenHydrated();

        expect(deps.getInputEl().value).toBe('draft-B');
      });

      it('re-hydrates when the bound conversation still has an empty transcript', async () => {
        deps.state.currentConversationId = 'same-conv';
        deps.state.messages = [];
        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
          id: 'same-conv',
          title: 'Loaded Conversation',
          messages: [
            { id: 'm1', role: 'assistant', content: 'historical reply', timestamp: Date.now() },
          ],
          sessionId: 'session-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        await controller.switchTo('same-conv');

        await controller.whenHydrated();

        expect(deps.plugin.switchConversation).toHaveBeenCalledWith(
          'same-conv',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        expect(deps.state.messages).toHaveLength(1);
        expect(deps.state.messages[0]?.content).toBe('historical reply');
        expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
      });

      it('retries hydration when the bound conversation is stuck loading with an empty transcript', async () => {
        deps.state.currentConversationId = 'same-conv';
        deps.state.messages = [];
        deps.state.isHydrating = true;
        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
          id: 'same-conv',
          title: 'Loaded Conversation',
          messages: [
            { id: 'm1', role: 'user', content: 'hello again', timestamp: Date.now() },
          ],
          sessionId: 'session-1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        await controller.switchTo('same-conv');

        await controller.whenHydrated();

        expect(deps.plugin.switchConversation).toHaveBeenCalled();
        expect(deps.state.messages).toHaveLength(1);
      });

      it('should reset file context when switching conversations', async () => {
        deps.state.currentConversationId = 'old-conv';
        const fileContextManager = deps.getFileContextManager()!;

        await controller.switchTo('new-conv');

        await controller.whenHydrated();

        expect(fileContextManager.resetForLoadedConversation).toHaveBeenCalled();
      });

      it('should clear input value on switch', async () => {
        deps.state.currentConversationId = 'old-conv';
        const inputEl = deps.getInputEl();
        inputEl.value = 'some input';

        await controller.switchTo('new-conv');

        await controller.whenHydrated();

        expect(inputEl.value).toBe('');
      });

    });

    describe('Welcome visibility', () => {
      // Welcome visibility is now a projection of message count in the Vue
      // transcript; `updateWelcomeVisibility` is a no-op that must not touch DOM.
      it('is a no-op that does not throw when messages exist', () => {
        deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

        expect(() => controller.updateWelcomeVisibility()).not.toThrow();
      });

      it('is a no-op that does not throw when no messages exist', () => {
        deps.state.messages = [];

        expect(() => controller.updateWelcomeVisibility()).not.toThrow();
      });

      it('restores the transcript after switching to a conversation with messages', async () => {
        deps.state.currentConversationId = 'old-conv';
        deps.state.messages = [];
        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
          id: 'new-conv',
          messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
          sessionId: null,
        }));

        await controller.switchTo('new-conv');

        await controller.whenHydrated();

        expect(deps.state.messages.length).toBe(1);
        // Post-hydrate the transcript spinner clears and the greeting is seeded.
        expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
        expect(deps.setTranscriptGreeting).toHaveBeenCalled();
      });
    });

    describe('composer re-projection on restore', () => {
      it('re-projects the composer toolbar after restoring MCP + external selections', async () => {
        const setEnabledServers = jest.fn();
        const setExternalContexts = jest.fn();
        const emitComposer = jest.fn();
        const mcpSelector = {
          setEnabledServers,
          clearEnabled: jest.fn(),
          getEnabledServers: jest.fn().mockResolvedValue(new Set()),
        };
        const externalSelector = {
          setExternalContexts,
          clearExternalContexts: jest.fn(),
          getExternalContexts: jest.fn().mockReturnValue([]),
        };
        deps = createMockDeps({
          emitComposer,
          getMcpServerSelector: () => mcpSelector as any,
          getExternalContextSelector: () => externalSelector as any,
        });
        controller = new ConversationController(deps);
        deps.state.currentConversationId = 'old-conv';
        (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
          id: 'new-conv',
          messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: Date.now() }],
          sessionId: null,
          enabledMcpServers: ['server-a'],
          externalContextPaths: ['ctx/a.md'],
        }));

        await controller.switchTo('new-conv');
        await controller.whenHydrated();

        // The restored engine selectors are re-applied...
        expect(setEnabledServers).toHaveBeenCalledWith(['server-a']);
        expect(setExternalContexts).toHaveBeenCalledWith(['ctx/a.md']);
        // ...and the composer toolbar is re-projected AFTER both restores so its
        // badge/dropdown reflect the new conversation (the retained selectors'
        // setters fire no onChange, so emitTranscript alone would leave it stale).
        expect(emitComposer).toHaveBeenCalled();
        const lastEmit = emitComposer.mock.invocationCallOrder.at(-1)!;
        expect(setEnabledServers.mock.invocationCallOrder[0]).toBeLessThan(lastEmit);
        expect(setExternalContexts.mock.invocationCallOrder[0]).toBeLessThan(lastEmit);
      });
    });
  });

  describe('initializeWelcome', () => {
    it('should initialize file context for new tab', () => {
      const fileContextManager = deps.getFileContextManager()!;

      controller.initializeWelcome();

      expect(fileContextManager.resetForNewConversation).toHaveBeenCalled();
      expect(fileContextManager.autoAttachActiveFile).toHaveBeenCalled();
    });

    it('seeds the transcript greeting for the Vue welcome banner', () => {
      controller.initializeWelcome();

      expect(deps.setTranscriptGreeting).toHaveBeenCalledTimes(1);
      const greeting = (deps.setTranscriptGreeting as jest.Mock).mock.calls[0][0];
      expect(greeting.length).toBeGreaterThan(0);
    });
  });

  describe('save edge cases', () => {
    it('should return early when no conversationId and no messages', async () => {
      deps.state.currentConversationId = null;
      deps.state.messages = [];

      await controller.save();

      expect(deps.plugin.updateConversation).not.toHaveBeenCalled();
      expect(deps.plugin.createConversation).not.toHaveBeenCalled();
    });

    it('should lazily create conversation when entry point has messages', async () => {
      deps.state.currentConversationId = null;
      deps.state.messages = [{ id: '1', role: 'user', content: 'hello', timestamp: Date.now() }];

      (deps.plugin.createConversation as jest.Mock).mockResolvedValue({
        id: 'lazy-conv',
        title: 'New Conversation',
        messages: [],
        sessionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await controller.save();

      expect(deps.plugin.createConversation).toHaveBeenCalled();
      expect(deps.state.currentConversationId).toBe('lazy-conv');
      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'lazy-conv',
        expect.any(Object)
      );
    });

    it('should preserve the active runtime provider when lazily creating a conversation', async () => {
      deps = createMockDeps({
        getAgentService: () => ({
          providerId: 'codex',
          getSessionId: jest.fn().mockReturnValue('session-codex'),
          consumeSessionInvalidation: jest.fn().mockReturnValue(false),
          buildSessionUpdates: jest.fn().mockReturnValue({ updates: {} }),
          syncConversationState: jest.fn(),
        }) as any,
      });
      controller = new ConversationController(deps);
      deps.state.currentConversationId = null;
      deps.state.messages = [{ id: '1', role: 'user', content: 'hello', timestamp: Date.now() }];

      (deps.plugin.createConversation as jest.Mock).mockResolvedValue({
        id: 'lazy-codex-conv',
        providerId: 'codex',
        title: 'Codex Conversation',
        messages: [],
        sessionId: 'session-codex',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await controller.save();

      expect(deps.plugin.createConversation).toHaveBeenCalledWith({
        providerId: 'codex',
        sessionId: 'session-codex',
      });
    });

    it('should set lastResponseAt when updateLastResponse is true', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      const beforeCall = Date.now();

      await controller.save(true);

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      const updates = call[1];
      expect(updates.lastResponseAt).toBeDefined();
      expect(updates.lastResponseAt).toBeGreaterThanOrEqual(beforeCall);
      expect(updates.lastResponseAt).toBeLessThanOrEqual(Date.now());
    });

    it('should NOT clear resumeAtMessageId when updateLastResponse is true (caller must pass extraUpdates)', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      await controller.save(true);

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      const updates = call[1];
      expect(updates).not.toHaveProperty('resumeAtMessageId');
    });

    it('should clear resumeAtMessageId when passed via extraUpdates', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      await controller.save(true, { resumeAtMessageId: undefined });

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      const updates = call[1];
      expect(updates.resumeAtMessageId).toBeUndefined();
      // Verify it's explicitly set (not just missing)
      expect('resumeAtMessageId' in updates).toBe(true);
    });

    it('should not clear resumeAtMessageId when updateLastResponse is false', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      await controller.save(false);

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      const updates = call[1];
      expect(updates).not.toHaveProperty('resumeAtMessageId');
    });

    it('should clear pending conversation save state after persisting', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];
      deps.state.hasPendingConversationSave = true;

      await controller.save();

      expect(deps.state.hasPendingConversationSave).toBe(false);
    });

    it('persists workOrderPath onto updates when the accessor returns a path', async () => {
      deps = createMockDeps({
        getWorkOrderPath: () => 'docs/work-orders/example.md',
      });
      controller = new ConversationController(deps);
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      await controller.save();

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      expect(call[1].workOrderPath).toBe('docs/work-orders/example.md');
    });

    it('omits workOrderPath from updates when the accessor returns null', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      await controller.save();

      const call = (deps.plugin.updateConversation as jest.Mock).mock.calls[0];
      expect(call[1]).not.toHaveProperty('workOrderPath');
    });
  });

  describe('loadActive with existing conversation', () => {
    it('should restore currentNote when conversation has one', async () => {
      const fileContextManager = deps.getFileContextManager()!;
      deps.state.currentConversationId = 'conv-with-note';
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue({
        id: 'conv-with-note',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        currentNote: 'notes/my-note.md',
      });

      await controller.loadActive();

      expect(fileContextManager.setCurrentNote).toHaveBeenCalledWith('notes/my-note.md');
    });

    it('should auto-attach active file when no currentNote and no messages', async () => {
      const fileContextManager = deps.getFileContextManager()!;
      deps.state.currentConversationId = 'empty-conv';
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue({
        id: 'empty-conv',
        messages: [],
        sessionId: null,
        currentNote: undefined,
      });

      await controller.loadActive();

      expect(fileContextManager.autoAttachActiveFile).toHaveBeenCalled();
      expect(fileContextManager.setCurrentNote).not.toHaveBeenCalled();
    });

    it('projects the transcript and seeds the greeting on load', async () => {
      deps.state.currentConversationId = 'conv-1';
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue({
        id: 'conv-1',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
      });

      await controller.loadActive();

      // Messages land on state (which re-projects the Vue transcript), the
      // spinner clears, and the greeting is seeded.
      expect(deps.state.messages.length).toBe(1);
      expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
      expect(deps.setTranscriptGreeting).toHaveBeenCalled();

      const greeting = (deps.setTranscriptGreeting as jest.Mock).mock.calls[0][0];
      expect(greeting.length).toBeGreaterThan(0);
    });
  });

  describe('switchTo with currentNote', () => {
    it('should set currentNote when switched conversation has one', async () => {
      const fileContextManager = deps.getFileContextManager()!;
      deps.state.currentConversationId = 'old-conv';

      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        currentNote: 'docs/readme.md',
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(fileContextManager.setCurrentNote).toHaveBeenCalledWith('docs/readme.md');
    });

    it('should not set currentNote when switched conversation has none', async () => {
      const fileContextManager = deps.getFileContextManager()!;
      deps.state.currentConversationId = 'old-conv';

      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        messages: [],
        sessionId: null,
        currentNote: undefined,
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(fileContextManager.setCurrentNote).not.toHaveBeenCalled();
    });

    it('projects the transcript and seeds the greeting on switch', async () => {
      deps.state.currentConversationId = 'old-conv';

      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        messages: [],
        sessionId: null,
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      // Phase A shows the spinner; post-hydrate it clears and the greeting seeds.
      expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
      expect(deps.setTranscriptGreeting).toHaveBeenCalled();

      const greeting = (deps.setTranscriptGreeting as jest.Mock).mock.calls.at(-1)![0];
      expect(greeting.length).toBeGreaterThan(0);
    });
  });

  describe('hydration error banner', () => {
    it('renders a pending hydration failure on switch once the tab is bound', async () => {
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        messages: [],
        sessionId: null,
      }));
      // First consume call (stale drop at switch start) → null; second call
      // (in restoreConversation, after bind) → the freshly emitted failure.
      (deps.consumePendingHydrationError as jest.Mock)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ code: 'store-unreadable', message: 'History unavailable' });

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(deps.consumePendingHydrationError).toHaveBeenCalledWith('new-conv');
      expect(deps.setTranscriptHydrationError).toHaveBeenCalledWith({
        code: 'store-unreadable',
        message: 'History unavailable',
      });
    });

    it('clears the banner and drops a stale failure at switch start', async () => {
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        messages: [],
        sessionId: null,
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      // Switch start clears the banner (setter called with null)...
      expect(deps.setTranscriptHydrationError).toHaveBeenCalledWith(null);
      expect(deps.consumePendingHydrationError).toHaveBeenCalledWith('new-conv');
      // ...and no pending failure means it is never armed with an error object.
      expect(deps.setTranscriptHydrationError).not.toHaveBeenCalledWith(
        expect.objectContaining({ code: expect.anything() }),
      );
    });
  });

  describe('loadActive with greeting', () => {
    it('seeds the greeting and returns early when no conversation exists', async () => {
      deps.state.currentConversationId = null;

      await controller.loadActive();

      expect(deps.setTranscriptGreeting).toHaveBeenCalled();
    });
  });

  describe('Greeting Time Branches', () => {
    it.each([
      { name: 'morning (5-12)', hour: 9, day: 1, patterns: ['morning', 'Coffee'] },
      { name: 'afternoon (12-18)', hour: 14, day: 2, patterns: ['afternoon'] },
      { name: 'evening (18-22)', hour: 20, day: 3, patterns: ['evening', 'Evening', 'your day'] },
      { name: 'night owl (22+)', hour: 23, day: 4, patterns: ['night owl', 'Evening'] },
      { name: 'early morning night owl (0-4)', hour: 2, day: 0, patterns: ['night owl', 'Evening'] },
    ])('should include $name greetings', ({ hour, day, patterns }) => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(hour);
      jest.spyOn(Date.prototype, 'getDay').mockReturnValue(day);

      const greetings = new Set<string>();
      for (let i = 0; i < 50; i++) {
        jest.spyOn(Math, 'random').mockReturnValue(i / 50);
        greetings.add(controller.getGreeting());
      }

      const hasTimeBased = [...greetings].some(g =>
        patterns.some(p => g.includes(p))
      );
      expect(hasTimeBased).toBe(true);

      jest.restoreAllMocks();
    });
  });
});

describe('ConversationController - Callbacks', () => {
  it('should call onNewConversation callback', async () => {
    const onNewConversation = jest.fn();
    const deps = createMockDeps();
    const controller = new ConversationController(deps, { onNewConversation });

    await controller.createNew();

    expect(onNewConversation).toHaveBeenCalled();
  });

  it('should call onConversationSwitched callback', async () => {
    const onConversationSwitched = jest.fn();
    const deps = createMockDeps();
    deps.state.currentConversationId = 'old-conv';
    const controller = new ConversationController(deps, { onConversationSwitched });

    await controller.switchTo('new-conv');

    await controller.whenHydrated();

    expect(onConversationSwitched).toHaveBeenCalled();
  });

  it('should call onConversationLoaded callback', async () => {
    const onConversationLoaded = jest.fn();
    const deps = createMockDeps();
    const controller = new ConversationController(deps, { onConversationLoaded });

    await controller.loadActive();

    expect(onConversationLoaded).toHaveBeenCalled();
  });
});

describe('ConversationController - Title Generation', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = createMockDeps();
    controller = new ConversationController(deps);
  });

  describe('generateFallbackTitle', () => {
    it('should generate title from first sentence', () => {
      const title = controller.generateFallbackTitle('How do I set up React? I need help.');

      expect(title).toBe('How do I set up React');
    });

    it('should truncate long titles to 50 chars', () => {
      const longMessage = 'A'.repeat(100);
      const title = controller.generateFallbackTitle(longMessage);

      expect(title.length).toBeLessThanOrEqual(53); // 50 + '...'
      expect(title).toContain('...');
    });

    it('should handle messages with no sentence breaks', () => {
      const title = controller.generateFallbackTitle('Hello world');

      expect(title).toBe('Hello world');
    });
  });
});

describe('ConversationController - MCP Server Persistence', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockMcpServerSelector: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMcpServerSelector = {
      clearEnabled: jest.fn(),
      getEnabledServers: jest.fn().mockReturnValue(new Set(['mcp-server-1', 'mcp-server-2'])),
      setEnabledServers: jest.fn(),
    };
    deps = createMockDeps({
      getMcpServerSelector: () => mockMcpServerSelector,
    });
    controller = new ConversationController(deps);
  });

  describe('save', () => {
    it('should save enabled MCP servers to conversation', async () => {
      deps.state.currentConversationId = 'conv-1';

      await controller.save();

      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          enabledMcpServers: ['mcp-server-1', 'mcp-server-2'],
        })
      );
    });

    it('should save undefined when no MCP servers enabled', async () => {
      mockMcpServerSelector.getEnabledServers.mockReturnValue(new Set());
      deps.state.currentConversationId = 'conv-1';

      await controller.save();

      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          enabledMcpServers: undefined,
        })
      );
    });
  });

  describe('loadActive', () => {
    it('should restore enabled MCP servers from conversation', async () => {
      deps.state.currentConversationId = 'conv-1';
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue({
        id: 'conv-1',
        messages: [],
        sessionId: null,
        enabledMcpServers: ['restored-server-1', 'restored-server-2'],
      });

      await controller.loadActive();

      expect(mockMcpServerSelector.setEnabledServers).toHaveBeenCalledWith([
        'restored-server-1',
        'restored-server-2',
      ]);
    });

    it('should clear MCP servers when conversation has none', async () => {
      deps.state.currentConversationId = 'conv-1';
      (deps.plugin.getConversationById as jest.Mock).mockResolvedValue({
        id: 'conv-1',
        messages: [],
        sessionId: null,
        enabledMcpServers: undefined,
      });

      await controller.loadActive();

      expect(mockMcpServerSelector.clearEnabled).toHaveBeenCalled();
    });
  });

  describe('switchTo', () => {
    it('should restore enabled MCP servers when switching conversations', async () => {
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        providerId: 'claude',
        messages: [],
        sessionId: null,
        enabledMcpServers: ['switched-server'],
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(mockMcpServerSelector.setEnabledServers).toHaveBeenCalledWith(['switched-server']);
    });

    it('should clear MCP servers when switching to conversation with no servers', async () => {
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        providerId: 'claude',
        messages: [],
        sessionId: null,
        enabledMcpServers: undefined,
      }));

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(mockMcpServerSelector.clearEnabled).toHaveBeenCalled();
    });

    it('should ensure the tab service matches the switched conversation provider', async () => {
      const ensureServiceForConversation = jest.fn().mockResolvedValue(undefined);
      const switchedConversation = {
        id: 'new-conv',
        providerId: 'codex',
        title: 'Codex Conversation',
        messages: [],
        sessionId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      deps = createMockDeps({
        ensureServiceForConversation,
        plugin: {
          ...createMockDeps().plugin,
          switchConversation: jest.fn().mockResolvedValue(asSwitchResult(switchedConversation)),
        } as any,
      });
      controller = new ConversationController(deps);
      deps.state.currentConversationId = 'old-conv';

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(ensureServiceForConversation).toHaveBeenCalledWith(switchedConversation);
    });
  });

  describe('createNew', () => {
    it('should clear enabled MCP servers for new conversation', async () => {
      await controller.createNew();

      expect(mockMcpServerSelector.clearEnabled).toHaveBeenCalled();
    });
  });
});

describe('ConversationController - Race Condition Guards', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;

  beforeEach(() => {
    jest.clearAllMocks();
    deps = createMockDeps();
    controller = new ConversationController(deps);
  });

  describe('createNew guards', () => {
    it('should not create when isCreatingConversation is already true', async () => {
      deps.state.isCreatingConversation = true;

      await controller.createNew();

      expect(deps.plugin.createConversation).not.toHaveBeenCalled();
      expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
    });

    it('should not create when isSwitchingConversation is true', async () => {
      deps.state.isSwitchingConversation = true;

      await controller.createNew();

      expect(deps.plugin.createConversation).not.toHaveBeenCalled();
    });

    it('should reset even when streaming if force is true', async () => {
      deps.state.isStreaming = true;
      deps.state.cancelRequested = false;
      const initialGeneration = deps.state.streamGeneration;

      await controller.createNew({ force: true });

      expect(deps.state.isStreaming).toBe(false);
      expect(deps.state.cancelRequested).toBe(true);
      expect(deps.state.streamGeneration).toBe(initialGeneration + 1);
      expect(deps.state.currentConversationId).toBeNull();
    });

    it('should set and reset isCreatingConversation flag during entry point reset', async () => {
      // Entry point model: createNew() just resets state, doesn't create conversation
      // But isCreatingConversation flag should still be set during the reset
      let flagDuringExecution = false;

      deps.state.clearMessages = jest.fn(() => {
        flagDuringExecution = deps.state.isCreatingConversation;
      });

      await controller.createNew();

      expect(flagDuringExecution).toBe(true);
      expect(deps.state.isCreatingConversation).toBe(false);
    });
  });

  describe('switchTo guards', () => {
    it('should not switch when isSwitchingConversation is already true', async () => {
      deps.state.currentConversationId = 'old-conv';
      deps.state.isSwitchingConversation = true;

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
    });

    it('should not switch when isCreatingConversation is true', async () => {
      deps.state.currentConversationId = 'old-conv';
      deps.state.isCreatingConversation = true;

      await controller.switchTo('new-conv');

      await controller.whenHydrated();

      expect(deps.plugin.switchConversation).not.toHaveBeenCalled();
    });

    it('should reset isHydrating flag even when the deferred transcript load errors', async () => {
      // Phase A (the sync portion of switchTo) no longer owns the transcript
      // load — it returns immediately after the spinner + state swap, so a
      // hydration failure cannot reject `switchTo`. Instead the rejection
      // surfaces inside the background `hydrateAndRender`, which is gated on
      // `state.isHydrating` and must reset that flag in its finally block.
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockRejectedValue(new Error('Switch failed'));

      await controller.switchTo('new-conv');
      await controller.whenHydrated();

      expect(deps.state.isSwitchingConversation).toBe(false);
      expect(deps.state.isHydrating).toBe(false);
    });

    it('should reset isSwitchingConversation flag when conversation not found', async () => {
      deps.state.currentConversationId = 'old-conv';
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(null);

      await controller.switchTo('non-existent');

      await controller.whenHydrated();

      expect(deps.state.isSwitchingConversation).toBe(false);
      expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
    });

    it('should set isHydrating flag while the deferred transcript load is in flight', async () => {
      // `isSwitchingConversation` is now only true during Phase A (the sync
      // tab swap + spinner render), so it has already flipped back to false
      // by the time `plugin.switchConversation` runs in Phase B. The flag the
      // sender / send-gate cares about during Phase B is `isHydrating`.
      deps.state.currentConversationId = 'old-conv';
      let hydratingDuringLoad = false;
      let switchingDuringLoad = false;
      (deps.plugin.switchConversation as jest.Mock).mockImplementation(async () => {
        hydratingDuringLoad = deps.state.isHydrating;
        switchingDuringLoad = deps.state.isSwitchingConversation;
        return asSwitchResult({
          id: 'new-conv',
          title: 'New Conversation',
          messages: [],
          sessionId: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      await controller.switchTo('new-conv');
      await controller.whenHydrated();

      expect(hydratingDuringLoad).toBe(true);
      expect(switchingDuringLoad).toBe(false);
      expect(deps.state.isHydrating).toBe(false);
      expect(deps.state.isSwitchingConversation).toBe(false);
    });

    it('does not restore a stale hydration after a newer switchTo rebinds the tab', async () => {
      deps.state.currentConversationId = 'old-conv';
      let releaseFirstLoad: (() => void) | undefined;
      const firstLoadGate = new Promise<void>((resolve) => {
        releaseFirstLoad = resolve;
      });
      (deps.plugin.switchConversation as jest.Mock).mockImplementation(async (id: string) => {
        if (id === 'first-conv') {
          await firstLoadGate;
          return loadedSwitchResult({
            id: 'first-conv',
            title: 'First',
            messages: [{ id: 'm1', role: 'assistant', content: 'stale', timestamp: 1 }],
            sessionId: null,
            createdAt: 1,
            updatedAt: 1,
          }, [{ id: 'm1', role: 'assistant', content: 'stale', timestamp: 1 }]);
        }
        return loadedSwitchResult({
          id: 'second-conv',
          title: 'Second',
          messages: [{ id: 'm2', role: 'assistant', content: 'fresh', timestamp: 2 }],
          sessionId: null,
          createdAt: 2,
          updatedAt: 2,
        }, [{ id: 'm2', role: 'assistant', content: 'fresh', timestamp: 2 }]);
      });

      const firstSwitch = controller.switchTo('first-conv');
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      await controller.switchTo('second-conv');
      releaseFirstLoad?.();
      await controller.whenHydrated();
      await firstSwitch;

      expect(deps.state.currentConversationId).toBe('second-conv');
      expect(deps.state.messages).toHaveLength(1);
      expect(deps.state.messages[0]?.content).toBe('fresh');
    });

    it('forces a transcript projection after Phase A raises the hydration spinner', async () => {
      deps.state.currentConversationId = 'old-conv';

      await controller.switchTo('new-conv');

      expect(deps.emitTranscript).toHaveBeenCalled();
    });

    it('restores the transcript when provider bind fails after history hydration', async () => {
      deps.state.currentConversationId = 'old-conv';
      const ensureServiceForConversation = jest
        .fn()
        .mockRejectedValue(new Error('provider bind failed'));
      deps = createMockDeps({
        ensureServiceForConversation,
      });
      controller = new ConversationController(deps);
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'new-conv',
        title: 'History Conversation',
        messages: [
          { id: 'm1', role: 'assistant', content: 'historical reply', timestamp: Date.now() },
        ],
        sessionId: 'session-1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));

      await controller.switchTo('new-conv');
      await controller.whenHydrated();

      expect(ensureServiceForConversation).toHaveBeenCalled();
      expect(deps.state.messages).toHaveLength(1);
      expect(deps.state.messages[0]?.content).toBe('historical reply');
      expect(deps.setTranscriptLoading).toHaveBeenCalledWith(null);
    });

    it('does not persist an empty bound transcript before re-hydrating from history', async () => {
      deps.state.currentConversationId = 'stuck-conv';
      deps.state.messages = [];

      await controller.switchTo('stuck-conv');
      await controller.whenHydrated();

      expect(deps.plugin.updateConversation).not.toHaveBeenCalled();
    });
  });

  describe('mutual exclusion', () => {
    it('should prevent createNew during switchTo', async () => {
      deps.state.currentConversationId = 'old-conv';

      // Simulate switchTo in progress
      let switchPromiseResolve: () => void;
      const switchPromise = new Promise<void>((resolve) => {
        switchPromiseResolve = resolve;
      });

      (deps.plugin.switchConversation as jest.Mock).mockImplementation(async () => {
        // During switch, try to createNew
        const createPromise = controller.createNew();

        // createNew should be blocked because isSwitchingConversation is true
        expect(deps.plugin.createConversation).not.toHaveBeenCalled();

        switchPromiseResolve!();
        await createPromise;

        return asSwitchResult({
          id: 'new-conv',
          messages: [],
          sessionId: null,
        });
      });

      await controller.switchTo('new-conv');

      await controller.whenHydrated();
      await switchPromise;

      expect(deps.plugin.createConversation).not.toHaveBeenCalled();
    });
  });
});

describe('ConversationController - Persistent External Context Paths', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockExternalContextSelector: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExternalContextSelector = {
      getExternalContexts: jest.fn().mockReturnValue([]),
      setExternalContexts: jest.fn(),
      clearExternalContexts: jest.fn(),
    };
    deps = createMockDeps({
      getExternalContextSelector: () => mockExternalContextSelector,
    });
    (deps.plugin.settings as any).persistentExternalContextPaths = ['/persistent/path/a', '/persistent/path/b'];
    controller = new ConversationController(deps);
  });

  describe('createNew', () => {
    it('should call clearExternalContexts with persistent paths from settings', async () => {
      await controller.createNew();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(
        ['/persistent/path/a', '/persistent/path/b']
      );
    });

    it('should call clearExternalContexts with empty array if no persistent paths', async () => {
      (deps.plugin.settings as any).persistentExternalContextPaths = undefined;

      await controller.createNew();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith([]);
    });
  });

  describe('loadActive', () => {
    it('should use persistent paths for new conversation (no existing conversation)', async () => {
      deps.state.currentConversationId = null;

      await controller.loadActive();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(
        ['/persistent/path/a', '/persistent/path/b']
      );
    });

    it('should use persistent paths for empty conversation (msg=0)', async () => {
      deps.state.currentConversationId = 'existing-conv';
      deps.plugin.getConversationById = jest.fn().mockResolvedValue({
        id: 'existing-conv',
        messages: [],
        sessionId: null,
      });

      await controller.loadActive();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(
        ['/persistent/path/a', '/persistent/path/b']
      );
    });

    it('should restore saved paths for conversation with messages (msg>0)', async () => {
      deps.state.currentConversationId = 'existing-conv';
      deps.plugin.getConversationById = jest.fn().mockResolvedValue({
        id: 'existing-conv',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        externalContextPaths: ['/saved/path'],
      });

      await controller.loadActive();

      expect(mockExternalContextSelector.setExternalContexts).toHaveBeenCalledWith(['/saved/path']);
      expect(mockExternalContextSelector.clearExternalContexts).not.toHaveBeenCalled();
    });

    it('should restore empty paths for conversation with messages but no saved paths', async () => {
      deps.state.currentConversationId = 'existing-conv';
      deps.plugin.getConversationById = jest.fn().mockResolvedValue({
        id: 'existing-conv',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        externalContextPaths: undefined,
      });

      await controller.loadActive();

      expect(mockExternalContextSelector.setExternalContexts).toHaveBeenCalledWith([]);
    });
  });

  describe('switchTo', () => {
    beforeEach(() => {
      deps.state.currentConversationId = 'old-conv';
    });

    it('should use persistent paths when switching to empty conversation (msg=0)', async () => {
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'empty-conv',
        messages: [],
        sessionId: null,
        externalContextPaths: ['/old/saved/path'],
      }));

      await controller.switchTo('empty-conv');

      await controller.whenHydrated();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(
        ['/persistent/path/a', '/persistent/path/b']
      );
      expect(mockExternalContextSelector.setExternalContexts).not.toHaveBeenCalled();
    });

    it('should restore saved paths when switching to conversation with messages', async () => {
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'conv-with-messages',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        externalContextPaths: ['/saved/path/from/session'],
      }));

      await controller.switchTo('conv-with-messages');

      await controller.whenHydrated();

      expect(mockExternalContextSelector.setExternalContexts).toHaveBeenCalledWith(
        ['/saved/path/from/session']
      );
      expect(mockExternalContextSelector.clearExternalContexts).not.toHaveBeenCalled();
    });

    it('should restore empty array for conversation with messages but no saved paths', async () => {
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'conv-with-messages',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        externalContextPaths: undefined,
      }));

      await controller.switchTo('conv-with-messages');

      await controller.whenHydrated();

      expect(mockExternalContextSelector.setExternalContexts).toHaveBeenCalledWith([]);
    });
  });

  describe('Scenario: Adding persistent paths across sessions', () => {
    it('should show all persistent paths when returning to empty session', async () => {
      // Scenario:
      // 1. User is in session 0 (empty), adds path A as persistent
      // 2. User switches to session 1 (with messages), adds path B as persistent
      // 3. User returns to session 0 (empty) - should see both A and B

      // Step 1: Session 0 is empty, persistent paths = [A]
      (deps.plugin.settings as any).persistentExternalContextPaths = ['/path/a'];
      deps.state.currentConversationId = null;
      await controller.loadActive();

      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(['/path/a']);

      // Step 2: User switches to session 1 and adds path B, settings now have [A, B]
      deps.state.currentConversationId = 'session-0'; // Currently in session 0
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'session-1',
        messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
        sessionId: null,
        externalContextPaths: [],
      }));
      await controller.switchTo('session-1');
      await controller.whenHydrated();

      // User adds path B in session 1, settings now have [A, B]
      (deps.plugin.settings as any).persistentExternalContextPaths = ['/path/a', '/path/b'];

      // Step 3: User returns to session 0 (empty)
      (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
        id: 'session-0',
        messages: [], // Empty session
        sessionId: null,
        externalContextPaths: ['/path/a'], // Only had A when originally created
      }));

      jest.clearAllMocks();
      await controller.switchTo('session-0');
      await controller.whenHydrated();

      // Should get BOTH paths because session is empty (msg=0)
      expect(mockExternalContextSelector.clearExternalContexts).toHaveBeenCalledWith(
        ['/path/a', '/path/b']
      );
    });
  });
});

// The mock below mirrors production buildSessionUpdates branching. These pure
// helpers keep each decision isolated so the mock factory stays simple.
function mockLegacyCutoffAt(conversation: any, hasSession: boolean): any {
  if (hasSession && !conversation?.providerSessionId) {
    const legacyMessages = conversation?.messages ?? [];
    return legacyMessages[legacyMessages.length - 1]?.timestamp;
  }
  return conversation?.legacyCutoffAt;
}

function mockPreviousProviderSessionIds(conversation: any, sessionChanged: any, oldSdkSessionId: any): any {
  return sessionChanged
    ? [...new Set([...(conversation?.previousProviderSessionIds || []), oldSdkSessionId])]
    : conversation?.previousProviderSessionIds;
}

function mockResolvedSessionId(
  sessionInvalidated: any,
  isForkSourceOnly: boolean,
  sessionId: any,
  conversation: any,
): string | null {
  if (sessionInvalidated) return null;
  if (isForkSourceOnly) return conversation?.sessionId ?? null;
  return sessionId ?? conversation?.sessionId ?? null;
}

function createMockBuildSessionUpdates(mockService: any) {
  return jest.fn().mockImplementation(({ conversation, sessionInvalidated }: any) => {
    const sessionId = mockService.getSessionId();
    const hasSession = !!sessionId;
    const oldSdkSessionId = conversation?.providerSessionId;
    const sessionChanged = hasSession && sessionId && oldSdkSessionId && sessionId !== oldSdkSessionId;
    const isForkSourceOnly = !!conversation?.forkSource &&
      !conversation?.providerSessionId &&
      sessionId === conversation.forkSource.sessionId;
    const updates: any = {
      sessionId: mockResolvedSessionId(sessionInvalidated, isForkSourceOnly, sessionId, conversation),
      providerSessionId: hasSession && sessionId && !isForkSourceOnly ? sessionId : conversation?.providerSessionId,
      previousProviderSessionIds: mockPreviousProviderSessionIds(conversation, sessionChanged, oldSdkSessionId),
      legacyCutoffAt: mockLegacyCutoffAt(conversation, hasSession),
    };
    if (conversation?.forkSource && sessionId && sessionId !== conversation.forkSource.sessionId) {
      updates.forkSource = undefined;
    }
    return { updates };
  });
}

describe('ConversationController - Previous SDK Session IDs', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockAgentService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentService = {
      getSessionId: jest.fn().mockReturnValue(null),
      setSessionId: jest.fn(),
      consumeSessionInvalidation: jest.fn().mockReturnValue(false),
      buildSessionUpdates: null as any,
    };
    mockAgentService.buildSessionUpdates = createMockBuildSessionUpdates(mockAgentService);
    deps = createMockDeps({
      getAgentService: () => mockAgentService,
    });
    controller = new ConversationController(deps);
  });

  describe('save - session change detection', () => {
    it('should accumulate old providerSessionId when SDK creates new session', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      // Existing conversation has providerSessionId 'session-A'
      (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
        id: 'conv-1',
        messages: [],
        providerSessionId: 'session-A',
        previousProviderSessionIds: undefined,
      });

      // Agent service reports new session 'session-B' (resume failed, new session created)
      mockAgentService.getSessionId.mockReturnValue('session-B');

      await controller.save();

      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          providerSessionId: 'session-B',
          previousProviderSessionIds: ['session-A'],
        })
      );
    });

    it('should preserve existing previousProviderSessionIds when session changes again', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      // Conversation already has previous sessions [A], current is B
      (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
        id: 'conv-1',
        messages: [],
        providerSessionId: 'session-B',
        previousProviderSessionIds: ['session-A'],
      });

      // Agent service reports new session 'session-C'
      mockAgentService.getSessionId.mockReturnValue('session-C');

      await controller.save();

      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          providerSessionId: 'session-C',
          previousProviderSessionIds: ['session-A', 'session-B'],
        })
      );
    });

    it('should not modify previousProviderSessionIds when session has not changed', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
        id: 'conv-1',
        messages: [],
        providerSessionId: 'session-A',
        previousProviderSessionIds: undefined,
      });

      mockAgentService.getSessionId.mockReturnValue('session-A');

      await controller.save();

      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          providerSessionId: 'session-A',
          previousProviderSessionIds: undefined,
        })
      );
    });

    it('should deduplicate session IDs to prevent duplicates from race conditions', async () => {
      deps.state.currentConversationId = 'conv-1';
      deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

      // Simulate a race condition where session-A is already in previousProviderSessionIds
      // but providerSessionId is still session-A (should not duplicate)
      (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
        id: 'conv-1',
        messages: [],
        providerSessionId: 'session-A',
        previousProviderSessionIds: ['session-A'], // Already contains A (from prior bug/race)
      });

      // Agent reports new session-B
      mockAgentService.getSessionId.mockReturnValue('session-B');

      await controller.save();

      // Should deduplicate: [A, A] -> [A]
      expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          providerSessionId: 'session-B',
          previousProviderSessionIds: ['session-A'], // Deduplicated, not ['session-A', 'session-A']
        })
      );
    });
  });
});

describe('ConversationController - Fork Session ID Isolation', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockAgentService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentService = {
      getSessionId: jest.fn().mockReturnValue(null),
      setSessionId: jest.fn(),
      consumeSessionInvalidation: jest.fn().mockReturnValue(false),
      buildSessionUpdates: null as any,
    };
    mockAgentService.buildSessionUpdates = createMockBuildSessionUpdates(mockAgentService);
    deps = createMockDeps({
      getAgentService: () => mockAgentService,
    });
    controller = new ConversationController(deps);
  });

  it('should not persist fork source session ID as conversation own sessionId/providerSessionId', async () => {
    deps.state.currentConversationId = 'fork-conv';
    deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

    // Fork conversation: has forkSource but no own providerSessionId yet
    (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
      id: 'fork-conv',
      messages: [],
      sessionId: null,
      providerSessionId: undefined,
      forkSource: { sessionId: 'source-session-abc', resumeAt: 'assistant-uuid-1' },
    });

    // Agent service has the fork source ID set for resume purposes
    mockAgentService.getSessionId.mockReturnValue('source-session-abc');

    await controller.save();

    expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
      'fork-conv',
      expect.objectContaining({
        sessionId: null,
        providerSessionId: undefined,
      })
    );
  });

  it('should persist new session ID after SDK captures a different session for fork', async () => {
    deps.state.currentConversationId = 'fork-conv';
    deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

    (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
      id: 'fork-conv',
      messages: [],
      sessionId: null,
      providerSessionId: undefined,
      forkSource: { sessionId: 'source-session-abc', resumeAt: 'assistant-uuid-1' },
    });

    // SDK captured a new session (different from fork source)
    mockAgentService.getSessionId.mockReturnValue('new-session-xyz');

    await controller.save();

    expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
      'fork-conv',
      expect.objectContaining({
        sessionId: 'new-session-xyz',
        providerSessionId: 'new-session-xyz',
        forkSource: undefined,
      })
    );
  });

  it('should allow normal session ID persistence when fork metadata is already cleared', async () => {
    deps.state.currentConversationId = 'fork-conv';
    deps.state.messages = [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }];

    // Fork conversation after fork metadata was cleared (has its own providerSessionId)
    (deps.plugin.getConversationSync as jest.Mock).mockReturnValue({
      id: 'fork-conv',
      messages: [],
      sessionId: 'new-session-xyz',
      providerSessionId: 'new-session-xyz',
      forkSource: undefined,
    });

    mockAgentService.getSessionId.mockReturnValue('new-session-xyz');

    await controller.save();

    expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
      'fork-conv',
      expect.objectContaining({
        sessionId: 'new-session-xyz',
        providerSessionId: 'new-session-xyz',
      })
    );
  });
});

describe('ConversationController - switchTo fork path', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockAgentService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentService = {
      getSessionId: jest.fn().mockReturnValue(null),
      syncConversationState: jest.fn(),
      consumeSessionInvalidation: jest.fn().mockReturnValue(false),
      buildSessionUpdates: null as any,
    };
    mockAgentService.buildSessionUpdates = createMockBuildSessionUpdates(mockAgentService);
    deps = createMockDeps({
      getAgentService: () => mockAgentService,
    });
    controller = new ConversationController(deps);
  });

  it('should sync conversation state for pending fork conversations', async () => {
    deps.state.currentConversationId = 'old-conv';

    const forkConversation = {
      id: 'fork-conv',
      messages: [{ id: '1', role: 'user', content: 'forked msg', timestamp: Date.now() }],
      sessionId: null,
      providerSessionId: undefined,
      forkSource: { sessionId: 'source-session-abc', resumeAt: 'assistant-uuid-1' },
    };
    (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult(forkConversation));

    await controller.switchTo('fork-conv');

    await controller.whenHydrated();

    expect(mockAgentService.syncConversationState).toHaveBeenCalledWith(
      forkConversation,
      expect.any(Array),
    );
  });

  it('should resolve to own sessionId when fork already has its own session', async () => {
    deps.state.currentConversationId = 'old-conv';

    const forkConversation = {
      id: 'fork-conv',
      messages: [{ id: '1', role: 'user', content: 'forked msg', timestamp: Date.now() }],
      sessionId: 'own-session-xyz',
      providerSessionId: 'own-session-xyz',
      forkSource: { sessionId: 'source-session-abc', resumeAt: 'assistant-uuid-1' },
    };
    (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult(forkConversation));

    await controller.switchTo('fork-conv');

    await controller.whenHydrated();

    expect(mockAgentService.syncConversationState).toHaveBeenCalledWith(
      forkConversation,
      expect.any(Array),
    );
  });
});

describe('ConversationController - restoreExternalContextPaths null selector', () => {
  it('should return early when external context selector is null', async () => {
    const deps = createMockDeps({
      getExternalContextSelector: () => null,
    });
    const controller = new ConversationController(deps);

    deps.state.currentConversationId = 'old-conv';
    (deps.plugin.switchConversation as jest.Mock).mockResolvedValue(asSwitchResult({
      id: 'new-conv',
      messages: [{ id: '1', role: 'user', content: 'test', timestamp: Date.now() }],
      sessionId: null,
      externalContextPaths: ['/some/path'],
    }));

    // Should not throw even though selector is null
    await expect(controller.switchTo('new-conv')).resolves.not.toThrow();
  });
});

describe('ConversationController - Rewind', () => {
  let controller: ConversationController;
  let deps: ConversationControllerDeps;
  let mockAgentService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentService = {
      getSessionId: jest.fn().mockReturnValue(null),
      setSessionId: jest.fn(),
      consumeSessionInvalidation: jest.fn().mockReturnValue(false),
      rewind: jest.fn().mockResolvedValue({ canRewind: true, filesChanged: ['a.ts'] }),
      getCapabilities: jest.fn().mockReturnValue({ supportsRewind: true }),
      buildSessionUpdates: null as any,
    };
    mockAgentService.buildSessionUpdates = createMockBuildSessionUpdates(mockAgentService);
    deps = createMockDeps({
      getAgentService: () => mockAgentService,
    });
    controller = new ConversationController(deps);
  });

  it('should find prev/response assistants with bounded scan (skipping non-uuid messages)', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'prev-a' },
      { id: 'm2', role: 'assistant', content: 'boundary', timestamp: 2 }, // No uuid
      { id: 'm3', role: 'user', content: 'test', timestamp: 3, userMessageId: 'user-uuid' },
      { id: 'm4', role: 'assistant', content: 'boundary2', timestamp: 4 }, // No uuid
      { id: 'm5', role: 'assistant', content: 'resp', timestamp: 5, assistantMessageId: 'resp-a' },
    ];

    await controller.rewind('m3');

    expect(mockAgentService.rewind).toHaveBeenCalledWith('user-uuid', 'prev-a', 'code-and-conversation');
  });

  it('should show Notice when message ID not found', async () => {
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];

    await controller.rewind('nonexistent');

    expect(mockNotice).toHaveBeenCalled();
    expect(mockAgentService.rewind).not.toHaveBeenCalled();
  });

  it('should show Notice when streaming', async () => {
    deps.state.isStreaming = true;
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];

    await controller.rewind('m2');

    expect(mockNotice).toHaveBeenCalled();
    expect(mockAgentService.rewind).not.toHaveBeenCalled();
  });

  it('should show Notice when user message has no userMessageId', async () => {
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2 }, // No userMessageId
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];

    await controller.rewind('m2');

    expect(mockNotice).toHaveBeenCalled();
    expect(mockAgentService.rewind).not.toHaveBeenCalled();
  });

  it('should show Notice when no previous assistant with uuid exists', async () => {
    deps.state.messages = [
      { id: 'm1', role: 'user', content: 'test', timestamp: 1, userMessageId: 'u1' },
      { id: 'm2', role: 'assistant', content: '', timestamp: 2, assistantMessageId: 'a1' },
    ];

    await controller.rewind('m1');

    expect(mockNotice).toHaveBeenCalled();
    expect(mockAgentService.rewind).not.toHaveBeenCalled();
  });

  it('should show Notice when no response assistant with uuid exists', async () => {
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
    ];

    await controller.rewind('m2');

    expect(mockNotice).toHaveBeenCalled();
    expect(mockAgentService.rewind).not.toHaveBeenCalled();
  });

  it('should show i18n Notice on SDK rewind exception', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];
    mockAgentService.rewind.mockRejectedValue(new Error('SDK error'));

    await controller.rewind('m2');

    expect(mockNotice).toHaveBeenCalled();
    const msg = mockNotice.mock.calls[0][0] as string;
    expect(msg).toContain('SDK error');
  });

  it('should show i18n Notice when canRewind is false', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];
    mockAgentService.rewind.mockResolvedValue({ canRewind: false, error: 'No checkpoints' });

    await controller.rewind('m2');

    expect(mockNotice).toHaveBeenCalled();
    const msg = mockNotice.mock.calls[0][0] as string;
    expect(msg).toContain('No checkpoints');
  });

  it('should truncateAt, save with resumeAtMessageId, and reseed the greeting on success', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'prev-a' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'user-uuid' },
      { id: 'm3', role: 'assistant', content: 'resp', timestamp: 3, assistantMessageId: 'resp-a' },
    ];

    const truncateSpy = jest.spyOn(deps.state, 'truncateAt');

    await controller.rewind('m2');

    expect(mockAgentService.rewind).toHaveBeenCalledWith('user-uuid', 'prev-a', 'code-and-conversation');
    expect(truncateSpy).toHaveBeenCalledWith('m2');
    expect(deps.setTranscriptGreeting).toHaveBeenCalled();
    expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ resumeAtMessageId: 'prev-a' })
    );

    // Should populate input with rewound message content
    const inputEl = deps.getInputEl();
    expect(inputEl.value).toBe('test');
    expect(inputEl.focus).toHaveBeenCalled();

    // Should show success notice with file count
    const noticeMsg = mockNotice.mock.calls[0][0] as string;
    expect(noticeMsg).toContain('1');

    truncateSpy.mockRestore();
  });

  it('should pass conversation-only mode and keep file changes', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'prev-a' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'user-uuid' },
      { id: 'm3', role: 'assistant', content: 'resp', timestamp: 3, assistantMessageId: 'resp-a' },
    ];

    await controller.rewind('m2', 'conversation');

    expect(confirm).toHaveBeenCalledWith(
      deps.plugin.app,
      'Rewind conversation to this point? File changes will be kept.',
      'Rewind',
    );
    expect(mockAgentService.rewind).toHaveBeenCalledWith('user-uuid', 'prev-a', 'conversation');
    expect(deps.plugin.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ resumeAtMessageId: 'prev-a' })
    );
    const noticeMsg = mockNotice.mock.calls[0][0] as string;
    expect(noticeMsg).toBe('Rewound conversation; file changes kept');
  });

  it('should abort when confirmation is declined', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];
    (confirm as jest.Mock).mockResolvedValueOnce(false);

    await controller.rewind('m2');

    expect(mockAgentService.rewind).not.toHaveBeenCalled();
    expect(mockNotice).not.toHaveBeenCalled();
  });

  it('should re-check streaming state after confirmation dialog', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'a1' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'u1' },
      { id: 'm3', role: 'assistant', content: '', timestamp: 3, assistantMessageId: 'a2' },
    ];
    (confirm as jest.Mock).mockImplementationOnce(async () => {
      deps.state.isStreaming = true;
      return true;
    });

    await controller.rewind('m2');

    expect(mockAgentService.rewind).not.toHaveBeenCalled();
    expect(mockNotice).toHaveBeenCalled();
  });

  it('should show a warning notice when rewind succeeded but save failed', async () => {
    deps.state.currentConversationId = 'conv-1';
    deps.state.messages = [
      { id: 'm1', role: 'assistant', content: '', timestamp: 1, assistantMessageId: 'prev-a' },
      { id: 'm2', role: 'user', content: 'test', timestamp: 2, userMessageId: 'user-uuid' },
      { id: 'm3', role: 'assistant', content: 'resp', timestamp: 3, assistantMessageId: 'resp-a' },
    ];

    (deps.plugin.updateConversation as jest.Mock).mockRejectedValueOnce(new Error('Save failed'));

    await controller.rewind('m2');

    expect(mockAgentService.rewind).toHaveBeenCalledWith('user-uuid', 'prev-a', 'code-and-conversation');
    const msg = mockNotice.mock.calls[0][0] as string;
    expect(msg).toContain('Save failed');
  });

  describe('Inline prompt dismissal', () => {
    it('dismisses pending inline prompts during createNew()', async () => {
      const dismissFn = jest.fn();
      deps = createMockDeps({ dismissPendingInlinePrompts: dismissFn });
      controller = new ConversationController(deps);

      await controller.createNew();

      expect(dismissFn).toHaveBeenCalled();
    });

    it('dismisses pending inline prompts during switchTo()', async () => {
      const dismissFn = jest.fn();
      deps = createMockDeps({ dismissPendingInlinePrompts: dismissFn });
      controller = new ConversationController(deps);
      deps.state.currentConversationId = 'old-conv';

      await controller.switchTo('switched-conv');

      await controller.whenHydrated();

      expect(dismissFn).toHaveBeenCalled();
    });
  });
});
