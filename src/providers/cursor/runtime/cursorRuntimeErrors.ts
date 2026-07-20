import { JsonRpcErrorResponse, JsonRpcTransportClosedError } from '../../acp';

// Pure error-shape classification for the Cursor ACP runtime, extracted from
// CursorChatRuntime so the predicates are directly testable. Behavior-preserving:
// each function is the former private method verbatim, with the one instance
// dependency (`this.process` stderr) threaded in as a parameter.

/** Uppercased structured error code from an RPC error `data` payload, if any. */
export function readStructuredErrorCode(data: unknown): string | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  for (const key of ['code', 'reason', 'type']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim().toUpperCase();
    }
  }
  return null;
}

/** Whether `error` signals the agent needs `cursor_login` before it can serve. */
export function isCursorAuthenticationFailure(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).trim();
  if (error instanceof JsonRpcErrorResponse) {
    const dataCode = readStructuredErrorCode(error.data);
    if (dataCode && /^(?:AUTH|AUTHENTICATION|UNAUTHENTICATED|UNAUTHORIZED)(?:_|$)/u.test(dataCode)) {
      return true;
    }
  }
  return /\b(?:authentication required|login required|not authenticated|unauthenticated|unauthorized)\b/iu
    .test(message);
}

/** Whether a `session/load` failure is a transport drop worth a fresh session. */
export function isCursorSessionLoadTransportFailure(error: unknown): boolean {
  if (error instanceof JsonRpcTransportClosedError) {
    return true;
  }
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  if (typeof code === 'string' && ['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(code.toUpperCase())) {
    return true;
  }
  const message = error instanceof Error ? error.message.trim() : String(error).trim();
  return /^(?:ACP|JSON-RPC) transport (?:closed|disconnected)\b/iu.test(message)
    || /\b(?:request )?timed out\b/iu.test(message);
}

/** Runtime error message, appended with the process stderr snapshot when present. */
export function formatCursorRuntimeError(error: unknown, stderr?: string | null): string {
  const baseMessage = error instanceof Error ? error.message : 'Cursor ACP request failed';
  return stderr ? `${baseMessage}\n\n${stderr}` : baseMessage;
}
