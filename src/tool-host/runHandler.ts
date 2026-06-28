import { toCallToolResult } from './handlerResult';
import type { CallToolResult, ToolHandler, ToolHandlerCtx } from './types';

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

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
