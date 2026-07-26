import { createMockEl } from '@test/helpers/mockElement';
import { Notice } from 'obsidian';

import type { ProviderCapabilities } from '@/core/providers/types';
import type { ChatRuntime } from '@/core/runtime/ChatRuntime';
import {
  QueuedMessageController,
  type QueuedMessageControllerDeps,
} from '@/features/chat/controllers/QueuedMessageController';
import { ChatState } from '@/features/chat/state/ChatState';
import type { QueuedMessage } from '@/features/chat/state/types';
import { t } from '@/i18n/i18n';

function createCapabilities(overrides: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
    providerId: 'codex',
    supportsPersistentRuntime: true,
    supportsNativeHistory: true,
    supportsPlanMode: true,
    supportsRewind: false,
    supportsFork: true,
    supportsProviderCommands: false,
    supportsTurnSteer: true,
    reasoningControl: 'effort',
    ...overrides,
  } as ProviderCapabilities;
}

function createMockAgentService(overrides: Record<string, jest.Mock> = {}): ChatRuntime {
  return {
    providerId: 'codex',
    prepareTurn: jest.fn().mockImplementation((request: any) => ({
      request,
      persistedContent: request.text,
      isCompact: false,
    })),
    steer: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as ChatRuntime;
}

function createMockFileContextManager() {
  return {
    markCurrentNoteSent: jest.fn(),
    clearAttachedPills: jest.fn(),
  };
}

function createMockImageContextManager() {
  return {
    getAttachedImages: jest.fn().mockReturnValue([]),
    setImages: jest.fn(),
  };
}

function makeQueuedMessage(content: string, overrides: Partial<QueuedMessage> = {}): QueuedMessage {
  return {
    content,
    images: undefined,
    editorContext: null,
    browserContext: null,
    canvasContext: null,
    turnRequest: {
      text: content,
      images: undefined,
      editorSelection: null,
      browserSelection: null,
      canvasSelection: null,
    },
    ...overrides,
  };
}

interface Harness {
  controller: QueuedMessageController;
  state: ChatState;
  deps: QueuedMessageControllerDeps;
  agentService: ChatRuntime;
  inputEl: { value: string; focus: jest.Mock };
  fileContextManager: ReturnType<typeof createMockFileContextManager>;
  imageContextManager: ReturnType<typeof createMockImageContextManager>;
  requestSend: jest.Mock;
  onSteerCommitted: jest.Mock;
  plugin: { getConversationSync: jest.Mock; agentRosterStore: { get: jest.Mock } };
  rosterGet: jest.Mock;
  loggerError: jest.Mock;
}

function createHarness(overrides: Partial<QueuedMessageControllerDeps> = {}): Harness {
  const state = new ChatState();
  const queueIndicatorEl = createMockEl();
  queueIndicatorEl.style.display = 'none';
  state.queueIndicatorEl = queueIndicatorEl as any;

  const inputEl = { value: '', focus: jest.fn() };
  const fileContextManager = createMockFileContextManager();
  const imageContextManager = createMockImageContextManager();
  const agentService = createMockAgentService();
  const requestSend = jest.fn();
  const onSteerCommitted = jest.fn();

  // Default plugin: no Team Chat DM surface (getConversationSync → null), so the sidebar
  // steer guard short-circuits before any roster lookup. DM tests override getConversationSync.
  const rosterGet = jest.fn().mockResolvedValue({ id: 'roster:a' });
  const loggerError = jest.fn();
  const plugin = {
    getConversationSync: jest.fn(() => null),
    agentRosterStore: { get: rosterGet },
    logger: { scope: jest.fn(() => ({ error: loggerError })) },
  } as unknown as QueuedMessageControllerDeps['plugin'];

  const deps: QueuedMessageControllerDeps = {
    state,
    plugin,
    getAgentService: () => agentService,
    getActiveCapabilities: () => createCapabilities(),
    getInputEl: () => inputEl as unknown as HTMLTextAreaElement,
    getImageContextManager: () => imageContextManager as any,
    getFileContextManager: () => fileContextManager as any,
    resetInputHeight: jest.fn(),
    requestSend,
    onSteerCommitted,
    ...overrides,
  };

  const controller = new QueuedMessageController(deps);
  return {
    controller,
    state,
    deps,
    agentService,
    inputEl,
    fileContextManager,
    imageContextManager,
    requestSend,
    onSteerCommitted,
    plugin: plugin as unknown as Harness['plugin'],
    rosterGet,
    loggerError,
  };
}

describe('QueuedMessageController', () => {
  describe('queue create / merge / clear', () => {
    it('creates a queued message from a turn request preserving content and images', () => {
      const { controller } = createHarness();
      const images = [{ id: 'img1', name: 'a.png' }] as any;
      const queued = controller.createQueuedMessage('hello', {
        text: 'hello',
        images,
        editorSelection: null,
        browserSelection: null,
        canvasSelection: null,
      });
      expect(queued.content).toBe('hello');
      expect(queued.images).toEqual(images);
      expect(queued.turnRequest?.text).toBe('hello');
    });

    it('merges two queued messages by concatenating display content', () => {
      const { controller } = createHarness();
      const merged = controller.mergeQueuedMessages(
        makeQueuedMessage('first'),
        makeQueuedMessage('second'),
      );
      expect(merged.content).toBe('first\n\nsecond');
    });

    it('returns a clone (not the same ref) when merging into an empty queue', () => {
      const { controller } = createHarness();
      const incoming = makeQueuedMessage('only');
      const merged = controller.mergeQueuedMessages(null, incoming);
      expect(merged.content).toBe('only');
      expect(merged).not.toBe(incoming);
      expect(merged.turnRequest).not.toBe(incoming.turnRequest);
    });

    it('clears the queued message and refreshes the indicator', () => {
      const { controller, state } = createHarness();
      state.queuedMessage = makeQueuedMessage('queued');
      controller.clearQueuedMessage();
      expect(state.queuedMessage).toBeNull();
      expect((state.queueIndicatorEl as any).style.display).toBe('none');
    });

    it('shows the queue indicator with queued text', () => {
      const { controller, state } = createHarness();
      state.queuedMessage = makeQueuedMessage('queued text');
      controller.updateQueueIndicator();
      const el = state.queueIndicatorEl as any;
      expect(el.querySelector('.specorator-queue-indicator-text')?.textContent)
        .toBe('⌙ Queued: queued text');
      expect(el.style.display).toBe('flex');
    });
  });

  describe('processQueuedMessage', () => {
    it('dequeues and dispatches the snapshot through requestSend', () => {
      jest.useFakeTimers();
      try {
        const { controller, state, requestSend } = createHarness();
        state.queuedMessage = makeQueuedMessage('go now');

        controller.processQueuedMessage();
        expect(state.queuedMessage).toBeNull();

        jest.runAllTimers();
        expect(requestSend).toHaveBeenCalledWith(expect.objectContaining({
          content: 'go now',
          turnRequestOverride: expect.objectContaining({ text: 'go now' }),
        }));
      } finally {
        jest.useRealTimers();
      }
    });

    it('no-ops when there is no queued message', () => {
      jest.useFakeTimers();
      try {
        const { controller, requestSend } = createHarness();
        controller.processQueuedMessage();
        jest.runAllTimers();
        expect(requestSend).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    // Round-41: the AUTO-dequeue clears state.queuedMessage BEFORE re-entering
    // InputController.sendMessage, whose removed-agent guard then REJECTS the turn — so a
    // follow-up queued in a DM whose agent was deleted was silently lost. Gate the same
    // predicate BEFORE dequeuing: leave the queued message intact and notify once.
    it('preserves the queued follow-up (text + images) when the DM agent was removed (Round-41)', async () => {
      const { controller, state, requestSend, plugin, rosterGet } = createHarness();
      (Notice as jest.Mock).mockClear();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:gone' });
      rosterGet.mockResolvedValue(null); // agent deleted from the roster
      const images = [{ id: 'img1', name: 'a.png' }] as any;
      state.queuedMessage = makeQueuedMessage('lost follow-up', { images });

      controller.processQueuedMessage();
      await Promise.resolve(); // flush the roster-lookup microtask
      await Promise.resolve();

      // Queue intact (self-healing — re-creating the agent lets it send), nothing dispatched,
      // user notified once.
      expect(state.queuedMessage?.content).toBe('lost follow-up');
      expect(state.queuedMessage?.images).toEqual(images);
      expect(requestSend).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith(t('teamChat.agentRemoved'));
    });

    it('dequeues and sends normally in a DM whose bound agent is still present (Round-41)', async () => {
      jest.useFakeTimers();
      try {
        const { controller, state, requestSend, plugin, rosterGet } = createHarness();
        state.currentConversationId = 'conv-dm';
        plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:a' });
        rosterGet.mockResolvedValue({ id: 'roster:a' }); // present
        state.queuedMessage = makeQueuedMessage('present send');

        controller.processQueuedMessage();
        await Promise.resolve(); // flush roster lookup → dispatch schedules its setTimeout
        await Promise.resolve();
        jest.runAllTimers();

        expect(state.queuedMessage).toBeNull();
        expect(requestSend).toHaveBeenCalledWith(expect.objectContaining({ content: 'present send' }));
      } finally {
        jest.useRealTimers();
      }
    });

    it('never consults the roster on a sidebar chat auto-dequeue (Round-41)', () => {
      jest.useFakeTimers();
      try {
        const { controller, state, requestSend, rosterGet } = createHarness();
        // Default getConversationSync → null → not a DM → the sync surface check short-circuits
        // before any roster lookup (microtask-free sidebar path).
        state.queuedMessage = makeQueuedMessage('sidebar dequeue');

        controller.processQueuedMessage();
        expect(state.queuedMessage).toBeNull(); // cleared synchronously, as before
        jest.runAllTimers();

        expect(rosterGet).not.toHaveBeenCalled();
        expect(requestSend).toHaveBeenCalledWith(expect.objectContaining({ content: 'sidebar dequeue' }));
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('steering', () => {
    function setupSteerable(steerOverrides: Record<string, jest.Mock> = {}) {
      const agentService = createMockAgentService(steerOverrides);
      const harness = createHarness({ getAgentService: () => agentService });
      harness.state.isStreaming = true;
      return { ...harness, agentService };
    }

    it('steers the queued message and records it as committed on success', async () => {
      const { controller, state, onSteerCommitted, agentService } = setupSteerable();
      state.queuedMessage = makeQueuedMessage('steer me');

      await (controller as any).steerQueuedMessage();

      expect(agentService.steer).toHaveBeenCalled();
      expect(state.queuedMessage).toBeNull();
      expect(onSteerCommitted).toHaveBeenCalledWith(expect.objectContaining({
        displayContent: 'steer me',
      }));
      // pending steer state is left in flight until the host reconciles the boundary
      expect((controller as any).pendingSteerMessage).not.toBeNull();
    });

    // Round-40 Fix 3: steerQueuedMessage bypasses InputController.sendMessage's removed-agent
    // guard, so it must apply the same gate — otherwise "Steer Now" commits a turn in a
    // read-only (agent-removed) DM without the agent's persona/model.
    it('blocks + notices steering a DM whose agent was removed from the roster (Round-40)', async () => {
      const { controller, state, agentService, plugin, rosterGet } = setupSteerable();
      (Notice as jest.Mock).mockClear();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:gone' });
      rosterGet.mockResolvedValue(null); // agent deleted from the roster
      state.queuedMessage = makeQueuedMessage('steer into removed DM');

      await (controller as any).steerQueuedMessage();

      // Turn blocked (no prepare/steer), queued message intact (self-healing), user notified.
      expect(agentService.prepareTurn).not.toHaveBeenCalled();
      expect(agentService.steer).not.toHaveBeenCalled();
      expect(state.queuedMessage?.content).toBe('steer into removed DM');
      expect((controller as any).steerInFlight).toBe(false);
      expect(Notice).toHaveBeenCalledWith(t('teamChat.agentRemoved'));
    });

    it('steers normally in a DM whose bound agent is still present', async () => {
      const { controller, state, agentService, plugin, rosterGet } = setupSteerable();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:a' });
      rosterGet.mockResolvedValue({ id: 'roster:a' }); // present
      state.queuedMessage = makeQueuedMessage('steer present DM');

      await (controller as any).steerQueuedMessage();

      expect(agentService.steer).toHaveBeenCalled();
    });

    it('never consults the roster when steering a sidebar chat (no DM surface)', async () => {
      const { controller, state, agentService, rosterGet } = setupSteerable();
      // Default plugin.getConversationSync → null → not a Team Chat DM; the sync surface
      // check short-circuits before the roster lookup (microtask-free sidebar path).
      state.queuedMessage = makeQueuedMessage('steer sidebar');

      await (controller as any).steerQueuedMessage();

      expect(rosterGet).not.toHaveBeenCalled();
      expect(agentService.steer).toHaveBeenCalled();
    });

    // Round-53 Fix 2: the removed-agent roster read ran BEFORE the reservation, so DURING the
    // await state.queuedMessage was still mutable and steerInFlight false — a concurrent
    // steer/discard could tear cloneQueuedMessage's input out from under it (null deref).
    // Reserving BEFORE the roster read makes the queue mutation atomic.
    it('does not null-deref when a second steer races the roster read (steers once) (Round-53)', async () => {
      const { controller, state, agentService, plugin, rosterGet } = setupSteerable();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:a' });
      let resolveRoster: (v: any) => void = () => {};
      rosterGet.mockReturnValue(new Promise((r) => { resolveRoster = r; }));
      state.queuedMessage = makeQueuedMessage('steer once');

      const p1 = (controller as any).steerQueuedMessage();
      const p2 = (controller as any).steerQueuedMessage(); // races p1's roster await
      resolveRoster!({ id: 'roster:a' });
      await Promise.all([p1, p2]);

      // The second steer bailed on the steerInFlight guard; no null-deref, steered exactly once.
      expect(agentService.steer).toHaveBeenCalledTimes(1);
    });

    it('does not null-deref when the queue is discarded during the roster read (Round-53)', async () => {
      const { controller, state, agentService, plugin, rosterGet } = setupSteerable();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:a' });
      let resolveRoster: (v: any) => void = () => {};
      rosterGet.mockReturnValue(new Promise((r) => { resolveRoster = r; }));
      state.queuedMessage = makeQueuedMessage('reserved steer');

      const call = (controller as any).steerQueuedMessage();
      // A discard lands while the roster read is in flight. Reserving first means it operates on
      // the already-nulled queue instead of tearing cloneQueuedMessage(state.queuedMessage) apart.
      controller.clearQueuedMessage();
      resolveRoster!({ id: 'roster:a' });
      await call; // buggy code null-derefs cloneQueuedMessage(null) here

      expect(agentService.steer).toHaveBeenCalledTimes(1);
      expect(state.queuedMessage).toBeNull();
    });

    // Round-53 Fix 2 (reordering keeps Round-40 intact): the removed-agent guard now runs AFTER
    // the reservation, so a removed agent must UN-reserve — restore the queued message + notice.
    it('restores the reservation when the DM agent was removed after reserving (Round-53)', async () => {
      const { controller, state, agentService, plugin, rosterGet } = setupSteerable();
      (Notice as jest.Mock).mockClear();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:gone' });
      rosterGet.mockResolvedValue(null); // agent deleted from the roster
      state.queuedMessage = makeQueuedMessage('reserve then removed');

      await (controller as any).steerQueuedMessage();

      expect(agentService.steer).not.toHaveBeenCalled();
      expect(state.queuedMessage?.content).toBe('reserve then removed'); // reservation restored
      expect((controller as any).pendingSteerMessage).toBeNull();
      expect((controller as any).steerInFlight).toBe(false);
      expect(Notice).toHaveBeenCalledWith(t('teamChat.agentRemoved'));
    });

    // Round-59 Fix 1: the removed-agent steer guard's roster read can REJECT — AgentRosterStore.get
    // awaits adapter.exists OUTSIDE its try/catch, so a vault-I/O error rejects it. On the pre-fix
    // code that rejection is unhandled AND strands the reservation in the non-editable "Steering"
    // state until the turn ends. Catch it and roll the reservation back identically to the
    // removed-agent case (fail-safe: an unconfirmed agent must not steer a turn without its
    // persona/model), log, notify transiently, and leave the queue editable for a retry. This is the
    // steer twin of the send-path Round-58 guard (confirmDmAgentOrRestoreComposer).
    it('rolls back the reservation when the roster read REJECTS during the steer guard (Round-59)', async () => {
      const { controller, state, agentService, plugin, rosterGet, loggerError } = setupSteerable();
      (Notice as jest.Mock).mockClear();
      state.currentConversationId = 'conv-dm';
      plugin.getConversationSync.mockReturnValue({ surface: 'team-chat', boundAgentId: 'roster:a' });
      rosterGet.mockRejectedValue(new Error('vault io')); // exists() throws → get() rejects
      state.queuedMessage = makeQueuedMessage('reserve then read fails');

      // No unhandled rejection escapes — the guard resolves rather than throwing.
      await expect((controller as any).steerQueuedMessage()).resolves.toBeUndefined();

      // Reservation rolled back → queued message intact + editable again (steerInFlight false),
      // nothing steered, the read failure logged, and the transient notice shown.
      expect(agentService.steer).not.toHaveBeenCalled();
      expect(state.queuedMessage?.content).toBe('reserve then read fails');
      expect((controller as any).pendingSteerMessage).toBeNull();
      expect((controller as any).steerInFlight).toBe(false);
      expect(loggerError).toHaveBeenCalledWith('roster read failed during steer guard', expect.any(Error));
      expect(Notice).toHaveBeenCalledWith(t('teamChat.agentVerifyFailed'));
    });

    it('guards against concurrent steer while one is in flight', async () => {
      let resolveSteer: (v: boolean) => void = () => {};
      const steer = jest.fn().mockReturnValue(new Promise<boolean>((r) => { resolveSteer = r; }));
      const { controller, state, agentService } = setupSteerable({ steer });
      state.queuedMessage = makeQueuedMessage('first steer');

      const firstCall = (controller as any).steerQueuedMessage();
      // queuedMessage consumed; a re-queued message must not start a second steer
      state.queuedMessage = makeQueuedMessage('second steer');
      await (controller as any).steerQueuedMessage();

      expect(agentService.steer).toHaveBeenCalledTimes(1);

      resolveSteer(true);
      await firstCall;
    });

    it('re-checks cancellation after the async steer and does not commit', async () => {
      let resolveSteer: (v: boolean) => void = () => {};
      const steer = jest.fn().mockReturnValue(new Promise<boolean>((r) => { resolveSteer = r; }));
      const { controller, state, onSteerCommitted } = setupSteerable({ steer });
      state.queuedMessage = makeQueuedMessage('mid-cancel');

      const call = (controller as any).steerQueuedMessage();
      // user cancels while the steer is awaiting acceptance
      state.cancelRequested = true;
      resolveSteer(true);
      await call;

      expect(onSteerCommitted).not.toHaveBeenCalled();
    });

    it('restores the message to the queue on steer rejection while streaming', async () => {
      const steer = jest.fn().mockResolvedValue(false);
      const { controller, state, onSteerCommitted } = setupSteerable({ steer });
      state.queuedMessage = makeQueuedMessage('rejected steer');

      await (controller as any).steerQueuedMessage();

      expect(onSteerCommitted).not.toHaveBeenCalled();
      expect(state.queuedMessage).not.toBeNull();
      expect(state.queuedMessage?.content).toBe('rejected steer');
      expect((controller as any).pendingSteerMessage).toBeNull();
      expect((controller as any).steerInFlight).toBe(false);
    });

    it('restores the message to the composer on steer rejection when no longer streaming', async () => {
      const steer = jest.fn().mockImplementation(async () => false);
      const harness = createHarness({ getAgentService: () => createMockAgentService({ steer }) });
      harness.state.isStreaming = true;
      harness.state.queuedMessage = makeQueuedMessage('rejected steer');

      // Streaming ends concurrently before the rejection lands.
      const call = (harness.controller as any).steerQueuedMessage();
      harness.state.isStreaming = false;
      await call;

      expect(harness.inputEl.value).toBe('rejected steer');
      expect(harness.state.queuedMessage).toBeNull();
    });

    it('does not steer when the provider lacks turn-steer support', async () => {
      const agentService = createMockAgentService();
      const harness = createHarness({
        getAgentService: () => agentService,
        getActiveCapabilities: () => createCapabilities({ supportsTurnSteer: false }),
      });
      harness.state.isStreaming = true;
      harness.state.queuedMessage = makeQueuedMessage('no steer');

      await (harness.controller as any).steerQueuedMessage();

      expect(agentService.steer).not.toHaveBeenCalled();
      expect(harness.state.queuedMessage).not.toBeNull();
    });
  });

  describe('restorePendingSteerMessageToQueue', () => {
    it('folds an unreconciled pending steer message back into the queue', () => {
      const { controller, state } = createHarness();
      (controller as any).pendingSteerMessage = makeQueuedMessage('pending steer');
      (controller as any).steerInFlight = true;
      state.queuedMessage = makeQueuedMessage('still queued');

      controller.restorePendingSteerMessageToQueue();

      expect(state.queuedMessage?.content).toBe('pending steer\n\nstill queued');
      expect((controller as any).pendingSteerMessage).toBeNull();
      expect((controller as any).steerInFlight).toBe(false);
    });

    it('is a no-op when there is no pending steer message', () => {
      const { controller, state } = createHarness();
      state.queuedMessage = makeQueuedMessage('only queued');
      controller.restorePendingSteerMessageToQueue();
      expect(state.queuedMessage?.content).toBe('only queued');
    });
  });

  describe('restorePendingMessagesToInput', () => {
    it('merges pending steer and queued messages back into the composer on cancel', () => {
      const { controller, state, inputEl } = createHarness();
      (controller as any).pendingSteerMessage = makeQueuedMessage('steer part');
      state.queuedMessage = makeQueuedMessage('queue part');

      controller.restorePendingMessagesToInput();

      expect(inputEl.value).toBe('steer part\n\nqueue part');
      expect(state.queuedMessage).toBeNull();
      expect((controller as any).pendingSteerMessage).toBeNull();
      expect((controller as any).steerInFlight).toBe(false);
    });
  });

  describe('withdrawQueuedMessageToComposer', () => {
    it('moves the queued message into the input and clears the queue', () => {
      const { controller, state, inputEl } = createHarness();
      state.queuedMessage = makeQueuedMessage('withdraw me');

      controller.withdrawQueuedMessageToComposer();

      expect(inputEl.value).toBe('withdraw me');
      expect(state.queuedMessage).toBeNull();
    });
  });
});
