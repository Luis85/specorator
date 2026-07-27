import type { ProviderId } from '../../core/providers/types';

export interface QuickActionsEventMap {
  /**
   * Emitted by provider command catalogs after a skill-kind entry is saved
   * or deleted via in-app flows. The `VaultSkillAggregator` subscribes and
   * invalidates the matching provider bucket so the next Skills-tab open
   * shows fresh data without waiting for the TTL.
   *
   * External CLI edits (`SKILL.md` modified outside Obsidian) do NOT emit
   * this event — they rely on the aggregator's TTL fallback.
   */
  'vaultSkill.changed': { providerId: ProviderId };
  /**
   * The command-kind counterpart, emitted after a command entry is saved or
   * deleted in provider settings. `ProviderCommandAggregator` subscribes and
   * invalidates the matching bucket, so the Commands tab reflects an edit
   * without waiting out its TTL.
   *
   * Two layers have to drop, not one: the aggregator's bucket AND the
   * provider's own listing. A warm `ClaudeCommandCatalog` answers from the SDK
   * superset, so invalidating only the aggregator would re-read the same stale
   * set and cache it again — the emitter clears its listing FIRST, keeping the
   * fresh-before-notify ordering the skills seam already relies on.
   *
   * External CLI edits do NOT emit this — they rely on the TTL and the tab's
   * Refresh button.
   */
  'providerCommand.changed': { providerId: ProviderId };
}
