/**
 * Tool input helpers.
 *
 * Keeps parsing of common tool inputs consistent across services.
 */

import type { AskUserAnswers } from '../types/tools';
import {
  TOOL_EDIT,
  TOOL_GLOB,
  TOOL_GREP,
  TOOL_LS,
  TOOL_NOTEBOOK_EDIT,
  TOOL_READ,
  TOOL_WRITE,
} from './toolNames';

export function extractResolvedAnswers(toolUseResult: unknown): AskUserAnswers | undefined {
  if (typeof toolUseResult !== 'object' || toolUseResult === null) return undefined;
  const r = toolUseResult as Record<string, unknown>;
  return normalizeAnswersObject(r.answers);
}

function normalizeAnswerValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === 'string' ? item : String(item)))
      .filter(Boolean)
      .filter((item) => item.length > 0);
    if (normalized.length === 0) return undefined;
    return normalized.length === 1 ? normalized[0] : normalized;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if ('answers' in record) return normalizeAnswerValue(record.answers);
    if ('answer' in record) return normalizeAnswerValue(record.answer);
    if ('value' in record) return normalizeAnswerValue(record.value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function normalizeAnswersObject(value: unknown): AskUserAnswers | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  const answers: AskUserAnswers = {};
  for (const [question, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeAnswerValue(rawValue);
    if (normalized) {
      answers[question] = normalized;
    }
  }

  return Object.keys(answers).length > 0 ? answers : undefined;
}

function parseAnswersFromJsonObject(resultText: string): AskUserAnswers | undefined {
  const start = resultText.indexOf('{');
  const end = resultText.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;

  try {
    const parsed = JSON.parse(resultText.slice(start, end + 1)) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return normalizeAnswersObject(record.answers) ?? normalizeAnswersObject(parsed);
    }
    return normalizeAnswersObject(parsed);
  } catch {
    return undefined;
  }
}

function parseAnswersFromQuotedPairs(resultText: string): AskUserAnswers | undefined {
  const answers: AskUserAnswers = {};
  const pattern = /"([^"]+)"="([^"]*)"/g;

  for (const match of resultText.matchAll(pattern)) {
    const question = match[1]?.trim();
    if (!question) continue;
    answers[question] = match[2] ?? '';
  }

  return Object.keys(answers).length > 0 ? answers : undefined;
}

/**
 * Fallback extractor for AskUserQuestion results when structured `toolUseResult.answers`
 * is unavailable (for example after reload from JSONL history).
 */
export function extractResolvedAnswersFromResultText(result: unknown): AskUserAnswers | undefined {
  if (typeof result !== 'string') return undefined;
  const trimmed = result.trim();
  if (!trimmed) return undefined;

  return parseAnswersFromJsonObject(trimmed) ?? parseAnswersFromQuotedPairs(trimmed);
}

export function getPathFromToolInput(
  toolName: string,
  toolInput: Record<string, unknown>
): string | null {
  switch (toolName) {
    case TOOL_READ:
    case TOOL_WRITE:
    case TOOL_EDIT:
    case TOOL_NOTEBOOK_EDIT:
      return (toolInput.file_path as string) || (toolInput.notebook_path as string) || null;
    case TOOL_GLOB:
      return (toolInput.path as string) || (toolInput.pattern as string) || null;
    case TOOL_GREP:
      return (toolInput.path as string) || null;
    case TOOL_LS:
      return (toolInput.path as string) || null;
    default:
      return null;
  }
}

/** The input key the transcript renderer reads a file-tool's path from, or null for non-file tools. */
function fileToolLocationInputKey(toolName: string): 'file_path' | 'path' | null {
  switch (toolName) {
    case TOOL_READ:
    case TOOL_WRITE:
    case TOOL_EDIT:
      return 'file_path';
    case TOOL_LS:
      return 'path';
    default:
      return null;
  }
}

function hasUsablePath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // '.' is the LS default placeholder — treat it as "no specific path" so an
  // ACP location can still supply the listed directory.
  return trimmed.length > 0 && trimmed !== '.';
}

type PathLocation = { path?: string | null } | null | undefined;

function firstLocationPath(
  locations: ReadonlyArray<PathLocation> | null | undefined,
): string | undefined {
  // `Array.isArray` narrows a ReadonlyArray to `any[]`, so re-establish the
  // element type before reading `path` (keeps the strict-any lint rules happy).
  if (!Array.isArray(locations)) return undefined;
  const list = locations as ReadonlyArray<PathLocation>;
  for (const location of list) {
    const path = typeof location?.path === 'string' ? location.path.trim() : '';
    if (path) return path;
  }
  return undefined;
}

/**
 * Surface a file tool's touched path from ACP `locations` when the normalized
 * input lacks it. Claude's SDK carries `file_path`/`path` in the tool input
 * directly, but ACP tool calls often deliver the path only in the `locations`
 * array (or the human title) — which the transcript renderer never reads. This
 * seeds the exact key the renderer keys off (`file_path` for Read/Write/Edit,
 * `path` for LS), leaving provider-supplied paths untouched. Returns the same
 * object reference when nothing is seeded.
 */
export function seedFileToolPathFromLocations(
  toolName: string,
  input: Record<string, unknown>,
  locations: ReadonlyArray<PathLocation> | null | undefined,
): Record<string, unknown> {
  const key = fileToolLocationInputKey(toolName);
  if (!key || hasUsablePath(input[key])) {
    return input;
  }
  const locationPath = firstLocationPath(locations);
  if (!locationPath) {
    return input;
  }
  return { ...input, [key]: locationPath };
}
