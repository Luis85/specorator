import { ItemView, Notice, setIcon, type WorkspaceLeaf } from 'obsidian';

import { ProviderRegistry } from '../../../../core/providers/ProviderRegistry';
import type { ProviderId } from '../../../../core/providers/types';
import { asSettingsBag } from '../../../../core/types/settings';
import { t } from '../../../../i18n/i18n';
import type SpecoratorPlugin from '../../../../main';
import { renderLibraryNav } from '../../../../shared/libraryNav';
import { LibraryListController } from '../../../../shared/libraryToolbar';
import { confirm } from '../../../../shared/modals/ConfirmModal';
import { withErrorNotice } from '../../../../shared/uiAction';
import { createLibraryCard, renderLibraryEmptyState, renderLibraryLoading, renderLibraryShell } from '../../../../utils/libraryView';
import { renderAgentAvatar } from '../../agentAvatar';
import { rosterAgentToPersona } from '../../personaRegistry';
import { installPresetAgents } from '../presetAgents';
import { resolveAgentProvider as resolveAgentProviderId } from '../resolveAgentProvider';
import { createRosterAgent, dedupeRosterId } from '../rosterCapabilities';
import type { RosterAgent } from '../rosterTypes';
import { AgentDetailEditor } from './AgentDetailEditor';

export const VIEW_TYPE_AGENT_ROSTER = 'specorator-agent-roster';

const CARD_AVATAR_SIZE = 36;

export class AgentRosterView extends ItemView {
  private readonly controller = new LibraryListController<RosterAgent>({
    getName: (a) => a.name,
    getDescription: (a) => a.description,
    getTags: (a) => [...a.roles, ...(a.tags ?? [])],
    getUpdatedAt: (a) => a.updatedAt,
  });

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

    this.controller.setItems(agents);
    this.controller.renderToolbar(toolbar, {
      searchPlaceholder: t('library.searchPlaceholder'),
      sortLabel: t('library.sortLabel'),
      sortName: t('library.sortName'),
      sortUpdated: t('library.sortUpdated'),
      resetFilters: t('library.resetFilters'),
    }, () => this.renderRows(list));
    this.renderRows(list);
  }

  private renderRows(list: HTMLElement): void {
    list.empty();
    const rows = this.controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const agent of rows) this.renderCard(list, agent);
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

    const caps = body.createDiv({ cls: 'specorator-roster-card-caps' });
    for (const role of agent.roles) {
      const roleLabel = role === 'verifier' ? t('agentRoster.roleVerifier') : t('agentRoster.roleWorker');
      caps.createSpan({ cls: 'specorator-roster-chip specorator-roster-chip-role', text: roleLabel });
    }
    for (const tag of agent.tags ?? []) {
      caps.createSpan({ cls: 'specorator-library-chip', text: tag });
    }
    // Only surface the capability count once the agent actually has skills — a
    // "0 Skills" chip on a fresh agent is noise.
    if (agent.skills.length > 0) {
      caps.createSpan({
        cls: 'specorator-roster-chip',
        text: t('agentRoster.capsSummary', { skills: String(agent.skills.length) }),
      });
    }

    const fail = t('agentRoster.actionFailed');
    const startBtn = actions.createEl('button', { cls: 'mod-cta', text: t('agentRoster.startChatShort') });
    startBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.startChatWithAgent(agent), fail, (err) => this.fail(err));
    };
    const cloneBtn = actions.createEl('button', {
      cls: 'specorator-library-card-icon',
      attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
    });
    setIcon(cloneBtn, 'copy');
    cloneBtn.onclick = (e) => {
      e.stopPropagation();
      void withErrorNotice(() => this.cloneAgent(agent), fail, (err) => this.fail(err));
    };
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
    const agent = createRosterAgent(t('agentRoster.newAgent'), Date.now());
    const uniqueId = dedupeRosterId(agent.id, existing.map((a) => a.id));
    if (uniqueId !== agent.id) {
      agent.id = uniqueId;
      agent.name = `${t('agentRoster.newAgent')} ${uniqueId.split('-').pop()}`;
    }
    // Don't pre-save: open the editor in-memory and let the user's first Save
    // (or Start chat) persist it. Abandoning the editor leaves no orphan file.
    await this.openDetail(agent, { isNew: true });
  }

  private async syncToProviders(): Promise<void> {
    const result = await this.plugin.syncRosterAgentsToProviders();
    if (result.failed.length > 0) {
      new Notice(t('agentRoster.syncFailed', { written: String(result.written), failed: String(result.failed.length) }));
      return;
    }
    new Notice(
      result.providers.length > 0
        ? t('agentRoster.syncDone', {
            written: String(result.written),
            providers: result.providers.join(', '),
          })
        : t('agentRoster.syncNone'),
    );
  }

  private fail(error: unknown): void {
    this.plugin.logger.scope('agents').error('roster action failed', error);
  }

  private async installStarters(): Promise<void> {
    const result = await installPresetAgents(this.store);
    new Notice(
      result.installed.length > 0
        ? t('agentRoster.installStarterDone', {
            installed: String(result.installed.length),
            skipped: String(result.skipped.length),
          })
        : t('agentRoster.installStarterNone'),
    );
    await this.renderList();
  }

  private async cloneAgent(agent: RosterAgent): Promise<void> {
    const existing = await this.store.list();
    const cloneName = `${agent.name} copy`;
    const base = createRosterAgent(cloneName, Date.now());
    const clone: RosterAgent = {
      ...agent,
      id: dedupeRosterId(base.id, existing.map((a) => a.id)),
      name: cloneName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.store.save(clone);
    await this.renderList();
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

  /**
   * Opens a chat bound to the agent on a supported provider. The agent's
   * preferred provider (explicit `providerOverride`, else its model's provider)
   * wins only when that provider is actually enabled; otherwise it falls back to
   * the user's active/default enabled provider. This prevents defaulting to a
   * disabled Claude (which would error with "CLI not found") when, say, only
   * Cursor is enabled.
   */
  private resolveAgentProvider(agent: RosterAgent): ProviderId {
    const settings = asSettingsBag(this.plugin.settings);
    return resolveAgentProviderId(
      agent,
      (p) => ProviderRegistry.isEnabled(p, settings),
      ProviderRegistry.resolveSettingsProviderId(settings),
    );
  }

  private async startChatWithAgent(agent: RosterAgent): Promise<void> {
    const conversation = await this.plugin.createConversation({
      providerId: this.resolveAgentProvider(agent),
      boundAgentId: agent.id,
    });
    // Always open the agent in a fresh tab so it never hijacks a chat already in
    // use (e.g. a streaming conversation in the active tab).
    await this.plugin.openConversation(conversation.id, { requireNewTab: true });
  }
}
