import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { ObsidianMcpServerPort, McpConnectionConfig } from '@/domain/ports'

export class ObsidianMcpServerAdapter implements ObsidianMcpServerPort {
  private httpServer: http.Server | null = null
  private transport: StreamableHTTPServerTransport | null = null
  private assignedPort = 0

  async start(): Promise<{ port: number }> {
    const mcp = new McpServer({ name: 'specorator', version: '1.0.0' })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)

    const server = http.createServer((req, res) => {
      if (req.url === '/mcp') {
        void transport.handleRequest(req, res)
      } else {
        res.writeHead(404).end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    const addr = server.address()
    const port = addr !== null && typeof addr === 'object' ? addr.port : 0

    this.httpServer = server
    this.transport = transport
    this.assignedPort = port

    return { port }
  }

  async stop(): Promise<void> {
    await this.transport?.close()
    const server = this.httpServer
    if (server !== null) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err !== undefined) {
            reject(err)
          } else {
            resolve()
          }
        })
      })
    }
    this.httpServer = null
    this.transport = null
    this.assignedPort = 0
  }

  getConnectionConfig(): McpConnectionConfig {
    if (this.assignedPort === 0) {
      throw new Error('MCP server not started — call start() first')
    }
    return { transport: 'http', url: `http://127.0.0.1:${this.assignedPort}/mcp` }
  }
}
