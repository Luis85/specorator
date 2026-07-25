import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderId, ProviderRegistration } from '@/core/providers/types';
import type { SpecoratorSettings } from '@/core/types/settings';

jest.mock('@/features/onboarding/activateOnboarding', () => ({
  activateOnboarding: jest.fn(async () => {}),
}));

import { activateOnboarding } from '@/features/onboarding/activateOnboarding';
import { maybeOpenOnboarding, shouldOpenOnboarding } from '@/features/onboarding/maybeOpenOnboarding';

const PROVIDER_ID = 'trigger-alpha' as ProviderId;

beforeAll(() => {
  ProviderRegistry.register(PROVIDER_ID, {
    displayName: 'Alpha',
    firstRunBlurb: 'Alpha CLI',
    cliCommand: 'alpha',
    isEnabled: (settings: Record<string, unknown>) => Boolean(
      (settings.providerConfigs as Record<string, { enabled?: boolean }> | undefined)
        ?.[PROVIDER_ID]?.enabled,
    ),
  } as unknown as ProviderRegistration);
});

beforeEach(() => {
  jest.mocked(activateOnboarding).mockClear();
});

function makePlugin(settings: Partial<SpecoratorSettings>) {
  return { settings } as never;
}

describe('shouldOpenOnboarding', () => {
  it('opens on a genuine first run: never completed and no provider enabled', () => {
    expect(shouldOpenOnboarding(makePlugin({ firstRunDismissed: false }))).toBe(true);
  });

  it('stays closed once the flow was completed or dismissed', () => {
    expect(shouldOpenOnboarding(makePlugin({ firstRunDismissed: true }))).toBe(false);
  });

  it('stays closed for a user who is already set up, whatever the flag says', () => {
    const plugin = makePlugin({
      firstRunDismissed: false,
      providerConfigs: { [PROVIDER_ID]: { enabled: true } },
    } as Partial<SpecoratorSettings>);

    expect(shouldOpenOnboarding(plugin)).toBe(false);
  });
});

describe('maybeOpenOnboarding', () => {
  it('activates the view on a first run', async () => {
    await maybeOpenOnboarding(makePlugin({ firstRunDismissed: false }));

    expect(activateOnboarding).toHaveBeenCalledTimes(1);
  });

  it('does nothing otherwise', async () => {
    await maybeOpenOnboarding(makePlugin({ firstRunDismissed: true }));

    expect(activateOnboarding).not.toHaveBeenCalled();
  });
});
