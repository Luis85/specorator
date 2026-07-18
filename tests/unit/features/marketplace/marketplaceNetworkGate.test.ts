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
});
