import { resolveOverrideTargetTab } from '@/features/chat/tabs/resolveOverrideTargetTab';

jest.mock('@/features/chat/tabs/providerResolution', () => ({ getTabProviderId: () => 'claude' }));
jest.mock('@/features/chat/tabs/tabShared', () => ({ resolveBlankTabModel: () => 'sonnet' }));

function tabManager(opts: { active?: unknown; canCreate?: boolean; created?: unknown }) {
  const createTab = jest.fn(async () => opts.created ?? { id: 'new' });
  const tm = {
    getActiveTab: () => opts.active ?? null,
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

  it('returns null when at the tab limit', async () => {
    const { tm } = tabManager({ active: null, canCreate: false });
    const got = await resolveOverrideTargetTab({} as never, tm, { providerId: 'claude', model: 'sonnet' });
    expect(got).toBeNull();
  });
});
