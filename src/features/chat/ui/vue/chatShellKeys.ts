import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { ChatShellCallbacks } from './chatShellCallbacks';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('chat-shell-plugin');
export const CALLBACKS_KEY: InjectionKey<ChatShellCallbacks> = Symbol('chat-shell-callbacks');
/** A callback the shell invokes once with the content-host element so the
 *  imperative tab layer can mount per-tab DOM into it. */
export const CONTENT_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('chat-shell-content-host');
