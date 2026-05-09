import type { ObsidianMcpServerPort } from '@/domain/ports'

export class ObsidianClaudeCliAdapter {
  constructor(private readonly mcpServer: ObsidianMcpServerPort) {}

  getMcpCliArgs(): string[] {
    return ['--mcp-url', this.mcpServer.getConnectionConfig().url]
  }
}
