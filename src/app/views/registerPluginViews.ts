import { VIEW_TYPE_SPECORATOR, VIEW_TYPE_SPECORATOR_AGENT_BOARD } from '@/core/types';
import { SpecoratorView } from '@/features/chat/SpecoratorView';
import { activateLibrary } from '@/features/library/activateLibrary';
import { LibraryView } from '@/features/library/LibraryView';
import { VIEW_TYPE_LIBRARY } from '@/features/library/viewType';
import { activateMarketplace } from '@/features/marketplace/activateMarketplace';
import { MarketplaceView } from '@/features/marketplace/MarketplaceView';
import { VIEW_TYPE_MARKETPLACE } from '@/features/marketplace/viewType';
import { OnboardingView } from '@/features/onboarding/OnboardingView';
import { VIEW_TYPE_ONBOARDING } from '@/features/onboarding/viewType';
import type { ChatTabExecutionSurface } from '@/features/tasks/execution/ChatTabExecutionSurface';
import { AgentBoardView } from '@/features/tasks/ui/AgentBoardView';
import { activateTeamChat } from '@/features/teamChat/activateTeamChat';
import { TeamChatView } from '@/features/teamChat/TeamChatView';
import { VIEW_TYPE_TEAM_CHAT } from '@/features/teamChat/viewType';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';

export interface PluginViewDeps {
  plugin: SpecoratorPlugin;
  taskExecutionSurface: ChatTabExecutionSurface;
}

/**
 * Registers every workspace view this plugin owns plus the ribbon icons that
 * surface them. Lifted out of `onload` so `main.ts` reads as orchestration;
 * ribbon registration order (chat → team chat → board → library) is preserved
 * because it determines left-to-right ribbon order. View-open commands live on
 * the registrar path in `registerPluginCommands` so they gain hotkey entries.
 */
export function registerPluginViews({ plugin, taskExecutionSurface }: PluginViewDeps): void {
  plugin.registerView(VIEW_TYPE_SPECORATOR, (leaf) => new SpecoratorView(leaf, plugin));
  plugin.addRibbonIcon('bot', t('ribbon.openChat'), () => {
    void plugin.activateView();
  });

  plugin.registerView(VIEW_TYPE_TEAM_CHAT, (leaf) => new TeamChatView(leaf, plugin));
  plugin.addRibbonIcon('users', t('ribbon.openTeamChat'), () => {
    void activateTeamChat(plugin);
  });

  plugin.registerView(
    VIEW_TYPE_SPECORATOR_AGENT_BOARD,
    (leaf) => new AgentBoardView(leaf, plugin, taskExecutionSurface),
  );
  plugin.addRibbonIcon('kanban-square', t('ribbon.openAgentBoard'), () => {
    void plugin.activateAgentBoardView();
  });

  plugin.registerView(VIEW_TYPE_LIBRARY, (leaf) => new LibraryView(leaf, plugin));
  plugin.addRibbonIcon('library-big', t('ribbon.openLibrary'), () => {
    void activateLibrary(plugin);
  });

  plugin.registerView(VIEW_TYPE_MARKETPLACE, (leaf) => new MarketplaceView(leaf, plugin));
  plugin.addRibbonIcon('store', t('marketplace.ribbon'), () => {
    void activateMarketplace(plugin);
  });

  // No ribbon icon: Setup is a first-run surface that opens itself once, then
  // lives on the `open-setup-guide` command and the settings banner button.
  // A permanent ribbon entry would be clutter for a flow most users run once.
  plugin.registerView(VIEW_TYPE_ONBOARDING, (leaf) => new OnboardingView(leaf, plugin));
}
