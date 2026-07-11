import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';

// Injection seam between the `renderAgentBoardLaneEditor` render function (which
// keeps its `(container, plugin): void` signature and mounts the Vue island into
// its Settings host) and `LaneEditorRoot`. The plugin is a large/cyclic Obsidian
// object, so it is `markRaw`'d at the mount site.
export const LANE_EDITOR_PLUGIN_KEY: InjectionKey<SpecoratorPlugin> =
  Symbol('agent-board-lane-editor-plugin');
