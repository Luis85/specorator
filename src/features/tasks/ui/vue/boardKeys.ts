import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { AgentBoardRenderCallbacks } from '../cardActions';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('agent-board-plugin');
export const CALLBACKS_KEY: InjectionKey<AgentBoardRenderCallbacks> = Symbol('agent-board-callbacks');
