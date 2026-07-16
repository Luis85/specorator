import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { AgentBoardRenderCallbacks } from '../cardActions';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('agent-board-plugin');
export const CALLBACKS_KEY: InjectionKey<AgentBoardRenderCallbacks> = Symbol('agent-board-callbacks');
/** Root-provided card jump (scroll into view + focus + attention flash). The
 *  root owns it because it owns the lanes DOM; the toolbar attention chip
 *  injects it optionally, so a toolbar mounted without a board root no-ops. */
export const FOCUS_CARD_KEY: InjectionKey<(taskId: string) => void> = Symbol('agent-board-focus-card');
