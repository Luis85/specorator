import type { TabManager } from '@/features/chat/tabs/TabManager';
import type SpecoratorPlugin from '@/main';

/**
 * Resolve the chat view's `TabManager`, activating the view first when it is not
 * open yet. Returns null when the view or its manager is unavailable so callers
 * decide whether to warn or silently no-op. Shared by the quick-action, library
 * skill, and loop-prompt dispatch paths, which all need a live tab manager
 * before resolving a target tab — keeping the view-bootstrap in one place.
 */
export async function ensureChatTabManager(plugin: SpecoratorPlugin): Promise<TabManager | null> {
  let view = plugin.getView();
  if (!view) {
    await plugin.activateView();
    view = plugin.getView();
  }
  return view?.getTabManager() ?? null;
}
