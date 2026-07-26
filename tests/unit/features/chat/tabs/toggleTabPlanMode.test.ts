jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getCapabilities: jest.fn(),
    // No applyPermissionMode → updatePlanModeUI assigns snapshot.permissionMode directly.
    getChatUIConfig: jest.fn(() => ({})),
  },
}));
jest.mock('@/core/providers/ProviderSettingsCoordinator', () => ({
  ProviderSettingsCoordinator: {
    getProviderSettingsSnapshot: jest.fn(),
    commitProviderSettingsSnapshot: jest.fn(),
  },
}));
jest.mock('@/features/chat/tabs/providerResolution', () => ({
  getTabProviderId: jest.fn(() => 'claude'),
}));

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import { toggleTabPlanMode } from '@/features/chat/tabs/tabShared';

const getCapabilities = ProviderRegistry.getCapabilities as jest.Mock;
const getSnapshot = ProviderSettingsCoordinator.getProviderSettingsSnapshot as jest.Mock;
const commitSnapshot = ProviderSettingsCoordinator.commitProviderSettingsSnapshot as jest.Mock;

/**
 * Characterization of the plan-toggle logic extracted from `SpecoratorView.wireEventHandlers`
 * (Round-65) and now shared with Team Chat's DM host-events wiring: both view-level Shift+Tab
 * handlers must behave identically. Locks the untested pre-extraction behavior.
 */
describe('toggleTabPlanMode', () => {
  function makeTab(prePlan: string | null) {
    return { state: { prePlanPermissionMode: prePlan }, composer: { emit: jest.fn() } } as never;
  }
  const plugin = { settings: {}, saveSettings: jest.fn() } as never;

  beforeEach(() => {
    getCapabilities.mockReset().mockReturnValue({ supportsPlanMode: true });
    getSnapshot.mockReset();
    commitSnapshot.mockReset();
  });

  it('no-ops when the tab provider does not support plan mode', () => {
    getCapabilities.mockReturnValue({ supportsPlanMode: false });
    const tab = makeTab('normal');

    toggleTabPlanMode(tab, plugin);

    expect(commitSnapshot).not.toHaveBeenCalled();
    expect((tab as { state: { prePlanPermissionMode: string | null } }).state.prePlanPermissionMode).toBe('normal');
  });

  it('enters plan mode: saves the current mode as prePlan and commits permissionMode "plan"', () => {
    getSnapshot.mockImplementation(() => ({ permissionMode: 'acceptEdits' }));
    const tab = makeTab(null);

    toggleTabPlanMode(tab, plugin);

    // Saved the pre-plan mode read at toggle time.
    expect((tab as { state: { prePlanPermissionMode: string | null } }).state.prePlanPermissionMode).toBe('acceptEdits');
    // Committed a snapshot flipped to 'plan'.
    expect(commitSnapshot).toHaveBeenCalledTimes(1);
    expect(commitSnapshot.mock.calls[0][2].permissionMode).toBe('plan');
  });

  it('exits plan mode: restores the saved prePlan mode and clears it', () => {
    getSnapshot.mockImplementation(() => ({ permissionMode: 'plan' }));
    const tab = makeTab('acceptEdits');

    toggleTabPlanMode(tab, plugin);

    expect((tab as { state: { prePlanPermissionMode: string | null } }).state.prePlanPermissionMode).toBeNull();
    expect(commitSnapshot).toHaveBeenCalledTimes(1);
    expect(commitSnapshot.mock.calls[0][2].permissionMode).toBe('acceptEdits');
  });

  it('exits plan mode to "normal" when no prePlan mode was saved', () => {
    getSnapshot.mockImplementation(() => ({ permissionMode: 'plan' }));
    const tab = makeTab(null);

    toggleTabPlanMode(tab, plugin);

    expect(commitSnapshot.mock.calls[0][2].permissionMode).toBe('normal');
  });
});
