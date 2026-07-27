import { ProviderWorkspaceRegistry } from '@/core/providers/ProviderWorkspaceRegistry';
import { asSettingsBag } from '@/core/types/settings';
import type SpecoratorPlugin from '@/main';

import type { ProviderRecord } from '../skills/types';

/**
 * Primes a runtime-backed command catalog that nothing has warmed yet.
 *
 * Some providers hold their commands ONLY at runtime — `OpencodeCommandCatalog`
 * serves `listDropdownEntries` straight off `runtimeCommands`, which stays
 * empty until someone calls `setRuntimeCommands`. In the composer that happens
 * via `TabProviderCommandCoordinator`, which is tab- and runtime-scoped; the
 * Quick Actions modal has neither, so without this the Commands tab showed
 * Opencode as having no commands at all.
 *
 * Mirrors the coordinator's warmup: run the provider's registered
 * `ProviderRuntimeCommandLoader` (which spins up its own isolated headless
 * runtime and cleans it up), then push the result back through
 * `setRuntimeCommands` so the composer's own dropdown benefits from the same
 * warm catalog.
 *
 * Called ONLY when the catalog's own listing came back empty, so a provider
 * that already answers (Claude, which owns a cold SDK probe) never pays for it,
 * and a disabled provider never spawns anything (`isAvailable` gates on the
 * provider's enabled flag). Failures propagate to the aggregator's
 * swallow-and-log handler.
 *
 * Returns whether the catalog HOLDS entries afterwards — i.e. whether a re-read
 * is worth doing. Claude has no runtime loader, so it returns false and the
 * caller must NOT re-read: `ClaudeCommandCatalog.listDropdownEntries` would run
 * `ensureProbed()` again and spawn a second SDK subprocess for the same empty
 * answer. It is deliberately "holds entries", not "we wrote entries", so a
 * catalog primed concurrently by a chat tab still triggers the caller's re-read
 * (see the clobber guard below).
 */
export async function warmRuntimeCommands(
  plugin: SpecoratorPlugin,
  record: ProviderRecord,
): Promise<boolean> {
  if (!record.isEnabled) return false;
  const loader = ProviderWorkspaceRegistry.getRuntimeCommandLoader(record.providerId);
  if (!loader?.isAvailable(asSettingsBag(plugin.settings))) return false;

  const commands = await loader.loadCommands({
    // No tab, so no session to reuse — the loader opens its own isolated
    // in-memory session for metadata and tears it down in its `finally`.
    allowSessionCreation: true,
    conversation: null,
    externalContextPaths: [],
    plugin,
    runtime: null,
  });

  // Never clobber a catalog someone else primed while we were loading. The
  // catalog is provider-GLOBAL and `setRuntimeCommands` replaces wholesale, so
  // a chat tab's own warmup (`TabProviderCommandCoordinator`) writes this same
  // field. We only got here because the listing was empty; if it is populated
  // now, that write landed during our load — and it is the better answer,
  // because it is session-backed while ours is headless. Writing anyway would
  // at best duplicate it and at worst (an empty headless result, e.g. the
  // isolated session failing to enumerate) blank the commands the composer's
  // dropdown had just discovered, then pin that emptiness for the aggregator's
  // full TTL.
  const primedMeanwhile = (await record.commandCatalog.listDropdownEntries({
    includeBuiltIns: false,
  })).length > 0;
  if (primedMeanwhile) return true;

  record.commandCatalog.setRuntimeCommands(commands);
  return commands.length > 0;
}
