import type { TabBarItem, TabId } from '../../tabs/types';
import type { ChatShellHeader } from './stores/chatShellStore';

/** A single projected snapshot the view pushes on every TabManager change. */
export interface ChatShellSnapshot {
  tabs: TabBarItem[];
  header: ChatShellHeader;
  activeTabId: TabId | null;
}

/** The view-owned subscription seam: fires `onChange` on every relevant
 *  TabManager callback, returns an unsubscribe fn. */
export type ChatShellSubscribe = (onChange: (snapshot: ChatShellSnapshot) => void) => () => void;

/** Vue → engine actions. Thin delegators to SpecoratorView/TabManager methods. */
export interface ChatShellCallbacks {
  subscribe: ChatShellSubscribe;
  onTabClick: (id: TabId) => void;
  onTabClose: (id: TabId) => void;
  onNewTab: () => void;
  /** "New conversation" header button (square-pen) — distinct from onNewTab
   *  (square-plus): starts a fresh conversation in the ACTIVE tab rather than
   *  opening a new tab. Thin delegator to SpecoratorView.buildNavRowContent's
   *  newBtn handler (tabManager.createNewConversation() + history refresh). */
  onNewConversation: () => void;
  onOpenHistory: () => void;
  onOpenWorkOrders: () => void;
  onQuickActions: () => void;
  onRename: (title: string) => void;
  /** Empty-state "Open settings" CTA — thin delegator to
   *  SpecoratorView.openPluginSettings(). */
  onOpenSettings: () => void;
  /** Hosts the imperative history + work-order dropdowns into the header. */
  mountHistoryHost: (el: HTMLElement) => void;
  mountWorkOrderHost: (el: HTMLElement) => void;
}
