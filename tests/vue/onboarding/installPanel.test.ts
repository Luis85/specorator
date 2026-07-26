import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderCliInstall } from '@/core/providers/types';
import InstallPanel from '@/features/onboarding/vue/components/InstallPanel.vue';
import type { InstallRunState } from '@/features/onboarding/vue/stores/onboardingStore';

const IDLE: InstallRunState = { phase: 'idle', methodId: null, lines: [], error: null };

const install: ProviderCliInstall = {
  docsUrl: 'https://example.test/docs',
  authCommand: 'alpha login',
  methods: [
    {
      id: 'npm',
      label: 'npm (global)',
      displayCommand: 'npm install -g @scope/alpha',
      argv: { command: 'npm', args: ['install', '-g', '@scope/alpha'] },
    },
    {
      id: 'native',
      label: 'Install script',
      displayCommand: 'curl https://example.test/install | bash',
      argv: null,
    },
  ],
};

function setup(
  overrides: Partial<ProviderCliInstall> = {},
  run: InstallRunState = IDLE,
  blockedBy: string | null = null,
) {
  return render(InstallPanel, {
    props: {
      providerId: 'alpha',
      displayName: 'Alpha',
      install: { ...install, ...overrides },
      run,
      blockedBy,
    },
  });
}

describe('InstallPanel', () => {
  it('shows the first platform-applicable method and its command', () => {
    const { container } = setup();

    expect(container.querySelector('code')?.textContent).toBe('npm install -g @scope/alpha');
  });

  it('requires an explicit confirm before emitting a run — one click never spawns', async () => {
    const { container, emitted } = setup();

    await fireEvent.click(container.querySelector('[data-action="install"]')!);

    expect(emitted().run).toBeUndefined();
    // The confirm names the exact command that would run.
    expect(container.querySelector('.specorator-onboarding-install-confirm')?.textContent)
      .toContain('npm install -g @scope/alpha');

    await fireEvent.click(container.querySelector('[data-action="confirm-install"]')!);

    expect(emitted().run).toHaveLength(1);
    expect((emitted().run as unknown[][])[0][0]).toMatchObject({ id: 'npm' });
  });

  it('aborting the confirm emits nothing', async () => {
    const { container, emitted } = setup();

    await fireEvent.click(container.querySelector('[data-action="install"]')!);
    await fireEvent.click(container.querySelector('[data-action="abort-install"]')!);

    expect(emitted().run).toBeUndefined();
    expect(container.querySelector('[data-action="confirm-install"]')).toBeNull();
  });

  it('offers no run button for a copy-only method, only the command and an explanation', async () => {
    const { container } = setup({ methods: [install.methods[1]] });

    expect(container.querySelector('[data-action="install"]')).toBeNull();
    expect(container.querySelector('.specorator-onboarding-install-manual')).not.toBeNull();
    expect(container.querySelector('code')?.textContent).toContain('curl https://example.test/install');
  });

  it('switching method switches the command shown', async () => {
    const { container } = setup();

    await fireEvent.update(container.querySelector('select')!, 'native');

    expect(container.querySelector('code')?.textContent).toContain('curl');
    expect(container.querySelector('[data-action="install"]')).toBeNull();
  });

  it('copies the displayed command to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = setup();

    await fireEvent.click(container.querySelector('[data-action="copy"]')!);

    expect(writeText).toHaveBeenCalledWith('npm install -g @scope/alpha');
  });

  it('renders the running state with a cancel affordance instead of a run button', () => {
    const { container } = setup({}, { phase: 'running', methodId: 'npm', lines: [], error: null });

    expect(container.querySelector('[data-action="install"]')).toBeNull();
    expect(container.querySelector('[data-action="cancel-install"]')).not.toBeNull();
  });

  it('streams installer output into a bounded console block', () => {
    const { container } = setup({}, {
      phase: 'running',
      methodId: 'npm',
      lines: ['added 1 package', 'done'],
      error: null,
    });

    expect(container.querySelector('.specorator-onboarding-install-console')?.textContent)
      .toBe('added 1 package\ndone');
  });

  it('reports success, failure, and cancellation distinctly', () => {
    expect(setup({}, { ...IDLE, phase: 'succeeded' })
      .container.querySelector('[data-result="succeeded"]')).not.toBeNull();
    expect(setup({}, { ...IDLE, phase: 'failed', error: 'EACCES' })
      .container.querySelector('[data-result="failed"]')?.textContent).toContain('EACCES');
    expect(setup({}, { ...IDLE, phase: 'cancelled' })
      .container.querySelector('[data-result="cancelled"]')).not.toBeNull();
  });

  it('surfaces a cancel that could not confirm the process tree exited', () => {
    // The Install button is live again the moment the run settles, so a cancel
    // whose descendants may still be installing cannot read as a clean stop.
    const { container } = setup({}, {
      ...IDLE,
      phase: 'cancelled',
      error: 'could not confirm its process tree exited',
    });

    expect(container.querySelector('[data-result="cancelled"]')).not.toBeNull();
    expect(container.querySelector('[data-result="cancelled-warning"]')?.textContent)
      .toContain('process tree');
  });

  it('holds Run while another provider is installing, and says whose', () => {
    // Global `npm install -g` runs from three of the four providers mutate one
    // shared prefix; a live Run button on every card invites exactly the overlap
    // the store refuses. Disabled, not hidden — the reason has to be visible.
    const { container } = setup({}, IDLE, 'Codex');
    const run = container.querySelector<HTMLButtonElement>('[data-action="install"]')!;

    expect(run.disabled).toBe(true);
    expect(container.querySelector('[data-state="blocked"]')?.textContent).toContain('Codex');
  });

  it('leaves Run live when nothing else is installing', () => {
    expect(setup().container.querySelector<HTMLButtonElement>('[data-action="install"]')!.disabled)
      .toBe(false);
  });

  it('links the docs only when the provider URL is https', () => {
    expect(setup().container.querySelector('a')?.getAttribute('href'))
      .toBe('https://example.test/docs');
    expect(setup({ docsUrl: 'javascript:alert(1)' }).container.querySelector('a')).toBeNull();
  });
});
