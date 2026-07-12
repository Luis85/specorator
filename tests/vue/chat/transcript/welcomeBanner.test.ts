import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import WelcomeBanner from '@/features/chat/ui/vue/transcript/WelcomeBanner.vue';

/**
 * Reproduces `setupWindowedRender`'s `.specorator-welcome` >
 * `.specorator-welcome-greeting` element plus
 * `MessageRenderer.renderHydrationErrorBanner`'s
 * `.specorator-hydration-error[data-error-code]` sibling banner.
 */
describe('WelcomeBanner', () => {
  it('renders the greeting, no hydration banner when null', () => {
    const { container } = render(WelcomeBanner, {
      props: { greeting: 'Good morning', hydrationError: null },
    });

    const welcome = container.querySelector('.specorator-welcome') as HTMLElement;
    expect(welcome).not.toBeNull();
    expect(welcome.querySelector('.specorator-welcome-greeting')?.textContent?.trim()).toBe('Good morning');
    expect(container.querySelector('.specorator-hydration-error')).toBeNull();
  });

  it('renders no welcome block when the greeting is empty (transcript already has messages)', () => {
    const { container } = render(WelcomeBanner, {
      props: { greeting: '', hydrationError: null },
    });

    // An empty greeting must not leave the ~200px `.specorator-welcome` spacer
    // above the first message — the whole welcome block is omitted.
    expect(container.querySelector('.specorator-welcome')).toBeNull();
    expect(container.querySelector('.specorator-welcome-greeting')).toBeNull();
  });

  it('renders the hydration-error banner even when the greeting is empty', () => {
    const { container } = render(WelcomeBanner, {
      props: {
        greeting: '',
        hydrationError: { code: 'store-unreadable', message: 'History unavailable' },
      },
    });

    // The banner is independent of the greeting: no welcome block, but the
    // hydration-error banner still renders on its own.
    expect(container.querySelector('.specorator-welcome')).toBeNull();
    const banner = container.querySelector('.specorator-hydration-error') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.dataset.errorCode).toBe('store-unreadable');
    expect(banner.textContent?.trim()).toBe('History unavailable');
  });

  it('renders the hydration-error banner with its error code + message as a sibling of the welcome block', () => {
    const { container } = render(WelcomeBanner, {
      props: {
        greeting: 'Hi there',
        hydrationError: { code: 'store-unreadable', message: 'History unavailable' },
      },
    });

    const banner = container.querySelector('.specorator-hydration-error') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.dataset.errorCode).toBe('store-unreadable');
    expect(banner.textContent?.trim()).toBe('History unavailable');
    // Sibling, not nested inside .specorator-welcome.
    expect(container.querySelector('.specorator-welcome .specorator-hydration-error')).toBeNull();
  });
});
