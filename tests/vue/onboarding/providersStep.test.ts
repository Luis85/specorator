import { fireEvent, render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

import type { ProviderCliDetection } from '@/features/onboarding/providerDetection';

const hoisted = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/features/onboarding/vue/stores/onboardingStore', () => ({
  useOnboardingStore: () => hoisted.store,
}));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getCliInstall: () => ({
      docsUrl: 'https://example.test/docs',
      authCommand: 'alpha login',
      methods: [{
        id: 'npm',
        label: 'npm',
        displayCommand: 'npm i -g alpha',
        argv: { command: 'npm', args: ['i', '-g', 'alpha'] },
      }],
    }),
  },
}));

import ProvidersStep from '@/features/onboarding/vue/components/ProvidersStep.vue';

function detection(overrides: Partial<ProviderCliDetection> = {}): ProviderCliDetection {
  return {
    providerId: 'alpha',
    displayName: 'Alpha',
    blurb: 'Alpha CLI',
    cliCommand: 'alpha',
    status: 'found',
    cliPath: '/usr/local/bin/alpha',
    enabled: false,
    ...overrides,
  };
}

function makeStore(detections: ProviderCliDetection[], overrides: Record<string, unknown> = {}) {
  return reactive({
    detections,
    scanning: false,
    enabledProviderIds: detections.filter((d) => d.enabled).map((d) => d.providerId),
    runs: {},
    runFor: () => ({ phase: 'idle', methodId: null, lines: [], error: null }),
    refreshDetections: vi.fn(),
    setEnabled: vi.fn(async () => {}),
    setCliPath: vi.fn(async () => {}),
    startInstall: vi.fn(),
    cancelInstall: vi.fn(),
    ...overrides,
  });
}

function setup(store: ReturnType<typeof makeStore>) {
  hoisted.store = store;
  return render(ProvidersStep);
}

beforeEach(() => {
  hoisted.store = null;
});

describe('ProvidersStep', () => {
  it('renders one card per detection in the order the store supplies', () => {
    const { container } = setup(makeStore([
      detection({ providerId: 'alpha' }),
      detection({ providerId: 'beta', status: 'missing', cliPath: null }),
    ]));

    const cards = [...container.querySelectorAll('.specorator-onboarding-provider')];
    expect(cards.map((el) => (el as HTMLElement).dataset.provider)).toEqual(['alpha', 'beta']);
  });

  it('an installed provider shows its resolved path and no install panel', () => {
    const { container } = setup(makeStore([detection()]));
    const card = container.querySelector('[data-provider="alpha"]')!;

    expect(card.getAttribute('data-status')).toBe('found');
    expect(card.querySelector('code')?.textContent).toBe('/usr/local/bin/alpha');
    expect(card.querySelector('.specorator-onboarding-install')).toBeNull();
  });

  it('a missing provider shows the install panel and the required command', () => {
    const { container } = setup(makeStore([
      detection({ status: 'missing', cliPath: null }),
    ]));
    const card = container.querySelector('[data-provider="alpha"]')!;

    expect(card.querySelector('.specorator-onboarding-install')).not.toBeNull();
    expect(card.textContent).toContain('alpha');
  });

  it('an unchecked provider reads as unknown, never as missing', () => {
    const { container } = setup(makeStore([detection({ status: 'unknown', cliPath: null })]));

    expect(container.querySelector('[data-provider="alpha"]')?.getAttribute('data-status'))
      .toBe('unknown');
  });

  it('toggling the checkbox enables the provider through the store', async () => {
    const store = makeStore([detection()]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-provider="alpha"] input[type="checkbox"]')!);

    expect(store.setEnabled).toHaveBeenCalledWith('alpha', true);
  });

  it('re-scan asks the store to probe again', async () => {
    const store = makeStore([detection()]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-action="rescan"]')!);

    expect(store.refreshDetections).toHaveBeenCalled();
  });

  it('confirming an install in a card routes the method to the store', async () => {
    const store = makeStore([detection({ status: 'missing', cliPath: null })]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-action="install"]')!);
    await fireEvent.click(container.querySelector('[data-action="confirm-install"]')!);

    expect(store.startInstall).toHaveBeenCalledWith('alpha', expect.objectContaining({ id: 'npm' }));
  });

  it('the manual path escape hatch writes through the store', async () => {
    const store = makeStore([detection({ status: 'missing', cliPath: null })]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-action="show-manual-path"]')!);
    const input = container.querySelector<HTMLInputElement>(
      '.specorator-onboarding-provider-manual input',
    )!;
    await fireEvent.update(input, '/opt/custom/alpha');
    await fireEvent.click(container.querySelector('[data-action="save-manual-path"]')!);

    expect(store.setCliPath).toHaveBeenCalledWith('alpha', '/opt/custom/alpha');
  });

  it('summarizes how many providers are enabled', () => {
    const { container } = setup(makeStore([detection({ enabled: true })]));

    expect(container.querySelector('.specorator-onboarding-count')?.textContent)
      .toContain('1');
  });
});
