import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { BaseHistoryService } from '../../../core/providers/BaseHistoryService';
import { isValidCursorSessionId } from '../../../core/providers/cursorSessionIdValidation';
import type {
  DeleteHistoryOutcome,
  HistoryLoadOutcome,
  HydrationContext,
} from '../../../core/providers/types';
import { buildUsageInfo } from '../../../core/providers/usage';
import type { Conversation, UsageInfo } from '../../../core/types';
import { extractCursorUsage } from '../runtime/cursorUsageMapping';
import { type CursorProviderState, getCursorState, resolveCursorSessionId } from '../types';
import {
  cursorWorkspaceHash,
  cursorWorkspaceHashLegacy,
  loadCursorHistoryFromSources,
  loadCursorRawRecords,
  resolveCursorAgentTranscriptPath,
  resolveCursorHistorySources,
  resolveCursorStoreDbPath,
  validateCursorAcpSessionVault,
} from './cursorHistoryStore';

export class CursorConversationHistoryService extends BaseHistoryService<CursorProviderState> {
  // forkSupport intentionally omitted — Cursor capabilities.supportsFork === false.

  protected computeCacheKey(
    conversation: Conversation,
    ctx: HydrationContext,
  ): string | null {
    const sessionId = resolveCursorSessionId(conversation);
    if (!sessionId || !ctx.vaultPath) return null;
    const sources = resolveCursorHistorySources(ctx.vaultPath, sessionId);
    return sources.length > 0
      ? sources.map((source) => source.sourceRef).join('||')
      : null;
  }

  protected async loadMessages(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<HistoryLoadOutcome> {
    const sessionId = resolveCursorSessionId(conversation);
    if (!sessionId || !ctx.vaultPath) {
      return { kind: 'empty', reason: 'no-session', sourceRef: null };
    }

    const acpValidationError = validateCursorAcpSessionVault(sessionId, ctx.vaultPath);
    const sources = resolveCursorHistorySources(ctx.vaultPath, sessionId);
    if (sources.length === 0) {
      if (acpValidationError) {
        return { kind: 'error', error: acpValidationError, sourceRef: null };
      }
      return { kind: 'empty', reason: 'no-store', sourceRef: null };
    }

    const loaded = loadCursorHistoryFromSources(sources);
    const sourceRef = loaded.sourceRef ?? sources[0]?.sourceRef ?? null;
    if (loaded.error) {
      const error = typeof loaded.error === 'string'
        ? { code: 'store-unreadable' as const, message: loaded.error }
        : loaded.error;
      return { kind: 'error', error, sourceRef };
    }
    if (loaded.messages.length === 0) {
      return { kind: 'empty', reason: 'no-rows', sourceRef };
    }
    return {
      kind: 'loaded',
      messages: loaded.messages,
      sourceRef,
      ...(loaded.degraded ? { cacheable: false } : {}),
    };
  }

  resolveSessionIdForConversation(conversation: Conversation | null): string | null {
    return resolveCursorSessionId(conversation);
  }

  async deleteConversationSession(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<DeleteHistoryOutcome> {
    const sessionId = resolveCursorSessionId(conversation);
    if (!sessionId || !ctx.vaultPath) {
      return { kind: 'no-op', reason: 'no-session' };
    }
    if (!isValidCursorSessionId(sessionId)) {
      return {
        kind: 'error',
        error: {
          code: 'invalid-session-id',
          message: 'Cursor session id failed validation; refusing to delete.',
        },
      };
    }

    const acpValidationError = validateCursorAcpSessionVault(sessionId, ctx.vaultPath);
    const removedPaths: string[] = [];
    const errors: string[] = [];
    const collect = (result: RemovalResult): void => {
      removedPaths.push(...result.removed);
      errors.push(...result.errors);
    };

    // The global ACP session dir is only vault-owned when validation passes.
    if (!acpValidationError) {
      collect(removeCursorAcpSessionDir(sessionId));
    }
    collect(removeCursorChatDirs(ctx.vaultPath, sessionId));
    collect(removeCursorAgentTranscript(ctx.vaultPath, sessionId));

    if (acpValidationError) {
      return {
        kind: 'error',
        error: acpValidationError,
        ...(removedPaths.length > 0 ? { paths: removedPaths } : {}),
      };
    }

    if (errors.length > 0) {
      return {
        kind: 'error',
        error: {
          code: 'store-unreadable',
          message: 'Could not delete Cursor session artifacts.',
          detail: errors.join('; '),
        },
        ...(removedPaths.length > 0 ? { paths: removedPaths } : {}),
      };
    }

    if (removedPaths.length === 0) {
      return { kind: 'no-op', reason: 'no-session' };
    }

    return { kind: 'deleted', paths: removedPaths };
  }

  buildPersistedProviderState(conversation: Conversation): CursorProviderState | undefined {
    const state = getCursorState(conversation.providerState);
    const sid = state.chatSessionId ?? conversation.sessionId ?? undefined;
    const merged: CursorProviderState = { ...state };
    if (sid) merged.chatSessionId = sid;
    const entries = Object.entries(merged).filter(([, value]) => value !== undefined);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }

  /**
   * Recovers the most recent `UsageInfo` from Cursor's per-session SQLite
   * `blobs` store. The cursor-agent CLI persists raw stream-json events as
   * JSON blobs; we walk them back to front to find the latest `usage` event
   * (or assistant blob carrying a `usage` field) and the latest `system`
   * event that stamped the model id.
   */
  async extractLastUsage(
    conversation: Conversation,
    ctx: HydrationContext,
  ): Promise<UsageInfo | null> {
    try {
      const sessionId = resolveCursorSessionId(conversation);
      if (!sessionId || !ctx.vaultPath) return null;
      const dbPath = resolveCursorStoreDbPath(ctx.vaultPath, sessionId);
      if (!dbPath) return null;

      const records = loadCursorRawRecords(dbPath);
      if (!records || records.length === 0) return null;

      return extractLastUsageFromCursorRecords(records);
    } catch {
      return null;
    }
  }
}

type RemovalResult = { removed: string[]; errors: string[] };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Recursively remove a directory if present, recording the path or the failure.
function safeRemoveDir(dir: string, result: RemovalResult): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      result.removed.push(dir);
    }
  } catch (error) {
    result.errors.push(toErrorMessage(error));
  }
}

function removeCursorAcpSessionDir(sessionId: string): RemovalResult {
  const result: RemovalResult = { removed: [], errors: [] };
  safeRemoveDir(path.join(os.homedir(), '.cursor', 'acp-sessions', sessionId), result);
  return result;
}

function removeCursorChatDirs(vaultPath: string, sessionId: string): RemovalResult {
  const result: RemovalResult = { removed: [], errors: [] };
  const chatsRoot = path.join(os.homedir(), '.cursor', 'chats');
  const candidateHashes = [
    cursorWorkspaceHash(vaultPath),
    cursorWorkspaceHashLegacy(vaultPath),
  ];
  const seenDirs = new Set<string>();
  for (const hash of candidateHashes) {
    const chatDir = path.join(chatsRoot, hash, sessionId);
    if (!chatDir.startsWith(chatsRoot)) continue;
    if (seenDirs.has(chatDir)) continue;
    seenDirs.add(chatDir);
    safeRemoveDir(chatDir, result);
  }
  return result;
}

function removeCursorAgentTranscript(vaultPath: string, sessionId: string): RemovalResult {
  const result: RemovalResult = { removed: [], errors: [] };
  const transcriptPath = resolveCursorAgentTranscriptPath(vaultPath, sessionId);
  if (!transcriptPath) return result;
  try {
    fs.rmSync(transcriptPath, { force: true });
    result.removed.push(transcriptPath);
    const transcriptDir = path.dirname(transcriptPath);
    if (fs.existsSync(transcriptDir) && fs.readdirSync(transcriptDir).length === 0) {
      fs.rmSync(transcriptDir, { recursive: true, force: true });
    }
  } catch (error) {
    result.errors.push(toErrorMessage(error));
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readModel(rec: Record<string, unknown>): string | null {
  const direct = rec.model;
  if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
  // Some Cursor records nest model under message.metadata or system payload.
  if (isRecord(rec.message)) {
    const nested = (rec.message).model;
    if (typeof nested === 'string' && nested.trim().length > 0) return nested.trim();
  }
  return null;
}

function hasUsageField(rec: Record<string, unknown>): boolean {
  if (rec.type === 'usage') return true;
  if (isRecord(rec.usage)) return true;
  if (isRecord(rec.message) && isRecord((rec.message).usage)) {
    return true;
  }
  return false;
}

export function extractLastUsageFromCursorRecords(
  records: readonly Record<string, unknown>[],
): UsageInfo | null {
  // Walk back to front for the latest usage record, then pair it with the model
  // active at or before that record — not a later model stamp.
  let lastUsageIndex = -1;
  let lastUsageRecord: Record<string, unknown> | null = null;

  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    if (!isRecord(rec)) continue;
    if (hasUsageField(rec)) {
      lastUsageIndex = i;
      lastUsageRecord = rec;
      break;
    }
  }

  if (!lastUsageRecord || lastUsageIndex < 0) return null;

  let model: string | null = null;
  for (let j = lastUsageIndex; j >= 0; j--) {
    const rec = records[j];
    if (!isRecord(rec)) continue;
    const candidate = readModel(rec);
    if (candidate) {
      model = candidate;
      break;
    }
  }

  if (!model) return null;

  const usage = extractCursorUsage(lastUsageRecord, model);
  if (usage.contextTokens === 0 && usage.inputTokens === 0 && (usage.outputTokens ?? 0) === 0) {
    return null;
  }

  return buildUsageInfo({
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadInputTokens,
    contextTokens: usage.contextTokens,
    contextWindow: usage.contextWindow,
    contextWindowIsAuthoritative: usage.contextWindowIsAuthoritative,
  });
}
