import { maybeWarnMarketplaceNetwork } from '@/features/marketplace/marketplaceNetworkGate';
import type SpecoratorPlugin from '@/main';

function makePlugin(warningShown: boolean): SpecoratorPlugin {
  return {
    settings: { marketplaceNetworkWarningShown: warningShown },
    saveSettings: jest.fn().mockResolvedValue(undefined),
  } as unknown as SpecoratorPlugin;
}

describe('maybeWarnMarketplaceNetwork', () => {
  it('persists the flag and saves on the first opt-in', async () => {
    const plugin = makePlugin(false);
    await maybeWarnMarketplaceNetwork(plugin);
    expect(plugin.settings.marketplaceNetworkWarningShown).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it('is a no-op once the warning has already been shown', async () => {
    const plugin = makePlugin(true);
    await maybeWarnMarketplaceNetwork(plugin);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('rolls the flag back when persistence fails so a later opt-in re-warns', async () => {
    const plugin = {
      settings: { marketplaceNetworkWarningShown: false },
      saveSettings: jest.fn().mockRejectedValue(new Error('settings unwritable')),
    } as unknown as SpecoratorPlugin;
    // The Notice was shown, but the failed save must not leave the flag "true" —
    // otherwise the warning is suppressed forever without ever being persisted.
    await expect(maybeWarnMarketplaceNetwork(plugin)).resolves.toBeUndefined();
    expect(plugin.settings.marketplaceNetworkWarningShown).toBe(false);
  });
});
