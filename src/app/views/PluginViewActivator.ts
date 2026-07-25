import type { TFile, WorkspaceLeaf } from 'obsidian';

import { VIEW_TYPE_SPECORATOR, VIEW_TYPE_SPECORATOR_AGENT_BOARD } from '@/core/types';
import type { ChatViewPlacement } from '@/core/types/settings';
import type { SpecoratorView } from '@/features/chat/SpecoratorView';
import { AgentBoardView } from '@/features/tasks/ui/AgentBoardView';
import type SpecoratorPlugin from '@/main';
import { revealWorkspaceLeaf } from '@/utils/obsidianCompat';

export class PluginViewActivator {
  constructor(private readonly plugin: SpecoratorPlugin) {}

  async activateView(): Promise<void> {
    const { workspace } = this.plugin.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR)[0];

    if (!leaf) {
      const newLeaf = this.getLeafForPlacement(this.plugin.settings.chatViewPlacement);
      if (newLeaf) {
        await newLeaf.setViewState({ type: VIEW_TYPE_SPECORATOR, active: true });
        leaf = newLeaf;
      }
    }

    if (leaf) {
      await revealWorkspaceLeaf(workspace, leaf);
    }
  }

  async activateAgentBoardView(): Promise<void> {
    const { workspace } = this.plugin.app;
    let leaf: WorkspaceLeaf | null =
      workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR_AGENT_BOARD)[0] ?? null;

    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_SPECORATOR_AGENT_BOARD, active: true });
    }

    await revealWorkspaceLeaf(workspace, leaf);
  }

  async ensureViewOpen(): Promise<SpecoratorView | null> {
    const existingView = this.plugin.getView();
    if (existingView) return existingView;
    // Route through plugin.activateView() — tests + external consumers
    // observe the plugin-level method, not this collaborator's instance method.
    await this.plugin.activateView();
    return this.plugin.getView();
  }

  async openNewTab(): Promise<void> {
    const existingView = this.plugin.getView();
    if (existingView) {
      await existingView.createNewTab();
      return;
    }

    const restoredTabCount = this.getLastKnownOpenTabCount();
    const view = await this.ensureViewOpen();
    if (!view) return;

    if (restoredTabCount === 0) return;
    await view.createNewTab();
  }

  canCreateNewTab(): boolean {
    const hasSpecoratorLeaf =
      this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR).length > 0;
    const view = this.plugin.getView();
    const tabManager = view?.getTabManager();

    if (tabManager) {
      return tabManager.canCreateTab('chat');
    }
    if (hasSpecoratorLeaf) return false;
    return this.getLastKnownOpenTabCount() < this.getMaxTabsLimitFor('chat');
  }

  /**
   * Work-order tab usage and the WO cap, for the Agent Board queue's slot gate.
   *
   * Reports only work-order tabs (not totals): the queue should consume only
   * its own budget, leaving user chat tabs untouched. Pending WO-tab
   * reservations are added on top so a second Agent Board pane sees the
   * committed-but-uncreated tab and can't over-launch into the cap.
   *
   * When a Specorator leaf exists but its tab manager isn't ready yet — not
   * created, or created but still restoring its persisted tabs — report no
   * free capacity so the queue waits instead of racing the restore.
   *
   * When no view exists at all, only reservations contribute to usage — there
   * are no live WO tabs yet, so the queue may still launch up to the cap minus
   * pending reservations.
   */
  getTabSlotUsage(): { used: number; max: number } {
    const max = this.getMaxTabsLimitFor('work-order');
    const views = typeof this.plugin.getAllViews === 'function'
      ? this.plugin.getAllViews()
      : (() => {
          const view = this.plugin.getView();
          return view ? [view] : [];
        })();
    if (views.length === 0) {
      const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR);
      if (leaves.length === 0) {
        return { used: this.plugin.chatTabReservations.pending, max };
      }
      if (leaves.every((leaf) => leaf.isDeferred)) {
        const persistedWorkOrderTabs = this.getLastKnownOpenTabCountFor('work-order');
        return {
          used: persistedWorkOrderTabs + this.plugin.chatTabReservations.pending,
          max,
        };
      }
      return { used: max, max };
    }

    let used = this.plugin.chatTabReservations.pending;
    let anyMidRestore = false;
    // Only the sidebar chat view hosts work-order run tabs (launched via
    // SpecoratorViewWorkOrderBridge → createTaskRunTab). A Team Chat leaf creates
    // chat-kind DM tabs only, so its restore readiness must not gate work-order
    // capacity — a mid-restore Team Chat leaf would otherwise trip the
    // anyMidRestore block below and stall the whole queue. Allowlisting the
    // WO-hosting host (rather than denylisting Team Chat) also excludes any future
    // non-WO view type by default.
    const workOrderHosts = views.filter(
      (view) => view.leaf.view.getViewType() === VIEW_TYPE_SPECORATOR,
    );
    for (const view of workOrderHosts) {
      const tabManager = view.getTabManager();
      if (!tabManager || !view.areTabsRestored()) {
        anyMidRestore = true;
        continue;
      }
      used += tabManager.countTabsByKind('work-order');
    }

    // A single mid-restore leaf may still hydrate persisted work-order tabs, so
    // its contribution is unknown — even alongside already-restored views. Report
    // full usage until every view's tabs are known, or the queue could launch
    // extra work-order tabs and exceed agentBoardQueueCap once restore finishes.
    if (anyMidRestore) {
      return { used: max, max };
    }
    return { used, max };
  }

  async runNextReadyWorkOrder(): Promise<void> {
    await this.activateAgentBoardView();
    const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR_AGENT_BOARD)[0];
    const view = leaf?.view;
    if (view instanceof AgentBoardView) {
      await view.runNextReady();
    }
  }

  /**
   * Reveal the Agent Board (creating its leaf if needed) and open the work-order
   * detail modal for a freshly created note. Backs the file/folder right-click
   * "Create work order" flow so it surfaces the modal — with the board's full
   * action wiring — instead of opening the raw note.
   */
  async openWorkOrderInBoard(file: TFile): Promise<void> {
    await this.activateAgentBoardView();
    const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_SPECORATOR_AGENT_BOARD)[0];
    const view = leaf?.view;
    if (view instanceof AgentBoardView) {
      await view.openDetailForFile(file);
    }
  }

  private getLeafForPlacement(placement: ChatViewPlacement): WorkspaceLeaf | null {
    const { workspace } = this.plugin.app;
    switch (placement) {
      case 'main-tab':
        return workspace.getLeaf('tab');
      case 'left-sidebar':
        return workspace.getLeftLeaf(false);
      case 'right-sidebar':
        return workspace.getRightLeaf(false);
    }
  }

  private getLastKnownOpenTabCount(): number {
    return this.plugin.lastKnownTabManagerState?.openTabs.length ?? 0;
  }

  private getLastKnownOpenTabCountFor(kind: 'chat' | 'work-order'): number {
    const tabs = this.plugin.lastKnownTabManagerState?.openTabs ?? [];
    return tabs.filter((tab) => (tab.kind ?? 'chat') === kind).length;
  }

  private getMaxTabsLimitFor(kind: 'chat' | 'work-order'): number {
    if (kind === 'work-order') {
      // WO tab cap follows the Agent Board queue cap so users only have one
      // knob for "how many work orders at once". Clamp to the queue cap range.
      const raw = this.plugin.settings.agentBoardQueueCap ?? 1;
      return Math.max(1, Math.min(8, raw));
    }
    const raw = this.plugin.settings.maxChatTabs ?? 3;
    return Math.max(3, Math.min(10, raw));
  }
}
