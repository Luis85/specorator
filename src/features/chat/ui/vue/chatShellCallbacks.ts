import type { ProviderId } from '../../../../core/providers/types';
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
  /** Hover pre-warm for the Quick Actions modal — warms the Skills-tab cache so
   *  the modal opens hot (mirrors the old buildNavRowContent mouseenter). */
  onQuickActionsHover: () => void;
  onRename: (title: string) => void;
  /** Empty-state "Open settings" CTA — thin delegator to
   *  SpecoratorView.openPluginSettings(). */
  onOpenSettings: () => void;
  /** Hosts the imperative history + work-order dropdowns into the header. */
  mountHistoryHost: (el: HTMLElement) => void;
  mountWorkOrderHost: (el: HTMLElement) => void;
  /** Hosts the imperative GitActionButton into the meta-row actions slot —
   *  the button only mounts when plugin.gitStatusWatcher exists (mirrors
   *  SpecoratorView.buildHeader). */
  mountGitActionHost: (el: HTMLElement) => void;
  /** Resolves the active tab's navRowEl for 'input' tabBarPosition mode
   *  (mirrors updateNavRowLocation's input-mode branch); null when there is
   *  no active tab yet. */
  resolveNavRowEl: (tabId: TabId | null) => HTMLElement | null;
  /** Renders the per-provider logo SVG into the given host element (mirrors
   *  SpecoratorView.syncHeaderLogo). The host is cleared by the caller
   *  (ChatLogo) before each render, so this only appends. */
  renderProviderLogo: (el: HTMLElement, providerId: ProviderId) => void;
}
