import type { App } from 'obsidian';
import { Modal } from 'obsidian';
import { markRaw } from 'vue';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import type { WorkOrderTemplate } from '../templates/templateTypes';
import {
  TEMPLATE_EDITOR_CLOSE_KEY,
  TEMPLATE_EDITOR_EXISTING_KEY,
  TEMPLATE_EDITOR_PLUGIN_KEY,
  TEMPLATE_EDITOR_SAVE_KEY,
} from './vue/templateEditorKeys';
import { VueIsland } from './vue/vueIsland';
import WorkOrderTemplateEditorRoot from './vue/WorkOrderTemplateEditorRoot.vue';
import type { WorkOrderTemplateEditorPayload } from './workOrderTemplateEditorForm';

export class WorkOrderTemplateEditorModal extends Modal {
  // The Vue island mounted into `contentEl`. The shell (modalEl classes + native
  // title) stays imperative; the form + save flow are Vue-owned.
  private readonly island = new VueIsland();

  constructor(
    app: App,
    private readonly plugin: SpecoratorPlugin,
    private readonly existing: WorkOrderTemplate | null,
    private readonly onSave: (payload: WorkOrderTemplateEditorPayload) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    const isEdit = Boolean(this.existing);
    this.setTitle(isEdit ? t('tasks.templateEditor.titleEdit') : t('tasks.templateEditor.titleNew'));
    this.modalEl.addClass('specorator-sp-modal', 'specorator-wo-template-editor-modal');

    // The plugin is a large/cyclic Obsidian object, so it (and the existing
    // template) are `markRaw`'d; `onSave` is a plain function.
    this.island.mount(WorkOrderTemplateEditorRoot, this.contentEl, (app) => {
      app.provide(TEMPLATE_EDITOR_PLUGIN_KEY, markRaw(this.plugin));
      app.provide(TEMPLATE_EDITOR_EXISTING_KEY, this.existing ? markRaw(this.existing) : null);
      app.provide(TEMPLATE_EDITOR_SAVE_KEY, this.onSave);
      app.provide(TEMPLATE_EDITOR_CLOSE_KEY, () => this.close());
    });
  }

  onClose(): void {
    // Vue teardown first (runs onBeforeUnmount → LucideIconPicker.destroy()),
    // then clear the content shell.
    this.island.unmount();
    this.contentEl.empty();
  }
}
