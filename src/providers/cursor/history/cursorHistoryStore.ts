import * as crypto from 'crypto';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { isValidCursorSessionId } from '../../../core/providers/cursorSessionIdValidation';
import type { HistoryLoadError } from '../../../core/providers/types';
import { isSubagentToolName } from '../../../core/tools/toolNames';
import type { ChatMessage, ToolCallInfo } from '../../../core/types';
import { extractDiffData } from '../../../utils/diff';
import { attachCursorSubagentToTaskToolCall } from '../runtime/cursorTaskSubagent';
import {
  normalizeCursorPersistedToolCall,
  normalizeCursorPersistedToolResult,
} from '../runtime/cursorToolNormalization';
import {
  normalizeCursorWorkspacePath,
  validateCursorAcpSessionVault,
} from './cursorSessionOwnership';

export {
  cursorVaultPathsMatch,
  readCursorAcpSessionMeta,
  validateCursorAcpSessionVault,
} from './cursorSessionOwnership';

export type CursorHistorySourceKind = 'acp-sqlite' | 'legacy-sqlite' | 'jsonl';

export interface CursorHistorySourceCandidate {
  kind: CursorHistorySourceKind;
  path: string;
  sourceRef: string;
}

function sqliteSourceRef(sessionId: string, kind: 'acp-sqlite' | 'legacy-sqlite', dbPath: string): string {
  const walPath = `${dbPath}-wal`;
  const generation = (() => {
    try {
      const dbStat = fs.statSync(dbPath);
      let value = `${dbStat.mtimeMs}:${dbStat.size}`;
      if (fs.existsSync(walPath)) {
        const walStat = fs.statSync(walPath);
        value += `:${walStat.mtimeMs}:${walStat.size}`;
      }
      return value;
    } catch {
      return 'missing';
    }
  })();
  return `${sessionId}::${kind}::${dbPath}::${generation}`;
}

function jsonlSourceRef(sessionId: string, transcriptPath: string): string {
  const generation = (() => {
    try {
      const stat = fs.statSync(transcriptPath);
      return `${stat.mtimeMs}:${stat.size}`;
    } catch {
      return 'missing';
    }
  })();
  return `${sessionId}::jsonl::${transcriptPath}::${generation}`;
}

/**
 * Ordered Cursor history sources for a session: ACP SQLite, legacy SQLite, then
 * exact-project JSONL. Cross-project JSONL scans are intentionally excluded.
 */
export function resolveCursorHistorySources(
  absoluteVaultPath: string,
  sessionId: string,
): CursorHistorySourceCandidate[] {
  if (!isValidCursorSessionId(sessionId)) return [];

  const sources: CursorHistorySourceCandidate[] = [];
  const vaultMismatch = validateCursorAcpSessionVault(sessionId, absoluteVaultPath);

  const acpStore = path.join(os.homedir(), '.cursor', 'acp-sessions', sessionId, 'store.db');
  if (fs.existsSync(acpStore) && !vaultMismatch) {
    sources.push({
      kind: 'acp-sqlite',
      path: acpStore,
      sourceRef: sqliteSourceRef(sessionId, 'acp-sqlite', acpStore),
    });
  }

  const legacyCandidates = [
    cursorWorkspaceHash(absoluteVaultPath),
    cursorWorkspaceHashLegacy(absoluteVaultPath),
  ];
  for (const hash of legacyCandidates) {
    const candidate = path.join(os.homedir(), '.cursor', 'chats', hash, sessionId, 'store.db');
    if (fs.existsSync(candidate)) {
      sources.push({
        kind: 'legacy-sqlite',
        path: candidate,
        sourceRef: sqliteSourceRef(sessionId, 'legacy-sqlite', candidate),
      });
      break;
    }
  }

  const transcriptPath = resolveCursorAgentTranscriptPath(absoluteVaultPath, sessionId);
  if (transcriptPath) {
    sources.push({
      kind: 'jsonl',
      path: transcriptPath,
      sourceRef: jsonlSourceRef(sessionId, transcriptPath),
    });
  }

  return sources;
}

export function cursorWorkspaceHash(absoluteVaultPath: string): string {
  return crypto.createHash('md5').update(normalizeCursorWorkspacePath(absoluteVaultPath)).digest('hex');
}

/** Legacy (pre-normalization) hash; kept only for one-shot upgrade fallback. */
export function cursorWorkspaceHashLegacy(absoluteVaultPath: string): string {
  return crypto.createHash('md5').update(absoluteVaultPath).digest('hex');
}

export function resolveCursorStoreDbPath(
  absoluteVaultPath: string,
  sessionId: string,
): string | null {
  for (const source of resolveCursorHistorySources(absoluteVaultPath, sessionId)) {
    if (source.kind === 'acp-sqlite' || source.kind === 'legacy-sqlite') {
      return source.path;
    }
  }
  return null;
}

/** Cursor 2.x stores Agent/ACP transcripts as project-scoped JSONL files. */
export function resolveCursorAgentTranscriptPath(
  absoluteVaultPath: string,
  sessionId: string,
): string | null {
  if (!isValidCursorSessionId(sessionId)) return null;
  const projectsRoot = path.join(os.homedir(), '.cursor', 'projects');
  const projectSlug = path.resolve(absoluteVaultPath).replace(/[:\\/]+/g, '-');
  const relativeTranscript = path.join('agent-transcripts', sessionId, `${sessionId}.jsonl`);
  const direct = path.join(projectsRoot, projectSlug, relativeTranscript);
  if (fs.existsSync(direct)) return direct;
  return null;
}

function isIdeBootstrapUser(content: string): boolean {
  return content.includes('<user_info>');
}

/**
 * Builds a `ToolCallInfo` from a single `tool-call` content block. When the blob
 * carries no id, synthesizes a deterministic id from the block key so a later
 * tool-result can still resolve the call.
 */
function parseAssistantToolCallBlock(b: Record<string, unknown>, blockKey: string): ToolCallInfo | null {
  let id = typeof b.toolCallId === 'string'
    ? b.toolCallId
    : typeof b.id === 'string' ? b.id : '';
  if (!id) {
    id = synthesizeCursorToolCallId(blockKey, b);
  }
  const rawName = typeof b.toolName === 'string'
    ? b.toolName
    : typeof b.name === 'string' ? b.name : 'tool';
  const input = b.args ?? b.input;
  const rawArgs = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const description = typeof b.description === 'string' ? b.description : undefined;
  const normalized = normalizeCursorPersistedToolCall(rawName, rawArgs, description);
  return {
    id,
    name: normalized.name,
    input: normalized.input,
    status: 'running',
  };
}

function synthesizeCursorToolCallId(blockKey: string, b: Record<string, unknown>): string {
  const rawName = typeof b.toolName === 'string'
    ? b.toolName
    : typeof b.name === 'string' ? b.name : 'tool';
  const input = JSON.stringify(b.args ?? b.input ?? {});
  const digest = createHash('sha256')
    .update(`${blockKey}\0${rawName}\0${input}`)
    .digest('hex')
    .slice(0, 16);
  return `cursor-tc-${digest}`;
}

function parseAssistantBlob(
  record: Record<string, unknown>,
  rowId = 'row',
): { text: string; toolCalls: ToolCallInfo[] } {
  const content = record.content;
  if (typeof content === 'string') {
    return { text: content, toolCalls: [] };
  }
  if (!Array.isArray(content)) {
    return { text: '', toolCalls: [] };
  }

  let text = '';
  const toolCalls: ToolCallInfo[] = [];

  for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
    const block: unknown = content[blockIndex];
    if (!block || typeof block !== 'object') {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string') {
      text += b.text;
    } else if (b.type === 'tool-call' || b.type === 'tool_use') {
      const toolCall = parseAssistantToolCallBlock(b, `${rowId}:${blockIndex}`);
      if (toolCall) {
        toolCalls.push(toolCall);
      }
    }
  }

  return { text, toolCalls };
}

/**
 * Finds the running tool call matching `toolCallId`, scanning assistant
 * messages newest-first so a later tool-result resolves against the most
 * recent matching tool call (Cursor reuses ids only across distinct turns).
 */
function findToolCallById(messages: ChatMessage[], toolCallId: string): ToolCallInfo | undefined {
  const assistant = [...messages].reverse().find(
    m => m.role === 'assistant' && m.toolCalls?.some(t => t.id === toolCallId),
  );
  return assistant?.toolCalls?.find(t => t.id === toolCallId);
}

/** Mutates `tc` in place with the normalized result, status, and diff data. */
function applyToolResultToCall(
  tc: ToolCallInfo,
  rawResult: unknown,
  blockToolName: string,
): void {
  const toolName = blockToolName || tc.name;
  const normalized = normalizeCursorPersistedToolResult(toolName, rawResult, tc.input);
  tc.result = normalized.content;
  tc.status = normalized.isError ? 'error' : 'completed';
  if (normalized.toolUseResult) {
    const diffData = extractDiffData(normalized.toolUseResult, tc);
    if (diffData) {
      tc.diffData = diffData;
    }
  }

  if (isSubagentToolName(tc.name)) {
    attachCursorSubagentToTaskToolCall(tc, rawResult);
  }
}

function findLastRunningToolCall(messages: ChatMessage[]): ToolCallInfo | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== 'assistant' || !message.toolCalls?.length) continue;
    const running = [...message.toolCalls].reverse().find((tc) => tc.status === 'running');
    if (running) return running;
  }
  return undefined;
}

function applyToolBlob(record: Record<string, unknown>, messages: ChatMessage[]): void {
  const content = record.content;
  if (!Array.isArray(content)) {
    return;
  }

  for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
    const block: unknown = content[blockIndex];
    if (!block || typeof block !== 'object') {
      continue;
    }
    const b = block as Record<string, unknown>;
    if (b.type !== 'tool-result' && b.type !== 'tool_result') {
      continue;
    }
    const toolCallId = typeof b.toolCallId === 'string'
      ? b.toolCallId
      : typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
    const tc = toolCallId
      ? findToolCallById(messages, toolCallId)
      : findLastRunningToolCall(messages);
    if (!tc) {
      continue;
    }

    const blockToolName = typeof b.toolName === 'string'
      ? b.toolName
      : typeof b.name === 'string' ? b.name : '';
    applyToolResultToCall(tc, b.result ?? b.content, blockToolName);
  }
}

interface CursorSqliteHandle {
  prepare: (sql: string) => { all: () => unknown[] };
  close: () => void;
}

interface CursorSqliteOpenResult {
  handle?: CursorSqliteHandle;
  error?: HistoryLoadError;
}

// node:sqlite ships with Node 22.5+. Older or locked-down runtimes (e.g. some
// Electron/Obsidian builds, or Node 20 where it's a flagged builtin) can't
// resolve it and throw a structured module-resolution error. We key off Node's
// stable error `code` rather than matching human-readable text, which varies
// across versions and locales — that text-matching is precisely what rots.
const SQLITE_UNAVAILABLE_ERROR_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_UNKNOWN_BUILTIN_MODULE']);

/**
 * Classifies a `node:sqlite` open failure into a structured outcome. A missing
 * runtime maps to `sqlite-unavailable` (the user needs a newer Node); anything
 * else is a genuine `store-unreadable` with the home directory redacted out of
 * the detail field.
 */
export function classifyCursorSqliteOpenError(err: unknown): HistoryLoadError {
  const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err);
  const sqliteUnavailable =
    (typeof code === 'string' && SQLITE_UNAVAILABLE_ERROR_CODES.has(code)) ||
    message.includes('node:sqlite');
  if (sqliteUnavailable) {
    return { code: 'sqlite-unavailable', message: 'Cursor history requires Node 22.5+ (node:sqlite).' };
  }
  // Native sqlite errors can embed the dbPath (and thus the user's home
  // directory). Redact before letting the detail field escape the store.
  return {
    code: 'store-unreadable',
    message: 'Could not open Cursor SQLite store.',
    detail: redactHomeInPath(message),
  };
}

type CursorBlobRow = { rowid: number; id: string; data: Buffer | Uint8Array };

/**
 * Reads every blob row ordered by `rowid`. Throws on SQL failure; callers wrap
 * this in their own try/catch because they diverge on how a read error surfaces
 * (structured store-unreadable string vs. a null short-circuit).
 */
function fetchCursorBlobRows(db: CursorSqliteHandle): CursorBlobRow[] {
  const stmt = db.prepare('SELECT rowid, id, data FROM blobs ORDER BY rowid');
  return stmt.all() as CursorBlobRow[];
}

/**
 * Decodes each blob row to a JSON object, skipping rows whose payload isn't a
 * brace-prefixed JSON object (the `{`-prefix guard makes the non-object/array
 * case unreachable, so both callers see the same record set). Malformed rows are
 * dropped while marking the parse degraded — partial history still renders,
 * but callers avoid caching it permanently.
 */
function parseCursorBlobRecords(
  rows: CursorBlobRow[],
): {
  records: Array<{ rowId: string; record: Record<string, unknown> }>;
  degraded: boolean;
} {
  const records: Array<{ rowId: string; record: Record<string, unknown> }> = [];
  let degraded = false;
  for (const row of rows) {
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    const raw = buf.toString('utf8');
    if (!raw.startsWith('{')) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push({ rowId: row.id, record: parsed as Record<string, unknown> });
      } else {
        degraded = true;
      }
    } catch {
      degraded = true;
      continue;
    }
  }
  return { records, degraded };
}

function openCursorSqliteReadonly(dbPath: string): CursorSqliteOpenResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports -- node:sqlite is an optional built-in; lazy require keeps load failures catchable here instead of crashing module init
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const handle = new DatabaseSync(dbPath, { readOnly: true }) as unknown as CursorSqliteHandle;
    return { handle };
  } catch (err) {
    return { error: classifyCursorSqliteOpenError(err) };
  }
}

/**
 * Builds chat messages from parsed Cursor SQLite blob records. Exported for
 * unit tests so history normalization stays aligned with the live stream mapper.
 */
export function buildChatMessagesFromCursorHistoryRecords(
  records: Array<{ rowId: string; record: Record<string, unknown> }>,
  baseTimestamp: number = Date.now(),
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  // Cursor's blob records carry no per-message timestamp (only role/content/id/
  // providerOptions), so we can't recover wall-clock times. Synthesize a
  // monotonic sequence in blob order instead of stamping every message with an
  // identical `Date.now()`, which would collapse any time-based ordering or
  // grouping downstream. `seq` advances only for emitted (pushed) messages;
  // tool blobs mutate the prior assistant message and don't consume a slot.
  let seq = 0;

  for (const { rowId, record } of records) {
    const role = record.role;
    if (role === 'system') {
      continue;
    }

    if (role === 'user') {
      const c = record.content;
      const text = typeof c === 'string' ? c : '';
      if (isIdeBootstrapUser(text)) {
        continue;
      }
      messages.push({
        id: `cursor-${rowId.slice(0, 12)}`,
        role: 'user',
        content: text,
        timestamp: baseTimestamp + seq++,
      });
      continue;
    }

    if (role === 'assistant') {
      const { text, toolCalls } = parseAssistantBlob(record, rowId);
      messages.push({
        id: `cursor-${rowId.slice(0, 12)}`,
        role: 'assistant',
        content: text,
        timestamp: baseTimestamp + seq++,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      continue;
    }

    if (role === 'tool') {
      applyToolBlob(record, messages);
    }
  }

  return messages;
}

function redactHomeInPath(s: string): string {
  const home = os.homedir();
  if (!home) return s;
  const normalizedSlashes = home.replace(/\\/g, '/');
  return s
    .split(home).join('[HOME]')
    .split(normalizedSlashes).join('[HOME]');
}

export interface CursorHistoryLoadResult {
  messages: ChatMessage[];
  /** Some records were malformed and omitted from an otherwise usable parse. */
  degraded?: boolean;
  /**
   * Structured error from the open path (sqlite-unavailable / store-unreadable);
   * legacy redacted string for downstream SQL-read failures the loader still
   * emits inline. Callers normalize the string variant into `store-unreadable`.
   */
  error?: HistoryLoadError | string;
}

function transcriptMessageContent(record: Record<string, unknown>): unknown {
  const message = record.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  return (message as Record<string, unknown>).content;
}

function transcriptTextContent(record: Record<string, unknown>): string {
  const content = transcriptMessageContent(record);
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is Record<string, unknown> =>
      !!block && typeof block === 'object' && !Array.isArray(block))
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n')
    .trim();
}

function parseTranscriptAssistantContent(
  record: Record<string, unknown>,
): { text: string; toolCalls: ToolCallInfo[] } {
  const content = transcriptMessageContent(record);
  if (typeof content === 'string') {
    return { text: content, toolCalls: [] };
  }
  if (!Array.isArray(content)) {
    return { text: '', toolCalls: [] };
  }
  return parseAssistantBlob({ content });
}

function normalizeTranscriptUserText(text: string): string {
  const query = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/u)?.[1];
  return (query ?? text)
    .replace(/^<timestamp>.*?<\/timestamp>\s*/u, '')
    .trim();
}

/** Converts Cursor 2.x `agent-transcripts/*.jsonl` records to chat messages. */
export function buildChatMessagesFromCursorAgentTranscript(
  lines: readonly string[],
  baseTimestamp: number = Date.now(),
): ChatMessage[] {
  return parseCursorAgentTranscript(lines, baseTimestamp).messages;
}

function parseCursorAgentTranscript(
  lines: readonly string[],
  baseTimestamp: number,
): { messages: ChatMessage[]; degraded: boolean } {
  const messages: ChatMessage[] = [];
  let seq = 0;
  let degraded = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    let record: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        degraded = true;
        continue;
      }
      record = parsed as Record<string, unknown>;
    } catch {
      degraded = true;
      continue;
    }

    const role = record.role;
    if (role === 'user') {
      const rawText = transcriptTextContent(record);
      const text = normalizeTranscriptUserText(rawText);
      if (!text || isIdeBootstrapUser(text)) continue;
      messages.push({
        id: `cursor-jsonl-${lineIndex + 1}`,
        role: 'user',
        content: text,
        timestamp: baseTimestamp + seq++,
      });
      continue;
    }

    if (role === 'assistant') {
      const { text, toolCalls } = parseTranscriptAssistantContent(record);
      if (!text && toolCalls.length === 0) continue;
      messages.push({
        id: `cursor-jsonl-${lineIndex + 1}`,
        role: 'assistant',
        content: text,
        timestamp: baseTimestamp + seq++,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      });
      continue;
    }

    if (role === 'tool') {
      applyToolBlob({ content: transcriptMessageContent(record) }, messages);
    }
  }
  return { messages, degraded };
}

export function loadCursorAgentTranscriptResult(
  transcriptPath: string,
): CursorHistoryLoadResult {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const parsed = parseCursorAgentTranscript(content.split(/\r?\n/u), Date.now());
    if (parsed.degraded && parsed.messages.length === 0) {
      return {
        messages: [],
        error: {
          code: 'parse-failed',
          message: 'Cursor agent transcript contained no readable messages.',
        },
      };
    }
    return {
      messages: parsed.messages,
      ...(parsed.degraded ? { degraded: true } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      messages: [],
      error: {
        code: 'store-unreadable',
        message: 'Could not read Cursor agent transcript.',
        detail: redactHomeInPath(message),
      },
    };
  }
}

export function loadCursorHistoryFromSources(
  sources: readonly CursorHistorySourceCandidate[],
): CursorHistoryLoadResult & { sourceRef: string | null } {
  if (sources.length === 0) {
    return { messages: [], sourceRef: null };
  }

  let lastError: HistoryLoadError | string | undefined;
  let lastReadableSourceRef: string | null = null;
  let degradedCandidate:
    | (CursorHistoryLoadResult & { sourceRef: string })
    | null = null;
  for (const source of sources) {
    const result = source.kind === 'jsonl'
      ? loadCursorAgentTranscriptResult(source.path)
      : loadCursorChatMessagesFromStoreResult(source.path);
    if (result.error) {
      lastError = result.error;
      continue;
    }
    lastReadableSourceRef = source.sourceRef;
    if (result.messages.length > 0) {
      if (result.degraded) {
        degradedCandidate ??= {
          messages: result.messages,
          degraded: true,
          sourceRef: source.sourceRef,
        };
        continue;
      }
      return {
        messages: result.messages,
        sourceRef: source.sourceRef,
      };
    }
  }

  const lastSource = sources[sources.length - 1];
  if (degradedCandidate) {
    return degradedCandidate;
  }
  if (lastReadableSourceRef) {
    return { messages: [], sourceRef: lastReadableSourceRef };
  }
  if (lastError) {
    return {
      messages: [],
      error: lastError,
      sourceRef: lastSource.sourceRef,
    };
  }
  return { messages: [], sourceRef: lastSource.sourceRef };
}

export function loadCursorChatMessagesFromStoreResult(dbPath: string): CursorHistoryLoadResult {
  const openResult = openCursorSqliteReadonly(dbPath);
  if (openResult.error) {
    return { messages: [], error: openResult.error };
  }
  const db = openResult.handle;
  if (!db) {
    return { messages: [], error: `Cursor history: could not open ${redactHomeInPath(dbPath)}` };
  }
  try {
    let rows: CursorBlobRow[];
    try {
      rows = fetchCursorBlobRows(db);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { messages: [], error: `Cursor history: SQL read failed (${redactHomeInPath(msg)})` };
    }

    const parsed = parseCursorBlobRecords(rows);
    const messages = buildChatMessagesFromCursorHistoryRecords(parsed.records);
    if (parsed.degraded && messages.length === 0) {
      return {
        messages: [],
        error: {
          code: 'parse-failed',
          message: 'Cursor history contained no readable records.',
        },
      };
    }
    return { messages, ...(parsed.degraded ? { degraded: true } : {}) };
  } finally {
    try { db.close(); } catch { /* ignore close errors */ }
  }
}

/** Back-compat wrapper. Prefer `loadCursorChatMessagesFromStoreResult` for new callers. */
export function loadCursorChatMessagesFromStore(dbPath: string): ChatMessage[] {
  return loadCursorChatMessagesFromStoreResult(dbPath).messages;
}

/**
 * Loads the raw, unparsed JSON records from the Cursor blob store, ordered by
 * `rowid` ascending. Used by `extractLastUsage` to scan for usage events that
 * never make it into the user-facing chat messages. Returns null when the
 * store can't be opened or the SQL read fails.
 */
export function loadCursorRawRecords(dbPath: string): Record<string, unknown>[] | null {
  const openResult = openCursorSqliteReadonly(dbPath);
  if (openResult.error || !openResult.handle) {
    return null;
  }
  const db = openResult.handle;
  try {
    let rows: CursorBlobRow[];
    try {
      rows = fetchCursorBlobRows(db);
    } catch {
      return null;
    }

    return parseCursorBlobRecords(rows).records.map(({ record }) => record);
  } finally {
    try { db.close(); } catch { /* ignore close errors */ }
  }
}
