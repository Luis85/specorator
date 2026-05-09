import type { ObsidianMcpServerPort } from '@/domain/ports'

export class ObsidianClaudeCliAdapter {
  constructor(private readonly mcpServer: ObsidianMcpServerPort) {}

  getMcpCliArgs(): string[] {
    const { url } = this.mcpServer.getConnectionConfig()
    return [
      '--mcp-config',
      JSON.stringify({ mcpServers: { specorator: { type: 'http', url } } }),
    ]
  }
}
