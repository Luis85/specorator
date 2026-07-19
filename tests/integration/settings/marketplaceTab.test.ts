/**
 * @jest-environment jsdom
 */
/**
 * Regression for the Marketplace settings tab: `registerMarketplaceTabFields`
 * registers the tab in the registry, but until it was added to the fixed tab
 * strip + registry-renderer whitelist the real settings page never built a
 * Marketplace tab button or content host, so `marketplaceSourceUrl` could not
 * be configured from Settings (Codex review on PR #494). This asserts the tab
 * now appears in the rendered strip and its fields render.
 */
import '../../setup/obsidianDom';

import { ProviderRegistry } from '../../../src/core/providers/ProviderRegistry';
import { resetSettingsRegistryForTests } from '../../../src/features/settings/registry';
import { computeTabIds } from '../../../src/features/settings/settingsTabStrip';
import { assertTabRendersRegistry, mountSettingsShell } from './_portTestHelpers';

jest.mock('../../../src/core/providers/ProviderRegistry');

describe('marketplace settings tab', () => {
  beforeEach(() => {
    resetSettingsRegistryForTests();
    jest.clearAllMocks();
  });

  it('includes marketplace in the fixed tab strip (before diagnostics)', () => {
    (ProviderRegistry as unknown as { getEnabledProviderIds: jest.Mock }).getEnabledProviderIds =
      jest.fn().mockReturnValue([]);
    expect(computeTabIds({} as never)).toEqual([
      'general',
      'agentBoard',
      'marketplace',
      'diagnostics',
    ]);
  });

  it('renders a Marketplace tab button and its network-enable field in the strip', () => {
    const { containerEl, tabContent, plugin } = mountSettingsShell({
      tabId: 'marketplace',
      tabContentIndex: 2,
    });

    // The strip now carries a Marketplace tab button — the missing piece.
    expect(containerEl.querySelector('[data-tab-id="marketplace"]')).not.toBeNull();
    // The opt-in toggle always renders; the source URL is gated on it.
    expect(tabContent.querySelector('[data-field-id="marketplaceNetworkEnabled"]')).not.toBeNull();
    assertTabRendersRegistry(tabContent, plugin, 'marketplace');
  });

  it('reveals the source URL field once networking is enabled', () => {
    const { tabContent } = mountSettingsShell({
      tabId: 'marketplace',
      tabContentIndex: 2,
      extraSettings: { marketplaceNetworkEnabled: true },
    });
    expect(tabContent.querySelector('[data-field-id="marketplaceSourceUrl"]')).not.toBeNull();
  });
});
