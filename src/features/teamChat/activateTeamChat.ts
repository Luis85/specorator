import type SpecoratorPlugin from '../../main';
import { TeamChatView } from './TeamChatView';
import { VIEW_TYPE_TEAM_CHAT } from './viewType';

/**
 * Reveals (or opens) the Team Chat leaf in the main area. Mirrors
 * `activateLibrary`. The optional `agentId` is accepted here so callers (the
 * roster "message" affordance) have a stable entry point; in Phase 4a it only
 * seeds the view's selected-agent state — opening the live DM is Phase 4b.
 */
export async function activateTeamChat(plugin: SpecoratorPlugin, agentId?: string): Promise<void> {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(VIEW_TYPE_TEAM_CHAT)[0] ?? null;
  if (!leaf) {
    leaf = workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_TEAM_CHAT, active: true });
  }
  await workspace.revealLeaf(leaf);
  // A workspace-restored leaf may still hold a DeferredView placeholder
  // (Obsidian >= 1.7.2) — load it so the call below reaches the real view.
  await leaf.loadIfDeferred();
  if (agentId && leaf.view instanceof TeamChatView) leaf.view.selectAgent(agentId);
}
