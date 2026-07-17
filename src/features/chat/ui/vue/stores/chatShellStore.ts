import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { ProviderId } from '../../../../../core/providers/types';
import type { ConversationMeta } from '../../../../../core/types';
import type { TabBarPosition } from '../../../../../core/types/settings';
import type { WorkOrderActivitySummary } from '../../../../../core/types/workOrderActivity';
import { EMPTY_WORK_ORDER_ACTIVITY_SUMMARY } from '../../../../../core/types/workOrderActivity';
import type { AgentPersona } from '../../../../agents/agentTypes';
import type { TabBarItem, TabId } from '../../../tabs/types';

/** Bound-agent chip projection: the agent name plus its persona, so the chip
 *  renders the same colored persona avatar as SpecoratorView.syncBoundAgentChip
 *  (renderAgentAvatar), not an image URL. */
export interface ChatBoundAgent {
  name: string;
  persona: AgentPersona;
}

/** Header chrome the shell renders — projected off TabManager + the active tab. */
export interface ChatShellHeader {
  title: string;
  boundAgent: ChatBoundAgent | null;
  activeProviderId: ProviderId | null;
  /** Drives the tab-strip show/hide (mirrors updateTabBarVisibility). */
  tabBarVisible: boolean;
  /** Drives the meta-row show/hide (mirrors updateHeaderMetaRow: the row shows
   *  when EITHER the bound-agent chip OR the git-action slot has content). */
  metaRowVisible: boolean;
  /** Mirrors settings.tabBarPosition: 'header' keeps badges + actions in the
   *  header chrome; 'input' teleports both into the active tab's navRowEl
   *  (see updateNavRowLocation). */
  tabBarPosition: TabBarPosition;
  /** Provider whose logo renders in the title slot (mirrors syncHeaderLogo). */
  logoProviderId: ProviderId | null;
  /** Hides the logo when the tab strip is visible in header mode (mirrors the
   *  hideBranding computation in updateNavRowLocation's header-mode branch). */
  logoVisible: boolean;
  /** Hides the title text when the tab strip is visible in header mode — the old
   *  hideBranding rule hid BOTH the logo and the title (updateTabBarVisibility),
   *  so it tracks logoVisible. */
  titleVisible: boolean;
  /** Gates the new-tab (+) button: disabled + hidden at the tab cap (mirrors
   *  updateNewTabButtonVisibility's canCreateTab check). */
  canCreateTab: boolean;
}

const DEFAULT_HEADER: ChatShellHeader = Object.freeze({
  title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false, metaRowVisible: false,
  tabBarPosition: 'input', logoProviderId: null, logoVisible: false, titleVisible: true, canCreateTab: true,
});

/** Per-conversation open state in the history dropdown — mirrors whether a
 *  conversation is closed, open in another tab, or the current tab's session. */
export type HistoryConversationOpenState = 'closed' | 'open' | 'current';

/** Row-level history metadata keyed by conversation id (see perItem below). */
export interface ChatShellConversationMeta {
  openState: HistoryConversationOpenState;
}

/** History-dropdown projection: the conversation list plus the current
 *  selection and per-row open state. Truth stays in ConversationStore. */
export interface ChatShellConversations {
  items: ConversationMeta[];
  currentConversationId: string | null;
  perItem: Record<string, ChatShellConversationMeta>;
}

/** Git-action-button projection: repo presence + dirty count drive the badge,
 *  visible gates the whole slot (mirrors GitActionButton's own show/hide). */
export interface ChatShellGit {
  isRepo: boolean;
  dirtyCount: number;
  visible: boolean;
}

const DEFAULT_CONVERSATIONS: ChatShellConversations = Object.freeze({
  items: [], currentConversationId: null, perItem: {},
});
const DEFAULT_GIT: ChatShellGit = Object.freeze({ isRepo: false, dirtyCount: 0, visible: false });

/**
 * Reactive read-model over the chat shell: the tab-badge strip + header chrome +
 * active selection. I/O and truth stay in TabManager; every setter replaces a
 * whole value/array (shallowRef) so a change fires the watch without deep proxy
 * overhead. Mirrors useAgentBoardStore's projection contract.
 */
export const useChatShellStore = defineStore('chat-shell', () => {
  const tabs = shallowRef<TabBarItem[]>([]);
  const header = shallowRef<ChatShellHeader>(DEFAULT_HEADER);
  const activeTabId = shallowRef<TabId | null>(null);
  const conversations = shallowRef<ChatShellConversations>(DEFAULT_CONVERSATIONS);
  const workOrder = shallowRef<WorkOrderActivitySummary>(EMPTY_WORK_ORDER_ACTIVITY_SUMMARY);
  const git = shallowRef<ChatShellGit>(DEFAULT_GIT);

  function setTabs(next: TabBarItem[]): void {
    tabs.value = next;
  }
  function setHeader(next: ChatShellHeader): void {
    header.value = next;
  }
  function setActiveTabId(id: TabId | null): void {
    activeTabId.value = id;
  }
  function setConversations(next: ChatShellConversations): void {
    conversations.value = next;
  }
  function setWorkOrder(next: WorkOrderActivitySummary): void {
    workOrder.value = next;
  }
  function setGit(next: ChatShellGit): void {
    git.value = next;
  }

  return {
    tabs, header, activeTabId, conversations, workOrder, git,
    setTabs, setHeader, setActiveTabId, setConversations, setWorkOrder, setGit,
  };
});

/** Test-only re-export of the default header (private DEFAULT_HEADER stays frozen). */
export const DEFAULT_HEADER_FOR_TEST: ChatShellHeader = DEFAULT_HEADER;
