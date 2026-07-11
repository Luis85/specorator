import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import type { WorkOrderTemplate } from '../../templates/templateTypes';
import type { WorkOrderTemplateEditorPayload } from '../workOrderTemplateEditorForm';

// Injection seam between the imperative `WorkOrderTemplateEditorModal` shell
// (which keeps its constructor + `.open()` and stays the Obsidian `Modal`) and
// the Vue island it mounts into `contentEl`. Mirrors `detailKeys.ts` — one
// Symbol per provided value; the plugin is `markRaw`'d at the call site.

export const TEMPLATE_EDITOR_PLUGIN_KEY: InjectionKey<SpecoratorPlugin> =
  Symbol('wo-template-editor-plugin');
// `null` in create mode, the source template in edit mode (frozen: name field
// disables + `originalPath` is carried into the save payload).
export const TEMPLATE_EDITOR_EXISTING_KEY: InjectionKey<WorkOrderTemplate | null> =
  Symbol('wo-template-editor-existing');
// The consumer's persistence callback (`TemplateNoteStore.save`); the island
// awaits it before closing, exactly as the imperative `handleSave` did.
export const TEMPLATE_EDITOR_SAVE_KEY: InjectionKey<(payload: WorkOrderTemplateEditorPayload) => Promise<void>> =
  Symbol('wo-template-editor-save');
export const TEMPLATE_EDITOR_CLOSE_KEY: InjectionKey<() => void> =
  Symbol('wo-template-editor-close');
