import type { ProviderId } from '../../../../core/providers/types';
import type { WorkOrderActivitySummary } from '../../../../core/types/workOrderActivity';
import type { TabBarItem, TabId } from '../../tabs/types';
import type { ChatShellConversations, ChatShellGit, ChatShellHeader } from './stores/chatShellStore';

/** A single projected snapshot the view pushes on every TabManager change. */
export interface ChatShellSnapshot {
  tabs: TabBarItem[];
  header: ChatShellHeader;
  activeTabId: TabId | null;
  conversations: ChatShellConversations;
  workOrder: WorkOrderActivitySummary;
  git: ChatShellGit;
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
   *  opening a new tab. Thin delegator to the former SpecoratorView.buildNavRowContent's
   *  newBtn handler (tabManager.createNewConversation() + history refresh), which
   *  was deleted in the chat-shell Vue cutover (ADR 0005). */
  onNewConversation: () => void;
  onOpenHistory: () => void;
  onQuickActions: () => void;
  /** Hover pre-warm for the Quick Actions modal — warms the Skills-tab cache so
   *  the modal opens hot (mirrors the old buildNavRowContent mouseenter). */
  onQuickActionsHover: () => void;
  onRename: (title: string) => void;
  /** Empty-state "Open settings" CTA — thin delegator to
   *  SpecoratorView.openPluginSettings(). */
  onOpenSettings: () => void;
  /** Hosts the imperative history dropdown into the header. */
  mountHistoryHost: (el: HTMLElement) => void;
  /** Resolves the active tab's navRowEl for 'input' tabBarPosition mode
   *  (mirrors updateNavRowLocation's input-mode branch); null when there is
   *  no active tab yet. */
  resolveNavRowEl: (tabId: TabId | null) => HTMLElement | null;
  /** Renders the per-provider logo SVG into the given host element (mirrors
   *  SpecoratorView.syncHeaderLogo). The host is cleared by the caller
   *  (ChatLogo) before each render, so this only appends. */
  renderProviderLogo: (el: HTMLElement, providerId: ProviderId) => void;
  /** Switch the active tab to a conversation (history row click). */
  onSelectConversation: (id: string) => void;
  /** Open a conversation in a new tab (modifier/middle click or context menu). */
  onOpenConversationInNewTab: (id: string, activate: boolean) => void;
  /** Rename a conversation (inline rename input commit). */
  onRenameConversation: (id: string, title: string) => void;
  /** Delete a conversation (streaming-gated; reloads active if it was current). */
  onDeleteConversation: (id: string) => void;
  /** Regenerate a conversation's AI title (pending/failed status flow). */
  onRegenerateConversationTitle: (id: string) => void;
  /** Build the Obsidian right-click Menu for a history row at the event.
   *  `startRename` enters the Vue component's inline-rename mode for the row
   *  (the rename `<input>` lives in the component, not the view). */
  onConversationContextMenu: (id: string, event: MouseEvent, anchorEl: HTMLElement, startRename: () => void) => void;
  /** Open a work-order activity item (then the dropdown closes). */
  onOpenWorkOrderItem: (id: string) => void;
  /** Close a finished work-order tab (dropdown stays open for batch dismiss). */
  onCloseWorkOrderTab: (tabId: string) => void;
  /** Send the commit-&-push prompt to the active tab. */
  onGitCommit: () => void;
}
