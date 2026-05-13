export interface CommunityPluginPort {
  isPluginEnabled(id: string): boolean
  listEnabledPluginIds(): string[]
}
