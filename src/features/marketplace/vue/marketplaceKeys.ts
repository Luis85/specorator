import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../main';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');
