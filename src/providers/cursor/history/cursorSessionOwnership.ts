import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { isValidCursorSessionId } from '../../../core/providers/cursorSessionIdValidation';
import type { HistoryLoadError } from '../../../core/providers/types';

export function normalizeCursorWorkspacePath(absoluteVaultPath: string): string {
  let normalized = path.resolve(absoluteVaultPath);
  while (normalized.length > 1 && (normalized.endsWith(path.sep) || normalized.endsWith('/'))) {
    normalized = normalized.slice(0, -1);
  }
  if (process.platform === 'win32') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/** Compares two absolute paths for vault ownership (case-insensitive on Windows). */
export function cursorVaultPathsMatch(left: string, right: string): boolean {
  return normalizeCursorWorkspacePath(left) === normalizeCursorWorkspacePath(right);
}

export interface CursorAcpSessionMeta {
  cwd?: string;
  title?: string;
  schemaVersion?: number;
}

export function readCursorAcpSessionMeta(sessionId: string): CursorAcpSessionMeta | null {
  if (!isValidCursorSessionId(sessionId)) return null;
  const metaPath = path.join(os.homedir(), '.cursor', 'acp-sessions', sessionId, 'meta.json');
  try {
    if (!fs.existsSync(metaPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifies ownership whenever Cursor has created a global ACP session artifact.
 * Legacy and JSONL sources are project-scoped by construction and need no
 * global-session check.
 */
export function validateCursorAcpSessionVault(
  sessionId: string,
  absoluteVaultPath: string,
): HistoryLoadError | null {
  if (!isValidCursorSessionId(sessionId)) {
    return null;
  }
  const acpDir = path.join(os.homedir(), '.cursor', 'acp-sessions', sessionId);
  const metaPath = path.join(acpDir, 'meta.json');
  if (!fs.existsSync(acpDir) && !fs.existsSync(metaPath)) return null;

  const meta = readCursorAcpSessionMeta(sessionId);
  if (!meta?.cwd || typeof meta.cwd !== 'string' || !meta.cwd.trim()) {
    return {
      code: 'store-unreadable',
      message: 'Could not verify which workspace owns this Cursor session.',
    };
  }
  if (cursorVaultPathsMatch(meta.cwd, absoluteVaultPath)) {
    return null;
  }
  return {
    code: 'vault-mismatch',
    message: 'Cursor session belongs to a different workspace.',
  };
}
