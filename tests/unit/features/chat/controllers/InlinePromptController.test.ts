import { createMockEl } from '@test/helpers/mockElement';

import type { InlineCardMounter } from '@/features/chat/controllers/inlineCardMount';
import {
  InlinePromptController,
  type InlinePromptControllerDeps,
} from '@/features/chat/controllers/InlinePromptController';

function makeMounter(overrides: Partial<InlineCardMounter> = {}): InlineCardMounter {
  return {
    mountApproval: jest.fn(() => ({ unmount: jest.fn() })),
    mountAsk: jest.fn(() => ({ unmount: jest.fn() })),
    mountExitPlanMode: jest.fn(() => ({ unmount: jest.fn() })),
    mountPlanApproval: jest.fn(() => ({ unmount: jest.fn() })),
    ...overrides,
  };
}

function setup(overrides: Partial<InlinePromptControllerDeps> = {}) {
  const inputContainerEl = createMockEl();
  const state = { needsAttention: false, planFilePath: null } as never;
  const mountInlineCard = overrides.mountInlineCard ?? makeMounter();
  const deps: InlinePromptControllerDeps = {
    state,
    getInputContainerEl: () => inputContainerEl as never,
    mountInlineCard,
    hideThinkingIndicator: jest.fn(),
    getPlanPathPrefix: () => undefined,
    ...overrides,
  };
  return {
    controller: new InlinePromptController(deps),
    inputContainerEl,
    mountInlineCard,
    state: state as never as { needsAttention: boolean; planFilePath: string | null },
  };
}

/** A mock element with a parent, so `requireParentEl()` resolves the mount host. */
function attachedInputContainer() {
  const parent = createMockEl();
  const el = createMockEl();
  (el as never as { parentElement: unknown }).parentElement = parent;
  return { el, parent };
}

describe('InlinePromptController', () => {
  describe('dismissPendingApprovalPrompt', () => {
    it('unmounts and clears only the approval card', () => {
      const { controller } = setup();
      const approval = { unmount: jest.fn() };
      const ask = { unmount: jest.fn() };
      (controller as never as { pendingApprovalInline: unknown }).pendingApprovalInline = approval;
      (controller as never as { pendingAskInline: unknown }).pendingAskInline = ask;

      controller.dismissPendingApprovalPrompt();

      expect(approval.unmount).toHaveBeenCalled();
      expect((controller as never as { pendingApprovalInline: unknown }).pendingApprovalInline).toBeNull();
      // The ask card is untouched by the approval-only dismissal.
      expect(ask.unmount).not.toHaveBeenCalled();
    });
  });

  describe('dismissPendingApproval', () => {
    it('unmounts every pending card, clears them, and resets the attention flag', () => {
      const { controller, state } = setup();
      state.needsAttention = true;
      const approval = { unmount: jest.fn() };
      const ask = { unmount: jest.fn() };
      const exitPlan = { unmount: jest.fn() };
      const plan = { unmount: jest.fn() };
      const c = controller as never as Record<string, unknown>;
      c.pendingApprovalInline = approval;
      c.pendingAskInline = ask;
      c.pendingExitPlanModeInline = exitPlan;
      c.pendingPlanApproval = plan;

      controller.dismissPendingApproval();

      expect(approval.unmount).toHaveBeenCalled();
      expect(ask.unmount).toHaveBeenCalled();
      expect(exitPlan.unmount).toHaveBeenCalled();
      expect(plan.unmount).toHaveBeenCalled();
      expect(c.pendingApprovalInline).toBeNull();
      expect(c.pendingAskInline).toBeNull();
      expect(c.pendingExitPlanModeInline).toBeNull();
      expect(c.pendingPlanApproval).toBeNull();
      expect(state.needsAttention).toBe(false);
    });

    it('is a no-op when nothing is pending', () => {
      const { controller } = setup();
      expect(() => controller.dismissPendingApproval()).not.toThrow();
    });

    it('resets input-container visibility left hidden by an open prompt', () => {
      const { controller, inputContainerEl } = setup();
      // Simulate a prompt having hidden the input container twice.
      (controller as never as { inputContainerHideDepth: number }).inputContainerHideDepth = 2;
      inputContainerEl.addClass('specorator-hidden');

      controller.dismissPendingApproval();

      expect(inputContainerEl.hasClass('specorator-hidden')).toBe(false);
      expect((controller as never as { inputContainerHideDepth: number }).inputContainerHideDepth).toBe(0);
    });
  });

  describe('handleApprovalRequest', () => {
    it('mounts the approval card, raises attention, and settles with the card decision', async () => {
      const { el } = attachedInputContainer();
      let capturedResolve: (d: unknown) => void = () => {};
      const mountApproval = jest.fn((_host: HTMLElement, props: { resolve: (d: unknown) => void }) => {
        capturedResolve = props.resolve;
        return { unmount: jest.fn() };
      });
      const { controller, state } = setup({
        getInputContainerEl: () => el as never,
        mountInlineCard: makeMounter({ mountApproval: mountApproval as never }),
      });

      const promise = controller.handleApprovalRequest('Bash', {}, 'run ls');
      expect(mountApproval).toHaveBeenCalled();
      expect(state.needsAttention).toBe(true);

      capturedResolve('allow');
      await expect(promise).resolves.toBe('allow');
      // Settlement restores the input container + clears attention.
      expect(state.needsAttention).toBe(false);
    });
  });

  describe('cards that resolve synchronously during mount', () => {
    it('unmounts the leftover handle and leaves the pending pointer null', async () => {
      const { el } = attachedInputContainer();
      const handle = { unmount: jest.fn() };
      // Reproduce InlineAskUserQuestion's zero-question path: the card resolves
      // null SYNCHRONOUSLY inside onMounted, i.e. before mountAsk returns its
      // handle — Vue runs mounted hooks synchronously during app.mount().
      const mountAsk = jest.fn((_host: HTMLElement, props: { resolve: (d: unknown) => void }) => {
        props.resolve(null);
        return handle;
      });
      const { controller, state } = setup({
        getInputContainerEl: () => el as never,
        mountInlineCard: makeMounter({ mountAsk: mountAsk as never }),
      });

      // (a) The promise resolves to the fallback (null).
      await expect(controller.handleAskUserQuestion({})).resolves.toBeNull();

      // (b) The leftover handle is unmounted (deferred via queueMicrotask).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(handle.unmount).toHaveBeenCalledTimes(1);

      // (c) The already-settled handle was never stored as pending, so a later
      // dismiss does not target the stale card / double-unmount.
      expect((controller as never as { pendingAskInline: unknown }).pendingAskInline).toBeNull();
      controller.dismissPendingApproval();
      expect(handle.unmount).toHaveBeenCalledTimes(1);
      expect(state.needsAttention).toBe(false);
    });
  });

  describe('showPlanApproval', () => {
    it('resolves to no decision when the input container is detached', async () => {
      const detached = createMockEl();
      // No parentElement → detached.
      const { controller } = setup({ getInputContainerEl: () => detached as never });

      await expect(controller.showPlanApproval()).resolves.toEqual({
        decision: null,
        invalidated: false,
      });
    });
  });
});
