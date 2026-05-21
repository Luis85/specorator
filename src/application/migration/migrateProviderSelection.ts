/**
 * `migrateProviderSelection` — pure, idempotent migration from the v0.x
 * `transportKind` + string-transport encoding to the v1 `ProviderSelection`
 * + discriminated `{ provider, mode }` shape.
 *
 * Satisfies REQ-MPS-004, REQ-MPS-005, NFR-MPS-006. Per SPEC-MPS-001 §3 the
 * function is pure (no I/O), idempotent (running it twice on the same input
 * is a no-op the second time), and never throws — per-record validation
 * issues are captured in `MigrationResult.errors` so the caller decides
 * whether to drop the malformed record.
 *
 * Translation tables (ADR-MPS-002):
 *
 *   settings.transportKind:
 *     'auto'         → providerSelection = { forced: 'auto' }
 *     'api-key'      → providerSelection = { provider: 'claude', mode: 'api' }
 *     'subscription' → providerSelection = { provider: 'claude', mode: 'cli' }
 *     'degraded'     → providerSelection = { forced: 'degraded' }
 *
 *   chatThreads.<id>.transport:
 *     'api-key'      → { provider: 'claude', mode: 'api' }
 *     'subscription' → { provider: 'claude', mode: 'cli' }
 *     already an object → preserved as-is
 *
 * Defaults applied to records that lack them:
 *     title      → ''
 *     forkParent → null
 *
 * Pure application layer (ADR-001 / ADR-008): no `obsidian` imports, no I/O.
 */
import type { ProviderId, ProviderMode, ProviderSelection } from '@/domain/chat/ProviderSelection'

export interface RawStoredData {
  readonly settings?: Record<string, unknown>
  readonly chatThreads?: Record<string, Record<string, unknown>>
  readonly [key: string]: unknown
}

export interface MigrationResult {
  readonly data: RawStoredData
  readonly migrated: boolean
  readonly errors: ReadonlyArray<string>
}

const SETTINGS_TRANSLATION: Record<string, ProviderSelection> = {
  auto: { forced: 'auto' },
  'api-key': { provider: 'claude', mode: 'api' },
  subscription: { provider: 'claude', mode: 'cli' },
  degraded: { forced: 'degraded' },
}

const THREAD_TRANSPORT_TRANSLATION: Record<
  string,
  { readonly provider: ProviderId; readonly mode: ProviderMode }
> = {
  'api-key': { provider: 'claude', mode: 'api' },
  subscription: { provider: 'claude', mode: 'cli' },
}

const PROVIDER_IDS: ReadonlySet<string> = new Set(['claude', 'cursor'])
const PROVIDER_MODES: ReadonlySet<string> = new Set(['api', 'cli'])

/**
 * Migrate the `settings` sub-blob. Translates the legacy `transportKind`
 * string to `providerSelection` and deletes the legacy key. Returns the
 * next settings object and a `changed` flag; collects per-issue error
 * strings.
 */
function migrateSettings(
  settings: Record<string, unknown> | undefined,
  errors: string[],
): { next: Record<string, unknown> | undefined; changed: boolean } {
  if (settings === undefined) return { next: undefined, changed: false }

  const next: Record<string, unknown> = { ...settings }
  let changed = false

  if ('transportKind' in next) {
    const legacy = next.transportKind
    if (typeof legacy === 'string' && legacy in SETTINGS_TRANSLATION) {
      // Translate then remove the legacy key.
      if (!('providerSelection' in next)) {
        next.providerSelection = SETTINGS_TRANSLATION[legacy]
      }
      delete next.transportKind
      changed = true
    } else {
      errors.push(
        `settings.transportKind: unrecognised legacy value ${JSON.stringify(legacy)}; ` +
          `migration skipped for this field.`,
      )
    }
  }

  return { next, changed }
}

/**
 * Translate one raw thread record. Pure: returns the next record and a
 * `changed` flag; reports per-record problems via the `errors` accumulator.
 *
 * Idempotency rule: a record whose `transport` is already the object shape,
 * with both `title` and `forkParent` present, returns `changed === false`.
 */
function migrateThreadRecord(
  threadId: string,
  raw: Record<string, unknown>,
  errors: string[],
): { next: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = { ...raw }
  let changed = false

  // Transport translation.
  const t = raw.transport
  if (typeof t === 'string') {
    const mapped = THREAD_TRANSPORT_TRANSLATION[t]
    if (mapped === undefined) {
      errors.push(
        `chatThreads.${threadId}.transport: unrecognised legacy string ` +
          `${JSON.stringify(t)}; record left untouched.`,
      )
    } else {
      next.transport = mapped
      changed = true
    }
  } else if (t !== null && typeof t === 'object') {
    const obj = t as Record<string, unknown>
    if (
      typeof obj.provider === 'string' &&
      PROVIDER_IDS.has(obj.provider) &&
      typeof obj.mode === 'string' &&
      PROVIDER_MODES.has(obj.mode)
    ) {
      // Already migrated — leave as-is.
    } else {
      errors.push(
        `chatThreads.${threadId}.transport: invalid object shape; ` +
          `record left untouched.`,
      )
    }
  } else {
    errors.push(
      `chatThreads.${threadId}.transport: missing or invalid type ${typeof t}; ` +
        `record left untouched.`,
    )
  }

  // Default `title` when absent.
  if (!('title' in next)) {
    next.title = ''
    changed = true
  }
  // Default `forkParent` when absent.
  if (!('forkParent' in next)) {
    next.forkParent = null
    changed = true
  }

  return { next, changed }
}

/**
 * Migrate the `chatThreads` sub-blob. Iterates every entry; preserves the
 * map structure even when a record records an error.
 */
function migrateChatThreads(
  threads: Record<string, Record<string, unknown>> | undefined,
  errors: string[],
):
  | { next: Record<string, Record<string, unknown>>; changed: boolean }
  | { next: undefined; changed: false } {
  if (threads === undefined) return { next: undefined, changed: false }

  const next: Record<string, Record<string, unknown>> = {}
  let changed = false

  for (const [threadId, raw] of Object.entries(threads)) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push(
        `chatThreads.${threadId}: expected object, got ${typeof raw}; ` +
          `record left untouched.`,
      )
      // Defensive: preserve the raw value so the caller can decide.
      next[threadId] = raw as unknown as Record<string, unknown>
      continue
    }
    const { next: recordNext, changed: recordChanged } = migrateThreadRecord(
      threadId,
      raw,
      errors,
    )
    next[threadId] = recordNext
    if (recordChanged) changed = true
  }

  return { next, changed }
}

/**
 * One-shot pure migration of the v0.x persisted data blob.
 *
 * The function never throws. Idempotency is guaranteed by the per-field
 * shape checks: legacy fields are only translated when present in their
 * legacy encoding.
 */
export function migrateProviderSelection(input: RawStoredData): MigrationResult {
  const errors: string[] = []

  const settingsOutcome = migrateSettings(input.settings, errors)
  const threadsOutcome = migrateChatThreads(input.chatThreads, errors)

  const data: Record<string, unknown> = { ...input }
  if (settingsOutcome.next !== undefined) {
    data.settings = settingsOutcome.next
  }
  if (threadsOutcome.next !== undefined) {
    data.chatThreads = threadsOutcome.next
  }

  return {
    data: data as RawStoredData,
    migrated: settingsOutcome.changed || threadsOutcome.changed,
    errors,
  }
}
