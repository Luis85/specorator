import { createMockEl } from '@test/helpers/mockElement';

import type { ChatMessage, ImageAttachment } from '@/core/types';
import {
  bakeResponseDurationFooter,
  captureComposerRollbackSnapshot,
  type ComposerSendContext,
  resolveComposerSend,
  rollbackOptimisticOutgoingTurn,
} from '@/features/chat/controllers/composerSendPhases';
import { ChatState } from '@/features/chat/state/ChatState';

function makeInputEl(value: string): HTMLTextAreaElement {
  return { value } as HTMLTextAreaElement;
}

describe('resolveComposerSend', () => {
  it('uses the composer input when no content override is given', () => {
    const send = resolveComposerSend({
      inputEl: makeInputEl('  typed draft  '),
      imageContextManager: null,
      fileContextManager: null,
    });

    expect(send.content).toBe('typed draft');
    expect(send.shouldUseInput).toBe(true);
    expect(send.consumesComposerDraft).toBe(false);
  });

  it('ignores the composer draft on a plain content-override send', () => {
    const send = resolveComposerSend({
      inputEl: makeInputEl('typed draft'),
      imageContextManager: null,
      fileContextManager: null,
      overrides: { content: 'Implement the plan.' },
    });

    expect(send.content).toBe('Implement the plan.');
    expect(send.shouldUseInput).toBe(false);
    expect(send.consumesComposerDraft).toBe(false);
  });

  it('folds the composer draft below the override when includeComposerDraft is set', () => {
    const send = resolveComposerSend({
      inputEl: makeInputEl('  my chat context  '),
      imageContextManager: null,
      fileContextManager: null,
      overrides: { content: 'Summarize this.', includeComposerDraft: true },
    });

    expect(send.content).toBe('Summarize this.\n\nmy chat context');
    expect(send.shouldUseInput).toBe(false);
    expect(send.consumesComposerDraft).toBe(true);
  });

  it('sends the override alone when includeComposerDraft is set but the draft is blank', () => {
    const send = resolveComposerSend({
      inputEl: makeInputEl('   '),
      imageContextManager: null,
      fileContextManager: null,
      overrides: { content: 'Summarize this.', includeComposerDraft: true },
    });

    expect(send.content).toBe('Summarize this.');
    expect(send.consumesComposerDraft).toBe(true);
  });

  it('ignores includeComposerDraft when there is no content override', () => {
    const send = resolveComposerSend({
      inputEl: makeInputEl('typed draft'),
      imageContextManager: null,
      fileContextManager: null,
      overrides: { includeComposerDraft: true },
    });

    expect(send.content).toBe('typed draft');
    expect(send.shouldUseInput).toBe(true);
    expect(send.consumesComposerDraft).toBe(false);
  });
});

describe('composer rollback snapshot restores image attachments', () => {
  const img: ImageAttachment = {
    id: 'i1', name: 'a.png', mediaType: 'image/png', data: 'AAAA', size: 4, source: 'paste',
  };

  function makeSend(images: ImageAttachment[]): { send: ComposerSendContext; setImages: jest.Mock } {
    const setImages = jest.fn();
    const send = {
      content: 'hi',
      shouldUseInput: true,
      consumesComposerDraft: false,
      hasImages: images.length > 0,
      inputEl: makeInputEl('hi'),
      imageContextManager: {
        getAttachedImages: () => images,
        setImages,
      },
      fileContextManager: null,
    } as unknown as ComposerSendContext;
    return { send, setImages };
  }

  it('captures the attached images and restores them via setImages on rollback', () => {
    const { send, setImages } = makeSend([img]);
    const snapshot = captureComposerRollbackSnapshot(send);
    expect(snapshot.attachedImages).toEqual([img]);

    const state = new ChatState();
    rollbackOptimisticOutgoingTurn(state, snapshot, send, 'u1', 'a1', () => {});

    // The images the failed send cleared are put back for retry.
    expect(setImages).toHaveBeenCalledWith([img]);
  });

  it('restores an empty image list when none were attached', () => {
    const { send, setImages } = makeSend([]);
    const snapshot = captureComposerRollbackSnapshot(send);
    rollbackOptimisticOutgoingTurn(new ChatState(), snapshot, send, 'u1', 'a1', () => {});
    expect(setImages).toHaveBeenCalledWith([]);
  });
});

describe('bakeResponseDurationFooter', () => {
  function makeAssistantMsg(): ChatMessage {
    return { id: 'a1', role: 'assistant', content: '', timestamp: 0, contentBlocks: [] };
  }

  it('sets durationSeconds + durationFlavorWord on the message (Vue footer data source)', () => {
    const state = new ChatState();
    state.responseStartTime = performance.now() - 5000;
    const msg = makeAssistantMsg();

    bakeResponseDurationFooter(state, msg, false);

    expect(msg.durationSeconds).toBeGreaterThanOrEqual(4);
    expect(typeof msg.durationFlavorWord).toBe('string');
    expect(msg.durationFlavorWord!.length).toBeGreaterThan(0);
  });

  it('mirrors the duration into the live DOM footer (dual-write)', () => {
    const state = new ChatState();
    state.responseStartTime = performance.now() - 5000;
    state.currentContentEl = createMockEl();
    const msg = makeAssistantMsg();

    bakeResponseDurationFooter(state, msg, false);

    expect(state.currentContentEl!.querySelector('.specorator-response-footer')).not.toBeNull();
    expect(state.currentContentEl!.querySelector('.specorator-baked-duration')).not.toBeNull();
  });

  it('skips interrupted turns — no footer data is written', () => {
    const state = new ChatState();
    state.responseStartTime = performance.now() - 5000;
    const msg = makeAssistantMsg();

    bakeResponseDurationFooter(state, msg, true);

    expect(msg.durationSeconds).toBeUndefined();
    expect(msg.durationFlavorWord).toBeUndefined();
  });

  it('skips compaction-boundary turns — no footer data is written', () => {
    const state = new ChatState();
    state.responseStartTime = performance.now() - 5000;
    const msg = makeAssistantMsg();
    msg.contentBlocks = [{ type: 'context_compacted' } as never];

    bakeResponseDurationFooter(state, msg, false);

    expect(msg.durationSeconds).toBeUndefined();
    expect(msg.durationFlavorWord).toBeUndefined();
  });
});
