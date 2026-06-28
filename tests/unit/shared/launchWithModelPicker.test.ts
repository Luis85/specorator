import { launchWithModelPicker } from '@/shared/launchWithModelPicker';

jest.mock('obsidian', () => ({ Notice: jest.fn() }));
jest.mock('@/i18n/i18n', () => ({ t: (key: string) => key }));

const openModalMock = jest.fn();
jest.mock('@/shared/modals/ModelLaunchModal', () => ({
  ModelLaunchModal: jest.fn().mockImplementation((options) => ({ open: () => openModalMock(options) })),
}));

const isEnabledMock = jest.fn();
const getRegisteredMock = jest.fn();
const getChatUIConfigMock = jest.fn();
const getProviderDisplayNameMock = jest.fn();
const resolveSettingsProviderMock = jest.fn();
jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: (...a: unknown[]) => isEnabledMock(...a),
    getRegisteredProviderIds: () => getRegisteredMock(),
    getChatUIConfig: (...a: unknown[]) => getChatUIConfigMock(...a),
    getProviderDisplayName: (...a: unknown[]) => getProviderDisplayNameMock(...a),
    resolveSettingsProviderId: (...a: unknown[]) => resolveSettingsProviderMock(...a),
  },
}));

const resolveBlankTabModelMock = jest.fn();
jest.mock('@/features/chat/tabs/tabShared', () => ({
  resolveBlankTabModel: (...a: unknown[]) => resolveBlankTabModelMock(...a),
}));

jest.mock('@/core/types/settings', () => ({ asSettingsBag: (s: unknown) => s }));

function makePlugin(store?: { get: jest.Mock; set: jest.Mock; delete: jest.Mock }) {
  return { app: {}, settings: { provider: 'claude' }, quickActionLastUsedStore: store } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  getRegisteredMock.mockReturnValue(['claude', 'codex']);
  getChatUIConfigMock.mockImplementation((id: string) => ({
    getModelOptions: () => (id === 'claude'
      ? [{ value: 'claude-sonnet-4-5', label: 'Sonnet 4.5' }]
      : [{ value: 'gpt-5-codex', label: 'gpt-5-codex' }]),
  }));
  getProviderDisplayNameMock.mockImplementation((id: string) => (id === 'claude' ? 'Claude' : 'Codex'));
  isEnabledMock.mockReturnValue(true);
  resolveSettingsProviderMock.mockReturnValue('claude');
  resolveBlankTabModelMock.mockReturnValue('claude-sonnet-4-5');
});

describe('launchWithModelPicker', () => {
  it('uses stored entry when valid, no fallback notice', () => {
    const store = { get: jest.fn().mockReturnValue({ providerId: 'codex', model: 'gpt-5-codex', updatedAt: 1 }), set: jest.fn(), delete: jest.fn() };
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm: jest.fn() });
    const opts = openModalMock.mock.calls[0][0];
    expect(opts.presetProviderId).toBe('codex');
    expect(opts.presetModel).toBe('gpt-5-codex');
    expect(opts.title).toBe('T');
    expect(opts.fallbackNotice).toBeUndefined();
  });

  it('falls back + fallbackNotice + deletes key when stored provider disabled', () => {
    const store = { get: jest.fn().mockReturnValue({ providerId: 'codex', model: 'gpt-5-codex', updatedAt: 1 }), set: jest.fn(), delete: jest.fn() };
    isEnabledMock.mockImplementation((id: string) => id !== 'codex');
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm: jest.fn() });
    const opts = openModalMock.mock.calls[0][0];
    expect(opts.presetProviderId).toBe('claude');
    expect(opts.fallbackNotice).toEqual({ storedProviderLabel: 'Codex', storedModelLabel: 'gpt-5-codex' });
    expect(store.delete).toHaveBeenCalledWith('loop:x');
  });

  it('falls back when stored model missing', () => {
    const store = { get: jest.fn().mockReturnValue({ providerId: 'claude', model: 'unknown', updatedAt: 1 }), set: jest.fn(), delete: jest.fn() };
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm: jest.fn() });
    const opts = openModalMock.mock.calls[0][0];
    expect(opts.presetModel).toBe('claude-sonnet-4-5');
    expect(opts.fallbackNotice?.storedModelLabel).toBe('unknown');
  });

  it('uses global default on store miss', () => {
    const store = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn() };
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm: jest.fn() });
    const opts = openModalMock.mock.calls[0][0];
    expect(opts.presetProviderId).toBe('claude');
    expect(opts.fallbackNotice).toBeUndefined();
  });

  it('confirm persists choice under the key and invokes onConfirm', () => {
    const store = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn() };
    const onConfirm = jest.fn();
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm });
    const opts = openModalMock.mock.calls[0][0];
    opts.onConfirm({ providerId: 'codex', model: 'gpt-5-codex' });
    expect(store.set).toHaveBeenCalledWith('loop:x', { providerId: 'codex', model: 'gpt-5-codex' });
    expect(onConfirm).toHaveBeenCalledWith({ providerId: 'codex', model: 'gpt-5-codex' });
  });

  it('confirm with disabled provider shows notice, no persist/onConfirm', () => {
    const store = { get: jest.fn().mockReturnValue(null), set: jest.fn(), delete: jest.fn() };
    const onConfirm = jest.fn();
    launchWithModelPicker(makePlugin(store), { lastUsedKey: 'loop:x', title: 'T', onConfirm });
    const opts = openModalMock.mock.calls[0][0];
    isEnabledMock.mockReturnValue(false);
    opts.onConfirm({ providerId: 'codex', model: 'gpt-5-codex' });
    expect(store.set).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('works without a store', () => {
    const onConfirm = jest.fn();
    launchWithModelPicker(makePlugin(undefined), { lastUsedKey: 'loop:x', title: 'T', onConfirm });
    const opts = openModalMock.mock.calls[0][0];
    expect(opts.presetProviderId).toBe('claude');
    expect(() => opts.onConfirm({ providerId: 'claude', model: 'claude-sonnet-4-5' })).not.toThrow();
    expect(onConfirm).toHaveBeenCalled();
  });
});
