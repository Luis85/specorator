import type { Logger } from '../../../core/logging/Logger';
import type { ProviderCommandScope } from '../../../core/providers/commands/ProviderCommandEntry';
import type { ProviderId } from '../../../core/providers/types';
import type { ProviderRecord } from '../skills/types';

/**
 * A provider slash command surfaced in the Quick Actions modal Commands tab.
 *
 * Sourced from each provider's `ProviderCommandCatalog.listDropdownEntries()`
 * — the SAME listing the chat `/` dropdown renders — so the modal can never
 * offer a command the composer would not resolve. Skills are excluded here;
 * they have their own tab backed by `VaultSkillAggregator`.
 */
export interface CommandTabEntry {
  /** Aggregator-assigned ID, unique across providers, e.g. "claude:cmd-review". */
  id: string;
  providerId: ProviderId;
  providerDisplayName: string;
  /** Command name as invoked in chat (without prefix). */
  name: string;
  description: string;
  /** Provider-native trigger prefix. From ProviderCommandEntry.insertPrefix. */
  insertPrefix: string;
  /**
   * Provider-declared argument placeholder (e.g. `[file]`). When present the
   * command is seeded into the composer instead of sent, so the user can type
   * the arguments — dispatching a bare `/name` would run it argument-less.
   */
  argumentHint?: string;
  scope: ProviderCommandScope;
  /**
   * Cached at listing time; used to dim disabled rows. `runProviderCommand`
   * re-checks `ProviderRegistry.isEnabled` at execution so a provider toggled
   * while the modal was open is honored.
   */
  providerEnabled: boolean;
}

/** Read API consumed by the Commands tab. Mirrors `VaultSkillSource`. */
export interface ProviderCommandSource {
  listAll(): Promise<CommandTabEntry[]>;
  listCachedNow(): CommandTabEntry[];
  listAllStreaming(
    onProviderResolved: (providerId: ProviderId, entries: CommandTabEntry[]) => void,
  ): Promise<void>;
  invalidate(providerId?: ProviderId): void;
  dispose(): void;
}

export interface ProviderCommandAggregatorOptions {
  logger?: Logger;
  /** Defaults to 60_000 ms. */
  ttlMs?: number;
  /** Clock injection for deterministic tests. Defaults to `Date.now`. */
  nowMs?: () => number;
  /**
   * Primes a runtime-backed catalog whose listing came back empty (Opencode
   * holds its commands only at runtime). Injected rather than imported so the
   * aggregator stays plugin-free, mirroring `getProviderRecords`. Omit to skip
   * runtime warmup entirely.
   */
  warmRuntimeCommands?: (record: ProviderRecord) => Promise<void>;
}
