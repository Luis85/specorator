import type { ObsidianMcpServerPort, McpConnectionConfig } from '@/domain/ports'

export class MockObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private _started = false
  private readonly _port: number

  constructor(port = 3001) {
    this._port = port
  }

  get started(): boolean {
    return this._started
  }

  async start(): Promise<{ port: number }> {
    this._started = true
    return { port: this._port }
  }

  async stop(): Promise<void> {
    this._started = false
  }

  getConnectionConfig(): McpConnectionConfig {
    return { transport: 'http', url: `http://127.0.0.1:${this._port}/mcp` }
  }
}
