import { fireEvent, render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw, reactive } from 'vue';

import { ONBOARDING_STEPS } from '@/features/onboarding/onboardingSteps';
import type { ProviderCliDetection } from '@/features/onboarding/providerDetection';
import { CLOSE_VIEW_KEY, PLUGIN_KEY } from '@/features/onboarding/vue/onboardingKeys';

// The real store probes PATH and constructs vault adapters; swap it for a
// reactive fake so the island is tested against a pinned contract.
const hoisted = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/features/onboarding/vue/stores/onboardingStore', () => ({
  useOnboardingStore: () => hoisted.store,
}));
// Provider registry lookups the step components make for install metadata.
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getCliInstall: () => ({
      docsUrl: 'https://example.test/docs',
      authCommand: 'alpha login',
      methods: [{ id: 'npm', label: 'npm', displayCommand: 'npm i -g alpha', argv: { command: 'npm', args: ['i'] } }],
    }),
    getProviderDisplayName: (id: string) => id,
    getChatUIConfig: () => ({ getModelOptions: () => [] }),
  },
}));

import OnboardingRoot from '@/features/onboarding/vue/OnboardingRoot.vue';

function detection(overrides: Partial<ProviderCliDetection> = {}): ProviderCliDetection {
  return {
    providerId: 'alpha',
    displayName: 'Alpha',
    blurb: 'Alpha CLI',
    cliCommand: 'alpha',
    status: 'found',
    cliPath: '/usr/local/bin/alpha',
    pinnedPath: null,
    enabled: false,
    ...overrides,
  };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return reactive({
    step: 'providers',
    detections: [detection()],
    scanning: false,
    folders: [],
    creatingFolders: false,
    folderError: null,
    runs: {},
    enabledProviderIds: [],
    modelOptions: [],
    init: vi.fn(),
    runFor: () => ({ phase: 'idle', methodId: null, lines: [], error: null }),
    refreshDetections: vi.fn(),
    setEnabled: vi.fn(async () => {}),
    setCliPath: vi.fn(async () => {}),
    startInstall: vi.fn(),
    cancelInstall: vi.fn(),
    refreshFolders: vi.fn(async () => {}),
    setFolder: vi.fn(async () => {}),
    createFolders: vi.fn(async () => {}),
    goTo: vi.fn(),
    advance: vi.fn(),
    finish: vi.fn(async () => {}),
    dispose: vi.fn(),
    ...overrides,
  });
}

function setup(store: ReturnType<typeof makeStore>, closeView = vi.fn()) {
  hoisted.store = store;
  const plugin = markRaw({
    settings: {},
    getAllViews: () => [],
    activateView: vi.fn(async () => {}),
    saveSettings: vi.fn(async () => {}),
  });
  return {
    closeView,
    ...render(OnboardingRoot, {
      global: {
        provide: { [PLUGIN_KEY as symbol]: plugin, [CLOSE_VIEW_KEY as symbol]: closeView },
      },
    }),
  };
}

beforeEach(() => {
  hoisted.store = null;
});

describe('OnboardingRoot', () => {
  it('initializes the store with the injected plugin', () => {
    const store = makeStore();
    setup(store);

    expect(store.init).toHaveBeenCalledTimes(1);
  });

  it('renders one rail entry per step, marking the current one', () => {
    const { container } = setup(makeStore());

    const steps = [...container.querySelectorAll('.specorator-onboarding-rail-step')];
    expect(steps.map((el) => (el as HTMLElement).dataset.step)).toEqual([...ONBOARDING_STEPS]);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
  });

  it('the rail is free-navigable — clicking any step jumps there', async () => {
    const store = makeStore();
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-step="marketplace"]')!);

    expect(store.goTo).toHaveBeenCalledWith('marketplace');
  });

  it('routes the body to the active step', async () => {
    const store = makeStore();
    const { container } = setup(store);
    expect(container.querySelector('[data-step-body="providers"]')).not.toBeNull();

    store.step = 'folders';
    await Promise.resolve();
    expect(container.querySelector('[data-step-body="folders"]')).not.toBeNull();
    expect(container.querySelector('[data-step-body="providers"]')).toBeNull();
  });

  it('Back is disabled on the first step and Next advances', async () => {
    const store = makeStore();
    const { container } = setup(store);

    expect(container.querySelector<HTMLButtonElement>('[data-action="back"]')!.disabled).toBe(true);
    await fireEvent.click(container.querySelector('[data-action="next"]')!);
    expect(store.advance).toHaveBeenCalledWith(1);
  });

  it('the last step swaps Next for Finish, which completes and closes', async () => {
    const store = makeStore({ step: 'finish' });
    const closeView = vi.fn();
    const { container } = setup(store, closeView);

    expect(container.querySelector('[data-action="next"]')).toBeNull();
    await fireEvent.click(container.querySelector('[data-action="finish"]')!);
    await Promise.resolve();

    expect(store.finish).toHaveBeenCalled();
    expect(closeView).toHaveBeenCalled();
  });

  it('dismissing is a completion, not an escape — the flow must not reopen next load', async () => {
    const store = makeStore();
    const closeView = vi.fn();
    const { container } = setup(store, closeView);

    await fireEvent.click(container.querySelector('[data-action="dismiss"]')!);
    await Promise.resolve();

    expect(store.finish).toHaveBeenCalled();
    expect(closeView).toHaveBeenCalled();
  });

  it('unmounting disposes the store so an in-flight install is cancelled', () => {
    const store = makeStore();
    const { unmount } = setup(store);

    unmount();

    expect(store.dispose).toHaveBeenCalled();
  });
});
