import type { CallToolResult } from './types';

function isCallToolResult(value: unknown): value is CallToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

/** Normalize a handler's return value into an MCP CallToolResult. */
export function toCallToolResult(value: unknown): CallToolResult {
  // Side-effect-only handlers return nothing → empty (but valid) text result.
  if (value === undefined || value === null) {
    return { content: [{ type: 'text', text: '' }] };
  }
  if (typeof value === 'string') {
    return { content: [{ type: 'text', text: value }] };
  }
  if (isCallToolResult(value)) {
    return value;
  }
  // JSON.stringify can still yield undefined (e.g. a bare function); coerce to string.
  const json = JSON.stringify(value);
  return { content: [{ type: 'text', text: typeof json === 'string' ? json : String(value) }] };
}
