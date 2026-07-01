/**
 * @jest-environment jsdom
 */
import { InputController } from '@/features/chat/controllers/InputController';

function makeController(el: HTMLTextAreaElement): InputController {
  const controller = Object.create(InputController.prototype) as InputController;
  (controller as unknown as { deps: { getInputEl(): HTMLTextAreaElement } }).deps = {
    getInputEl: () => el,
  };
  return controller;
}

describe('InputController.seedComposerDraft', () => {
  it('sets the composer value and fires input without sending', () => {
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    let inputs = 0;
    el.addEventListener('input', () => { inputs += 1; });

    const controller = makeController(el);
    const sendSpy = jest.spyOn(controller, 'sendMessage').mockResolvedValue(undefined);

    controller.seedComposerDraft('hello world');

    expect(el.value).toBe('hello world');
    expect(inputs).toBe(1);
    // The "seed as draft" contract: it must NOT send — that is the whole point of
    // the split from autoResumeWith.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('focuses the composer and places the caret at the end', () => {
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    const controller = makeController(el);

    controller.seedComposerDraft('seeded body');

    expect(document.activeElement).toBe(el);
    expect(el.selectionStart).toBe('seeded body'.length);
    expect(el.selectionEnd).toBe('seeded body'.length);
  });

  it('clobbers an existing draft by default', () => {
    const el = document.createElement('textarea');
    el.value = 'user note';
    const controller = makeController(el);

    controller.seedComposerDraft('loop body');

    expect(el.value).toBe('loop body');
  });

  it('preserves a non-empty existing draft above the seeded content with keepExisting', () => {
    const el = document.createElement('textarea');
    el.value = '  user note  ';
    const controller = makeController(el);

    controller.seedComposerDraft('loop body', { keepExisting: true });

    expect(el.value).toBe('user note\n\nloop body');
  });

  it('keepExisting on an empty composer just sets the content', () => {
    const el = document.createElement('textarea');
    el.value = '   ';
    const controller = makeController(el);

    controller.seedComposerDraft('loop body', { keepExisting: true });

    expect(el.value).toBe('loop body');
  });
});

describe('InputController.autoResumeWith', () => {
  it('seeds the value and sends exactly once', () => {
    const el = document.createElement('textarea');
    document.body.appendChild(el);
    const controller = makeController(el);
    (controller as unknown as { deps: { getInputEl(): HTMLTextAreaElement; plugin: unknown } }).deps = {
      getInputEl: () => el,
      plugin: { logger: { scope: () => ({ error: () => {} }) } },
    };
    const sendSpy = jest.spyOn(controller, 'sendMessage').mockResolvedValue(undefined);

    (controller as unknown as { autoResumeWith(content: string): void }).autoResumeWith('resume text');

    expect(el.value).toBe('resume text');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
