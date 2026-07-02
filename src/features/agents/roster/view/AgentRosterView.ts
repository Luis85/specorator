import { ItemView, Notice, type WorkspaceLeaf } from 'obsidian';

import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import type SpecoratorPlugin from '../../../../main';
import { renderLibraryNav } from '../../../../shared/libraryNav';
import { LibraryListController, mountLibraryList, renderCloneButton } from '../../../../shared/libraryToolbar';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { createLibraryCard, renderLibraryEmptyState, renderLibraryLoading, renderLibraryShell } from '../../../../utils/libraryView';
import { VIEW_TYPE_LIBRARY } from '../../../library/viewType';
import { renderAgentAvatar } from '../../agentAvatar';
import { rosterAgentToPersona } from '../../personaRegistry';
import { installPresetAgentsWithNotice, startChatWithRosterAgent, syncRosterAgentsWithNotice } from '../rosterAgentActions';
import { cloneRosterAgent, draftRosterAgent } from '../rosterCapabilities';
import { rosterLibraryAccessors, rosterRoleLabel } from '../rosterLibraryAccessors';
import type { RosterAgent } from '../rosterTypes';
import { AgentDetailEditor } from './AgentDetailEditor';

export const VIEW_TYPE_AGENT_ROSTER = 'specorator-agent-roster';

const CARD_AVATAR_SIZE = 36;

export class AgentRosterView extends ItemView {
  private readonly controller = new LibraryListController<RosterAgent>(rosterLibraryAccessors);

  constructor(leaf: WorkspaceLeaf, private plugin: SpecoratorPlugin) {
    super(leaf);
  }

  private get store() {
    return this.plugin.agentRosterStore;
  }

  getViewType(): string { return VIEW_TYPE_AGENT_ROSTER; }
  getDisplayText(): string { return t('agentRoster.title'); }
  getIcon(): string { return 'users'; }

  async onOpen(): Promise<void> {
    if (this.plugin.settings.useVueLibrary) {
      await this.leaf.setViewState({ type: VIEW_TYPE_LIBRARY, active: true, state: { tab: 'agents' } });
      return;
    }
    await this.renderList();
  }

  // ── List / dashboard ──────────────────────────────────────────────────────

  private async renderList(): Promise<void> {
    // The roster shares the library shell with the Skill/Loop views; only the
    // detail editor keeps its bespoke `specorator-roster-detail` root.
    this.contentEl.removeClass('specorator-roster-detail');
    const { actions: headerActions, toolbar, list } = renderLibraryShell(
      this.contentEl,
      t('agentRoster.title'),
      (c) => renderLibraryNav(c, this.plugin, VIEW_TYPE_AGENT_ROSTER),
    );

    const fail = t('agentRoster.actionFailed');
    const newBtn = headerActions.createEl('button', { cls: 'mod-cta', text: t('agentRoster.newAgent') });
    newBtn.onclick = () => void withErrorNotice(() => this.createAndEdit(), fail, (e) => this.fail(e));

    const installBtn = headerActions.createEl('button', { text: t('agentRoster.installStarter') });
    installBtn.onclick = () => void withErrorNotice(() => this.installStarters(), fail, (e) => this.fail(e));

    const syncBtn = headerActions.createEl('button', { text: t('agentRoster.syncProviders') });
    syncBtn.setAttribute('title', t('agentRoster.syncProvidersHint'));
    syncBtn.onclick = () => void withErrorNotice(() => this.syncToProviders(), fail, (e) => this.fail(e));

    renderLibraryLoading(list, t('common.loading'));

    const agents = await this.store.list();
    list.empty();
    if (agents.length === 0) {
      renderLibraryEmptyState(list, {
        icon: 'users',
        message: t('agentRoster.emptyState'),
        // CTA must match the "Create one to get started" copy, so it creates a
        // new agent rather than installing starters (those stay in the header).
        actionLabel: t('agentRoster.newAgent'),
        onAction: () => void withErrorNotice(() => this.createAndEdit(), fail, (e) => this.fail(e)),
      });
      return;
    }

    mountLibraryList({ controller: this.controller, items: agents, toolbar, list, renderCard: (l, a) => this.renderCard(l, a) });
  }

  private renderCard(list: HTMLElement, agent: RosterAgent): void {
    const { card, body, actions } = createLibraryCard(list, agent.name, {
      leading: (slot) => {
        slot.addClass('specorator-roster-card-avatar');
        slot.setAttribute('aria-hidden', 'true');
        renderAgentAvatar(slot, rosterAgentToPersona(agent), CARD_AVATAR_SIZE);
      },
      interactive: { onActivate: () => void this.openDetail(agent), ariaLabel: agent.name },
    });
    card.addClass('specorator-roster-card');

    body.createDiv({ cls: 'specorator-roster-card-desc', text: agent.description || '—' });

    const caps = body.createDiv({ cls: 'specorator-library-card-caps' });
    for (const role of agent.roles) {
      caps.createSpan({ cls: 'specorator-roster-chip specorator-roster-chip-role', text: rosterRoleLabel(role) });
    }
    for (const tag of agent.tags ?? []) {
      caps.createSpan({ cls: 'specorator-library-chip', text: tag });
    }
    if (agent.modelSelection) {
      const { modelId, providerId } = agent.modelSelection;
      const modelOptions = ProviderRegistry.getChatUIConfig(providerId).getModelOptions(asSettingsBag(this.plugin.settings));
      const modelLabel = modelOptions.find((o) => o.value === modelId)?.label ?? modelId;
      caps.createSpan({ cls: 'specorator-roster-chip specorator-roster-chip-model', text: modelLabel });
    }
    // Only surface the capability count once the agent actually has skills — a
    // "0 Skills" chip on a fresh agent is noise.
    if (agent.skills.length > 0) {
      caps.createSpan({
        cls: 'specorator-roster-chip',
        text: t('agentRoster.capsSummary', { skills: String(agent.skills.length) }),
      });
    }
    if (caps.childElementCount === 0) caps.remove();

    const fail = t('agentRoster.actionFailed');
    const startBtn = actions.createEl('button', { cls: 'mod-cta', text: t('agentRoster.startChatShort') });
    startBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.startChatWithAgent(agent), fail, (err) => this.fail(err));
    };
    renderCloneButton(actions, (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.cloneAgent(agent), fail, (err) => this.fail(err));
    });
    const deleteBtn = actions.createEl('button', { cls: 'specorator-library-card-delete', text: t('agentRoster.delete') });
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.deleteAgent(agent), fail, (err) => this.fail(err));
    };
  }

  // ── Detail editor ─────────────────────────────────────────────────────────

  private async openDetail(agent: RosterAgent, opts?: { isNew?: boolean }): Promise<void> {
    const editor = new AgentDetailEditor(this.plugin, {
      onBack: () => void this.renderList(),
      onStartChat: (a) => void withErrorNotice(() => this.startChatWithAgent(a), t('agentRoster.actionFailed'), (e) => this.fail(e)),
      onDeleted: (a) => void withErrorNotice(() => this.deleteAgent(a), t('agentRoster.actionFailed'), (e) => this.fail(e)),
    });
    await editor.render(this.contentEl, agent, opts);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async createAndEdit(): Promise<void> {
    const existing = await this.store.list();
    // Don't pre-save: open the editor in-memory and let the user's first Save
    // (or Start chat) persist it. Abandoning the editor leaves no orphan file.
    const agent = draftRosterAgent(t('agentRoster.newAgent'), existing, Date.now());
    await this.openDetail(agent, { isNew: true });
  }

  private async syncToProviders(): Promise<void> {
    await syncRosterAgentsWithNotice(this.plugin);
  }

  private fail(error: unknown): void {
    this.plugin.logger.scope('agents').error('roster action failed', error);
  }

  private async installStarters(): Promise<void> {
    await installPresetAgentsWithNotice(this.plugin);
    await this.renderList();
  }

  private async cloneAgent(agent: RosterAgent): Promise<void> {
    const existing = await this.store.list();
    const clone = cloneRosterAgent(agent, existing, Date.now());
    await this.store.save(clone);
    await this.openDetail(clone);
  }

  private async deleteAgent(agent: RosterAgent): Promise<void> {
    const ok = await confirm(
      this.plugin.app,
      t('agentRoster.deleteConfirm', { name: agent.name }),
      t('agentRoster.delete'),
    );
    if (!ok) return;
    await this.store.delete(agent.id);
    await this.plugin.removeRosterAgentProjection(agent);
    new Notice(t('agentRoster.deleted', { name: agent.name }));
    await this.renderList();
  }

  private async startChatWithAgent(agent: RosterAgent): Promise<void> {
    // Provider resolution + fresh-tab policy live in rosterAgentActions,
    // shared with the Vue AgentsPanel.
    await startChatWithRosterAgent(this.plugin, agent);
  }
}
