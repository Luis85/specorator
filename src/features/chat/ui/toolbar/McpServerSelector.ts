import type { McpServerManager } from '../../../../core/mcp/McpServerManager';

/**
 * Engine object owning the per-tab enabled-MCP-server set. The Vue
 * `McpServerSelector.vue` renders from the projected store and toggles servers
 * back through the engine seam; the imperative DOM-render layer was removed in
 * the Phase 2 toolbar cutover. Every public method the engine calls
 * (`ConversationController` restore/gating, `tabShared` provider gating,
 * per-turn `getEnabledServers`, `@server` mention sync) stays intact.
 */
export class McpServerSelector {
  private mcpManager: McpServerManager | null = null;
  private enabledServers: Set<string> = new Set();
  private onChangeCallback: ((enabled: Set<string>) => void) | null = null;

  setVisible(_visible: boolean): void {
    // Visibility is derived by the composer projection (buildMcpState) from
    // provider capability + server count; retained as a no-op so the engine's
    // gating call site (tabShared.applyProviderUIGating) keeps compiling.
  }

  setMcpManager(manager: McpServerManager | null): void {
    this.mcpManager = manager;
    if (!manager && this.enabledServers.size > 0) {
      this.enabledServers.clear();
      this.onChangeCallback?.(this.enabledServers);
    }
    this.pruneEnabledServers();
  }

  setOnChange(callback: (enabled: Set<string>) => void): void {
    this.onChangeCallback = callback;
  }

  getEnabledServers(): Set<string> {
    return new Set(this.enabledServers);
  }

  addMentionedServers(names: Set<string>): void {
    for (const name of names) {
      this.enabledServers.add(name);
    }
  }

  clearEnabled(): void {
    this.enabledServers.clear();
  }

  setEnabledServers(names: string[]): void {
    this.enabledServers = new Set(names);
    this.pruneEnabledServers();
  }

  private pruneEnabledServers(): void {
    if (!this.mcpManager) return;
    const activeNames = new Set(this.mcpManager.getServers().filter((s) => s.enabled).map((s) => s.name));
    let changed = false;
    for (const name of this.enabledServers) {
      if (!activeNames.has(name)) {
        this.enabledServers.delete(name);
        changed = true;
      }
    }
    if (changed) {
      this.onChangeCallback?.(this.enabledServers);
    }
  }
}
