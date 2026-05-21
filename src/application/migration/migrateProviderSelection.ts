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
  /**
   * Raw chat-thread records. The value type is `unknown` because callers may
   * hand us a freshly-parsed JSON blob whose record values have not yet been
   * narrowed to `Record<string, unknown>`. The migration function performs
   * the per-record shape check.
   */
  readonly chatThreads?: Record<string, unknown>
  readonly [key: string]: unknown
}

/**
 * Post-migration shape. `chatThreads` values are narrowed to `Record<string,
 * unknown>` because the migration either translates each entry or preserves
 * it verbatim under that shape; callers can index `result.data.chatThreads`
 * without re-asserting the value type.
 */
export interface MigratedStoredData {
  readonly settings?: Record<string, unknown>
  readonly chatThreads?: Record<string, Record<string, unknown>>
  readonly [key: string]: unknown
}

export interface MigrationResult {
  readonly data: MigratedStoredData
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

  if (!('transportKind' in settings)) {
    return { next: { ...settings }, changed: false }
  }

  const legacy = settings.transportKind
  if (typeof legacy !== 'string' || !(legacy in SETTINGS_TRANSLATION)) {
    errors.push(
      `settings.transportKind: unrecognised legacy value ${JSON.stringify(legacy)}; ` +
        `migration skipped for this field.`,
    )
    return { next: { ...settings }, changed: false }
  }

  // Rebuild without the legacy key (eslint forbids `delete` per
  // no-restricted-syntax — reassign by exclusion instead).
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'transportKind') continue
    next[key] = value
  }
  if (!('providerSelection' in next)) {
    next.providerSelection = SETTINGS_TRANSLATION[legacy]
  }
  return { next, changed: true }
}

/**
 * Translate one record's `transport` field. Returns the resolved object
 * shape and a flag indicating whether translation occurred; appends a
 * descriptive error string when the value is malformed.
 */
function translateThreadTransport(
  threadId: string,
  value: unknown,
  errors: string[],
): { mapped: { provider: ProviderId; mode: ProviderMode } | null; changed: boolean } {
  if (typeof value === 'string') {
    if (!(value in THREAD_TRANSPORT_TRANSLATION)) {
      errors.push(
        `chatThreads.${threadId}.transport: unrecognised legacy string ` +
          `${JSON.stringify(value)}; record left untouched.`,
      )
      return { mapped: null, changed: false }
    }
    return { mapped: THREAD_TRANSPORT_TRANSLATION[value], changed: true }
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (
      typeof obj.provider === 'string' &&
      PROVIDER_IDS.has(obj.provider) &&
      typeof obj.mode === 'string' &&
      PROVIDER_MODES.has(obj.mode)
    ) {
      // Already migrated — leave as-is.
      return { mapped: null, changed: false }
    }
    errors.push(
      `chatThreads.${threadId}.transport: invalid object shape; ` +
        `record left untouched.`,
    )
    return { mapped: null, changed: false }
  }
  errors.push(
    `chatThreads.${threadId}.transport: missing or invalid type ${typeof value}; ` +
      `record left untouched.`,
  )
  return { mapped: null, changed: false }
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

  const transportOutcome = translateThreadTransport(threadId, raw.transport, errors)
  if (transportOutcome.mapped !== null) {
    next.transport = transportOutcome.mapped
    changed = true
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
 * map structure even when a record records an error. Accepts an `unknown`
 * value-typed record because callers may hand the function a raw JSON blob
 * whose value types have not yet been narrowed.
 */
function migrateChatThreads(
  threads: Record<string, unknown> | undefined,
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
      next[threadId] = raw as Record<string, unknown>
      continue
    }
    const { next: recordNext, changed: recordChanged } = migrateThreadRecord(
      threadId,
      raw as Record<string, unknown>,
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

  const data: MigratedStoredData = { ...input } as MigratedStoredData
  // `MigratedStoredData` shares its keys with `RawStoredData`; we update the
  // narrowed sub-blobs in place via a mutable view so the type assertion only
  // applies at construction time.
  const mutable = data as Record<string, unknown>
  if (settingsOutcome.next !== undefined) {
    mutable.settings = settingsOutcome.next
  }
  if (threadsOutcome.next !== undefined) {
    mutable.chatThreads = threadsOutcome.next
  }

  return {
    data,
    migrated: settingsOutcome.changed || threadsOutcome.changed,
    errors,
  }
}
