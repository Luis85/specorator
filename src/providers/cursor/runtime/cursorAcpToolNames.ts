import {
  TOOL_ASK_USER_QUESTION,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_READ,
  TOOL_TASK,
  TOOL_TODO_WRITE,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  TOOL_WRITE,
} from '../../../core/tools/toolNames';
import { AcpToolStreamAdapter } from '../../acp';

const CURSOR_ACP_TOOL_NAME_MAP: Record<string, string> = {
  ask_question: TOOL_ASK_USER_QUESTION,
  bash: TOOL_BASH,
  delete: TOOL_BASH,
  edit: TOOL_EDIT,
  fetch: TOOL_WEB_FETCH,
  glob: TOOL_GLOB,
  grep: TOOL_GREP,
  ls: TOOL_BASH,
  question: TOOL_ASK_USER_QUESTION,
  read: TOOL_READ,
  shell: TOOL_BASH,
  task: TOOL_TASK,
  todowrite: TOOL_TODO_WRITE,
  update_todos: TOOL_TODO_WRITE,
  webfetch: TOOL_WEB_FETCH,
  websearch: TOOL_WEB_SEARCH,
  write: TOOL_WRITE,
};

/**
 * Canonical tool names Cursor can emit after ACP normalization.
 *
 * Derived as the value-set of `CURSOR_ACP_TOOL_NAME_MAP`. Wired onto
 * `ProviderRegistration.canonicalToolNames` so the seam can enumerate Cursor
 * tools without a provider-id branch (ADR-0001 Phase 1).
 */
export const CURSOR_ACP_CANONICAL_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  Object.values(CURSOR_ACP_TOOL_NAME_MAP),
);

type CursorAcpKnownToolName = keyof typeof CURSOR_ACP_TOOL_NAME_MAP;

function isKnownToolName(value: unknown): value is CursorAcpKnownToolName {
  if (typeof value !== 'string') {
    return false;
  }

  return value.trim().toLowerCase() in CURSOR_ACP_TOOL_NAME_MAP;
}

function toKnownToolName(value: string | undefined): CursorAcpKnownToolName | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return isKnownToolName(normalized)
    ? normalized
    : null;
}

function firstTrimmedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return undefined;
}

export function resolveCursorAcpRawToolName(
  currentRawName: string | undefined,
  update: {
    kind?: string | null;
    title?: string | null;
  },
): string {
  const titleName = firstTrimmedString(update.title);
  const knownTitleName = titleName && isKnownToolName(titleName)
    ? titleName.trim().toLowerCase()
    : undefined;

  if (knownTitleName) {
    return knownTitleName;
  }

  if (currentRawName) {
    return currentRawName;
  }

  switch (update.kind) {
    case 'execute':
      return 'bash';
    case 'fetch':
      return 'webfetch';
    case 'read':
      return 'read';
    default:
      return titleName ?? 'tool';
  }
}

export function normalizeCursorAcpToolName(rawName: string | undefined): string {
  const knownName = toKnownToolName(rawName);
  if (!knownName) {
    return rawName?.trim() || 'tool';
  }

  return CURSOR_ACP_TOOL_NAME_MAP[knownName];
}

export function normalizeCursorAcpToolInput(
  _rawName: string | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return input;
}

export function normalizeCursorAcpToolUseResult(): undefined {
  return undefined;
}

export function createCursorAcpToolStreamAdapter(): AcpToolStreamAdapter {
  return new AcpToolStreamAdapter({
    normalizeToolInput: normalizeCursorAcpToolInput,
    normalizeToolName: normalizeCursorAcpToolName,
    normalizeToolUseResult: normalizeCursorAcpToolUseResult,
    resolveRawToolName: resolveCursorAcpRawToolName,
  });
}
