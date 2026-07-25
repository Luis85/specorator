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

describe('MarketplaceDetail packages', () => {
  const brief: MarketplaceItem = {
    id: 'skills/project-brief',
    type: 'skill',
    name: 'project-brief',
    description: '',
    path: 'skills/project-brief/SKILL.md',
    tags: [],
  };
  const raid: MarketplaceItem = { ...brief, id: 'skills/raid-log', name: 'raid-log', path: 'skills/raid-log/SKILL.md' };
  const agent = base({
    id: 'agents/project-manager',
    type: 'agent',
    name: 'Project Manager',
    path: 'agents/project-manager.md',
    requires: ['skills/project-brief', 'skills/raid-log'],
  });
  const typeLabels = { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' };

  function renderPackage(props: Record<string, unknown> = {}) {
    return renderDetail({
      item: agent,
      typeLabel: 'Agent',
      dependencies: [brief, raid],
      typeLabels,
      installedIds: new Set<string>(),
      skillProviderOptions: [{ id: 'claude', label: 'Claude', userScope: true }],
      ...props,
    });
  }

  it('lists what comes with the item, marking what is already installed', () => {
    renderPackage({ installedIds: new Set(['skills/raid-log']) });
    expect(screen.getByText('Included with this install')).toBeTruthy();
    expect(screen.getByText('project-brief')).toBeTruthy();
    expect(screen.getByText('raid-log')).toBeTruthy();
    // One "Installed" marker — for the dependency that is already present.
    expect(screen.getAllByText('Installed')).toHaveLength(1);
  });

  it('asks for a skill root when the package brings skills, even though the item is an agent', async () => {
    // The bundled skills need a provider + scope just like a standalone skill,
    // so the target panel drives the install instead of the header button.
    const { emitted } = renderPackage();
    expect(screen.getByText('The skills in this package install into:')).toBeTruthy();
    const install = screen.getByRole('button', { name: 'Install all (3)' }) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
    await fireEvent.click(install);
    expect(emitted().install?.[0]).toEqual([{ provider: 'claude', scope: 'project' }]);
  });

  it('keeps the plain header button for a package with no skills in it', () => {
    const loopDep: MarketplaceItem = { ...brief, id: 'loops/x', type: 'loop', name: 'X', path: 'loops/x.md' };
    renderPackage({ dependencies: [loopDep] });
    expect(screen.queryByText('The skills in this package install into:')).toBeNull();
    expect(screen.getByRole('button', { name: 'Install all (2)' })).toBeTruthy();
  });

  it('reads Installed only when the item AND every dependency is present', () => {
    const loopDep: MarketplaceItem = { ...brief, id: 'loops/x', type: 'loop', name: 'X', path: 'loops/x.md' };
    // Item installed but a dependency missing: Install stays offered so the
    // package can be completed.
    renderPackage({ dependencies: [loopDep], installed: true, installedIds: new Set(['agents/project-manager']) });
    expect(screen.getByRole('button', { name: 'Install all (2)' })).toBeTruthy();
  });

  it('refuses install and explains when the package cannot be resolved', () => {
    renderPackage({ packageError: 'This item requires skills/absent, which is not in this catalog.' });
    expect(screen.getByRole('alert').textContent).toContain('skills/absent');
    // The dependency list is replaced by the reason — there is nothing valid to list.
    expect(screen.queryByText('Included with this install')).toBeNull();
    expect((screen.getByRole('button', { name: 'Install all (3)' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('MarketplaceDetail package target completeness', () => {
  const brief: MarketplaceItem = {
    id: 'skills/project-brief',
    type: 'skill',
    name: 'project-brief',
    description: '',
    path: 'skills/project-brief/SKILL.md',
    tags: [],
  };
  const agent = base({
    id: 'agents/project-manager',
    type: 'agent',
    name: 'Project Manager',
    path: 'agents/project-manager.md',
    requires: ['skills/project-brief'],
  });

  it('still offers the install when the package is present elsewhere but not at the selected target', async () => {
    // Everything reads installed by the catalog-wide badge (it was installed into
    // Claude), but the selected target (say Codex) doesn't have the skills — the
    // button must stay live so the package can be installed there too.
    const { findByRole } = renderDetail({
      item: agent,
      typeLabel: 'Agent',
      dependencies: [brief],
      installed: true,
      installedIds: new Set(['agents/project-manager', 'skills/project-brief']),
      typeLabels: { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' },
      skillProviderOptions: [{ id: 'claude', label: 'Claude', userScope: true }],
      skillInstalledChecker: () => Promise.resolve(false),
    });
    const install = (await findByRole('button', { name: 'Install all (2)' })) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
  });

  it('reads "Installed here" once the selected target holds the whole package', async () => {
    const { findByRole } = renderDetail({
      item: agent,
      typeLabel: 'Agent',
      dependencies: [brief],
      installed: true,
      installedIds: new Set(['agents/project-manager', 'skills/project-brief']),
      typeLabels: { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' },
      skillProviderOptions: [{ id: 'claude', label: 'Claude', userScope: true }],
      skillInstalledChecker: () => Promise.resolve(true),
    });
    const install = (await findByRole('button', { name: 'Installed here' })) as HTMLButtonElement;
    expect(install.disabled).toBe(true);
  });
});

describe('MarketplaceDetail dependency badges follow the selected target', () => {
  const brief: MarketplaceItem = {
    id: 'skills/project-brief',
    type: 'skill',
    name: 'project-brief',
    description: '',
    path: 'skills/project-brief/SKILL.md',
    tags: [],
  };
  const loop: MarketplaceItem = {
    id: 'loops/x',
    type: 'loop',
    name: 'Loop X',
    description: '',
    path: 'loops/x.md',
    tags: [],
  };
  const agent = base({
    id: 'agents/project-manager',
    type: 'agent',
    name: 'Project Manager',
    path: 'agents/project-manager.md',
    requires: ['skills/project-brief', 'loops/x'],
  });
  const typeLabels = { 'quick-action': 'Quick Action', agent: 'Agent', loop: 'Loop', template: 'Template', skill: 'Skill' };

  it('marks a dependency Installed only when it is present at the chosen target', async () => {
    // The catalog-wide set says the skill is installed (it is — under a DIFFERENT
    // provider). Scoped to the selected target it is not, and the list must say so,
    // or it contradicts the target-scoped button right beside it.
    const { queryAllByText, findByText } = renderDetail({
      item: agent,
      typeLabel: 'Agent',
      dependencies: [brief, loop],
      typeLabels,
      installedIds: new Set(['skills/project-brief', 'loops/x']),
      skillProviderOptions: [{ id: 'claude', label: 'Claude', userScope: true }],
      skillInstalledChecker: () => Promise.resolve(false),
      // The loop has one vault home, so it stays installed at every target; the
      // skill is absent from the one selected.
      memberInstalledAt: (member: MarketplaceItem) => Promise.resolve(member.type !== 'skill'),
    });
    await findByText('Loop X');
    await vi.waitFor(() => {
      // Exactly one "Installed" marker — the loop's. The skill's is gone.
      expect(queryAllByText('Installed')).toHaveLength(1);
    });
  });

  it('falls back to the catalog-wide set when no target is being chosen', async () => {
    // A package with no skills shows no target panel, so there is no destination
    // to scope to and "installed anywhere" is the honest answer.
    const { queryAllByText } = renderDetail({
      item: agent,
      typeLabel: 'Agent',
      dependencies: [loop],
      typeLabels,
      installedIds: new Set(['loops/x']),
    });
    expect(queryAllByText('Installed')).toHaveLength(1);
  });
});
