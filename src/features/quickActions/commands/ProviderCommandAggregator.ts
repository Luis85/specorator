import { isBuiltInCommandName } from '../../../core/commands/builtInCommands';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import { ProviderEntryAggregator } from '../providerEntryAggregator';
import type { ProviderRecord } from '../skills/types';
import type {
  CommandTabEntry,
  ProviderCommandAggregatorOptions,
  ProviderCommandSource,
} from './types';

const DEFAULT_TTL_MS = 60_000;

/**
 * Walks every provider record and asks each provider's
 * `ProviderCommandCatalog.listDropdownEntries({ includeBuiltIns: true })` for
 * command-kind entries, tagging them with provider metadata for the Commands
 * tab. TTL caching, in-flight dedup, the generation guard, and swallow-and-log
 * failure handling come from `ProviderEntryAggregator`.
 *
 * **Why the dropdown listing, not `listVaultEntries()`** (which the skills
 * aggregator uses): the composer's `/` dropdown is the authority on what a
 * provider will actually resolve. Claude's runtime listing folds in SDK,
 * plugin, and `.claude/commands/` entries; Opencode's commands exist ONLY at
 * runtime (`listVaultEntries()` returns `[]` there). Sourcing from the vault
 * listing would have shown a subset for Claude and nothing at all for Opencode.
 *
 * **Why no disk index** (unlike `VaultSkillAggregator`): a provider's command
 * set is session state — Claude's is empty until a runtime warms up or the
 * cold probe lands. Persisting it would hydrate a set that no longer matches
 * the running providers, and re-deriving it costs one catalog call. The
 * in-memory TTL plus the tab's Refresh button is the whole freshness model.
 */
export class ProviderCommandAggregator
  extends ProviderEntryAggregator<ProviderCommandEntry, CommandTabEntry>
  implements ProviderCommandSource {
  constructor(
    getProviderRecords: () => ProviderRecord[],
    options: ProviderCommandAggregatorOptions = {},
  ) {
    super({
      getProviderRecords,
      label: 'provider command',
      ttlMs: options.ttlMs ?? DEFAULT_TTL_MS,
      nowMs: options.nowMs ?? Date.now,
      ...(options.logger ? { logger: options.logger } : {}),
      // Never ask a provider the user turned off. Unlike the skills aggregator's
      // `listVaultEntries()` (a disk scan), a cold `listDropdownEntries()` can
      // SPAWN: Claude's probes the SDK in a subprocess. Merely opening the tab
      // must not launch a provider that is opted out.
      //
      // This is a `shouldFetch` guard rather than an early `return []` inside
      // `fetchEntries` precisely so the disabled state is never COMMITTED: an
      // empty bucket written here would be served for the rest of the TTL, and
      // re-enabling the provider inside that window would show it as having no
      // commands. Skipping the fetch leaves the bucket untouched, so the first
      // pass after re-enabling fetches live. Rows cached from when it was
      // enabled keep rendering (dimmed) — `mapEntries` re-tags `providerEnabled`
      // from the live record on every read.
      shouldFetch: (record) => record.isEnabled,
      fetchEntries: async (record) => {
        const first = await listCommandEntries(record);
        if (first.length > 0 || !options.warmRuntimeCommands) return first;
        // An empty listing from a runtime-backed catalog usually means nothing
        // has primed it yet — Opencode's lives entirely in `runtimeCommands`,
        // which only `setRuntimeCommands` fills, and the modal has no tab
        // runtime to warm it. Prime it once, then re-read; otherwise the empty
        // bucket would be cached for the full TTL and the tab would report the
        // provider as having no commands at all.
        //
        // Re-read ONLY when the hook reports it primed something. A provider
        // with no runtime loader (Claude) primes nothing, and re-entering
        // `listDropdownEntries` there would run `ensureProbed()` again — a
        // second SDK subprocess for the same empty answer.
        const primed = await options.warmRuntimeCommands(record);
        return primed ? listCommandEntries(record) : first;
      },
      mapEntries: (raw, record) => mapCommandBucket(raw, record),
    });
  }

  dispose(): void {
    this.clearBuckets();
  }
}

async function listCommandEntries(
  record: ProviderRecord,
): Promise<ProviderCommandEntry[]> {
  const all = await record.commandCatalog.listDropdownEntries({ includeBuiltIns: true });
  return all.filter((e) => e.kind === 'command');
}

function mapCommandBucket(
  raw: ProviderCommandEntry[],
  record: ProviderRecord,
): CommandTabEntry[] {
  const seen = new Set<string>();
  const out: CommandTabEntry[] = [];
  for (const entry of raw) {
    const key = entry.name.trim().toLowerCase();
    // Three reasons to drop a row, all of them "this wouldn't do what the row
    // says":
    // - Duplicate name: a cold Claude catalog falls back to the vault listing
    //   while a warm one returns the SDK's superset, so the same name can
    //   arrive twice across a refresh boundary.
    // - Hidden: the user suppressed it from the composer dropdown.
    // - Shadowed by a built-in: `InputController.sendMessage` runs
    //   `detectBuiltInCommand` BEFORE provider dispatch, so a provider command
    //   named `clear`/`new`/`add-dir`/`resume`/`fork` would silently trigger
    //   Specorator's local action instead. The composer dropdown already gives
    //   built-ins precedence and skips the collision; this mirrors it, so the
    //   tab never advertises a command it can't actually dispatch.
    if (!key || seen.has(key) || record.hiddenNames.has(key) || isBuiltInCommandName(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      id: `${record.providerId}:${entry.id}`,
      providerId: record.providerId,
      providerDisplayName: record.displayName,
      name: entry.name,
      description: entry.description ?? '',
      insertPrefix: entry.insertPrefix || '/',
      ...(entry.argumentHint ? { argumentHint: entry.argumentHint } : {}),
      scope: entry.scope,
      providerEnabled: record.isEnabled,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
