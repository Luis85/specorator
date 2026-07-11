import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { ProviderId } from '../../../../../core/providers/types';
import type { TabBarPosition } from '../../../../../core/types/settings';
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
}

const DEFAULT_HEADER: ChatShellHeader = Object.freeze({
  title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false, metaRowVisible: false,
  tabBarPosition: 'input', logoProviderId: null, logoVisible: false,
});

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

  function setTabs(next: TabBarItem[]): void {
    tabs.value = next;
  }
  function setHeader(next: ChatShellHeader): void {
    header.value = next;
  }
  function setActiveTabId(id: TabId | null): void {
    activeTabId.value = id;
  }

  return { tabs, header, activeTabId, setTabs, setHeader, setActiveTabId };
});
