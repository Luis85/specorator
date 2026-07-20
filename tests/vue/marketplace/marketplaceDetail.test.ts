import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceDetail from '@/features/marketplace/vue/components/MarketplaceDetail.vue';

function base(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'a',
    type: 'loop',
    name: 'Alpha',
    description: 'Alpha desc',
    path: 'loops/a.md',
    tags: ['t1'],
    ...overrides,
  };
}
function renderDetail(props: Record<string, unknown> = {}) {
  return render(MarketplaceDetail, {
    props: {
      item: base(),
      typeLabel: 'Loop',
      body: 'BODY',
      previewError: false,
      installing: false,
      installed: false,
      installable: true,
      ...props,
    },
  });
}

describe('MarketplaceDetail', () => {
  it('emits back', async () => {
    const { emitted } = renderDetail();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(emitted().back).toHaveLength(1);
  });

  it('moves focus to the detail heading on mount (view-change a11y)', () => {
    // Focusing the name heading on the list→detail swap keeps keyboard focus in
    // the new view (not <body>) and lets screen readers announce the change.
    // (jsdom doesn't reliably reflect focus in document.activeElement, so assert
    // the focus() call landed on the heading.)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      renderDetail();
      expect(focusSpy.mock.instances.at(-1)).toBe(screen.getByText('Alpha'));
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('shows the reviewed body and enables Install once it loads', async () => {
    const { emitted } = renderDetail({ body: 'REVIEWED' });
    expect(screen.getByText('REVIEWED')).toBeTruthy();
    const install = screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
    await fireEvent.click(install);
    expect(emitted().install).toHaveLength(1);
  });

  it('disables Install until the body has loaded', () => {
    renderDetail({ body: null });
    expect((screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows Installed (not a button) when installed', () => {
    renderDetail({ installed: true });
    expect(screen.getByText('Installed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('linkifies only http(s) sources', () => {
    const { container: c1 } = renderDetail({ item: base({ source: 'https://example.test/x' }) });
    expect(c1.querySelector('a[href="https://example.test/x"]')).not.toBeNull();
    const { container: c2 } = renderDetail({ item: base({ source: 'javascript:alert(1)' }) });
    expect(c2.querySelector('a')).toBeNull();
    expect(c2.textContent).toContain('javascript:alert(1)');
  });
});

describe('MarketplaceDetail — skill install panel', () => {
  const skillItem = base({
    type: 'skill',
    id: 'skills/project-setup',
    name: 'project-setup',
    path: 'skills/project-setup/SKILL.md',
  });
  const skillProps = (over: Record<string, unknown> = {}) => ({
    item: skillItem,
    typeLabel: 'Skill',
    installable: true,
    skillProviderOptions: [
      { id: 'claude', label: 'Claude' },
      { id: 'codex', label: 'Codex' },
      { id: 'cursor', label: 'Cursor' },
    ],
    skillInstalledChecker: vi.fn().mockResolvedValue(false),
    ...over,
  });

  it('renders provider + scope selectors and an Install button (never the not-installable note)', () => {
    renderDetail(skillProps());
    expect(screen.getByText('Provider')).toBeTruthy();
    expect(screen.getByText('Scope')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Claude' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Codex' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Cursor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.queryByText('Not yet installable')).toBeNull();
  });

  it('emits install with the default target (claude / project)', async () => {
    const { emitted } = renderDetail(skillProps());
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(emitted().install?.[0]).toEqual([{ provider: 'claude', scope: 'project' }]);
  });

  it('emits the changed target after selecting a different provider and user scope', async () => {
    const { emitted } = renderDetail(skillProps());
    const [providerSelect, scopeSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    await fireEvent.update(providerSelect, 'codex');
    await fireEvent.update(scopeSelect, 'user');
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(emitted().install?.at(-1)).toEqual([{ provider: 'codex', scope: 'user' }]);
  });

  it('shows the user-scope hint only when user scope is selected', async () => {
    renderDetail(skillProps());
    expect(screen.queryByText(/home directory/i)).toBeNull();
    await fireEvent.update(screen.getAllByRole('combobox')[1] as HTMLSelectElement, 'user');
    expect(screen.getByText(/home directory/i)).toBeTruthy();
  });

  const scopedProviderOptions = [
    { id: 'claude', label: 'Claude', userScope: false }, // e.g. loadUserSettings off
    { id: 'codex', label: 'Codex', userScope: true },
  ];

  it('hides User scope for a provider that cannot resolve user-scope skills', async () => {
    renderDetail(skillProps({ skillProviderOptions: scopedProviderOptions }));
    const [providerSelect, scopeSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(scopeSelect.options.length).toBe(1); // default provider claude → only Project
    await fireEvent.update(providerSelect, 'codex');
    expect(scopeSelect.options.length).toBe(2); // codex resolves user scope → Project + User
  });

  it('snaps scope back to project when switching to a provider without user scope', async () => {
    const { emitted } = renderDetail(skillProps({ skillProviderOptions: scopedProviderOptions }));
    const [providerSelect, scopeSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    await fireEvent.update(providerSelect, 'codex');
    await fireEvent.update(scopeSelect, 'user');
    await fireEvent.update(providerSelect, 'claude'); // claude can't resolve user scope
    await fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(emitted().install?.at(-1)).toEqual([{ provider: 'claude', scope: 'project' }]);
  });

  it('reflects the per-target installed state (button becomes "Installed here", disabled)', async () => {
    const checker = vi.fn().mockResolvedValue(true);
    renderDetail(skillProps({ skillInstalledChecker: checker }));
    const btn = (await screen.findByRole('button', { name: 'Installed here' })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(checker).toHaveBeenCalledWith({ provider: 'claude', scope: 'project' });
  });

  it('rechecks the target when the installed signal changes (external Library delete)', async () => {
    const checker = vi.fn().mockResolvedValue(true);
    const { rerender } = renderDetail(
      skillProps({ skillInstalledChecker: checker, installedSignal: new Set(['a']) }),
    );
    await screen.findByRole('button', { name: 'Installed here' }); // initially installed here
    // The skill is deleted from the target; the store refreshes → a new signal.
    checker.mockResolvedValue(false);
    await rerender({ installedSignal: new Set() });
    await screen.findByRole('button', { name: 'Install' }); // button flips back, no reopen needed
  });
});
