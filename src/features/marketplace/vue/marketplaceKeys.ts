import type { InjectionKey, Ref } from 'vue';

import type SpecoratorPlugin from '../../../main';
import type { MarketplaceView } from './marketplaceView';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');

/**
 * Per-leaf deep-link target. `MarketplaceView` owns the ref and provides it; the
 * Library "Browse Marketplace" link sets it via `activateMarketplace` → the
 * REVEALED leaf's view, so ONLY that leaf's Root navigates — not every mounted
 * Root sharing one store (which would let the wrong leaf consume the request).
 */
export const REQUESTED_VIEW_KEY: InjectionKey<Ref<MarketplaceView | null>> = Symbol(
  'specorator-marketplace-requested-view',
);
