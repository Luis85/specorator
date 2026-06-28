import type { Writable } from 'node:stream';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { runHandler } from './runHandler';
import type { CallToolResult, LoadedTool, ToolHandlerCtx } from './types';

interface CallToolRequest {
  params: { name: string; arguments?: Record<string, unknown> };
}

export function buildToolHandlers(
  tools: LoadedTool[],
  ctxFactory: (toolName: string) => ToolHandlerCtx,
  timeoutMs: number,
) {
  const byName = new Map(tools.map((t) => [t.manifest.name, t]));
  return {
    async listTools() {
      return {
        tools: tools.map((t) => ({
          name: t.manifest.name,
          description: t.manifest.description,
          inputSchema: t.manifest.inputSchema,
        })),
      };
    },
    async callTool(req: CallToolRequest): Promise<CallToolResult> {
      const tool = byName.get(req.params.name);
      if (!tool) {
        return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
      }
      return runHandler(tool.handler, req.params.arguments ?? {}, ctxFactory(tool.manifest.name), timeoutMs);
    },
  };
}

export async function createServer(
  tools: LoadedTool[],
  ctxFactory: (toolName: string) => ToolHandlerCtx,
  timeoutMs: number,
  /** The real stdout, captured before process.stdout was redirected — JSON-RPC must use this so
   * a tool's stray stdout write (now routed to stderr) can't interleave with protocol frames. */
  protocolStdout: Writable,
): Promise<void> {
  const handlers = buildToolHandlers(tools, ctxFactory, timeoutMs);
  const server = new Server({ name: 'specorator-tools', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => handlers.listTools());
  // The SDK's CallTool result type carries optional task/_meta fields we never emit; our
  // text-only CallToolResult is structurally a subset, so cast to satisfy the handler signature.
  server.setRequestHandler(CallToolRequestSchema, (req) =>
    handlers.callTool(req as CallToolRequest) as Promise<CallToolResult & Record<string, unknown>>,
  );
  await server.connect(new StdioServerTransport(process.stdin, protocolStdout));
}
