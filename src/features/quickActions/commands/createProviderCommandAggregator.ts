import type SpecoratorPlugin from '@/main';

import { buildProviderRecords } from '../skills/buildProviderRecords';
import { ProviderCommandAggregator } from './ProviderCommandAggregator';
import { warmRuntimeCommands } from './warmRuntimeCommands';

/**
 * Single construction site for the Commands-tab aggregator: the plugin-lifetime
 * singleton in `onload` and the transient fallback in `openQuickActionsModal`
 * both go through here, so the runtime-warmup wiring can't drift between them.
 */
export function createProviderCommandAggregator(
  plugin: SpecoratorPlugin,
): ProviderCommandAggregator {
  return new ProviderCommandAggregator(() => buildProviderRecords(plugin), {
    logger: plugin.logger,
    warmRuntimeCommands: (record) => warmRuntimeCommands(plugin, record),
  });
}
