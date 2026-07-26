import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { TeamChatView } from '../../TeamChatView';
import type { TeamChatCallbacks } from './teamChatCallbacks';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('team-chat-plugin');
export const VIEW_KEY: InjectionKey<TeamChatView> = Symbol('team-chat-view');
export const CALLBACKS_KEY: InjectionKey<TeamChatCallbacks> = Symbol('team-chat-callbacks');
/** A callback the root invokes once with the content-host element so the
 *  imperative tab engine can mount per-DM tab DOM into it (mirror of chat's
 *  CONTENT_HOST_KEY / TabContentHost). */
export const CONTENT_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('team-chat-content-host');
