import type SpecoratorPlugin from '../../main';
import type { TabManager } from '../chat/tabs/TabManager';
import { openEditedFile } from '../chat/tabs/tabUi';
import { activateLibrary } from '../library/activateLibrary';
import { clampRailWidth, closeAgentDmTab, fillComposer } from './teamChatDmActions';
import type { TeamChatCallbacks, TeamChatRailGeometry, TeamChatSnapshot } from './ui/vue/teamChatCallbacks';

/**
 * Builds the Vue→engine `TeamChatCallbacks` for one leaf (mirror of chat's
 * `buildChatShellCallbacks`). Lives beside the actions rather than inside `TeamChatView`
 * so the view stays a lifecycle host under its LOC ceiling — the same split that already
 * moved the refresh loops and tab mechanics out.
 *
 * The host is passed as a narrow interface, not the view, so this file never imports
 * `TeamChatView` (no cycle) and a test can drive it with a plain object.
 */
export interface TeamChatCallbackHost {
  readonly plugin: SpecoratorPlugin;
  getTabManager(): TabManager | null;
  /** Register/unregister a snapshot observer (the store-projection seam). */
  addObserver(onChange: (snapshot: TeamChatSnapshot) => void): () => void;
  /** Resolve-or-open this agent's DM, logging a rejection rather than leaking it. */
  openAgentDm(agentId: string): void;
  /** Read/persist the leaf's rail geometry (per leaf, never the global slot). */
  getRailGeometry(): TeamChatRailGeometry;
  setRailGeometry(geometry: TeamChatRailGeometry): void;
}

export function buildTeamChatCallbacks(host: TeamChatCallbackHost): TeamChatCallbacks {
  return {
    subscribe: (onChange) => host.addObserver(onChange),
    onSelectAgent: (agentId) => host.openAgentDm(agentId),
    onOpenEditedFile: (path) => openEditedFile(host.plugin.app, path),
    // Deep-links the Library's Agents tab. Item-level deep-linking doesn't exist yet
    // (`LibraryView.setActiveTab` is tab-scoped), so this lands the user on the list rather
    // than the agent's editor — one click from the edit, and it avoids inventing a second
    // navigation API for one menu item.
    onEditAgent: () => void activateLibrary(host.plugin, 'agents'),
    onCloseDm: (agentId) => void closeAgentDmTab(host.plugin, host.getTabManager(), agentId),
    onFillComposer: (text) => fillComposer(host.getTabManager()?.getActiveTab() ?? null, text),
    getRailGeometry: () => host.getRailGeometry(),
    onRailGeometryChange: ({ collapsed, width }) =>
      host.setRailGeometry({ collapsed, width: clampRailWidth(width) }),
  };
}

/**
 * Reads rail geometry out of a restored view state, falling back to the current value per
 * field. The state is untrusted on the way in (hand-edited or sync-mangled workspace JSON),
 * so the width is clamped and the flag must be a real boolean — a bad value can never hide
 * the rail or starve the transcript.
 */
export function readRailGeometryFromState(
  raw: { railCollapsed?: unknown; railWidth?: unknown } | null,
  current: TeamChatRailGeometry,
): TeamChatRailGeometry {
  return {
    collapsed: typeof raw?.railCollapsed === 'boolean' ? raw.railCollapsed : current.collapsed,
    width: typeof raw?.railWidth === 'number' && Number.isFinite(raw.railWidth)
      ? clampRailWidth(raw.railWidth)
      : current.width,
  };
}
