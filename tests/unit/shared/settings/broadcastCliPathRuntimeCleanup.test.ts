import type { PluginContext } from '@/core/types/PluginContext';
import { broadcastCliPathRuntimeCleanup } from '@/shared/settings/cliPathSetting';

function makeView() {
  const broadcastToAllTabs = jest.fn().mockResolvedValue(undefined);
  return {
    broadcastToAllTabs,
    view: { getTabManager: () => ({ broadcastToAllTabs }) },
  };
}

describe('broadcastCliPathRuntimeCleanup', () => {
  it('recycles runtimes in EVERY open leaf, not just the first', async () => {
    // Obsidian can host several Specorator leaves; cleaning only `getView()`
    // left the others' persistent runtimes on the previous executable.
    const first = makeView();
    const second = makeView();
    const plugin = {
      getAllViews: () => [first.view, second.view],
      getView: () => first.view,
    } as unknown as PluginContext;

    await broadcastCliPathRuntimeCleanup(plugin);

    expect(first.broadcastToAllTabs).toHaveBeenCalledTimes(1);
    expect(second.broadcastToAllTabs).toHaveBeenCalledTimes(1);
  });

  it('tolerates a leaf whose tab manager is not built yet', async () => {
    const healthy = makeView();
    const plugin = {
      getAllViews: () => [{ getTabManager: () => null }, healthy.view],
    } as unknown as PluginContext;

    await expect(broadcastCliPathRuntimeCleanup(plugin)).resolves.toBeUndefined();
    expect(healthy.broadcastToAllTabs).toHaveBeenCalledTimes(1);
  });

  it('no-ops with no open leaves', async () => {
    const plugin = { getAllViews: () => [] } as unknown as PluginContext;

    await expect(broadcastCliPathRuntimeCleanup(plugin)).resolves.toBeUndefined();
  });
});
