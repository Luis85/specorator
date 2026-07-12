import type { App, Component } from 'obsidian';
import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { TranscriptCallbacks } from './transcriptCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.transcript.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.transcript.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.transcript.plugin');
export const CALLBACKS_KEY: InjectionKey<TranscriptCallbacks> = Symbol('specorator.transcript.callbacks');
export const SCROLL_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('specorator.transcript.scrollHost');
