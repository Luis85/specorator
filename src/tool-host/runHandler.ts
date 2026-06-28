import { toCallToolResult } from './handlerResult';
import type { CallToolResult, ToolHandler, ToolHandlerCtx } from './types';

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Runs a tool handler with a timeout. The timeout guards *asynchronous* handlers
 * (awaiting I/O, network, etc.) — the common case. It cannot interrupt a
 * *synchronous* CPU-bound handler (e.g. an infinite loop): while the event loop
 * is blocked the timer can't fire, so such a handler stalls the host. That is an
 * accepted limitation of the full-trust execution model (see the spec's trust
 * posture); true interruption would require Worker/vm isolation, which is deferred.
 */
export async function runHandler(
  handler: ToolHandler,
  input: Record<string, unknown>,
  ctx: ToolHandlerCtx,
  timeoutMs: number,
): Promise<CallToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Handler timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const value = await Promise.race([Promise.resolve(handler(input, ctx)), timeout]);
    return toCallToolResult(value);
  } catch (err) {
    return errorResult(err instanceof Error ? err.message : String(err));
  } finally {
    if (timer) clearTimeout(timer);
  }
}
