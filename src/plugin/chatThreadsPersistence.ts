import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { asSessionId } from '@/domain/chat/SessionId'
import type { LoggerPort } from '@/domain/ports/LoggerPort'

/**
 * Pure helpers for the `chatThreads` plugin-data blob defined by
 * SPEC-ASM-001 §9.3 (REQ-ASM-037, ADR-0031).
 *
 * The blob lives under `_storedData.specorator.chatThreads` and serialises the
 * in-memory `Map<string, ChatThreadRecord>` to a plain `Record<string,
 * SerialisedChatThreadRecord>` keyed by `threadId`.
 *
 * Domain-shape guarantees:
 *   - Records with missing or wrong-typed `sessionId`, `feature`, `transport`,
 *     `logPath`, `threadId`, `createdAt`, or `lastUsedAt` are dropped at load
 *     time and logged at `warn` (SPEC §11.3).
 *   - `transport === 'degraded'` records are not persisted (degraded threads
 *     have no resumable session and are user-session-scoped).
 *
 * No `obsidian` imports — pure functions consumed by `main.ts`.
 */

/** JSON-friendly serialisation of a `ChatThreadRecord`. */
export interface SerialisedChatThreadRecord {
  readonly threadId: string
  readonly sessionId: string | null
  readonly feature: string | null
  readonly logPath: string
  readonly transport: 'api-key' | 'subscription'
  readonly createdAt: string
  readonly lastUsedAt: string
}

const PERSISTED_TRANSPORTS: ReadonlySet<string> = new Set(['api-key', 'subscription'])

function isPersistedTransport(value: unknown): value is 'api-key' | 'subscription' {
  return typeof value === 'string' && PERSISTED_TRANSPORTS.has(value)
}

type RecordDefect = { field: string; value?: unknown } | null

/** Internal: validate the trio of required string fields (`threadId`, `logPath`, transport). */
function findIdentityDefect(r: Record<string, unknown>): RecordDefect {
  if (typeof r.threadId !== 'string' || r.threadId.length === 0) {
    return { field: 'threadId' }
  }
  if (typeof r.logPath !== 'string') return { field: 'logPath' }
  if (!isPersistedTransport(r.transport)) {
    return { field: 'transport', value: r.transport }
  }
  return null
}

/** Internal: validate the optional-but-typed (`feature`, `sessionId`) and timestamp fields. */
function findShapeDefect(r: Record<string, unknown>): RecordDefect {
  if (r.feature !== null && typeof r.feature !== 'string') {
    return { field: 'feature' }
  }
  if (r.sessionId !== null && typeof r.sessionId !== 'string') {
    return { field: 'sessionId' }
  }
  if (typeof r.createdAt !== 'string' || typeof r.lastUsedAt !== 'string') {
    return { field: 'timestamps' }
  }
  return null
}

/** Internal: report which required field of a raw record is malformed. */
function findRecordDefect(r: Record<string, unknown>): RecordDefect {
  return findIdentityDefect(r) ?? findShapeDefect(r)
}

/**
 * Type-guard parsing of one raw record. Returns `null` (and logs once) if the
 * record is malformed; returns a `ChatThreadRecord` otherwise.
 *
 * Required fields per SPEC §2.2: `threadId`, `sessionId` (nullable), `feature`
 * (nullable), `logPath`, `transport` (∈ {'api-key','subscription'}),
 * `createdAt`, `lastUsedAt`.
 */
export function parseChatThreadRecord(
  raw: unknown,
  logger: LoggerPort,
): ChatThreadRecord | null {
  if (raw === null || typeof raw !== 'object') {
    logger.warn('[chatThreads] dropped non-object record', { raw })
    return null
  }
  const r = raw as Record<string, unknown>
  const defect = findRecordDefect(r)
  if (defect !== null) {
    logger.warn(`[chatThreads] dropped record (invalid ${defect.field})`, {
      threadId: typeof r.threadId === 'string' ? r.threadId : undefined,
      ...(defect.value !== undefined ? { value: defect.value } : {}),
    })
    return null
  }
  // Narrowing: `findRecordDefect` ensures all required fields are correctly
  // typed when it returns `null`.
  const threadId = r.threadId as string
  const sessionIdRaw = r.sessionId as string | null
  const feature = r.feature as string | null
  const logPath = r.logPath as string
  const transport = r.transport as 'api-key' | 'subscription'
  const createdAt = r.createdAt as string
  const lastUsedAt = r.lastUsedAt as string
  return {
    threadId,
    sessionId: sessionIdRaw === null ? null : asSessionId(sessionIdRaw),
    feature,
    logPath,
    transport,
    createdAt,
    lastUsedAt,
  }
}

/**
 * Decode a raw `chatThreads` blob (typically `_storedData.specorator.chatThreads`)
 * into an array of valid records. Well-formed entries are kept; malformed
 * entries are filtered out and each filtered entry produces one `warn` log.
 *
 * Returns `[]` for `undefined`, `null`, non-object blobs (with one warn for the
 * non-object case).
 */
export function decodeChatThreadsBlob(
  raw: unknown,
  logger: LoggerPort,
): ChatThreadRecord[] {
  if (raw === undefined || raw === null) return []
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    logger.warn('[chatThreads] blob is not an object — treating as empty', {
      typeofRaw: typeof raw,
    })
    return []
  }
  const out: ChatThreadRecord[] = []
  for (const value of Object.values(raw as Record<string, unknown>)) {
    const record = parseChatThreadRecord(value, logger)
    if (record !== null) out.push(record)
  }
  return out
}

/**
 * Encode a `Map<threadId, ChatThreadRecord>` into the JSON-friendly blob shape.
 * Filters out records whose transport is not `'api-key'` or `'subscription'`
 * (e.g. degraded threads are not persisted — SPEC §2.2 / ADR-0031).
 */
export function encodeChatThreadsBlob(
  records: ReadonlyMap<string, ChatThreadRecord>,
): Record<string, SerialisedChatThreadRecord> {
  const out: Record<string, SerialisedChatThreadRecord> = {}
  for (const [threadId, record] of records) {
    if (!isPersistedTransport(record.transport)) continue
    out[threadId] = {
      threadId: record.threadId,
      sessionId: record.sessionId,
      feature: record.feature,
      logPath: record.logPath,
      transport: record.transport,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    }
  }
  return out
}

/**
 * Select the `threadId` whose `lastUsedAt` ISO timestamp is the largest
 * (lexicographic compare is correct for ISO 8601 UTC). Returns `null` when
 * `records` is empty.
 *
 * Used at hydration time to seed `activeThreadId` (REQ-ASM-037 — last-used
 * record is restored on Obsidian restart).
 */
export function mostRecentlyUsedThreadId(
  records: ReadonlyArray<ChatThreadRecord>,
): string | null {
  if (records.length === 0) return null
  let bestId = records[0].threadId
  let bestAt = records[0].lastUsedAt
  for (let i = 1; i < records.length; i++) {
    if (records[i].lastUsedAt > bestAt) {
      bestAt = records[i].lastUsedAt
      bestId = records[i].threadId
    }
  }
  return bestId
}
