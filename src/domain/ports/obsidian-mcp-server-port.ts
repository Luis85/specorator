export interface McpConnectionConfig {
  readonly transport: 'http'
  readonly url: string
}

export interface ObsidianMcpServerPort {
  start(): Promise<{ port: number }>
  stop(): Promise<void>
  getConnectionConfig(): McpConnectionConfig
}
