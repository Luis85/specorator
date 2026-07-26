import type SpecoratorPlugin from '@/main';

import { buildProviderRecords } from '../skills/buildProviderRecords';
import { ProviderCommandAggregator } from './ProviderCommandAggregator';
import type { ProviderCommandSource } from './types';
import { warmRuntimeCommands } from './warmRuntimeCommands';

/**
 * Single construction site for the Commands-tab aggregator: the plugin-lifetime
 * singleton in `onload` and the transient fallback in `openQuickActionsModal`
 * both go through here, so the runtime-warmup wiring can't drift between them.
 *
 * Returns the read interface, not the class — nothing outside this module needs
 * the concrete type, and the plugin field derives from this signature.
 *
 * Construction is cheap and self-contained: there is no disk index to hydrate
 * and no pre-warm (a cold catalog answers by spawning), which is why `onload`
 * builds it BEFORE the skills aggregator's hydrate — a bailout there must not
 * leave the modal without its shared singleton and cross-open TTL cache.
 */
export function createProviderCommandAggregator(
  plugin: SpecoratorPlugin,
): ProviderCommandSource {
  return new ProviderCommandAggregator(() => buildProviderRecords(plugin), {
    logger: plugin.logger,
    warmRuntimeCommands: (record) => warmRuntimeCommands(plugin, record),
  });
}
