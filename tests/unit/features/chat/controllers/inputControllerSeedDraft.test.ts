/**
 * @jest-environment jsdom
 */
import { InputController } from '@/features/chat/controllers/InputController';

describe('InputController.seedComposerDraft', () => {
  it('sets the composer value and fires input without sending', () => {
    const el = document.createElement('textarea');
    let inputs = 0;
    el.addEventListener('input', () => { inputs += 1; });

    const controller = Object.create(InputController.prototype) as InputController;
    (controller as unknown as { deps: { getInputEl(): HTMLTextAreaElement } }).deps = {
      getInputEl: () => el,
    };

    controller.seedComposerDraft('hello world');

    expect(el.value).toBe('hello world');
    expect(inputs).toBe(1);
  });
});
