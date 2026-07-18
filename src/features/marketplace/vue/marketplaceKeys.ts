import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../main';
import type { MarketplaceView } from '../MarketplaceView';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');
export const VIEW_KEY: InjectionKey<MarketplaceView> = Symbol('specorator-marketplace-view');
