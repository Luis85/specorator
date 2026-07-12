import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import LoadEarlierControl from '@/features/chat/ui/vue/transcript/LoadEarlierControl.vue';

/**
 * Reproduces `MessageRenderer.renderLoadEarlierControl`'s
 * `.specorator-load-earlier` > `.specorator-load-earlier-btn` DOM. Growing
 * the render window / scroll-anchor preservation is `TranscriptRoot`'s job —
 * this component only emits `loadEarlier` on click.
 */
describe('LoadEarlierControl', () => {
  it('renders the control + button DOM contract with the localized label', () => {
    const { container } = render(LoadEarlierControl);

    const control = container.querySelector('.specorator-load-earlier') as HTMLElement;
    expect(control).not.toBeNull();
    const btn = control.querySelector('.specorator-load-earlier-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.type).toBe('button');
    expect(btn.textContent?.trim()).toBe('Load earlier messages');
  });

  it('emits loadEarlier on click', async () => {
    const { container, emitted } = render(LoadEarlierControl);

    const btn = container.querySelector('.specorator-load-earlier-btn') as HTMLButtonElement;
    await fireEvent.click(btn);

    expect(emitted().loadEarlier).toHaveLength(1);
  });
});
