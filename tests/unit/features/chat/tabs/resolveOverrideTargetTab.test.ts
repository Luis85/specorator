import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';

jest.mock('@/features/chat/tabs/providerResolution', () => ({ getTabProviderId: () => 'claude' }));
jest.mock('@/features/chat/tabs/tabShared', () => ({ resolveBlankTabModel: () => 'sonnet' }));

function tabManager(opts: { active?: unknown; allTabs?: unknown[]; canCreate?: boolean; created?: unknown }) {
  const createTab = jest.fn(async () => opts.created ?? { id: 'new' });
  const tm = {
    getActiveTab: () => opts.active ?? null,
    getAllTabs: () => opts.allTabs ?? (opts.active ? [opts.active] : []),
    canCreateTab: () => opts.canCreate ?? true,
    createTab,
  };
  return { tm: tm as never, createTab };
}

describe('resolveOverrideTargetTab', () => {
  it('reuses a blank active tab whose provider+model match the override', async () => {
    const active = { id: 'a', lifecycleState: 'blank', pinnedModel: 'sonnet' };
    const { tm } = tabManager({ active });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(active);
  });

  it('creates a pinned tab when the override model differs', async () => {
    const active = { id: 'a', lifecycleState: 'blank', pinnedModel: 'haiku' };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, created });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalledWith(null, undefined, {
      activate: false, defaultProviderId: 'claude', pinnedModel: 'sonnet',
    });
  });

  it('returns null when at the tab limit and no reusable blank tab exists', async () => {
    const { tm } = tabManager({ active: null, allTabs: [], canCreate: false });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBeNull();
  });

  it('reuses a matching blank tab elsewhere instead of hitting the tab cap', async () => {
    // Active tab is a conversation; a background blank tab already matches the
    // override. At the cap this must reuse it rather than fail with a notice.
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = { id: 'blank', lifecycleState: 'blank', pinnedModel: 'sonnet' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], canCreate: false });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(blank);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('reuses a matching blank tab elsewhere instead of creating a new one', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = { id: 'blank', lifecycleState: 'blank', draftModel: 'sonnet' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(blank);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('does not reuse a background blank tab whose model differs from the override', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = { id: 'blank', lifecycleState: 'blank', pinnedModel: 'haiku' };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('does not reuse a matching blank tab that holds an unsent composer draft', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      dom: { inputEl: { value: '  half-written thought  ' } },
    };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('does not reuse a matching blank tab that has attached file pills', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      ui: {
        fileContextManager: {
          getAttachedFiles: () => new Set(['notes/a.md']),
          getAttachedFolders: () => new Set<string>(),
        },
      },
    };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('does not reuse a matching blank tab that has attached images', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      ui: { imageContextManager: { hasImages: () => true } },
    };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('still reuses a matching blank tab whose composer is empty and has no pills', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      dom: { inputEl: { value: '   ' } },
      ui: {
        fileContextManager: {
          getAttachedFiles: () => new Set<string>(),
          getAttachedFolders: () => new Set<string>(),
        },
        imageContextManager: { hasImages: () => false },
      },
    };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(blank);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('with allowDraftBlank, reuses a matching draft-bearing blank at the cap (additive loop seeding)', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      dom: { inputEl: { value: 'my unsent task note' } },
    };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], canCreate: false });
    const got = await resolveOverrideTargetTab(
      {} as never, tm, { providerId: 'claude', model: 'sonnet' }, { allowDraftBlank: true },
    );
    // Draft is preserved by keepExisting seeding, so reuse instead of the cap notice.
    expect(got).toBe(blank);
    expect(createTab).not.toHaveBeenCalled();
  });

  it('does not reuse a blank WORK-ORDER tab (hidden task-run tab, own cap/lifecycle)', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const woBlank = { id: 'wo', lifecycleState: 'blank', kind: 'work-order', pinnedModel: 'sonnet' };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, woBlank], created, canCreate: true });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('with allowDraftBlank, still skips a blank holding attached pills (welcome reset would wipe them)', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'sonnet',
      dom: { inputEl: { value: 'draft text' } },
      ui: {
        fileContextManager: {
          getAttachedFiles: () => new Set(['notes/a.md']),
          getAttachedFolders: () => new Set<string>(),
        },
      },
    };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab(
      {} as never, tm, { providerId: 'claude', model: 'sonnet' }, { allowDraftBlank: true },
    );
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });

  it('with allowDraftBlank, still honors the model match (no reuse on mismatch)', async () => {
    const active = { id: 'conv', lifecycleState: 'bound_active' };
    const blank = {
      id: 'blank',
      lifecycleState: 'blank',
      pinnedModel: 'haiku',
      dom: { inputEl: { value: 'draft' } },
    };
    const created = { id: 'new' };
    const { tm, createTab } = tabManager({ active, allTabs: [active, blank], created, canCreate: true });
    const got = await resolveOverrideTargetTab(
      {} as never, tm, { providerId: 'claude', model: 'sonnet' }, { allowDraftBlank: true },
    );
    expect(got).toBe(created);
    expect(createTab).toHaveBeenCalled();
  });
});
