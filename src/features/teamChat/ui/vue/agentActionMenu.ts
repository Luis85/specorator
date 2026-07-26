import { Menu } from 'obsidian';

import { t } from '../../../../i18n/i18n';

/**
 * The agent action menu shared by the roster row and the top bar, so the two can't drift
 * about what a DM offers — or, more importantly, about what it must NOT offer.
 *
 * Deliberately absent: fork, new session, and `/clear`. All three are surface-gated off for
 * a DM's one-fixed-thread model (each would mint an unbound conversation that escapes the
 * surface filter and desyncs the room map), so re-adding any of them here as a "convenience"
 * would reopen exactly the hole the gating closes.
 */
export interface AgentActionMenuOptions {
  /** Row menus lead with "Open chat"; the top bar is already showing that DM. */
  includeOpen?: boolean;
  /**
   * Streaming DMs hide "Close chat" rather than disabling it: force-closing a live turn
   * truncates the response, which is exactly what `pickLruDmEviction` refuses to do. The
   * view re-checks before closing, so this is the affordance, not the guarantee.
   */
  isBusy: boolean;
  onOpen?: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export function showAgentActionMenu(event: MouseEvent, options: AgentActionMenuOptions): void {
  const menu = new Menu();
  if (options.includeOpen && options.onOpen) {
    const onOpen = options.onOpen;
    menu.addItem((item) => item
      .setTitle(t('teamChat.menuOpenChat'))
      .setIcon('message-square')
      .onClick(onOpen));
  }
  menu.addItem((item) => item
    .setTitle(t('teamChat.menuEditAgent'))
    .setIcon('pencil')
    .onClick(options.onEdit));
  if (!options.isBusy) {
    menu.addItem((item) => item
      .setTitle(t('teamChat.menuCloseChat'))
      .setIcon('x')
      .onClick(options.onClose));
  }
  menu.showAtMouseEvent(event);
}
