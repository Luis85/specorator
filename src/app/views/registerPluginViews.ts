import { VIEW_TYPE_SPECORATOR, VIEW_TYPE_SPECORATOR_AGENT_BOARD } from '@/core/types';
import { SpecoratorView } from '@/features/chat/SpecoratorView';
import { activateLibrary } from '@/features/library/activateLibrary';
import { LibraryView } from '@/features/library/LibraryView';
import type { LibraryTab } from '@/features/library/viewType';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import { AgentBoardView } from '@/features/tasks/ui/AgentBoardView';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

export interface PluginViewDeps {
  plugin: SpecoratorPlugin;
  taskExecutionSurface: ChatTabExecutionSurface;
}

/**
 * Registers every workspace view this plugin owns plus the ribbon icons and
 * view-open commands that surface them. Lifted out of `onload` so `main.ts`
 * reads as orchestration; ribbon registration order (chat → board) is
 * preserved because it determines left-to-right ribbon order.
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

  plugin.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, plugin));

  const openLibrary = (tab: LibraryTab) => activateLibrary(plugin, tab);
  plugin.addCommand({
    id: 'open-agent-roster',
    name: t('commands.openAgentRoster'),
    callback: () => void openLibrary('agents'),
  });
  plugin.addCommand({
    id: 'open-skill-library',
    name: t('commands.openSkillLibrary'),
    callback: () => void openLibrary('skills'),
  });
}
