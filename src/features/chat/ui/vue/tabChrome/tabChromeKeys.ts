import type { App, Component } from 'obsidian';
import type { InjectionKey, ShallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { TabChromeCallbacks } from './tabChromeCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.tabChrome.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.tabChrome.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.tabChrome.plugin');
export const CALLBACKS_KEY: InjectionKey<TabChromeCallbacks> = Symbol('specorator.tabChrome.callbacks');
// Phase 4: NavOverlay reads the transcript scroll host (pushed post-transcript-mount
// via MountedTabChrome.setScrollHost) as a reactive ref, and its teleport target.
export const SCROLL_HOST_KEY: InjectionKey<ShallowRef<HTMLElement | null>> = Symbol('specorator.tabChrome.scrollHost');
export const NAV_HOST_KEY: InjectionKey<() => HTMLElement | null> = Symbol('specorator.tabChrome.navHost');
