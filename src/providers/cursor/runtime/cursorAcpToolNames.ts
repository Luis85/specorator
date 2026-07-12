import {
  TOOL_ASK_USER_QUESTION,
  TOOL_BASH,
  TOOL_EDIT,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_LS,
  TOOL_READ,
  TOOL_TASK,
  TOOL_TODO_WRITE,
  TOOL_WEB_FETCH,
  TOOL_WEB_SEARCH,
  TOOL_WRITE,
} from '../../../core/tools/toolNames';
import type { SDKToolUseResult } from '../../../core/types/diff';
import { type AcpDiffToolContent, type AcpToolCallContent, AcpToolStreamAdapter } from '../../acp';
import { buildCursorTaskToolUseResult } from './cursorTaskPayload';
import { readTaskSuccessFromPersistedResult } from './cursorTaskSubagent';
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
  ls: TOOL_LS,
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

  // A resolved known name stays pinned (no identity flapping), but a prose
  // fallback must stay correctable: a first call with an unrecognized kind and
  // a prose title would otherwise pin the prose forever, and a later update
  // carrying the real file-mutating kind could never restore the canonical id.
  if (currentRawName && isKnownToolName(currentRawName)) {
    return currentRawName;
  }

  // File-mutating ACP kinds resolve from the kind BEFORE the title fallback:
  // a `delete`/`edit` call whose title is prose ("Delete file", "Applying
  // changes") would otherwise fall through to the title and lose the canonical
  // id that `isEditTool()`/`collectRemovedPathsFromToolCall()` bookkeeping
  // matches against.
  switch (update.kind) {
    case 'delete':
      return 'delete';
    case 'edit':
      return 'edit';
    case 'execute':
      return 'bash';
    case 'fetch':
      return 'webfetch';
    case 'read':
      return 'read';
    default:
      return currentRawName ?? titleName ?? 'tool';
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
// `ls` rides along even though its canonical field (`path`) already matches
// the raw name: the `lsToolCall` mapper also defaults a missing/empty path to
// `'.'`, which `decorateToolSummaryPath`/`getPathFromToolInput` (TOOL_LS) rely
// on. Other known names stay pass-through, same as unknown names.
const CURSOR_ACP_FILE_TOOL_INPUT_KIND: Partial<Record<CursorAcpKnownToolName, string>> = {
  delete: 'deleteToolCall',
  edit: 'replaceEnvToolCall',
  ls: 'lsToolCall',
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

function firstDiffContent(
  content: AcpToolCallContent[] | null | undefined,
): AcpDiffToolContent | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const item of content) {
    if (item && item.type === 'diff') {
      return item;
    }
  }
  return undefined;
}

// Cursor delivers write/edit diffs as an ACP `diff` content block (oldText /
// newText / path). Project it into the provider-neutral unified-diff shape the
// shared `extractDiffData` consumer reads (`filePath` + `unifiedDiff`). Old
// lines emit as deletes, new lines as inserts — mirrors the Edit fallback in
// `diffFromToolInput`, and `parseUnifiedDiffLines` tolerates the header-less form.
function buildAcpUnifiedDiff(oldText: string | null | undefined, newText: string): string {
  const oldLines = typeof oldText === 'string' && oldText.length > 0 ? oldText.split('\n') : [];
  const newLines = newText.length > 0 ? newText.split('\n') : [];
  return [
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
}

// File-mutating tools carry a renderable diff, and Task completions carry the
// structured subagent payload (agent id, nested tool calls, transcript) the
// live subagent detail view reads; everything else passes through with no
// Cursor-specific toolUseResult.
export function normalizeCursorAcpToolUseResult(
  rawName: string | undefined,
  input: Record<string, unknown>,
  rawOutput: unknown,
  content?: AcpToolCallContent[] | null,
): SDKToolUseResult | undefined {
  const knownName = toKnownToolName(rawName);
  if (knownName === 'task') {
    const success = readTaskSuccessFromPersistedResult(rawOutput);
    return success ? buildCursorTaskToolUseResult(success, input) : undefined;
  }
  if (knownName !== 'edit' && knownName !== 'write') {
    return undefined;
  }

  const diff = firstDiffContent(content);
  if (!diff) {
    return undefined;
  }

  const filePath = firstTrimmedString(diff.path, input.file_path, input.filePath);
  const unifiedDiff = buildAcpUnifiedDiff(diff.oldText, diff.newText);

  const result: SDKToolUseResult = {};
  if (filePath) {
    result.filePath = filePath;
  }
  if (unifiedDiff) {
    result.unifiedDiff = unifiedDiff;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function createCursorAcpToolStreamAdapter(): AcpToolStreamAdapter {
  return new AcpToolStreamAdapter({
    normalizeToolInput: normalizeCursorAcpToolInput,
    normalizeToolName: normalizeCursorAcpToolName,
    normalizeToolUseResult: normalizeCursorAcpToolUseResult,
    resolveRawToolName: resolveCursorAcpRawToolName,
  });
}
