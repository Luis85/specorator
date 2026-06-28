import type { Logger } from '../../core/logging/Logger';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import type { ProviderId } from '../../core/providers/types';
import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { asSettingsBag, type SpecoratorSettings } from '../../core/types/settings';
import type { AgentRosterStore } from '../../features/agents/roster/AgentRosterStore';
import {
  type BoundAgentProjection,
  formatBoundAgentPersona,
  selectAgentSkills,
} from '../../features/agents/roster/boundAgentPersona';
import {
  resolveAgentModelForProvider,
  resolveAgentProvider,
} from '../../features/agents/roster/resolveAgentProvider';
import type { RosterAgent } from '../../features/agents/roster/rosterTypes';
import type { VaultSkillAggregator } from '../../features/quickActions/skills/VaultSkillAggregator';
import {
  projectRosterAgentsToProviders,
  removeProjectedAgent,
  type RosterProjectionResult,
  type RosterRemovalResult,
} from '../rosterAgentProjection';

export interface RosterAgentServiceDeps {
  rosterStore: AgentRosterStore;
  vaultFileAdapter: VaultFileAdapter;
  logger: Logger;
  /** Accessor — the plugin reassigns `settings` across the load lifecycle. */
  getSettings: () => SpecoratorSettings;
  /** Accessor — the plugin reassigns / disposes the aggregator across reloads. */
  getSkillAggregator: () => VaultSkillAggregator | null;
}

/**
 * Plugin-level roster-agent operations lifted out of `main.ts`: resolving a
 * bound or run-target agent into a provider-scoped prompt + model, and
 * projecting roster agents into (and cleaning them out of) each provider's
 * native subagent folder. Constructed with accessors so it always reads the
 * plugin's current settings and skill aggregator.
 */
export class RosterAgentService {
  constructor(private readonly deps: RosterAgentServiceDeps) {}

  async resolveBoundAgent(
    boundAgentId: string,
    providerId?: ProviderId,
  ): Promise<BoundAgentProjection | null> {
    const agent = await this.deps.rosterStore.get(boundAgentId);
    if (!agent) return null;
    // Surface the agent's granted skills as guidance baked into the prompt;
    // providers auto-discover every SKILL.md, so these can't be runtime-scoped.
    const catalog = (await this.deps.getSkillAggregator()?.listAll()) ?? [];
    const skills = selectAgentSkills(
      agent.skills,
      catalog.map((e) => ({ name: e.name, description: e.description })),
    );
    // The agent's saved model is provider-specific. When the caller knows the
    // conversation's provider, only forward the model if its selection targets
    // that provider; otherwise drop it (undefined) so the conversation uses its
    // own provider's default/selected model rather than a cross-provider id.
    const model = providerId
      ? resolveAgentModelForProvider(agent, providerId, undefined)
      : agent.modelSelection?.modelId;
    // Derive the slug (strip the 'roster:' prefix) for providers that support
    // native agent activation (e.g. the Claude SDK --agent flag).
    const slug = agent.id.startsWith('roster:') ? agent.id.slice('roster:'.length) : agent.id;
    return {
      // A forceful identity directive so providers without a system-prompt
      // channel (Cursor) still adopt the persona instead of their built-in one.
      prompt: formatBoundAgentPersona({ ...agent, skills }),
      model,
      slug,
      description: agent.description,
    };
  }

  /**
   * Resolves the provider + model a work-order run should adopt from its assigned
   * roster agent, mirroring how chat resolves an agent's provider: the agent's
   * preferred provider (override → model's provider) wins only when enabled, else
   * the active/default enabled provider; the model is the agent's selection, else
   * that provider's configured default. Returns `null` when the id isn't a known
   * roster agent so the run keeps its own frontmatter provider/model.
   */
  async resolveAgentRunTarget(
    agentId: string,
  ): Promise<{ providerId: ProviderId; model: string } | null> {
    const agent = await this.deps.rosterStore.get(agentId);
    if (!agent) return null;
    const settings = asSettingsBag(this.deps.getSettings());
    const providerId = resolveAgentProvider(
      agent,
      (p) => ProviderRegistry.isEnabled(p, settings),
      ProviderRegistry.resolveSettingsProviderId(settings),
    );
    // The agent's saved model is provider-specific, so it only applies when its
    // selection targets the provider the run actually resolved to (which may be
    // a fallback after the preferred provider was found disabled); otherwise use
    // the resolved provider's configured default.
    const providerDefaultModel =
      ProviderSettingsCoordinator.getProviderSettingsSnapshot(this.deps.getSettings(), providerId).model;
    const model = resolveAgentModelForProvider(agent, providerId, providerDefaultModel);
    return { providerId, model: model ?? providerDefaultModel };
  }

  /**
   * Publishes every roster agent into each enabled provider's native subagent
   * folder (.claude/agents, .codex/agents, .cursor/agents, .opencode/agent) so
   * the agents are @-mentionable as that provider's own subagents.
   */
  async syncRosterAgentsToProviders(): Promise<RosterProjectionResult> {
    const agents = await this.deps.rosterStore.list();
    const enabled = ProviderRegistry.getEnabledProviderIds(asSettingsBag(this.deps.getSettings()));
    const log = this.deps.logger.scope('agents');
    return projectRosterAgentsToProviders(agents, enabled, this.deps.vaultFileAdapter,
      (provider, name, error) => log.warn('roster agent projection failed', provider, name, error));
  }

  /**
   * Removes an agent's projected provider files (.claude/agents, .codex/agents,
   * .cursor/agents, .opencode/agent) when it's deleted from the roster. Uses all
   * registered providers — not just enabled ones — so a provider disabled after a
   * prior sync still gets its orphaned subagent file cleaned up.
   */
  async removeRosterAgentProjection(agent: RosterAgent): Promise<RosterRemovalResult> {
    const providers = ProviderRegistry.getRegisteredProviderIds();
    const log = this.deps.logger.scope('agents');
    return removeProjectedAgent(agent, providers, this.deps.vaultFileAdapter,
      (path, error) => log.warn('roster agent projection cleanup failed', path, error));
  }
}
