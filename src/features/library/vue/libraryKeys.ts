import type { InjectionKey, Ref } from 'vue';

import type SpecoratorPlugin from '../../../main';
import type { LibraryView } from '../LibraryView';
import type { LibraryTab } from '../viewType';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator-plugin');
export const VIEW_KEY: InjectionKey<LibraryView> = Symbol('specorator-library-view');
export const ACTIVE_TAB_KEY: InjectionKey<Ref<LibraryTab>> = Symbol('specorator-library-tab');
/**
 * A panel may register a guard that every tab switch must pass (resolve true)
 * first — e.g. the Agents detail editor guarding unsaved edits. Null = no guard.
 */
export const TAB_GUARD_KEY: InjectionKey<Ref<(() => Promise<boolean>) | null>> =
  Symbol('specorator-library-tab-guard');
