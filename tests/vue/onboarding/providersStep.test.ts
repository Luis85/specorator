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
    pinnedPath: null,
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

  it('offers no install for an unknown provider — only a confirmed absence gets one', () => {
    // An install here would have the user reinstall a package they may already
    // have, and the re-probe would still say unknown, so the button would just be
    // offered again. The manual-path field stays: it names a path rather than
    // assuming one is absent.
    const { container } = setup(makeStore([
      detection({ status: 'unknown', cliPath: null, unknownReason: 'no-resolver' }),
    ]));
    const card = container.querySelector('[data-provider="alpha"]')!;

    expect(card.querySelector('.specorator-onboarding-install')).toBeNull();
    expect(card.querySelector('[data-action="show-manual-path"]')).not.toBeNull();
    expect(card.querySelector('[data-state="unknown"]')?.textContent).toContain('Check again');
  });

  it('explains an unverifiable target instead of claiming the CLI is absent', () => {
    // Codex in WSL mode: the command runs inside the distro, so "needs the
    // command on your PATH" would be simply wrong.
    const { container } = setup(makeStore([
      detection({ status: 'unknown', cliPath: null, unknownReason: 'external-target' }),
    ]));
    const explanation = container.querySelector('[data-state="unknown"]')!;

    expect(explanation.textContent).toContain('WSL');
    expect(container.textContent).not.toContain('on your PATH');
  });

  it('names a file that exists but cannot be executed, rather than claiming nothing is there', async () => {
    // A copied or partially installed script without +x: "needs the command on
    // your PATH" would send the user looking for a file they already have.
    const { container } = setup(makeStore([
      detection({
        status: 'missing',
        cliPath: null,
        unusable: { path: '/opt/alpha/alpha', reason: 'not-executable' },
      }),
    ]));
    const line = container.querySelector('[data-state="not-executable"]')!;

    expect(line.textContent).toContain('/opt/alpha/alpha');
    expect(container.textContent).not.toContain('on your PATH');
    // Still a confirmed absence, so the install and manual-path remedies stay.
    expect(container.querySelector('.specorator-onboarding-install')).not.toBeNull();
  });

  it('explains a batch shim the provider cannot launch, rather than reporting it ready', async () => {
    // Claude's SDK owns the stdio stream, so a `.cmd` cannot be routed through
    // cmd.exe the way the self-spawning providers do — and npm installs exactly
    // that on Windows, so a hand-pinned `claude.cmd` would look ready and fail.
    const { container } = setup(makeStore([
      detection({
        status: 'missing',
        cliPath: null,
        unusable: { path: 'C:\\npm\\alpha.cmd', reason: 'batch-shim' },
      }),
    ]));
    const line = container.querySelector('[data-state="batch-shim"]')!;

    expect(line.textContent).toContain('alpha.cmd');
    expect(line.textContent).toContain('.exe');
  });

  it('names a missing Node interpreter as the blocker, not the CLI', async () => {
    // The file is there and executable; what is absent is the interpreter it
    // needs. "Needs the command on your PATH" would point at the wrong thing.
    const { container } = setup(makeStore([
      detection({
        status: 'missing',
        cliPath: null,
        unusable: { path: '/opt/alpha/cli.js', reason: 'missing-node' },
      }),
    ]));
    const line = container.querySelector('[data-state="missing-node"]')!;

    expect(line.textContent).toContain('/opt/alpha/cli.js');
    expect(line.textContent).toContain('Node.js');
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

  it('keeps the path editor available after detection succeeds', async () => {
    // Hiding it once something resolves strips the only control that can correct
    // or clear a wrong-but-existing pin without leaving Setup.
    const store = makeStore([detection({ pinnedPath: '/opt/wrong/alpha' })]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-action="show-manual-path"]')!);
    const input = container.querySelector<HTMLInputElement>(
      '.specorator-onboarding-provider-manual input',
    )!;

    // Seeded from the PIN, not from the resolved path: prefilling a discovered
    // path would turn saving into an accidental pin of whatever was found.
    expect(input.value).toBe('/opt/wrong/alpha');
  });

  it('a blank save clears the pin, restoring auto-detection', async () => {
    const store = makeStore([detection({ pinnedPath: '/opt/wrong/alpha' })]);
    const { container } = setup(store);

    await fireEvent.click(container.querySelector('[data-action="show-manual-path"]')!);
    await fireEvent.update(
      container.querySelector('.specorator-onboarding-provider-manual input')!,
      '',
    );
    await fireEvent.click(container.querySelector('[data-action="save-manual-path"]')!);

    expect(store.setCliPath).toHaveBeenCalledWith('alpha', '');
  });

  it('summarizes how many providers are enabled', () => {
    const { container } = setup(makeStore([detection({ enabled: true })]));

    expect(container.querySelector('.specorator-onboarding-count')?.textContent)
      .toContain('1');
  });
});
