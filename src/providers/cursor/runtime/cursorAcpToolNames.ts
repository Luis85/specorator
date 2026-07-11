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
import { mapCursorToolInput } from './cursorToolInputMapping';

// Matches the local `TOOL_DELETE` in
// `src/features/chat/utils/editedFiles.ts` and the `deleteToolCall` entry in
// the legacy `cursorToolNameMap.ts` — not exported from `core/tools/toolNames`
// because it is a Cursor-only concept. `collectRemovedPathsFromToolCall`
// matches this literal to drop stale "edited files" chips on delete.
const TOOL_DELETE = 'delete';

const CURSOR_ACP_TOOL_NAME_MAP: Record<string, string> = {
  ask_question: TOOL_ASK_USER_QUESTION,
  bash: TOOL_BASH,
  delete: TOOL_DELETE,
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

// Cursor-native file-tool ACP fields (`path`, `oldString`, `newString`, ...)
// don't match the canonical shape (`file_path`, `old_string`, `new_string`)
// the shared write/edit renderer, diff fallback, plan-path capture, and
// edited-file bookkeeping read. `cursorToolInputMapping` already owns this
// per-tool projection (keyed by the legacy `*ToolCall` kind names), so map
// the resolved ACP tool name back onto the matching kind and reuse it here.
// Scoped to the file tools for now; other known names stay pass-through,
// same as unknown names.
const CURSOR_ACP_FILE_TOOL_INPUT_KIND: Partial<Record<CursorAcpKnownToolName, string>> = {
  delete: 'deleteToolCall',
  edit: 'replaceEnvToolCall',
  read: 'readToolCall',
  write: 'writeToolCall',
};

export function normalizeCursorAcpToolInput(
  rawName: string | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const knownName = toKnownToolName(rawName);
  const inputKind = knownName ? CURSOR_ACP_FILE_TOOL_INPUT_KIND[knownName] : undefined;
  return inputKind ? mapCursorToolInput(inputKind, input, undefined) : input;
}

// Deliberate v1 scoping: ACP tool results pass through generically for now,
// so there's no Cursor-specific toolUseResult to build yet (see plan Task 2,
// docs/superpowers/plans/2026-07-11-cursor-acp-runtime.md). Revisit once a
// consumer needs rich per-tool result shaping (e.g. diffs, todo snapshots).
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
