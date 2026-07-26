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
 */
export async function warmRuntimeCommands(
  plugin: SpecoratorPlugin,
  record: ProviderRecord,
): Promise<void> {
  if (!record.isEnabled) return;
  const loader = ProviderWorkspaceRegistry.getRuntimeCommandLoader(record.providerId);
  if (!loader?.isAvailable(asSettingsBag(plugin.settings))) return;

  const commands = await loader.loadCommands({
    // No tab, so no session to reuse — the loader opens its own isolated
    // in-memory session for metadata and tears it down in its `finally`.
    allowSessionCreation: true,
    conversation: null,
    externalContextPaths: [],
    plugin,
    runtime: null,
  });
  record.commandCatalog.setRuntimeCommands(commands);
}
