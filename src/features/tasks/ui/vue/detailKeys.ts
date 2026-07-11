import type { App, Component } from 'obsidian';
import type { InjectionKey } from 'vue';

import type { TaskSpec } from '../../model/taskTypes';
import type { WorkOrderDetailModalCallbacks } from '../WorkOrderDetailModal';

// Injection seam between the imperative `WorkOrderDetailModal` shell (which keeps
// its constructor + `.open()` and still owns the pinned header) and the Vue
// island it mounts into `contentEl`. The modal `provide()`s these on the app
// instance in `onOpen`; the root + panels `inject()` them. Mirrors the board's
// `boardKeys.ts` — one Symbol per provided value, `markRaw`'d at the call site
// where the value is a large/cyclic Obsidian object.

export const DETAIL_TASK_KEY: InjectionKey<TaskSpec> = Symbol('work-order-detail-task');
export const DETAIL_CALLBACKS_KEY: InjectionKey<WorkOrderDetailModalCallbacks> =
  Symbol('work-order-detail-callbacks');
export const DETAIL_APP_KEY: InjectionKey<App> = Symbol('work-order-detail-app');
// The markdown-lifecycle component the modal loads for the whole open session;
// every `MarkdownRenderer.render` call in the island passes it so rendered
// content is torn down when the modal closes (parity: the imperative markdown
// component).
export const DETAIL_MD_COMPONENT_KEY: InjectionKey<Component> = Symbol('work-order-detail-md-component');
// Close-on-click for the footer's status actions (Open note / Mark ready / …),
// which mirror the imperative footer's close-then-run contract.
export const DETAIL_CLOSE_KEY: InjectionKey<() => void> = Symbol('work-order-detail-close');
