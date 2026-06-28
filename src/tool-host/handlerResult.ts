import type { CallToolResult } from './types';

function isCallToolResult(value: unknown): value is CallToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

function isSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
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
    // A tool may return a content array with malformed/non-serializable blocks or extra fields.
    // The SDK serializes the result downstream — OUTSIDE runHandler's catch — so a throw there would
    // hang tools/call. Pass through only when serializable; otherwise surface a tool error.
    if (isSerializable(value)) return value;
    return { content: [{ type: 'text', text: 'Tool returned a non-serializable result' }], isError: true };
  }
  // JSON.stringify can still yield undefined (e.g. a bare function); coerce to string.
  const json = JSON.stringify(value);
  return { content: [{ type: 'text', text: typeof json === 'string' ? json : String(value) }] };
}
