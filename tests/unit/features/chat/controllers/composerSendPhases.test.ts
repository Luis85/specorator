import { resolveComposerSend } from '@/features/chat/controllers/composerSendPhases';

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
