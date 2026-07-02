import { VIEW_TYPE_SPECORATOR, VIEW_TYPE_SPECORATOR_AGENT_BOARD } from '@/core/types';
import { AgentRosterView, VIEW_TYPE_AGENT_ROSTER } from '@/features/agents/roster/view/AgentRosterView';
import { SpecoratorView } from '@/features/chat/SpecoratorView';
import { activateLibrary } from '@/features/library/activateLibrary';
import { LibraryView } from '@/features/library/LibraryView';
import type { LibraryTab } from '@/features/library/viewType';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
import { SkillLibraryView, VIEW_TYPE_SKILL_LIBRARY } from '@/features/skills/view/SkillLibraryView';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import { AgentBoardView } from '@/features/tasks/ui/AgentBoardView';
import { LoopLibraryView, VIEW_TYPE_LOOP_LIBRARY } from '@/features/tasks/ui/LoopLibraryView';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

export interface PluginViewDeps {
  plugin: SpecoratorPlugin;
  taskExecutionSurface: ChatTabExecutionSurface;
}

/**
 * Registers every workspace view this plugin owns plus the ribbon icons and
 * view-open commands that surface them. Lifted out of `onload` so `main.ts`
 * reads as orchestration; ribbon registration order (chat → board → roster →
 * skills → loops) is preserved because it determines left-to-right ribbon order.
 */
export function registerPluginViews({ plugin, taskExecutionSurface }: PluginViewDeps): void {
  plugin.registerView(VIEW_TYPE_SPECORATOR, (leaf) => new SpecoratorView(leaf, plugin));
  plugin.addRibbonIcon('bot', t('ribbon.openChat'), () => {
    void plugin.activateView();
  });

  plugin.registerView(
    VIEW_TYPE_SPECORATOR_AGENT_BOARD,
    (leaf) => new AgentBoardView(leaf, plugin, taskExecutionSurface),
  );
  plugin.addRibbonIcon('kanban-square', t('ribbon.openAgentBoard'), () => {
    void plugin.activateAgentBoardView();
  });

  plugin.registerView(VIEW_TYPE_AGENT_ROSTER, (leaf) => new AgentRosterView(leaf, plugin));
  plugin.registerView(VIEW_TYPE_SKILL_LIBRARY, (leaf) => new SkillLibraryView(leaf, plugin));
  plugin.registerView(VIEW_TYPE_LOOP_LIBRARY, (leaf) => new LoopLibraryView(leaf, plugin));

  plugin.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, plugin));

  const openView = (viewType: string) => plugin.openLeafView(viewType);
  const openLibrary = (tab: LibraryTab, legacyType: string) =>
    plugin.settings.useVueLibrary ? activateLibrary(plugin, tab) : openView(legacyType);
  plugin.addRibbonIcon('users', t('ribbon.openAgentRoster'), () => void openLibrary('agents', VIEW_TYPE_AGENT_ROSTER));
  plugin.addRibbonIcon('book-open', t('ribbon.openSkillLibrary'), () => void openLibrary('skills', VIEW_TYPE_SKILL_LIBRARY));
  plugin.addRibbonIcon('repeat', t('ribbon.openLoopLibrary'), () => void openLibrary('loops', VIEW_TYPE_LOOP_LIBRARY));
  plugin.addCommand({
    id: 'open-agent-roster',
    name: t('commands.openAgentRoster'),
    callback: () => void openLibrary('agents', VIEW_TYPE_AGENT_ROSTER),
  });
  plugin.addCommand({
    id: 'open-skill-library',
    name: t('commands.openSkillLibrary'),
    callback: () => void openLibrary('skills', VIEW_TYPE_SKILL_LIBRARY),
  });
}
