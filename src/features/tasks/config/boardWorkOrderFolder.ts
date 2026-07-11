/**
 * Single source of truth for the Agent Board's work-order folder resolution:
 * the configured folder (a required `string` in settings, but empty falls back)
 * with leading/trailing slashes stripped. Both the store's loader and the Vue
 * event-routing composable's vault filter derive from THIS so a card the loader
 * indexes can never be a card the filter rejects — the two agree by construction.
 */
export function boardWorkOrderFolder(settings: { agentBoardWorkOrderFolder: string }): string {
  return (settings.agentBoardWorkOrderFolder || 'Agent Board/tasks').replace(/^\/+|\/+$/g, '');
}
